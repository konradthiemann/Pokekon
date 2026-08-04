import { describe, it, expect } from 'vitest';
import {
  computeMatchupsFromPairings,
  computeStandingMatchResults,
  type PairingLite,
} from './matchupPairings.js';

// player → archetype map like the sync builds from a tournament's standings.
const decks = new Map<string, string>([
  ['alice', 'dragapult-ex'],
  ['bob', 'n-zoroark'],
  ['carol', 'dragapult-ex'],
  ['dave', 'raging-bolt-ex'],
  ['erin', 'other'],
]);

describe('computeMatchupsFromPairings', () => {
  it('aggregates a decided match into the canonical deckA<deckB pair', () => {
    // alice (dragapult-ex) beats bob (n-zoroark). Canonical order: dragapult-ex < n-zoroark.
    const pairings: PairingLite[] = [{ player1: 'alice', player2: 'bob', winner: 'alice' }];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([
      { deckA: 'dragapult-ex', deckB: 'n-zoroark', aWins: 1, bWins: 0, ties: 0 },
    ]);
  });

  it('assigns the win to the right side regardless of player order', () => {
    // bob (n-zoroark, the B side) wins — should land in bWins, not aWins.
    const pairings: PairingLite[] = [{ player1: 'alice', player2: 'bob', winner: 'bob' }];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([
      { deckA: 'dragapult-ex', deckB: 'n-zoroark', aWins: 0, bWins: 1, ties: 0 },
    ]);
  });

  it('counts ties (winner 0 or "0") without a winner', () => {
    const pairings: PairingLite[] = [
      { player1: 'alice', player2: 'bob', winner: 0 },
      { player1: 'bob', player2: 'alice', winner: '0' },
    ];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([
      { deckA: 'dragapult-ex', deckB: 'n-zoroark', aWins: 0, bWins: 0, ties: 2 },
    ]);
  });

  it('accumulates repeated meetings of the same pair', () => {
    const pairings: PairingLite[] = [
      { player1: 'alice', player2: 'bob', winner: 'alice' }, // dragapult win
      { player1: 'bob', player2: 'carol', winner: 'carol' }, // carol is dragapult too → dragapult win
      { player1: 'alice', player2: 'bob', winner: 'bob' }, // n-zoroark win
    ];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([
      { deckA: 'dragapult-ex', deckB: 'n-zoroark', aWins: 2, bWins: 1, ties: 0 },
    ]);
  });

  it('skips byes, unknown players, and the "other" bucket', () => {
    const pairings: PairingLite[] = [
      { player1: 'alice', player2: null, winner: 'alice' }, // bye
      { player1: 'alice', winner: 'alice' }, // no opponent
      { player1: 'alice', player2: 'zoe', winner: 'alice' }, // zoe not in standings
      { player1: 'alice', player2: 'erin', winner: 'alice' }, // erin = other
    ];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([]);
  });

  it('skips mirrors and incomplete matches', () => {
    const pairings: PairingLite[] = [
      { player1: 'alice', player2: 'carol', winner: 'alice' }, // dragapult mirror
      { player1: 'alice', player2: 'bob', winner: -1 }, // incomplete
      { player1: 'alice', player2: 'bob', winner: '-1' }, // incomplete (string)
      { player1: 'alice', player2: 'bob' }, // no winner field
    ];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([]);
  });

  it('drops a pairing whose winner is neither player (malformed)', () => {
    const pairings: PairingLite[] = [{ player1: 'alice', player2: 'bob', winner: 'dave' }];
    expect(computeMatchupsFromPairings(decks, pairings)).toEqual([]);
  });

  it('keeps distinct pairs separate', () => {
    const pairings: PairingLite[] = [
      { player1: 'alice', player2: 'bob', winner: 'alice' }, // dragapult vs n-zoroark
      { player1: 'alice', player2: 'dave', winner: 'dave' }, // dragapult vs raging-bolt
    ];
    const result = computeMatchupsFromPairings(decks, pairings);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      deckA: 'dragapult-ex',
      deckB: 'n-zoroark',
      aWins: 1,
      bWins: 0,
      ties: 0,
    });
    // dragapult-ex < raging-bolt-ex; dave (raging-bolt) won → bWins.
    expect(result).toContainEqual({
      deckA: 'dragapult-ex',
      deckB: 'raging-bolt-ex',
      aWins: 0,
      bWins: 1,
      ties: 0,
    });
  });

  it('returns [] for a non-array input', () => {
    expect(computeMatchupsFromPairings(decks, null as unknown as PairingLite[])).toEqual([]);
  });
});

describe('computeStandingMatchResults', () => {
  it('records per-pilot W/L for both players with the round and opponent archetype', () => {
    const res = computeStandingMatchResults(decks, [
      { round: 3, player1: 'alice', player2: 'bob', winner: 'alice' },
    ]);
    expect(res.get('alice')).toEqual([{ opponentArchetypeId: 'n-zoroark', result: 'W', round: 3 }]);
    expect(res.get('bob')).toEqual([
      { opponentArchetypeId: 'dragapult-ex', result: 'L', round: 3 },
    ]);
  });

  it('records ties for both players and keeps games vs the "other" bucket', () => {
    const res = computeStandingMatchResults(decks, [
      { round: 1, player1: 'alice', player2: 'bob', winner: 0 },
      { round: 2, player1: 'alice', player2: 'erin', winner: 'alice' }, // erin = other
    ]);
    expect(res.get('alice')).toEqual([
      { opponentArchetypeId: 'n-zoroark', result: 'T', round: 1 },
      { opponentArchetypeId: 'other', result: 'W', round: 2 },
    ]);
  });

  it('skips byes and incomplete matches', () => {
    const res = computeStandingMatchResults(decks, [
      { round: 1, player1: 'alice', winner: 'alice' }, // bye
      { round: 2, player1: 'alice', player2: 'bob', winner: -1 }, // incomplete
    ]);
    expect(res.size).toBe(0);
  });
});
