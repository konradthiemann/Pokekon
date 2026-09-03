// Stays under `components/deck/` with the `deck` i18n namespace even though
// `MetaPage` renders it since Spec 7 (plan ui-ux-hub-rework.md §3.5) — a
// screen-only move, kept here to avoid a file/i18n-key diff for zero visible
// benefit (plan §5 risk 6).
import { useTranslation } from 'react-i18next';
import { MapPin, X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { toArchetypeSlug } from '../../constants/archetypes';
import { ArchetypePicker } from '../shared/ArchetypePicker';
import { SidePanel } from './SidePanel';

// Suggested archetypes for quick-add (based on current meta)
const QUICK_ADD = [
  'Dragapult ex',
  "N's Zoroark ex",
  'Lucario Hariyama',
  'Alakazam Dudunsparce',
  'Ogerpon Meganium',
  'Starmie Froslass',
  "Cynthia's Garchomp ex",
  "Rocket's Mewtwo",
  'Raging Bolt Ogerpon',
  'Ceruledge ex',
];

export function LocalMetaPanel() {
  const { t } = useTranslation('deck');
  const { localMeta, setLocalMeta, archetypeStats } = useDashboardStore();

  const metaArchetypes = archetypeStats.map((a) => a.archetype);
  const allOptions = [...new Set([...QUICK_ADD, ...metaArchetypes])].filter(
    (a) => !localMeta.includes(a),
  );

  const add = (arch: string) => {
    const trimmed = arch.trim();
    if (!trimmed || localMeta.includes(trimmed)) return;
    setLocalMeta([...localMeta, trimmed]);
  };

  const remove = (arch: string) => setLocalMeta(localMeta.filter((a) => a !== arch));

  return (
    <SidePanel
      icon={<MapPin className="w-4 h-4" />}
      title={t('localMeta.title')}
      description={t('localMeta.description')}
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Current list */}
        {localMeta.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {localMeta.map((arch) => (
              <span
                key={arch}
                className="flex items-center gap-1 bg-amber-100 border border-amber-200 text-amber-800 rounded-full px-2.5 py-0.5 text-xs"
              >
                {arch}
                <button
                  onClick={() => remove(arch)}
                  className="text-amber-600 hover:text-amber-800 ml-0.5"
                  aria-label={t('localMeta.remove', { archetype: arch })}
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add via picker — a menu, not free text (no typos, no slug guessing) */}
        <ArchetypePicker
          onSelect={(a) => add(a.name)}
          extra={metaArchetypes.map((name) => ({ slug: toArchetypeSlug(name), name }))}
          placeholder={t('localMeta.placeholder')}
          ariaLabel={t('localMeta.add')}
        />

        {/* Quick-add chips */}
        {localMeta.length < 8 && allOptions.length > 0 && (
          <div className="mt-auto">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">
              {t('localMeta.suggestions')}
            </p>
            <div className="flex flex-wrap gap-1">
              {allOptions.slice(0, 6).map((arch) => (
                <button
                  key={arch}
                  onClick={() => add(arch)}
                  className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-full border border-slate-200 transition-colors"
                >
                  + {arch}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
