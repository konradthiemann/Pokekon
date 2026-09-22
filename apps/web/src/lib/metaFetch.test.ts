import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_MIN_TOURNAMENT_PLAYERS } from '@pokekon/shared';
import { summarizeStandings, fetchRecentTournaments } from './metaFetch';

// LimitlessStanding shape: { deck?: {id,name}, record: {wins,losses,ties}, placing: number|null }
const rec = (wins: number, losses: number) => ({ wins, losses, ties: 0 });

describe('summarizeStandings', () => {
  it('marks the placing-1 deck as the winner and ranks the rest by player count', () => {
    const { topArchetypes, winnerArchetype } = summarizeStandings([
      { deck: { id: 'a', name: 'Charizard' }, record: rec(6, 0), placing: 1 },
      { deck: { id: 'a', name: 'Charizard' }, record: rec(4, 2), placing: 4 },
      { deck: { id: 'b', name: 'Gardevoir' }, record: rec(5, 1), placing: 2 },
    ]);
    expect(winnerArchetype).toBe('Charizard');
    // Charizard has 2 players, Gardevoir 1 → count order.
    expect(topArchetypes.map((a) => a.name)).toEqual(['Charizard', 'Gardevoir']);
  });

  it('replaces the 5th entry with the winner when it is not in the top 5 by count', () => {
    const standings = [
      // Winner placed 1st but is a fringe deck (single pilot).
      { deck: { id: 'w', name: 'WinnerDeck' }, record: rec(6, 0), placing: 1 },
    ];
    // Five popular decks with 3 pilots each.
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      for (let k = 0; k < 3; k++) {
        standings.push({ deck: { id: name, name }, record: rec(2, 2), placing: 2 });
      }
    }

    const { topArchetypes, winnerArchetype } = summarizeStandings(standings);
    expect(winnerArchetype).toBe('WinnerDeck');
    expect(topArchetypes).toHaveLength(5);
    // The four most-played stay; the 5th slot is given to the winner.
    expect(topArchetypes.map((a) => a.name)).toEqual(['A', 'B', 'C', 'D', 'WinnerDeck']);
  });

  it('keeps the winner in place when it is already within the top 5', () => {
    const standings = [
      { deck: { id: 'a', name: 'A' }, record: rec(5, 1), placing: 2 },
      { deck: { id: 'a', name: 'A' }, record: rec(4, 2), placing: 5 },
      { deck: { id: 'w', name: 'WinnerDeck' }, record: rec(6, 0), placing: 1 },
    ];
    const { topArchetypes, winnerArchetype } = summarizeStandings(standings);
    expect(winnerArchetype).toBe('WinnerDeck');
    // A (2 players) ranks before WinnerDeck (1) — winner is not moved to the front.
    expect(topArchetypes.map((a) => a.name)).toEqual(['A', 'WinnerDeck']);
  });

  it('returns a null winner when 1st place has no known deck ("Other")', () => {
    const { topArchetypes, winnerArchetype } = summarizeStandings([
      { record: rec(6, 0), placing: 1 },
      { deck: { id: 'a', name: 'Charizard' }, record: rec(4, 2), placing: 2 },
    ]);
    expect(winnerArchetype).toBeNull();
    expect(topArchetypes.map((a) => a.name)).toEqual(['Charizard']); // "Other" excluded
  });

  it('falls back to the first standing when no placing is exactly 1', () => {
    const { winnerArchetype } = summarizeStandings([
      { deck: { id: 'a', name: 'Charizard' }, record: rec(6, 0), placing: null },
      { deck: { id: 'b', name: 'Gardevoir' }, record: rec(4, 2), placing: null },
    ]);
    expect(winnerArchetype).toBe('Charizard');
  });
});

// Spec 10 Slice G: `fetchRecentTournaments` used to default `minPlayers` to
// its own local literal (30), independent of `syncMeta.ts` (16) and
// `MetaPage.tsx` (30) — three values with no shared source of truth. This
// pins the new shared default end-to-end (not just the constant's value).
function limitlessTournament(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 't1',
    name: 'Test Cup',
    format: 'standard',
    players: 20,
    date: new Date().toISOString(),
    organizerId: 1,
    ...overrides,
  };
}

describe('fetchRecentTournaments — shared min-player default (Spec 10 Slice G)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/tournaments?')) {
          return {
            ok: true,
            json: async () => [
              limitlessTournament({ id: 'big', players: 20 }),
              limitlessTournament({ id: 'small', players: 10 }),
            ],
          } as Response;
        }
        // Standings lookups for each eligible tournament — empty is fine,
        // this test only cares about which tournaments pass the filter.
        return { ok: true, json: async () => [] } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(`defaults to excluding tournaments below ${DEFAULT_MIN_TOURNAMENT_PLAYERS} players`, async () => {
    const results = await fetchRecentTournaments({ onlineOnly: false });
    expect(results.map((r) => r.id)).toEqual(['big']);
  });

  it('includes smaller tournaments when minPlayers is explicitly lowered', async () => {
    const results = await fetchRecentTournaments({ minPlayers: 5, onlineOnly: false });
    expect(results.map((r) => r.id).sort()).toEqual(['big', 'small']);
  });
});
