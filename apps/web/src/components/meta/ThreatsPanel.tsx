import { useTranslation } from 'react-i18next';
import { ShieldAlert, Sparkles } from 'lucide-react';
import type { FieldScore, WeightedMatchup } from '@pokekon/shared';
import { PokemonIcon } from '../shared/PokemonIcon';
import { WinRateBadge } from './WinRateBadge';

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
        <p className="text-xs font-medium text-slate-800 truncate">{m.archetypeName}</p>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-0.5">
          <div
            className={`h-full rounded-full ${bad ? 'bg-red-400' : 'bg-emerald-400'}`}
            style={{ width: `${maxWeight > 0 ? (m.weightPct / maxWeight) * 100 : 0}%` }}
          />
        </div>
      </div>
      <span className="text-xs text-slate-500 tabular-nums shrink-0">
        {t('archetypeDetail.threats.shareLabel', { pct: m.sharePct })}
      </span>
      <span
        className="w-14 text-right shrink-0"
        title={t('archetypeDetail.threats.gamesLabel', { count: m.games })}
      >
        <WinRateBadge pct={m.winRatePct} />
      </span>
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

      {threats.length === 0 ? (
        <p className="text-xs text-slate-500">{t('archetypeDetail.threats.empty')}</p>
      ) : (
        <div className="space-y-2">
          {threats.map((m) => (
            <WeightedMatchupRow key={m.archetypeId} m={m} maxWeight={maxWeight} bad />
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100">
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          {t('archetypeDetail.threats.freeWinsTitle')}
        </h4>
        {freeWins.length === 0 ? (
          <p className="text-xs text-slate-500">{t('archetypeDetail.threats.freeWinsEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {freeWins.map((m) => (
              <WeightedMatchupRow key={m.archetypeId} m={m} maxWeight={maxWeight} bad={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
