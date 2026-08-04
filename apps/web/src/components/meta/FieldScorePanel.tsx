import { useTranslation } from 'react-i18next';
import { AlertTriangle, Crosshair } from 'lucide-react';
import type { FieldScore } from '@pokekon/shared';
import { winRateColorClass } from './winRateColor';

/** Below this coverage the score rests on too little matchup data to trust. */
const LOW_COVERAGE_PCT = 40;

/**
 * The meta-weighted field performance (plan §3.4): big score, rank, coverage
 * bar with a low-data warning, mirror probability and the data source note.
 * Takes primitives so both the archetype drilldown and the local-meta
 * prediction render it identically.
 */
export function FieldScorePanel({
  fieldScore,
  totalRanked,
  matchupImportedAt,
}: {
  fieldScore: FieldScore;
  totalRanked: number;
  matchupImportedAt: string | null;
}) {
  const { t } = useTranslation('meta');
  const score = fieldScore.fieldWinRatePct;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="card-header flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-brand-700" aria-hidden="true" />
        {t('archetypeDetail.fieldScore.title')}
      </h3>

      <div className="flex items-end gap-4 flex-wrap">
        <span
          className={`text-4xl font-extrabold tabular-nums ${score === null ? 'text-slate-400' : winRateColorClass(score)}`}
        >
          {score !== null ? `${score.toFixed(1)}%` : '—'}
        </span>
        <span className="px-2 py-1 rounded-full bg-brand-50 text-brand-800 text-xs font-bold">
          {t('archetypeDetail.fieldScore.rank', { rank: fieldScore.rank, total: totalRanked })}
        </span>
      </div>

      <p className="text-xs text-slate-500">{t('archetypeDetail.fieldScore.explanation')}</p>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {t('archetypeDetail.fieldScore.coverage', { pct: fieldScore.coveragePct.toFixed(1) })}
          </span>
          <span>
            {t('archetypeDetail.fieldScore.mirror', { pct: fieldScore.mirrorSharePct.toFixed(1) })}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full"
            style={{ width: `${Math.min(fieldScore.coveragePct, 100)}%` }}
          />
        </div>
        {fieldScore.coveragePct < LOW_COVERAGE_PCT && (
          <p className="flex items-center gap-1 text-xs text-amber-700 font-semibold">
            <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
            {t('archetypeDetail.fieldScore.lowCoverage')}
          </p>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        {matchupImportedAt
          ? t('archetypeDetail.fieldScore.matchupSource', {
              date: new Date(matchupImportedAt).toLocaleDateString(),
            })
          : t('archetypeDetail.fieldScore.noMatchups')}
      </p>
    </div>
  );
}
