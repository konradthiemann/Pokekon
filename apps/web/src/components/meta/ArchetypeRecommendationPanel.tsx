import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, RefreshCw, KeyRound, Info } from 'lucide-react';
import { DEFAULT_MIN_OWN_GAMES } from '@pokekon/shared';
import type { ArchetypeSynthesisScope, RankedCluster, SynthesisSection } from '@pokekon/shared';
import {
  generateArchetypeSynthesis,
  getArchetypeSynthesis,
  type ArchetypeSynthesisReadResponse,
  type FieldAnalysisArchetype,
  type PersonalRecordInput,
} from '../../lib/api';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY, isAnonymousUser } from '../../lib/demo';
import { getLocalMetaWeightOverrides, type LocalFieldEntry } from '../../lib/preferences';
import type { ArchetypeStats } from '../../types';
import { CardGroup } from './DecklistCard';
import { seedWeight } from './localFieldWeight';
import { WinRateBadge } from './WinRateBadge';
import { exportCardsFromDecklist } from '@pokekon/shared';
import { CopyDeckListButton } from '../shared/CopyDeckListButton';

interface ArchetypeRecommendationPanelProps {
  archetypeId: string;
  archetypeName: string;
  windowDays: number;
  /** Own opponent-facing record against every archetype (Spec 10 Slice E),
   *  passed down from `MetaPage` (which reads the store) -- this panel stays
   *  store-free, same precedent as `ArchetypeDetail.tsx` (see this
   *  component's docstring below). Used only in "Mein Spielstil" mode to
   *  find the entry matching `archetypeId` (same Limitless-slug identifier
   *  space, see `ArchetypeStats.archetype` / `Deck.archetype`). */
  archetypeStats?: ArchetypeStats[];
  /** Current online meta (MetaPage's `fieldAnalysis.archetypes`) -- used only
   *  to resolve `localMeta`'s archetype NAMES to their real
   *  archetypeId/Limitless-slug and a default weight (`seedWeight`), the same
   *  lookup `PredictionPanel.tsx` uses for the same purpose (Spec 10 Slice D,
   *  specs/archetype-meta-analysis.md). */
  archetypes: FieldAnalysisArchetype[];
  /** The user's configured local-meta archetype NAMES (dashboardStore slice,
   *  Spec 10 Slice D), passed down from `MetaPage` like `archetypeStats`
   *  above -- this panel stays store-free. Used in "Lokal"/"Mein Spielstil"
   *  mode (both are `scope:'local'` server-side) to derive `localField`
   *  below, reusing `PredictionPanel.tsx`'s own derivation logic instead of
   *  duplicating it. */
  localMeta: string[];
}

/** Three recommendation modes: "Mein Spielstil" is not a fourth backend
 *  `scope` value -- it reuses `scope: 'local'` and additionally sets
 *  `usePersonalPrior: true` (Spec 10 Slice E). */
type RecommendationMode = 'global' | 'local' | 'personal';

/** One successful GET, tagged with the request key it answers (archetype +
 *  window + scope) — same "ignore stale responses" pattern as
 *  ArchetypeDetail.tsx's LoadedDetail, deliberately local state instead of
 *  the dashboardStore (Spec 10 Slice C UI, specs/archetype-meta-analysis.md). */
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
      {/* Field-weighted re-ranking against the user's local meta (Spec 10
          Slice D, specs/archetype-meta-analysis.md) -- only present when the
          server actually re-ranked this cluster (scope:'local' + a non-empty
          localField), regardless of this panel's current `mode` prop drift. */}
      {cluster.fieldScore?.fieldWinRatePct != null && (
        <p
          data-testid="archetype-recommendation-cluster-field-score"
          className="text-xs text-slate-600"
        >
          {t('archetypeDetail.recommendation.cluster.fieldScore')}
          {': '}
          <WinRateBadge pct={cluster.fieldScore.fieldWinRatePct} />
          {cluster.fieldScore.fieldWinRateLowPct != null &&
            cluster.fieldScore.fieldWinRateHighPct != null && (
              <span className="text-[11px] text-slate-400 font-mono ml-1">
                {`(${cluster.fieldScore.fieldWinRateLowPct.toFixed(1)}–${cluster.fieldScore.fieldWinRateHighPct.toFixed(1)} %)`}
              </span>
            )}
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
      {/* Full decklist on demand -- the truncated summary above only ever
          showed Pokémon, never Trainer/Energy, and had no way to see the
          rest besides a hover tooltip (unusable on touch). Reuses
          DecklistCard.tsx's CardGroup so the card-list markup isn't
          duplicated a third time (ArchetypeDetail's raw lists, this panel,
          TournamentBestListPanel all show the same TournamentDecklist shape). */}
      <details className="text-xs">
        <summary
          data-testid="archetype-recommendation-cluster-decklist-toggle"
          className="cursor-pointer text-brand-700 font-semibold w-fit"
        >
          {t('archetypeDetail.recommendation.cluster.viewDecklist')}
        </summary>
        <CopyDeckListButton
          cards={exportCardsFromDecklist(cluster.representative)}
          className="mt-2"
        />
        <div
          data-testid="archetype-recommendation-cluster-decklist"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2 pt-2 border-t border-slate-100"
        >
          <CardGroup
            title={t('archetypeDetail.lists.pokemon')}
            entries={cluster.representative.pokemon}
          />
          <CardGroup
            title={t('archetypeDetail.lists.trainer')}
            entries={cluster.representative.trainer}
          />
          <CardGroup
            title={t('archetypeDetail.lists.energy')}
            entries={cluster.representative.energy}
          />
        </div>
      </details>
    </div>
  );
}

/**
 * Ranked decklist clusters + optional KI-text recommendation for one archetype
 * (Spec 10 Slice C, specs/archetype-meta-analysis.md). Mounted in
 * `ArchetypeDetail.tsx` between the matchup table and the raw decklists.
 *
 * Three toggle-chip modes ("Global"/"Lokal"/"Mein Spielstil", Spec 10 Slice E
 * UI): "Mein Spielstil" is `scope:'local'` plus `usePersonalPrior:true`, not
 * a fourth backend scope -- see `RecommendationMode` above.
 *
 * Deliberately local state (request-key pattern, mirrors `ArchetypeDetail`
 * itself) instead of the dashboardStore that `DeckSynthesisPanel` uses --
 * `ArchetypeDetail.tsx` does not read from that store either (its
 * `archetypeStats` prop is passed down from `MetaPage`, which does read the
 * store, purely to find one user's own matchup record). Generation is
 * user-triggered only (same principle as DeckSynthesisPanel/Spec 8): a mode
 * switch re-reads (GET), it never re-generates on its own.
 */
export function ArchetypeRecommendationPanel({
  archetypeId,
  archetypeName,
  windowDays,
  archetypeStats,
  archetypes,
  localMeta,
}: ArchetypeRecommendationPanelProps) {
  const { t } = useTranslation('meta');
  const [mode, setMode] = useState<RecommendationMode>('global');
  // "Mein Spielstil" reuses scope:'local' + usePersonalPrior:true -- there is
  // no fourth backend scope value (Spec 10 Slice E). `mode` (not `scope`)
  // must drive the request key, otherwise 'local' and 'personal' would
  // collide in the cache despite being different requests.
  const scope: ArchetypeSynthesisScope = mode === 'global' ? 'global' : 'local';
  const usePersonalPrior = mode === 'personal';
  const requestKey = `${archetypeId}|${windowDays}|${mode}`;

  // Own opponent-facing record for this archetype, same Limitless-slug
  // identifier space as `archetypeId` (see prop docstring above). Only
  // used/sent in 'personal' mode.
  const matchingStats = archetypeStats?.find((s) => s.archetype === archetypeId);
  const personalGames = matchingStats
    ? matchingStats.wins + matchingStats.losses + matchingStats.ties
    : 0;
  // Same threshold the server silently applies (buildArchetypeSynthesisFactSet)
  // -- surfaced here only as a client-side UX hint before the user clicks
  // "generate", not duplicated server logic.
  const personalDataInsufficient =
    usePersonalPrior && (!matchingStats || personalGames < DEFAULT_MIN_OWN_GAMES);

  // The user's local meta field (Spec 10 Slice D, specs/archetype-meta-analysis.md)
  // -- same derivation as PredictionPanel.tsx's own `field`: one
  // entry per `localMeta` archetype NAME, resolved to its real archetypeId
  // via the current online meta (`archetypes`) and weighted by its stored
  // override or (default) `seedWeight(sharePct)`. `weightOverrides` is read
  // ONCE on mount (same `useState(() => ...)` pattern as `demoTokenPresent`
  // below) -- deliberately not live-synced with PredictionPanel/LocalMetaPanel,
  // which live on the overview page, not this drilldown (see prop docstring).
  const [weightOverrides] = useState(() => getLocalMetaWeightOverrides());
  const localField: LocalFieldEntry[] = useMemo(
    () =>
      localMeta.map((name) => {
        const online = archetypes.find((a) => a.archetypeName === name);
        const archetypeId = online?.archetypeId ?? name;
        const defaultWeight = online ? seedWeight(online.sharePct) : 1;
        return { archetypeId, name, weight: weightOverrides[archetypeId] ?? defaultWeight };
      }),
    [localMeta, archetypes, weightOverrides],
  );

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
    const key = `${archetypeId}|${windowDays}|${mode}`;
    const personalOptions: { usePersonalPrior?: true; personalRecord?: PersonalRecordInput } =
      usePersonalPrior
        ? {
            usePersonalPrior: true,
            ...(matchingStats
              ? {
                  personalRecord: {
                    wins: matchingStats.wins,
                    losses: matchingStats.losses,
                    ties: matchingStats.ties,
                  },
                }
              : {}),
          }
        : {};
    // Only effective for 'local'/'personal' mode (both scope:'local'
    // server-side) and only when the field isn't empty -- the server treats
    // an omitted/empty localField as "no re-ranking", same no-op contract as
    // scope:'global' + localField (harmless, server ignores it either way).
    const localFieldOptions: { localField?: LocalFieldEntry[] } =
      mode !== 'global' && localField.length > 0 ? { localField } : {};
    getArchetypeSynthesis(archetypeId, {
      days: windowDays,
      scope,
      ...personalOptions,
      ...localFieldOptions,
    })
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
  }, [archetypeId, windowDays, mode, scope, usePersonalPrior, matchingStats, localField]);

  const current = loaded?.key === requestKey ? loaded.data : null;

  const handleGenerate = useCallback(() => {
    if (!current) return;

    const personalOptions: { usePersonalPrior?: true; personalRecord?: PersonalRecordInput } =
      usePersonalPrior
        ? {
            usePersonalPrior: true,
            ...(matchingStats
              ? {
                  personalRecord: {
                    wins: matchingStats.wins,
                    losses: matchingStats.losses,
                    ties: matchingStats.ties,
                  },
                }
              : {}),
          }
        : {};

    // Same no-op contract as the GET effect above.
    const localFieldOptions: { localField?: LocalFieldEntry[] } =
      mode !== 'global' && localField.length > 0 ? { localField } : {};

    const run = (apiKey?: string) => {
      setIsSynthesizing(true);
      setSynthesisError(null);
      generateArchetypeSynthesis(archetypeId, {
        days: windowDays,
        scope,
        apiKey,
        ...personalOptions,
        ...localFieldOptions,
      })
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
    usePersonalPrior,
    matchingStats,
    mode,
    localField,
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
            aria-pressed={mode === 'global'}
            onClick={() => setMode('global')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              mode === 'global' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('archetypeDetail.recommendation.scope.global')}
          </button>
          <button
            type="button"
            data-testid="archetype-recommendation-scope-local"
            aria-pressed={mode === 'local'}
            onClick={() => setMode('local')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              mode === 'local' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('archetypeDetail.recommendation.scope.local')}
          </button>
          <button
            type="button"
            data-testid="archetype-recommendation-scope-personal"
            aria-pressed={mode === 'personal'}
            onClick={() => setMode('personal')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
              mode === 'personal' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('archetypeDetail.recommendation.scope.personal')}
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

      {/* Methodology, collapsed by default -- the cluster cards below show
          numbers (rank, win-rate band, record, placement, field score) with
          no explanation of how they were derived. Mirrors the disclosure
          pattern already used for the synthesis facts further down. */}
      <details data-testid="archetype-recommendation-methodology" className="text-xs">
        <summary
          data-testid="archetype-recommendation-methodology-toggle"
          className="cursor-pointer flex items-center gap-1.5 w-fit text-slate-500"
        >
          <Info className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {t('archetypeDetail.recommendation.methodology.toggle')}
        </summary>
        <ul className="mt-1.5 ml-5 list-disc space-y-1 text-slate-500">
          <li>{t('archetypeDetail.recommendation.methodology.rank')}</li>
          <li>{t('archetypeDetail.recommendation.methodology.interval')}</li>
          <li>{t('archetypeDetail.recommendation.methodology.record')}</li>
          <li>{t('archetypeDetail.recommendation.methodology.placement')}</li>
          <li>{t('archetypeDetail.recommendation.methodology.fieldScore')}</li>
        </ul>
      </details>

      {personalDataInsufficient && (
        <p
          data-testid="archetype-recommendation-personal-insufficient-data"
          className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2"
        >
          {t('archetypeDetail.recommendation.personalInsufficientData', {
            count: personalGames,
            min: DEFAULT_MIN_OWN_GAMES,
          })}
        </p>
      )}

      {/* No local field configured yet: 'local'/'personal' mode currently
          matches the global ranking 1:1 (no localField is sent, see
          localFieldOptions above) -- tell the user instead of silently
          showing identical numbers under a different chip. */}
      {mode !== 'global' && localField.length === 0 && (
        <p
          data-testid="archetype-recommendation-local-field-empty"
          className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2"
        >
          {t('archetypeDetail.recommendation.localFieldEmpty')}
        </p>
      )}

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
