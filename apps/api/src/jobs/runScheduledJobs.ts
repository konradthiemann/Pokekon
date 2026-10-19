// The one scheduled entry point for the meta pipeline in production: a
// separate Railway cron service (`railway.jobs.json`, daily) runs
// `node dist/jobs/runScheduledJobs.js`. The three jobs stay independent
// modules (and stay runnable on their own); this file only fixes their order
// and cadence, as the plans intended (recommendation-to-prognosis.md §5
// step 4, meta-game-theory-layer.md §5 step 4):
//   1. syncMeta           — daily, fetches Limitless into tournaments/standings
//   2. computeCardStats   — daily, after the sync (reads what it wrote)
//   3. computeEquilibrium — Mondays (the previous ISO week is complete), or
//      on any day while no run exists yet, so a fresh database does not wait
//      up to a week for its first result.
// A failed step never blocks the later ones: stats recomputed from the data
// already stored beat no stats. Any failure fails the run (exit code 1), so
// Railway shows the cron run as failed.

import { fileURLToPath } from 'node:url';
import { closeDb, getDb, type Db } from '../db/index.js';
import { metaEquilibriumRuns } from '../db/schema.js';
import { computeCardStats } from './computeCardStats.js';
import { computeEquilibrium } from './computeEquilibrium.js';
import { runMetaSync } from './syncMeta.js';

export type ScheduledStepName = 'syncMeta' | 'computeCardStats' | 'computeEquilibrium';

export interface ScheduledStepOutcome {
  name: ScheduledStepName;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  result?: unknown;
  error?: string;
}

export interface ScheduledJobsResult {
  startedAt: string; // ISO
  ok: boolean;
  steps: ScheduledStepOutcome[];
}

export interface ScheduledJobSteps {
  syncMeta: (db: Db) => Promise<unknown>;
  computeCardStats: (db: Db) => Promise<unknown>;
  computeEquilibrium: (db: Db) => Promise<unknown>;
  /** Whether any equilibrium run is stored yet (cold start → false). */
  hasEquilibriumRun: (db: Db) => Promise<boolean>;
}

const MONDAY = 1; // Date#getUTCDay

export async function hasEquilibriumRun(db: Db): Promise<boolean> {
  const rows = await db
    .select({ windowDays: metaEquilibriumRuns.windowDays })
    .from(metaEquilibriumRuns)
    .limit(1);
  return rows.length > 0;
}

const defaultSteps: ScheduledJobSteps = {
  syncMeta: (db) => runMetaSync(db),
  computeCardStats: (db) => computeCardStats(db),
  computeEquilibrium: (db) => computeEquilibrium(db),
  hasEquilibriumRun,
};

async function runStep(
  name: ScheduledStepName,
  fn: () => Promise<unknown>,
): Promise<ScheduledStepOutcome> {
  const start = Date.now();
  try {
    const result = await fn();
    return { name, status: 'ok', durationMs: Date.now() - start, result };
  } catch (err) {
    console.error(`[scheduledJobs] ${name} failed:`, err);
    return {
      name,
      status: 'failed',
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runScheduledJobs(
  db: Db,
  opts: { now?: Date; steps?: Partial<ScheduledJobSteps>; forceEquilibrium?: boolean } = {},
): Promise<ScheduledJobsResult> {
  const now = opts.now ?? new Date();
  const steps = { ...defaultSteps, ...opts.steps };
  const outcomes: ScheduledStepOutcome[] = [];

  outcomes.push(await runStep('syncMeta', () => steps.syncMeta(db)));
  outcomes.push(await runStep('computeCardStats', () => steps.computeCardStats(db)));

  const equilibriumDue =
    opts.forceEquilibrium === true ||
    now.getUTCDay() === MONDAY ||
    !(await steps.hasEquilibriumRun(db));
  outcomes.push(
    equilibriumDue
      ? await runStep('computeEquilibrium', () => steps.computeEquilibrium(db))
      : { name: 'computeEquilibrium', status: 'skipped', durationMs: 0 },
  );

  return {
    startedAt: now.toISOString(),
    ok: outcomes.every((o) => o.status !== 'failed'),
    steps: outcomes,
  };
}

// Cron entry point: `node dist/jobs/runScheduledJobs.js [--force-equilibrium]`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const forceEquilibrium = process.argv.includes('--force-equilibrium');
  runScheduledJobs(getDb(), { forceEquilibrium })
    .then((r) => {
      console.log('[scheduledJobs] done:', JSON.stringify(r, null, 2));
      if (!r.ok) process.exitCode = 1;
    })
    .catch((err) => {
      console.error('[scheduledJobs] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
