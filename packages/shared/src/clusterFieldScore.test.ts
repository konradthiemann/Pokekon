import { describe, it, expect } from 'vitest';
import { computeClusterFieldScores, reorderClustersByFieldScore } from './clusterFieldScore.js';
import type { RankedCluster } from './clusterRanking.js';
import type { ArchetypeShare } from './fieldWinRate.js';
import type { TournamentDecklist } from './meta.js';
import type { StandingMatchResult } from './matchupPairings.js';

const PLACEHOLDER_DECKLIST: TournamentDecklist = { pokemon: [], trainer: [], energy: [] };

function rankedCluster(overrides: Partial<RankedCluster> = {}): RankedCluster {
  return {
    representative: PLACEHOLDER_DECKLIST,
    memberStandingIds: [1],
    totalWins: 0,
    totalLosses: 0,
    totalTies: 0,
    placements: [],
    matchResults: [],
    winRateLowerBoundPct: 0,
    winRateInterval: null,
    avgPlacementPercentile: null,
    rank: 1,
    ...overrides,
  };
}

describe('computeClusterFieldScores', () => {
  it('returns an empty map when the field is empty (no local field configured)', () => {
    const clusters = [rankedCluster({ rank: 1 })];
    expect(computeClusterFieldScores(clusters, [])).toEqual(new Map());
  });

  it('computes a FieldScore per cluster keyed by rank, aggregating each cluster’s matchResults per opponent', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 30 },
      { archetypeId: 'gardevoir-ex', archetypeName: 'Gardevoir ex', sharePct: 20 },
    ];

    // Cluster 1 (rank 1 by Wilson bound) crushes charizard-ex but has no data
    // vs gardevoir-ex.
    const matchResultsRank1: StandingMatchResult[] = [
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 },
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 2 },
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 3 },
    ];
    // Cluster 2 (rank 2) loses badly to both.
    const matchResultsRank2: StandingMatchResult[] = [
      { opponentArchetypeId: 'charizard-ex', result: 'L', round: 1 },
      { opponentArchetypeId: 'gardevoir-ex', result: 'L', round: 1 },
    ];

    const clusters = [
      rankedCluster({ rank: 1, matchResults: matchResultsRank1 }),
      rankedCluster({ rank: 2, memberStandingIds: [2], matchResults: matchResultsRank2 }),
    ];

    const scores = computeClusterFieldScores(clusters, field);
    expect(scores.size).toBe(2);

    const score1 = scores.get(1)!;
    expect(score1.fieldWinRatePct).not.toBeNull();
    // Covers only charizard-ex (30 share) + the mirror (0 share, synthetic) ->
    // coveredShare is computed against the synthetic shares list, so just
    // assert it is clearly favourable (100% vs charizard-ex).
    expect(score1.fieldWinRatePct).toBeGreaterThan(90);

    const score2 = scores.get(2)!;
    expect(score2.fieldWinRatePct).not.toBeNull();
    expect(score2.fieldWinRatePct).toBeLessThan(10);

    // Cluster 1 clearly outperforms cluster 2 against this field.
    expect(score1.fieldWinRatePct!).toBeGreaterThan(score2.fieldWinRatePct!);
  });

  it('does not include real field entries as keys in the returned map (only cluster ranks)', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 100 },
    ];
    const clusters = [
      rankedCluster({
        rank: 1,
        matchResults: [{ opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 }],
      }),
    ];
    const scores = computeClusterFieldScores(clusters, field);
    expect([...scores.keys()]).toEqual([1]);
  });

  it('yields a null-ish score (no coverage) for a cluster with no matchResults vs the field', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 100 },
    ];
    const clusters = [rankedCluster({ rank: 1, matchResults: [] })];
    const scores = computeClusterFieldScores(clusters, field);
    const score = scores.get(1);
    expect(score).toBeDefined();
    expect(score!.fieldWinRatePct).toBeNull();
  });
});

describe('reorderClustersByFieldScore', () => {
  it('returns the input unchanged when fieldScores is empty', () => {
    const clusters = [
      rankedCluster({ rank: 1 }),
      rankedCluster({ rank: 2, memberStandingIds: [2] }),
    ];
    const result = reorderClustersByFieldScore(clusters, new Map());
    expect(result).toBe(clusters);
  });

  it('moves a cluster with a better field score ahead of a cluster with a higher Wilson-lower-bound rank', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 100 },
    ];
    // Wilson-ranked #1 (overall best sample) but bad vs this specific field.
    const overallBest = rankedCluster({
      rank: 1,
      memberStandingIds: [1],
      winRateLowerBoundPct: 80,
      matchResults: [{ opponentArchetypeId: 'charizard-ex', result: 'L', round: 1 }],
    });
    // Wilson-ranked #2 overall, but crushes this specific field.
    const fieldFavourite = rankedCluster({
      rank: 2,
      memberStandingIds: [2],
      winRateLowerBoundPct: 40,
      matchResults: [
        { opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 },
        { opponentArchetypeId: 'charizard-ex', result: 'W', round: 2 },
        { opponentArchetypeId: 'charizard-ex', result: 'W', round: 3 },
      ],
    });

    const clusters = [overallBest, fieldFavourite];
    const fieldScores = computeClusterFieldScores(clusters, field);
    const reordered = reorderClustersByFieldScore(clusters, fieldScores);

    expect(reordered.map((c) => c.memberStandingIds[0])).toEqual([2, 1]);
    expect(reordered.map((c) => c.rank)).toEqual([1, 2]);
    expect(reordered[0].fieldScore).toBeDefined();
    expect(reordered[0].fieldScore!.fieldWinRatePct).toBeGreaterThan(
      reordered[1].fieldScore!.fieldWinRatePct!,
    );
  });

  it('keeps clusters without coverage against the field at the end, in their original relative order', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 100 },
    ];
    const covered = rankedCluster({
      rank: 2,
      memberStandingIds: [2],
      winRateLowerBoundPct: 30,
      matchResults: [{ opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 }],
    });
    const uncoveredA = rankedCluster({ rank: 1, memberStandingIds: [1], matchResults: [] });
    const uncoveredB = rankedCluster({ rank: 3, memberStandingIds: [3], matchResults: [] });

    const clusters = [uncoveredA, covered, uncoveredB];
    const fieldScores = computeClusterFieldScores(clusters, field);
    const reordered = reorderClustersByFieldScore(clusters, fieldScores);

    expect(reordered.map((c) => c.memberStandingIds[0])).toEqual([2, 1, 3]);
    // Both uncovered clusters still get a FieldScore object (computeFieldScores
    // returns one per subject) but with a null fieldWinRateLowPct — that null
    // is exactly what the sort treats as "no coverage" (see reorderClustersByFieldScore).
    expect(reordered[1].fieldScore?.fieldWinRateLowPct).toBeNull();
    expect(reordered[2].fieldScore?.fieldWinRateLowPct).toBeNull();
  });

  it('sets fieldScore to null for a cluster rank genuinely absent from the fieldScores map', () => {
    const clusterA = rankedCluster({ rank: 1, memberStandingIds: [1] });
    const clusterB = rankedCluster({ rank: 2, memberStandingIds: [2] });
    // Manually constructed map missing rank 2 entirely (not producible via
    // computeClusterFieldScores itself, but reorderClustersByFieldScore must
    // still handle it defensively).
    const fieldScores = new Map([
      [
        1,
        {
          archetypeId: 'x',
          archetypeName: 'x',
          sharePct: 0,
          fieldWinRatePct: 80,
          fieldWinRateLowPct: 70,
          fieldWinRateHighPct: 90,
          coveragePct: 100,
          mirrorSharePct: 0,
          rank: 1,
          threats: [],
          freeWins: [],
        },
      ],
    ]);
    const reordered = reorderClustersByFieldScore([clusterA, clusterB], fieldScores);
    const b = reordered.find((c) => c.memberStandingIds[0] === 2)!;
    expect(b.fieldScore).toBeNull();
  });

  it('does not mutate the input cluster objects', () => {
    const field: ArchetypeShare[] = [
      { archetypeId: 'charizard-ex', archetypeName: 'Charizard ex', sharePct: 100 },
    ];
    const original = rankedCluster({
      rank: 1,
      matchResults: [{ opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 }],
    });
    const clusters = [original];
    const fieldScores = computeClusterFieldScores(clusters, field);
    reorderClustersByFieldScore(clusters, fieldScores);
    expect(original).not.toHaveProperty('fieldScore');
  });
});
