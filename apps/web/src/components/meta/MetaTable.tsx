import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { ArchetypeStats } from '../../types';
import { PokemonIcon } from '../shared/PokemonIcon';

interface Props {
  stats: ArchetypeStats[];
}

// 2 × 24px icons + 2px gap = 50px, padded to 54 for breathing room
const ICON_BOX = 54;
const PAGE_SIZE = 10;

/** `encounters` is the sample the win rate itself is based on (Bo1-comparable
 *  games only); `unknownGames` are logs excluded from that number because
 *  their match format is unknown — surfaced as a footnote, not folded in. */
function WinRateBadge({
  rate,
  encounters,
  unknownGames = 0,
}: {
  rate: number | null;
  encounters: number;
  unknownGames?: number;
}) {
  const { t } = useTranslation('meta');
  const unknownNote =
    unknownGames > 0 ? (
      <span className="block text-[10px] text-slate-400 font-medium">
        {t('myMatchups.unknownFormat', { count: unknownGames })}
      </span>
    ) : null;

  if (encounters === 0 || rate === null) {
    return (
      <>
        <span className="text-slate-400 text-xs">—</span>
        {unknownNote}
      </>
    );
  }
  if (encounters < 5) {
    return (
      <>
        <span className="text-slate-500 font-bold">
          {rate.toFixed(1)}%{' '}
          <span className="text-slate-400 font-medium">
            {t('myMatchups.sampleSize', { count: encounters })}
          </span>
        </span>
        {unknownNote}
      </>
    );
  }
  const color = rate >= 60 ? 'text-emerald-700' : rate >= 40 ? 'text-amber-700' : 'text-red-700';
  return (
    <>
      <span className={`font-bold ${color}`}>{rate.toFixed(1)}%</span>
      {unknownNote}
    </>
  );
}

export function MetaTable({ stats }: Props) {
  const { t } = useTranslation('meta');
  const [namesOpen, setNamesOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (stats.length === 0) {
    return (
      <div className="card flex items-center justify-center py-12">
        <p className="text-slate-500 text-sm font-semibold">{t('myMatchups.empty')}</p>
      </div>
    );
  }

  const visible = expanded ? stats : stats.slice(0, PAGE_SIZE);
  const hasMore = stats.length > PAGE_SIZE;
  const maxFreq = Math.max(...stats.map((s) => s.frequencyPct), 1);
  const deckColW = namesOpen ? ICON_BOX + 172 : ICON_BOX + 10;

  return (
    <div className="card overflow-hidden p-0">
      <div className="px-4 pt-4 pb-3 border-b border-slate-200">
        <h3 className="card-header mb-0">{t('myMatchups.title')}</h3>
      </div>

      <div className="relative">
        <div className="overflow-x-auto">
          <table
            className="text-sm border-collapse"
            style={{ tableLayout: 'fixed', width: '100%' }}
          >
            <colgroup>
              <col style={{ width: deckColW, transition: 'width 0.2s ease' }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 52 }} />
              <col style={{ width: 36 }} />
              <col style={{ width: 36 }} />
              <col style={{ width: 36 }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2.5 px-2 text-slate-500 font-bold text-xs text-left">
                  <button
                    onClick={() => setNamesOpen((v) => !v)}
                    className="flex items-center gap-1 hover:text-slate-900 transition-colors"
                    title={namesOpen ? t('myMatchups.hideNames') : t('myMatchups.showNames')}
                  >
                    <ChevronRight
                      className="w-3 h-3 shrink-0 transition-transform duration-200"
                      style={{ transform: namesOpen ? 'rotate(180deg)' : 'none' }}
                      aria-hidden="true"
                    />
                    <span>{namesOpen ? t('myMatchups.hide') : t('myMatchups.names')}</span>
                  </button>
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.metaPct')}
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.encounters')}
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.wins')}
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.losses')}
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.ties')}
                </th>
                <th className="text-right px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('myMatchups.headers.winRate')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr
                  key={s.archetype}
                  className={`border-b border-slate-100 hover:bg-brand-50/60 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-slate-50'
                  }`}
                >
                  <td className="py-2 px-2 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <div className="shrink-0 flex items-center" style={{ width: ICON_BOX }}>
                        <PokemonIcon archetype={s.archetype} size="sm" dual reserveSecondary />
                      </div>
                      {namesOpen && (
                        <span className="text-xs font-bold text-slate-800 truncate leading-tight min-w-0">
                          {s.archetype}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full"
                          style={{ width: `${Math.min((s.frequencyPct / maxFreq) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 text-xs font-bold w-8 text-right">
                        {s.frequencyPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 font-semibold">
                    {s.encounters || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-700 font-bold">
                    {s.wins || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-700 font-bold">
                    {s.losses || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-amber-700 font-bold">
                    {s.ties || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <WinRateBadge
                      rate={s.bo1EquivalentWinRate}
                      encounters={s.bo1Games + s.bo3Games}
                      unknownGames={s.unknownFormatGames}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!expanded && hasMore && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>

      {hasMore && (
        <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-700 hover:text-brand-800 transition-colors font-bold flex items-center gap-1"
          >
            <ChevronRight
              className="w-3 h-3 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(270deg)' : 'rotate(90deg)' }}
              aria-hidden="true"
            />
            {expanded
              ? t('myMatchups.showTop', { count: PAGE_SIZE })
              : t('myMatchups.showAll', { count: stats.length })}
          </button>
          <span className="text-xs text-slate-400 font-semibold">
            {expanded ? stats.length : Math.min(PAGE_SIZE, stats.length)} / {stats.length}
          </span>
        </div>
      )}
    </div>
  );
}
