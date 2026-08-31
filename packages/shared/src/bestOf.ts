// Bo1/Bo3 match-format bookkeeping (plan §3.2). A best-of-3 win rate is
// converted to its single-game (Bo1) equivalent via the closed-form inverse of
// P_Bo3 = 3p^2 - 2p^3, so a personal win rate can be compared to the Bo1-only
// meta baseline regardless of which format the individual logs were played in.

import { tournamentWinRate } from './winRate.js';

export const BEST_OF_VALUES = ['BO1', 'BO3'] as const;
export type BestOf = (typeof BEST_OF_VALUES)[number];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Probability of winning a Bo3 given a single-game win rate p: 3p^2 - 2p^3.
 *  p is clamped to [0, 1]. */
export function bo1ToBo3WinRate(p: number): number {
  const x = clamp01(p);
  return 3 * x ** 2 - 2 * x ** 3;
}

/** Inverse of `bo1ToBo3WinRate`: single-game win rate from a Bo3 win rate q.
 *  Closed form: 0.5 + sin(asin(2q - 1) / 3). q is clamped to [0, 1]. */
export function bo3ToBo1WinRate(q: number): number {
  const x = clamp01(q);
  const result = 0.5 + Math.sin(Math.asin(2 * x - 1) / 3);
  // Guard against floating-point dust at the fixed points (e.g. q=0 -> a value
  // like 5.5e-17 instead of exactly 0) so exact-fixed-point assertions hold.
  return clamp01(Math.round(result * 1e12) / 1e12);
}

export interface FormatRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface Bo1EquivalentInput {
  bo1: FormatRecord;
  bo3: FormatRecord;
  /** Logs without a known `bestOf` — excluded from the win rate, only counted. */
  unknown: FormatRecord;
}

export interface Bo1EquivalentWinRate {
  winRatePct: number | null;
  bo1Games: number;
  bo3Games: number;
  unknownGames: number;
  convertedFromBo3: boolean;
}

function totalGames(r: FormatRecord): number {
  return r.wins + r.losses + r.ties;
}

/**
 * Aggregate-level Bo1-equivalent win rate: the Bo1 group and the Bo3 group are
 * each tie-weighted, the Bo3 rate is converted back to Bo1 via
 * `bo3ToBo1WinRate`, and both are combined weighted by game count.
 */
export function bo1EquivalentWinRate(
  input: Bo1EquivalentInput,
  decimals = 0,
): Bo1EquivalentWinRate {
  const bo1Games = totalGames(input.bo1);
  const bo3Games = totalGames(input.bo3);
  const unknownGames = totalGames(input.unknown);

  const bo1Rate =
    bo1Games > 0 ? tournamentWinRate(input.bo1.wins, input.bo1.losses, input.bo1.ties) : null;
  const bo3Rate =
    bo3Games > 0 ? tournamentWinRate(input.bo3.wins, input.bo3.losses, input.bo3.ties) : null;
  const bo3RateAsBo1 = bo3Rate !== null ? bo3ToBo1WinRate(bo3Rate) : null;

  const weightedGames = bo1Games + bo3Games;
  let winRatePct: number | null = null;
  if (weightedGames > 0) {
    const weightedSum = (bo1Rate ?? 0) * bo1Games + (bo3RateAsBo1 ?? 0) * bo3Games;
    const fraction = weightedSum / weightedGames;
    const factor = 10 ** decimals;
    winRatePct = Math.round(fraction * 100 * factor) / factor;
  }

  return {
    winRatePct,
    bo1Games,
    bo3Games,
    unknownGames,
    convertedFromBo3: bo3Games > 0,
  };
}
