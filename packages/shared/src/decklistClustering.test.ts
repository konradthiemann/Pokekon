import { describe, it, expect } from 'vitest';
import {
  clusterDecklists,
  computeDecklistOverlap,
  DEFAULT_MIN_OVERLAP_RATIO,
  type ClusterableStanding,
} from './decklistClustering.js';
import type { TournamentDecklist } from './meta.js';

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
});
