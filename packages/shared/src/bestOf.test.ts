import { describe, it, expect } from 'vitest';
import {
  BEST_OF_VALUES,
  bo1EquivalentWinRate,
  bo1ToBo3WinRate,
  bo3ToBo1WinRate,
} from './bestOf.js';

describe('BEST_OF_VALUES', () => {
  it('is exactly BO1/BO3', () => {
    expect(BEST_OF_VALUES).toEqual(['BO1', 'BO3']);
  });
});

describe('bo1ToBo3WinRate / bo3ToBo1WinRate', () => {
  it('share the fixed points 0, 0.5 and 1', () => {
    for (const p of [0, 0.5, 1]) {
      expect(bo1ToBo3WinRate(p)).toBeCloseTo(p, 9);
      expect(bo3ToBo1WinRate(p)).toBeCloseTo(p, 9);
    }
  });

  it('round-trips for a range of single-game win rates (tolerance 1e-9)', () => {
    for (let i = 0; i <= 10; i++) {
      const p = i / 10;
      expect(bo3ToBo1WinRate(bo1ToBo3WinRate(p))).toBeCloseTo(p, 9);
    }
  });

  it('converts in the documented direction (0.6 Bo1 -> ~0.648 Bo3)', () => {
    expect(bo1ToBo3WinRate(0.6)).toBeCloseTo(0.648, 3);
    expect(bo3ToBo1WinRate(0.648)).toBeCloseTo(0.6, 3);
  });

  it('is monotonic: a higher Bo3 win rate never yields a lower Bo1 win rate', () => {
    expect(bo3ToBo1WinRate(0.3)).toBeLessThan(bo3ToBo1WinRate(0.7));
  });

  it('clamps out-of-range inputs to [0, 1]', () => {
    expect(bo1ToBo3WinRate(-1)).toBe(0);
    expect(bo1ToBo3WinRate(2)).toBe(1);
    expect(bo3ToBo1WinRate(-1)).toBe(0);
    expect(bo3ToBo1WinRate(2)).toBe(1);
  });
});

describe('bo1EquivalentWinRate', () => {
  it('returns null with only unknown-format games, while still counting them', () => {
    const result = bo1EquivalentWinRate({
      bo1: { wins: 0, losses: 0, ties: 0 },
      bo3: { wins: 0, losses: 0, ties: 0 },
      unknown: { wins: 3, losses: 1, ties: 0 },
    });
    expect(result).toMatchObject({ winRatePct: null, unknownGames: 4, convertedFromBo3: false });
  });

  it('reports the plain tie-weighted rate for pure Bo1 data (AC 6W/4L/2T -> 55.6)', () => {
    const result = bo1EquivalentWinRate(
      {
        bo1: { wins: 6, losses: 4, ties: 2 },
        bo3: { wins: 0, losses: 0, ties: 0 },
        unknown: { wins: 0, losses: 0, ties: 0 },
      },
      1,
    );
    expect(result.winRatePct).toBe(55.6);
    expect(result.convertedFromBo3).toBe(false);
    expect(result.bo1Games).toBe(12);
  });

  it('flags convertedFromBo3 once at least one Bo3 game contributes', () => {
    const result = bo1EquivalentWinRate({
      bo1: { wins: 0, losses: 0, ties: 0 },
      bo3: { wins: 3, losses: 1, ties: 0 },
      unknown: { wins: 0, losses: 0, ties: 0 },
    });
    expect(result.convertedFromBo3).toBe(true);
    expect(result.bo3Games).toBe(4);
  });
});
