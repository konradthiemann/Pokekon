import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useDashboardStore } from '../store/dashboardStore';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';
import { DeckComparisonPanel } from '../components/recommendations/DeckComparisonPanel';
import { useRecommendations } from '../hooks/useRecommendations';
import { computeDeckPerformanceStats } from '../lib/deckPerformanceStats';
import { Info, MapPin } from 'lucide-react';

export function RecommendationsPage() {
  const { t } = useTranslation('recommendations');
  const {
    deckCards,
    archetypeStats,
    opponentLogs,
    deckSnapshots,
    localMeta,
    activeDeckId,
    activeDeck,
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
  });

  const highCount = recommendations.filter((r) => r.priority === 'high').length;
  const medCount = recommendations.filter((r) => r.priority === 'medium').length;
  const lowCount = recommendations.filter((r) => r.priority === 'low').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-0.5">{t('page.title')}</h1>
        <p className="text-gray-500 text-sm">
          {activeDeck ? (
            <Trans
              t={t}
              i18nKey="page.subtitleForDeck"
              values={{ deckName: activeDeck.archetypeName }}
              components={{ deck: <span className="text-gray-300 font-medium" /> }}
            />
          ) : (
            t('page.subtitleGeneric')
          )}
        </p>
      </div>

      {/* Data source notice */}
      <div className="flex items-start gap-3 bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <div className="text-sm text-gray-400 space-y-1">
          <div>
            <Trans
              t={t}
              i18nKey="page.basedOn"
              count={activeLogs.length}
              components={{ bold: <span className="text-white font-medium" /> }}
            />{' '}
            {activeLogs.length < 10 && (
              <span className="text-yellow-400">{t('page.logMoreHint')}</span>
            )}
          </div>
          {localMeta.length > 0 && (
            <div className="flex items-center gap-1.5 text-amber-400/80">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="text-xs">
                {t('page.localMetaNotice', { archetypes: localMeta.join(', ') })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Priority summary */}
      {recommendations.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            <span className="text-red-400 font-medium">{highCount}</span> {t('page.summary.high')}
          </span>
          <span>
            <span className="text-yellow-400 font-medium">{medCount}</span>{' '}
            {t('page.summary.medium')}
          </span>
          <span>
            <span className="text-blue-400 font-medium">{lowCount}</span> {t('page.summary.low')}
          </span>
        </div>
      )}

      {/* Matchup + version recommendations */}
      <RecommendationsPanel recommendations={recommendations} />

      {/* Separator */}
      <div className="border-t border-gray-800 pt-2">
        <h2 className="text-base font-semibold text-white mb-4">{t('comparison.sectionTitle')}</h2>
        <DeckComparisonPanel />
      </div>
    </div>
  );
}
