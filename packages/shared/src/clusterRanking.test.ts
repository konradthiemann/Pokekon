import { describe, it, expect } from 'vitest';
import { rankClusters } from './clusterRanking.js';
import type { DecklistCluster } from './decklistClustering.js';
import type { TournamentDecklist } from './meta.js';

// Ranking never reads card data, so every fixture shares the same trivial list.
const PLACEHOLDER_DECKLIST: TournamentDecklist = { pokemon: [], trainer: [], energy: [] };

function cluster(overrides: Partial<DecklistCluster> = {}): DecklistCluster {
  return {
    representative: PLACEHOLDER_DECKLIST,
    memberStandingIds: [1],
    totalWins: 0,
    totalLosses: 0,
    totalTies: 0,
    placements: [],
    matchResults: [],
    ...overrides,
  };
}

describe('rankClusters', () => {
  it('ranks by Wilson lower bound, not raw win rate: a small 100% sample does NOT beat a large 65% sample', () => {
    const luckySmallSample = cluster({
      memberStandingIds: [1],
      totalWins: 3,
      totalLosses: 0,
      totalTies: 0,
    });
    const largeConsistentSample = cluster({
      memberStandingIds: [2],
      totalWins: 26,
      totalLosses: 14,
      totalTies: 0,
    });

    const ranked = rankClusters([luckySmallSample, largeConsistentSample]);

    const lucky = ranked.find((c) => c.memberStandingIds.includes(1))!;
    const large = ranked.find((c) => c.memberStandingIds.includes(2))!;
    // Raw rates: 100% vs 65% — but the 3-game sample's Wilson lower bound is
    // far below the 40-game sample's, so the large sample ranks first.
    expect(large.rank).toBe(1);
    expect(lucky.rank).toBe(2);
    expect(large.winRateLowerBoundPct).toBeGreaterThan(lucky.winRateLowerBoundPct);
  });

  it('assigns rank 1..n in descending winRateLowerBoundPct order', () => {
    const ranked = rankClusters([
      cluster({ memberStandingIds: [1], totalWins: 10, totalLosses: 10 }),
      cluster({ memberStandingIds: [2], totalWins: 30, totalLosses: 5 }),
      cluster({ memberStandingIds: [3], totalWins: 5, totalLosses: 15 }),
    ]);

    expect(ranked.map((c) => c.memberStandingIds[0])).toEqual([2, 1, 3]);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].winRateLowerBoundPct).toBeGreaterThanOrEqual(
        ranked[i].winRateLowerBoundPct,
      );
    }
  });

  it('keeps a single-list, small-sample cluster in the output (never dropped), even when it ranks low', () => {
    // One tournament win, but only that one recorded match — the Wilson
    // lower bound will be low, but the cluster must still appear (spec
    // "Nadel im Heuhaufen": visible, not silently excluded).
    const nicheWinner = cluster({
      memberStandingIds: [1],
      totalWins: 1,
      totalLosses: 0,
      placements: [{ placing: 1, totalPlayers: 128 }],
    });
    const establishedList = cluster({
      memberStandingIds: [2],
      totalWins: 40,
      totalLosses: 20,
      totalTies: 0,
    });

    const ranked = rankClusters([nicheWinner, establishedList]);
    expect(ranked).toHaveLength(2);
    const niche = ranked.find((c) => c.memberStandingIds.includes(1))!;
    expect(niche.avgPlacementPercentile).toBe(1); // won the event
    expect(niche.winRateLowerBoundPct).toBeGreaterThanOrEqual(0);
  });

  it('averages placementPercentile across all recorded placements for a cluster', () => {
    const ranked = rankClusters([
      cluster({
        totalWins: 5,
        totalLosses: 5,
        placements: [
          { placing: 1, totalPlayers: 101 }, // percentile 1.0
          { placing: 51, totalPlayers: 101 }, // percentile 0.5
        ],
      }),
    ]);
    expect(ranked[0].avgPlacementPercentile).toBeCloseTo(0.75, 5);
  });

  it('returns null avgPlacementPercentile when the cluster has no usable placements', () => {
    const ranked = rankClusters([cluster({ totalWins: 5, totalLosses: 5, placements: [] })]);
    expect(ranked[0].avgPlacementPercentile).toBeNull();
  });

  it('treats a cluster with zero recorded games as lower-bound 0 with a null interval, not a crash', () => {
    const ranked = rankClusters([
      cluster({ totalWins: 0, totalLosses: 0, totalTies: 0 }),
      cluster({ memberStandingIds: [2], totalWins: 10, totalLosses: 5 }),
    ]);
    const empty = ranked.find((c) => c.memberStandingIds[0] === 1)!;
    expect(empty.winRateInterval).toBeNull();
    expect(empty.winRateLowerBoundPct).toBe(0);
    expect(empty.rank).toBe(2); // ranks below the cluster with actual games
  });
});

describe('rankClusters tie-breaks (Spec 1 §3.3, AC 4)', () => {
  // Same W/L/T everywhere ⇒ bit-identical winRateLowerBoundPct, so only the
  // tie-break chain decides. Inputs are deliberately in the WRONG order.
  const tied = (overrides: Partial<DecklistCluster>) =>
    cluster({ totalWins: 10, totalLosses: 5, ...overrides });
  const order = (clusters: DecklistCluster[]) =>
    rankClusters(clusters).map((c) => c.memberStandingIds);

  it('breaks a lower-bound tie by avgPlacementPercentile desc, null last', () => {
    const ranked = rankClusters([
      tied({ memberStandingIds: [1], placements: [] }),
      tied({ memberStandingIds: [2], placements: [{ placing: 51, totalPlayers: 101 }] }),
      tied({ memberStandingIds: [3], placements: [{ placing: 1, totalPlayers: 101 }] }),
    ]);
    expect(ranked.map((c) => c.memberStandingIds)).toEqual([[3], [2], [1]]);
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it('then by member count desc', () => {
    expect(order([tied({ memberStandingIds: [1] }), tied({ memberStandingIds: [5, 6] })])).toEqual([
      [5, 6],
      [1],
    ]);
  });

  it('then by smallest member id asc', () => {
    expect(order([tied({ memberStandingIds: [9] }), tied({ memberStandingIds: [4] })])).toEqual([
      [4],
      [9],
    ]);
  });

  it('produces the same ranking for every permutation of tied clusters', () => {
    const clusters = [
      tied({ memberStandingIds: [8] }),
      tied({ memberStandingIds: [2] }),
      tied({ memberStandingIds: [5, 7] }),
      tied({ memberStandingIds: [6], placements: [{ placing: 3, totalPlayers: 40 }] }),
    ];
    const expected = [[6], [5, 7], [2], [8]];
    const permute = (xs: DecklistCluster[]): DecklistCluster[][] =>
      xs.length <= 1
        ? [xs]
        : xs.flatMap((x, i) =>
            permute([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]),
          );
    const perms = permute(clusters);
    expect(perms).toHaveLength(24);
    for (const p of perms) expect(order(p)).toEqual(expected);
  });
});
