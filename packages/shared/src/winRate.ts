// Turns a W/L/T record into the official tournament win rate: a tie counts as
// a third of a win — (wins + ties/3) / (wins + losses + ties). Single source
// of truth for meta snapshots, the matchup matrix and personal win rates
// (plan §3.1 — implemented by @implementer, this file is a tester stub).

/** Official tournament weighting: a tie counts as a third of a win. */
export const TIE_WEIGHT = 1 / 3;

/**
 * (wins + ties/3) / (wins + losses + ties) as a fraction 0..1. `null` when no
 * game was played at all (wins + losses + ties === 0). Non-finite or negative
 * inputs are defensively treated as 0.
 */
export function tournamentWinRate(wins: number, losses: number, ties = 0): number | null {
  const safeWins = Number.isFinite(wins) && wins > 0 ? wins : 0;
  const safeLosses = Number.isFinite(losses) && losses > 0 ? losses : 0;
  const safeTies = Number.isFinite(ties) && ties > 0 ? ties : 0;
  const decisive = safeWins + safeLosses + safeTies;
  if (decisive === 0) return null;
  return (safeWins + safeTies * TIE_WEIGHT) / decisive;
}

/** Same value in percent, rounded to `decimals` decimal places (default 0). */
export function tournamentWinRatePct(
  wins: number,
  losses: number,
  ties = 0,
  decimals = 0,
): number | null {
  const rate = tournamentWinRate(wins, losses, ties);
  if (rate === null) return null;
  const factor = 10 ** decimals;
  return Math.round(rate * 100 * factor) / factor;
}
