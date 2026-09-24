import { describe, it, expect } from 'vitest';
import {
  clusterDecklists,
  computeDecklistOverlap,
  DEFAULT_MIN_OVERLAP_RATIO,
  type ClusterableStanding,
} from './decklistClustering.js';
import { rankClusters } from './clusterRanking.js';
import { mulberry32 } from './deterministicRandom.js';
import type { TournamentDecklist } from './meta.js';
import type { StandingMatchResult } from './matchupPairings.js';

// 60-card baseline (9 Pokémon + 35 Trainer + 16 Energy) — used as the "A" list
// in every overlap test below, mutated per case via the spread overrides so
// each test shows exactly which cards differ.
function baseDecklist(overrides: Partial<TournamentDecklist> = {}): TournamentDecklist {
  return {
    pokemon: [
      { name: 'Dragapult ex', count: 3 },
      { name: 'Dreepy', count: 4 },
      { name: 'Drakloak', count: 2 },
    ],
    trainer: [
      { name: 'Iono', count: 4 },
      { name: 'Arven', count: 4 },
      { name: 'Nest Ball', count: 4 },
      { name: 'Ultra Ball', count: 4 },
      { name: "Boss's Orders", count: 2 },
      { name: 'Rare Candy', count: 4 },
      { name: 'Buddy-Buddy Poffin', count: 4 },
      { name: 'Counter Catcher', count: 2 },
      { name: 'Super Rod', count: 1 },
      { name: 'Switch', count: 2 },
      { name: 'Earthen Vessel', count: 2 },
      { name: 'Night Stretcher', count: 2 },
    ],
    energy: [
      { name: 'Basic Psychic Energy', count: 9 },
      { name: 'Basic Fire Energy', count: 7 },
    ],
    ...overrides,
  };
}

function standing(overrides: Partial<ClusterableStanding> = {}): ClusterableStanding {
  return {
    id: 1,
    decklist: baseDecklist(),
    wins: 0,
    losses: 0,
    ties: 0,
    placing: null,
    totalPlayers: null,
    matchResults: [],
    ...overrides,
  };
}

describe('computeDecklistOverlap', () => {
  it('returns 60/60 (ratio 1) for two identical lists', () => {
    const overlap = computeDecklistOverlap(baseDecklist(), baseDecklist());
    expect(overlap.identicalCards).toBe(60);
    expect(overlap.overlapRatio).toBe(1);
  });

  it('counts a 2-card swap as 58/60 identical', () => {
    const swapped = baseDecklist({
      trainer: [
        { name: 'Iono', count: 4 },
        { name: 'Arven', count: 4 },
        { name: 'Nest Ball', count: 4 },
        { name: 'Ultra Ball', count: 4 },
        { name: "Boss's Orders", count: 2 },
        { name: 'Rare Candy', count: 4 },
        { name: 'Buddy-Buddy Poffin', count: 4 },
        { name: 'Counter Catcher', count: 2 },
        { name: 'Super Rod', count: 1 },
        { name: 'Field Blower', count: 2 }, // was "Switch" x2
        { name: 'Earthen Vessel', count: 2 },
        { name: 'Night Stretcher', count: 2 },
      ],
    });
    const overlap = computeDecklistOverlap(baseDecklist(), swapped);
    expect(overlap.identicalCards).toBe(58);
    expect(overlap.overlapRatio).toBeCloseTo(58 / 60, 5);
  });

  it('is case/whitespace-insensitive via normalizeCardName (same card, different casing)', () => {
    const respelled = baseDecklist({
      pokemon: [
        { name: '  dragapult EX ', count: 3 },
        { name: 'Dreepy', count: 4 },
        { name: 'Drakloak', count: 2 },
      ],
    });
    const overlap = computeDecklistOverlap(baseDecklist(), respelled);
    expect(overlap.identicalCards).toBe(60);
  });

  it('returns 0 identical cards for two lists sharing no cards at all', () => {
    const disjoint = baseDecklist({
      pokemon: [{ name: 'Charizard ex', count: 2 }],
      trainer: [{ name: 'Professor’s Research', count: 4 }],
      energy: [{ name: 'Basic Water Energy', count: 15 }],
    });
    const overlap = computeDecklistOverlap(baseDecklist(), disjoint);
    expect(overlap.identicalCards).toBe(0);
    expect(overlap.overlapRatio).toBe(0);
  });
});

describe('clusterDecklists', () => {
  it('merges a near-identical list (58/60, above the default threshold) into the same cluster and sums its record', () => {
    const nearIdentical = baseDecklist({
      trainer: [
        { name: 'Iono', count: 4 },
        { name: 'Arven', count: 4 },
        { name: 'Nest Ball', count: 4 },
        { name: 'Ultra Ball', count: 4 },
        { name: "Boss's Orders", count: 2 },
        { name: 'Rare Candy', count: 4 },
        { name: 'Buddy-Buddy Poffin', count: 4 },
        { name: 'Counter Catcher', count: 2 },
        { name: 'Super Rod', count: 1 },
        { name: 'Field Blower', count: 2 }, // was "Switch" x2 — 58/60 overlap
        { name: 'Earthen Vessel', count: 2 },
        { name: 'Night Stretcher', count: 2 },
      ],
    });
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist(), wins: 6, losses: 1, ties: 0 }),
      standing({ id: 2, decklist: nearIdentical, wins: 4, losses: 2, ties: 1 }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberStandingIds.sort()).toEqual([1, 2]);
    expect(clusters[0].totalWins).toBe(10);
    expect(clusters[0].totalLosses).toBe(3);
    expect(clusters[0].totalTies).toBe(1);
  });

  it('keeps a clearly different list (6-card swap, below the default threshold) as its own cluster', () => {
    const different = baseDecklist({
      trainer: [
        { name: 'Iono', count: 4 },
        { name: 'Arven', count: 4 },
        { name: 'Nest Ball', count: 4 },
        { name: 'Ultra Ball', count: 4 },
        { name: "Boss's Orders", count: 2 },
        { name: 'Rare Candy', count: 4 },
        { name: 'Buddy-Buddy Poffin', count: 4 },
        { name: 'Counter Catcher', count: 2 },
        { name: 'Super Rod', count: 1 },
        { name: 'Field Blower', count: 2 }, // was "Switch" x2
        { name: 'Lost Vacuum', count: 2 }, // was "Earthen Vessel" x2
        { name: 'Klawf', count: 2 }, // was "Night Stretcher" x2 -> 54/60
      ],
    });
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist() }),
      standing({ id: 2, decklist: different }),
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.memberStandingIds)).toEqual([[1], [2]]);
  });

  it('keeps a single-list cluster even though it is not merged with anything ("needle in the haystack")', () => {
    const unique = baseDecklist({ pokemon: [{ name: 'Some Rogue Tech ex', count: 1 }] });
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist() }),
      standing({ id: 2, decklist: unique }),
    ]);

    expect(clusters).toHaveLength(2);
    const rogue = clusters.find((c) => c.memberStandingIds.includes(2));
    expect(rogue).toBeDefined();
    expect(rogue?.memberStandingIds).toEqual([2]);
  });

  it('collects placements only from standings that have both a placing and a totalPlayers value', () => {
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist(), placing: 1, totalPlayers: 128 }),
      standing({ id: 2, decklist: baseDecklist(), placing: null, totalPlayers: 64 }),
      standing({ id: 3, decklist: baseDecklist(), placing: 5, totalPlayers: null }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].placements).toEqual([{ placing: 1, totalPlayers: 128 }]);
  });

  it('respects a custom minOverlapRatio', () => {
    const oneCardOff = baseDecklist({
      energy: [
        { name: 'Basic Psychic Energy', count: 9 },
        { name: 'Basic Grass Energy', count: 7 }, // was "Basic Fire Energy" x7 -> 53/60
      ],
    });
    const strict = clusterDecklists(
      [standing({ id: 1, decklist: baseDecklist() }), standing({ id: 2, decklist: oneCardOff })],
      { minOverlapRatio: 59 / 60 },
    );
    expect(strict).toHaveLength(2);

    const lenient = clusterDecklists(
      [standing({ id: 1, decklist: baseDecklist() }), standing({ id: 2, decklist: oneCardOff })],
      { minOverlapRatio: 0.5 },
    );
    expect(lenient).toHaveLength(1);
  });

  it('exposes the default threshold as 55/60', () => {
    expect(DEFAULT_MIN_OVERLAP_RATIO).toBeCloseTo(55 / 60, 5);
  });

  it('concatenates matchResults across every clustered member (needed for Spec 10 Slice D field-weighting)', () => {
    const matchResultsA: StandingMatchResult[] = [
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 },
      { opponentArchetypeId: 'gardevoir-ex', result: 'L', round: 2 },
    ];
    const matchResultsB: StandingMatchResult[] = [
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 },
    ];
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist(), matchResults: matchResultsA }),
      standing({ id: 2, decklist: baseDecklist(), matchResults: matchResultsB }),
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].matchResults).toEqual([...matchResultsA, ...matchResultsB]);
  });

  it('starts a new cluster with only its own standing matchResults (not leaked from an unrelated cluster)', () => {
    const different = baseDecklist({
      trainer: [
        { name: 'Iono', count: 4 },
        { name: 'Arven', count: 4 },
        { name: 'Nest Ball', count: 4 },
        { name: 'Ultra Ball', count: 4 },
        { name: "Boss's Orders", count: 2 },
        { name: 'Rare Candy', count: 4 },
        { name: 'Buddy-Buddy Poffin', count: 4 },
        { name: 'Counter Catcher', count: 2 },
        { name: 'Super Rod', count: 1 },
        { name: 'Lost Vacuum', count: 2 },
        { name: 'Klawf', count: 2 },
        { name: 'Field Blower', count: 2 },
      ],
    });
    const matchResultsA: StandingMatchResult[] = [
      { opponentArchetypeId: 'charizard-ex', result: 'W', round: 1 },
    ];
    const matchResultsB: StandingMatchResult[] = [
      { opponentArchetypeId: 'gardevoir-ex', result: 'L', round: 1 },
    ];
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: baseDecklist(), matchResults: matchResultsA }),
      standing({ id: 2, decklist: different, matchResults: matchResultsB }),
    ]);

    expect(clusters).toHaveLength(2);
    const clusterA = clusters.find((c) => c.memberStandingIds.includes(1))!;
    const clusterB = clusters.find((c) => c.memberStandingIds.includes(2))!;
    expect(clusterA.matchResults).toEqual(matchResultsA);
    expect(clusterB.matchResults).toEqual(matchResultsB);
  });
});

// ---------------------------------------------------------------------------
// Spec 1 (specs/archetype-list-foundation.md) — determinism + medoid
// ---------------------------------------------------------------------------

/** Returns a copy of `list` with the given card counts set. A count of 0
 *  removes the card; a name not yet in the list is appended to `trainer`. */
function withCounts(list: TournamentDecklist, changes: Record<string, number>): TournamentDecklist {
  const pending = new Map(Object.entries(changes));
  const apply = (entries: TournamentDecklist['pokemon']) =>
    entries
      .map((e) => {
        const next = pending.get(e.name);
        pending.delete(e.name);
        return next === undefined ? e : { ...e, count: next };
      })
      .filter((e) => e.count > 0);
  const pokemon = apply(list.pokemon);
  const trainer = apply(list.trainer);
  const energy = apply(list.energy);
  for (const [name, count] of pending) if (count > 0) trainer.push({ name, count });
  return { pokemon, trainer, energy };
}

/** A completely different 60-card deck (overlap with baseDecklist() is only
 *  the 7 shared Basic Fire Energy, far below the cluster threshold). */
function otherDeck(tag: string): TournamentDecklist {
  return {
    pokemon: [{ name: `${tag} Pokémon`, count: 12 }],
    trainer: [{ name: `${tag} Trainer`, count: 32 }],
    energy: [{ name: 'Basic Fire Energy', count: 16 }],
  };
}

// Chain A–B–C: A~B = 57, B~C = 57, A~C = 54 (< 55). Greedy clustering on this
// chain depends on who founds the cluster, which is exactly the
// order-dependence Spec 1 removes.
function chainDecklists(): { A: TournamentDecklist; B: TournamentDecklist; C: TournamentDecklist } {
  const A = baseDecklist();
  const B = withCounts(A, { Switch: 0, 'Field Blower': 2, 'Super Rod': 0, 'Lost Vacuum': 1 });
  const C = withCounts(B, { 'Earthen Vessel': 0, Klawf: 2, 'Counter Catcher': 1, 'Pal Pad': 1 });
  return { A, B, C };
}

function shuffled<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('Spec 1 fixtures (sanity)', () => {
  it('chain overlaps are 57 / 57 / 54', () => {
    const { A, B, C } = chainDecklists();
    expect(computeDecklistOverlap(A, B).identicalCards).toBe(57);
    expect(computeDecklistOverlap(B, C).identicalCards).toBe(57);
    expect(computeDecklistOverlap(A, C).identicalCards).toBe(54);
  });
});

describe('clusterDecklists + rankClusters: order independence (Spec 1 AC 1)', () => {
  it('yields identical clusters, ranking and representatives for 20+ seeded shuffles of the same standings', () => {
    const { A, B, C } = chainDecklists();
    const input: ClusterableStanding[] = [
      standing({ id: 1, decklist: A, placing: 2, totalPlayers: 50, wins: 6, losses: 1 }),
      standing({ id: 2, decklist: B, wins: 4, losses: 2 }),
      // C ends up alone; E has the same W/L/T ⇒ equal Wilson lower bound.
      standing({ id: 3, decklist: C, wins: 3, losses: 1 }),
      // Same placement percentile AND same wins − losses ⇒ only id breaks the tie.
      standing({
        id: 5,
        decklist: otherDeck('D'),
        placing: 5,
        totalPlayers: 50,
        wins: 4,
        losses: 2,
      }),
      standing({
        id: 4,
        decklist: otherDeck('D'),
        placing: 5,
        totalPlayers: 50,
        wins: 4,
        losses: 2,
      }),
      standing({ id: 6, decklist: otherDeck('E'), wins: 3, losses: 1 }),
      standing({ id: 7, decklist: otherDeck('F') }),
      standing({ id: 8, decklist: otherDeck('F'), wins: 1, losses: 3 }),
    ];
    const project = (standings: ClusterableStanding[]) =>
      rankClusters(clusterDecklists(standings)).map((c) => ({
        ids: c.memberStandingIds,
        rank: c.rank,
        representative: c.representative,
      }));

    const baseline = project(input);
    const seenOrders = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      const order = shuffled(input, mulberry32(seed));
      seenOrders.add(order.map((s) => s.id).join(','));
      expect(project(order)).toEqual(baseline);
    }
    expect(seenOrders.size).toBeGreaterThan(1);
  });
});

describe('clusterDecklists canonical input order (Spec 1 §3.1)', () => {
  it('lets the best-placed standing found the cluster, regardless of input position', () => {
    const { A, B, C } = chainDecklists();
    const clusters = clusterDecklists([
      standing({ id: 3, decklist: C }),
      standing({ id: 2, decklist: B }),
      standing({ id: 1, decklist: A, placing: 1, totalPlayers: 100 }),
    ]);
    expect(clusters.map((c) => c.memberStandingIds)).toEqual([[1, 2], [3]]);
  });

  it('orders by placementPercentile, not raw placing, across tournaments of different size', () => {
    const clusters = clusterDecklists([
      standing({ id: 1, placing: 3, totalPlayers: 10 }), // ≈ 0.778
      standing({ id: 2, placing: 20, totalPlayers: 200 }), // ≈ 0.905
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.memberStandingIds).toEqual([2, 1]);
  });

  it('sorts standings without a usable placement after those with one', () => {
    const clusters = clusterDecklists([
      standing({ id: 1, placing: null, totalPlayers: 100 }),
      standing({ id: 2, placing: 10, totalPlayers: null }),
      standing({ id: 3, placing: 90, totalPlayers: 100 }),
    ]);
    expect(clusters[0]!.memberStandingIds[0]).toBe(3);
  });

  it('breaks placement ties by wins − losses desc, then by id asc', () => {
    const byRecord = clusterDecklists([
      standing({ id: 3, wins: 2, losses: 2 }),
      standing({ id: 7, wins: 6, losses: 1 }),
    ]);
    expect(byRecord[0]!.memberStandingIds).toEqual([7, 3]);

    const byId = clusterDecklists([
      standing({ id: 9, wins: 3, losses: 1 }),
      standing({ id: 4, wins: 3, losses: 1 }),
    ]);
    expect(byId[0]!.memberStandingIds).toEqual([4, 9]);
  });

  it("does not mutate the caller's standings array", () => {
    const input = [standing({ id: 2 }), standing({ id: 1, placing: 1, totalPlayers: 10 })];
    const before = input.map((s) => s.id);
    clusterDecklists(input);
    expect(input.map((s) => s.id)).toEqual(before);
  });

  it('keeps cluster membership unchanged for already canonically sorted input (Spec 1 AC 6)', () => {
    const { A, B, C } = chainDecklists();
    const clusters = clusterDecklists([
      standing({ id: 1, decklist: A, placing: 1, totalPlayers: 100 }),
      standing({ id: 2, decklist: B }),
      standing({ id: 3, decklist: C }),
    ]);
    expect(clusters.map((c) => c.memberStandingIds)).toEqual([[1, 2], [3]]);
  });
});
