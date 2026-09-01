import { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, Star, Pencil, Check, Search } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { PokemonIcon } from '../shared/PokemonIcon';
import { CreateDeckModal } from './CreateDeckModal';
import { ImportDeckModal } from './ImportDeckModal';
import { KNOWN_ARCHETYPES } from '../../constants/archetypes';

export type DeckSection = 'deck' | 'analytics';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function WrPill({ rate, games }: { rate: number; games: number }) {
  const { t } = useTranslation('deck');
  if (games === 0)
    return <span className="text-[10px] text-slate-400">{t('switcher.noGames')}</span>;
  const cls = rate >= 55 ? 'text-emerald-700' : rate >= 45 ? 'text-amber-700' : 'text-red-700';
  return (
    <span className={`text-[10px] font-semibold tabular-nums ${cls}`}>
      {t('switcher.wrPill', { rate, count: games })}
    </span>
  );
}

function deckLabel(deck: { archetypeName: string; variant: string }): string {
  const v = deck.variant?.trim();
  if (!v || v === 'Default' || v === 'Standard') return deck.archetypeName;
  return v;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DeckSwitcher() {
  const { t } = useTranslation('deck');
  const { decks, activeDeckId, opponentLogs, setActiveDeck, removeDecks, updateCurrentDeck } =
    useDashboardStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [editingArchetypeFor, setEditingArchetypeFor] = useState<number | null>(null);
  const [archetypeSearch, setArchetypeSearch] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const deckStats = useMemo(
    () =>
      new Map(
        decks.map((d) => {
          const logs = opponentLogs.filter((l) => l.deckId === d.id);
          const wins = logs.filter((l) => l.result === 'W').length;
          const losses = logs.filter((l) => l.result === 'L').length;
          const rate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
          return [d.id!, { games: logs.length, winRate: rate }] as const;
        }),
      ),
    [decks, opponentLogs],
  );

  const filteredArchetypes = useMemo(() => {
    const q = archetypeSearch.toLowerCase().trim();
    if (!q) return KNOWN_ARCHETYPES;
    return KNOWN_ARCHETYPES.filter((a) => a.name.toLowerCase().includes(q) || a.slug.includes(q));
  }, [archetypeSearch]);

  const editingDeck = decks.find((d) => d.id === editingArchetypeFor);

  const openArchetypePicker = async (deckId: number) => {
    if (deckId !== activeDeckId) await setActiveDeck(deckId);
    setEditingArchetypeFor(deckId);
    setArchetypeSearch('');
    setCustomSlug('');
    setTimeout(() => searchRef.current?.focus(), 60);
  };

  const closePicker = () => {
    setEditingArchetypeFor(null);
    setArchetypeSearch('');
    setCustomSlug('');
  };

  const selectArchetype = async (slug: string, name: string) => {
    await updateCurrentDeck({ archetype: slug, archetypeName: name });
    closePicker();
  };

  const applyCustomSlug = async () => {
    const s = customSlug.trim();
    if (!s) return;
    // Derive a display name: capitalise each word, keep 'ex' lowercase
    const name = s
      .split('-')
      .map((w) => (w === 'ex' ? 'ex' : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
    await selectArchetype(s, name);
  };

  return (
    <>
      <div className="card p-0 overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-[11px] font-bold text-brand-700 uppercase tracking-widest">
            {t('switcher.myDecks')}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors"
          >
            <Plus className="w-3 h-3" aria-hidden="true" /> {t('switcher.new')}
          </button>
        </div>

        {/* ── Deck rows ── */}
        {decks.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">{t('switcher.empty')}</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {decks.map((deck) => {
              const isActive = deck.id === activeDeckId;
              const stats = deckStats.get(deck.id!);
              const deleting = confirmDelete === deck.id;

              return (
                <div
                  key={deck.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    isActive
                      ? 'bg-brand-50 border-l-2 border-brand-500'
                      : 'hover:bg-slate-50 border-l-2 border-transparent cursor-pointer'
                  }`}
                  onClick={() => !deleting && !isActive && deck.id && setActiveDeck(deck.id)}
                >
                  <PokemonIcon archetype={deck.archetype} size="md" dual reserveSecondary />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-semibold truncate ${isActive ? 'text-slate-900' : 'text-slate-700'}`}
                      >
                        {deckLabel(deck)}
                      </span>
                      {isActive && (
                        <Star className="w-3 h-3 fill-current text-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {deck.archetypeName !== deckLabel(deck) && (
                        <span className="text-[11px] text-slate-400 truncate">
                          {deck.archetypeName}
                        </span>
                      )}
                      {stats && <WrPill rate={stats.winRate} games={stats.games} />}
                    </div>
                  </div>

                  {/* Actions — stop click from bubbling to row */}
                  <div
                    className="flex items-center gap-1 shrink-0 ml-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {deleting ? (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                        <span className="text-xs text-red-700">{t('switcher.deletePrompt')}</span>
                        <button
                          onClick={() => {
                            if (deck.id) removeDecks(deck.id);
                            setConfirmDelete(null);
                          }}
                          className="text-xs text-red-700 hover:text-red-800 font-medium px-1.5 py-0.5 rounded bg-red-100"
                        >
                          {t('switcher.yes')}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          aria-label={t('cancel', { ns: 'common' })}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => deck.id && openArchetypePicker(deck.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            editingArchetypeFor === deck.id
                              ? 'text-brand-700 bg-brand-100'
                              : 'text-slate-400 hover:text-brand-700 hover:bg-brand-50'
                          }`}
                          title={t('switcher.changeArchetype')}
                          aria-label={t('switcher.changeArchetype')}
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => deck.id && setConfirmDelete(deck.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                          title={t('switcher.deleteDeck')}
                          aria-label={t('switcher.deleteDeck')}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Archetype picker (slides in when a deck's pencil is clicked) ── */}
        {editingArchetypeFor !== null && (
          <div className="border-t border-slate-200 bg-slate-50">
            {/* Picker header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-semibold text-slate-600">
                {t('switcher.archetypeFor')}{' '}
                <span className="text-slate-900">{editingDeck ? deckLabel(editingDeck) : '…'}</span>
              </span>
              <button
                onClick={closePicker}
                aria-label={t('close', { ns: 'common' })}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
              <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3 py-2">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={archetypeSearch}
                  onChange={(e) => setArchetypeSearch(e.target.value)}
                  placeholder={t('switcher.searchPlaceholder')}
                  className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                {archetypeSearch && (
                  <button
                    onClick={() => setArchetypeSearch('')}
                    aria-label={t('switcher.clearSearch')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Archetype list */}
            <div className="max-h-56 overflow-y-auto px-2 pb-2">
              {filteredArchetypes.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-4">{t('switcher.noMatch')}</p>
              ) : (
                filteredArchetypes.map((a) => {
                  const isCurrent = editingDeck?.archetype === a.slug;
                  return (
                    <button
                      key={a.slug}
                      onClick={() => selectArchetype(a.slug, a.name)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors ${
                        isCurrent
                          ? 'bg-brand-100 text-brand-800'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <PokemonIcon archetype={a.slug} size="sm" dual reserveSecondary />
                      <span className="flex-1 text-sm truncate">{a.name}</span>
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-brand-700 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Custom slug input */}
            <div className="px-4 pb-3 pt-1 border-t border-slate-200">
              <p className="text-[10px] text-slate-400 mb-1.5 uppercase tracking-wider">
                {t('switcher.customSlugLabel')}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applyCustomSlug()}
                  placeholder={t('switcher.customSlugPlaceholder')}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 font-mono"
                />
                <button
                  onClick={applyCustomSlug}
                  disabled={!customSlug.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 disabled:opacity-40 transition-colors"
                >
                  {t('switcher.apply')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDeckModal
          onClose={() => setShowCreate(false)}
          onRequestImport={() => setShowImport(true)}
        />
      )}
      {showImport && <ImportDeckModal onClose={() => setShowImport(false)} />}
    </>
  );
}
