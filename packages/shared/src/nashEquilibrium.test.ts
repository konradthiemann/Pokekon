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
  type PayoffMatrix,
} from './nashEquilibrium.js';
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
