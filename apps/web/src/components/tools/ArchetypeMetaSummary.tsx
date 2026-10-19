import { useTranslation } from 'react-i18next';
import { Loader2, TrendingUp } from 'lucide-react';
import { wilsonInterval } from '@pokekon/shared';
import { useArchetypeAnalysis } from '../../hooks/useArchetypeAnalysis';
import type { ArchetypeAnalysis, MetaWindow } from '../../lib/api';
import { WinRateBadge } from '../meta/WinRateBadge';
import { winRateColorClass, winRatePct1 } from '../meta/winRateColor';
import { PokemonIcon } from '../shared/PokemonIcon';

function TrendChips({ analysis }: { analysis: ArchetypeAnalysis }) {
  const { t } = useTranslation('meta');
  if (analysis.trend.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
        {t('archetypeDetail.trend.title')}
      </span>
      {analysis.trend.slice(-6).map((p) => (
        <span
          key={p.period}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-600"
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

/**
 * "Your archetype in the meta" (Spec 7 §5.6): share, win rate with band,
 * players, field score with rank and the weekly trend — the KPI head of the
 * former ArchetypeDetail, for the coached archetype only.
 */
export function ArchetypeMetaSummary({
  archetypeId,
  archetypeName,
  window,
}: {
  archetypeId: string;
  archetypeName: string;
  window: MetaWindow;
}) {
  const { t } = useTranslation('meta');
  const {
    data: analysis,
    isLoading,
    notInWindow,
    error,
  } = useArchetypeAnalysis(archetypeId, window);
  const wr = analysis
    ? wilsonInterval(analysis.archetype.wins, analysis.archetype.losses, analysis.archetype.ties)
    : null;
  const fs = analysis?.fieldScore;

  return (
    <section className="card space-y-3" aria-label={t('coach:tools.summary')}>
      <div className="flex items-center gap-3">
        <PokemonIcon archetype={archetypeId} icons={analysis?.archetype.icons} size="md" dual />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold text-slate-900">{archetypeName}</h2>
          {analysis && (
            <p className="text-xs text-slate-600">
              {t('archetypeDetail.sample', {
                tournaments: analysis.tournamentCount,
                players: analysis.totalPlayers,
              })}
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('archetypeDetail.loading')}
        </p>
      )}
      {notInWindow && <p className="text-sm text-slate-600">{t('archetypeDetail.notInWindow')}</p>}
      {error !== null && (
        <p role="alert" className="text-sm text-slate-900">
          {t('archetypeDetail.loadError')} {error}
        </p>
      )}

      {analysis && fs && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{t('archetypeDetail.kpi.share')}</p>
              <p className="text-xl font-extrabold tabular-nums text-slate-900">
                {analysis.archetype.sharePct}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{t('archetypeDetail.kpi.winRate')}</p>
              <p className="text-xl font-extrabold tabular-nums">
                <WinRateBadge
                  pct={winRatePct1(
                    analysis.archetype.wins,
                    analysis.archetype.losses,
                    analysis.archetype.ties,
                  )}
                />
              </p>
              {wr && (
                <p className="font-mono text-[11px] text-slate-600">{`${wr.lowPct.toFixed(1)}–${wr.highPct.toFixed(1)} %`}</p>
              )}
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{t('archetypeDetail.kpi.players')}</p>
              <p className="text-xl font-extrabold tabular-nums text-slate-900">
                {analysis.archetype.playerCount}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-600">{t('archetypeDetail.kpi.fieldScore')}</p>
              <p
                className={`text-xl font-extrabold tabular-nums ${
                  fs.fieldWinRatePct !== null
                    ? winRateColorClass(fs.fieldWinRatePct)
                    : 'text-slate-500'
                }`}
              >
                {fs.fieldWinRatePct !== null ? `${fs.fieldWinRatePct.toFixed(1)}%` : '—'}
                <span className="ml-1.5 text-xs font-bold text-brand-700">#{fs.rank}</span>
              </p>
              {fs.fieldWinRateLowPct !== null && fs.fieldWinRateHighPct !== null && (
                <p className="font-mono text-[11px] text-slate-600">{`${fs.fieldWinRateLowPct.toFixed(1)}–${fs.fieldWinRateHighPct.toFixed(1)} %`}</p>
              )}
            </div>
          </div>
          <TrendChips analysis={analysis} />
        </>
      )}
    </section>
  );
}
