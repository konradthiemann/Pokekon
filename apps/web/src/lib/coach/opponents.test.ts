import { describe, expect, it } from 'vitest';
import { computeFieldScores, type ArchetypeShare, type MatchupCell } from '@pokekon/shared';
import { ownFieldScore } from './opponents';

const FIELD: ArchetypeShare[] = [
  { archetypeId: 'gardevoir-ex', archetypeName: 'Gardevoir ex', sharePct: 60 },
  { archetypeId: 'raging-bolt-ex', archetypeName: 'Raging Bolt ex', sharePct: 40 },
];
const CELLS: MatchupCell[] = [
  {
    deck1: 'dragapult-ex',
    deck2: 'gardevoir-ex',
    total: 20,
    winRate: 60,
    wins: 12,
    losses: 8,
    ties: 0,
  },
  {
    deck1: 'dragapult-ex',
    deck2: 'raging-bolt-ex',
    total: 20,
    winRate: 40,
    wins: 8,
    losses: 12,
    ties: 0,
  },
  {
    deck1: 'gardevoir-ex',
    deck2: 'raging-bolt-ex',
    total: 20,
    winRate: 50,
    wins: 10,
    losses: 10,
    ties: 0,
  },
];

describe('ownFieldScore', () => {
  it('scores the own archetype when it is part of the field (same as computeFieldScores)', () => {
    const field = [
      ...FIELD,
      { archetypeId: 'dragapult-ex', archetypeName: 'Dragapult ex', sharePct: 10 },
    ];
    const expected = computeFieldScores(field, CELLS).find((s) => s.archetypeId === 'dragapult-ex');
    expect(ownFieldScore('dragapult-ex', 'Dragapult ex', field, CELLS)).toEqual(expected);
  });

  it('scores the own archetype with share 0 when it is not in the field, without NaN', () => {
    const score = ownFieldScore('dragapult-ex', 'Dragapult ex', FIELD, CELLS)!;
    expect(score.sharePct).toBe(0);
    // 60 % × 60 + 40 % × 40 = 52
    expect(score.fieldWinRatePct).toBeCloseTo(52, 5);
    expect(Number.isNaN(score.fieldWinRateLowPct)).toBe(false);
  });

  it('returns null when no matchup covers any opponent', () => {
    expect(ownFieldScore('dragapult-ex', 'Dragapult ex', FIELD, [])).toBeNull();
  });

  it('returns null for an empty field', () => {
    expect(ownFieldScore('dragapult-ex', 'Dragapult ex', [], CELLS)).toBeNull();
  });
});
