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
import { SidePanel } from '../components/deck/SidePanel';
import { Settings2, BarChart2, List, Lightbulb, Plus, Copy, AlertTriangle } from 'lucide-react';

// ─── Deck Settings ────────────────────────────────────────────────────────────

function DeckSettingsWidget() {
  const { t } = useTranslation('deck');
  const { activeDeck, updateCurrentDeck, duplicateDeckAsVariant } = useDashboardStore();

  const [archetypeName, setArchetypeName] = useState(activeDeck?.archetypeName ?? '');
  const [variant, setVariant] = useState(activeDeck?.variant ?? '');
  const [archetype, setArchetype] = useState(activeDeck?.archetype ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [copying, setCopying] = useState(false);
  const [prevDeckId, setPrevDeckId] = useState(activeDeck?.id);

  // Reset the form fields when the active deck changes (adjust-state-during-render pattern).
  if (activeDeck?.id !== prevDeckId) {
    setPrevDeckId(activeDeck?.id);
    setArchetypeName(activeDeck?.archetypeName ?? '');
    setVariant(activeDeck?.variant ?? '');
    setArchetype(activeDeck?.archetype ?? '');
  }

  if (!activeDeck) return null;

  const dirty =
    archetypeName.trim() !== (activeDeck.archetypeName ?? '') ||
    variant.trim() !== (activeDeck.variant ?? '') ||
    archetype.trim() !== (activeDeck.archetype ?? '');

  const handleSave = async () => {
    await updateCurrentDeck({
      archetype: archetype.trim(),
      archetypeName: archetypeName.trim(),
      variant: variant.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleCreateVariant = async () => {
    if (!newVariantName.trim()) return;
    setCopying(true);
    await duplicateDeckAsVariant(newVariantName.trim(), { copyCards: true });
    setCopying(false);
    setNewVariantName('');
  };

  return (
    <SidePanel
      icon={<Settings2 className="w-4 h-4" />}
      title={t('settings.title')}
      description={t('settings.description')}
    >
      <div className="flex flex-col gap-4 h-full">
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
              {t('settings.archetype')}
            </label>
            <input
              type="text"
              value={archetypeName}
              onChange={(e) => setArchetypeName(e.target.value)}
              placeholder={t('settings.archetypePlaceholder')}
              className="input w-full px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
              {t('settings.variantLabel')}
            </label>
            <input
              type="text"
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              placeholder={t('settings.variantPlaceholder')}
              className="input w-full px-3 py-1.5 text-sm"
            />
          </div>
          {showAdvanced ? (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
                {t('settings.slugLabel')}
              </label>
              <input
                type="text"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value)}
                placeholder="n-zoroark"
                className="input w-full px-3 py-1.5 text-sm font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">{t('settings.slugHint')}</p>
            </div>
          ) : (
            <button
              onClick={() => setShowAdvanced(true)}
              className="text-[11px] text-slate-500 hover:text-brand-700 transition-colors"
            >
              {t('settings.advancedToggle')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!archetypeName.trim() || !dirty}
            className="btn-primary w-full justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved
              ? t('settings.saved')
              : dirty
                ? t('settings.saveChanges')
                : t('settings.upToDate')}
          </button>
        </div>

        <div className="border-t border-slate-200" />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              {t('settings.newVariantTitle')}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {t('settings.newVariantHint', { archetype: activeDeck.archetypeName })}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateVariant()}
              placeholder={t('settings.variantNamePlaceholder')}
              className="input flex-1 px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleCreateVariant}
              disabled={!newVariantName.trim() || copying}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {copying ? '…' : t('settings.create')}
            </button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

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

      {/* ── Selected-deck content area ──────────────────────────────────── */}
      {activeDeck ? (
        <>
          {/* Section tab bar + a small, permanently visible "Log match" action
              (plan §3.8) — the match log itself is demoted to a collapsed
              section below, but logging a match stays one tap away on both
              sections. */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-2xl overflow-hidden backdrop-blur-md border border-slate-200 bg-white">
              {SECTIONS.map(({ id, labelKey, Icon }) => (
                <button
                  key={id}
                  onClick={() => setDeckSection(id)}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all',
                    deckSection === id
                      ? 'text-brand-800 bg-brand-50 shadow-[inset_0_-2px_0_0_rgba(96,165,250,0.6)]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
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
