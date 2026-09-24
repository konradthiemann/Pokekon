import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../store/dashboardStore';

/** Header chip with the active list and its newest version; opens
 *  Deck › My lists, where copying for TCG Live lives (Spec 7 §4, E17). */
export function ActiveListChip() {
  const { t } = useTranslation('layout');
  const { activeDeck, deckSnapshots, setCoachTab, setDeckView } = useDashboardStore();

  const name = activeDeck
    ? activeDeck.variant.trim() !== ''
      ? activeDeck.variant
      : activeDeck.archetypeName
    : t('header.noList');
  const newest = [...deckSnapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <button
      type="button"
      onClick={() => {
        setCoachTab('deck');
        setDeckView('myLists');
      }}
      aria-label={`${t('header.activeList')}: ${name}${newest ? ` (${newest.label})` : ''}`}
      className="inline-flex min-h-[44px] max-w-[50vw] items-center gap-1.5 rounded-md bg-white/15 px-2.5 text-xs font-semibold text-white hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-energy-500"
    >
      <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{name}</span>
      {newest && <span className="shrink-0 opacity-80">· {newest.label}</span>}
    </button>
  );
}
