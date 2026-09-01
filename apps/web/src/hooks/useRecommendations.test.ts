import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook } from '@testing-library/react';
import i18n from '../i18n';
import { useRecommendations } from './useRecommendations';
import type { ArchetypeStats, DeckSnapshot, OpponentLog } from '../types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function snapshot(over: Partial<DeckSnapshot>): DeckSnapshot {
  return {
    id: 1,
    label: 'V1',
    cards: '[]',
    totalCards: 60,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    archetype: 'Dragapult ex',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

const MINIMAL_STATS: ArchetypeStats = {
  archetype: 'Dragapult ex',
  encounters: 1,
  wins: 0,
  losses: 0,
  ties: 0,
  winRate: 0,
  frequencyPct: 0,
  metaWinRate: 0,
  bo1EquivalentWinRate: null,
  bo1Games: 0,
  bo3Games: 0,
  unknownFormatGames: 0,
};

describe('useRecommendations — win-rate degradation rule (plan personal-data-role-rework §6 decision 1)', () => {
  it('counts ties as a third of a win when comparing deck-snapshot win rates (rule 6, overall decline)', () => {
    // "Current" snapshot (id 1, deckSnapshots[0]): 1W/1L/2T. Naive
    // wins/(wins+losses) = 50 %; tie-weighted = (1 + 2/3) / 4 = 41.7 % ≈ 42 %.
    const currentLogs: OpponentLog[] = [
      log({ deckSnapshotId: 1, result: 'W' }),
      log({ deckSnapshotId: 1, result: 'L' }),
      log({ deckSnapshotId: 1, result: 'T' }),
      log({ deckSnapshotId: 1, result: 'T' }),
    ];
    // "Best" older snapshot (id 2): 3W/0L/0T = 100 % either way.
    const bestLogs: OpponentLog[] = [
      log({ deckSnapshotId: 2, result: 'W' }),
      log({ deckSnapshotId: 2, result: 'W' }),
      log({ deckSnapshotId: 2, result: 'W' }),
    ];

    const { result } = renderHook(() =>
      useRecommendations({
        archetypeStats: [MINIMAL_STATS],
        deckCards: [],
        opponentLogs: [...currentLogs, ...bestLogs],
        deckSnapshots: [snapshot({ id: 1, label: 'Current' }), snapshot({ id: 2, label: 'Old' })],
        localMeta: [],
      }),
    );

    const decline = result.current.find((r) => r.id === 'version-overall-decline');
    expect(decline).toBeDefined();
    // Old naive formula would read "100% → 50%"; tie-weighted reads "100% → 42%".
    expect(decline?.suggestion).toContain('42%');
    expect(decline?.suggestion).not.toContain('50%');
  });
});
