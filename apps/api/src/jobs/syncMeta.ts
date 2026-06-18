import { fileURLToPath } from 'node:url';
import {
  computeMetaSnapshots,
  isPostRotation,
  isoWeekLabel,
  type MetaSyncResult,
  type StandingLite,
} from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { metaSnapshots } from '../db/schema.js';

// Server-side meta sync (plan §6.2): fetch Limitless directly (no CORS proxy
// needed server-side), aggregate via the shared engine, upsert meta_snapshots.
// Runnable as a Railway cron: `node dist/jobs/syncMeta.js`.

const LIMITLESS_BASE = 'https://play.limitlesstcg.com';

interface LimitlessTournament {
  id: string;
  name: string;
  players: number;
  date: string;
}

async function limitlessJson<T>(path: string): Promise<T> {
  const res = await fetch(`${LIMITLESS_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Limitless ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function runMetaSync(
  db: Db,
  opts: { days?: number; minPlayers?: number; maxTournaments?: number } = {},
): Promise<MetaSyncResult> {
  const { days = 7, minPlayers = 30, maxTournaments = 6 } = opts;

  const list = await limitlessJson<LimitlessTournament[]>(
    '/api/tournaments?game=PTCG&completed=true&limit=50&format=standard',
  );

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const eligible = list
    .filter((t) => t.players >= minPlayers && new Date(t.date) >= cutoff && isPostRotation(t.date))
    .sort((a, b) => b.players - a.players)
    .slice(0, maxTournaments);

  const tournaments: StandingLite[][] = [];
  for (const t of eligible) {
    try {
      const standings = await limitlessJson<StandingLite[]>(`/api/tournaments/${t.id}/standings`);
      if (Array.isArray(standings) && standings.length > 0) tournaments.push(standings);
    } catch (err) {
      console.warn(`[syncMeta] skipped ${t.id}:`, err);
    }
  }

  const period = isoWeekLabel(new Date());
  const agg = computeMetaSnapshots(tournaments, period, '');
  const sourceNote = `Limitless TCG · ${agg.tournamentCount} tournaments · ${agg.totalPlayers} players`;

  for (const s of agg.snapshots) {
    await db
      .insert(metaSnapshots)
      .values({ ...s, sourceNote })
      .onConflictDoUpdate({
        target: [metaSnapshots.period, metaSnapshots.archetype],
        set: {
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
