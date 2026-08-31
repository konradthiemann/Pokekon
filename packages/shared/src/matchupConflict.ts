// Flags matchup pairs where our own pairing data contradicts the TrainerHill
// fallback by more than a threshold (plan §3.3). Pure and I/O-free: the caller
// (routes/meta.ts) decides what to do with the result (log + expose count).
//
// Known limitation (plan §6 risk 4): TrainerHill's tie convention in its
// `win_rate` column is unknown (matchupCsv.ts takes it verbatim) — this check
// may therefore compare two differently-defined percentages. It is a hint for
// a human to look at, not an auto-fix, precisely because of that ambiguity.

import { MIN_MATCHUP_GAMES } from './fieldWinRate.js';
import type { MatchupRow } from './matchupCsv.js';

/** Above this absolute difference (percentage points) two sources are
 *  considered contradictory. */
export const MATCHUP_CONFLICT_THRESHOLD_PP = 15;

export interface MatchupConflict {
  /** Canonically sorted: deck1 < deck2 (each pair appears exactly once). */
  deck1: string;
  deck2: string;
  /** Win rate from our own pairing data, 0-100, from deck1's perspective. */
  ownWinRate: number;
  /** Win rate from the TrainerHill fallback, 0-100, from deck1's perspective. */
  fallbackWinRate: number;
  /** |ownWinRate - fallbackWinRate|, rounded to 1 decimal. */
  deltaPp: number;
  ownGames: number;
  fallbackGames: number;
}

/** Flips a directed row to the canonical deck1 < deck2 order, if needed. */
function canonicalize(row: MatchupRow): MatchupRow {
  if (row.deck1 <= row.deck2) return row;
  return {
    deck1: row.deck2,
    deck2: row.deck1,
    wins: row.losses,
    losses: row.wins,
    ties: row.ties,
    total: row.total,
    winRate: Math.round((100 - row.winRate) * 10) / 10,
  };
}

/**
 * Finds pairs present in both sources where the own data overrides the
 * fallback (>= minOwnGames) and whose win rates differ by more than
 * `thresholdPp`. Sorted by deltaPp descending, then deck1, then deck2.
 */
export function detectMatchupConflicts(
  own: MatchupRow[],
  fallback: MatchupRow[],
  opts?: { thresholdPp?: number; minOwnGames?: number },
): MatchupConflict[] {
  const thresholdPp = opts?.thresholdPp ?? MATCHUP_CONFLICT_THRESHOLD_PP;
  const minOwnGames = opts?.minOwnGames ?? MIN_MATCHUP_GAMES;

  const fallbackByKey = new Map<string, MatchupRow>();
  for (const r of fallback) {
    const c = canonicalize(r);
    fallbackByKey.set(`${c.deck1}|${c.deck2}`, c);
  }

  const conflicts: MatchupConflict[] = [];
  const seenKeys = new Set<string>();
  for (const r of own) {
    if (r.total < minOwnGames) continue;
    const c = canonicalize(r);
    const key = `${c.deck1}|${c.deck2}`;
    if (seenKeys.has(key)) continue; // one entry per canonical pair
    const fb = fallbackByKey.get(key);
    if (!fb) continue;
    const deltaPp = Math.round(Math.abs(c.winRate - fb.winRate) * 10) / 10;
    if (deltaPp <= thresholdPp) continue;
    seenKeys.add(key);
    conflicts.push({
      deck1: c.deck1,
      deck2: c.deck2,
      ownWinRate: c.winRate,
      fallbackWinRate: fb.winRate,
      deltaPp,
      ownGames: c.total,
      fallbackGames: fb.total,
    });
  }

  return conflicts.sort(
    (a, b) =>
      b.deltaPp - a.deltaPp || a.deck1.localeCompare(b.deck1) || a.deck2.localeCompare(b.deck2),
  );
}
