import { useTranslation } from 'react-i18next';
import { List, Sparkles } from 'lucide-react';
import { ListSetup } from '../../components/coach/onboarding/OnboardingFlow';
import { DeckAnalyticsPanel } from '../../components/deck/DeckAnalyticsPanel';
import { DeckPanel } from '../../components/deck/DeckPanel';
import { DeckSettingsWidget } from '../../components/deck/DeckSettingsWidget';
import { DeckSwitcher } from '../../components/deck/DeckSwitcher';
import { DeckTipsSection } from '../../components/deck/DeckTipsSection';
import { OtherArchetypeDecks } from '../../components/deck/OtherArchetypeDecks';
import { useMemo } from 'react';
import { logsOfArchetype } from '../../lib/coach/start';
import { SegmentedTabs } from '../../components/shared/SegmentedTabs';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';
import { archetypeDisplayName } from '../../lib/coach/archetypeName';
import { useDashboardStore } from '../../store/dashboardStore';

/**
 * Deck of the archetype-first UI (Spec 7 §5.3): segments "Meta list" (for now
 * the existing deck tips, Spec 7 §12 decision 4; the optimised meta list
 * arrives with Spec 5) and "My lists" (lists of the coached archetype). "Lab"
 * joins with Spec 6. Logging and the per-opponent table live elsewhere
 * (Coaching / Opponents, §6).
 */
export function DeckHubPage() {
  const { t } = useTranslation('deck');
  const {
    activeArchetypeId,
    activeDeck,
    activeDeckId,
    decks,
    deckCards,
    opponentLogs,
    metaSnapshots,
    deckView,
    setDeckView,
    setCoachTab,
    createNewDeck,
    refresh,
  } = useDashboardStore();

  // Only this archetype's lists and games (Spec 7 AC 4): the variant
  // comparison must not compare other archetypes' decks.
  const archetypeDecks = useMemo(
    () => (activeArchetypeId ? decks.filter((d) => d.archetype === activeArchetypeId) : []),
    [decks, activeArchetypeId],
  );
  const archetypeLogs = useMemo(
    () => (activeArchetypeId ? logsOfArchetype(opponentLogs, decks, activeArchetypeId) : []),
    [opponentLogs, decks, activeArchetypeId],
  );

  if (!activeArchetypeId) return null;

  const segments = [
    { id: 'metaList' as const, label: t('hub.metaList'), Icon: Sparkles },
    { id: 'myLists' as const, label: t('hub.myLists'), Icon: List },
  ];

  const emptyState = (
    <div className="card">
      <p className="card-header">{t('hub.noListTitle')}</p>
      <ListSetup
        archetype={{
          slug: activeArchetypeId,
          name: archetypeDisplayName(activeArchetypeId, {
            known: KNOWN_ARCHETYPES,
            field: [],
            decks,
          }),
        }}
        createNewDeck={createNewDeck}
        refresh={refresh}
        onNext={() => setDeckView('myLists')}
        showLater={false}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex">
        <SegmentedTabs items={segments} active={deckView} onChange={setDeckView} />
      </div>

      {deckView === 'myLists' && (
        <>
          <DeckSwitcher archetypeFilter={activeArchetypeId} />
          <OtherArchetypeDecks />
          {activeDeck ? (
            <>
              <DeckPanel deckCards={deckCards} />
              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <DeckSettingsWidget lockArchetype />
              </div>
              <DeckAnalyticsPanel
                decks={archetypeDecks}
                allLogs={archetypeLogs}
                metaSnapshots={metaSnapshots}
                activeDeckId={activeDeckId}
                omitTurnQuality
              />
            </>
          ) : (
            emptyState
          )}
        </>
      )}

      {deckView === 'metaList' &&
        (activeDeck ? (
          <DeckTipsSection onOpenLocalMeta={() => setCoachTab('opponents')} />
        ) : (
          emptyState
        ))}
    </div>
  );
}
