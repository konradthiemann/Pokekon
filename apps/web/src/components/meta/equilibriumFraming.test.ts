// Tests for the plain-language framing helpers for the game-theoretic
// equilibrium panel (plan .claude/plans/meta-game-theory-layer.md §3.8, §4
// step 19). `./equilibriumFraming.ts` does not exist yet — this is the RED
// step of the tester/implementer split (rules/tdd.md).
//
// Both value tables below are transcribed VERBATIM from the plan §3.8
// ("Verbindliche Grenzwerte (Grenzen ausdrücklich mit-getestet)"), including
// every explicitly-called-out boundary:
// - exclusionBand: rows 1-9 of the first table (100, 90, 89.9, 77.9 [the
//   paper's Dragapult value], 70, 69.9, 30, 29.9, 0).
// - isCompositionFragile: rows 1-5 of the second table (the paper's 2.1 %
//   value, 80/7/7 -> false, 80/9/7 -> true, the 50 boundary inclusive as
//   false, 49.9 as true).
import { describe, it, expect } from 'vitest';
import {
  exclusionBand,
  isCompositionFragile,
  FRAGILE_SUPPORT_RATE_PCT,
  type ExclusionBand,
} from './equilibriumFraming.js';

describe('exclusionBand (plan §3.8)', () => {
  const cases: [number, ExclusionBand][] = [
    [100, 'veryRobust'],
    [90, 'veryRobust'], // boundary inclusive
    [89.9, 'robust'],
    [77.9, 'robust'], // the paper's Dragapult exclusion rate
    [70, 'robust'], // boundary inclusive
    [69.9, 'unclear'],
    [30, 'unclear'], // boundary inclusive
    [29.9, 'likelyIn'],
    [0, 'likelyIn'],
  ];

  it.each(cases)('exclusionRatePct=%s -> %s', (input, expected) => {
    expect(exclusionBand(input)).toBe(expected);
  });
});

describe('isCompositionFragile (plan §3.8)', () => {
  const cases: [number, number, number, boolean][] = [
    [2.1, 7, 7, true], // the paper's own value: exact support reproduced in only 2.1 %
    [80, 7, 7, false],
    [80, 9, 7, true], // equalizerCount > supportSize
    [50, 3, 3, false], // boundary inclusive: exactSupportRatePct === FRAGILE_SUPPORT_RATE_PCT
    [49.9, 3, 3, true],
  ];

  it.each(cases)(
    'exactSupportRatePct=%s, equalizerCount=%s, supportSize=%s -> %s',
    (exactSupportRatePct, equalizerCount, supportSize, expected) => {
      expect(isCompositionFragile(exactSupportRatePct, equalizerCount, supportSize)).toBe(expected);
    },
  );

  it('exposes the 50 % threshold as a named constant matching the boundary above', () => {
    // The boundary test above (50 -> false, 49.9 -> true) only holds if this
    // constant really is 50 — pin it explicitly so the two can't drift apart.
    expect(FRAGILE_SUPPORT_RATE_PCT).toBe(50);
  });
});
