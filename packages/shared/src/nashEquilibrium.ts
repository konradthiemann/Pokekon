// Payoff-matrix construction and the symmetric zero-sum Nash equilibrium
// solver for the meta-game-theory layer (plan
// .claude/plans/meta-game-theory-layer.md §3.0/§3.2/§3.3, Slice A2). Reuses
// Slice A1's `solveStandardFormLp` (./simplex.ts) as the single LP
// implementation in the repo — no second solver lives here.
import { solveStandardFormLp } from './simplex.js';
import type { MatchupCellLike } from './wilsonInterval.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// zeroSumWinRate (plan §3.0a / §3.2)
// ---------------------------------------------------------------------------

/**
 * ZERO-SUM win rate: (wins + ties/2) / (wins + losses + ties). Returns null
 * when no game was played.
 *
 * This is NOT tournamentWinRate() from winRate.ts and must never replace it.
 * The tournament convention (a tie is a THIRD of a win) deliberately destroys
 * value: p_ij + p_ji = 1 - t/(3n) < 1, so the matchup matrix is not a
 * constant-sum game and the minimax theorem does not apply to it (plan
 * §3.0a). The half-tie convention restores p_ij + p_ji = 1 exactly, for ANY
 * tie-weighting convention the underlying wins/losses/ties came from — the
 * plan proves that for p = (w + k·t)/n (any weight k), the symmetrization
 * (1 + p_ij - p_ji) / 2 always collapses to (w + t/2)/n. So there is no open
 * question of "which tie convention does the source use" for this layer: the
 * symmetrized value is independent of it.
 *
 * It lives in THIS file, not in winRate.ts, so nobody can pick the wrong one
 * by autocomplete.
 */
export function zeroSumWinRate(wins: number, losses: number, ties = 0): number | null {
  const safeWins = Number.isFinite(wins) && wins > 0 ? wins : 0;
  const safeLosses = Number.isFinite(losses) && losses > 0 ? losses : 0;
  const safeTies = Number.isFinite(ties) && ties > 0 ? ties : 0;
  const n = safeWins + safeLosses + safeTies;
  if (n === 0) return null;
  return (safeWins + safeTies / 2) / n;
}

// ---------------------------------------------------------------------------
// buildPayoffMatrix (plan §3.2)
// ---------------------------------------------------------------------------

export interface PayoffMatrix {
  archetypeIds: string[];
  /** p[i][j] = probability that i beats j, in [0,1]. Guaranteed by
   *  construction: p[i][j] + p[j][i] === 1 and p[i][i] === 0.5. */
  p: number[][];
  /** Sample size behind the unordered pair {i,j}; 0 when imputed. Symmetric. */
  games: number[][];
  /** true where the cell carries NO data and was imputed as 0.5. Symmetric,
   *  false on the diagonal (the mirror is definitional, not imputed — same
   *  stance as fieldWinRate.ts:132-139). */
  imputed: boolean[][];
  /** Share of the n*(n-1) off-diagonal cells that were imputed, 1 decimal. */
  imputedCellSharePct: number;
  /** Per archetype: opponent-share-weighted coverage of its own row, 1 decimal.
   *  DELIBERATELY NOT the same number as FieldScore.coveragePct — that one
   *  includes the mirror and normalises over the total share (fieldWinRate.ts
   *  :58-64). This one excludes the mirror. Documented in docs/data-types.md. */
  rowCoveragePct: number[];
}

/** Resolves one unordered archetype pair {idI, idJ} to p[i][j] (from idI's
 *  perspective), the sample size behind it and whether it was imputed, per
 *  the plan's five-row precedence table (§3.2, first match wins). A cell is
 *  only treated as carrying a usable directed win rate when its `total` is
 *  positive — same stance as `matchupCellInterval` (wilsonInterval.ts:199),
 *  which treats a non-positive total as "no data at all" regardless of
 *  whether a cell object happens to exist in the array. */
function resolveUnorderedPairPayoff(
  idI: string,
  idJ: string,
  cellMap: Map<string, MatchupCellLike>,
): { pIJ: number; games: number; imputed: boolean } {
  const forward = cellMap.get(`${idI}|${idJ}`);
  const backward = cellMap.get(`${idJ}|${idI}`);

  // Row 1: the forward cell (i,j) carries raw counters with at least one
  // decisive/tied game.
  if (forward?.wins !== undefined && forward?.losses !== undefined) {
    const w = forward.wins;
    const l = forward.losses;
    const t = forward.ties ?? 0;
    if (w + l + t > 0) {
      return { pIJ: zeroSumWinRate(w, l, t)!, games: w + l + t, imputed: false };
    }
  }

  // Row 2: only the reverse cell (j,i) carries counters.
  if (backward?.wins !== undefined && backward?.losses !== undefined) {
    const w = backward.wins;
    const l = backward.losses;
    const t = backward.ties ?? 0;
    if (w + l + t > 0) {
      return { pIJ: 1 - zeroSumWinRate(w, l, t)!, games: w + l + t, imputed: false };
    }
  }

  const forwardUsable = forward !== undefined && forward.total > 0;
  const backwardUsable = backward !== undefined && backward.total > 0;

  // Row 3: both directed win-rate percentages present (no counters on either
  // side) -> symmetrize from the percentages directly.
  if (forwardUsable && backwardUsable) {
    const pIJ = (1 + forward!.winRate / 100 - backward!.winRate / 100) / 2;
    return { pIJ, games: Math.max(forward!.total, backward!.total), imputed: false };
  }

  // Row 4: only one directed win-rate percentage present. This is the one
  // precedence row where the tournament-tie dent cannot be repaired (no
  // counters, no opposite direction to symmetrize against) — it does not
  // occur in today's production path (routes/meta.ts:220-228 always supplies
  // counters) but is fully specified per the plan.
  if (forwardUsable) {
    return { pIJ: forward!.winRate / 100, games: forward!.total, imputed: false };
  }
  if (backwardUsable) {
    return { pIJ: 1 - backward!.winRate / 100, games: backward!.total, imputed: false };
  }

  // Row 5: no usable data in either direction -> imputed as exactly 0.5.
  return { pIJ: 0.5, games: 0, imputed: true };
}

/**
 * Build the constant-sum payoff matrix for a set of archetypes from the
 * directed matchup cells the API already produces (routes/meta.ts:220-228).
 * `sharePct` is only used for rowCoveragePct; the equilibrium itself does NOT
 * depend on the observed shares — that independence is the whole point of the
 * comparison "share vs equilibrium weight".
 */
export function buildPayoffMatrix(
  archetypes: { archetypeId: string; sharePct: number }[],
  cells: MatchupCellLike[],
): PayoffMatrix {
  const archetypeIds = archetypes.map((a) => a.archetypeId);
  const n = archetypeIds.length;

  const cellMap = new Map<string, MatchupCellLike>();
  for (const cell of cells) {
    cellMap.set(`${cell.deck1}|${cell.deck2}`, cell);
  }

  const p: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0.5));
  const games: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const imputed: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const resolved = resolveUnorderedPairPayoff(archetypeIds[i], archetypeIds[j], cellMap);
      p[i][j] = resolved.pIJ;
      p[j][i] = 1 - resolved.pIJ;
      games[i][j] = resolved.games;
      games[j][i] = resolved.games;
      imputed[i][j] = resolved.imputed;
      imputed[j][i] = resolved.imputed;
    }
  }

  const offDiagonalCount = n * (n - 1);
  let imputedOffDiagonalCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (imputed[i][j]) imputedOffDiagonalCount++;
    }
  }
  const imputedCellSharePct =
    offDiagonalCount > 0 ? round1((imputedOffDiagonalCount / offDiagonalCount) * 100) : 0;

  const rowCoveragePct = archetypeIds.map((_, i) => {
    let coveredShare = 0;
    let totalOpponentShare = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      totalOpponentShare += archetypes[j].sharePct;
      if (!imputed[i][j]) coveredShare += archetypes[j].sharePct;
    }
    return totalOpponentShare > 0 ? round1((coveredShare / totalOpponentShare) * 100) : 0;
  });

  return { archetypeIds, p, games, imputed, imputedCellSharePct, rowCoveragePct };
}

// ---------------------------------------------------------------------------
// solveSymmetricZeroSumNash + exclusion certificate (plan §3.0b/§3.0c/§3.3)
// ---------------------------------------------------------------------------

/** Weight below which an archetype counts as "not in the support". Numerical,
 *  not statistical: the simplex returns exact zeros for non-basic variables,
 *  this only absorbs float noise in degenerate bases. */
export const SUPPORT_EPSILON_PCT = 1e-6;
/** Same idea for the payoff comparison against the game value. Also the
 *  tolerance for the constant-sum self-check on `valuePct` (plan §3.0b). */
export const PAYOFF_EPSILON_PP = 1e-6;

export interface NashEquilibrium {
  archetypeIds: string[];
  /** Equilibrium weights in percent, summing to 100. Unrounded here; the job
   *  rounds to 2 decimals when persisting. */
  weightsPct: number[];
  /** (P x*)_i * 100 — expected win rate of playing i AGAINST the equilibrium
   *  mixture. Equals valuePct for every i in the support. */
  payoffsPct: number[];
  /** Value of the game * 100. MUST be 50 for a constant-sum input; any larger
   *  deviation than PAYOFF_EPSILON_PP means the input was not constant-sum. */
  valuePct: number;
  /** archetypeIds with weight above SUPPORT_EPSILON_PCT, weight desc. */
  support: string[];
  /**
   * Provably in the support of NO equilibrium (plan §3.0c, the one hard
   * theorem of this layer):
   *
   * THEOREM. Let x* be an equilibrium of the symmetric constant-sum game with
   * value v. If (P x*)_i < v, then i is in the support of NO equilibrium.
   * PROOF. In a zero-sum game, optimal strategies are interchangeable: if y is
   * also optimal, then (y, x*) is an equilibrium. Equilibrium requires every
   * pure strategy in the support of y to be a best response to x*, i.e. to
   * satisfy (P x*)_i = v. From (P x*)_i < v it follows that i is not a best
   * response, hence not in the support of y. QED.
   *
   * This is the rigorous form of the "popularity paradox": an archetype can
   * be the most-played deck by observed share and still be certified absent
   * from EVERY equilibrium, not just this one. That is the only claim the UI
   * may make from this field.
   *
   * WHAT THIS DOES NOT MEAN — the converse does NOT hold, and no UI copy may
   * imply it: `(P x*)_i === v` (i.e. i is NOT in `excludedCertain`) does NOT
   * mean i is in ANY equilibrium's support. i is merely an "equalizer" (see
   * `equalizerCount`); whether it actually appears in some, all, or no
   * equilibrium's support is in general undecidable from a single solved
   * vertex — a matrix of all-0.5 cells already has infinitely many
   * equilibria. Absence from `excludedCertain` must never be read as
   * "present in some/every equilibrium".
   *
   * Sorted by payoff asc.
   */
  excludedCertain: string[];
  /** #{i : |payoff_i - value| <= PAYOFF_EPSILON_PP}. Heuristic fragility hint,
   *  NOT a uniqueness certificate — see the `excludedCertain` doc comment
   *  above and plan §3.0c. When this is greater than `support.length`, the
   *  particular equilibrium returned is one of several/many, and the solid
   *  evidence for that fragility is the Monte-Carlo robustness check (§3.4),
   *  not this counter by itself. */
  equalizerCount: number;
  iterations: number;
  status: 'optimal' | 'failed';
}

/** payoffsPct[i] = (P x*)_i * 100 = sum_j p[i][j] * weightsPct[j], since
 *  weightsPct[j] is x*_j already expressed in percent. */
function computePayoffsPct(p: number[][], weightsPct: number[]): number[] {
  return p.map((row) => row.reduce((sum, pij, j) => sum + pij * weightsPct[j], 0));
}

/**
 * Nash equilibrium of a symmetric constant-sum game via linear programming
 * (plan §3.0b): maximise 1·q s.t. Pq <= 1, q >= 0, then x = q/sum(q) and
 * value = 1/sum(q). Reuses solveStandardFormLp — no second LP anywhere.
 * Symmetry means x is simultaneously optimal for the row AND the column
 * player (plan §3.0b), so a single LP solve is enough; the dual is never
 * built.
 *
 * `valuePct` MUST come out at 50 for a genuinely constant-sum `P`
 * (p[i][j] + p[j][i] === 1 for all i, j). `buildPayoffMatrix` can never
 * violate that invariant, but this function accepts a bare `PayoffMatrix`
 * and must defend against a future second producer that gets it wrong: a
 * deviation beyond `PAYOFF_EPSILON_PP` is reported as `status: 'failed'`,
 * never silently rounded to 50.
 *
 * n === 0 yields an empty result with valuePct 50 and status 'optimal'.
 */
export function solveSymmetricZeroSumNash(
  matrix: PayoffMatrix,
  opts?: { maxIterations?: number; epsilon?: number },
): NashEquilibrium {
  const archetypeIds = matrix.archetypeIds;
  const n = archetypeIds.length;

  if (n === 0) {
    return {
      archetypeIds: [],
      weightsPct: [],
      payoffsPct: [],
      valuePct: 50,
      support: [],
      excludedCertain: [],
      equalizerCount: 0,
      iterations: 0,
      status: 'optimal',
    };
  }

  const c = new Array<number>(n).fill(1);
  const b = new Array<number>(n).fill(1);
  const lp = solveStandardFormLp(c, matrix.p, b, opts);

  const failed = (
    valuePct: number,
    weightsPct: number[],
    payoffsPct: number[],
  ): NashEquilibrium => ({
    archetypeIds,
    weightsPct,
    payoffsPct,
    valuePct,
    support: [],
    excludedCertain: [],
    equalizerCount: 0,
    iterations: lp.iterations,
    status: 'failed',
  });

  // Per plan §3.0b, `unbounded` cannot happen for a correctly built payoff
  // matrix (every column has a strictly positive diagonal entry, P_jj =
  // 0.5) — treated as a genuine, reported failure, not smoothed over.
  if (lp.status !== 'optimal') {
    return failed(0, new Array<number>(n).fill(0), new Array<number>(n).fill(0));
  }

  const sumQ = lp.x.reduce((sum, q) => sum + q, 0);
  if (!(sumQ > 0) || !Number.isFinite(sumQ)) {
    return failed(0, new Array<number>(n).fill(0), new Array<number>(n).fill(0));
  }

  const weightsPct = lp.x.map((q) => (q / sumQ) * 100);
  const valuePct = 100 / sumQ;
  const payoffsPct = computePayoffsPct(matrix.p, weightsPct);

  // Binding self-check (plan §3.0b): a constant-sum input always has
  // valuePct === 50. A larger deviation means P was not constant-sum.
  if (Math.abs(valuePct - 50) > PAYOFF_EPSILON_PP) {
    return failed(valuePct, weightsPct, payoffsPct);
  }

  const supportEntries: Array<{ id: string; weight: number }> = [];
  for (let i = 0; i < n; i++) {
    if (weightsPct[i] > SUPPORT_EPSILON_PCT) {
      supportEntries.push({ id: archetypeIds[i], weight: weightsPct[i] });
    }
  }
  supportEntries.sort((a, b2) => b2.weight - a.weight);
  const support = supportEntries.map((e) => e.id);

  // Exclusion certificate (theorem, plan §3.0c — full statement on the
  // `excludedCertain` field above): payoff strictly below the value proves
  // membership in NO equilibrium's support, not just this one. equalizerCount
  // counts payoff === value (within tolerance) as a heuristic fragility hint
  // only — it is NOT the converse of the theorem and must never be read as one.
  const excludedEntries: Array<{ id: string; payoff: number }> = [];
  let equalizerCount = 0;
  for (let i = 0; i < n; i++) {
    const diff = payoffsPct[i] - valuePct;
    if (diff < -PAYOFF_EPSILON_PP) {
      excludedEntries.push({ id: archetypeIds[i], payoff: payoffsPct[i] });
    } else if (Math.abs(diff) <= PAYOFF_EPSILON_PP) {
      equalizerCount++;
    }
  }
  excludedEntries.sort((a, b2) => a.payoff - b2.payoff);
  const excludedCertain = excludedEntries.map((e) => e.id);

  return {
    archetypeIds,
    weightsPct,
    payoffsPct,
    valuePct,
    support,
    excludedCertain,
    equalizerCount,
    iterations: lp.iterations,
    status: 'optimal',
  };
}
