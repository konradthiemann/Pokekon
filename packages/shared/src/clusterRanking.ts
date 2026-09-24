// Cluster ranking (Spec 10 Slice B, specs/archetype-meta-analysis.md). Turns
// the clusters from decklistClustering.ts into a ranked list that protects
// against two opposite failure modes at once: a lucky 3-game 100% sample
// must not outrank a proven 40-game 65% sample (small-sample bias), while a
// single-list cluster with a real tournament win must still be visible, not
// silently dropped ("Nadel im Heuhaufen").
import { placementPercentile } from './cardPerformance.js';
import type { DecklistCluster } from './decklistClustering.js';
import type { FieldScore } from './fieldWinRate.js';
import { wilsonInterval, type WilsonInterval } from './wilsonInterval.js';

export interface RankedCluster extends DecklistCluster {
  /** PRIMARY ranking signal: the Wilson-score lower bound of the cluster's
   *  tie-weighted win rate (wilsonInterval().lowPct), or 0 when the cluster
   *  has zero recorded games. This is what protects against small-sample
   *  luck — a handful of wins cannot out-rank a large, consistent sample,
   *  without excluding small clusters outright. */
  winRateLowerBoundPct: number;
  /** The full interval this was derived from; null only when the cluster has
   *  zero recorded games (wins + losses + ties === 0). */
  winRateInterval: WilsonInterval | null;
  /** SECONDARY, display/tie-breaker signal (never a multiplier on the
   *  primary rank): mean placementPercentile() across every member standing
   *  that had both a placing and its tournament's totalPlayers. null when no
   *  member has that data. Surfaces "this pilot actually won the event" even
   *  when the win-rate sample is too small to rank the cluster highly. */
  avgPlacementPercentile: number | null;
  /** 1-based rank within the input list, by descending winRateLowerBoundPct.
   *  Ties (Spec 1 §3.3) → avgPlacementPercentile desc (null last) → member
   *  count desc → smallest member standing id asc, so equal inputs always
   *  produce the same ranking regardless of input order. */
  rank: number;
  /** Spec 10 Slice D: the cluster's field-weighted score against a chosen
   *  local field, only computed and set for `scope: 'local'` with a
   *  non-empty `localField` (see clusterFieldScore.ts). `undefined` when not
   *  computed at all (global scope, or local scope without a field); `null`
   *  when the cluster's rank has no entry in the computed field-scores map
   *  at all. In practice every cluster gets a FieldScore object once a field
   *  is set (computeFieldScores always returns one row per subject) — a
   *  cluster with NO matchResults vs the field still gets an object here,
   *  just with `fieldWinRatePct`/`fieldWinRateLowPct: null` inside (no
   *  coverage). Read `fieldWinRateLowPct` to check for actual coverage, not
   *  a `null` check on this field itself. rankClusters() itself never sets
   *  this — it is filled in by the caller (apps/api's
   *  archetypeSynthesisFacts.ts) as a separate re-ranking step. */
  fieldScore?: FieldScore | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function smallestMemberId(c: DecklistCluster): number {
  // Hand-built clusters may have no members; Math.min() would yield Infinity.
  return c.memberStandingIds.length === 0
    ? Number.MAX_SAFE_INTEGER
    : Math.min(...c.memberStandingIds);
}

function compareRankedClusters(
  a: Omit<RankedCluster, 'rank'>,
  b: Omit<RankedCluster, 'rank'>,
): number {
  if (a.winRateLowerBoundPct !== b.winRateLowerBoundPct) {
    return b.winRateLowerBoundPct - a.winRateLowerBoundPct;
  }
  if (a.avgPlacementPercentile !== b.avgPlacementPercentile) {
    if (a.avgPlacementPercentile == null) return 1;
    if (b.avgPlacementPercentile == null) return -1;
    return b.avgPlacementPercentile - a.avgPlacementPercentile;
  }
  if (a.memberStandingIds.length !== b.memberStandingIds.length) {
    return b.memberStandingIds.length - a.memberStandingIds.length;
  }
  return smallestMemberId(a) - smallestMemberId(b);
}

export function rankClusters(clusters: DecklistCluster[]): RankedCluster[] {
  const withStats = clusters.map((c) => {
    const winRateInterval = wilsonInterval(c.totalWins, c.totalLosses, c.totalTies);
    const winRateLowerBoundPct = winRateInterval?.lowPct ?? 0;
    const avgPlacementPercentile = average(
      c.placements
        .map((p) => placementPercentile(p.placing, p.totalPlayers))
        .filter((v): v is number => v !== null),
    );
    return { ...c, winRateInterval, winRateLowerBoundPct, avgPlacementPercentile };
  });

  return withStats.sort(compareRankedClusters).map((c, i) => ({ ...c, rank: i + 1 }));
}
