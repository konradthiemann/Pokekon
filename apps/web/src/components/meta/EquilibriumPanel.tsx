import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info, Minus, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { monteCarloSePct } from '@pokekon/shared';
import type { EquilibriumArchetypeRow, MetaEquilibriumResponse } from '../../lib/api';
import { formatWithInterval } from './confidence';
import { exclusionBand, isCompositionFragile } from './equilibriumFraming';

/**
 * The game-theoretic meta layer (plan .claude/plans/meta-game-theory-layer.md
 * §3.8 / §4 step 21) — "experimental", additive to (never a replacement for)
 * the field score. Data-contract binding, DOM structure deliberately not
 * dictated by the plan.
 *
 * Takes the already-fetched wire response as a single `data` prop (pattern:
 * `FieldScorePanel`'s `fieldScore` prop) — `MetaPage.tsx` owns the fetch via
 * `getMetaEquilibrium` and passes the result down unchanged.
 */

/** Below this row coverage, a support member's numbers rest mostly on
 *  imputed (missing) matchup data rather than real games (plan §3.2
 *  "Equalizer" risk). The plan gives no numeric threshold beyond the
 *  unambiguous `rowCoveragePct === 0` extreme (§3.8 bullet 5) — this
 *  conservative cutoff only fires well below any row with real signal. */
const ROW_COVERAGE_THIN_PCT = 20;

/** Large positive `paradoxGapPp` combined with a zero equilibrium weight is
 *  the "popular but mathematically worthless" case (plan §3.8 bullet 4). */
function isPopularityParadox(row: EquilibriumArchetypeRow): boolean {
  return row.weightPct === 0 && row.paradoxGapPp > 0;
}

function DirectionIcon({ direction }: { direction: EquilibriumArchetypeRow['direction'] }) {
  if (direction === 'rising') return <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />;
  if (direction === 'falling') return <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />;
  return <Minus className="w-3.5 h-3.5" aria-hidden="true" />;
}

function ArchetypeRow({ row, resamples }: { row: EquilibriumArchetypeRow; resamples: number }) {
  const { t } = useTranslation('meta');
  const band = exclusionBand(row.exclusionRatePct);
  const paradox = isPopularityParadox(row);
  const thin = row.rowCoveragePct < ROW_COVERAGE_THIN_PCT;

  return (
    <div
      data-testid={`equilibrium-archetype-${row.archetypeId}`}
      className="py-2 border-b border-slate-100 last:border-0 space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{row.archetypeName}</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {row.sharePct.toFixed(1)} % → {row.weightPct.toFixed(1)} %
        </span>
      </div>

      {band !== 'likelyIn' && (
        <div className="text-xs space-y-0.5">
          <p className="text-slate-700">
            {t(`equilibrium.robust.${band}`, { name: row.archetypeName })}
          </p>
          <p className="text-slate-500">
            {t('equilibrium.robust.value', {
              rate: row.exclusionRatePct.toFixed(1),
              se: monteCarloSePct(row.exclusionRatePct, resamples).toFixed(1),
            })}
          </p>
          {row.excludedCertain && (
            <p className="font-semibold text-red-700">{t('equilibrium.robust.certain')}</p>
          )}
        </div>
      )}

      {paradox && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-amber-700">
          <AlertTriangle
            data-testid="paradox-icon"
            className="w-3.5 h-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="font-semibold">{t('equilibrium.paradox.label')}</span>
          <span className="text-slate-500">
            {t('equilibrium.paradox.text', {
              share: row.sharePct.toFixed(1),
              weight: row.weightPct.toFixed(1),
            })}
          </span>
        </p>
      )}

      {thin && (
        <p data-testid="row-coverage-thin" className="text-[11px] text-slate-500 italic">
          {t('equilibrium.coverage.thin')}
        </p>
      )}

      <p className="text-xs text-slate-500">
        {t('equilibrium.composition.title')}:{' '}
        <span className="tabular-nums">
          {formatWithInterval(row.weightPct, row.weightP05Pct, row.weightP95Pct)}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
        <DirectionIcon direction={row.direction} />
        <span>{t(`equilibrium.trend.${row.direction}`)}</span>
        {row.fitnessDeltaPp !== null && (
          <span className="tabular-nums">
            ({row.fitnessDeltaPp > 0 ? '+' : ''}
            {row.fitnessDeltaPp.toFixed(1)} pp)
          </span>
        )}
        {row.observedShareDeltaPp !== null && (
          <span className="text-slate-400">
            {t('equilibrium.trend.observed', { delta: row.observedShareDeltaPp.toFixed(1) })}
          </span>
        )}
      </div>
    </div>
  );
}

export function EquilibriumPanel({ data }: { data: MetaEquilibriumResponse }) {
  const { t } = useTranslation('meta');

  if (data.run === null) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{t('equilibrium.intro')}</p>
        <p className="text-sm text-slate-500">{t('equilibrium.empty')}</p>
      </div>
    );
  }

  const run = data.run;
  const fragile = isCompositionFragile(
    run.exactSupportRatePct,
    run.equalizerCount,
    run.supportSize,
  );
  const computedAtText = data.computedAt ? new Date(data.computedAt).toLocaleString() : '—';

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">{t('equilibrium.intro')}</p>
      <p className="text-xs font-semibold text-brand-700">{t('equilibrium.notAReplacement')}</p>

      <div className="text-[11px] text-slate-400 space-y-0.5">
        <p>
          {t('equilibrium.source', {
            computedAt: computedAtText,
            days: data.windowDays,
            runs: run.resamples,
            seed: run.seed,
          })}
        </p>
        <p>{t('equilibrium.sourceImputed', { pct: run.imputedCellSharePct.toFixed(1) })}</p>
      </div>

      {fragile && (
        <div
          data-testid="composition-fragility-warning"
          className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800"
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t('equilibrium.composition.fragile')}</span>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-1">
          <Scale className="w-3.5 h-3.5 text-brand-700" aria-hidden="true" />
          {t('equilibrium.composition.title')}
        </h4>
        {data.archetypes.map((row) => (
          <ArchetypeRow key={row.archetypeId} row={row} resamples={run.resamples} />
        ))}
      </div>

      <p className="text-[11px] text-slate-400 italic">{t('equilibrium.methodNote')}</p>
    </div>
  );
}
