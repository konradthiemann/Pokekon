import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../store/dashboardStore';
import { DeckPanel } from '../components/deck/DeckPanel';
import { DeckSwitcher } from '../components/deck/DeckSwitcher';
import { DeckAnalyticsPanel } from '../components/deck/DeckAnalyticsPanel';
import { DeckTipsSection } from '../components/deck/DeckTipsSection';
import { OpponentLog } from '../components/opponent/OpponentLog';
import { AddLogModal } from '../components/opponent/AddLogModal';
import { CollapsibleSection } from '../components/layout/CollapsibleSection';
import { MyMatchupsTable } from '../components/meta/MyMatchupsTable';
import { SegmentedTabs } from '../components/shared/SegmentedTabs';
import { DeckSettingsWidget } from '../components/deck/DeckSettingsWidget';
import { BarChart2, List, Lightbulb, Plus, AlertTriangle } from 'lucide-react';

// ─── Section tabs ─────────────────────────────────────────────────────────────

// Labels are i18n keys in the `deck` namespace, resolved at render time.
// Three co-equal sections (plan personal-data-role-rework §3.8, extended by
// plan ui-ux-hub-rework.md §3.4) — the match log is no longer a tab; it
// lives as a collapsed section inside Analytics (below), and "Log match" is
// a small, always-visible action next to the tabs instead. "Tips" is the
// migrated recommendations/deck-comparison content from the former
// `recommendations` top-level tab.
const SECTIONS = [
  { id: 'deck' as const, labelKey: 'page.tabs.deckList', Icon: List },
  { id: 'analytics' as const, labelKey: 'page.tabs.analytics', Icon: BarChart2 },
  { id: 'tips' as const, labelKey: 'page.tabs.tips', Icon: Lightbulb },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DeckPage() {
  const { t } = useTranslation('deck');
  const {
    decks,
    activeDeckId,
    deckCards,
    opponentLogs,
    metaSnapshots,
    activeDeck,
    refresh,
    deckSection,
    setDeckSection,
    archetypeStats,
  } = useDashboardStore();
  const [showAddLogModal, setShowAddLogModal] = useState(false);

  const totalCards = deckCards.reduce((s, c) => s + c.count, 0);
  const pokemon = deckCards.filter((c) => c.type === 'Pokemon').reduce((s, c) => s + c.count, 0);
  const trainers = deckCards.filter((c) => c.type === 'Trainer').reduce((s, c) => s + c.count, 0);
  const energy = deckCards.filter((c) => c.type === 'Energy').reduce((s, c) => s + c.count, 0);
  const deckLogs =
    activeDeckId != null ? opponentLogs.filter((l) => l.deckId === activeDeckId) : opponentLogs;

  return (
    <div className="space-y-4">
      {/* ── Deck selector (always visible) ──────────────────────────────── */}
      <DeckSwitcher />

      {/* Moved from OverviewPage: `archetypeStats` is aggregated across ALL
          decks (db/queries.ts `getArchetypeStats`), not just the active one,
          so it belongs at deck-list level next to the switcher — not inside
          a single deck's Analytics tab, where it would sit next to
          DeckAnalyticsPanel's per-deck-scoped MatchupList and read as a
          duplicate of it. */}
      <MyMatchupsTable stats={archetypeStats} />

      {/* ── Selected-deck content area ──────────────────────────────────── */}
      {activeDeck ? (
        <>
          {/* Section tab bar + a small, permanently visible "Log match" action
              (plan §3.8) — the match log itself is demoted to a collapsed
              section below, but logging a match stays one tap away on both
              sections. */}
          <div className="flex items-center gap-2">
            <SegmentedTabs
              items={SECTIONS.map(({ id, labelKey, Icon }) => ({ id, label: t(labelKey), Icon }))}
              active={deckSection}
              onChange={setDeckSection}
            />
            <button
              type="button"
              onClick={() => setShowAddLogModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('page.logMatch')}
            </button>
          </div>

          {/* Tab content */}
          <div className="space-y-4">
            {deckSection === 'deck' && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: t('cardTypes.Pokemon'), value: pokemon, color: 'text-red-700' },
                    { label: t('cardTypes.Trainer'), value: trainers, color: 'text-brand-700' },
                    { label: t('cardTypes.Energy'), value: energy, color: 'text-orange-600' },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="bg-white border border-slate-200 rounded-xl py-3 text-center"
                    >
                      <div className={`text-xl font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>

                {totalCards !== 60 && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                      totalCards > 60
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-amber-50 border border-amber-200 text-amber-700'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {totalCards > 60
                      ? t('page.tooManyCards', { count: totalCards, excess: totalCards - 60 })
                      : t('page.tooFewCards', { count: totalCards })}
                  </div>
                )}

                <DeckPanel deckCards={deckCards} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  <DeckSettingsWidget />
                </div>
              </>
            )}

            {deckSection === 'analytics' && (
              <>
                <DeckAnalyticsPanel
                  decks={decks}
                  allLogs={opponentLogs}
                  metaSnapshots={metaSnapshots}
                  activeDeckId={activeDeckId}
                />

                {/* Match log — demoted from a co-equal tab to a collapsed
                    section at the end of Analytics (plan §3.8): the AC
                    demotes the FLOOR, not the ACTION, so "Log match" above
                    stays reachable regardless of whether this is open. */}
                <CollapsibleSection
                  title={t('page.matchLogSection', { count: deckLogs.length })}
                  defaultOpen={false}
                >
                  <OpponentLog
                    chrome="bare"
                    logs={opponentLogs}
                    deckId={activeDeckId ?? undefined}
                  />
                </CollapsibleSection>
              </>
            )}

            {deckSection === 'tips' && <DeckTipsSection />}
          </div>
        </>
      ) : /* No deck selected yet — shown only when deck list is empty */
      decks.length === 0 ? null : (
        <div className="card py-12 text-center text-slate-400 text-sm">
          {t('page.selectDeckPrompt')}
        </div>
      )}

      {showAddLogModal && (
        <AddLogModal
          preselectedDeckId={activeDeckId ?? undefined}
          onClose={() => {
            setShowAddLogModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
