import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp, ShieldAlert, Sparkles } from 'lucide-react';
import type { FieldScore, WeightedMatchup } from '@pokekon/shared';
import { PokemonIcon } from '../shared/PokemonIcon';
import { WinRateBadge } from './WinRateBadge';

/** Rows already arrive heaviest-weight-first (FieldScore's own contract) --
 *  capping to this many by default keeps the curated view genuinely short
 *  (research: Untapped.gg's "Curated List (100) | Full List (490)" pattern)
 *  instead of silently rendering every covered opponent, which an archetype
 *  with a wide, mostly-losing field could turn into dozens of rows. */
const DEFAULT_VISIBLE_ROWS = 5;

function WeightedMatchupRow({
  m,
  maxWeight,
  bad,
}: {
  m: WeightedMatchup;
  maxWeight: number;
  bad: boolean;
}) {
  const { t } = useTranslation('meta');
  return (
    <div className="flex items-center gap-2">
      <PokemonIcon archetype={m.archetypeName} size="sm" dual />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-slate-800 truncate">{m.archetypeName}</p>
          {/* Compact confidence signal (icon + tooltip) instead of a long
              inline text badge -- the old "unsicher — Intervall schließt
              50 % ein" label was wide enough to wrap and overlap the
              win-rate badge in the same row on narrower viewports. */}
          {!m.significant && (
            <CircleHelp className="w-3 h-3 shrink-0 text-slate-400" aria-hidden="true" role="img">
              <title>{t('archetypeDetail.threats.unreliable')}</title>
            </CircleHelp>
          )}
        </div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-0.5">
          <div
            className={`h-full rounded-full ${bad ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${maxWeight > 0 ? (m.weightPct / maxWeight) * 100 : 0}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-slate-500 tabular-nums shrink-0">
        {t('archetypeDetail.threats.shareLabel', { pct: m.sharePct.toFixed(1) })}
      </span>
      <span className="w-20 text-right shrink-0">
        <span title={t('archetypeDetail.threats.gamesLabel', { count: m.games })}>
          <WinRateBadge pct={m.winRatePct} />
        </span>
        {/* Sample size next to the number instead of the raw interval text
            (research: TrainerHill shows W-L-T under the percentage rather
            than a "55.2–83.0 %" span) -- the interval is still one title
            tooltip away, not deleted. */}
        <span
          className="block text-[10px] tabular-nums text-slate-400"
          title={`${m.lowPct.toFixed(1)}–${m.highPct.toFixed(1)} %`}
        >
          {t('archetypeDetail.threats.gamesShort', { count: m.games })}
        </span>
      </span>
    </div>
  );
}

/** One capped-by-default list of weighted matchups + a counted "show all"
 *  toggle, shared by the threats and free-wins sections below. */
function MatchupList({
  rows,
  maxWeight,
  bad,
  emptyLabel,
}: {
  rows: WeightedMatchup[];
  maxWeight: number;
  bad: boolean;
  emptyLabel: string;
}) {
  const { t } = useTranslation('meta');
  const [showAll, setShowAll] = useState(false);

  if (rows.length === 0) return <p className="text-xs text-slate-500">{emptyLabel}</p>;

  const visible = showAll ? rows : rows.slice(0, DEFAULT_VISIBLE_ROWS);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className="space-y-2">
      {visible.map((m) => (
        <WeightedMatchupRow key={m.archetypeId} m={m} maxWeight={maxWeight} bad={bad} />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[11px] font-semibold text-brand-700 hover:text-brand-800"
        >
          {t('archetypeDetail.threats.showMore', { count: hiddenCount })}
        </button>
      )}
      {showAll && rows.length > DEFAULT_VISIBLE_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
        >
          {t('archetypeDetail.threats.showLess')}
        </button>
      )}
    </div>
  );
}

/**
 * "What you must be prepared for": opponents weighted by frequency × matchup
 * weakness (threats) and the good matchups (free wins), heaviest weight first.
 */
export function ThreatsPanel({ fieldScore }: { fieldScore: FieldScore }) {
  const { t } = useTranslation('meta');
  const { threats, freeWins } = fieldScore;
  const maxWeight = Math.max(
    ...threats.map((m) => m.weightPct),
    ...freeWins.map((m) => m.weightPct),
    0,
  );

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h3 className="card-header flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-600" aria-hidden="true" />
          {t('archetypeDetail.threats.title')}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{t('archetypeDetail.threats.subtitle')}</p>
      </div>

      <MatchupList
        rows={threats}
        maxWeight={maxWeight}
        bad
        emptyLabel={t('archetypeDetail.threats.empty')}
      />

      <div className="pt-3 border-t border-slate-100">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          {t('archetypeDetail.threats.freeWinsTitle')}
        </h4>
        <MatchupList
          rows={freeWins}
          maxWeight={maxWeight}
          bad={false}
          emptyLabel={t('archetypeDetail.threats.freeWinsEmpty')}
        />
      </div>
    </div>
  );
}
