import { winRateColorClass } from './winRateColor';

/**
 * Compact coloured win-rate percentage. `null` renders as an em-dash — meta
 * data uses null for "no decisive games", which must not read as 50 %.
 */
export function WinRateBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-400 font-mono">—</span>;
  return <span className={`font-mono font-semibold ${winRateColorClass(pct)}`}>{pct}%</span>;
}
