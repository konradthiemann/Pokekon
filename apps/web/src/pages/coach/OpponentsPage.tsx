import { useTranslation } from 'react-i18next';
import { LocalMetaPanel } from '../../components/deck/LocalMetaPanel';
import { MetaWindowControl } from '../../components/meta/MetaWindowControl';
import { MyMatchupsTable } from '../../components/meta/MyMatchupsTable';
import { PredictionPanel } from '../../components/meta/PredictionPanel';
import { useFieldAnalysis } from '../../hooks/useFieldAnalysis';
import { useDashboardStore } from '../../store/dashboardStore';

/**
 * Opponents of the archetype-first UI, Scheibe 1 scope (Spec 7 §5.5): the local
 * field, the prediction against it and the own record per opponent. Opponent
 * detail (typical cards, coaching hotspot) arrives with Specs 5/8.
 */
export function OpponentsPage() {
  const { t } = useTranslation('opponents');
  const { metaWindow, setMetaWindow, archetypeStats } = useDashboardStore();
  const { data, isLoading, error } = useFieldAnalysis(metaWindow);

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
        {data && <PredictionPanel archetypes={data.archetypes} window={metaWindow} />}
      </section>

      <section aria-label={t('page.myMatchups')}>
        <MyMatchupsTable stats={archetypeStats} />
      </section>
    </div>
  );
}
