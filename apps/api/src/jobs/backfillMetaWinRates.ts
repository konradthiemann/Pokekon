// One-off backfill: recomputes historical meta_snapshots.win_rate_pct/ties from
// the raw tournament_standings + tournaments data so the tie-aware formula
// applies retroactively (plan §3.8). Runnable as a one-shot Railway job:
// `node dist/jobs/backfillMetaWinRates.js [--dry-run]`.

import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { computeMetaSnapshots, isoWeekLabel, type StandingLite } from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { metaSnapshots, tournamentStandings, tournaments } from '../db/schema.js';

export interface BackfillMetaWinRatesResult {
  /** Periods for which raw data (tournaments + standings) was found. */
  periodsRecomputed: number;
  rowsUpdated: number;
  /** Value was already correct. */
  rowsUnchanged: number;
  /** No raw data for the period -> left untouched. */
  rowsWithoutRawData: number;
  /** Raw data exists, but wins/losses differ from the stored row (different
   *  sync scope) -> deliberately NOT overwritten, only logged. */
  rowsSkippedMismatch: number;
  dryRun: boolean;
}

/**
 * Recompute win_rate_pct/ties for every existing meta_snapshots row from the
 * raw tournament_standings history, using the same online/Bo1 scope as the
 * regular sync (default true/true). Never inserts or deletes rows; a row is
 * only updated (win_rate_pct, ties) when its stored wins/losses still exactly
 * match the freshly recomputed raw totals for that period — a mismatch means
 * the row was originally synced under a different scope and is left alone.
 */
export async function backfillMetaWinRates(
  db: Db,
  opts?: { dryRun?: boolean; onlineOnly?: boolean; bo1Only?: boolean },
): Promise<BackfillMetaWinRatesResult> {
  const dryRun = opts?.dryRun ?? false;
  const onlineOnly = opts?.onlineOnly ?? true;
  const bo1Only = opts?.bo1Only ?? true;

  const conds = [];
  if (onlineOnly) conds.push(eq(tournaments.isOnline, true));
  if (bo1Only) conds.push(eq(tournaments.swissMode, 'BO1'));

  const rawRows = await db
    .select({
      tournamentId: tournamentStandings.tournamentId,
      archetypeId: tournamentStandings.archetypeId,
      archetypeName: tournamentStandings.archetypeName,
      icons: tournamentStandings.icons,
      wins: tournamentStandings.wins,
      losses: tournamentStandings.losses,
      ties: tournamentStandings.ties,
      date: tournaments.date,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(and(...conds));

  // Group into period -> tournamentId -> StandingLite[], the shape
  // computeMetaSnapshots expects, exactly like the regular sync's recompute.
  const byPeriod = new Map<string, Map<string, StandingLite[]>>();
  for (const r of rawRows) {
    const period = isoWeekLabel(r.date);
    const byTournament = byPeriod.get(period) ?? new Map<string, StandingLite[]>();
    const list = byTournament.get(r.tournamentId) ?? [];
    list.push({
      deck: r.icons
        ? { id: r.archetypeId, name: r.archetypeName, icons: r.icons }
        : { id: r.archetypeId, name: r.archetypeName },
      record: { wins: r.wins, losses: r.losses, ties: r.ties },
    });
    byTournament.set(r.tournamentId, list);
    byPeriod.set(period, byTournament);
  }

  // Recompute once per period, keyed by archetype display name — the same key
  // meta_snapshots' (period, archetype) unique index uses.
  const recomputedByPeriod = new Map<
    string,
    Map<string, { wins: number; losses: number; ties: number; winRatePct: number | null }>
  >();
  for (const [period, byTournament] of byPeriod) {
    const agg = computeMetaSnapshots([...byTournament.values()], period, '');
    recomputedByPeriod.set(period, new Map(agg.snapshots.map((s) => [s.archetype, s])));
  }

  const existingSnapshots = await db.select().from(metaSnapshots);

  let rowsUpdated = 0;
  let rowsUnchanged = 0;
  let rowsWithoutRawData = 0;
  let rowsSkippedMismatch = 0;

  for (const row of existingSnapshots) {
    const recomputed = recomputedByPeriod.get(row.period)?.get(row.archetype);
    if (!recomputed) {
      rowsWithoutRawData += 1;
      continue;
    }
    if (recomputed.wins !== row.wins || recomputed.losses !== row.losses) {
      rowsSkippedMismatch += 1;
      console.warn(
        `[backfillMetaWinRates] scope mismatch for ${row.period}/${row.archetype}: ` +
          `raw ${recomputed.wins}W/${recomputed.losses}L vs stored ${row.wins}W/${row.losses}L — skipped`,
      );
      continue;
    }
    if (recomputed.winRatePct === row.winRatePct && recomputed.ties === row.ties) {
      rowsUnchanged += 1;
      continue;
    }
    rowsUpdated += 1;
    if (!dryRun) {
      await db
        .update(metaSnapshots)
        .set({ winRatePct: recomputed.winRatePct, ties: recomputed.ties })
        .where(eq(metaSnapshots.id, row.id));
    }
  }

  return {
    periodsRecomputed: recomputedByPeriod.size,
    rowsUpdated,
    rowsUnchanged,
    rowsWithoutRawData,
    rowsSkippedMismatch,
    dryRun,
  };
}

// CLI entry point: `node dist/jobs/backfillMetaWinRates.js [--dry-run]`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  backfillMetaWinRates(getDb(), { dryRun })
    .then((r) => console.log('[backfillMetaWinRates] done:', r))
    .catch((err) => {
      console.error('[backfillMetaWinRates] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
