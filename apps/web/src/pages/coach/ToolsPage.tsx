import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { CollapsibleSection } from '../../components/layout/CollapsibleSection';
import { ArchetypeDetail } from '../../components/meta/ArchetypeDetail';
import { EquilibriumPanel } from '../../components/meta/EquilibriumPanel';
import { MatchupMatrix } from '../../components/meta/MatchupMatrix';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';
import { useFieldAnalysis } from '../../hooks/useFieldAnalysis';
import { useMetaEquilibrium } from '../../hooks/useMetaEquilibrium';
import { archetypeDisplayName } from '../../lib/coach/archetypeName';
import { useDashboardStore } from '../../store/dashboardStore';

/** General meta lives elsewhere (Spec 7 §2, §5.6) — static, trusted targets. */
const EXTERNAL_LINKS = [
  { href: 'https://limitlesstcg.com/decks', labelKey: 'tools.limitless' },
  { href: 'https://www.trainerhill.com/', labelKey: 'tools.trainerhill' },
] as const;

/**
 * Tools of the archetype-first UI, Scheibe 1 scope (Spec 7 §5.6): the
 * archetype drilldown for the coached archetype, matchup matrix and game
 * theory, plus links to the general meta. Still unfiltered — narrowing the
 * tools to the archetype and dissolving ArchetypeDetail is Scheibe 2.
 */
export function ToolsPage() {
  const { t } = useTranslation('coach');
  const { activeArchetypeId, metaWindow, setMetaWindow, archetypeStats, localMeta, decks } =
    useDashboardStore();
  const { data: field } = useFieldAnalysis(metaWindow);
  const { data: equilibrium, error: equilibriumError } = useMetaEquilibrium(metaWindow.days);

  const archetypes = useMemo(() => field?.archetypes ?? [], [field]);
  const iconsById = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of archetypes) if (a.icons?.length) map[a.archetypeId] = a.icons;
    return map;
  }, [archetypes]);

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="text-base font-extrabold text-slate-900">{t('tools.heading')}</h2>
        <p className="mt-1 text-sm text-slate-600">{t('tools.intro')}</p>
      </section>

      {activeArchetypeId && (
        <CollapsibleSection title={t('tools.tournamentLists')} defaultOpen>
          <ArchetypeDetail
            archetypeId={activeArchetypeId}
            archetypeName={archetypeDisplayName(activeArchetypeId, {
              known: KNOWN_ARCHETYPES,
              field: archetypes,
              decks,
            })}
            window={metaWindow}
            onDaysChange={(days) => setMetaWindow({ ...metaWindow, days })}
            onOnlineBo1Change={(onlineBo1) =>
              setMetaWindow({ ...metaWindow, online: onlineBo1, bo1: onlineBo1 })
            }
            archetypeStats={archetypeStats}
            archetypes={archetypes}
            localMeta={localMeta}
          />
        </CollapsibleSection>
      )}

      <CollapsibleSection title={t('tools.matrix')} defaultOpen={false}>
        <MatchupMatrix window={metaWindow} iconsById={iconsById} />
      </CollapsibleSection>

      <CollapsibleSection title={t('tools.gameTheory')} defaultOpen={false}>
        {equilibrium ? (
          <EquilibriumPanel data={equilibrium} />
        ) : (
          <p className="text-sm text-slate-600">
            {equilibriumError ? t('tools.unavailable') : t('tools.loading')}
          </p>
        )}
      </CollapsibleSection>

      <section className="card">
        <h2 className="card-header">{t('tools.generalMeta')}</h2>
        <ul className="space-y-2">
          {EXTERNAL_LINKS.map(({ href, labelKey }) => (
            <li key={href}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t(labelKey)}
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">({t('tools.opensNewTab')})</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
