// Confidence-tier and interval-formatting UI helpers (plan
// .claude/plans/confidence-aware-matchups.md §3.6, Slice C). Pure, testable
// display logic — pattern to follow: `./winRateColor.ts`. These helpers never
// compute a Wilson interval themselves; they only tier/format bounds that
// already came from `@pokekon/shared`'s `wilsonInterval`/`computeFieldScores`.

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'veryLow';

/** Tier by interval width in percentage points. Purely visual emphasis —
 *  NOT a cutoff: every tier still renders its number.
 *  widthPct <= 10  -> 'high'
 *  widthPct <= 20  -> 'medium'
 *  widthPct <= 35  -> 'low'
 *  else            -> 'veryLow'
 */
export function confidenceTier(widthPct: number): ConfidenceTier {
  if (widthPct <= 10) return 'high';
  if (widthPct <= 20) return 'medium';
  if (widthPct <= 35) return 'low';
  return 'veryLow';
}

/** "62.0 % (52.2–70.9 %)" — the explicit range the spec decided on.
 *  Falls back to just the point estimate when bounds are null/undefined. */
export function formatWithInterval(
  pct: number | null,
  lowPct: number | null | undefined,
  highPct: number | null | undefined,
  decimals = 1,
): string {
  if (pct === null) return '—';
  const point = `${pct.toFixed(decimals)} %`;
  if (lowPct == null || highPct == null) return point;
  return `${point} (${lowPct.toFixed(decimals)}–${highPct.toFixed(decimals)} %)`;
}
