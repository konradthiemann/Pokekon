import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';
import { archetypeDisplayName } from '../../lib/coach/archetypeName';
import { useDashboardStore } from '../../store/dashboardStore';
import { ActiveListChip } from './ActiveListChip';
import { ArchetypeSwitcherButton } from './ArchetypeSwitcherButton';
import { HeaderMenuSheet } from './HeaderMenuSheet';

/** Header of the archetype-first UI (Spec 7 §4, §9a): red brand band with a
 *  yellow edge — the only large red surface — holding the archetype switcher,
 *  the active-list chip and (mobile) the menu. */
export function CoachHeader({ onSwitchArchetype }: { onSwitchArchetype: () => void }) {
  const { t } = useTranslation('layout');
  const { activeArchetypeId, decks } = useDashboardStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = activeArchetypeId
    ? archetypeDisplayName(activeArchetypeId, { known: KNOWN_ARCHETYPES, field: [], decks })
    : '';

  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b-4 border-energy-500 bg-poke-600 px-3 py-1.5 text-white">
      <div className="min-w-0 flex-1">
        <ArchetypeSwitcherButton
          archetypeId={activeArchetypeId}
          displayName={displayName}
          onClick={onSwitchArchetype}
        />
      </div>
      <ActiveListChip />
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={t('header.menu')}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-energy-500 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <HeaderMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
