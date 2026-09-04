import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../store/dashboardStore';
import { RecommendationsPanel } from '../recommendations/RecommendationsPanel';
import { DeckComparisonPanel } from '../recommendations/DeckComparisonPanel';
import { DeckSynthesisPanel } from '../recommendations/DeckSynthesisPanel';
import { useRecommendations } from '../../hooks/useRecommendations';
import { computeDeckPerformanceStats } from '../../lib/deckPerformanceStats';
import { Info, MapPin } from 'lucide-react';

/**
 * The "Tips" section of "My Deck" (plan ui-ux-hub-rework.md §3.4.1) — the
 * former `RecommendationsPage` content, migrated here without its own page
 * title (this is a section, not a page). Props-free: reads everything from
 * the store, exactly like the page did before it.
 */
export function DeckTipsSection() {
  const { t } = useTranslation('recommendations');
  const {
    deckCards,
    archetypeStats,
    opponentLogs,
    deckSnapshots,
    localMeta,
    activeDeckId,
    cardStats,
    setActiveTab,
  } = useDashboardStore();
  const playerName = localStorage.getItem('tcg-player-name') ?? '';

  const activeLogs = useMemo(
    () =>
      activeDeckId != null ? opponentLogs.filter((l) => l.deckId === activeDeckId) : opponentLogs,
    [opponentLogs, activeDeckId],
  );

  const deckStats = useMemo(
    () => computeDeckPerformanceStats(activeLogs, playerName),
    [activeLogs, playerName],
  );
  const recommendations = useRecommendations({
    archetypeStats,
    deckCards,
    opponentLogs: activeLogs,
    deckSnapshots,
    localMeta,
    deckStats,
    cardDeltas: cardStats,
  });

  const highCount = recommendations.filter((r) => r.priority === 'high').length;
  const medCount = recommendations.filter((r) => r.priority === 'medium').length;
  const lowCount = recommendations.filter((r) => r.priority === 'low').length;

  return (
    <div className="space-y-6">
      {/* Meta works without logs (plan personal-data-role-rework §3.8): a
          zero-log account should not read as "broken" — the same static
          thresholds as OverviewPage, in place of the usual "based on N logs"
          line. The pre-existing "log 10+ matches" hint stays untouched for
          the "some, but few logs" case below. */}
      {activeLogs.length === 0 ? (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-sm font-semibold text-slate-800 mb-1">
            {t('page.metaWorksWithoutLogs.title')}
          </p>
          <p className="text-xs text-slate-600 mb-2">{t('page.metaWorksWithoutLogs.body')}</p>
          <ul className="text-xs text-slate-600 list-disc list-inside space-y-0.5">
            <li>{t('page.metaWorksWithoutLogs.items.matchups')}</li>
            <li>{t('page.metaWorksWithoutLogs.items.playQuality')}</li>
            <li>{t('page.metaWorksWithoutLogs.items.versionComparison')}</li>
          </ul>
        </div>
      ) : (
        /* Data source notice */
        <div className="flex items-start gap-3 bg-slate-100 border border-slate-200 rounded-xl p-4">
          <Info className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
          <div className="text-sm text-slate-600 space-y-1">
            <div>
              <Trans
                t={t}
                i18nKey="page.basedOn"
                count={activeLogs.length}
                components={{ bold: <span className="text-slate-900 font-medium" /> }}
              />{' '}
              {activeLogs.length < 10 && (
                <span className="text-amber-700">{t('page.logMoreHint')}</span>
              )}
            </div>
            {localMeta.length > 0 && (
              <div className="flex items-center gap-1.5 text-amber-700">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="text-xs">
                  <Trans
                    t={t}
                    i18nKey="page.localMetaNotice"
                    values={{ archetypes: localMeta.join(', ') }}
                    components={{
                      metaLink: (
                        <button
                          onClick={() => setActiveTab('meta')}
                          className="underline hover:text-amber-800"
                        />
                      ),
                    }}
                  />
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Priority summary */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>
            <span className="text-red-700 font-medium">{highCount}</span> {t('page.summary.high')}
          </span>
          <span>
            <span className="text-amber-700 font-medium">{medCount}</span>{' '}
            {t('page.summary.medium')}
          </span>
          <span>
            <span className="text-brand-700 font-medium">{lowCount}</span> {t('page.summary.low')}
          </span>
        </div>
      )}

      {/* AI-synthesised summary of the analytics below it (plan
          ai-recommendation-synthesis.md §3.10) — the fließtext comes first,
          the detail it summarizes follows. */}
      <DeckSynthesisPanel />

      {/* Matchup + version recommendations */}
      <RecommendationsPanel recommendations={recommendations} />

      {/* Separator */}
      <div className="border-t border-slate-200 pt-2">
        <h2 className="text-base font-bold text-slate-900 mb-4">{t('comparison.sectionTitle')}</h2>
        <DeckComparisonPanel />
      </div>
    </div>
  );
}
