// Golden tests for the dependency-free Phase-II simplex LP solver (plan
// .claude/plans/meta-game-theory-layer.md §3.1, Slice A1). `./simplex.ts`
// does not exist yet — this file pins the exact contract (function
// signature, `LpResult` shape, the seven binding table rows) that
// @implementer must satisfy. Everything downstream in Spec 6 (the
// symmetric zero-sum Nash equilibrium, §3.3) is built on this solver, so
// this is the foundation slice: no second LP implementation may ever
// appear anywhere else in the repo.
import { describe, it, expect } from 'vitest';
import { solveStandardFormLp } from './simplex.js';

describe('solveStandardFormLp — golden LPs (plan §3.1)', () => {
  it('row 1: two independent box constraints (max x1+x2, x1<=1, x2<=1) -> objective 2, x=[1,1]', () => {
    const result = solveStandardFormLp(
      [1, 1],
      [
        [1, 0],
        [0, 1],
      ],
      [1, 1],
    );

    expect(result.status).toBe('optimal');
    expect(result.objective).toBeCloseTo(2, 9);
    expect(result.x).toHaveLength(2);
    expect(result.x[0]).toBeCloseTo(1, 9);
    expect(result.x[1]).toBeCloseTo(1, 9);
  });

  it('row 2: Wyndor Glass Co. textbook LP (max 3x+5y, x<=4, 2y<=12, 3x+2y<=18) -> objective 36, x=[2,6]', () => {
    // Standard-form rows: x<=4 -> [1,0]; 2y<=12 -> [0,2]; 3x+2y<=18 -> [3,2].
    const result = solveStandardFormLp(
      [3, 5],
      [
        [1, 0],
        [0, 2],
        [3, 2],
      ],
      [4, 12, 18],
    );

    expect(result.status).toBe('optimal');
    expect(result.objective).toBeCloseTo(36, 9);
    expect(result.x[0]).toBeCloseTo(2, 9);
    expect(result.x[1]).toBeCloseTo(6, 9);

    // Constraint check from the plan (§3.1): 3*2+5*6=36, 2<=4, 2*6=12<=12, 3*2+2*6=18<=18.
    const [x, y] = result.x;
    expect(x).toBeLessThanOrEqual(4 + 1e-9);
    expect(2 * y).toBeLessThanOrEqual(12 + 1e-9);
    expect(3 * x + 2 * y).toBeLessThanOrEqual(18 + 1e-9);
  });

  it('row 3: unbounded direction (max x, 0*x<=1) -> status unbounded, objective 0, x=[0]', () => {
    const result = solveStandardFormLp([1], [[0]], [1]);

    expect(result.status).toBe('unbounded');
    // Per the LpResult contract: objective is 0 and x is all zeros when
    // status is not 'optimal'.
    expect(result.objective).toBe(0);
    expect(result.x).toEqual([0]);
  });

  it('row 4: zero objective over a feasible region -> objective 0, x=[0,0] (origin, already feasible)', () => {
    const result = solveStandardFormLp(
      [0, 0],
      [
        [1, 0],
        [0, 1],
      ],
      [1, 1],
    );

    expect(result.status).toBe('optimal');
    expect(result.objective).toBe(0);
    expect(result.x[0]).toBeCloseTo(0, 9);
    expect(result.x[1]).toBeCloseTo(0, 9);
  });

  it('row 5: degenerate ties (duplicate binding constraints) terminate deterministically via Bland’s rule -> objective 1, finite iterations', () => {
    // max x1+x2 s.t. x1+x2<=1 (twice, duplicated) and x1<=1. The optimum
    // (objective 1) is attained along the whole edge x1+x2=1, x1 in [0,1] --
    // deliberately non-unique so this test only pins the objective value and
    // termination, not a specific vertex (the plan's table does not specify
    // x for this row; only "objective 1, terminiert (Bland), iterations endlich").
    const result = solveStandardFormLp(
      [1, 1],
      [
        [1, 1],
        [1, 1],
        [1, 0],
      ],
      [1, 1, 1],
    );

    expect(result.status).toBe('optimal');
    expect(result.objective).toBeCloseTo(1, 9);
    expect(Number.isFinite(result.iterations)).toBe(true);
    expect(result.iterations).toBeGreaterThanOrEqual(0);

    // Feasibility of the returned vertex, regardless of which optimal vertex
    // Bland's rule happens to land on.
    const [x1, x2] = result.x;
    expect(x1).toBeGreaterThanOrEqual(-1e-9);
    expect(x2).toBeGreaterThanOrEqual(-1e-9);
    expect(x1 + x2).toBeLessThanOrEqual(1 + 1e-9);
    expect(x1).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('solveStandardFormLp — defensive throws (plan §3.1 rows 6-7)', () => {
  it('row 6: a negative entry in b throws (the origin would not be feasible, breaking the no-Phase-I precondition)', () => {
    expect(() => solveStandardFormLp([1], [[1]], [-1])).toThrow();
  });

  it('row 7: an A row with a length that does not match c throws (shape mismatch)', () => {
    expect(() =>
      solveStandardFormLp(
        [1, 1],
        [
          [1, 1],
          [1], // wrong length: c has 2 entries, this row has 1
        ],
        [1, 1],
      ),
    ).toThrow();
  });
});
