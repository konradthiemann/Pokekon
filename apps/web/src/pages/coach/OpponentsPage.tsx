import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, MapPin } from 'lucide-react';
import { LocalMetaPanel } from '../../components/deck/LocalMetaPanel';
import { MetaWindowControl } from '../../components/meta/MetaWindowControl';
import { MyMatchupsTable } from '../../components/meta/MyMatchupsTable';
import { PredictionPanel } from '../../components/meta/PredictionPanel';
import { GlobalFieldPanel } from '../../components/opponents/GlobalFieldPanel';
import { SegmentedTabs } from '../../components/shared/SegmentedTabs';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';
import { useFieldAnalysis } from '../../hooks/useFieldAnalysis';
import { archetypeDisplayName } from '../../lib/coach/archetypeName';
import { useDashboardStore } from '../../store/dashboardStore';

type FieldView = 'global' | 'mine';

/**
 * Opponents of the archetype-first UI (Spec 7 §5.5): the coached archetype
 * against the global field (field score, threats, head-to-head) or against the
 * local field (prediction with a fixed perspective), plus the own record per
 * opponent (this archetype only, AC 4).
 */
export function OpponentsPage() {
  const { t } = useTranslation('opponents');
  const { metaWindow, setMetaWindow, archetypeStats, activeArchetypeId, decks } =
    useDashboardStore();
  const [view, setView] = useState<FieldView>('global');
  const { data, isLoading, error } = useFieldAnalysis(metaWindow);

  const archetypeName = activeArchetypeId
    ? archetypeDisplayName(activeArchetypeId, {
        known: KNOWN_ARCHETYPES,
        field: data?.archetypes ?? [],
        decks,
      })
    : '';

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-base font-extrabold text-slate-900">{t('page.heading')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('page.intro')}</p>
        <div className="mt-3">
          <MetaWindowControl
            window={metaWindow}
            onDaysChange={(days) => setMetaWindow({ ...metaWindow, days })}
            onOnlineBo1Change={(onlineBo1) =>
              setMetaWindow({ ...metaWindow, online: onlineBo1, bo1: onlineBo1 })
            }
          />
        </div>
      </section>

      <div className="flex">
        <SegmentedTabs
          items={[
            { id: 'global' as const, label: t('page.globalField'), Icon: Globe },
            { id: 'mine' as const, label: t('page.myFieldTab'), Icon: MapPin },
          ]}
          active={view}
          onChange={setView}
        />
      </div>

      {view === 'global' && activeArchetypeId && (
        <GlobalFieldPanel archetypeId={activeArchetypeId} window={metaWindow} />
      )}

      {view === 'mine' && (
        <section aria-label={t('page.myField')} className="space-y-3">
          <LocalMetaPanel />
          {isLoading && (
            <p role="status" className="card text-sm text-slate-600">
              {t('page.loading')}
            </p>
          )}
          {error && (
            <p role="alert" className="card text-sm text-slate-900">
              {t('page.unavailable')}
            </p>
          )}
          {data && (
            <PredictionPanel
              archetypes={data.archetypes}
              window={metaWindow}
              perspectiveArchetypeId={activeArchetypeId ?? undefined}
              perspectiveArchetypeName={archetypeName || undefined}
            />
          )}
        </section>
      )}

      <section aria-label={t('page.myMatchups')}>
        <MyMatchupsTable stats={archetypeStats} />
      </section>
    </div>
  );
}
