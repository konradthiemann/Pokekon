import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, KeyRound, Info } from 'lucide-react';
import type { ArchetypeSynthesisScope, RankedCluster, SynthesisSection } from '@pokekon/shared';
import {
  generateArchetypeSynthesis,
  getArchetypeSynthesis,
  type ArchetypeSynthesisReadResponse,
} from '../../lib/api';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY, isAnonymousUser } from '../../lib/demo';
import { WinRateBadge } from './WinRateBadge';

interface ArchetypeRecommendationPanelProps {
  archetypeId: string;
  archetypeName: string;
  windowDays: number;
}

/** One successful GET, tagged with the request key it answers (archetype +
 *  window + scope) — same "ignore stale responses" pattern as
 *  ArchetypeDetail.tsx's LoadedDetail, deliberately local state instead of
 *  the dashboardStore (Spec 10 Slice C UI, HANDOVER_SPEC10.md "Was fehlt" 1+2). */
interface LoadedSynthesis {
  key: string;
  data: ArchetypeSynthesisReadResponse;
}

/** One ranked decklist cluster: rank, Wilson-lower-bound win rate (+ its
 *  interval when available), average placement percentile, W/L/T record,
 *  member count and a compact Pokémon-card overview of the representative
 *  list. `DecklistCard.tsx` is not reusable here — it expects an
 *  `ArchetypeListEntry` with tournament context a cluster does not have. */
function ClusterItem({ cluster }: { cluster: RankedCluster }) {
  const { t } = useTranslation('meta');
  const record =
    cluster.totalTies > 0
      ? `${cluster.totalWins}-${cluster.totalLosses}-${cluster.totalTies}`
      : `${cluster.totalWins}-${cluster.totalLosses}`;
  const pokemonSummary = cluster.representative.pokemon
    .map((card) => `${card.count}× ${card.name}`)
    .join(', ');

  return (
    <div data-testid="archetype-recommendation-cluster-item" className="card p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-brand-700">
          {t('archetypeDetail.recommendation.cluster.rank', { rank: cluster.rank })}
        </span>
        <WinRateBadge pct={cluster.winRateInterval?.pct ?? null} />
      </div>
      {cluster.winRateInterval && (
        <p className="text-[11px] text-slate-400 font-mono">
          {`${cluster.winRateInterval.lowPct.toFixed(1)}–${cluster.winRateInterval.highPct.toFixed(1)} %`}
        </p>
      )}
      <p className="text-xs text-slate-600">
        {t('archetypeDetail.recommendation.cluster.games', { record })}
        {' · '}
        {t('archetypeDetail.recommendation.cluster.members', {
          count: cluster.memberStandingIds.length,
        })}
      </p>
      {cluster.avgPlacementPercentile !== null && (
        <p className="text-xs text-slate-500">
          {t('archetypeDetail.recommendation.cluster.placement', {
            pct: cluster.avgPlacementPercentile.toFixed(0),
          })}
        </p>
      )}
      {pokemonSummary && (
        <p className="text-xs text-slate-500 truncate" title={pokemonSummary}>
          {pokemonSummary}
        </p>
      )}
    </div>
  );
}

/**
 * Ranked decklist clusters + optional KI-text recommendation for one archetype
 * (Spec 10 Slice C, specs/archetype-meta-analysis.md). Mounted in
 * `ArchetypeDetail.tsx` between the matchup table and the raw decklists.
 *
 * Deliberately local state (request-key pattern, mirrors `ArchetypeDetail`
 * itself) instead of the dashboardStore that `DeckSynthesisPanel` uses --
 * `ArchetypeDetail.tsx` does not read from that store either. Generation is
 * user-triggered only (same principle as DeckSynthesisPanel/Spec 8): a scope
 * switch re-reads (GET), it never re-generates on its own.
 */
export function ArchetypeRecommendationPanel({
  archetypeId,
  archetypeName,
  windowDays,
}: ArchetypeRecommendationPanelProps) {
  const { t } = useTranslation('meta');
  const [scope, setScope] = useState<ArchetypeSynthesisScope>('global');
  const requestKey = `${archetypeId}|${windowDays}|${scope}`;

  const [loaded, setLoaded] = useState<LoadedSynthesis | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  const { data: session } = authClient.useSession();
  const isDemo = isAnonymousUser(session?.user);
  const [demoTokenPresent, setDemoTokenPresent] = useState(() =>
    Boolean(localStorage.getItem(DEMO_AI_TOKEN_KEY)),
  );
  const [demoTokenInput, setDemoTokenInput] = useState('');

  useEffect(() => {
    let cancelled = false;
    const key = `${archetypeId}|${windowDays}|${scope}`;
    getArchetypeSynthesis(archetypeId, { days: windowDays, scope })
      .then((data) => {
        if (cancelled) return;
        setLoaded({ key, data });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[ArchetypeRecommendationPanel] load failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [archetypeId, windowDays, scope]);

  const current = loaded?.key === requestKey ? loaded.data : null;

  const handleGenerate = useCallback(() => {
    if (!current) return;

    const run = (apiKey?: string) => {
      setIsSynthesizing(true);
      setSynthesisError(null);
      generateArchetypeSynthesis(archetypeId, { days: windowDays, scope, apiKey })
        .then((response) => {
          setLoaded((prev) =>
            prev !== null && prev.key === requestKey
              ? {
                  ...prev,
                  data: {
                    ...prev.data,
                    synthesis: response.synthesis,
                    stale: response.stale,
                    currentInputHash: response.synthesis.inputHash,
                  },
                }
              : prev,
          );
          setIsSynthesizing(false);
        })
        .catch((err) => {
          setIsSynthesizing(false);
          setSynthesisError(err instanceof Error ? err.message : String(err));
        });
    };

    if (isDemo && !demoTokenPresent) {
      const trimmed = demoTokenInput.trim();
      if (!trimmed) return;
      localStorage.setItem(DEMO_AI_TOKEN_KEY, trimmed);
      setDemoTokenPresent(true);
      setDemoTokenInput('');
      run(trimmed);
      return;
    }
    run();
  }, [
    current,
    isDemo,
    demoTokenPresent,
    demoTokenInput,
    archetypeId,
    windowDays,
    scope,
    requestKey,
  ]);

  const synthesis = current?.synthesis ?? null;
  const stale = current?.stale ?? false;
  const availableFactCount = current?.availableFactCount ?? 0;
  const hasApiKey = current?.hasApiKey ?? false;
  const effectiveHasKey = isDemo ? demoTokenPresent : hasApiKey;
  const hasFacts = availableFactCount > 0;
  const isEmpty = Boolean(synthesis && synthesis.claims.length === 0 && synthesis.droppedCount > 0);
  const canSubmit = isDemo ? demoTokenInput.trim().length > 0 || demoTokenPresent : effectiveHasKey;
  const buttonDisabled = isSynthesizing || !hasFacts || !canSubmit;
  const clusters = current?.clusters ?? [];

  return (
    <div
      data-testid="archetype-recommendation-panel"
      aria-label={t('archetypeDetail.recommendation.title')}
      className="card p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3
          className="text-sm font-semibold text-slate-900 flex items-center gap-2"
          title={archetypeName}
        >
          <Sparkles className="w-4 h-4 text-brand-700" aria-hidden="true" />
          {t('archetypeDetail.recommendation.title')}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="archetype-recommendation-scope-global"
            aria-pressed={scope === 'global'}
            onClick={() => setScope('global')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              scope === 'global' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('archetypeDetail.recommendation.scope.global')}
          </button>
          <button
            type="button"
            data-testid="archetype-recommendation-scope-local"
            aria-pressed={scope === 'local'}
            onClick={() => setScope('local')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              scope === 'local' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('archetypeDetail.recommendation.scope.local')}
          </button>
        </div>
        {stale && (
          <span
            data-testid="archetype-recommendation-stale-badge"
            className="text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5"
          >
            {t('archetypeDetail.recommendation.stale')}
          </span>
        )}
      </div>

      {/* Gated on `current` (not just `clusters.length`): before the GET
          resolves, `clusters` is `[]` too, and that must not be confused
          with the genuine "nothing ranked yet" state below -- otherwise
          both would momentarily share the same paragraph, racing with
          whichever render wins first. */}
      {current &&
        (clusters.length === 0 ? (
          <p
            data-testid="archetype-recommendation-clusters-empty"
            className="text-sm text-slate-500"
          >
            {t('archetypeDetail.recommendation.clustersEmpty')}
          </p>
        ) : (
          <div
            data-testid="archetype-recommendation-cluster-list"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {clusters.map((cluster) => (
              <ClusterItem key={cluster.rank} cluster={cluster} />
            ))}
          </div>
        ))}

      {!synthesis && !hasFacts && (
        <p data-testid="archetype-recommendation-no-facts" className="text-xs text-slate-500">
          {t('archetypeDetail.recommendation.noFacts')}
        </p>
      )}

      {hasFacts && !effectiveHasKey && !isDemo && (
        <p
          data-testid="archetype-recommendation-no-key"
          className="text-xs text-slate-600 flex items-start gap-1.5"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
          {t('archetypeDetail.recommendation.noKey')}
        </p>
      )}

      {hasFacts && !effectiveHasKey && isDemo && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-600 flex items-start gap-1.5">
            <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
            {t('archetypeDetail.recommendation.noKeyDemo')}
          </p>
          <input
            data-testid="archetype-recommendation-demo-token-input"
            type="password"
            value={demoTokenInput}
            onChange={(e) => setDemoTokenInput(e.target.value)}
            placeholder="GitHub Models Token (ghp_…)"
            className="input font-mono text-xs"
          />
        </div>
      )}

      {!synthesis && hasFacts && (
        <p className="text-sm text-slate-600">{t('archetypeDetail.recommendation.intro')}</p>
      )}

      {synthesis && !isEmpty && (
        <div className="space-y-3">
          {synthesis.sections.map((block: { section: SynthesisSection; sentences: string[] }) => (
            <div key={block.section}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                {t(`archetypeDetail.recommendation.sections.${block.section}`)}
              </h4>
              {block.sentences.map((sentence, i) => (
                <p key={i} className="text-sm text-slate-700 leading-relaxed">
                  {sentence}
                </p>
              ))}
            </div>
          ))}
          <p className="text-[10px] text-slate-400">
            {t('archetypeDetail.recommendation.generatedAt', {
              date: new Date(synthesis.generatedAt).toLocaleString(),
            })}
          </p>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer flex items-center gap-1.5 w-fit">
              <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {t('archetypeDetail.recommendation.disclosure')}
            </summary>
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
                {t('archetypeDetail.recommendation.disclosureDropped', {
                  count: synthesis.droppedCount,
                })}
              </p>
            )}
          </details>
        </div>
      )}

      {isEmpty && (
        <p data-testid="archetype-recommendation-empty" className="text-sm text-slate-500">
          {t('archetypeDetail.recommendation.empty')}
        </p>
      )}

      {synthesisError && (
        <p
          data-testid="archetype-recommendation-error"
          className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
        >
          {synthesisError}
        </p>
      )}

      <button
        type="button"
        data-testid="archetype-recommendation-generate-button"
        onClick={handleGenerate}
        disabled={buttonDisabled}
        className="btn-primary text-xs disabled:opacity-40"
      >
        <RefreshCw
          className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        {isSynthesizing
          ? t('archetypeDetail.recommendation.generating')
          : synthesis
            ? t('archetypeDetail.recommendation.regenerate')
            : t('archetypeDetail.recommendation.generate')}
      </button>
    </div>
  );
}
