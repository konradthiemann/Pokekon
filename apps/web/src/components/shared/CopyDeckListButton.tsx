import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { exportDeckList, type ExportCard } from '@pokekon/shared';

type CopyState = 'idle' | 'copied' | 'failed';

/** Clipboard write with a textarea fallback for browsers/contexts without the
 *  async Clipboard API (older Safari, non-secure contexts). */
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  if (!ok) throw new Error('execCommand copy failed');
}

/**
 * Copies a deck in the Pokémon TCG Live list format (shared `exportDeckList`).
 * Always exports English headers: that is the format PTCGL and Limitless emit
 * by default, and our own importer reads both languages.
 */
export function CopyDeckListButton({
  cards,
  compact = false,
  className = '',
}: {
  cards: ExportCard[];
  /** Short label ("Kopieren") for tight headers. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('common');
  const [state, setState] = useState<CopyState>('idle');
  const { text, missingPrints } = exportDeckList(cards);

  const handleCopy = async () => {
    try {
      await writeClipboard(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 2000);
  };

  const label =
    state === 'copied'
      ? t('copyDeck.copied')
      : state === 'failed'
        ? t('copyDeck.failed')
        : compact
          ? t('copyDeck.short')
          : t('copyDeck.label');

  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={cards.length === 0}
        className="btn-ghost text-xs"
        title={t('copyDeck.label')}
        data-testid="copy-deck-list"
      >
        {state === 'copied' ? (
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
        )}
        <span aria-live="polite">{label}</span>
      </button>
      {missingPrints.length > 0 && (
        <span className="text-[11px] text-amber-700" data-testid="copy-deck-missing-prints">
          {t('copyDeck.missingPrints', { count: missingPrints.length })}
        </span>
      )}
    </span>
  );
}
