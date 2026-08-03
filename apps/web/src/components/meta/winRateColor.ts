/** Shared colour thresholds for win-rate-like percentages (0–100): favourable
 *  from 50 %, cautionary from 45 %, unfavourable below. Every rendering of a
 *  win rate or field score must use this — inconsistent thresholds would show
 *  the same number as "good" in one panel and "neutral" in the next. */
export function winRateColorClass(pct: number): string {
  return pct >= 50 ? 'text-emerald-700' : pct >= 45 ? 'text-amber-700' : 'text-red-700';
}
