// Payoff-matrix construction and the symmetric zero-sum Nash equilibrium
// solver for the meta-game-theory layer (plan
// .claude/plans/meta-game-theory-layer.md §3.0/§3.2/§3.3, Slice A2). Reuses
// Slice A1's `solveStandardFormLp` (./simplex.ts) as the single LP
// implementation in the repo — no second solver lives here.
import { solveStandardFormLp } from './simplex.js';
import { sampleBeta, mulberry32 } from './deterministicRandom.js';
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

// ---------------------------------------------------------------------------
// Deterministic Monte-Carlo robustness of the equilibrium support
// (plan §3.0d/§3.4, Slice A3)
// ---------------------------------------------------------------------------

export const DEFAULT_RESAMPLES = 2000;
export const DEFAULT_SEED = 20260902;

/**
 * Draw ONE resampled payoff matrix. Sampling happens per UNORDERED pair; the
 * mirror cell is set to 1 - p and the diagonal stays 0.5, so the resampled
 * matrix is constant-sum by construction (plan §3.0d — resampling both
 * directions independently would silently change the game being solved: the
 * resampled matrix would no longer be constant-sum, the game value would
 * drift away from 50 %, and the LP would solve a different game than the
 * point-estimate LP).
 *
 * Distribution per pair (plan §3.4d):
 *   games > 0 : Beta(s + 0.5, n - s + 0.5)  (Jeffreys posterior),
 *               s = p * n, n = games. Chosen over reading the Wilson interval
 *               directly because it is a real distribution on [0,1] (no atom
 *               at the boundary the way a clamped split-normal reading of the
 *               Wilson band would produce for e.g. a 1W/0L record), and its
 *               s = w + t/2 construction mirrors exactly: the reverse
 *               direction's posterior is the same distribution reflected
 *               around 0.5, so p_ji = 1 - p_ij is the correct counter-
 *               posterior, not just a bookkeeping convenience.
 *   games = 0 : Beta(1, 1) = uniform on [0,1]  (honest "unknown", not the
 *               U-shaped Jeffreys prior Beta(0.5, 0.5): that prior puts
 *               mass at the extremes, i.e. it *asserts* an unobserved
 *               matchup is probably lopsided, which is not something the
 *               data supports).
 */
export function resamplePayoffMatrix(matrix: PayoffMatrix, rng: () => number): PayoffMatrix {
  const n = matrix.archetypeIds.length;
  const p: number[][] = matrix.p.map((row) => row.slice());

  for (let i = 0; i < n; i++) {
    p[i][i] = 0.5;
    for (let j = i + 1; j < n; j++) {
      const games = matrix.games[i][j];
      let a: number;
      let b: number;
      if (games > 0) {
        const s = matrix.p[i][j] * games;
        a = s + 0.5;
        b = games - s + 0.5;
      } else {
        a = 1;
        b = 1;
      }
      const draw = sampleBeta(a, b, rng);
      p[i][j] = draw;
      p[j][i] = 1 - draw;
    }
  }

  return {
    archetypeIds: matrix.archetypeIds,
    p,
    games: matrix.games,
    imputed: matrix.imputed,
    imputedCellSharePct: matrix.imputedCellSharePct,
    rowCoveragePct: matrix.rowCoveragePct,
  };
}

export interface ArchetypeRobustness {
  archetypeId: string;
  /** Percentage of resamples in which the weight stayed at (numerically) zero. */
  exclusionRatePct: number;
  /** Mean equilibrium weight across resamples, percent. */
  meanWeightPct: number;
  /** 5th / 95th percentile of the weight across resamples, percent. */
  weightP05Pct: number;
  weightP95Pct: number;
  /** Percentage of resamples in which the exclusion CERTIFICATE held
   *  (payoff strictly below the value) — the strong statement, always <=
   *  exclusionRatePct. */
  certainExclusionRatePct: number;
}

export interface RobustnessResult {
  resamples: number;
  seed: number;
  perArchetype: ArchetypeRobustness[];
  /** Percentage of resamples whose SUPPORT SET equals the point estimate's —
   *  the analogue of the reference paper's 2.1 % figure. */
  exactSupportRatePct: number;
  /** Resamples whose LP did not return 'optimal'. Reported, never silently
   *  dropped; they are excluded from all rates and the denominator shrinks
   *  accordingly. */
  failedResamples: number;
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

/** Nearest-rank percentile of a value list, pre-sorted ascending. Empty input
 *  returns 0 — only reachable when there were zero successful resamples. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[idx];
}

/** Monte-Carlo robustness of the equilibrium support. Deterministic given the
 *  seed. Pure: the caller supplies the seed, this function creates no entropy.
 *  Failed resamples (LP status !== 'optimal') are reported via
 *  `failedResamples` and excluded from every rate's denominator. */
export function equilibriumRobustness(
  matrix: PayoffMatrix,
  pointEstimate: NashEquilibrium,
  opts?: { resamples?: number; seed?: number; maxIterations?: number },
): RobustnessResult {
  const resamples = opts?.resamples ?? DEFAULT_RESAMPLES;
  const seed = opts?.seed ?? DEFAULT_SEED;
  const rng = mulberry32(seed);
  const archetypeIds = matrix.archetypeIds;
  const n = archetypeIds.length;
  const pointSupport = new Set(pointEstimate.support);

  const weights: number[][] = Array.from({ length: n }, () => []);
  const exclusionCount = new Array<number>(n).fill(0);
  const certainExclusionCount = new Array<number>(n).fill(0);
  let exactSupportCount = 0;
  let failedResamples = 0;
  let successfulResamples = 0;

  for (let r = 0; r < resamples; r++) {
    const resampled = resamplePayoffMatrix(matrix, rng);
    const result = solveSymmetricZeroSumNash(resampled, { maxIterations: opts?.maxIterations });
    if (result.status !== 'optimal') {
      failedResamples++;
      continue;
    }
    successfulResamples++;
    const excludedSet = new Set(result.excludedCertain);
    for (let i = 0; i < n; i++) {
      const weight = result.weightsPct[i];
      weights[i].push(weight);
      if (weight <= SUPPORT_EPSILON_PCT) exclusionCount[i]++;
      if (excludedSet.has(archetypeIds[i])) certainExclusionCount[i]++;
    }
    if (setsEqual(new Set(result.support), pointSupport)) exactSupportCount++;
  }

  const perArchetype: ArchetypeRobustness[] = archetypeIds.map((id, i) => {
    const w = weights[i];
    const count = w.length;
    const sorted = w.slice().sort((a, b) => a - b);
    return {
      archetypeId: id,
      exclusionRatePct: count > 0 ? (exclusionCount[i] / count) * 100 : 0,
      meanWeightPct: count > 0 ? w.reduce((sum, v) => sum + v, 0) / count : 0,
      weightP05Pct: percentile(sorted, 0.05),
      weightP95Pct: percentile(sorted, 0.95),
      certainExclusionRatePct: count > 0 ? (certainExclusionCount[i] / count) * 100 : 0,
    };
  });

  return {
    resamples,
    seed,
    perArchetype,
    exactSupportRatePct:
      successfulResamples > 0 ? (exactSupportCount / successfulResamples) * 100 : 0,
    failedResamples,
  };
}

/** Standard error of a Monte-Carlo rate, in percentage points:
 *  sqrt(p(1-p)/R) * 100. At R = 2000 and p = 0.78 this is 0.93 pp — the
 *  reported percentage is honest to about one decimal, no further. */
export function monteCarloSePct(ratePct: number, resamples: number): number {
  const p = ratePct / 100;
  return Math.sqrt((p * (1 - p)) / resamples) * 100;
}

// ---------------------------------------------------------------------------
// Replicator fitness and week-over-week trend direction (plan §3.0e/§3.5,
// Slice A3)
// ---------------------------------------------------------------------------

/** Fitness change below this magnitude (percentage points) is reported as
 *  'stable'. A DISPLAY threshold, not an inference rule: the number itself is
 *  always shown next to the label. */
export const REPLICATOR_STABLE_BAND_PP = 1;

export interface ReplicatorStep {
  archetypeIds: string[];
  /** f_i(x) * 100 — expected win rate of i against the population x. */
  fitnessPct: number[];
  /** Mean population fitness * 100. EXACTLY 50 for a constant-sum matrix — a
   *  built-in self check (plan §3.0e). */
  meanFitnessPct: number;
  /** (f_i/phi - 1) * 100 = one-week relative growth rate in percent. */
  growthPct: number[];
  /** Renormalised x_i' * 100. Sums to 100 by construction. */
  projectedSharePct: number[];
}

/** Renormalises a share vector to fractions summing to 1. A non-positive
 *  total (all zero / empty) returns all zeros rather than dividing by zero —
 *  there is no meaningful distribution to renormalise. */
function renormalizeShares(sharePct: number[]): number[] {
  const total = sharePct.reduce((sum, v) => sum + v, 0);
  if (!(total > 0)) return sharePct.map(() => 0);
  return sharePct.map((v) => v / total);
}

/** One discrete replicator step. `sharePct` need not sum to 100 — it is
 *  renormalised first (the archetype set excludes 'other', so it usually does
 *  not). Returns empty arrays for an empty matrix.
 *
 *  phi(x) = meanFitnessPct/100 is exactly 1/2 for any x on a constant-sum
 *  matrix (plan §3.0e), so growth_i = f_i/phi - 1 is parameter-free: no
 *  background-fitness constant, no calibration. This function uses the
 *  actually computed meanFitnessPct (not a hardcoded 50) as the denominator,
 *  which coincides with 50 up to floating-point noise for any valid
 *  constant-sum PayoffMatrix. */
export function replicatorStep(matrix: PayoffMatrix, sharePct: number[]): ReplicatorStep {
  const archetypeIds = matrix.archetypeIds;
  const n = archetypeIds.length;

  if (n === 0) {
    return {
      archetypeIds: [],
      fitnessPct: [],
      meanFitnessPct: 0,
      growthPct: [],
      projectedSharePct: [],
    };
  }

  const x = renormalizeShares(sharePct);
  const fitnessPct = matrix.p.map((row) => row.reduce((sum, pij, j) => sum + pij * x[j], 0) * 100);
  const meanFitnessPct = x.reduce((sum, xi, i) => sum + xi * fitnessPct[i], 0);

  const growthPct = fitnessPct.map((f) =>
    meanFitnessPct !== 0 ? (f / meanFitnessPct - 1) * 100 : 0,
  );
  const projectedSharePct = x.map((xi, i) =>
    meanFitnessPct !== 0 ? xi * 100 * (fitnessPct[i] / meanFitnessPct) : 0,
  );

  return { archetypeIds, fitnessPct, meanFitnessPct, growthPct, projectedSharePct };
}

export type FitnessDirection = 'rising' | 'falling' | 'stable' | 'unknown';

export interface FitnessTrend {
  archetypeId: string;
  fitnessPct: number;
  /** null when there is no previous-period data at all (cold start). */
  previousFitnessPct: number | null;
  fitnessDeltaPp: number | null;
  /** Observed week-over-week share change, DESCRIPTIVE ONLY: it carries no
   *  confidence statement and is never used to derive `direction`. It is there
   *  so the UI can put "theory said grow" next to "reality: shrank". */
  observedShareDeltaPp: number | null;
  direction: FitnessDirection;
}

/**
 * Fitness of each archetype against the current and the previous week's field,
 * evaluated on the SAME payoff matrix (plan §3.0e): the delta then isolates
 * the meta shift instead of mixing it with per-week matchup noise.
 *
 * `previousSharePct` entirely null means "fewer than one completed period"
 * (plan §3.5) — a regular cold-start state, not an error: every archetype
 * gets `previousFitnessPct: null`, `fitnessDeltaPp: null`,
 * `observedShareDeltaPp: null`, `direction: 'unknown'`. Deciding WHICH week
 * counts as "in progress" vs. "completed" is a caller/job-side concern, out
 * of scope for this pure function (plan §3.5, "welche Wochen").
 *
 * A null entry for one specific archetype (while others are numeric) is
 * treated as a real "0 % share that period" — that archetype existed in the
 * matrix's archetype set but was below the noise floor, which is different
 * from "no previous period exists at all".
 */
export function fitnessTrend(
  matrix: PayoffMatrix,
  currentSharePct: number[],
  previousSharePct: (number | null)[],
  opts?: { stableBandPp?: number },
): FitnessTrend[] {
  const archetypeIds = matrix.archetypeIds;
  const stableBandPp = opts?.stableBandPp ?? REPLICATOR_STABLE_BAND_PP;

  const xCur = renormalizeShares(currentSharePct);
  const fitnessPct = matrix.p.map(
    (row) => row.reduce((sum, pij, j) => sum + pij * xCur[j], 0) * 100,
  );

  const hasAnyPrevious = previousSharePct.some((v) => v !== null);
  if (!hasAnyPrevious) {
    return archetypeIds.map((id, i) => ({
      archetypeId: id,
      fitnessPct: fitnessPct[i],
      previousFitnessPct: null,
      fitnessDeltaPp: null,
      observedShareDeltaPp: null,
      direction: 'unknown' as const,
    }));
  }

  const xPrev = renormalizeShares(previousSharePct.map((v) => v ?? 0));
  const previousFitnessPct = matrix.p.map(
    (row) => row.reduce((sum, pij, j) => sum + pij * xPrev[j], 0) * 100,
  );

  return archetypeIds.map((id, i) => {
    const fitnessDeltaPp = fitnessPct[i] - previousFitnessPct[i];
    const observedShareDeltaPp = xCur[i] * 100 - xPrev[i] * 100;
    const direction: FitnessDirection =
      Math.abs(fitnessDeltaPp) <= stableBandPp
        ? 'stable'
        : fitnessDeltaPp > 0
          ? 'rising'
          : 'falling';

    return {
      archetypeId: id,
      fitnessPct: fitnessPct[i],
      previousFitnessPct: previousFitnessPct[i],
      fitnessDeltaPp,
      observedShareDeltaPp,
      direction,
    };
  });
}
