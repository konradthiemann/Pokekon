// Dependency-free Phase-II primal simplex for a standard-form LP (plan
// .claude/plans/meta-game-theory-layer.md §3.0/§3.1, Slice A1). This is the
// single LP implementation in the repo — everything downstream in Spec 6
// (the symmetric zero-sum Nash equilibrium, §3.3, and its Monte-Carlo
// robustness check, §3.4) is built on it. No second implementation may be
// added elsewhere.

export interface LpResult {
  status: 'optimal' | 'unbounded' | 'iterationLimit';
  /** Objective value at the optimum; 0 when the status is not 'optimal'. */
  objective: number;
  /** Primal solution, length n; all zeros when the status is not 'optimal'. */
  x: number[];
  /** Pivots performed — exposed so the job can log/limit real-world cost. */
  iterations: number;
}

function validateInput(c: number[], A: number[][], b: number[]): void {
  if (!Array.isArray(c) || c.length === 0 || !c.every(Number.isFinite)) {
    throw new Error('solveStandardFormLp: c must be a non-empty array of finite numbers');
  }
  if (!Array.isArray(A) || !Array.isArray(b) || A.length !== b.length) {
    throw new Error('solveStandardFormLp: A and b must be arrays with the same number of rows');
  }
  for (const row of A) {
    if (!Array.isArray(row) || row.length !== c.length || !row.every(Number.isFinite)) {
      throw new Error(
        `solveStandardFormLp: every row of A must have length ${c.length} (one entry per c) and finite entries`,
      );
    }
  }
  for (const bi of b) {
    if (!Number.isFinite(bi)) {
      throw new Error('solveStandardFormLp: b must contain only finite numbers');
    }
    // b >= 0 is what makes the origin a feasible basic solution (plan §3.0b)
    // — that is the whole reason this solver can skip Phase I. A negative
    // entry would silently solve a different (infeasible-at-origin) LP, so
    // it is rejected loudly instead (same stance as zForConfidence in
    // wilsonInterval.ts: a silently wrong LP is worse than a loud failure).
    if (bi < 0) {
      throw new Error('solveStandardFormLp: b must be non-negative (no Phase I is implemented)');
    }
  }
}

/** In-place Gauss-Jordan elimination around tableau[pivotRow][pivotCol]. */
function pivot(tableau: number[][], pivotRow: number, pivotCol: number): void {
  const pivotVal = tableau[pivotRow][pivotCol];
  const width = tableau[pivotRow].length;

  for (let j = 0; j < width; j++) {
    tableau[pivotRow][j] /= pivotVal;
  }

  for (let i = 0; i < tableau.length; i++) {
    if (i === pivotRow) continue;
    const factor = tableau[i][pivotCol];
    if (factor === 0) continue;
    for (let j = 0; j < width; j++) {
      tableau[i][j] -= factor * tableau[pivotRow][j];
    }
  }
}

/**
 * Phase-II primal simplex for the STANDARD-FORM LP
 *   maximise c·x   subject to   Ax <= b,  x >= 0,   with b >= 0.
 * b >= 0 makes the origin a feasible basic solution (all slacks basic at
 * b), so no Phase I is needed (plan §3.0b) — a reason no Phase-I fallback
 * exists in this file, not an oversight. Every call site in this repo (the
 * Dantzig-substituted symmetric zero-sum LP, plan §3.0b) constructs A with
 * b = 1, which structurally satisfies this precondition.
 *
 * Bland's rule (lowest index for both the entering column and, on a ratio
 * tie, the leaving row's basic variable) picks every pivot. This is
 * DETERMINISM, not a speed optimisation: degeneracy is the NORMAL case here
 * (a symmetrized matchup matrix is full of exact 50 % cells, plan §3.0c), and
 * the same input must always yield the same vertex — otherwise the
 * Monte-Carlo robustness figures (plan §3.4) would not be reproducible from
 * their stored seed. Bland's rule also happens to guarantee termination
 * under degeneracy (no cycling), which is a welcome side effect, not the
 * reason it was chosen.
 *
 * Throws on shape mismatch, on a negative entry in b and on non-finite
 * input: a silently wrong LP would be worse than a loud failure (same
 * stance as zForConfidence in wilsonInterval.ts).
 */
export function solveStandardFormLp(
  c: number[],
  A: number[][],
  b: number[],
  opts?: { maxIterations?: number; epsilon?: number },
): LpResult {
  validateInput(c, A, b);

  const n = c.length;
  const m = A.length;
  const epsilon = opts?.epsilon ?? 1e-9;
  const maxIterations = opts?.maxIterations ?? 200 * (n + m);

  const rhsCol = n + m;
  const numCols = n + m + 1;

  // Tableau: m constraint rows (one slack variable per row) + 1 objective
  // row. Basis starts at the slacks (index n..n+m-1), values = b — the
  // Phase-I-free starting vertex described above.
  const tableau: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array<number>(numCols).fill(0);
    for (let j = 0; j < n; j++) row[j] = A[i][j];
    row[n + i] = 1;
    row[rhsCol] = b[i];
    tableau.push(row);
  }
  const objRow = new Array<number>(numCols).fill(0);
  for (let j = 0; j < n; j++) objRow[j] = -c[j];
  tableau.push(objRow);
  const objRowIndex = m;

  const basis: number[] = [];
  for (let i = 0; i < m; i++) basis.push(n + i);

  const zeroX = (): number[] => new Array<number>(n).fill(0);

  let iterations = 0;
  while (iterations < maxIterations) {
    // Bland's rule, entering: smallest column index with a negative reduced
    // cost. None left -> optimal.
    let enterCol = -1;
    for (let j = 0; j < n + m; j++) {
      if (tableau[objRowIndex][j] < -epsilon) {
        enterCol = j;
        break;
      }
    }
    if (enterCol === -1) {
      const x = zeroX();
      for (let i = 0; i < m; i++) {
        if (basis[i] < n) x[basis[i]] = tableau[i][rhsCol];
      }
      const objective = c.reduce((sum, cj, j) => sum + cj * x[j], 0);
      return { status: 'optimal', objective, x, iterations };
    }

    // Minimum-ratio test; Bland's rule, leaving: on a ratio tie, prefer the
    // row whose basic variable has the smallest index (plan §3.1: this is
    // what makes the degenerate golden test terminate deterministically).
    let leavingRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const coef = tableau[i][enterCol];
      if (coef <= epsilon) continue;
      const ratio = tableau[i][rhsCol] / coef;
      if (leavingRow === -1 || ratio < minRatio - epsilon) {
        minRatio = ratio;
        leavingRow = i;
      } else if (Math.abs(ratio - minRatio) <= epsilon && basis[i] < basis[leavingRow]) {
        leavingRow = i;
      }
    }

    // No row bounds the entering column's growth -> unbounded. Per plan
    // §3.0b this cannot happen for a correctly built payoff LP (every column
    // has a positive diagonal entry), so it is a real error case, not a
    // normal outcome, when this solver is used as intended.
    if (leavingRow === -1) {
      return { status: 'unbounded', objective: 0, x: zeroX(), iterations };
    }

    pivot(tableau, leavingRow, enterCol);
    basis[leavingRow] = enterCol;
    iterations++;
  }

  return { status: 'iterationLimit', objective: 0, x: zeroX(), iterations };
}
