import { tournamentWinRatePct } from '@pokekon/shared';

/** Shared colour thresholds for win-rate-like percentages (0–100): favourable
 *  from 50 %, cautionary from 45 %, unfavourable below. Every rendering of a
 *  win rate or field score must use this — inconsistent thresholds would show
 *  the same number as "good" in one panel and "neutral" in the next.
 *  Returns semantic classes (index.css): emerald/amber/red in the old layout,
 *  blue/slate/orange inside `.coach-ui` (Spec 7 §9a). */
export function winRateColorClass(pct: number): 'wr-pos' | 'wr-mid' | 'wr-neg' {
  return pct >= 50 ? 'wr-pos' : pct >= 45 ? 'wr-mid' : 'wr-neg';
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
