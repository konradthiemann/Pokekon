import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PokemonIcon } from '../shared/PokemonIcon';

/** Header control of the archetype-first UI (Spec 7 §4): icon + name of the
 *  coached archetype; opens the archetype switch. */
export function ArchetypeSwitcherButton({
  archetypeId,
  displayName,
  onClick,
}: {
  archetypeId: string | null;
  displayName: string;
  onClick: () => void;
}) {
  const { t } = useTranslation('layout');
  const label = archetypeId ? displayName : t('header.chooseArchetype');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t('header.switchArchetype')}: ${label}`}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 text-left text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-energy-500"
    >
      {archetypeId && <PokemonIcon archetype={archetypeId} size="sm" />}
      <span className="truncate text-sm font-bold">{label}</span>
      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}
