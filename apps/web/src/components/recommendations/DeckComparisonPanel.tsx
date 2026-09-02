import { Trans, useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  GitCompare,
  AlertTriangle,
  BadgeCheck,
  HelpCircle,
  Minus,
  Sparkles,
  ThumbsDown,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { confidenceTier, formatWithInterval } from '../meta/confidence';
import type { CardStat } from '../../lib/deckComparison';
import type { CardPerformanceDelta, CardSignalTier } from '@pokekon/shared';

function FrequencyBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 tabular-nums">{pct}%</span>
    </div>
  );
}

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

const TIER_LABEL_KEYS: Record<CardSignalTier, string> = {
  insufficient: 'comparison.delta.insufficient',
  confirmed: 'comparison.delta.confirmed',
  hiddenGem: 'comparison.delta.hiddenGem',
  popularityParadox: 'comparison.delta.paradox',
  discouraged: 'comparison.delta.discouraged',
  neutral: 'comparison.delta.neutral',
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
function CardDelta({
  delta,
  tier,
}: {
  delta: CardPerformanceDelta | undefined;
  tier: CardSignalTier;
}) {
  const { t } = useTranslation('recommendations');
  const Icon = TIER_ICONS[tier];
  // Band width feeds the SAME confidenceTier() classification used for
  // matchup intervals — no second tier-emphasis logic.
  const emphasis = delta ? confidenceTier(delta.widthPct) : 'veryLow';
  const dimmed = emphasis === 'low' || emphasis === 'veryLow' ? 'opacity-75' : '';

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-7 text-xs">
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

function CardRow({ card }: { card: CardStat }) {
  const { t } = useTranslation('recommendations');
  return (
    <div
      data-testid={`card-row-${card.name}`}
      className="py-1.5 border-b border-slate-100 last:border-0 space-y-1"
    >
      <div className="flex items-center gap-3">
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-mono uppercase tracking-wide ${
            card.cardType === 'pokemon'
              ? 'bg-red-50 text-red-700'
              : card.cardType === 'trainer'
                ? 'bg-brand-50 text-brand-700'
                : 'bg-orange-50 text-orange-700'
          }`}
        >
          {card.cardType[0]}
        </span>
        <span className="flex-1 text-sm text-slate-800 truncate">{card.name}</span>
        <FrequencyBar pct={card.frequency} />
        {card.inUserDeck && (
          <span className="text-xs text-slate-500 tabular-nums w-14 text-right">
            {t('comparison.youVsAvg', { user: card.userCount, avg: card.topAvgCount })}
          </span>
        )}
      </div>
      {card.tier && <CardDelta delta={card.delta} tier={card.tier} />}
    </div>
  );
}

export function DeckComparisonPanel() {
  const { t } = useTranslation('recommendations');
  const {
    deckArchSlug,
    comparisonResult,
    isComparing,
    compareProgress,
    compareError,
    runDeckComparison,
    setActiveTab,
  } = useDashboardStore();

  if (!deckArchSlug) {
    return (
      <div className="card p-5 flex items-start gap-3">
        <GitCompare className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-slate-600 font-medium">{t('comparison.notSetUp')}</p>
          <p className="text-xs text-slate-500 mt-1">
            <Trans
              t={t}
              i18nKey="comparison.setupHint"
              components={{
                myDeck: (
                  <button
                    onClick={() => setActiveTab('deck')}
                    className="text-brand-700 underline"
                  />
                ),
                slug: <code className="text-brand-700" />,
              }}
            />
          </p>
        </div>
      </div>
    );
  }

  const r = comparisonResult;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-brand-700" />
            {t('comparison.title')} —{' '}
            <code className="text-brand-700 font-mono">{deckArchSlug}</code>
          </h3>
          {r && (
            <p className="text-xs text-slate-500 mt-0.5">
              {t('comparison.statsLine', {
                lists: r.listsAnalyzed,
                top: r.topListsAnalyzed,
                time: r.fetchedAt.toLocaleTimeString(),
              })}
            </p>
          )}
          {/* Deliberately a SEPARATE line from statsLine above — the delta
              signal comes from a different tournament population than the
              copy-frequency numbers (plan §6 risk 5), so the two must never
              read as one data source. */}
          {r?.cardStatsSource && (
            <p className="text-xs text-slate-400 mt-0.5">
              {t('comparison.delta.source', {
                lists: r.cardStatsSource.listsAnalyzed,
                days: r.cardStatsSource.windowDays,
                computedAt: r.cardStatsSource.computedAt
                  ? new Date(r.cardStatsSource.computedAt).toLocaleString()
                  : '—',
              })}{' '}
              <span className="italic">{t('comparison.delta.sourceHint')}</span>
            </p>
          )}
        </div>
        <button
          onClick={runDeckComparison}
          disabled={isComparing}
          className="btn-primary text-xs disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isComparing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isComparing
            ? t('comparison.comparing')
            : r
              ? t('comparison.refresh')
              : t('comparison.compare')}
        </button>
      </div>

      {isComparing && compareProgress && (
        <p className="text-xs text-slate-500 animate-pulse">{compareProgress}</p>
      )}

      {compareError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {compareError}
        </div>
      )}

      {r && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Suggested adds */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('comparison.considerAdding', { count: r.suggestedAdds.length })}
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.suggestedAdds.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">{t('comparison.noAdds')}</p>
              ) : (
                r.suggestedAdds.map((c) => <CardRow key={c.name} card={c} />)
              )}
            </div>
          </div>

          {/* Suggested removes */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
              <TrendingDown className="w-3.5 h-3.5 text-red-700" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('comparison.considerRemoving', { count: r.suggestedRemoves.length })}
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.suggestedRemoves.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">{t('comparison.noRemoves')}</p>
              ) : (
                r.suggestedRemoves.map((c) => <CardRow key={c.name} card={c} />)
              )}
            </div>
          </div>

          {/* Count adjustments */}
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t('comparison.countAdjustments', { count: r.countAdjustments.length })}
              </span>
            </div>
            <div className="px-4 py-2 max-h-72 overflow-y-auto">
              {r.countAdjustments.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">{t('comparison.noAdjustments')}</p>
              ) : (
                r.countAdjustments.map((adj) => (
                  <div
                    key={adj.name}
                    className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0"
                  >
                    <span className="flex-1 text-sm text-slate-800 truncate">{adj.name}</span>
                    <span
                      className={`text-xs tabular-nums font-mono px-1.5 py-0.5 rounded ${adj.diff > 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'}`}
                    >
                      {adj.diff > 0 ? `+${adj.diff}` : adj.diff} ({adj.userCount}→{adj.typicalCount}
                      )
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {!r && !isComparing && !compareError && (
        <p className="text-xs text-slate-500 py-2">
          <Trans
            t={t}
            i18nKey="comparison.compareHint"
            values={{ slug: deckArchSlug }}
            components={{ slug: <code className="text-slate-400" /> }}
          />
        </p>
      )}
    </div>
  );
}
