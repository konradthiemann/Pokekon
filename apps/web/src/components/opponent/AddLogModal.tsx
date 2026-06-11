import { useState } from 'react';
import { X } from 'lucide-react';
import type { EventType, MatchResult } from '../../types';
import { addOpponentLog } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';
import { PokemonIcon } from '../shared/PokemonIcon';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';

/**
 * Describes the active state and color tokens for each result tap button.
 *
 * Using a typed tuple keeps the button list declarative — no per-button
 * conditionals needed in the JSX.
 */
const RESULT_BUTTONS = [
  [
    'W',
    'Win',
    'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white',
    'bg-emerald-950/40 border-emerald-800 text-emerald-400',
  ],
  [
    'L',
    'Loss',
    'bg-red-600 hover:bg-red-500 border-red-500 text-white',
    'bg-red-950/40 border-red-800 text-red-400',
  ],
  [
    'T',
    'Tie',
    'bg-yellow-600 hover:bg-yellow-500 border-yellow-500 text-white',
    'bg-yellow-950/40 border-yellow-800 text-yellow-400',
  ],
] as const;

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
 * fields (round, notes, deck version, battle log) in a `<details>` element
 * so the modal feels compact on mobile without removing functionality.
 *
 * React Concept: `customArch` is kept as a separate piece of state from
 * `archetype` so that switching away from "Other…" and back restores the
 * typed text, avoiding accidental data loss if the user mis-taps.
 */
export function AddLogModal({ onClose, preselectedDeckId }: Props) {
  const { decks, deckSnapshots, activeDeckId } = useDashboardStore();
  const today = new Date().toISOString().split('T')[0];

  const initialDeckId = preselectedDeckId ?? activeDeckId ?? decks[0]?.id ?? null;

  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(initialDeckId);
  const [archetype, setArchetype] = useState('');
  const [customArch, setCustomArch] = useState('');
  const [eventType, setEventType] = useState<EventType>('Online');
  const [eventDate, setEventDate] = useState(today);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [round, setRound] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [deckSnapshotId, setDeckSnapshotId] = useState<number | ''>('');
  const [battleLog, setBattleLog] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
   */
  const handleSave = async () => {
    if (!finalArchetype.trim() || result === null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addOpponentLog({
        archetype: finalArchetype.trim(),
        eventType,
        eventDate,
        result,
        notes: notes.trim(),
        round: round === '' ? undefined : Number(round),
        deckSnapshotId: deckSnapshotId === '' ? undefined : Number(deckSnapshotId),
        battleLog: battleLog.trim() || undefined,
        deckId: selectedDeckId ?? undefined,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save match');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full max-w-md shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">Log Match</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* My Deck — always first */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">My Deck</label>
            <select
              value={selectedDeckId ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                setSelectedDeckId(val);
                setDeckSnapshotId('');
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value="">— No deck selected —</option>
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
            <label className="block text-xs text-gray-400 mb-2">Opponent Deck</label>
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
                      ? 'bg-brand-700/50 border-brand-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
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
                    ? 'bg-brand-700/50 border-brand-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-lg leading-none">+</span>
                <span className="text-xs font-medium">Other…</span>
              </button>
            </div>
            {/* Custom archetype text input — shown when no known tile is selected */}
            {isCustomMode && (
              <input
                type="text"
                value={customArch}
                onChange={(e) => setCustomArch(e.target.value)}
                placeholder="Archetype name"
                className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            )}
          </div>

          {/* Result — 3-button tap row */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Result</label>
            <div className="grid grid-cols-3 gap-2">
              {RESULT_BUTTONS.map(([val, label, activeCls, inactiveCls]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setResult(val as MatchResult)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${
                    result === val ? activeCls + ' scale-105 shadow-lg' : inactiveCls
                  }`}
                  aria-pressed={result === val}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Event type, date, and round — always visible, 3-column grid */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as EventType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              >
                <option value="Online">Online</option>
                <option value="LC">League Challenge</option>
                <option value="LCup">League Cup</option>
                <option value="Regional">Regional</option>
                <option value="Worlds">Worlds</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Round</label>
              <input
                type="number"
                min={1}
                value={round}
                onChange={(e) => setRound(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="—"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Secondary fields — collapsible to keep modal compact on mobile */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none list-none py-1">
              <span className="group-open:rotate-180 transition-transform inline-block">▾</span>
              More options (notes, deck version, battle log)
            </summary>
            <div className="space-y-3 mt-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Lost to Phantom Dive stream"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Deck version — filtered to selected deck */}
              {relevantSnapshots.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Deck version played</label>
                  <select
                    value={deckSnapshotId}
                    onChange={(e) =>
                      setDeckSnapshotId(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="">— Untagged —</option>
                    {relevantSnapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Battle log (optional)
                  <span className="ml-1 text-gray-600">— for AI analysis</span>
                </label>
                <textarea
                  value={battleLog}
                  onChange={(e) => setBattleLog(e.target.value)}
                  placeholder="Paste battle log here…"
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-y font-mono text-xs"
                />
              </div>
            </div>
          </details>
        </div>

        {saveError && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
            <p className="text-xs text-red-400">{saveError}</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="btn-ghost justify-center text-sm px-4">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!finalArchetype.trim() || result === null || saving}
            className="btn-primary flex-1 justify-center py-3 text-base font-bold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Log Match'}
          </button>
        </div>
      </div>
    </div>
  );
}
