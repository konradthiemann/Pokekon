// Golden + property tests for Wilson score confidence intervals (plan
// .claude/plans/confidence-aware-matchups.md §3.1/§3.2/§3.3, Slice A).
// `./wilsonInterval.ts` is currently a tester-authored stub — every export
// returns an obviously-wrong sentinel. @implementer replaces the stub; these
// tests define "done" for that work.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIDENCE,
  zForConfidence,
  wilsonInterval,
  combineIndependentIntervals,
  matchupCellInterval,
  type IntervalTerm,
} from './wilsonInterval.js';

const TOL = 1e-4;

describe('DEFAULT_CONFIDENCE', () => {
  it('is 95 %', () => {
    expect(DEFAULT_CONFIDENCE).toBe(0.95);
  });
});

describe('zForConfidence', () => {
  it.each([
    [0.8, 1.2815515655446004],
    [0.9, 1.6448536269514722],
    [0.95, 1.959963984540054],
    [0.98, 2.3263478740408408],
    [0.99, 2.5758293035489004],
  ])('confidence %s -> z %s', (confidence, expected) => {
    expect(zForConfidence(confidence)).toBeCloseTo(expected, 10);
  });

  it('throws for an unsupported confidence level (a silently wrong z would be worse)', () => {
    expect(() => zForConfidence(0.93)).toThrow();
  });
});

describe('wilsonInterval — golden textbook values (95 %, tolerance 1e-4 pp)', () => {
  it.each([
    // wins, losses, ties, pct, lowPct, highPct, label
    [8, 2, 0, 80, 49.0162, 94.3318, 'standard 8/10 textbook example'],
    [0, 10, 0, 0, 0, 27.7533, 'edge case p̂=0 — Wald would give [0,0]'],
    [10, 0, 0, 100, 72.2467, 100, 'edge case p̂=1'],
    [1, 0, 0, 100, 20.6549, 100, 'n=1, maximal uncertainty'],
    [15, 133, 0, 10.1351, 6.2386, 16.0487, 'Newcombe (1998), published 0.0624-0.1605'],
    [10, 10, 0, 50, 29.9298, 70.0702, 'symmetric case n=20'],
    [62, 38, 0, 62, 52.2098, 70.9024, 'spec example "62 % (54-70 %)"'],
    [500, 500, 0, 50, 46.907, 53.093, 'large n -> narrow'],
    [6, 4, 2, 55.5556, 29.7019, 78.7148, 'tie-weighted spec-2 AC record'],
  ])(
    'wins=%i losses=%i ties=%i -> pct=%s lowPct=%s highPct=%s (%s)',
    (wins, losses, ties, pct, lowPct, highPct) => {
      const result = wilsonInterval(wins, losses, ties);
      expect(result).not.toBeNull();
      expect(result!.pct).toBeCloseTo(pct, 4);
      expect(result!.lowPct).toBeCloseTo(lowPct, 4);
      expect(result!.highPct).toBeCloseTo(highPct, 4);
    },
  );

  it('returns null when n === 0 (no games at all)', () => {
    expect(wilsonInterval(0, 0, 0)).toBeNull();
  });

  it('defaults ties to 0', () => {
    const withDefault = wilsonInterval(8, 2);
    const explicit = wilsonInterval(8, 2, 0);
    expect(withDefault).not.toBeNull();
    expect(withDefault!.lowPct).toBeCloseTo(explicit!.lowPct, 10);
    expect(withDefault!.highPct).toBeCloseTo(explicit!.highPct, 10);
  });

  it('treats negative or non-finite inputs defensively as 0 (same contract as tournamentWinRate)', () => {
    const result = wilsonInterval(-5, 10, Number.NaN);
    // Effectively wins=0, losses=10, ties=0 -> the 0/10 golden case.
    expect(result).not.toBeNull();
    expect(result!.pct).toBeCloseTo(0, 4);
    expect(result!.lowPct).toBeCloseTo(0, 4);
    expect(result!.highPct).toBeCloseTo(27.7533, 4);
  });

  it('widthPct is highPct - lowPct', () => {
    const result = wilsonInterval(8, 2)!;
    expect(result.widthPct).toBeCloseTo(result.highPct - result.lowPct, 10);
  });

  it('n is wins + losses + ties', () => {
    expect(wilsonInterval(6, 4, 2)!.n).toBe(12);
  });
});

describe('wilsonInterval — significant flag (computed on UNROUNDED bounds)', () => {
  it.each([
    [8, 2, 49.0162, 94.3318, false, '8W/2L — the headline example: looks decisive, is not'],
    [8, 1, 56.5, 98.0109, true, '8W/1L'],
    [40, 60, 30.9401, 49.7997, true, '40W/60L'],
    [20, 80, 13.3367, 28.8829, true, '20W/80L'],
    [6, 5, 28.0092, 78.7287, false, '6W/5L'],
    [9, 11, 25.8198, 65.7915, false, '9W/11L'],
  ])('%iW/%iL -> [%s, %s], significant=%s (%s)', (wins, losses, lowPct, highPct, significant) => {
    const result = wilsonInterval(wins, losses)!;
    expect(result.lowPct).toBeCloseTo(lowPct, 4);
    expect(result.highPct).toBeCloseTo(highPct, 4);
    expect(result.significant).toBe(significant);
  });
});

describe('wilsonInterval — monotonicity and bracketing properties', () => {
  it('widthPct shrinks strictly monotonically in n at fixed p̂ = 0.5', () => {
    const w5 = wilsonInterval(5, 5)!.widthPct;
    const w50 = wilsonInterval(50, 50)!.widthPct;
    const w500 = wilsonInterval(500, 500)!.widthPct;
    expect(w5).toBeCloseTo(52.6814, 3);
    expect(w50).toBeCloseTo(19.2337, 3);
    expect(w500).toBeCloseTo(6.1861, 3);
    expect(w50).toBeLessThan(w5);
    expect(w500).toBeLessThan(w50);
  });

  it('lowPct <= pct <= highPct for a range of records (property test)', () => {
    const cases: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, 0],
      [3, 7, 0],
      [50, 1, 0],
      [1, 50, 0],
      [6, 4, 2],
      [0, 0, 10],
      [100, 100, 100],
    ];
    for (const [wins, losses, ties] of cases) {
      const result = wilsonInterval(wins, losses, ties)!;
      expect(result.lowPct).toBeLessThanOrEqual(result.pct + TOL);
      expect(result.pct).toBeLessThanOrEqual(result.highPct + TOL);
    }
  });

  it('a 90 % interval is strictly narrower than a 95 % interval for the same input', () => {
    const ci90 = wilsonInterval(8, 2, 0, { confidence: 0.9 })!;
    const ci95 = wilsonInterval(8, 2, 0, { confidence: 0.95 })!;
    expect(ci90.widthPct).toBeLessThan(ci95.widthPct);
  });
});

describe('combineIndependentIntervals', () => {
  it('a single term reproduces its own interval exactly', () => {
    const terms: IntervalTerm[] = [{ weight: 100, pct: 80, lowPct: 49.0162, highPct: 94.3318 }];
    const result = combineIndependentIntervals(terms);
    expect(result).not.toBeNull();
    expect(result!.pct).toBeCloseTo(80, 4);
    expect(result!.lowPct).toBeCloseTo(49.0162, 4);
    expect(result!.highPct).toBeCloseTo(94.3318, 4);
  });

  it('K=4 identical terms narrow the band to width / sqrt(K) (30.9838pp -> 15.4919pp)', () => {
    const terms: IntervalTerm[] = Array.from({ length: 4 }, () => ({
      weight: 25,
      pct: 80,
      lowPct: 49.0162,
      highPct: 94.3318,
    }));
    const result = combineIndependentIntervals(terms)!;
    expect(result.pct).toBeCloseTo(80, 4);
    expect(result.lowPct).toBeCloseTo(64.5081, 3);
    expect(result.highPct).toBeCloseTo(87.1659, 3);
  });

  it('a definitional mirror term (low === pct === high) contributes zero variance', () => {
    const terms: IntervalTerm[] = [
      { weight: 20, pct: 50, lowPct: 50, highPct: 50 },
      { weight: 30, pct: 80, lowPct: 49.0162, highPct: 94.3318 },
      { weight: 50, pct: 60, lowPct: 55.6454, highPct: 64.2021 },
    ];
    const result = combineIndependentIntervals(terms)!;
    expect(result.pct).toBeCloseTo(64, 4);
    expect(result.lowPct).toBeCloseTo(54.4533, 3);
    expect(result.highPct).toBeCloseTo(68.7854, 3);
  });

  it('a thin wide-band term and a thick narrow-band term combine asymmetrically', () => {
    const terms: IntervalTerm[] = [
      { weight: 50, pct: 100, lowPct: 20.6549, highPct: 100 },
      { weight: 50, pct: 60, lowPct: 55.6454, highPct: 64.2021 },
    ];
    const result = combineIndependentIntervals(terms)!;
    expect(result.pct).toBeCloseTo(80, 4);
    expect(result.lowPct).toBeCloseTo(40.2678, 3);
    expect(result.highPct).toBeCloseTo(82.1011, 3);
  });

  it('returns null for an empty term list', () => {
    expect(combineIndependentIntervals([])).toBeNull();
  });

  it('returns null when the total weight is 0', () => {
    expect(
      combineIndependentIntervals([{ weight: 0, pct: 80, lowPct: 49.0162, highPct: 94.3318 }]),
    ).toBeNull();
  });
});

describe('matchupCellInterval — precedence order (plan §3.3)', () => {
  it('falls back (case 3) to reconstructing from total + winRate when no counts are given', () => {
    // Must match wilsonInterval(8, 2, 0) exactly — the same cell as the golden test.
    const result = matchupCellInterval({ deck1: 'a', deck2: 'b', total: 10, winRate: 80 });
    expect(result).not.toBeNull();
    expect(result!.pct).toBeCloseTo(80, 4);
    expect(result!.lowPct).toBeCloseTo(49.0162, 4);
    expect(result!.highPct).toBeCloseTo(94.3318, 4);
  });

  it('case 2 (wins/losses/ties) takes precedence over case 3 (total/winRate), even when both are present', () => {
    // total/winRate here would reconstruct as if it were 5W/5L (50 %), but the
    // raw record says 8W/2L — case 2 must win.
    const result = matchupCellInterval({
      deck1: 'a',
      deck2: 'b',
      total: 10,
      winRate: 50,
      wins: 8,
      losses: 2,
      ties: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.pct).toBeCloseTo(80, 4);
    expect(result!.lowPct).toBeCloseTo(49.0162, 4);
    expect(result!.highPct).toBeCloseTo(94.3318, 4);
  });

  it('case 1 (explicit lowPct/highPct) is used verbatim and wins over everything else', () => {
    const result = matchupCellInterval({
      deck1: 'a',
      deck2: 'b',
      total: 10,
      winRate: 80,
      wins: 1,
      losses: 1,
      ties: 0,
      lowPct: 10,
      highPct: 20,
    });
    expect(result).not.toBeNull();
    expect(result!.pct).toBe(80); // pct = cell.winRate, verbatim
    expect(result!.lowPct).toBe(10);
    expect(result!.highPct).toBe(20);
  });

  it('returns null when total <= 0 (no data at all)', () => {
    expect(matchupCellInterval({ deck1: 'a', deck2: 'b', total: 0, winRate: 0 })).toBeNull();
  });
});
