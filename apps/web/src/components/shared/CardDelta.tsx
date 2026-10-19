// Performance-delta display of one card (signal tier + delta with band).
// Moved unchanged from DeckComparisonPanel so the coach Tools' card statistics
// (Spec 7 §5.6) render the exact same signal — one formatting path.
import { useTranslation } from 'react-i18next';
import type { ComponentType, SVGProps } from 'react';
import { AlertTriangle, BadgeCheck, HelpCircle, Minus, Sparkles, ThumbsDown } from 'lucide-react';
import type { CardPerformanceDelta, CardSignalTier } from '@pokekon/shared';
import { confidenceTier, formatWithInterval } from '../meta/confidence';
import { TIER_LABEL_KEYS } from './cardSignalTiers';

// Signal classification (plan .claude/plans/recommendation-to-prognosis.md
// §3.7) — every tier gets both a distinct icon AND a distinct text label
// (a11y precedent from the Spec-3 plan §3.6: "Label, nicht nur Farbe"), most
// importantly `popularityParadox`, which must not read as just another
// coloured badge.
const TIER_ICONS: Record<CardSignalTier, ComponentType<SVGProps<SVGSVGElement>>> = {
  insufficient: HelpCircle,
  confirmed: BadgeCheck,
  hiddenGem: Sparkles,
  popularityParadox: AlertTriangle,
  discouraged: ThumbsDown,
  neutral: Minus,
};

const TIER_TEXT_CLASS: Record<CardSignalTier, string> = {
  insufficient: 'text-slate-400',
  confirmed: 'text-emerald-700',
  hiddenGem: 'text-emerald-700',
  popularityParadox: 'text-amber-700',
  discouraged: 'text-red-700',
  neutral: 'text-slate-500',
};

/**
 * The performance-delta half of a CardRow's two signals. `delta` is
 * `undefined` for the rare "mathematically undefined" case (empty
 * comparison group) — the tier alone (always `insufficient` there) still
 * renders. Every other tier carries a `delta` and shows a number; deriving a
 * number from anywhere else would be a second, forbidden formatting path.
 */
export function CardDelta({
  delta,
  tier,
  className = 'pl-7',
}: {
  delta: CardPerformanceDelta | undefined;
  tier: CardSignalTier;
  /** Indentation of the row (default matches DeckComparisonPanel's rows). */
  className?: string;
}) {
  const { t } = useTranslation('recommendations');
  const Icon = TIER_ICONS[tier];
  // Band width feeds the SAME confidenceTier() classification used for
  // matchup intervals — no second tier-emphasis logic.
  const emphasis = delta ? confidenceTier(delta.widthPct) : 'veryLow';
  const dimmed = emphasis === 'low' || emphasis === 'veryLow' ? 'opacity-75' : '';

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs ${className}`}>
      <Icon
        data-testid={`tier-icon-${tier}`}
        className={`w-3.5 h-3.5 shrink-0 ${TIER_TEXT_CLASS[tier]}`}
        aria-hidden="true"
      />
      <span className={`font-medium ${TIER_TEXT_CLASS[tier]}`}>{t(TIER_LABEL_KEYS[tier])}</span>
      {tier !== 'insufficient' && delta && (
        <span className={`tabular-nums text-slate-500 ${dimmed}`}>
          {formatWithInterval(delta.deltaPp, delta.lowPct - 50, delta.highPct - 50)}
        </span>
      )}
      <span className="text-slate-400 italic">{t('comparison.delta.correlationNote')}</span>
    </div>
  );
}
