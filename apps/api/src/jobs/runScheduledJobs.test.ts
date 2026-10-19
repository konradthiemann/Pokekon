import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../db/index.js';
import { runScheduledJobs, type ScheduledJobSteps } from './runScheduledJobs.js';

// The runner is orchestration only: every step is injected, so these tests
// need neither the Limitless API nor a database. The jobs themselves are
// covered in api.test.ts.
const db = {} as Db;

const MONDAY = new Date('2026-10-19T06:00:00Z');
const TUESDAY = new Date('2026-10-20T06:00:00Z');

function fakeSteps(overrides: Partial<ScheduledJobSteps> = {}): {
  steps: ScheduledJobSteps;
  calls: string[];
} {
  const calls: string[] = [];
  const steps: ScheduledJobSteps = {
    syncMeta: vi.fn(async () => {
      calls.push('syncMeta');
      return { tournamentsSynced: 3 };
    }),
    computeCardStats: vi.fn(async () => {
      calls.push('computeCardStats');
      return { archetypesProcessed: 5 };
    }),
    computeEquilibrium: vi.fn(async () => {
      calls.push('computeEquilibrium');
      return { windows: [7, 14, 21, 28] };
    }),
    latestEquilibriumAt: vi.fn(async () => new Date('2026-10-19T06:05:00Z')),
    ...overrides,
  };
  return { steps, calls };
}

describe('runScheduledJobs', () => {
  it('runs sync, card stats and (on Mondays) the equilibrium in this order', async () => {
    const { steps, calls } = fakeSteps();
    const result = await runScheduledJobs(db, { now: MONDAY, steps });

    expect(calls).toEqual(['syncMeta', 'computeCardStats', 'computeEquilibrium']);
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => [s.name, s.status])).toEqual([
      ['syncMeta', 'ok'],
      ['computeCardStats', 'ok'],
      ['computeEquilibrium', 'ok'],
    ]);
    expect(result.steps[1]?.result).toEqual({ archetypesProcessed: 5 });
  });

  it('skips the equilibrium on other weekdays while the last run is at most 7 days old', async () => {
    const { steps, calls } = fakeSteps();
    const result = await runScheduledJobs(db, { now: TUESDAY, steps });

    expect(calls).toEqual(['syncMeta', 'computeCardStats']);
    expect(result.ok).toBe(true);
    expect(result.steps[2]).toMatchObject({ name: 'computeEquilibrium', status: 'skipped' });
  });

  it('computes the equilibrium on any weekday while none exists yet (cold start)', async () => {
    const { steps, calls } = fakeSteps({ latestEquilibriumAt: vi.fn(async () => null) });
    await runScheduledJobs(db, { now: TUESDAY, steps });

    expect(calls).toContain('computeEquilibrium');
  });

  it('catches up on any weekday when the last run is older than 7 days (missed Monday)', async () => {
    const { steps, calls } = fakeSteps({
      latestEquilibriumAt: vi.fn(async () => new Date('2026-10-12T06:05:00Z')),
    });
    await runScheduledJobs(db, { now: TUESDAY, steps });

    expect(calls).toContain('computeEquilibrium');
  });

  it('runs the equilibrium when its freshness check itself fails', async () => {
    const { steps, calls } = fakeSteps({
      latestEquilibriumAt: vi.fn(async () => {
        throw new Error('db hiccup');
      }),
    });
    const result = await runScheduledJobs(db, { now: TUESDAY, steps });

    expect(calls).toEqual(['syncMeta', 'computeCardStats', 'computeEquilibrium']);
    expect(result.ok).toBe(true);
  });

  it('a failed equilibrium fails the run but keeps the earlier results', async () => {
    const { steps } = fakeSteps({
      computeEquilibrium: vi.fn(async () => {
        throw new Error('simplex');
      }),
    });
    const result = await runScheduledJobs(db, { now: MONDAY, steps });

    expect(result.ok).toBe(false);
    expect(result.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'failed']);
  });

  it('forceEquilibrium runs it regardless of the weekday', async () => {
    const { steps, calls } = fakeSteps();
    await runScheduledJobs(db, { now: TUESDAY, steps, forceEquilibrium: true });

    expect(calls).toContain('computeEquilibrium');
  });

  it('a failed sync still recomputes the stats from the data already stored', async () => {
    const { steps, calls } = fakeSteps({
      syncMeta: vi.fn(async () => {
        throw new Error('Limitless down');
      }),
    });
    const result = await runScheduledJobs(db, { now: MONDAY, steps });

    expect(calls).toEqual(['computeCardStats', 'computeEquilibrium']);
    expect(result.ok).toBe(false);
    expect(result.steps[0]).toMatchObject({
      name: 'syncMeta',
      status: 'failed',
      error: 'Limitless down',
    });
  });

  it('a failed card-stats run does not block the equilibrium, but fails the run', async () => {
    const { steps, calls } = fakeSteps({
      computeCardStats: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const result = await runScheduledJobs(db, { now: MONDAY, steps });

    expect(calls).toEqual(['syncMeta', 'computeEquilibrium']);
    expect(result.ok).toBe(false);
    expect(result.steps[1]).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('records a duration for every step that ran', async () => {
    const { steps } = fakeSteps();
    const result = await runScheduledJobs(db, { now: MONDAY, steps });

    for (const step of result.steps) {
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.startedAt).toBe(MONDAY.toISOString());
  });
});
