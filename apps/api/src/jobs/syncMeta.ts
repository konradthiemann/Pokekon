import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import {
  classifyTournamentDetails,
  computeMetaSnapshots,
  isLikelyOnlineName,
  isPostRotation,
  isoWeekLabel,
  normalizeArchetypeId,
  pruneDecklist,
  type MetaSyncResult,
  type StandingLite,
  type TournamentClassification,
} from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { metaSnapshots, tournamentStandings, tournaments } from '../db/schema.js';

// Server-side meta sync (plan §6.2): fetch Limitless directly (no CORS proxy
// needed server-side), persist the raw tournaments/standings (plan §5.2), then
// aggregate via the shared engine and upsert meta_snapshots.
// Runnable as a Railway cron: `node dist/jobs/syncMeta.js`.

const LIMITLESS_BASE = 'https://play.limitlesstcg.com';

interface LimitlessTournament {
  id: string;
  name: string;
  players: number;
  date: string;
  format?: string;
}

/** The standing fields this sync consumes; Limitless sends more, we ignore it. */
interface LimitlessStanding extends StandingLite {
  name?: string; // player name
  placing?: number | null;
  decklist?: unknown; // pruned to TournamentDecklist before persisting
}

async function limitlessJson<T>(path: string): Promise<T> {
  const res = await fetch(`${LIMITLESS_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Limitless ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Upper bound on standings rows persisted per tournament — real events top out
 *  around 3–4k players; anything beyond is a malformed or hostile response. */
const MAX_STANDINGS_PER_TOURNAMENT = 4000;

/** Idempotent per-tournament persist: upsert the header, replace the standings.
 *  Runs in ONE transaction so a crash mid-replace can never leave a tournament
 *  with empty or partial standings — either the old rows survive or the new
 *  set lands completely. All Limitless-supplied strings are length-capped and
 *  the deck id is slug-normalised, so a hostile response cannot bloat the
 *  database or produce ids the drilldown routes would reject. */
async function persistTournament(
  db: Db,
  t: LimitlessTournament,
  standings: LimitlessStanding[],
  classification: TournamentClassification,
): Promise<void> {
  const id = t.id.slice(0, 100);
  const name = t.name.slice(0, 200);
  const header = {
    name,
    date: new Date(t.date),
    players: t.players,
    format: (t.format ?? 'standard').slice(0, 40),
    isOnline: classification.isOnline,
    platform: classification.platform,
    swissMode: classification.swissMode,
    fetchedAt: new Date(),
  };
  const rows = standings.slice(0, MAX_STANDINGS_PER_TOURNAMENT).map((p) => ({
    tournamentId: id,
    archetypeId: normalizeArchetypeId(p.deck?.id),
    archetypeName: (p.deck?.name ?? 'Other').slice(0, 100),
    playerName: typeof p.name === 'string' && p.name !== '' ? p.name.slice(0, 100) : null,
    placing: typeof p.placing === 'number' && Number.isFinite(p.placing) ? p.placing : null,
    wins: p.record?.wins ?? 0,
    losses: p.record?.losses ?? 0,
    ties: p.record?.ties ?? 0,
    decklist: pruneDecklist(p.decklist),
  }));

  await db.transaction(async (tx) => {
    await tx
      .insert(tournaments)
      .values({ id, ...header })
      .onConflictDoUpdate({ target: tournaments.id, set: header });

    await tx.delete(tournamentStandings).where(eq(tournamentStandings.tournamentId, id));
    // PGlite and Postgres both cap the parameter count per statement — chunk the
    // inserts so large tournaments (500+ standings × 9 columns) stay well below it.
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(tournamentStandings).values(rows.slice(i, i + 200));
    }
  });
}

export async function runMetaSync(
  db: Db,
  opts: {
    days?: number;
    minPlayers?: number;
    maxTournaments?: number;
    maxProbes?: number;
    onlineOnly?: boolean;
    bo1Only?: boolean;
  } = {},
): Promise<MetaSyncResult> {
  // Defaults target the local-Bo1 use case: recent ONLINE Bo1-Swiss events, a
  // wider window and higher cap than the old "6 biggest events" (which skewed
  // toward large in-person Bo3 majors). Persist is idempotent, so repeated syncs
  // accumulate history for the day-window reads.
  const {
    days = 30,
    minPlayers = 16,
    maxTournaments = 20,
    maxProbes = 40,
    onlineOnly = true,
    bo1Only = true,
  } = opts;

  const list = await limitlessJson<LimitlessTournament[]>(
    '/api/tournaments?game=PTCG&completed=true&limit=100&format=standard',
  );

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  // In-season events above the size floor, most recent first (the online
  // platform posts Bo1 events frequently and we want the current meta).
  const candidates = list
    .filter((t) => t.players >= minPlayers && new Date(t.date) >= cutoff && isPostRotation(t.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // The list endpoint lacks isOnline/phases, so classify each candidate via its
  // /details payload and keep the online Bo1-Swiss ones. `maxProbes` bounds the
  // extra requests; `maxTournaments` bounds how many events we ingest.
  // NOTE: requests are sequential with no inter-request delay. If Limitless ever
  // rate-limits by IP, a failed probe/standings fetch just falls through to the
  // catch (fewer events, never a crash) — add a delay / Retry-After handling if
  // that becomes an issue in practice.
  const selected: { t: LimitlessTournament; classification: TournamentClassification }[] = [];
  let probes = 0;
  for (const t of candidates) {
    if (selected.length >= maxTournaments || probes >= maxProbes) break;
    probes += 1;
    let classification: TournamentClassification;
    try {
      const details = await limitlessJson<unknown>(`/api/tournaments/${t.id}/details`);
      classification = classifyTournamentDetails(details);
    } catch (err) {
      // /details unavailable → fall back to the lossy name heuristic and leave
      // the Swiss mode unknown, so the conservative bo1Only filter drops it.
      console.warn(`[syncMeta] details fetch failed for ${t.id}:`, err);
      classification = { isOnline: isLikelyOnlineName(t.name), platform: null, swissMode: null };
    }
    if (onlineOnly && !classification.isOnline) continue;
    if (bo1Only && classification.swissMode !== 'BO1') continue;
    selected.push({ t, classification });
  }

  const perTournament: StandingLite[][] = [];
  for (const { t, classification } of selected) {
    try {
      const standings = await limitlessJson<LimitlessStanding[]>(
        `/api/tournaments/${t.id}/standings`,
      );
      if (!Array.isArray(standings) || standings.length === 0) continue;
      await persistTournament(db, t, standings, classification);
      perTournament.push(standings);
    } catch (err) {
      console.warn(`[syncMeta] skipped ${t.id}:`, err);
    }
  }

  const period = isoWeekLabel(new Date());
  const agg = computeMetaSnapshots(perTournament, period, '');
  const scope = onlineOnly && bo1Only ? 'online Bo1' : onlineOnly ? 'online' : 'all events';
  const sourceNote = `Limitless TCG · ${scope} · ${agg.tournamentCount} tournaments · ${agg.totalPlayers} players`;

  for (const s of agg.snapshots) {
    await db
      .insert(metaSnapshots)
      .values({ ...s, sourceNote })
      .onConflictDoUpdate({
        target: [metaSnapshots.period, metaSnapshots.archetype],
        set: {
          archetypeId: s.archetypeId,
          frequencyPct: s.frequencyPct,
          winRatePct: s.winRatePct,
          wins: s.wins,
          losses: s.losses,
          playerCount: s.playerCount,
          sourceNote,
        },
      });
  }

  return {
    archetypes: agg.snapshots.length,
    tournaments: agg.tournamentCount,
    totalPlayers: agg.totalPlayers,
    period,
  };
}

// Cron entry point: `node dist/jobs/syncMeta.js`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMetaSync(getDb())
    .then((r) => console.log('[syncMeta] done:', r))
    .catch((err) => {
      console.error('[syncMeta] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
