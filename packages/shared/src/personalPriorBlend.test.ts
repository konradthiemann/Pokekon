import { describe, it, expect } from 'vitest';
import {
  blendWithPersonalPrior,
  DEFAULT_GLOBAL_SAMPLE_EQUIVALENT,
  DEFAULT_MIN_OWN_GAMES,
} from './personalPriorBlend.js';

describe('blendWithPersonalPrior — sample-size threshold (Spec 10 Slice E)', () => {
  it('does NOT use personal data below the default minimum (4 own games)', () => {
    const result = blendWithPersonalPrior(60, { wins: 4, losses: 0, ties: 0 });
    expect(result.usedPersonalData).toBe(false);
    expect(result.blendedPct).toBe(60); // falls back to the cluster rate untouched
    expect(result.ownWeight).toBe(0);
  });

  it('DOES use personal data at exactly the default minimum (5 own games)', () => {
    const result = blendWithPersonalPrior(60, { wins: 5, losses: 0, ties: 0 });
    expect(result.usedPersonalData).toBe(true);
    expect(result.ownWeight).toBeGreaterThan(0);
  });

  it('treats zero own games the same as below-threshold (no crash on a null win rate)', () => {
    const result = blendWithPersonalPrior(60, { wins: 0, losses: 0, ties: 0 });
    expect(result.usedPersonalData).toBe(false);
    expect(result.blendedPct).toBe(60);
    expect(result.ownWinRatePct).toBeNull();
  });

  it('respects a custom minOwnGames', () => {
    const belowCustom = blendWithPersonalPrior(
      60,
      { wins: 8, losses: 0, ties: 0 },
      { minOwnGames: 10 },
    );
    expect(belowCustom.usedPersonalData).toBe(false);

    const atCustom = blendWithPersonalPrior(
      60,
      { wins: 10, losses: 0, ties: 0 },
      { minOwnGames: 10 },
    );
    expect(atCustom.usedPersonalData).toBe(true);
  });
});

describe('blendWithPersonalPrior — weight grows with sample size but stays capped (Spec 10 Slice E)', () => {
  it('gives more weight to personal data as own-game count grows', () => {
    const small = blendWithPersonalPrior(50, { wins: 5, losses: 0, ties: 0 });
    const large = blendWithPersonalPrior(50, { wins: 50, losses: 0, ties: 0 });
    expect(large.ownWeight).toBeGreaterThan(small.ownWeight);
  });

  it('caps ownWeight at 0.7 by default even with an overwhelming personal sample', () => {
    const result = blendWithPersonalPrior(50, { wins: 5000, losses: 0, ties: 0 });
    expect(result.ownWeight).toBeLessThanOrEqual(0.7);
    expect(result.ownWeight).toBeCloseTo(0.7, 5);
  });

  it('respects a custom maxOwnWeight cap', () => {
    const result = blendWithPersonalPrior(
      50,
      { wins: 5000, losses: 0, ties: 0 },
      { maxOwnWeight: 0.3 },
    );
    expect(result.ownWeight).toBeCloseTo(0.3, 5);
  });

  it('respects a custom globalSampleEquivalent (a smaller value gives personal data more weight sooner)', () => {
    const wideGlobalPrior = blendWithPersonalPrior(
      50,
      { wins: 5, losses: 0, ties: 0 },
      { globalSampleEquivalent: 100 },
    );
    const narrowGlobalPrior = blendWithPersonalPrior(
      50,
      { wins: 5, losses: 0, ties: 0 },
      { globalSampleEquivalent: 5 },
    );
    expect(narrowGlobalPrior.ownWeight).toBeGreaterThan(wideGlobalPrior.ownWeight);
  });
});

describe('blendWithPersonalPrior — the blend itself (Spec 10 Slice E)', () => {
  it('interpolates linearly between the own win rate and the cluster win rate by ownWeight', () => {
    const result = blendWithPersonalPrior(40, { wins: 5, losses: 0, ties: 0 }); // own = 100%
    expect(result.ownWinRatePct).toBe(100);
    const expected = result.ownWeight * 100 + (1 - result.ownWeight) * 40;
    expect(result.blendedPct).toBeCloseTo(expected, 6);
    // Blend must land strictly between the two inputs (own=100 > cluster=40).
    expect(result.blendedPct).toBeGreaterThan(40);
    expect(result.blendedPct).toBeLessThan(100);
  });

  it('uses the tie-weighted own win rate (a tie counts as a third of a win), not wins/(wins+losses)', () => {
    // 3W/0L/3T -> tie-weighted = (3 + 3/3)/6 = 4/6 = 66.7%, rounded to 67
    // (tournamentWinRatePct's default 0-decimal rounding); naive
    // decided-only would be 100%.
    const result = blendWithPersonalPrior(50, { wins: 3, losses: 0, ties: 3 });
    expect(result.ownWinRatePct).toBe(67);
  });

  it('exposes the default tunables as named exports', () => {
    expect(DEFAULT_MIN_OWN_GAMES).toBe(5);
    expect(DEFAULT_GLOBAL_SAMPLE_EQUIVALENT).toBeGreaterThan(0);
  });
});
