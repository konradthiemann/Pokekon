import { tournamentWinRatePct } from '@pokekon/shared';

/** Shared colour thresholds for win-rate-like percentages (0–100): favourable
 *  from 50 %, cautionary from 45 %, unfavourable below. Every rendering of a
 *  win rate or field score must use this — inconsistent thresholds would show
 *  the same number as "good" in one panel and "neutral" in the next. */
export function winRateColorClass(pct: number): string {
  return pct >= 50 ? 'text-emerald-700' : pct >= 45 ? 'text-amber-700' : 'text-red-700';
}

/** Win rate as a 1-decimal percentage from a W/L/T record, using the official
 *  tournament weighting (a tie counts as a third of a win — see
 *  `@pokekon/shared`'s `tournamentWinRatePct`); null only when there was no
 *  game at all (so it never reads as 50 %). Recomputed from wins/losses/ties
 *  rather than reusing the integer-rounded API value, so the display carries a
 *  real single decimal instead of a fake ".0". */
export function winRatePct1(wins: number, losses: number, ties = 0): number | null {
  return tournamentWinRatePct(wins, losses, ties, 1);
}
