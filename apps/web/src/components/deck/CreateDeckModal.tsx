import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Layers, Search, Check, CheckCircle2 } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { PokemonIcon } from '../shared/PokemonIcon';
import { KNOWN_ARCHETYPES, toArchetypeSlug } from '../../constants/archetypes';

interface Props {
  onClose: () => void;
  /** Called when the user wants to immediately import cards after deck creation. */
  onRequestImport?: () => void;
}

export function CreateDeckModal({ onClose, onRequestImport }: Props) {
  const { t } = useTranslation('deck');
  const { createNewDeck } = useDashboardStore();

  const [query, setQuery] = useState('');
  const [archetype, setArchetype] = useState('');
  const [archetypeName, setArchetypeName] = useState('');
  const [variant, setVariant] = useState('');
  const [saving, setSaving] = useState(false);
  const [showList, setShowList] = useState(false);
  const [deckCreated, setDeckCreated] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? KNOWN_ARCHETYPES.filter(
        (a) =>
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.slug.includes(query.toLowerCase()),
      )
    : KNOWN_ARCHETYPES;

  const selected = KNOWN_ARCHETYPES.find((a) => a.slug === archetype);

  useEffect(() => {
    if (!showList) return;
    const close = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      )
        setShowList(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showList]);

  const handleSelect = (slug: string, name: string) => {
    setArchetype(slug);
    setArchetypeName(name);
    setQuery(name);
    setShowList(false);
  };

  const handleQueryChange = (v: string) => {
    setQuery(v);
    setArchetype('');
    setArchetypeName(v);
    setShowList(true);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    if (!archetypeName.trim()) return;
    setSaving(true);
    // Use toArchetypeSlug so apostrophes are stripped before hyphenation:
    // "N's Zoroark" → "n-zoroark", not "ns-zoroark".
    await createNewDeck(
      archetype.trim() || toArchetypeSlug(archetypeName),
      archetypeName.trim(),
      variant.trim() || 'Standard',
    );
    setSaving(false);
    setDeckCreated(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-deck-modal-title"
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-xl w-full max-w-md shadow-xl flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="create-deck-modal-title"
            className="text-white font-semibold flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-brand-400" aria-hidden="true" />
            {t('createModal.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {deckCreated ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-semibold">{t('createModal.created')}</p>
              <p className="text-xs text-gray-400">{t('createModal.importPrompt')}</p>
            </div>
          ) : (
            <>
              {/* Archetype combobox */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  {t('createModal.archetype')}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                    {selected ? (
                      <PokemonIcon archetype={selected.slug} size="sm" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => setShowList(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filtered.length > 0) {
                        handleSelect(filtered[0].slug, filtered[0].name);
                      }
                    }}
                    placeholder={t('createModal.searchPlaceholder')}
                    className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-400"
                    autoComplete="off"
                  />
                </div>

                {showList && (
                  <div
                    ref={listRef}
                    className="mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-52 overflow-y-auto"
                  >
                    {filtered.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">
                        {t('createModal.noMatch')}
                      </div>
                    ) : (
                      filtered.map((a) => (
                        <button
                          key={a.slug}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelect(a.slug, a.name);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                            archetype === a.slug
                              ? 'bg-brand-500/20 text-brand-300'
                              : 'text-gray-200 hover:bg-gray-800'
                          }`}
                        >
                          <PokemonIcon archetype={a.slug} size="sm" dual />
                          <span className="flex-1 text-left">{a.name}</span>
                          {archetype === a.slug && (
                            <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Variant / deck name */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  {t('createModal.deckName')}{' '}
                  <span className="text-gray-600">({t('optional', { ns: 'common' })})</span>
                </label>
                <input
                  type="text"
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder={t('createModal.deckNamePlaceholder')}
                  className="w-full bg-white/[0.06] border border-white/[0.10] rounded-lg px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-400"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer — always visible */}
        <div className="px-5 pb-5 pt-3 border-t border-white/[0.07] flex gap-2 shrink-0">
          {deckCreated ? (
            <>
              <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">
                {t('done', { ns: 'common' })}
              </button>
              {onRequestImport && (
                <button
                  onClick={() => {
                    onClose();
                    onRequestImport();
                  }}
                  className="btn-primary flex-1 justify-center text-sm"
                >
                  {t('createModal.importCards')}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleSave}
                disabled={!archetypeName.trim() || saving}
                className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
              >
                {saving ? t('createModal.creating') : t('createModal.create')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
