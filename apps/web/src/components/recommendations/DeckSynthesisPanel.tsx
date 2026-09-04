import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, KeyRound, Info } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY, isAnonymousUser } from '../../lib/demo';
import type { SynthesisSection } from '@pokekon/shared';

/**
 * Rendered deck-tips text over the same facts as the analytics below it
 * (plan .claude/plans/ai-recommendation-synthesis.md §3.10). Mounted in
 * `DeckTipsSection.tsx` directly above `<RecommendationsPanel />` — this
 * panel is the summary, the detail lives below it.
 *
 * Generation is user-triggered only (spec decision 1): loading the panel
 * fetches the current facts + any cached text (no token cost), but never
 * calls the LLM on its own.
 */
export function DeckSynthesisPanel() {
  const { t } = useTranslation('recommendations');
  const {
    activeDeckId,
    deckSynthesis,
    isLoadingSynthesis,
    isSynthesizing,
    synthesisError,
    loadDeckSynthesis,
    runDeckSynthesis,
  } = useDashboardStore();

  // Demo guests never persist their key server-side — the same
  // browser-only, per-request ephemeral token as MatchDetailModal.tsx.
  const { data: session } = authClient.useSession();
  const isDemo = isAnonymousUser(session?.user);
  const [demoTokenPresent, setDemoTokenPresent] = useState(() =>
    Boolean(localStorage.getItem(DEMO_AI_TOKEN_KEY)),
  );
  const [demoTokenInput, setDemoTokenInput] = useState('');

  // Read-only, no token cost — safe on mount / deck switch (same guard
  // precedence as `loadCardStats` in `refresh()`, dashboardStore.ts).
  useEffect(() => {
    if (activeDeckId != null) {
      void loadDeckSynthesis(activeDeckId);
    }
  }, [activeDeckId, loadDeckSynthesis]);

  const handleGenerate = useCallback(() => {
    if (isDemo && !demoTokenPresent) {
      const trimmed = demoTokenInput.trim();
      if (!trimmed) return;
      localStorage.setItem(DEMO_AI_TOKEN_KEY, trimmed);
      setDemoTokenPresent(true);
      setDemoTokenInput('');
      void runDeckSynthesis({ apiKey: trimmed });
      return;
    }
    void runDeckSynthesis();
  }, [isDemo, demoTokenPresent, demoTokenInput, runDeckSynthesis]);

  // Not loaded yet (or the load failed silently, per loadDeckSynthesis) —
  // still render the wrapper so DOM-order assertions relative to
  // RecommendationsPanel below hold regardless of load timing.
  if (!deckSynthesis) {
    return (
      <div data-testid="deck-synthesis-panel" className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-700" aria-hidden="true" />
          {t('synthesis.title')}
        </h3>
        {isLoadingSynthesis && (
          <p className="text-xs text-slate-500 mt-2 animate-pulse">
            {t('loading', { ns: 'common' })}
          </p>
        )}
      </div>
    );
  }

  const { synthesis, stale, availableFactCount, hasApiKey } = deckSynthesis;
  const effectiveHasKey = isDemo ? demoTokenPresent : hasApiKey;
  const hasFacts = availableFactCount > 0;
  const isEmpty = Boolean(synthesis && synthesis.claims.length === 0 && synthesis.droppedCount > 0);
  const canSubmit = isDemo ? demoTokenInput.trim().length > 0 || demoTokenPresent : effectiveHasKey;
  const buttonDisabled = isSynthesizing || !hasFacts || !canSubmit;

  return (
    <div data-testid="deck-synthesis-panel" className="card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-700" aria-hidden="true" />
          {t('synthesis.title')}
        </h3>
        {stale && (
          <span
            data-testid="deck-synthesis-stale-badge"
            className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5"
          >
            {t('synthesis.stale')}
          </span>
        )}
      </div>

      {!hasFacts && (
        <p data-testid="deck-synthesis-no-facts" className="text-xs text-slate-500">
          {t('synthesis.noFacts')}
        </p>
      )}

      {hasFacts && !effectiveHasKey && !isDemo && (
        <p
          data-testid="deck-synthesis-no-key"
          className="text-xs text-slate-600 flex items-start gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
          {t('synthesis.noKey')}
        </p>
      )}

      {hasFacts && !effectiveHasKey && isDemo && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-600 flex items-start gap-1.5">
            <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
            {t('synthesis.noKeyDemo')}
          </p>
          <input
            data-testid="deck-synthesis-demo-token-input"
            type="password"
            value={demoTokenInput}
            onChange={(e) => setDemoTokenInput(e.target.value)}
            placeholder="GitHub Models Token (ghp_…)"
            className="input font-mono text-xs"
          />
        </div>
      )}

      {!synthesis && hasFacts && <p className="text-sm text-slate-600">{t('synthesis.intro')}</p>}

      {synthesis && !isEmpty && (
        <div className="space-y-3">
          {synthesis.sections.map((block: { section: SynthesisSection; sentences: string[] }) => (
            <div key={block.section}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                {t(`synthesis.sections.${block.section}`)}
              </h4>
              {block.sentences.map((sentence, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed">
                  {sentence}
                </p>
              ))}
            </div>
          ))}
          <p className="text-[10px] text-slate-400">
            {t('synthesis.generatedAt', {
              date: new Date(synthesis.generatedAt).toLocaleString(),
            })}
          </p>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer flex items-center gap-1.5 w-fit">
              <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {t('synthesis.disclosure')}
            </summary>
            {/* Facts, not the rendered claim sentences themselves (those are
                already visible above) — this lists the underlying numbers
                the text was generated from. */}
            <ul className="mt-1.5 ml-5 list-disc space-y-0.5">
              {synthesis.facts.map((fact) => (
                <li key={fact.id}>
                  {fact.label}: {fact.value.toFixed(1)}
                  {fact.unit === 'pct' ? '%' : ''}
                </li>
              ))}
            </ul>
            {synthesis.droppedCount > 0 && (
              <p className="mt-1.5">
                {t('synthesis.disclosureDropped', { count: synthesis.droppedCount })}
              </p>
            )}
          </details>
        </div>
      )}

      {isEmpty && (
        <p data-testid="deck-synthesis-empty" className="text-sm text-slate-500">
          {t('synthesis.empty')}
        </p>
      )}

      {synthesisError && (
        <p
          data-testid="deck-synthesis-error"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
        >
          {synthesisError}
        </p>
      )}

      <button
        type="button"
        data-testid="deck-synthesis-generate-button"
        onClick={handleGenerate}
        disabled={buttonDisabled}
        className="btn-primary text-xs disabled:opacity-40"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {isSynthesizing
          ? t('synthesis.generating')
          : synthesis
            ? t('synthesis.regenerate')
            : t('synthesis.generate')}
      </button>
    </div>
  );
}
