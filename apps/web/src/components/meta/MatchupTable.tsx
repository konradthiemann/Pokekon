import { useTranslation } from 'react-i18next';
import type { FieldScore, WeightedMatchup } from '@pokekon/shared';
import { PokemonIcon } from '../shared/PokemonIcon';
import { WinRateBadge } from './WinRateBadge';

/**
 * The archetype's real head-to-head record against every covered deck in the
 * field — a matrix ROW rendered as a sortable table (favorable matchups on top,
 * unfavorable at the bottom). This is the "table of individual decks like the
 * matchup matrix" surfaced in the drilldown. Data comes from the field score's
 * threats + free-wins (already the real online-Bo1 matchup blend); the mirror is
 * a definitional 50 % and intentionally omitted.
 */
export function MatchupTable({
  fieldScore,
  iconsById,
}: {
  fieldScore: FieldScore;
  iconsById: Record<string, string[]>;
}) {
  const { t } = useTranslation('meta');

  // freeWins (WR > 50) + threats (WR < 50) = every covered opponent; sort best→worst.
  const rows: WeightedMatchup[] = [...fieldScore.freeWins, ...fieldScore.threats].sort(
    (a, b) => b.winRatePct - a.winRatePct,
  );

  if (rows.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-slate-200 px-4 pb-3 pt-4">
        <h3 className="card-header mb-1">{t('archetypeDetail.matchupTable.title')}</h3>
        <p className="text-[11px] leading-snug text-slate-500">
          {t('archetypeDetail.matchupTable.subtitle')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {t('archetypeDetail.matchupTable.deck')}
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {t('archetypeDetail.matchupTable.winRate')}
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {t('archetypeDetail.matchupTable.sample')}
              </th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                {t('archetypeDetail.matchupTable.share')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.archetypeId}
                className="border-b border-slate-100 transition-colors hover:bg-slate-50"
              >
                <td className="px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <PokemonIcon
                      archetype={m.archetypeName}
                      icons={iconsById[m.archetypeId]}
                      size="sm"
                      dual
                    />
                    <span className="truncate text-xs font-medium text-slate-800">
                      {m.archetypeName}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">
                  <WinRateBadge pct={Math.round(m.winRatePct * 10) / 10} />
                </td>
                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-slate-500">
                  {m.games}
                </td>
                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-slate-500">
                  {m.sharePct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
