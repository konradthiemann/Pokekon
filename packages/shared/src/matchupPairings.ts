// Build a real head-to-head matchup matrix from Limitless round pairings, shared
// by the server sync job (producer of tournament_matchups rows) and its tests.
// This is what makes the win/loss rates reflect ACTUAL online-Bo1 matches
// (like the Limitless player page) instead of an external mixed-format source.
//
// The join key between a pairing and a deck is the player USERNAME: the
// standings endpoint maps `player` (username) → `deck.id` (archetype slug), and
// the pairings endpoint reports `player1`/`player2`/`winner` as those same
// usernames. No usernames are ever persisted — the sync builds the map in memory
// while it already holds the standings, then aggregates to archetype pairs.

import { OTHER_ARCHETYPE_ID } from './meta.js';

/** One tournament pairing, as far as matchup aggregation cares (Limitless shape).
 *  `winner` is the winning player's username, `0`/`"0"` for a tie, or
 *  `-1`/`"-1"`/absent for an incomplete match (bye, no-show, unreported). */
export interface PairingLite {
  player1?: string | null;
  player2?: string | null;
  winner?: string | number | null;
}

/** Aggregated head-to-head of two archetypes within one tournament. Canonical
 *  order `deckA < deckB` (string compare) so a pair is stored exactly once;
 *  `aWins` = games deckA won vs deckB, `bWins` the reverse, `ties` the draws. */
export interface TournamentMatchupAgg {
  deckA: string;
  deckB: string;
  aWins: number;
  bWins: number;
  ties: number;
}

/** Defensive upper bound on pairings processed per tournament — a huge event
 *  tops out in the low tens of thousands of games; more is malformed/hostile. */
const MAX_PAIRINGS = 50_000;

function isTie(winner: PairingLite['winner']): boolean {
  return winner === 0 || winner === '0';
}

function isIncomplete(winner: PairingLite['winner']): boolean {
  return winner === -1 || winner === '-1' || winner === null || winner === undefined;
}

/**
 * Aggregate raw pairings into per-archetype head-to-head records for one
 * tournament. Pairings are dropped (not counted) when a player is missing (bye),
 * either player's deck is unknown or `other`, the two decks are the mirror
 * (50 % by definition — no signal), or the match is incomplete. A tie increments
 * `ties`; otherwise the winner's archetype takes the win. The result is a list
 * of canonical `deckA < deckB` aggregates ready to upsert into tournament_matchups.
 */
export function computeMatchupsFromPairings(
  usernameToArchetype: Map<string, string>,
  pairings: PairingLite[],
): TournamentMatchupAgg[] {
  if (!Array.isArray(pairings)) return [];
  const byPair = new Map<string, TournamentMatchupAgg>();

  for (const p of pairings.slice(0, MAX_PAIRINGS)) {
    const p1 = typeof p.player1 === 'string' && p.player1 !== '' ? p.player1 : null;
    const p2 = typeof p.player2 === 'string' && p.player2 !== '' ? p.player2 : null;
    if (p1 === null || p2 === null || p1 === p2) continue; // bye / malformed
    if (isIncomplete(p.winner)) continue;

    const arch1 = usernameToArchetype.get(p1);
    const arch2 = usernameToArchetype.get(p2);
    if (!arch1 || !arch2) continue; // a player without a classified deck
    if (arch1 === OTHER_ARCHETYPE_ID || arch2 === OTHER_ARCHETYPE_ID) continue;
    if (arch1 === arch2) continue; // mirror → 50 % by convention, no data needed

    const [deckA, deckB] = arch1 < arch2 ? [arch1, arch2] : [arch2, arch1];
    const key = `${deckA}|${deckB}`;
    const agg = byPair.get(key) ?? { deckA, deckB, aWins: 0, bWins: 0, ties: 0 };

    if (isTie(p.winner)) {
      agg.ties += 1;
    } else if (p.winner === p1) {
      if (arch1 === deckA) agg.aWins += 1;
      else agg.bWins += 1;
    } else if (p.winner === p2) {
      if (arch2 === deckA) agg.aWins += 1;
      else agg.bWins += 1;
    } else {
      continue; // winner is neither player → malformed, don't count
    }
    byPair.set(key, agg);
  }

  return [...byPair.values()];
}
