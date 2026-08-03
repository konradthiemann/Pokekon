import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import {
  ApiError,
  getArchetypeAnalysis,
  getArchetypeLists,
  type ArchetypeAnalysis,
  type ArchetypeListEntry,
  type MetaWindow,
} from '../../lib/api';
import { PokemonIcon } from '../shared/PokemonIcon';
import { DecklistCard } from './DecklistCard';
import { FieldScorePanel } from './FieldScorePanel';
import { MetaWindowControl } from './MetaWindowControl';
import { ThreatsPanel } from './ThreatsPanel';
import { WinRateBadge } from './WinRateBadge';
import { winRateColorClass } from './winRateColor';

const LISTS_PAGE_SIZE = 4;

// ─── Weekly trend chips ───────────────────────────────────────────────────────

function TrendChips({ analysis }: { analysis: ArchetypeAnalysis }) {
  const { t } = useTranslation('meta');
  if (analysis.trend.length < 2) return null;
  const recent = analysis.trend.slice(-6);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex items-center gap-1 text-xs text-slate-500 font-semibold">
        <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
        {t('archetypeDetail.trend.title')}
      </span>
      {recent.map((p) => (
        <span
          key={p.period}
          className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-600 tabular-nums"
          title={p.period}
        >
          {p.period.slice(5)}:{' '}
          {p.winRatePct !== null
            ? t('archetypeDetail.trend.point', { share: p.frequencyPct, winRate: p.winRatePct })
            : t('archetypeDetail.trend.pointNoWr', { share: p.frequencyPct })}
        </span>
      ))}
    </div>
  );
}

// ─── Main detail view ─────────────────────────────────────────────────────────

interface ArchetypeDetailProps {
  archetypeId: string;
  archetypeName: string;
  window: MetaWindow;
  onDaysChange: (days: number) => void;
  onOnlineBo1Change: (onlineBo1: boolean) => void;
  onBack: () => void;
}

/** One successful load, tagged with the request key it answers. */
interface LoadedDetail {
  key: string;
  analysis: ArchetypeAnalysis;
  lists: ArchetypeListEntry[];
  listsTotal: number;
}

/** One failed load, tagged the same way (404 = archetype not in window). */
interface FailedDetail {
  key: string;
  notInWindow: boolean;
  message: string;
}

/**
 * Drilldown for one tournament archetype: KPI header, meta-weighted field
 * performance (plan §3.4), weighted threats, and the most successful published
 * decklists (paginated). All data respects the shared meta window (days +
 * online/Bo1 scope), lifted to MetaPage so the overview and drilldown agree.
 *
 * Loading state is derived by comparing the current request key against the
 * key stored with the last result — no synchronous state resets in effects.
 */
export function ArchetypeDetail({
  archetypeId,
  archetypeName,
  window,
  onDaysChange,
  onOnlineBo1Change,
  onBack,
}: ArchetypeDetailProps) {
  const { t } = useTranslation('meta');
  const { days, online, bo1 } = window;
  const requestKey = `${archetypeId}|${days}|${online}|${bo1}`;
  const [loaded, setLoaded] = useState<LoadedDetail | null>(null);
  const [failed, setFailed] = useState<FailedDetail | null>(null);
  const [isLoadingLists, setIsLoadingLists] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${archetypeId}|${days}|${online}|${bo1}`;

    Promise.all([
      getArchetypeAnalysis(archetypeId, { days, online, bo1 }),
      getArchetypeLists(archetypeId, { days, online, bo1, limit: LISTS_PAGE_SIZE, offset: 0 }),
    ])
      .then(([analysisRes, listsRes]) => {
        if (cancelled) return;
        setLoaded({
          key,
          analysis: analysisRes,
          lists: listsRes.lists,
          listsTotal: listsRes.total,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed({
          key,
          notInWindow: err instanceof ApiError && err.status === 404,
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [archetypeId, days, online, bo1]);

  const current = loaded?.key === requestKey ? loaded : null;
  const failure = failed?.key === requestKey ? failed : null;
  const isLoading = current === null && failure === null;
  const analysis = current?.analysis ?? null;
  const lists = current?.lists ?? [];
  const listsTotal = current?.listsTotal ?? 0;
  const notInWindow = failure?.notInWindow ?? false;
  const error = failure !== null && !failure.notInWindow ? failure.message : null;

  const loadMoreLists = useCallback(() => {
    if (current === null) return;
    setIsLoadingLists(true);
    setLoadMoreFailed(false);
    getArchetypeLists(archetypeId, {
      days,
      online,
      bo1,
      limit: LISTS_PAGE_SIZE,
      offset: current.lists.length,
    })
      .then((res) => {
        setLoaded((prev) =>
          prev !== null && prev.key === requestKey
            ? { ...prev, lists: [...prev.lists, ...res.lists], listsTotal: res.total }
            : prev,
        );
      })
      .catch(() => {
        // Keep the already-loaded lists but tell the user; the button remains
        // for a retry.
        setLoadMoreFailed(true);
      })
      .finally(() => setIsLoadingLists(false));
  }, [archetypeId, days, online, bo1, current, requestKey]);

  return (
    <div className="space-y-4">
      {/* Header: back navigation + identity + window selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="btn-ghost text-xs">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          {t('archetypeDetail.back')}
        </button>
        <MetaWindowControl
          window={window}
          onDaysChange={onDaysChange}
          onOnlineBo1Change={onOnlineBo1Change}
        />
      </div>

      <div className="flex items-center gap-3">
        <PokemonIcon archetype={archetypeName} size="md" dual />
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{archetypeName}</h2>
          {analysis && (
            <p className="text-xs text-slate-500">
              {t('archetypeDetail.sample', {
                tournaments: analysis.tournamentCount,
                players: analysis.totalPlayers,
              })}
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="py-16 flex items-center justify-center gap-2 text-slate-500 text-sm font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          {t('archetypeDetail.loading')}
        </div>
      )}

      {!isLoading && notInWindow && (
        <div className="card p-6 text-center text-sm text-slate-600">
          {t('archetypeDetail.notInWindow')}
        </div>
      )}

      {!isLoading && error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {t('archetypeDetail.loadError')} {error}
        </div>
      )}

      {!isLoading && analysis && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-3">
              <p className="text-xs text-slate-500">{t('archetypeDetail.kpi.share')}</p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                {analysis.archetype.sharePct}%
              </p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-slate-500">{t('archetypeDetail.kpi.winRate')}</p>
              <p className="text-xl font-extrabold tabular-nums">
                <WinRateBadge pct={analysis.archetype.winRatePct} />
              </p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-slate-500">{t('archetypeDetail.kpi.players')}</p>
              <p className="text-xl font-extrabold text-slate-900 tabular-nums">
                {analysis.archetype.playerCount}
              </p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-slate-500">{t('archetypeDetail.kpi.fieldScore')}</p>
              <p
                className={`text-xl font-extrabold tabular-nums ${
                  analysis.fieldScore.fieldWinRatePct !== null
                    ? winRateColorClass(analysis.fieldScore.fieldWinRatePct)
                    : 'text-slate-400'
                }`}
              >
                {analysis.fieldScore.fieldWinRatePct !== null
                  ? `${analysis.fieldScore.fieldWinRatePct.toFixed(1)}%`
                  : '—'}
                <span className="text-xs font-bold text-brand-700 ml-1.5">
                  #{analysis.fieldScore.rank}
                </span>
              </p>
            </div>
          </div>

          <TrendChips analysis={analysis} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FieldScorePanel analysis={analysis} />
            <ThreatsPanel analysis={analysis} />
          </div>

          {/* Decklists */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">
                {t('archetypeDetail.lists.title')}
              </h3>
              {listsTotal > 0 && (
                <span className="text-xs text-slate-500">
                  {t('archetypeDetail.lists.of', { shown: lists.length, total: listsTotal })}
                </span>
              )}
            </div>

            {lists.length === 0 ? (
              <div className="card p-6 text-center text-sm text-slate-500">
                {t('archetypeDetail.lists.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {lists.map((entry) => (
                  <DecklistCard key={entry.id} entry={entry} />
                ))}
              </div>
            )}

            {loadMoreFailed && (
              <p className="text-center text-xs text-red-700">
                {t('archetypeDetail.lists.loadMoreError')}
              </p>
            )}

            {lists.length < listsTotal && (
              <div className="flex justify-center">
                <button
                  onClick={loadMoreLists}
                  disabled={isLoadingLists}
                  className="btn-ghost text-xs disabled:opacity-50"
                >
                  {isLoadingLists ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      {t('archetypeDetail.lists.loading')}
                    </>
                  ) : (
                    t('archetypeDetail.lists.loadMore')
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
