// Golden + property tests for the payoff-matrix construction and the
// symmetric zero-sum Nash equilibrium solver (plan
// .claude/plans/meta-game-theory-layer.md §3.2/§3.3, Slice A2).
// `./nashEquilibrium.ts` does not exist yet — this file pins the exact
// contract (function signatures, the binding value tables, Fixtures A-E)
// that @implementer must satisfy against Slice A1's `solveStandardFormLp`
// (./simplex.ts, already merged). Fixture F (the reference-paper 6x6
// sub-matrix) is explicitly OUT OF SCOPE here: the plan's own step 0 source
// verification against the actual paper was not performed, and per the
// plan's own fallback rule Fixtures A-E already satisfy the golden-test
// requirement on their own.
import { describe, it, expect } from 'vitest';
import { tournamentWinRate } from './winRate.js';
import {
  zeroSumWinRate,
  buildPayoffMatrix,
  solveSymmetricZeroSumNash,
  SUPPORT_EPSILON_PCT,
  PAYOFF_EPSILON_PP,
  resamplePayoffMatrix,
  equilibriumRobustness,
  monteCarloSePct,
  DEFAULT_RESAMPLES,
  DEFAULT_SEED,
  replicatorStep,
  fitnessTrend,
  REPLICATOR_STABLE_BAND_PP,
  type PayoffMatrix,
  type RobustnessResult,
} from './nashEquilibrium.js';
import { mulberry32 } from './deterministicRandom.js';
import type { MatchupCellLike } from './wilsonInterval.js';

// ---------------------------------------------------------------------------
// zeroSumWinRate (plan §3.2)
// ---------------------------------------------------------------------------

describe('zeroSumWinRate — binding value table (plan §3.2)', () => {
  it.each([
    // wins, losses, ties, expected, label
    [
      1374,
      1374,
      97,
      0.5,
      "Dragapult mirror (reference paper, 2845 games) — exactly 0.5, unlike tournamentWinRate's 49.4 %",
    ],
    [813, 988, 266, 946 / 2067, 'Dragapult vs Gholdengo, reference paper record'],
    [988, 813, 266, 1121 / 2067, 'reverse direction — sums to exactly 1 with the row above'],
    [8, 2, 0, 0.8, 'no ties — identical to tournamentWinRate'],
    [0, 0, 4, 0.5, 'only ties'],
    [-5, 2, 0, 0, 'negative wins clamp to 0, same defensive contract as tournamentWinRate'],
  ])('wins=%i losses=%i ties=%i -> %s (%s)', (wins, losses, ties, expected) => {
    expect(zeroSumWinRate(wins, losses, ties)).toBeCloseTo(expected, 12);
  });

  it('returns null when no game was played at all (0/0/0)', () => {
    expect(zeroSumWinRate(0, 0, 0)).toBeNull();
  });

  it('the Dragapult vs Gholdengo pair sums to exactly 1 (constant-sum by construction)', () => {
    const forward = zeroSumWinRate(813, 988, 266)!;
    const backward = zeroSumWinRate(988, 813, 266)!;
    expect(forward + backward).toBeCloseTo(1, 12);
  });
});

describe('zeroSumWinRate — property test anchoring it to tournamentWinRate (plan §3.0a / §3.2)', () => {
  // No PRNG lives in this repo's analysis layer (plan §0.5) — a fixed,
  // hand-picked set of (w,l,t) triples stands in for "random" here, covering
  // no-ties, ties-only, lopsided and near-even records.
  it.each([
    [8, 2, 0],
    [0, 0, 4],
    [813, 988, 266],
    [988, 813, 266],
    [1374, 1374, 97],
    [5, 3, 2],
    [100, 50, 25],
    [0, 10, 0],
    [10, 0, 0],
    [1, 1, 1],
    [7, 0, 1],
  ])(
    'zeroSumWinRate(%i,%i,%i) === (1 + tournamentWinRate(w,l,t) - tournamentWinRate(l,w,t)) / 2',
    (w, l, t) => {
      const expected = (1 + tournamentWinRate(w, l, t)! - tournamentWinRate(l, w, t)!) / 2;
      expect(zeroSumWinRate(w, l, t)).toBeCloseTo(expected, 12);
    },
  );
});

// ---------------------------------------------------------------------------
// buildPayoffMatrix (plan §3.2)
// ---------------------------------------------------------------------------

const archetype = (id: string, sharePct: number): { archetypeId: string; sharePct: number } => ({
  archetypeId: id,
  sharePct,
});

describe('buildPayoffMatrix — precedence table (plan §3.2, five rows, first match wins)', () => {
  it('row 1: cell (i,j) carries wins/losses/ties with w+l+t>0 -> zeroSumWinRate(w,l,t), games=w+l+t, imputed=false', () => {
    const cells: MatchupCellLike[] = [
      { deck1: 'A', deck2: 'B', wins: 813, losses: 988, ties: 266, total: 2067, winRate: 43.62 },
    ];
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], cells);

    expect(matrix.p[0][1]).toBeCloseTo(946 / 2067, 12);
    expect(matrix.p[1][0]).toBeCloseTo(1121 / 2067, 12);
    expect(matrix.games[0][1]).toBe(2067);
    expect(matrix.games[1][0]).toBe(2067);
    expect(matrix.imputed[0][1]).toBe(false);
    expect(matrix.imputed[1][0]).toBe(false);
  });

  it('row 2: only the reverse cell (j,i) carries counters -> p[i][j] = 1 - zeroSumWinRate(w_ji,l_ji,t_ji)', () => {
    const cells: MatchupCellLike[] = [
      { deck1: 'B', deck2: 'A', wins: 988, losses: 813, ties: 266, total: 2067, winRate: 52.09 },
    ];
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], cells);

    expect(matrix.p[0][1]).toBeCloseTo(1 - 1121 / 2067, 12);
    expect(matrix.p[0][1]).toBeCloseTo(946 / 2067, 12);
    expect(matrix.games[0][1]).toBe(2067);
    expect(matrix.imputed[0][1]).toBe(false);
  });

  it('row 3: both directed winRate values present (no counters), total>0 -> symmetrized from percentages', () => {
    const cells: MatchupCellLike[] = [
      { deck1: 'A', deck2: 'B', total: 100, winRate: 60 },
      { deck1: 'B', deck2: 'A', total: 90, winRate: 35 },
    ];
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], cells);

    // (1 + 0.60 - 0.35) / 2 = 0.625
    expect(matrix.p[0][1]).toBeCloseTo(0.625, 12);
    expect(matrix.games[0][1]).toBe(100); // max(100, 90)
    expect(matrix.imputed[0][1]).toBe(false);
  });

  it('row 4: only one directed winRate value present, total>0 -> wr/100, mirrored as 1 - wr/100', () => {
    const cells: MatchupCellLike[] = [{ deck1: 'A', deck2: 'B', total: 50, winRate: 70 }];
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], cells);

    expect(matrix.p[0][1]).toBeCloseTo(0.7, 12);
    expect(matrix.p[1][0]).toBeCloseTo(0.3, 12);
    expect(matrix.games[0][1]).toBe(50);
    expect(matrix.games[1][0]).toBe(50);
    expect(matrix.imputed[0][1]).toBe(false);
  });

  it('row 5: no cell at all for the pair -> imputed as exactly 0.5, games 0, imputed=true', () => {
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], []);

    expect(matrix.p[0][1]).toBe(0.5);
    expect(matrix.p[1][0]).toBe(0.5);
    expect(matrix.games[0][1]).toBe(0);
    expect(matrix.games[1][0]).toBe(0);
    expect(matrix.imputed[0][1]).toBe(true);
    expect(matrix.imputed[1][0]).toBe(true);
  });
});

describe('buildPayoffMatrix — binding properties (plan §3.2)', () => {
  it('the diagonal is always 0.5 and never imputed, even with zero data (mirror is definitional, not imputed)', () => {
    const matrix = buildPayoffMatrix(
      [archetype('A', 50), archetype('B', 50), archetype('C', 0)],
      [],
    );

    for (let i = 0; i < matrix.archetypeIds.length; i++) {
      expect(matrix.p[i][i]).toBe(0.5);
      expect(matrix.imputed[i][i]).toBe(false);
    }
  });

  it('antisymmetry: p[i][j] + p[j][i] === 1 for every pair, including imputed and one-sided cells', () => {
    const cells: MatchupCellLike[] = [
      { deck1: 'A', deck2: 'B', wins: 6, losses: 4, ties: 0, total: 10, winRate: 60 },
      { deck1: 'B', deck2: 'C', total: 40, winRate: 55 }, // one-sided
      // A vs C: no data at all -> imputed
    ];
    const matrix = buildPayoffMatrix(
      [archetype('A', 40), archetype('B', 30), archetype('C', 30)],
      cells,
    );

    for (let i = 0; i < matrix.archetypeIds.length; i++) {
      for (let j = 0; j < matrix.archetypeIds.length; j++) {
        expect(matrix.p[i][j] + matrix.p[j][i]).toBeCloseTo(1, 12);
      }
    }
  });

  it('cells whose deck1/deck2 fall outside the archetype list are ignored entirely', () => {
    const cells: MatchupCellLike[] = [
      { deck1: 'Z', deck2: 'A', wins: 10, losses: 0, ties: 0, total: 10, winRate: 100 },
      { deck1: 'A', deck2: 'B', wins: 6, losses: 4, ties: 0, total: 10, winRate: 60 },
    ];
    const matrix = buildPayoffMatrix([archetype('A', 50), archetype('B', 50)], cells);

    expect(matrix.archetypeIds).toEqual(['A', 'B']);
    // The unknown-archetype cell must not leak in as a third row/column and
    // must not affect the A-vs-B cell, which is fully determined by row 1.
    expect(matrix.p[0][1]).toBeCloseTo(0.6, 12);
  });

  it('an empty archetype list yields a 0x0 matrix with imputedCellSharePct 0', () => {
    const matrix = buildPayoffMatrix([], []);

    expect(matrix.archetypeIds).toEqual([]);
    expect(matrix.p).toEqual([]);
    expect(matrix.games).toEqual([]);
    expect(matrix.imputed).toEqual([]);
    expect(matrix.imputedCellSharePct).toBe(0);
    expect(matrix.rowCoveragePct).toEqual([]);
  });

  it('an archetype with NO opponent cells at all is an equalizer row: rowCoveragePct 0, every off-diagonal cell 0.5', () => {
    // A vs B is fully known; C has no matchup data against anyone.
    const cells: MatchupCellLike[] = [
      { deck1: 'A', deck2: 'B', wins: 6, losses: 4, ties: 0, total: 10, winRate: 60 },
    ];
    const matrix = buildPayoffMatrix(
      [archetype('A', 50), archetype('B', 30), archetype('C', 20)],
      cells,
    );
    const c = matrix.archetypeIds.indexOf('C');

    expect(matrix.rowCoveragePct[c]).toBe(0);
    for (let j = 0; j < matrix.archetypeIds.length; j++) {
      if (j === c) continue;
      expect(matrix.p[c][j]).toBe(0.5);
      expect(matrix.imputed[c][j]).toBe(true);
    }
  });

  it('imputedCellSharePct and rowCoveragePct are computed exactly for a partially-covered 3-archetype set', () => {
    // A(50%) x B(30%) known; A-C and B-C unknown; C(20%) has no data at all.
    // Off-diagonal ordered pairs: 3*2 = 6. Imputed: (A,C),(C,A),(B,C),(C,B) = 4.
    // imputedCellSharePct = 4/6 * 100 = 66.7 (1 decimal).
    const cells: MatchupCellLike[] = [
      { deck1: 'A', deck2: 'B', wins: 6, losses: 4, ties: 0, total: 10, winRate: 60 },
    ];
    const matrix = buildPayoffMatrix(
      [archetype('A', 50), archetype('B', 30), archetype('C', 20)],
      cells,
    );

    expect(matrix.imputedCellSharePct).toBeCloseTo(66.7, 1);

    const a = matrix.archetypeIds.indexOf('A');
    const b = matrix.archetypeIds.indexOf('B');
    const c = matrix.archetypeIds.indexOf('C');

    // Row A: opponents B(30) + C(20) = 50 total opponent share; only B (30) covered.
    expect(matrix.rowCoveragePct[a]).toBeCloseTo((30 / 50) * 100, 1);
    // Row B: opponents A(50) + C(20) = 70 total opponent share; only A (50) covered.
    expect(matrix.rowCoveragePct[b]).toBeCloseTo((50 / 70) * 100, 1);
    // Row C: opponents A(50) + B(30) = 80 total opponent share; nothing covered.
    expect(matrix.rowCoveragePct[c]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// solveSymmetricZeroSumNash + exclusion certificate (plan §3.3)
// ---------------------------------------------------------------------------

/** Builds a minimal-but-valid PayoffMatrix from a raw p-matrix, for fixtures
 *  the plan specifies directly in matrix form (games/imputed are irrelevant
 *  to the solver itself — buildPayoffMatrix is tested separately above). */
function fixtureMatrix(archetypeIds: string[], p: number[][]): PayoffMatrix {
  const n = archetypeIds.length;
  return {
    archetypeIds,
    p,
    games: p.map((row) => row.map(() => 0)),
    imputed: p.map((row) => row.map(() => false)),
    imputedCellSharePct: 0,
    rowCoveragePct: new Array(n).fill(100),
  };
}

describe('solveSymmetricZeroSumNash — exported epsilon constants (plan §3.3)', () => {
  it('SUPPORT_EPSILON_PCT and PAYOFF_EPSILON_PP are both 1e-6', () => {
    expect(SUPPORT_EPSILON_PCT).toBe(1e-6);
    expect(PAYOFF_EPSILON_PP).toBe(1e-6);
  });
});

describe('solveSymmetricZeroSumNash — Fixture A: rock-paper-scissors, symmetric (plan §3.3)', () => {
  const matrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 1, 0],
      [0, 0.5, 1],
      [1, 0, 0.5],
    ],
  );

  it('produces the fully symmetric equilibrium (100/3 % each, value 50, all equalizers)', () => {
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.status).toBe('optimal');
    expect(result.valuePct).toBeCloseTo(50, 9);
    result.weightsPct.forEach((w) => expect(w).toBeCloseTo(100 / 3, 9));
    result.payoffsPct.forEach((p) => expect(p).toBeCloseTo(50, 9));
    expect(result.support).toHaveLength(3);
    expect(new Set(result.support)).toEqual(new Set(['A', 'B', 'C']));
    expect(result.excludedCertain).toEqual([]);
    expect(result.equalizerCount).toBe(3);
  });
});

describe('solveSymmetricZeroSumNash — Fixture B: weighted rock-paper-scissors (plan §3.3)', () => {
  // A beats B 60/40, B beats C 70/30, C beats A 55/45.
  const matrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 0.6, 0.45],
      [0.4, 0.5, 0.7],
      [0.55, 0.3, 0.5],
    ],
  );

  it('the equilibrium weight is inversely tied to the payoff edge, not proportional to it: A has the smallest edge and the largest weight', () => {
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.status).toBe('optimal');
    expect(result.valuePct).toBeCloseTo(50, 9);
    expect(result.weightsPct[0]).toBeCloseTo(400 / 7, 6); // A
    expect(result.weightsPct[1]).toBeCloseTo(100 / 7, 6); // B
    expect(result.weightsPct[2]).toBeCloseTo(200 / 7, 6); // C
    result.payoffsPct.forEach((p) => expect(p).toBeCloseTo(50, 9));
  });
});

describe('solveSymmetricZeroSumNash — Fixture C: the popularity-paradox case (plan §3.3, core claim of the whole spec)', () => {
  // Rock-paper-scissors on A/B/C, plus D which beats all three at 40 %.
  // D is the most-played deck by share (40 % vs 20/20/20) yet is provably
  // excluded from every equilibrium's support.
  const matrix = fixtureMatrix(
    ['A', 'B', 'C', 'D'],
    [
      [0.5, 1, 0, 0.6],
      [0, 0.5, 1, 0.6],
      [1, 0, 0.5, 0.6],
      [0.4, 0.4, 0.4, 0.5],
    ],
  );

  it('the most popular deck (D) has equilibrium weight 0 and is certified excluded from every equilibrium', () => {
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.status).toBe('optimal');
    expect(result.weightsPct[0]).toBeCloseTo(100 / 3, 6);
    expect(result.weightsPct[1]).toBeCloseTo(100 / 3, 6);
    expect(result.weightsPct[2]).toBeCloseTo(100 / 3, 6);
    expect(result.weightsPct[3]).toBeCloseTo(0, 9);

    expect(result.payoffsPct[0]).toBeCloseTo(50, 9);
    expect(result.payoffsPct[1]).toBeCloseTo(50, 9);
    expect(result.payoffsPct[2]).toBeCloseTo(50, 9);
    expect(result.payoffsPct[3]).toBeCloseTo(40, 9);

    expect(new Set(result.support)).toEqual(new Set(['A', 'B', 'C']));
    expect(result.excludedCertain).toEqual(['D']);
    expect(result.equalizerCount).toBe(3);
  });
});

describe('solveSymmetricZeroSumNash — Fixture D: strict 2x2 dominance (plan §3.3)', () => {
  const matrix = fixtureMatrix(
    ['A', 'B'],
    [
      [0.5, 0.6],
      [0.4, 0.5],
    ],
  );

  it('A dominates B 60/40 -> pure A, B excluded with certainty', () => {
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.weightsPct[0]).toBeCloseTo(100, 9);
    expect(result.weightsPct[1]).toBeCloseTo(0, 9);
    expect(result.payoffsPct[0]).toBeCloseTo(50, 9);
    expect(result.payoffsPct[1]).toBeCloseTo(40, 9);
    expect(result.support).toEqual(['A']);
    expect(result.excludedCertain).toEqual(['B']);
    expect(result.equalizerCount).toBe(1);
  });
});

describe('solveSymmetricZeroSumNash — Fixture E: fully degenerate, all-50 % 3x3 (plan §3.3)', () => {
  const matrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
    ],
  );

  it('every mixture is optimal, but the solver deterministically returns the Bland-rule corner [100,0,0] — NOT the uniform [33.3,33.3,33.3]', () => {
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.valuePct).toBeCloseTo(50, 9);
    result.payoffsPct.forEach((p) => expect(p).toBeCloseTo(50, 9));
    expect(result.excludedCertain).toEqual([]);
    expect(result.equalizerCount).toBe(3);
    expect(result.support).toHaveLength(1);
    expect(result.weightsPct[0]).toBeCloseTo(100, 9);
    expect(result.weightsPct[1]).toBeCloseTo(0, 9);
    expect(result.weightsPct[2]).toBeCloseTo(0, 9);
  });

  it("demonstrates the plan §3.0c warning: NOT being certified-excluded does NOT mean an archetype is in this (or any) equilibrium's support — equalizerCount (3) > support.length (1) is the fragility flag, not the two non-support equalizers themselves", () => {
    const result = solveSymmetricZeroSumNash(matrix);

    // B and C have payoff === value (they are equalizers, i.e. NOT certified
    // excluded: excludedCertain is empty), yet this particular equilibrium
    // gives them weight 0 and they are absent from `support`. Their absence
    // from `excludedCertain` must never be read as "present in some/every
    // equilibrium" — that is exactly the converse the theorem does not give.
    expect(result.excludedCertain).not.toContain('B');
    expect(result.excludedCertain).not.toContain('C');
    expect(result.support).not.toContain('B');
    expect(result.support).not.toContain('C');
    expect(result.equalizerCount).toBeGreaterThan(result.support.length);
  });
});

describe('solveSymmetricZeroSumNash — exclusion-certificate semantics, dedicated (plan §3.0c)', () => {
  it('an archetype whose payoff against the equilibrium is strictly below the game value IS certified excluded (excludedCertain contains it)', () => {
    // Fixture D: B's payoff (40) is strictly below the value (50).
    const matrix = fixtureMatrix(
      ['A', 'B'],
      [
        [0.5, 0.6],
        [0.4, 0.5],
      ],
    );
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.payoffsPct[1]).toBeLessThan(result.valuePct);
    expect(result.excludedCertain).toContain('B');
  });
});

describe('solveSymmetricZeroSumNash — property tests (plan §3.3)', () => {
  const fixtures: Array<[string, PayoffMatrix]> = [
    [
      'rock-paper-scissors',
      fixtureMatrix(
        ['A', 'B', 'C'],
        [
          [0.5, 1, 0],
          [0, 0.5, 1],
          [1, 0, 0.5],
        ],
      ),
    ],
    [
      'weighted rock-paper-scissors',
      fixtureMatrix(
        ['A', 'B', 'C'],
        [
          [0.5, 0.6, 0.45],
          [0.4, 0.5, 0.7],
          [0.55, 0.3, 0.5],
        ],
      ),
    ],
    [
      'popularity paradox',
      fixtureMatrix(
        ['A', 'B', 'C', 'D'],
        [
          [0.5, 1, 0, 0.6],
          [0, 0.5, 1, 0.6],
          [1, 0, 0.5, 0.6],
          [0.4, 0.4, 0.4, 0.5],
        ],
      ),
    ],
    [
      'strict dominance',
      fixtureMatrix(
        ['A', 'B'],
        [
          [0.5, 0.6],
          [0.4, 0.5],
        ],
      ),
    ],
    [
      'fully degenerate',
      fixtureMatrix(
        ['A', 'B', 'C'],
        [
          [0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
        ],
      ),
    ],
  ];

  it.each(fixtures)(
    '%s: valuePct is exactly 50 for a correctly symmetrized input',
    (_label, matrix) => {
      const result = solveSymmetricZeroSumNash(matrix);
      expect(result.valuePct).toBeCloseTo(50, 9);
    },
  );

  it.each(fixtures)('%s: weightsPct sums to 100', (_label, matrix) => {
    const result = solveSymmetricZeroSumNash(matrix);
    const sum = result.weightsPct.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 9);
  });

  it.each(fixtures)('%s: every weight is >= 0', (_label, matrix) => {
    const result = solveSymmetricZeroSumNash(matrix);
    result.weightsPct.forEach((w) => expect(w).toBeGreaterThanOrEqual(-1e-9));
  });

  it.each(fixtures)(
    '%s: every archetype in the support has payoff === value (tolerance PAYOFF_EPSILON_PP)',
    (_label, matrix) => {
      const result = solveSymmetricZeroSumNash(matrix);
      result.support.forEach((id) => {
        const i = result.archetypeIds.indexOf(id);
        expect(Math.abs(result.payoffsPct[i] - result.valuePct)).toBeLessThanOrEqual(
          PAYOFF_EPSILON_PP + 1e-9,
        );
      });
    },
  );

  it.each(fixtures)(
    '%s: no archetype has payoff strictly above the value (equilibrium condition)',
    (_label, matrix) => {
      const result = solveSymmetricZeroSumNash(matrix);
      result.payoffsPct.forEach((p) => expect(p).toBeLessThanOrEqual(result.valuePct + 1e-9));
    },
  );

  it.each(fixtures)('%s: excludedCertain and support are disjoint', (_label, matrix) => {
    const result = solveSymmetricZeroSumNash(matrix);
    result.excludedCertain.forEach((id) => expect(result.support).not.toContain(id));
  });

  it('permutation invariance: excludedCertain is the same SET regardless of archetype order (support may differ under degeneracy)', () => {
    const original = fixtureMatrix(
      ['A', 'B', 'C', 'D'],
      [
        [0.5, 1, 0, 0.6],
        [0, 0.5, 1, 0.6],
        [1, 0, 0.5, 0.6],
        [0.4, 0.4, 0.4, 0.5],
      ],
    );
    // Reverse the archetype order: D, C, B, A.
    const permuted = fixtureMatrix(
      ['D', 'C', 'B', 'A'],
      [
        [0.5, 0.4, 0.4, 0.4],
        [0.6, 0.5, 0, 1],
        [0.6, 1, 0.5, 0],
        [0.6, 0, 1, 0.5],
      ],
    );

    const resultOriginal = solveSymmetricZeroSumNash(original);
    const resultPermuted = solveSymmetricZeroSumNash(permuted);

    expect(new Set(resultOriginal.excludedCertain)).toEqual(
      new Set(resultPermuted.excludedCertain),
    );
  });
});

describe('solveSymmetricZeroSumNash — edge cases (plan §3.3)', () => {
  it('n === 1: a single archetype trivially has 100 % weight, payoff 50, and no exclusions', () => {
    const matrix = fixtureMatrix(['A'], [[0.5]]);
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.weightsPct).toEqual([100]);
    expect(result.payoffsPct[0]).toBeCloseTo(50, 9);
    expect(result.excludedCertain).toEqual([]);
  });

  it('n === 0: empty archetype list yields empty arrays, valuePct 50, status optimal', () => {
    const matrix = fixtureMatrix([], []);
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.archetypeIds).toEqual([]);
    expect(result.weightsPct).toEqual([]);
    expect(result.payoffsPct).toEqual([]);
    expect(result.valuePct).toBe(50);
    expect(result.status).toBe('optimal');
  });

  it('a non-constant-sum input (p[0][1] = p[1][0] = 0.6, summing to 1.2 instead of 1) is reported as status "failed", not silently solved', () => {
    // buildPayoffMatrix can never construct this by design, but
    // solveSymmetricZeroSumNash takes a bare PayoffMatrix and must defend
    // against a future second producer that gets the invariant wrong.
    const matrix = fixtureMatrix(
      ['A', 'B'],
      [
        [0.5, 0.6],
        [0.6, 0.5],
      ],
    );
    const result = solveSymmetricZeroSumNash(matrix);

    expect(result.status).toBe('failed');
  });
});

// ===========================================================================
// Slice A3 — deterministic Monte-Carlo robustness (plan §3.4)
// ===========================================================================

/** Same idea as `fixtureMatrix` above, but with a uniform sample size behind
 *  every off-diagonal pair so `resamplePayoffMatrix` has something to resample
 *  from (games/imputed are load-bearing here, unlike in the Slice A2 tests
 *  above). */
function fixtureMatrixWithGames(
  archetypeIds: string[],
  p: number[][],
  gamesPerPair: number,
): PayoffMatrix {
  const n = archetypeIds.length;
  return {
    archetypeIds,
    p,
    games: p.map((row, i) => row.map((_, j) => (i === j ? 0 : gamesPerPair))),
    imputed: p.map((row) => row.map(() => false)),
    imputedCellSharePct: 0,
    rowCoveragePct: new Array(n).fill(100),
  };
}

// Fixture C (the popularity-paradox case, plan §3.3): rock-paper-scissors on
// A/B/C plus D, which beats all three 60/40. D is the most popular deck by
// share but is certified excluded from every equilibrium (weight 0, payoff
// 40 < value 50). Reused here as the robustness fixture per the plan §3.4
// value table ("Fixture (C)").
const popularityParadoxIds = ['A', 'B', 'C', 'D'];
const popularityParadoxP = [
  [0.5, 1, 0, 0.6],
  [0, 0.5, 1, 0.6],
  [1, 0, 0.5, 0.6],
  [0.4, 0.4, 0.4, 0.5],
];

describe('resamplePayoffMatrix — the single most important property test of this slice (plan §3.4d, step 9)', () => {
  // A mixed fixture: some pairs carry real data, one pair (A vs D) is fully
  // imputed (games 0). If independent per-directional draws were used instead
  // of one draw per UNORDERED pair, this property would fail intermittently
  // as sample size grows -- it must hold on EVERY single resample, not just
  // on average.
  const matrix: PayoffMatrix = {
    archetypeIds: popularityParadoxIds,
    p: popularityParadoxP,
    games: [
      [0, 50, 30, 0],
      [50, 0, 40, 20],
      [30, 40, 0, 25],
      [0, 20, 25, 0],
    ],
    imputed: [
      [false, false, false, true],
      [false, false, false, false],
      [false, false, false, false],
      [true, false, false, false],
    ],
    imputedCellSharePct: 25,
    rowCoveragePct: [66.7, 100, 100, 66.7],
  };

  it('every single resample stays constant-sum: p[i][j] + p[j][i] === 1 for every pair, AND the resolved equilibrium has valuePct === 50 (checked directly via resamplePayoffMatrix, 500 independent draws)', () => {
    const rng = mulberry32(DEFAULT_SEED);
    const n = matrix.archetypeIds.length;
    for (let r = 0; r < 500; r++) {
      const resampled = resamplePayoffMatrix(matrix, rng);

      for (let i = 0; i < n; i++) {
        expect(resampled.p[i][i]).toBe(0.5);
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          expect(resampled.p[i][j] + resampled.p[j][i]).toBeCloseTo(1, 12);
        }
      }

      const result = solveSymmetricZeroSumNash(resampled);
      expect(result.status).toBe('optimal');
      expect(result.valuePct).toBeCloseTo(50, 6);
    }
  });
});

describe('resamplePayoffMatrix — imputed cells are drawn from Beta(1,1), NOT the U-shaped Beta(0.5,0.5) (plan §3.4d)', () => {
  // n=2, single pair, games=0 (fully imputed). Beta(1,1) puts ~10% of its
  // mass in the tails outside [0.05, 0.95]; Beta(0.5,0.5) (U-shaped) puts
  // ~29% there (planner-verified empirical figures, plan §3.4d). This
  // distinguishes the two distributions from outside resamplePayoffMatrix.
  const matrix = fixtureMatrixWithGames(
    ['A', 'B'],
    [
      [0.5, 0.5],
      [0.5, 0.5],
    ],
    0,
  );

  it('mean over 50000 draws is close to 0.5 (honest "unknown", not the U-shaped prior)', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const resampled = resamplePayoffMatrix(matrix, rng);
      sum += resampled.p[0][1];
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('only ~10% of draws fall in the extreme tails (<5% or >95%) -- Beta(0.5,0.5) would put ~29% there', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let extreme = 0;
    for (let i = 0; i < n; i++) {
      const resampled = resamplePayoffMatrix(matrix, rng);
      const v = resampled.p[0][1];
      if (v < 0.05 || v > 0.95) extreme++;
    }
    const pct = (extreme / n) * 100;
    expect(pct).toBeGreaterThan(5);
    expect(pct).toBeLessThan(15);
  });
});

describe('resamplePayoffMatrix — cells WITH data use the Jeffreys posterior Beta(s+0.5, n-s+0.5), s = p*n (plan §3.4d)', () => {
  it('mean over 20000 draws tracks the point estimate, unlike the imputed Beta(1,1) case above', () => {
    // games=1000, p=0.7 -> s=700. Posterior mean (s+0.5)/(n+1) ~= 0.7.
    const matrix = fixtureMatrixWithGames(
      ['A', 'B'],
      [
        [0.5, 0.7],
        [0.3, 0.5],
      ],
      1000,
    );
    const rng = mulberry32(1);
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const resampled = resamplePayoffMatrix(matrix, rng);
      sum += resampled.p[0][1];
    }
    expect(Math.abs(sum / n - 0.7)).toBeLessThan(0.02);
  });
});

describe('equilibriumRobustness — binding value table (plan §3.4, Fixture C)', () => {
  it('with 100000 games in every cell (confident data), D is excluded in 100% of resamples, A/B/C in 0%, and exactSupportRatePct is 100%', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 100000);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);
    const result = equilibriumRobustness(matrix, pointEstimate, { resamples: 500 });

    const byId = new Map(result.perArchetype.map((a) => [a.archetypeId, a]));
    expect(byId.get('D')!.exclusionRatePct).toBeCloseTo(100, 0);
    expect(byId.get('A')!.exclusionRatePct).toBeCloseTo(0, 0);
    expect(byId.get('B')!.exclusionRatePct).toBeCloseTo(0, 0);
    expect(byId.get('C')!.exclusionRatePct).toBeCloseTo(0, 0);
    expect(result.exactSupportRatePct).toBeCloseTo(100, 0);
  });

  it('with only 20 games in every cell (thin data), the exact support becomes fragile but D is not immediately certain to be excluded -- both are MEASURED properties, asserted as bounds here (plan §3.4: the implementer pins the exact regression value after a first observed run, not the tester)', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 20);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);
    const result = equilibriumRobustness(matrix, pointEstimate, { resamples: 500 });

    const dRate = result.perArchetype.find((a) => a.archetypeId === 'D')!.exclusionRatePct;
    expect(dRate).toBeGreaterThan(0);
    expect(dRate).toBeLessThan(100);
    expect(result.exactSupportRatePct).toBeLessThan(100);
  });

  it('the same seed produces a bit-identical result twice', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 20);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);

    const resultA = equilibriumRobustness(matrix, pointEstimate, { resamples: 200, seed: 7 });
    const resultB = equilibriumRobustness(matrix, pointEstimate, { resamples: 200, seed: 7 });

    expect(resultA).toEqual(resultB);
  });

  it('seed 1 and seed 2 produce different results: at least one exclusionRatePct differs', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 20);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);

    const resultSeed1 = equilibriumRobustness(matrix, pointEstimate, { resamples: 200, seed: 1 });
    const resultSeed2 = equilibriumRobustness(matrix, pointEstimate, { resamples: 200, seed: 2 });

    const ratesSeed1 = resultSeed1.perArchetype.map((a) => a.exclusionRatePct);
    const ratesSeed2 = resultSeed2.perArchetype.map((a) => a.exclusionRatePct);
    expect(ratesSeed1).not.toEqual(ratesSeed2);
  });

  it('a fully imputed matrix (no data anywhere) has imputedCellSharePct 100 and does NOT confidently exclude any archetype (every exclusionRatePct strictly between 0 and 100)', () => {
    const matrix = buildPayoffMatrix(
      [
        { archetypeId: 'A', sharePct: 34 },
        { archetypeId: 'B', sharePct: 33 },
        { archetypeId: 'C', sharePct: 33 },
      ],
      [],
    );
    expect(matrix.imputedCellSharePct).toBe(100);

    const pointEstimate = solveSymmetricZeroSumNash(matrix);
    const result = equilibriumRobustness(matrix, pointEstimate, { resamples: 500 });

    for (const archetype of result.perArchetype) {
      expect(archetype.exclusionRatePct).toBeGreaterThan(0);
      expect(archetype.exclusionRatePct).toBeLessThan(100);
    }
  });

  it('resamples: 0 returns all-zero rates for every archetype, exactSupportRatePct 0, and does not throw', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 20);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);

    let result: RobustnessResult | undefined;
    expect(() => {
      result = equilibriumRobustness(matrix, pointEstimate, { resamples: 0 });
    }).not.toThrow();

    expect(result!.perArchetype).toHaveLength(4);
    result!.perArchetype.forEach((a) => {
      expect(a.exclusionRatePct).toBe(0);
      expect(a.certainExclusionRatePct).toBe(0);
    });
    expect(result!.exactSupportRatePct).toBe(0);
  });

  it('certainExclusionRatePct never exceeds exclusionRatePct for any archetype (the certificate is the strong statement, plan §3.4)', () => {
    const matrix = fixtureMatrixWithGames(popularityParadoxIds, popularityParadoxP, 20);
    const pointEstimate = solveSymmetricZeroSumNash(matrix);
    const result = equilibriumRobustness(matrix, pointEstimate, { resamples: 500 });

    result.perArchetype.forEach((a) => {
      expect(a.certainExclusionRatePct).toBeLessThanOrEqual(a.exclusionRatePct + 1e-9);
    });
  });
});

describe('equilibriumRobustness — default constants (plan §3.4)', () => {
  it('DEFAULT_RESAMPLES is 2000 and DEFAULT_SEED is 20260902', () => {
    expect(DEFAULT_RESAMPLES).toBe(2000);
    expect(DEFAULT_SEED).toBe(20260902);
  });
});

describe('monteCarloSePct — binding value table (plan §3.4)', () => {
  it('monteCarloSePct(78, 2000) is close to 0.926 (tolerance 1e-3)', () => {
    expect(Math.abs(monteCarloSePct(78, 2000) - 0.926)).toBeLessThan(1e-3);
  });

  it('monteCarloSePct(78, 10000) is close to 0.414 (tolerance 1e-3)', () => {
    expect(Math.abs(monteCarloSePct(78, 10000) - 0.414)).toBeLessThan(1e-3);
  });

  it('monteCarloSePct(100, 500) is exactly 0 (no variance at a certain rate)', () => {
    expect(monteCarloSePct(100, 500)).toBe(0);
  });

  it('matches the formula sqrt(p(1-p)/R) * 100 exactly', () => {
    const ratePct = 63.4;
    const resamples = 1234;
    const p = ratePct / 100;
    const expected = Math.sqrt((p * (1 - p)) / resamples) * 100;
    expect(monteCarloSePct(ratePct, resamples)).toBeCloseTo(expected, 9);
  });
});

// ===========================================================================
// Slice A3 — replicator fitness and week-over-week trend direction (plan §3.5)
// ===========================================================================

describe('replicatorStep — exported constant (plan §3.5)', () => {
  it('REPLICATOR_STABLE_BAND_PP is 1', () => {
    expect(REPLICATOR_STABLE_BAND_PP).toBe(1);
  });
});

describe('replicatorStep — binding value table (plan §3.5, Fixture A, sharePct = [50, 30, 20])', () => {
  const matrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 1, 0],
      [0, 0.5, 1],
      [1, 0, 0.5],
    ],
  );

  it('produces fitnessPct [55, 35, 60], meanFitnessPct EXACTLY 50, growthPct [10, -30, 20], projectedSharePct [55, 21, 24]', () => {
    const step = replicatorStep(matrix, [50, 30, 20]);

    expect(step.fitnessPct[0]).toBeCloseTo(55, 9);
    expect(step.fitnessPct[1]).toBeCloseTo(35, 9);
    expect(step.fitnessPct[2]).toBeCloseTo(60, 9);
    expect(step.meanFitnessPct).toBeCloseTo(50, 9);
    expect(step.growthPct[0]).toBeCloseTo(10, 9);
    expect(step.growthPct[1]).toBeCloseTo(-30, 9);
    expect(step.growthPct[2]).toBeCloseTo(20, 9);
    expect(step.projectedSharePct[0]).toBeCloseTo(55, 9);
    expect(step.projectedSharePct[1]).toBeCloseTo(21, 9);
    expect(step.projectedSharePct[2]).toBeCloseTo(24, 9);
  });
});

describe('replicatorStep — meanFitnessPct is EXACTLY 50 for any share distribution on a constant-sum matrix (plan §3.0e, parameter-free growth)', () => {
  const rpsMatrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 1, 0],
      [0, 0.5, 1],
      [1, 0, 0.5],
    ],
  );
  const paradoxMatrix = fixtureMatrix(popularityParadoxIds, popularityParadoxP);

  it.each([
    ['rock-paper-scissors', rpsMatrix, [50, 30, 20]],
    ['rock-paper-scissors', rpsMatrix, [100, 0, 0]],
    ['rock-paper-scissors', rpsMatrix, [1, 1, 1]],
    ['rock-paper-scissors', rpsMatrix, [33.3, 33.3, 33.4]],
    ['popularity paradox', paradoxMatrix, [40, 20, 20, 20]],
    ['popularity paradox', paradoxMatrix, [10, 10, 10, 70]],
  ] as Array<[string, PayoffMatrix, number[]]>)(
    '%s with sharePct=%j -> meanFitnessPct === 50',
    (_label, matrix, sharePct) => {
      const step = replicatorStep(matrix, sharePct);
      expect(step.meanFitnessPct).toBeCloseTo(50, 9);
    },
  );

  it.each([
    ['rock-paper-scissors', rpsMatrix, [50, 30, 20]],
    ['popularity paradox', paradoxMatrix, [40, 20, 20, 20]],
  ] as Array<[string, PayoffMatrix, number[]]>)(
    '%s: projectedSharePct sums to 100',
    (_label, matrix, sharePct) => {
      const step = replicatorStep(matrix, sharePct);
      const sum = step.projectedSharePct.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 9);
    },
  );
});

describe('replicatorStep — the equilibrium is a fixed point of the replicator dynamic (plan §3.5, consistency test against Slice A2)', () => {
  it('feeding the popularity-paradox equilibrium weights back into replicatorStep reproduces them: support members have growthPct 0 and projectedSharePct === sharePct', () => {
    const matrix = fixtureMatrix(popularityParadoxIds, popularityParadoxP);
    const equilibrium = solveSymmetricZeroSumNash(matrix);

    const step = replicatorStep(matrix, equilibrium.weightsPct);

    equilibrium.support.forEach((id) => {
      const i = matrix.archetypeIds.indexOf(id);
      expect(step.growthPct[i]).toBeCloseTo(0, 6);
      expect(step.projectedSharePct[i]).toBeCloseTo(equilibrium.weightsPct[i], 6);
    });
  });
});

describe('replicatorStep — an archetype with sharePct 0 keeps projectedSharePct 0 (the replicator never creates new strategies, plan §3.5)', () => {
  it('with sharePct [100, 0, 0], archetype B (index 1) stays at projectedSharePct 0', () => {
    const matrix = fixtureMatrix(
      ['A', 'B', 'C'],
      [
        [0.5, 1, 0],
        [0, 0.5, 1],
        [1, 0, 0.5],
      ],
    );
    const step = replicatorStep(matrix, [100, 0, 0]);
    expect(step.projectedSharePct[1]).toBeCloseTo(0, 9);
  });
});

describe('replicatorStep — empty matrix (plan §3.5)', () => {
  it('n === 0 returns empty arrays for every field', () => {
    const matrix = fixtureMatrix([], []);
    const step = replicatorStep(matrix, []);
    expect(step.archetypeIds).toEqual([]);
    expect(step.fitnessPct).toEqual([]);
    expect(step.growthPct).toEqual([]);
    expect(step.projectedSharePct).toEqual([]);
  });
});

describe('fitnessTrend — binding value table (plan §3.5, Fixture A, previous=[100/3,100/3,100/3], current=[50,30,20], stableBandPp=1)', () => {
  const matrix = fixtureMatrix(
    ['A', 'B', 'C'],
    [
      [0.5, 1, 0],
      [0, 0.5, 1],
      [1, 0, 0.5],
    ],
  );
  const previous = [100 / 3, 100 / 3, 100 / 3];
  const current = [50, 30, 20];

  it('A: previousFitnessPct 50, fitnessPct 55, fitnessDeltaPp +5, direction rising', () => {
    const trend = fitnessTrend(matrix, current, previous, { stableBandPp: 1 });
    const a = trend.find((t) => t.archetypeId === 'A')!;
    expect(a.previousFitnessPct).toBeCloseTo(50, 6);
    expect(a.fitnessPct).toBeCloseTo(55, 6);
    expect(a.fitnessDeltaPp).toBeCloseTo(5, 6);
    expect(a.direction).toBe('rising');
  });

  it('B: previousFitnessPct 50, fitnessPct 35, fitnessDeltaPp -15, direction falling', () => {
    const trend = fitnessTrend(matrix, current, previous, { stableBandPp: 1 });
    const b = trend.find((t) => t.archetypeId === 'B')!;
    expect(b.previousFitnessPct).toBeCloseTo(50, 6);
    expect(b.fitnessPct).toBeCloseTo(35, 6);
    expect(b.fitnessDeltaPp).toBeCloseTo(-15, 6);
    expect(b.direction).toBe('falling');
  });

  it('C: previousFitnessPct 50, fitnessPct 60, fitnessDeltaPp +10, direction rising -- AND observedShareDeltaPp is NEGATIVE (share fell from 33.3 to 20) while direction is rising: this is exactly the "theory said grow, reality: shrank" divergence the plan documents observedShareDeltaPp for', () => {
    const trend = fitnessTrend(matrix, current, previous, { stableBandPp: 1 });
    const c = trend.find((t) => t.archetypeId === 'C')!;
    expect(c.previousFitnessPct).toBeCloseTo(50, 6);
    expect(c.fitnessPct).toBeCloseTo(60, 6);
    expect(c.fitnessDeltaPp).toBeCloseTo(10, 6);
    expect(c.direction).toBe('rising');
    expect(c.observedShareDeltaPp!).toBeLessThan(0);
  });
});

describe('fitnessTrend — cold start: previousSharePct entirely null (plan §3.5, "fewer than one completed period", a regular state not an error)', () => {
  it('every archetype gets previousFitnessPct null, fitnessDeltaPp null, direction unknown', () => {
    const matrix = fixtureMatrix(
      ['A', 'B', 'C'],
      [
        [0.5, 1, 0],
        [0, 0.5, 1],
        [1, 0, 0.5],
      ],
    );
    const trend = fitnessTrend(matrix, [50, 30, 20], [null, null, null]);

    trend.forEach((t) => {
      expect(t.previousFitnessPct).toBeNull();
      expect(t.fitnessDeltaPp).toBeNull();
      expect(t.observedShareDeltaPp).toBeNull();
      expect(t.direction).toBe('unknown');
    });
  });
});

describe("fitnessTrend — 'unknown' is a fourth direction beyond the spec's three (plan's deliberate Discrepancy 3, plan §3.5)", () => {
  it('the direction values used across the golden table and the cold-start case cover rising, falling, and unknown -- confirming FitnessDirection is not restricted to the spec-literal three', () => {
    const matrix = fixtureMatrix(
      ['A', 'B', 'C'],
      [
        [0.5, 1, 0],
        [0, 0.5, 1],
        [1, 0, 0.5],
      ],
    );
    const withPrevious = fitnessTrend(matrix, [50, 30, 20], [100 / 3, 100 / 3, 100 / 3]);
    const withoutPrevious = fitnessTrend(matrix, [50, 30, 20], [null, null, null]);

    const directions = new Set([
      ...withPrevious.map((t) => t.direction),
      ...withoutPrevious.map((t) => t.direction),
    ]);
    expect(directions.has('rising')).toBe(true);
    expect(directions.has('falling')).toBe(true);
    expect(directions.has('unknown')).toBe(true);
  });
});

describe('fitnessTrend — stableBandPp boundary is inclusive (plan §3.5)', () => {
  // n=2 matrix engineered so archetype 0's fitnessDeltaPp is an exact,
  // hand-verifiable number for a given previous/current share pair:
  // p[0][1] = 0 (0 always loses to 1), so
  // fitnessPct[0](x) = 100 * 0.5 * x0, and
  // fitnessDeltaPp[0] = 50 * (xCur0 - xPrev0) exactly (both vectors already
  // sum to 100, so renormalisation is a no-op here).
  const matrix = fixtureMatrix(
    ['A', 'B'],
    [
      [0.5, 0],
      [1, 0.5],
    ],
  );
  const previous = [50, 50];

  it('delta of exactly +1.0pp at stableBandPp=1 is "stable" (inclusive boundary, explicitly tested)', () => {
    // xCur0 - xPrev0 = 1.0 / 50 = 0.02 -> currentSharePct = [52, 48]
    const trend = fitnessTrend(matrix, [52, 48], previous, { stableBandPp: 1 });
    const a = trend.find((t) => t.archetypeId === 'A')!;
    expect(a.fitnessDeltaPp).toBeCloseTo(1.0, 9);
    expect(a.direction).toBe('stable');
  });

  it('delta of +0.4pp at stableBandPp=1 is "stable" (well within the band)', () => {
    // xCur0 - xPrev0 = 0.4 / 50 = 0.008 -> currentSharePct = [50.8, 49.2]
    const trend = fitnessTrend(matrix, [50.8, 49.2], previous, { stableBandPp: 1 });
    const a = trend.find((t) => t.archetypeId === 'A')!;
    expect(a.fitnessDeltaPp).toBeCloseTo(0.4, 9);
    expect(a.direction).toBe('stable');
  });

  it('delta of +1.01pp at stableBandPp=1 is "rising" (just past the boundary)', () => {
    // xCur0 - xPrev0 = 1.01 / 50 = 0.0202 -> currentSharePct = [52.02, 47.98]
    const trend = fitnessTrend(matrix, [52.02, 47.98], previous, { stableBandPp: 1 });
    const a = trend.find((t) => t.archetypeId === 'A')!;
    expect(a.fitnessDeltaPp).toBeCloseTo(1.01, 9);
    expect(a.direction).toBe('rising');
  });
});

describe("fitnessTrend — naming boundary against replicatorStep (plan §3.5): fitnessTrend is evaluated on completed-ISO-week shares, independently of replicatorStep's daily-window shares, even against the SAME matrix", () => {
  it('feeding fitnessTrend the daily-window share vector as "current" reproduces exactly replicatorStep\'s fitnessPct for that vector -- the two functions share the same underlying formula (f_i(x) = sum_j x_j P_ij), they just get fed different windows by the caller', () => {
    const matrix = fixtureMatrix(
      ['A', 'B', 'C'],
      [
        [0.5, 1, 0],
        [0, 0.5, 1],
        [1, 0, 0.5],
      ],
    );
    const dailyWindowShare = [50, 30, 20];

    const daily = replicatorStep(matrix, dailyWindowShare);
    const trend = fitnessTrend(matrix, dailyWindowShare, [null, null, null]);

    matrix.archetypeIds.forEach((id, i) => {
      const trendEntry = trend.find((t) => t.archetypeId === id)!;
      expect(trendEntry.fitnessPct).toBeCloseTo(daily.fitnessPct[i], 9);
    });
  });
});
