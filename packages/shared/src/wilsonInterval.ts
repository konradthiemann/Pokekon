// Wilson score confidence intervals for tie-weighted tournament records (plan
// .claude/plans/confidence-aware-matchups.md §3.1/§3.2/§3.3, Slice A). This is
// the single implementation of the Wilson interval math in the repo — no
// other file may re-derive it (see plan Definition of Done, "genau eine
// Implementierung der Wilson-Formel").

/** Default confidence level (Wilson standard, matches the Spec-1 reference paper). */
export const DEFAULT_CONFIDENCE = 0.95;

/** Two-sided normal quantiles for the confidence levels this app ever needs. */
const Z_TABLE: Record<number, number> = {
  0.8: 1.2815515655446004,
  0.9: 1.6448536269514722,
  0.95: 1.959963984540054,
  0.98: 2.3263478740408408,
  0.99: 2.5758293035489004,
};

/**
 * Two-sided normal quantile z for a confidence level. Table-backed: only the
 * standard levels are supported, anything else throws (a silently wrong z
 * would be worse than a loud failure).
 */
export function zForConfidence(confidence: number): number {
  const z = Z_TABLE[confidence];
  if (z === undefined) {
    throw new Error(
      `zForConfidence: unsupported confidence level ${confidence} (supported: ${Object.keys(Z_TABLE).join(', ')})`,
    );
  }
  return z;
}

export interface WilsonInterval {
  /** Point estimate in percent, tie-weighted: (wins + ties/3)/n × 100. Unrounded. */
  pct: number;
  /** Lower / upper bound in percent, clamped to [0, 100]. Unrounded. */
  lowPct: number;
  highPct: number;
  /** highPct - lowPct, the width used for the UI's confidence tiers. */
  widthPct: number;
  /** Sample size wins + losses + ties. */
  n: number;
  /** true when the interval excludes 50 % — the direction is established. */
  significant: boolean;
}

/**
 * Wilson score interval (score-test inversion, no continuity correction) for a
 * tie-weighted tournament record. Returns null when n === 0. Negative or
 * non-finite inputs are defensively treated as 0 (same contract as
 * tournamentWinRate).
 *
 * Formula (Wilson 1927, score-test inversion — NOT the Wald/normal
 * approximation p̂ ± z·√(p̂(1−p̂)/n), which collapses to zero width at p̂ ∈ {0,1}
 * and can leave [0,1]):
 *   z = quantile for the confidence level
 *   d = 1 + z²/n
 *   c = (p̂ + z²/(2n)) / d                                  ← interval centre
 *   h = (z/d) · √( p̂(1−p̂)/n + z²/(4n²) )                   ← half-width
 *   low = max(0, c−h)    high = min(1, c+h)
 *
 * Ties. The score is the tie-weighted value s = wins + ties/3, n = wins +
 * losses + ties, so p̂ = tournamentWinRate(wins, losses, ties). At ties === 0
 * this is the exact textbook Wilson interval. At ties > 0 it is a
 * DELIBERATELY CONSERVATIVE approximation: the true variance of a single
 * observation drawn from {0, ⅓, 1} is Var = p_w + p_t/9 − (p_w + p_t/3)², which
 * is ≤ μ(1−μ) (the variance Wilson assumes for a Bernoulli trial). Example
 * p_w=0.45 / p_t=0.10 / p_l=0.45: μ=0.4833, μ(1−μ)=0.2497, true variance
 * 0.2275 → the interval comes out ~4.6 % too wide. Too wide is honest, never
 * too narrow. An exact alternative via an effective sample size
 * (design effect) is a documented open question, not implemented here — see
 * plan §6 "Offene Fragen" #1.
 */
export function wilsonInterval(
  wins: number,
  losses: number,
  ties = 0,
  opts?: { confidence?: number },
): WilsonInterval | null {
  const safeWins = Number.isFinite(wins) && wins > 0 ? wins : 0;
  const safeLosses = Number.isFinite(losses) && losses > 0 ? losses : 0;
  const safeTies = Number.isFinite(ties) && ties > 0 ? ties : 0;
  const n = safeWins + safeLosses + safeTies;
  if (n === 0) return null;

  const z = zForConfidence(opts?.confidence ?? DEFAULT_CONFIDENCE);
  const score = safeWins + safeTies / 3;
  const pHat = score / n;

  const d = 1 + (z * z) / n;
  const centre = (pHat + (z * z) / (2 * n)) / d;
  const halfWidth = (z / d) * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n));

  const low = Math.max(0, centre - halfWidth);
  const high = Math.min(1, centre + halfWidth);

  const pct = pHat * 100;
  const lowPct = low * 100;
  const highPct = high * 100;

  return {
    pct,
    lowPct,
    highPct,
    widthPct: highPct - lowPct,
    n,
    significant: highPct < 50 || lowPct > 50,
  };
}

export interface IntervalTerm {
  /** Non-negative weight; the function normalises so the weights sum to 1. */
  weight: number;
  pct: number;
  lowPct: number;
  highPct: number;
}

/**
 * Error propagation for a weighted sum of INDEPENDENT proportion estimates:
 * Var(Σ wᵢXᵢ) = Σ wᵢ²Var(Xᵢ). The per-term standard errors are read back from
 * each term's own interval, separately below and above the point estimate
 * (Wilson is asymmetric):
 *   σ⁻ᵢ = (pctᵢ − lowPctᵢ) / z      σ⁺ᵢ = (highPctᵢ − pctᵢ) / z
 * z cancels out of the aggregation (it only lives in the per-term bands), so
 * the propagation below works directly with the per-term deviations without
 * ever reintroducing z:
 *   low  = clamp(F − √(Σ wᵢ²·(pctᵢ − lowPctᵢ)²), 0, 100)
 *   high = clamp(F + √(Σ wᵢ²·(highPctᵢ − pctᵢ)²), 0, 100)
 * Terms with lowPct === pct === highPct (e.g. the definitional 50 % mirror)
 * contribute zero variance, which is correct — they are constants, not
 * estimates. Returns null when the total weight is 0 (including an empty
 * term list).
 *
 * Independence caveat: real matchup cells in the same row share players and
 * tournaments, so they are mildly correlated, and the shares themselves are
 * estimates treated here as exact. Both effects make the combined band
 * tend to be too narrow, not too wide — accepted for now (plan §6 Risiko 3).
 */
export function combineIndependentIntervals(
  terms: IntervalTerm[],
): { pct: number; lowPct: number; highPct: number } | null {
  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return null;

  let weightedSum = 0;
  let varianceLow = 0;
  let varianceHigh = 0;

  for (const term of terms) {
    const w = term.weight / totalWeight;
    weightedSum += w * term.pct;
    const sigmaLow = term.pct - term.lowPct;
    const sigmaHigh = term.highPct - term.pct;
    varianceLow += w * w * sigmaLow * sigmaLow;
    varianceHigh += w * w * sigmaHigh * sigmaHigh;
  }

  const pct = weightedSum;
  const lowPct = Math.max(0, pct - Math.sqrt(varianceLow));
  const highPct = Math.min(100, pct + Math.sqrt(varianceHigh));

  return { pct, lowPct, highPct };
}

// Minimal structural shape matching packages/shared/src/fieldWinRate.ts's
// MatchupCell (plan §3.3). Kept independent of that file's exact export so
// this module has no import-order dependency on it; MatchupCell there is
// structurally assignable to this type.
export interface MatchupCellLike {
  deck1: string;
  deck2: string;
  total: number;
  winRate: number;
  wins?: number;
  losses?: number;
  ties?: number;
  lowPct?: number;
  highPct?: number;
}

/**
 * Resolve one matchup cell's interval, in this precedence order:
 *   1. explicit lowPct/highPct on the cell  → used verbatim (pct = cell.winRate)
 *   2. wins/losses/ties present            → wilsonInterval(wins, losses, ties)
 *   3. otherwise                           → reconstruct from total + winRate:
 *      wilsonInterval-equivalent with n = cell.total, p̂ = cell.winRate / 100
 * Returns null when cell.total <= 0 (no data at all).
 * Mirror cells (deck1 === deck2) are NOT special-cased here — callers that can
 * see a mirror must handle it, because the bundled TrainerHill export
 * double-counts mirror wins/losses (plan §0: total counts games, but
 * wins+losses+ties double-counts them for mirror rows).
 */
export function matchupCellInterval(
  cell: MatchupCellLike,
  opts?: { confidence?: number },
): WilsonInterval | null {
  if (cell.total <= 0) return null;

  // Case 1: explicit bounds win verbatim, regardless of anything else present.
  if (cell.lowPct !== undefined && cell.highPct !== undefined) {
    return {
      pct: cell.winRate,
      lowPct: cell.lowPct,
      highPct: cell.highPct,
      widthPct: cell.highPct - cell.lowPct,
      n: cell.total,
      significant: cell.highPct < 50 || cell.lowPct > 50,
    };
  }

  // Case 2: the raw record takes precedence over reconstruction from
  // total/winRate — but only when it actually accounts for some games. A
  // record of wins=losses=ties=0 next to a positive total is not real data
  // (e.g. a placeholder/fallback row that only carries total + winRate); in
  // that case fall through to case 3 instead of reporting "no data at all".
  if (cell.wins !== undefined && cell.losses !== undefined) {
    const ties = cell.ties ?? 0;
    if (cell.wins + cell.losses + ties > 0) {
      return wilsonInterval(cell.wins, cell.losses, ties, opts);
    }
  }

  // Case 3: reconstruct an equivalent win/loss record from total + winRate.
  // n = cell.total, p̂ = cell.winRate / 100 → wins = p̂·n, losses = n − wins.
  const wins = (cell.winRate / 100) * cell.total;
  const losses = cell.total - wins;
  return wilsonInterval(wins, losses, 0, opts);
}
