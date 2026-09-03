// Precomputes the meta-wide symmetric zero-sum Nash equilibrium, its
// Monte-Carlo robustness and the replicator week-over-week trend (plan
// .claude/plans/meta-game-theory-layer.md §3.6/§3.7, Slice C). Reads the raw
// tournament data the meta sync already persists via loadWindowAggregates/
// loadMatchupData (routes/meta.ts — reused, not duplicated), calls the pure
// statistics engine from @pokekon/shared (Slice A) — this file is I/O and
// orchestration ONLY, no statistics are reimplemented here — and writes the
// result into meta_equilibrium_runs/meta_equilibrium_archetypes, one job run
// at a time.
// Runnable as a Railway cron: `node dist/jobs/computeEquilibrium.js [--dry-run]`.

import { fileURLToPath } from 'node:url';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import {
  buildPayoffMatrix,
  DEFAULT_RESAMPLES,
  DEFAULT_SEED,
  equilibriumRobustness,
  fitnessTrend,
  isoWeekLabel,
  OTHER_ARCHETYPE_ID,
  replicatorStep,
  ROTATION_PERIOD,
  solveSymmetricZeroSumNash,
  type PayoffMatrix,
} from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { metaEquilibriumArchetypes, metaEquilibriumRuns, metaSnapshots } from '../db/schema.js';
import { loadMatchupData, loadWindowAggregates } from '../routes/meta.js';
import { EQUILIBRIUM_WINDOWS } from '../validation.js';

export interface EquilibriumJobResult {
  computedAt: string; // ISO
  windows: number[]; // the windows actually computed
  /** Per window: how the run went — reported, never averaged away. */
  perWindow: {
    windowDays: number;
    archetypeCount: number;
    valuePct: number;
    supportSize: number;
    equalizerCount: number;
    imputedCellSharePct: number;
    exactSupportRatePct: number;
    failedResamples: number;
    durationMs: number;
    /** null when fewer than two completed ISO weeks exist (cold start). */
    currentPeriod: string | null;
    previousPeriod: string | null;
  }[];
  /** Windows skipped because fewer than minArchetypes archetypes were present
   *  (or, more rarely, the LP failed on an otherwise valid window). */
  windowsSkipped: number;
  rowsWritten: number;
  dryRun: boolean;
}

/** Pure job-economy floor (not a model cutoff, see the plan): below three
 *  strategies "the equilibrium" is trivial and the statement is worthless. */
const DEFAULT_MIN_ARCHETYPES = 3;
/** Chunk size for the replace-insert, mirroring computeCardStats.ts — stays
 *  well under Postgres'/PGlite's per-statement parameter cap. */
const INSERT_CHUNK_SIZE = 200;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Builds one archetype's share vector for a given completed ISO week (or
 *  `null` for the whole vector when the period itself doesn't exist). Legacy
 *  meta_snapshots rows synced before archetype_id existed are matched by
 *  display name (routes/meta.ts:524-530 uses the identical fallback). An
 *  archetype present in the matrix but absent from that period's rows gets a
 *  real 0 % share (fitnessTrend's own contract, see nashEquilibrium.ts's
 *  FitnessTrend doc comment) — this is different from "the period doesn't
 *  exist at all", which the caller expresses via `null` instead of calling
 *  this at all. */
function buildPeriodShareVector(
  archetypeIds: string[],
  archetypeNameById: Map<string, string>,
  rows: { period: string; archetypeId: string | null; archetype: string; frequencyPct: number }[],
  period: string,
): number[] {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const row of rows) {
    if (row.period !== period) continue;
    if (row.archetypeId !== null) byId.set(row.archetypeId, row.frequencyPct);
    else byName.set(row.archetype, row.frequencyPct);
  }
  return archetypeIds.map((id) => {
    const byIdShare = byId.get(id);
    if (byIdShare !== undefined) return byIdShare;
    const name = archetypeNameById.get(id);
    return (name !== undefined ? byName.get(name) : undefined) ?? 0;
  });
}

/**
 * Precompute the meta equilibrium, its robustness and the replicator trend
 * for each requested window and replace the corresponding
 * meta_equilibrium_runs/meta_equilibrium_archetypes rows. Verbatim procedure
 * (plan §3.7, binding):
 *   1. Per window: loadWindowAggregates + loadMatchupData (routes/meta.ts,
 *      exported, not duplicated).
 *   2. Archetype set = every window aggregate except 'other' (already
 *      pilot-count-filtered by computeMetaSnapshots — no further filter).
 *   3. buildPayoffMatrix(archetypes, matchup.cells).
 *   4. Fewer than minArchetypes archetypes → windowsSkipped, no row written,
 *      and any stale rows from an earlier run for that window are DELETED —
 *      unlike computeCardStats.ts's own skip path (plan §3.7 step 4), which
 *      knowingly leaves stale rows behind; this job does not repeat that gap.
 *   5. solveSymmetricZeroSumNash(...). status !== 'optimal' is treated the
 *      same as step 4: skipped, logged, stale rows deleted, nothing half
 *      written.
 *   6. equilibriumRobustness(...) with seed/resamples.
 *   7. replicatorStep(matrix, windowShares).
 *   8. The two most recent COMPLETED ISO weeks from meta_snapshots
 *      (period >= ROTATION_PERIOD, period != isoWeekLabel(now), desc, first
 *      two) drive fitnessTrend(...); fewer than one completed week is a cold
 *      start (currentPeriod null) — weekFitnessPct is then left null rather
 *      than back-filled from the day-window shares, since there is no real
 *      "current period" fitness to report (see the plan handoff notes).
 *   9. One computedAt for the whole run; one transaction per window: DELETE +
 *      INSERT the run row + chunked INSERT of the archetype rows (chunk 200,
 *      computeCardStats.ts pattern).
 *   10. dryRun:true runs 1-8, writes nothing, returns identical counters
 *       including a genuine durationMs measurement.
 */
export async function computeEquilibrium(
  db: Db,
  opts?: {
    windows?: number[];
    online?: boolean;
    bo1?: boolean;
    minArchetypes?: number;
    resamples?: number;
    seed?: number;
    dryRun?: boolean;
  },
): Promise<EquilibriumJobResult> {
  const windowsInput = opts?.windows ?? EQUILIBRIUM_WINDOWS;
  const online = opts?.online ?? true;
  const bo1 = opts?.bo1 ?? true;
  const minArchetypes = opts?.minArchetypes ?? DEFAULT_MIN_ARCHETYPES;
  const resamples = opts?.resamples ?? DEFAULT_RESAMPLES;
  const seed = opts?.seed ?? DEFAULT_SEED;
  const dryRun = opts?.dryRun ?? false;

  const computedAt = new Date();
  const currentIsoWeek = isoWeekLabel(computedAt);

  // Step 8's raw input: every completed-period snapshot row, most recent
  // first. Loaded once (global time series, not window-scoped) and reused
  // per window.
  const snapshotRows = await db
    .select({
      period: metaSnapshots.period,
      archetypeId: metaSnapshots.archetypeId,
      archetype: metaSnapshots.archetype,
      frequencyPct: metaSnapshots.frequencyPct,
    })
    .from(metaSnapshots)
    .where(
      and(gte(metaSnapshots.period, ROTATION_PERIOD), ne(metaSnapshots.period, currentIsoWeek)),
    )
    .orderBy(desc(metaSnapshots.period));
  const completedPeriodsDesc = [...new Set(snapshotRows.map((r) => r.period))];
  const currentPeriod: string | null = completedPeriodsDesc[0] ?? null;
  const previousPeriod: string | null = completedPeriodsDesc[1] ?? null;

  const windowsComputed: number[] = [];
  const perWindow: EquilibriumJobResult['perWindow'] = [];
  let windowsSkipped = 0;
  let rowsWritten = 0;

  for (const days of windowsInput) {
    const windowStart = performance.now();
    const window = { days, online, bo1 };

    const [aggregates, matchup] = await Promise.all([
      loadWindowAggregates(db, window),
      loadMatchupData(db, window),
    ]);
    const archetypes = aggregates.archetypes.filter((a) => a.archetypeId !== OTHER_ARCHETYPE_ID);

    if (archetypes.length < minArchetypes) {
      windowsSkipped += 1;
      if (!dryRun) {
        await db.delete(metaEquilibriumRuns).where(eq(metaEquilibriumRuns.windowDays, days));
      }
      continue;
    }

    const matrix: PayoffMatrix = buildPayoffMatrix(
      archetypes.map((a) => ({ archetypeId: a.archetypeId, sharePct: a.sharePct })),
      matchup.cells,
    );
    const equilibrium = solveSymmetricZeroSumNash(matrix);
    if (equilibrium.status !== 'optimal') {
      console.warn(`[computeEquilibrium] window=${days}d: LP did not reach 'optimal', skipping`);
      windowsSkipped += 1;
      if (!dryRun) {
        await db.delete(metaEquilibriumRuns).where(eq(metaEquilibriumRuns.windowDays, days));
      }
      continue;
    }

    const robustness = equilibriumRobustness(matrix, equilibrium, { resamples, seed });
    const windowShares = archetypes.map((a) => a.sharePct);
    const replicator = replicatorStep(matrix, windowShares);

    const archetypeNameById = new Map(archetypes.map((a) => [a.archetypeId, a.archetypeName]));
    // Step 8: current/previous share vectors for the trend. `currentSharePct`
    // is a required (non-nullable) array per fitnessTrend's signature; on a
    // total cold start (currentPeriod null) the day-window shares are passed
    // only to satisfy that signature — the resulting trend.fitnessPct is
    // deliberately NOT persisted into weekFitnessPct in that case (see the
    // doc comment above and the null branch below).
    const currentSharePct = currentPeriod
      ? buildPeriodShareVector(matrix.archetypeIds, archetypeNameById, snapshotRows, currentPeriod)
      : windowShares;
    const previousSharePct: (number | null)[] = previousPeriod
      ? buildPeriodShareVector(matrix.archetypeIds, archetypeNameById, snapshotRows, previousPeriod)
      : matrix.archetypeIds.map(() => null);
    const trend = fitnessTrend(matrix, currentSharePct, previousSharePct);

    const durationMs = Math.round(performance.now() - windowStart);

    windowsComputed.push(days);
    perWindow.push({
      windowDays: days,
      archetypeCount: matrix.archetypeIds.length,
      valuePct: equilibrium.valuePct,
      supportSize: equilibrium.support.length,
      equalizerCount: equilibrium.equalizerCount,
      imputedCellSharePct: matrix.imputedCellSharePct,
      exactSupportRatePct: robustness.exactSupportRatePct,
      failedResamples: robustness.failedResamples,
      durationMs,
      currentPeriod,
      previousPeriod,
    });

    const archRows = matrix.archetypeIds.map((archetypeId, i) => {
      const sharePct = archetypes[i]!.sharePct;
      const weightPct = equilibrium.weightsPct[i]!;
      const rob = robustness.perArchetype.find((r) => r.archetypeId === archetypeId)!;
      const tr = trend.find((t) => t.archetypeId === archetypeId)!;
      return {
        archetypeId,
        archetypeName: archetypes[i]!.archetypeName,
        sharePct,
        weightPct: round2(weightPct),
        equilibriumPayoffPct: round2(equilibrium.payoffsPct[i]!),
        paradoxGapPp: round2(sharePct - weightPct),
        inSupport: equilibrium.support.includes(archetypeId),
        excludedCertain: equilibrium.excludedCertain.includes(archetypeId),
        rowCoveragePct: matrix.rowCoveragePct[i]!,
        exclusionRatePct: round2(rob.exclusionRatePct),
        certainExclusionRatePct: round2(rob.certainExclusionRatePct),
        meanWeightPct: round2(rob.meanWeightPct),
        weightP05Pct: round2(rob.weightP05Pct),
        weightP95Pct: round2(rob.weightP95Pct),
        fitnessPct: round2(replicator.fitnessPct[i]!),
        replicatorGrowthPct: round2(replicator.growthPct[i]!),
        projectedSharePct: round2(replicator.projectedSharePct[i]!),
        weekFitnessPct: currentPeriod === null ? null : round2(tr.fitnessPct),
        previousWeekFitnessPct:
          tr.previousFitnessPct === null ? null : round2(tr.previousFitnessPct),
        fitnessDeltaPp: tr.fitnessDeltaPp === null ? null : round2(tr.fitnessDeltaPp),
        observedShareDeltaPp:
          tr.observedShareDeltaPp === null ? null : round2(tr.observedShareDeltaPp),
        direction: tr.direction,
      };
    });
    rowsWritten += archRows.length;

    if (dryRun) continue;

    await db.transaction(async (tx) => {
      await tx.delete(metaEquilibriumRuns).where(eq(metaEquilibriumRuns.windowDays, days));
      const inserted = await tx
        .insert(metaEquilibriumRuns)
        .values({
          windowDays: days,
          computedAt,
          archetypeCount: matrix.archetypeIds.length,
          valuePct: equilibrium.valuePct,
          supportSize: equilibrium.support.length,
          equalizerCount: equilibrium.equalizerCount,
          imputedCellSharePct: matrix.imputedCellSharePct,
          resamples,
          seed,
          failedResamples: robustness.failedResamples,
          exactSupportRatePct: robustness.exactSupportRatePct,
          currentPeriod,
          previousPeriod,
          durationMs,
        })
        .returning({ id: metaEquilibriumRuns.id });
      const runId = inserted[0]!.id;
      const rowsWithRunId = archRows.map((r) => ({ ...r, runId }));
      for (let i = 0; i < rowsWithRunId.length; i += INSERT_CHUNK_SIZE) {
        await tx
          .insert(metaEquilibriumArchetypes)
          .values(rowsWithRunId.slice(i, i + INSERT_CHUNK_SIZE));
      }
    });
  }

  return {
    computedAt: computedAt.toISOString(),
    windows: windowsComputed,
    perWindow,
    windowsSkipped,
    rowsWritten,
    dryRun,
  };
}

// CLI entry point: `node dist/jobs/computeEquilibrium.js [--dry-run]`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  computeEquilibrium(getDb(), { dryRun })
    .then((r) => console.log('[computeEquilibrium] done:', r))
    .catch((err) => {
      console.error('[computeEquilibrium] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
