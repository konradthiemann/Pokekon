import { desc, eq } from 'drizzle-orm';
import type { FitnessDirection } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { metaEquilibriumArchetypes, metaEquilibriumRuns } from '../db/schema.js';

export interface EquilibriumArchetypeRow {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  weightPct: number;
  equilibriumPayoffPct: number;
  paradoxGapPp: number;
  inSupport: boolean;
  excludedCertain: boolean;
  rowCoveragePct: number;
  exclusionRatePct: number;
  certainExclusionRatePct: number;
  meanWeightPct: number;
  weightP05Pct: number;
  weightP95Pct: number;
  fitnessPct: number;
  replicatorGrowthPct: number;
  projectedSharePct: number;
  weekFitnessPct: number | null;
  previousWeekFitnessPct: number | null;
  fitnessDeltaPp: number | null;
  observedShareDeltaPp: number | null;
  direction: FitnessDirection;
}

export interface EquilibriumBatch {
  computedAt: Date | null;
  windowDays: number;
  run: {
    archetypeCount: number;
    valuePct: number;
    supportSize: number;
    equalizerCount: number;
    imputedCellSharePct: number;
    resamples: number;
    seed: number;
    failedResamples: number;
    exactSupportRatePct: number;
    currentPeriod: string | null;
    previousPeriod: string | null;
  } | null;
  archetypes: EquilibriumArchetypeRow[];
}

/** Reads the precomputed run for one window. NO lazy seed (same reasoning as
 *  lib/cardStatsData.ts:13-17): computing an equilibrium plus 2000 resamples
 *  on a read would turn one request into a multi-second job. An empty table
 *  is an honestly empty result with computedAt === null, never an error. */
export async function loadEquilibrium(db: Db, windowDays: number): Promise<EquilibriumBatch> {
  const runRows = await db
    .select()
    .from(metaEquilibriumRuns)
    .where(eq(metaEquilibriumRuns.windowDays, windowDays))
    .orderBy(desc(metaEquilibriumRuns.computedAt))
    .limit(1);
  const run = runRows[0];

  if (run === undefined) {
    return { computedAt: null, windowDays, run: null, archetypes: [] };
  }

  const archRows = await db
    .select()
    .from(metaEquilibriumArchetypes)
    .where(eq(metaEquilibriumArchetypes.runId, run.id))
    // weightPct desc, then sharePct desc (plan §3.7 wire contract).
    .orderBy(desc(metaEquilibriumArchetypes.weightPct), desc(metaEquilibriumArchetypes.sharePct));

  return {
    computedAt: run.computedAt,
    windowDays,
    run: {
      archetypeCount: run.archetypeCount,
      valuePct: run.valuePct,
      supportSize: run.supportSize,
      equalizerCount: run.equalizerCount,
      imputedCellSharePct: run.imputedCellSharePct,
      resamples: run.resamples,
      seed: run.seed,
      failedResamples: run.failedResamples,
      exactSupportRatePct: run.exactSupportRatePct,
      currentPeriod: run.currentPeriod,
      previousPeriod: run.previousPeriod,
    },
    archetypes: archRows.map((r) => ({
      archetypeId: r.archetypeId,
      archetypeName: r.archetypeName,
      sharePct: r.sharePct,
      weightPct: r.weightPct,
      equilibriumPayoffPct: r.equilibriumPayoffPct,
      paradoxGapPp: r.paradoxGapPp,
      inSupport: r.inSupport,
      excludedCertain: r.excludedCertain,
      rowCoveragePct: r.rowCoveragePct,
      exclusionRatePct: r.exclusionRatePct,
      certainExclusionRatePct: r.certainExclusionRatePct,
      meanWeightPct: r.meanWeightPct,
      weightP05Pct: r.weightP05Pct,
      weightP95Pct: r.weightP95Pct,
      fitnessPct: r.fitnessPct,
      replicatorGrowthPct: r.replicatorGrowthPct,
      projectedSharePct: r.projectedSharePct,
      weekFitnessPct: r.weekFitnessPct,
      previousWeekFitnessPct: r.previousWeekFitnessPct,
      fitnessDeltaPp: r.fitnessDeltaPp,
      observedShareDeltaPp: r.observedShareDeltaPp,
      direction: r.direction,
    })),
  };
}
