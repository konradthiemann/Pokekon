import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { parseDeckList, importCards } from '../../lib/deckImport';
import type { ParsedCard } from '../../lib/deckImport';
import { useDashboardStore } from '../../store/dashboardStore';
import type { CardType } from '../../types';

interface Props {
  onClose: () => void;
}

type Step = 'paste' | 'preview' | 'done';

const TYPE_COLOR: Record<string, string> = {
  Pokemon: 'text-red-400',
  Trainer: 'text-blue-400',
  Energy: 'text-orange-400',
};

const ROLE_COLORS: Record<string, string> = {
  attacker: 'bg-red-900/40 text-red-300 border-red-800',
  tech: 'bg-purple-900/40 text-purple-300 border-purple-800',
  supporter: 'bg-blue-900/40 text-blue-300 border-blue-800',
  item: 'bg-green-900/40 text-green-300 border-green-800',
  stadium: 'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  energy: 'bg-orange-900/40 text-orange-300 border-orange-800',
};

// Collapsible card group — keeps the preview compact on small screens
function CardGroup({ type, cards, total }: { type: CardType; cards: ParsedCard[]; total: number }) {
  const { t } = useTranslation('deck');
  const [open, setOpen] = useState(true);
  const color = TYPE_COLOR[type] ?? 'text-gray-400';

  return (
    <div className="rounded-lg overflow-hidden border border-white/[0.07]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] transition-colors"
      >
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>
          {t(`cardTypes.${type}`)} <span className="text-white/40 font-normal">({total})</span>
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-white/30" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-white/30" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div>
          {cards.map((card, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 border-t border-white/[0.04]"
            >
              <span className="text-white/40 text-xs w-4 font-mono text-right shrink-0">
                {card.count}
              </span>
              <span className="flex-1 text-xs text-gray-200 truncate">{card.name}</span>
              <span className="text-xs text-white/25 shrink-0">{card.set}</span>
              <span
                className={`badge border text-[10px] shrink-0 ${ROLE_COLORS[card.role] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}
              >
                {t(`roles.${card.role}`)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImportDeckModal({ onClose }: Props) {
  const { t } = useTranslation('deck');
  const { activeDeckId } = useDashboardStore();
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [cards, setCards] = useState<ParsedCard[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [replace, setReplace] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleParse = () => {
    const result = parseDeckList(text);
    setCards(result.cards);
    setSkipped(result.skippedLines);
    setTotalCount(result.totalCount);
    setStep('preview');
  };

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      await importCards(cards, replace, activeDeckId ?? undefined);
      setStep('done');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : t('importModal.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const groups = [
    { type: 'Pokemon' as const },
    { type: 'Trainer' as const },
    { type: 'Energy' as const },
  ]
    .map((g) => ({ ...g, cards: cards.filter((c) => c.type === g.type) }))
    .filter((g) => g.cards.length > 0)
    .map((g) => ({ ...g, total: g.cards.reduce((s, c) => s + c.count, 0) }));

  return (
    // Bottom-sheet on mobile (slides up, no surrounding padding)
    // Centred dialog on sm+
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-deck-modal-title"
        className="
        bg-gray-900 border border-gray-700
        rounded-t-2xl sm:rounded-xl
        w-full max-w-lg shadow-2xl
        flex flex-col
        max-h-[92dvh] sm:max-h-[88dvh]
      "
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-400" aria-hidden="true" />
            <h2 id="import-deck-modal-title" className="text-white font-semibold text-sm">
              {t('importModal.title')}
            </h2>
            {step === 'preview' && (
              <span
                className={`text-xs font-semibold ml-1 ${totalCount === 60 ? 'text-emerald-400' : 'text-yellow-400'}`}
              >
                · {totalCount}/60
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t('close', { ns: 'common' })}
            className="text-gray-500 hover:text-gray-300 p-1"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-3">
          {/* Step: paste */}
          {step === 'paste' && (
            <>
              <p className="text-xs text-gray-400">
                {t('importModal.pasteHintBefore')}{' '}
                <span className="text-gray-300">{t('importModal.pasteHintSections')}</span>{' '}
                {t('importModal.pasteHintAfter')}{' '}
                <code className="text-brand-400">{t('importModal.lineFormat')}</code>
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                placeholder={t('importModal.pastePlaceholder')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500 font-mono resize-none"
              />
            </>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <>
              {/* Replace toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                    className="rounded accent-brand-500"
                  />
                  <span className="text-xs text-gray-400">{t('importModal.replaceExisting')}</span>
                </label>
                {replace && (
                  <p className="text-xs text-yellow-500 pl-5">{t('importModal.replaceWarning')}</p>
                )}
                {activeDeckId == null && (
                  <p className="text-xs text-red-400 pl-5">{t('importModal.noDeckSelected')}</p>
                )}
              </div>

              {/* Collapsible card groups */}
              {groups.map((g) => (
                <CardGroup key={g.type} type={g.type} cards={g.cards} total={g.total} />
              ))}

              {/* Skipped lines */}
              {skipped.length > 0 && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-800/40 rounded-lg">
                  <p className="text-xs text-yellow-500 font-semibold mb-1">
                    {t('importModal.skippedLines', { count: skipped.length })}
                  </p>
                  {skipped.map((line, i) => (
                    <p key={i} className="text-xs text-yellow-600/80 font-mono truncate">
                      {line}
                    </p>
                  ))}
                </div>
              )}

              {importError && (
                <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{importError}</p>
                </div>
              )}
            </>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-white font-semibold">{t('importModal.done')}</p>
              <p className="text-xs text-gray-400">
                {t('importModal.cardsAdded', { count: totalCount })}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer — always pinned, never scrolls away ── */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
          {step === 'paste' && (
            <>
              <button onClick={onClose} className="btn-ghost flex-1 justify-center text-sm">
                {t('cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleParse}
                disabled={!text.trim()}
                className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
              >
                {t('importModal.preview')}
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('paste')}
                className="btn-ghost flex-1 justify-center text-sm"
              >
                {t('back', { ns: 'common' })}
              </button>
              <button
                onClick={handleImport}
                disabled={cards.length === 0 || importing || activeDeckId == null}
                className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
              >
                {importing
                  ? t('importModal.importing')
                  : t('importModal.importCount', { count: totalCount })}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="btn-primary flex-1 justify-center text-sm">
              {t('done', { ns: 'common' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
