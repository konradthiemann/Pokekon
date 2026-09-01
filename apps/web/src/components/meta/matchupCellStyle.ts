import type { ConfidenceTier } from './confidence.js';

const TIER_OPACITY: Record<ConfidenceTier, string> = {
  high: 'opacity-100',
  medium: 'opacity-80',
  low: 'opacity-60',
  veryLow: 'opacity-40',
};

/** Colour hue by win rate (unchanged buckets), with no opacity class —
 *  callers that need a fixed opacity (e.g. the mirror/diagonal cell) append
 *  their own, since {@link cellStyle}'s tier opacity would otherwise
 *  conflict with it (Tailwind emits opacity utilities in ascending numeric
 *  order regardless of source order, so the higher one always wins). */
export function cellHueClass(winRate: number): string {
  return winRate >= 70
    ? 'bg-emerald-700 text-white font-bold'
    : winRate >= 60
      ? 'bg-emerald-200 text-emerald-900 font-bold'
      : winRate >= 55
        ? 'bg-emerald-100 text-emerald-800'
        : winRate >= 45
          ? 'bg-slate-50 text-slate-600'
          : winRate >= 40
            ? 'bg-red-100 text-red-800'
            : winRate >= 30
              ? 'bg-red-200 text-red-900 font-bold'
              : 'bg-red-700 text-white font-bold';
}

/** Confidence is expressed via opacity, graded by the Wilson interval's
 *  width — a narrow band renders fully saturated, a wide one washed out. */
export function cellStyle(winRate: number, tier: ConfidenceTier): string {
  return `${cellHueClass(winRate)} ${TIER_OPACITY[tier]}`;
}
