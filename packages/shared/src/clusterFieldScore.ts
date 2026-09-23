// Field-weighted cluster scoring (Spec 10 Slice D, specs/archetype-meta-analysis.md).
// Turns Slice B's Wilson-ranked decklist clusters into scores against a
// specific chosen local field, reusing computeFieldScores (fieldWinRate.ts)
// rather than re-deriving the weighted-sum-of-Wilson-intervals math.
import { computeFieldScores } from './fieldWinRate.js';
import type { ArchetypeShare, FieldScore, MatchupCell } from './fieldWinRate.js';
import type { RankedCluster } from './clusterRanking.js';
import { tournamentWinRatePct } from './winRate.js';
import type { StandingMatchResult } from './matchupPairings.js';

/** One MatchupCell per opponent archetype the cluster's members actually
 *  played (aggregated over every member standing's match_results, Spec 10
 *  Slice D "real field-weighting"). `subjectId` is a synthetic id (never a
 *  real archetypeId) so the cluster can run through computeFieldScores as
 *  its own subject without colliding with a real archetype in `field`. */
function clusterMatchupCells(
  subjectId: string,
  matchResults: StandingMatchResult[],
): MatchupCell[] {
  const byOpponent = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const m of matchResults) {
    const rec = byOpponent.get(m.opponentArchetypeId) ?? { wins: 0, losses: 0, ties: 0 };
    if (m.result === 'W') rec.wins++;
    else if (m.result === 'L') rec.losses++;
    else rec.ties++;
    byOpponent.set(m.opponentArchetypeId, rec);
  }
  const cells: MatchupCell[] = [];
  for (const [opponentId, rec] of byOpponent) {
    const total = rec.wins + rec.losses + rec.ties;
    if (total === 0) continue;
    cells.push({
      deck1: subjectId,
      deck2: opponentId,
      total,
      winRate: tournamentWinRatePct(rec.wins, rec.losses, rec.ties) ?? 50,
      wins: rec.wins,
      losses: rec.losses,
      ties: rec.ties,
    });
  }
  return cells;
}

/** Field-weighted score of EVERY cluster against `field` (Spec 10 Slice D).
 *  Reuse of computeFieldScores (AC B: "wiederverwenden, nicht duplizieren"):
 *  per cluster, a synthetic subject with sharePct: 0 is injected into the
 *  shares list (so it can never skew `totalShare`/`coveragePct` of the REAL
 *  field entries), and computeFieldScores also returns FieldScore rows for
 *  those real field entries -- those are discarded, not consumed, so this is
 *  not a correctness problem. An empty `field` (no local field configured)
 *  returns an empty map; the caller then falls back to the existing
 *  Wilson-lower-bound ranking (unchanged behaviour). */
export function computeClusterFieldScores(
  clusters: RankedCluster[],
  field: ArchetypeShare[],
): Map<number, FieldScore> {
  if (field.length === 0) return new Map();
  const subjectIdFor = (c: RankedCluster) => `__cluster_${c.rank}__`;
  const syntheticShares: ArchetypeShare[] = clusters.map((c) => ({
    archetypeId: subjectIdFor(c),
    archetypeName: subjectIdFor(c),
    sharePct: 0,
  }));
  const matchups = clusters.flatMap((c) => clusterMatchupCells(subjectIdFor(c), c.matchResults));
  const scores = computeFieldScores([...syntheticShares, ...field], matchups);
  const byId = new Map(scores.map((s) => [s.archetypeId, s]));
  const result = new Map<number, FieldScore>();
  for (const c of clusters) {
    const s = byId.get(subjectIdFor(c));
    if (s) result.set(c.rank, s);
  }
  return result;
}

/** Reorders `clusters` by the field-weighted score in `fieldScores` (primary
 *  `fieldWinRateLowPct` -- the same "lower bound protects against a small
 *  sample" principle as Slice B's winRateLowerBoundPct, just now against the
 *  chosen field instead of every opponent weighted equally). Clusters
 *  without coverage against this field (no FieldScore entry, or
 *  `fieldWinRateLowPct: null`) sink to the end, ordered among themselves by
 *  their original (Wilson) rank -- they are never dropped, just not
 *  artificially boosted. Sets `.fieldScore` on every cluster (`null` when
 *  computed but uncovered) and reassigns `.rank`, 1-based, in the new order.
 *  Pure function: never mutates the input objects. */
export function reorderClustersByFieldScore(
  clusters: RankedCluster[],
  fieldScores: Map<number, FieldScore>,
): RankedCluster[] {
  if (fieldScores.size === 0) return clusters;
  const withScore = clusters.map((c) => ({
    ...c,
    fieldScore: fieldScores.get(c.rank) ?? null,
    _originalRank: c.rank,
  }));
  withScore.sort((a, b) => {
    const av = a.fieldScore?.fieldWinRateLowPct;
    const bv = b.fieldScore?.fieldWinRateLowPct;
    if (av != null && bv != null) return bv - av;
    if (av != null) return -1;
    if (bv != null) return 1;
    return a._originalRank - b._originalRank;
  });
  return withScore.map(({ _originalRank: _drop, ...rest }, i) => ({ ...rest, rank: i + 1 }));
}
