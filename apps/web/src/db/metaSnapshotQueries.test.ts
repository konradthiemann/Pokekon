import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './database';
import {
  getLatestMetaSnapshots,
  getAllMetaSnapshots,
  deletePreRotationMetaSnapshots,
  upsertMetaSnapshot,
} from './queries';
import type { MetaSnapshot } from '../types';

function snap(archetype: string, period: string): Omit<MetaSnapshot, 'id'> {
  return {
    archetype,
    period,
    frequencyPct: 10,
    winRatePct: 50,
    wins: 5,
    losses: 5,
    playerCount: 10,
    sourceNote: 'test',
  };
}

describe('meta snapshot queries with rotation cutoff', () => {
  beforeEach(async () => {
    await db.metaSnapshots.clear();
  });

  it('getAllMetaSnapshots hides pre-rotation periods', async () => {
    await upsertMetaSnapshot(snap('charizard-ex', '2026-W10')); // pre-rotation
    await upsertMetaSnapshot(snap('dragapult-ex', '2026-W15')); // post-rotation
    const all = await getAllMetaSnapshots();
    expect(all).toHaveLength(1);
    expect(all[0].archetype).toBe('dragapult-ex');
  });

  it('getLatestMetaSnapshots returns nothing when only pre-rotation data exists', async () => {
    await upsertMetaSnapshot(snap('charizard-ex', '2026-W10'));
    await upsertMetaSnapshot(snap('gardevoir-ex', '2026-W12'));
    expect(await getLatestMetaSnapshots()).toEqual([]);
  });

  it('getLatestMetaSnapshots serves the newest post-rotation period', async () => {
    await upsertMetaSnapshot(snap('charizard-ex', '2026-W10'));
    await upsertMetaSnapshot(snap('dragapult-ex', '2026-W14'));
    await upsertMetaSnapshot(snap('gholdengo', '2026-W15'));
    const latest = await getLatestMetaSnapshots();
    expect(latest).toHaveLength(1);
    expect(latest[0].period).toBe('2026-W15');
  });

  it('deletePreRotationMetaSnapshots removes only old periods', async () => {
    await upsertMetaSnapshot(snap('charizard-ex', '2025-W50'));
    await upsertMetaSnapshot(snap('gardevoir-ex', '2026-W12'));
    await upsertMetaSnapshot(snap('dragapult-ex', '2026-W13'));
    await upsertMetaSnapshot(snap('gholdengo', '2026-W20'));

    const deleted = await deletePreRotationMetaSnapshots();
    expect(deleted).toBe(2);

    const remaining = await db.metaSnapshots.toArray();
    expect(remaining.map((s) => s.period).sort()).toEqual(['2026-W13', '2026-W20']);
  });
});
