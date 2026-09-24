// Decklist clustering (Spec 10 Slice A, specs/archetype-meta-analysis.md).
// Two published tournament decklists that differ by only a card or two (a
// single tech swap, an energy count) are the SAME list for ranking purposes —
// without this, they count as two independent, weaker data points instead of
// one stronger one. Pure functions, no I/O, same shape as fieldWinRate.ts.
import { normalizeCardName, placementPercentile } from './cardPerformance.js';
import type { TournamentDecklist } from './meta.js';
import type { StandingMatchResult } from './matchupPairings.js';

/** A cluster merges lists whose card-for-card overlap is at least this
 *  fraction of the larger list's card count. 55/60 ≈ 91.7 % — deliberately a
 *  bit more tolerant than the "58/60" example from the original feature
 *  request, so a single 1-copy energy swap doesn't fragment an otherwise
 *  identical list into two clusters. Tunable per call via `opts.minOverlapRatio`
 *  (see spec "Offene Fragen" — not yet validated against real tournament data). */
export const DEFAULT_MIN_OVERLAP_RATIO = 55 / 60;

export interface DecklistOverlap {
  /** Sum, per distinct card, of min(count in A, count in B) — capped by
   *  construction at each list's own total, so it can never exceed either
   *  list's card count. */
  identicalCards: number;
  /** identicalCards / max(totalCardsA, totalCardsB). A legal list has 60
   *  cards, so this is normally identicalCards/60 — the max() guards against
   *  malformed input (e.g. a mis-pruned list) without throwing. */
  overlapRatio: number;
}

function cardCountMap(list: TournamentDecklist): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of [...list.pokemon, ...list.trainer, ...list.energy]) {
    const key = normalizeCardName(entry.name);
    map.set(key, (map.get(key) ?? 0) + entry.count);
  }
  return map;
}

function totalCount(map: Map<string, number>): number {
  let total = 0;
  for (const count of map.values()) total += count;
  return total;
}

export function computeDecklistOverlap(
  a: TournamentDecklist,
  b: TournamentDecklist,
): DecklistOverlap {
  const mapA = cardCountMap(a);
  const mapB = cardCountMap(b);

  let identicalCards = 0;
  for (const [card, countA] of mapA) {
    identicalCards += Math.min(countA, mapB.get(card) ?? 0);
  }

  const denom = Math.max(totalCount(mapA), totalCount(mapB), 1);
  return { identicalCards, overlapRatio: identicalCards / denom };
}

/** The subset of a tournament standing this module needs — deliberately
 *  narrower than the DB row (`tournamentStandings`) so callers don't have to
 *  construct a full fake row in tests. `totalPlayers` is the standing's OWN
 *  tournament's player count (needed for `placementPercentile` in Slice B,
 *  which this module does not compute itself — it only carries the raw pair
 *  through per member). */
export interface ClusterableStanding {
  id: number;
  decklist: TournamentDecklist;
  wins: number;
  losses: number;
  ties: number;
  placing: number | null;
  totalPlayers: number | null;
  /** This standing's own game-by-game results vs each opponent archetype
   *  (Spec 10 Slice D) — carried through per member so a cluster can build a
   *  per-opponent breakdown across all its members, not just an aggregate
   *  W/L/T. Empty when the tournament's pairings weren't processed. */
  matchResults: StandingMatchResult[];
}

export interface DecklistCluster {
  /** The first standing's decklist encountered for this cluster — a
   *  reasonable "canonical" list to show the user, since every member is by
   *  definition within `minOverlapRatio` of it. */
  representative: TournamentDecklist;
  memberStandingIds: number[];
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  /** One entry per member standing that had BOTH a placing and a
   *  totalPlayers value (Bo1 events without a recorded placement, or the
   *  window fallback where the tournament's player count wasn't queried,
   *  are excluded rather than treated as a false "0"). */
  placements: { placing: number; totalPlayers: number }[];
  /** Concatenated matchResults of every member standing (Spec 10 Slice D) —
   *  raw per-game records, not yet aggregated per opponent; consumers that
   *  need a per-opponent breakdown (clusterFieldScore.ts) do that themselves. */
  matchResults: StandingMatchResult[];
}

function standingPlacementPercentile(s: ClusterableStanding): number | null {
  return s.totalPlayers == null ? null : placementPercentile(s.placing, s.totalPlayers);
}

/** Canonical processing order (Spec 1 §3.1): best placement percentile first
 *  (standings without a usable placement last), then wins − losses desc, then
 *  id asc. Makes clustering independent of the order the DB returns rows in. */
function compareCanonical(a: ClusterableStanding, b: ClusterableStanding): number {
  const pa = standingPlacementPercentile(a);
  const pb = standingPlacementPercentile(b);
  if (pa !== pb) {
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pb - pa;
  }
  const recordDiff = b.wins - b.losses - (a.wins - a.losses);
  if (recordDiff !== 0) return recordDiff;
  return a.id - b.id;
}

/**
 * Greedy single-pass clustering: each standing joins the first existing
 * cluster whose representative overlaps it by at least `minOverlapRatio`, or
 * starts a new cluster. This is a heuristic, not an optimal/exhaustive
 * pairwise clustering — acceptable here because clusters only ever need to
 * be "close enough to pool as one data point", not perfectly partitioned,
 * and the greedy pass is O(n * clusters) instead of O(n^2) list comparisons.
 * A cluster with a single member is kept as-is (never forced into another
 * cluster) — see spec "Nadel im Heuhaufen" requirement.
 *
 * Standings are processed in a canonical order (see `compareCanonical`), not
 * in caller order, so the same input set always yields the same clusters.
 */
export function clusterDecklists(
  standings: ClusterableStanding[],
  opts: { minOverlapRatio?: number } = {},
): DecklistCluster[] {
  const minOverlapRatio = opts.minOverlapRatio ?? DEFAULT_MIN_OVERLAP_RATIO;
  const clusters: DecklistCluster[] = [];

  const ordered = [...standings].sort(compareCanonical);

  for (const s of ordered) {
    const match = clusters.find(
      (c) => computeDecklistOverlap(c.representative, s.decklist).overlapRatio >= minOverlapRatio,
    );
    const placement =
      s.placing != null && s.totalPlayers != null
        ? [{ placing: s.placing, totalPlayers: s.totalPlayers }]
        : [];

    if (match) {
      match.memberStandingIds.push(s.id);
      match.totalWins += s.wins;
      match.totalLosses += s.losses;
      match.totalTies += s.ties;
      match.placements.push(...placement);
      match.matchResults.push(...s.matchResults);
    } else {
      clusters.push({
        representative: s.decklist,
        memberStandingIds: [s.id],
        totalWins: s.wins,
        totalLosses: s.losses,
        totalTies: s.ties,
        placements: placement,
        matchResults: [...s.matchResults],
      });
    }
  }

  return clusters;
}
