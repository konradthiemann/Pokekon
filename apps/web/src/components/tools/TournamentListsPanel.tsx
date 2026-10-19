import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Loader2, Sparkles, Trophy } from 'lucide-react';
import { useArchetypeLists } from '../../hooks/useArchetypeLists';
import { useArchetypeTournaments } from '../../hooks/useArchetypeTournaments';
import type { FieldAnalysisArchetype, MetaWindow } from '../../lib/api';
import type { ArchetypeStats } from '../../types';
import { ArchetypeRecommendationPanel } from '../meta/ArchetypeRecommendationPanel';
import { DecklistCard } from '../meta/DecklistCard';
import { TournamentBestListPanel } from '../meta/TournamentBestListPanel';
import { SegmentedTabs } from '../shared/SegmentedTabs';

type ListsTab = 'recommendation' | 'tournament' | 'decklists';

/**
 * Tournament lists of the coached archetype (Spec 7 §5.6): recommendation
 * (ranked clusters + AI text), best list per tournament and the published
 * lists — the list tabs of the former ArchetypeDetail. The matchups tab lives
 * under Opponents now.
 */
export function TournamentListsPanel({
  archetypeId,
  archetypeName,
  window,
  archetypeStats,
  archetypes,
  localMeta,
}: {
  archetypeId: string;
  archetypeName: string;
  window: MetaWindow;
  archetypeStats: ArchetypeStats[];
  archetypes: FieldAnalysisArchetype[];
  localMeta: string[];
}) {
  const { t } = useTranslation('meta');
  const [tab, setTab] = useState<ListsTab>('recommendation');
  const tournaments = useArchetypeTournaments(archetypeId, window);
  const { lists, total, isLoading, loadMore, isLoadingMore, loadMoreFailed } = useArchetypeLists(
    archetypeId,
    window,
  );

  const items = [
    {
      id: 'recommendation' as const,
      label: t('archetypeDetail.tabs.recommendation'),
      Icon: Sparkles,
    },
    ...(tournaments.length > 0
      ? [{ id: 'tournament' as const, label: t('archetypeDetail.tabs.tournament'), Icon: Trophy }]
      : []),
    { id: 'decklists' as const, label: t('archetypeDetail.tabs.decklists'), Icon: Layers },
  ];
  const active = tab === 'tournament' && tournaments.length === 0 ? 'recommendation' : tab;

  return (
    <div className="space-y-3">
      <div className="flex">
        <SegmentedTabs items={items} active={active} onChange={setTab} />
      </div>

      {active === 'recommendation' && (
        <ArchetypeRecommendationPanel
          archetypeId={archetypeId}
          archetypeName={archetypeName}
          windowDays={window.days}
          archetypeStats={archetypeStats}
          archetypes={archetypes}
          localMeta={localMeta}
        />
      )}

      {active === 'tournament' && (
        <TournamentBestListPanel archetypeId={archetypeId} tournaments={tournaments} />
      )}

      {active === 'decklists' && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">{t('archetypeDetail.lists.title')}</h3>
            {total > 0 && (
              <span className="text-xs text-slate-600">
                {t('archetypeDetail.lists.of', { shown: lists.length, total })}
              </span>
            )}
          </div>
          {isLoading ? (
            <p role="status" className="text-sm text-slate-600">
              {t('archetypeDetail.loading')}
            </p>
          ) : lists.length === 0 ? (
            <div className="card p-6 text-center text-sm text-slate-600">
              {t('archetypeDetail.lists.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {lists.map((entry) => (
                <DecklistCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
          {loadMoreFailed && (
            <p role="alert" className="text-center text-xs text-slate-900">
              {t('archetypeDetail.lists.loadMoreError')}
            </p>
          )}
          {lists.length < total && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="btn-ghost text-xs disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {t('archetypeDetail.lists.loading')}
                  </>
                ) : (
                  t('archetypeDetail.lists.loadMore')
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
