// Plain-language framing helpers for the game-theoretic equilibrium panel
// (plan .claude/plans/meta-game-theory-layer.md §3.8). Pure, testable display
// logic — pattern to follow: `./confidence.ts` and `./winRateColor.ts`. These
// helpers never compute the underlying statistics themselves; they only band
// numbers that already came from `@pokekon/shared`'s `equilibriumRobustness`.

export type ExclusionBand = 'veryRobust' | 'robust' | 'unclear' | 'likelyIn';

/** Plain-language band for an exclusion rate. The spec's third decision is
 *  BOTH: the caller renders the band's sentence AND the raw percentage — this
 *  function never replaces the number, it only labels it. */
export function exclusionBand(exclusionRatePct: number): ExclusionBand {
  if (exclusionRatePct >= 90) return 'veryRobust';
  if (exclusionRatePct >= 70) return 'robust';
  if (exclusionRatePct >= 30) return 'unclear';
  return 'likelyIn';
}

/** The 50 % threshold used by `isCompositionFragile` — pinned as a named
 *  constant so the boundary can't silently drift away from its own test. */
export const FRAGILE_SUPPORT_RATE_PCT = 50;

/** true when the exact composition must be shown with a fragility warning:
 *  the point estimate's support was reproduced in fewer than
 *  FRAGILE_SUPPORT_RATE_PCT of the resamples, or equalizerCount exceeds the
 *  support size (plan section 3.0c). */
export function isCompositionFragile(
  exactSupportRatePct: number,
  equalizerCount: number,
  supportSize: number,
): boolean {
  return exactSupportRatePct < FRAGILE_SUPPORT_RATE_PCT || equalizerCount > supportSize;
}
