import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, FolderInput } from 'lucide-react';
import { otherArchetypeGroups } from '../../lib/coach/otherDecks';
import { useDashboardStore } from '../../store/dashboardStore';
import { PokemonIcon } from '../shared/PokemonIcon';

/**
 * Makes decks of other archetypes visible on Deck › My lists (Spec 7 Scheibe
 * 2, risk R2: after the switch they would otherwise look lost). Valid
 * archetypes can be switched to; legacy free-text archetypes can be assigned
 * to the coached archetype.
 */
export function OtherArchetypeDecks() {
  const { t } = useTranslation('deck');
  const { decks, activeArchetypeId, setActiveArchetype, reassignDeckArchetype } =
    useDashboardStore();
  if (!activeArchetypeId) return null;
  const groups = otherArchetypeGroups(decks, activeArchetypeId);
  if (groups.length === 0) return null;

  return (
    <section className="card space-y-2" aria-label={t('hub.otherArchetypes')}>
      <p className="text-xs font-semibold text-slate-700">{t('hub.otherArchetypes')}</p>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.archetype} className="flex flex-wrap items-center gap-2">
            <PokemonIcon archetype={g.switchable ? g.archetype : g.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-900">
              {g.name}{' '}
              <span className="text-xs text-slate-600">
                ({t('hub.listCount', { count: g.deckIds.length })})
              </span>
            </span>
            {g.switchable ? (
              <button
                type="button"
                onClick={() => void setActiveArchetype(g.archetype)}
                className="btn-ghost min-h-[44px] text-xs"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t('hub.switchTo', { name: g.name })}
              </button>
            ) : (
              g.deckIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void reassignDeckArchetype(id)}
                  className="btn-ghost min-h-[44px] text-xs"
                >
                  <FolderInput className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('hub.assignHere', { name: g.name })}
                </button>
              ))
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
