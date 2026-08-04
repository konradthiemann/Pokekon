import { fileURLToPath } from 'node:url';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  classifyTournamentDetails,
  computeMatchupsFromPairings,
  computeMetaSnapshots,
  computeStandingMatchResults,
  isLikelyOnlineName,
  isoWeekBounds,
  isoWeekLabel,
  isPostRotation,
  normalizeArchetypeId,
  pruneDecklist,
  pruneIcons,
  type MetaSyncResult,
  type PairingLite,
  type StandingLite,
  type TournamentClassification,
} from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import {
  metaSnapshots,
  tournamentMatchups,
  tournamentStandings,
  tournaments,
} from '../db/schema.js';

// Server-side meta sync (plan §6.2): fetch Limitless directly (no CORS proxy
// needed server-side), persist the raw tournaments/standings (plan §5.2) AND the
// own matchup matrix from the round pairings, then recompute meta_snapshots.
// Runnable as a Railway cron: `node dist/jobs/syncMeta.js`.
//
// Delta import ("only load the missing data"): a completed tournament is
// immutable, so once its /details verdict is stored it is never probed again —
// and that is stored for QUALIFYING and NON-qualifying events alike. Remembering
// the rejects is what lets coverage grow: each bounded run advances its probe
// budget to older, still-unclassified events rather than re-classifying the same
// recent rejects, so the ingested window widens run over run (it was previously
// pinned to ~one week). Because a run does not re-fetch every event in the window,
// the weekly snapshots are recomputed from the DB, not from the current run's
// (partial) fetch.

const LIMITLESS_BASE = 'https://play.limitlesstcg.com';

interface LimitlessTournament {
  id: string;
  name: string;
  players: number;
  date: string;
  format?: string;
}

/** The standing fields this sync consumes; Limitless sends more, we ignore it.
 *  `player` is the USERNAME (join key to the pairings endpoint); it is used only
 *  in memory to resolve matchups and never persisted. `name` is the display name. */
interface LimitlessStanding extends StandingLite {
  player?: string; // username, e.g. "jwbtcg" — matches pairings player1/player2/winner
  name?: string; // display name, e.g. "Jakob Brown"
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

/** Idempotent per-tournament persist: upsert the header, replace the standings,
 *  and — when pairings were fetched — replace the own-matchup rows. Runs in ONE
 *  transaction so a crash mid-replace can never leave a tournament with empty or
 *  partial data. All Limitless-supplied strings are length-capped and deck ids
 *  slug-normalised, so a hostile response cannot bloat the database.
 *
 *  `pairings === null` means the pairings fetch FAILED: standings still persist
 *  but `pairingsSyncedAt` stays null so the delta logic retries the event next
 *  run. `pairings === []` (or any array) means processed — the stamp is set even
 *  if no usable head-to-heads remained (all mirrors / unidentified decks). */
async function persistTournament(
  db: Db,
  t: LimitlessTournament,
  standings: LimitlessStanding[],
  classification: TournamentClassification,
  pairings: PairingLite[] | null,
): Promise<void> {
  const id = t.id.slice(0, 100);
  const name = t.name.slice(0, 200);
  const pairingsProcessed = pairings !== null;
  const header = {
    name,
    date: new Date(t.date),
    players: t.players,
    format: (t.format ?? 'standard').slice(0, 40),
    isOnline: classification.isOnline,
    platform: classification.platform,
    swissMode: classification.swissMode,
    fetchedAt: new Date(),
    pairingsSyncedAt: pairingsProcessed ? new Date() : null,
  };
  // Resolve pairings in memory (usernames are never persisted, only used here):
  // the username → archetype map, plus — when pairings were fetched — each pilot's
  // game-by-game results, attached to their standing row for the drill-down.
  const usernameToArchetype = new Map<string, string>();
  for (const p of standings) {
    if (typeof p.player === 'string' && p.player !== '') {
      usernameToArchetype.set(p.player, normalizeArchetypeId(p.deck?.id));
    }
  }
  const matchResultsByUser =
    pairings !== null ? computeStandingMatchResults(usernameToArchetype, pairings) : null;

  const rows = standings.slice(0, MAX_STANDINGS_PER_TOURNAMENT).map((p) => {
    const icons = pruneIcons(p.deck?.icons);
    const matchResults =
      matchResultsByUser !== null && typeof p.player === 'string'
        ? (matchResultsByUser.get(p.player) ?? [])
        : null;
    return {
      tournamentId: id,
      archetypeId: normalizeArchetypeId(p.deck?.id),
      archetypeName: (p.deck?.name ?? 'Other').slice(0, 100),
      playerName: typeof p.name === 'string' && p.name !== '' ? p.name.slice(0, 100) : null,
      placing: typeof p.placing === 'number' && Number.isFinite(p.placing) ? p.placing : null,
      wins: p.record?.wins ?? 0,
      losses: p.record?.losses ?? 0,
      ties: p.record?.ties ?? 0,
      decklist: pruneDecklist(p.decklist),
      icons: icons.length > 0 ? icons : null,
      matchResults,
    };
  });

  const matchupRows =
    pairings !== null
      ? computeMatchupsFromPairings(usernameToArchetype, pairings).map((m) => ({
          tournamentId: id,
          ...m,
        }))
      : [];

  await db.transaction(async (tx) => {
    await tx
      .insert(tournaments)
      .values({ id, ...header })
      .onConflictDoUpdate({ target: tournaments.id, set: header });

    await tx.delete(tournamentStandings).where(eq(tournamentStandings.tournamentId, id));
    // PGlite and Postgres both cap the parameter count per statement — chunk the
    // inserts so large tournaments (500+ standings × 10 columns) stay well below it.
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(tournamentStandings).values(rows.slice(i, i + 200));
    }

    if (pairingsProcessed) {
      await tx.delete(tournamentMatchups).where(eq(tournamentMatchups.tournamentId, id));
      for (let i = 0; i < matchupRows.length; i += 200) {
        await tx.insert(tournamentMatchups).values(matchupRows.slice(i, i + 200));
      }
    }
  });
}

/**
 * Recompute the CURRENT ISO week's meta_snapshots from the persisted standings
 * (not from the current run's fetch): the delta import deliberately skips events
 * already in the DB, so only a DB read sees the full week. Full-replace of the
 * period's rows so archetypes that dropped out of the week don't linger as stale
 * snapshots. Icons are surfaced from whichever pilot carried them.
 */
async function recomputeCurrentPeriodSnapshots(
  db: Db,
  opts: { onlineOnly: boolean; bo1Only: boolean },
): Promise<{ period: string; archetypes: number; tournaments: number; totalPlayers: number }> {
  const now = new Date();
  const period = isoWeekLabel(now);
  const { start, end } = isoWeekBounds(now);

  const conds = [gte(tournaments.date, start), lt(tournaments.date, end)];
  if (opts.onlineOnly) conds.push(eq(tournaments.isOnline, true));
  if (opts.bo1Only) conds.push(eq(tournaments.swissMode, 'BO1'));

  const rows = await db
    .select({
      tournamentId: tournamentStandings.tournamentId,
      archetypeId: tournamentStandings.archetypeId,
      archetypeName: tournamentStandings.archetypeName,
      icons: tournamentStandings.icons,
      wins: tournamentStandings.wins,
      losses: tournamentStandings.losses,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(and(...conds));

  // Group by tournament so computeMetaSnapshots' tournamentCount is right.
  const byTournament = new Map<string, StandingLite[]>();
  for (const r of rows) {
    const list = byTournament.get(r.tournamentId) ?? [];
    list.push({
      deck: r.icons
        ? { id: r.archetypeId, name: r.archetypeName, icons: r.icons }
        : { id: r.archetypeId, name: r.archetypeName },
      record: { wins: r.wins, losses: r.losses },
    });
    byTournament.set(r.tournamentId, list);
  }

  const agg = computeMetaSnapshots([...byTournament.values()], period, '');
  const scope =
    opts.onlineOnly && opts.bo1Only ? 'online Bo1' : opts.onlineOnly ? 'online' : 'all events';
  const sourceNote = `Limitless TCG · ${scope} · ${agg.tournamentCount} tournaments · ${agg.totalPlayers} players`;

  await db.transaction(async (tx) => {
    await tx.delete(metaSnapshots).where(eq(metaSnapshots.period, period));
    for (const s of agg.snapshots) {
      // Per-row upsert (not a batch insert): a rare display-name collision between
      // two distinct deck ids updates rather than violating the (period, archetype)
      // unique index.
      await tx
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
            icons: s.icons,
            sourceNote,
          },
        });
    }
  });

  return {
    period,
    archetypes: agg.snapshots.length,
    tournaments: agg.tournamentCount,
    totalPlayers: agg.totalPlayers,
  };
}

/**
 * Fetch standings + pairings for a QUALIFYING event and persist it. Returns true
 * when standings were stored (the event now counts toward the meta), false when
 * the event had no usable standings or the standings fetch failed. A failed
 * PAIRINGS fetch is not fatal: standings still persist and `pairingsSyncedAt`
 * stays null, so the matchup matrix is retried on a later run.
 */
async function ingestTournament(
  db: Db,
  t: LimitlessTournament,
  classification: TournamentClassification,
): Promise<boolean> {
  const id = t.id.slice(0, 100);
  let standings: LimitlessStanding[];
  try {
    standings = await limitlessJson<LimitlessStanding[]>(
      `/api/tournaments/${encodeURIComponent(id)}/standings`,
    );
  } catch (err) {
    console.warn(`[syncMeta] standings fetch failed for ${t.id}:`, err);
    return false;
  }
  if (!Array.isArray(standings) || standings.length === 0) return false;

  let pairings: PairingLite[] | null;
  try {
    const raw = await limitlessJson<unknown>(`/api/tournaments/${encodeURIComponent(id)}/pairings`);
    pairings = Array.isArray(raw) ? (raw as PairingLite[]) : [];
  } catch (err) {
    console.warn(`[syncMeta] pairings fetch failed for ${t.id}:`, err);
    pairings = null;
  }

  try {
    await persistTournament(db, t, standings, classification, pairings);
    return true;
  } catch (err) {
    console.warn(`[syncMeta] persist failed for ${t.id}:`, err);
    return false;
  }
}

/**
 * Persist ONLY a probed event's header + `/details` classification — no
 * standings, no pairings. This is the delta import's forward gear: a NON-
 * qualifying event (in-person, or a Bo3-Swiss online event) is recorded so later
 * runs skip it instead of re-probing `/details` for it every single time. Without
 * this, a run's probe budget is spent re-classifying the same rejects at the top
 * of the list and never reaches the older qualifying events further back — which
 * is exactly why the ingested set was stuck at one week's worth of tournaments.
 */
async function persistClassificationOnly(
  db: Db,
  t: LimitlessTournament,
  classification: TournamentClassification,
): Promise<void> {
  const id = t.id.slice(0, 100);
  const header = {
    name: t.name.slice(0, 200),
    date: new Date(t.date),
    players: t.players,
    format: (t.format ?? 'standard').slice(0, 40),
    isOnline: classification.isOnline,
    platform: classification.platform,
    swissMode: classification.swissMode,
    fetchedAt: new Date(),
    pairingsSyncedAt: null,
  };
  await db
    .insert(tournaments)
    .values({ id, ...header })
    .onConflictDoUpdate({ target: tournaments.id, set: header });
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
  // Defaults target the local-Bo1 use case: recent ONLINE Bo1-Swiss events over a
  // ~6-week window. The per-run caps are deliberately BOUNDED, not exhaustive: the
  // classification-persistence delta (see the loop) means every run advances the
  // frontier to older, still-unclassified events, so coverage GROWS across runs
  // instead of being pinned to whatever a single run could fetch. `LIST_LIMIT` is
  // wide enough that ~6 weeks of Standard events are in reach; a value the API
  // caps below simply yields fewer rows (never an error).
  const {
    days = 45,
    minPlayers = 16,
    maxTournaments = 50,
    maxProbes = 120,
    onlineOnly = true,
    bo1Only = true,
  } = opts;
  const LIST_LIMIT = 500;

  const list = await limitlessJson<LimitlessTournament[]>(
    `/api/tournaments?game=PTCG&completed=true&limit=${LIST_LIMIT}&format=standard`,
  );

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  // In-season events above the size floor, most recent first.
  const candidates = list
    .filter((t) => t.players >= minPlayers && new Date(t.date) >= cutoff && isPostRotation(t.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Delta import: load the STORED /details verdict for every candidate already in
  // the DB — whether or not it qualified. A completed tournament never changes, so
  // a stored verdict is never re-probed. This is what makes coverage grow across
  // runs: rejects are remembered (see persistClassificationOnly), so each run's
  // probe budget skips past them to older, still-unclassified events instead of
  // burning out on the same recent rejects every time.
  const candidateIds = candidates.map((t) => t.id.slice(0, 100));
  const existingRows = candidateIds.length
    ? await db
        .select({
          id: tournaments.id,
          isOnline: tournaments.isOnline,
          platform: tournaments.platform,
          swissMode: tournaments.swissMode,
          pairingsSyncedAt: tournaments.pairingsSyncedAt,
        })
        .from(tournaments)
        .where(inArray(tournaments.id, candidateIds))
    : [];
  const existing = new Map(existingRows.map((r) => [r.id, r]));

  const qualifies = (c: TournamentClassification): boolean =>
    (!onlineOnly || c.isOnline) && (!bo1Only || c.swissMode === 'BO1');

  // The list endpoint lacks isOnline/phases, so classify each NEW candidate via
  // its /details payload and keep the online Bo1-Swiss ones. Requests are
  // sequential with no inter-request delay; a failed probe/standings/pairings
  // fetch falls through to the catch (fewer events, never a crash).
  let probes = 0;
  let ingested = 0;
  for (const t of candidates) {
    if (ingested >= maxTournaments || probes >= maxProbes) break;
    const id = t.id.slice(0, 100);
    const rec = existing.get(id);

    if (rec) {
      // Already classified on an earlier run — never re-probe. The one thing left
      // to do is finish a QUALIFYING event whose standings/pairings never landed
      // (a prior fetch failure): retry the ingest from its stored verdict.
      const stored: TournamentClassification = {
        isOnline: rec.isOnline,
        platform: rec.platform,
        swissMode: rec.swissMode,
      };
      if (qualifies(stored) && rec.pairingsSyncedAt === null) {
        if (await ingestTournament(db, t, stored)) ingested += 1;
      }
      continue;
    }

    // NEW candidate: spend one probe on /details, then record the verdict either
    // way so a later run never probes it again.
    probes += 1;
    let classification: TournamentClassification;
    try {
      const details = await limitlessJson<unknown>(
        `/api/tournaments/${encodeURIComponent(id)}/details`,
      );
      classification = classifyTournamentDetails(details);
    } catch (err) {
      console.warn(`[syncMeta] details fetch failed for ${t.id}:`, err);
      classification = { isOnline: isLikelyOnlineName(t.name), platform: null, swissMode: null };
    }

    if (!qualifies(classification)) {
      // Remember the reject so it is skipped (not re-probed) next run.
      await persistClassificationOnly(db, t, classification);
      continue;
    }

    if (await ingestTournament(db, t, classification)) ingested += 1;
  }

  // Recompute the week's snapshots from the full DB set (see the function doc).
  const summary = await recomputeCurrentPeriodSnapshots(db, { onlineOnly, bo1Only });

  return {
    archetypes: summary.archetypes,
    tournaments: summary.tournaments,
    totalPlayers: summary.totalPlayers,
    period: summary.period,
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
