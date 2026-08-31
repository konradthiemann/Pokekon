import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2 } from 'lucide-react';
import { BEST_OF_VALUES, type BestOf } from '@pokekon/shared';
import type { EventType, MatchResult } from '../../types';
import { addOpponentLog } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';
import { PokemonIcon } from '../shared/PokemonIcon';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';

/**
 * Describes the active state and color tokens for each result tap button.
 *
 * Using a typed tuple keeps the button list declarative — no per-button
 * conditionals needed in the JSX. Labels are i18n keys in the `opponents`
 * namespace, resolved at render time.
 */
// Active fills use deep shades so the label clears WCAG AA (4.5:1): white on
// emerald-700 (4.6:1) / red-700 (5.9:1); the bright amber "tie" carries dark
// slate text instead (8.8:1) — energetic and still readable.
const RESULT_BUTTONS = [
  [
    'W',
    'addLog.win',
    'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white',
    'bg-emerald-50 border-emerald-200 text-emerald-700',
  ],
  [
    'L',
    'addLog.loss',
    'bg-red-700 hover:bg-red-600 border-red-600 text-white',
    'bg-red-50 border-red-200 text-red-700',
  ],
  [
    'T',
    'addLog.tie',
    'bg-amber-500 hover:bg-amber-400 border-amber-400 text-slate-900',
    'bg-amber-50 border-amber-200 text-amber-700',
  ],
] as const;

const EVENT_TYPES: EventType[] = ['Online', 'LC', 'LCup', 'Regional', 'Worlds'];

/** Default match format per event type (plan §3.7): Regional/Worlds are
 *  typically Bo3, everything else Bo1. Only the *initial* pick per event type —
 *  once the user touches the picker directly, the default no longer applies. */
function defaultBestOfForEventType(eventType: EventType): BestOf {
  return eventType === 'Regional' || eventType === 'Worlds' ? 'BO3' : 'BO1';
}

interface Props {
  onClose: () => void;
  /** Pre-select a specific deck (overrides activeDeckId default) */
  preselectedDeckId?: number;
}

/**
 * Modal for logging a match result against an opponent archetype.
 *
 * The design prioritises the three most-common interactions (pick opponent
 * deck, tap result, save) at the top of the form, then hides secondary
 * fields (notes, deck version, battle log) in a `<details>` element
 * so the modal feels compact on mobile without removing functionality.
 *
 * Tournament flow: "Save & next round" keeps the event context (deck, event
 * type, date, deck version), bumps the round number, and resets only the
 * per-game fields — so logging round after round takes three taps each.
 *
 * React Concept: `customArch` is kept as a separate piece of state from
 * `archetype` so that switching away from "Other…" and back restores the
 * typed text, avoiding accidental data loss if the user mis-taps.
 */
export function AddLogModal({ onClose, preselectedDeckId }: Props) {
  const { t } = useTranslation('opponents');
  const { decks, deckSnapshots, activeDeckId } = useDashboardStore();
  const today = new Date().toISOString().split('T')[0];

  const initialDeckId = preselectedDeckId ?? activeDeckId ?? decks[0]?.id ?? null;

  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(initialDeckId);
  const [archetype, setArchetype] = useState('');
  const [customArch, setCustomArch] = useState('');
  const [eventType, setEventType] = useState<EventType>('Online');
  // Typed `BestOf | null` (not just `BestOf`) purely defensively: the initial
  // value and every update below always come from `defaultBestOfForEventType`
  // or an explicit user pick, so `bestOf` never actually becomes `null` today.
  // The `=== null` checks around this state (disabled-button guards, the
  // early return in handleSave) exist so that if a future refactor changes
  // how the default is derived and a real "no format chosen yet" case
  // reappears, saving stays blocked instead of silently sending an invalid
  // value — not because it currently fires.
  const [bestOf, setBestOf] = useState<BestOf | null>(() => defaultBestOfForEventType('Online'));
  const [bestOfTouched, setBestOfTouched] = useState(false);
  // Tracks the eventType the bestOf default was last derived from, so a
  // change can be detected and applied during render (React's documented
  // pattern for "adjust state when a prop/state changes") instead of in an
  // effect, which would cause an extra, avoidable render pass.
  const [lastEventTypeForDefault, setLastEventTypeForDefault] = useState(eventType);
  if (eventType !== lastEventTypeForDefault) {
    setLastEventTypeForDefault(eventType);
    if (!bestOfTouched) setBestOf(defaultBestOfForEventType(eventType));
  }
  const [eventDate, setEventDate] = useState(today);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [round, setRound] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [deckSnapshotId, setDeckSnapshotId] = useState<number | ''>('');
  const [battleLog, setBattleLog] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loggedCount, setLoggedCount] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /**
   * Resolves the final archetype display name used when saving.
   *
   * When the user picks a known tile, `archetype` holds the slug and we look
   * up the display name from the shared constant. When "Other…" is active,
   * `archetype` is '' and `customArch` holds the typed text.
   */
  const selectedArchetypeEntry = KNOWN_ARCHETYPES.find((a) => a.slug === archetype);
  const finalArchetype = selectedArchetypeEntry ? selectedArchetypeEntry.name : customArch;

  const isCustomMode = !KNOWN_ARCHETYPES.some((a) => a.slug === archetype);

  // Snapshots for the selected deck
  const relevantSnapshots = deckSnapshots.filter(
    (s) => s.deckId == null || s.deckId === selectedDeckId,
  );

  /**
   * Persists the match log to the local database.
   *
   * The try/catch prevents an unhandled rejection from crashing the UI if the
   * Dexie write fails (e.g. storage quota exceeded). `saving` is always reset
   * in the `finally` block so the button never stays stuck in a disabled state.
   *
   * `keepOpen` drives the tournament flow: event context survives, per-game
   * fields reset, and the round number auto-increments.
   */
  const handleSave = async (keepOpen: boolean) => {
    if (!finalArchetype.trim() || result === null || bestOf === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addOpponentLog({
        archetype: finalArchetype.trim(),
        eventType,
        eventDate,
        result,
        bestOf,
        notes: notes.trim(),
        round: round === '' ? undefined : Number(round),
        deckSnapshotId: deckSnapshotId === '' ? undefined : Number(deckSnapshotId),
        battleLog: battleLog.trim() || undefined,
        deckId: selectedDeckId ?? undefined,
      });
      if (!keepOpen) {
        onClose();
        return;
      }
      // Reset per-game fields, keep event context (deck, event, date, version)
      setArchetype('');
      setCustomArch('');
      setResult(null);
      setNotes('');
      setBattleLog('');
      setRound((r) => (r === '' ? '' : r + 1));
      setLoggedCount((c) => c + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('addLog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-log-modal-title"
        className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md shadow-card max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 id="add-log-modal-title" className="text-slate-900 font-bold">
              {t('addLog.title')}
            </h2>
            {loggedCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                {loggedCount === 1
                  ? t('addLog.loggedOne')
                  : t('addLog.loggedMany', { count: loggedCount })}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-slate-500 hover:text-slate-700"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* My Deck — always first */}
          <div>
            <label className="block text-xs text-slate-600 mb-1">{t('addLog.myDeck')}</label>
            <select
              value={selectedDeckId ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                setSelectedDeckId(val);
                setDeckSnapshotId('');
              }}
              className="input"
            >
              <option value="">{t('addLog.noDeckSelected')}</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.archetypeName}
                  {d.variant ? ` · ${d.variant}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Opponent deck — visual tap grid */}
          <div>
            <label className="block text-xs text-slate-600 mb-2">{t('addLog.opponentDeck')}</label>
            <div className="grid grid-cols-2 gap-1.5">
              {KNOWN_ARCHETYPES.map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => {
                    setArchetype(a.slug);
                    setCustomArch('');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                    archetype === a.slug
                      ? 'bg-brand-100 border-brand-200 text-brand-800'
                      : 'bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                  aria-pressed={archetype === a.slug}
                >
                  <PokemonIcon archetype={a.slug} size="sm" dual />
                  <span className="truncate text-xs font-medium leading-tight">{a.name}</span>
                </button>
              ))}
              {/* "Other…" tile — selects custom mode */}
              <button
                type="button"
                onClick={() => {
                  setArchetype('');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                  isCustomMode && archetype === ''
                    ? 'bg-brand-100 border-brand-200 text-brand-800'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  +
                </span>
                <span className="text-xs font-medium">{t('addLog.other')}</span>
              </button>
            </div>
            {/* Custom archetype text input — shown when no known tile is selected */}
            {isCustomMode && (
              <input
                type="text"
                value={customArch}
                onChange={(e) => setCustomArch(e.target.value)}
                placeholder={t('addLog.archetypePlaceholder')}
                className="input mt-2"
              />
            )}
          </div>

          {/* Result — 3-button tap row */}
          <div>
            <label className="block text-xs text-slate-600 mb-2">{t('addLog.result')}</label>
            <div className="grid grid-cols-3 gap-2">
              {RESULT_BUTTONS.map(([val, labelKey, activeCls, inactiveCls]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setResult(val as MatchResult)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                    result === val ? activeCls + ' scale-105 shadow-pop' : inactiveCls
                  }`}
                  aria-pressed={result === val}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Match format — Bo1/Bo3, defaulted from event type until touched */}
          <div>
            <label className="block text-xs text-slate-600 mb-2">{t('addLog.matchFormat')}</label>
            <div className="grid grid-cols-2 gap-2">
              {BEST_OF_VALUES.map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => {
                    setBestOf(format);
                    setBestOfTouched(true);
                  }}
                  className={`py-2 rounded-xl border-2 text-sm font-bold transition-all ${
                    bestOf === format
                      ? 'bg-brand-100 border-brand-200 text-brand-800'
                      : 'bg-slate-100 border-slate-300 text-slate-700 hover:border-slate-400'
                  }`}
                  aria-pressed={bestOf === format}
                >
                  {t(`bestOf.${format === 'BO1' ? 'bo1' : 'bo3'}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Event type, date, and round — always visible, 3-column grid */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">{t('addLog.eventType')}</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              >
                {EVENT_TYPES.map((et) => (
                  <option key={et} value={et}>
                    {t(`eventTypes.${et}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">{t('addLog.eventDate')}</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">{t('addLog.round')}</label>
              <input
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
                className="w-full bg-white border border-slate-300 rounded-xl px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          {/* Secondary fields — collapsible to keep modal compact on mobile */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer select-none list-none py-1">
              <span className="group-open:rotate-180 transition-transform inline-block">▾</span>
              {t('addLog.moreOptions')}
            </summary>
            <div className="space-y-3 mt-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">{t('addLog.notes')}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('addLog.notesPlaceholder')}
                  className="input"
                />
              </div>

              {/* Deck version — filtered to selected deck */}
              {relevantSnapshots.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    {t('addLog.deckVersion')}
                  </label>
                  <select
                    value={deckSnapshotId}
                    onChange={(e) =>
                      setDeckSnapshotId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="input"
                  >
                    <option value="">{t('addLog.untagged')}</option>
                    {relevantSnapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  {t('addLog.battleLog')}
                  <span className="ml-1 text-slate-400">{t('addLog.battleLogHint')}</span>
                </label>
                <textarea
                  value={battleLog}
                  onChange={(e) => setBattleLog(e.target.value)}
                  placeholder={t('addLog.battleLogPlaceholder')}
                  rows={4}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 resize-y font-mono text-xs"
                />
              </div>
            </div>
          </details>
        </div>

        {saveError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700">{saveError}</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost justify-center text-sm px-4">
            {t('cancel', { ns: 'common' })}
          </button>
          <button
            onClick={() => void handleSave(true)}
            disabled={!finalArchetype.trim() || result === null || bestOf === null || saving}
            className="btn-ghost flex-1 justify-center py-3 text-sm font-bold border border-brand-200 text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            title={t('addLog.saveAndNext')}
          >
            {t('addLog.saveAndNext')}
          </button>
          <button
            onClick={() => void handleSave(false)}
            disabled={!finalArchetype.trim() || result === null || bestOf === null || saving}
            className="btn-primary flex-1 justify-center py-3 text-base font-bold disabled:opacity-50"
          >
            {saving ? t('saving', { ns: 'common' }) : t('addLog.saveAndClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
