import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ArchetypeStats } from '../../types';
import { PokemonIcon } from '../shared/PokemonIcon';

interface Props {
  stats: ArchetypeStats[];
}

// 2 × 24px icons + 2px gap = 50px, padded to 54 for breathing room
const ICON_BOX = 54;
const PAGE_SIZE = 10;

function WinRateBadge({ rate, encounters }: { rate: number | null; encounters: number }) {
  if (encounters === 0 || rate === null) return <span className="text-gray-600 text-xs">—</span>;
  if (encounters < 5) {
    return (
      <span className="text-gray-500 font-semibold">
        {rate}% <span className="text-gray-600 font-normal">(n={encounters})</span>
      </span>
    );
  }
  const color = rate >= 60 ? 'text-emerald-400' : rate >= 40 ? 'text-yellow-400' : 'text-red-400';
  return <span className={`font-semibold ${color}`}>{rate}%</span>;
}

export function MetaTable({ stats }: Props) {
  const [namesOpen, setNamesOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (stats.length === 0) {
    return (
      <div className="card flex items-center justify-center py-12">
        <p className="text-gray-500 text-sm">No archetype data available.</p>
      </div>
    );
  }

  const visible = expanded ? stats : stats.slice(0, PAGE_SIZE);
  const hasMore = stats.length > PAGE_SIZE;
  const maxFreq = Math.max(...stats.map((s) => s.frequencyPct), 1);
  const deckColW = namesOpen ? ICON_BOX + 172 : ICON_BOX + 10;

  return (
    <div className="card overflow-hidden p-0">
      <div className="px-4 pt-4 pb-3 border-b border-gray-800">
        <h3 className="card-header mb-0">My Matchups</h3>
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
              <tr className="border-b border-gray-800">
                <th className="py-2.5 px-2 text-gray-400 font-medium text-xs text-left">
                  <button
                    onClick={() => setNamesOpen((v) => !v)}
                    className="flex items-center gap-1 hover:text-gray-200 transition-colors"
                    title={namesOpen ? 'Hide names' : 'Show names'}
                  >
                    <ChevronRight
                      className="w-3 h-3 shrink-0 transition-transform duration-200"
                      style={{ transform: namesOpen ? 'rotate(180deg)' : 'none' }}
                    />
                    <span>{namesOpen ? 'Hide' : 'Names'}</span>
                  </button>
                </th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">Meta %</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">Enc.</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">W</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">L</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">T</th>
                <th className="text-right px-4 py-2.5 text-gray-400 font-medium text-xs">WR</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s, i) => (
                <tr
                  key={s.archetype}
                  className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-gray-800/10'
                  }`}
                >
                  <td className="py-2 px-2 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <div className="shrink-0 flex items-center" style={{ width: ICON_BOX }}>
                        <PokemonIcon archetype={s.archetype} size="sm" dual reserveSecondary />
                      </div>
                      {namesOpen && (
                        <span className="text-xs font-medium text-gray-100 truncate leading-tight min-w-0">
                          {s.archetype}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${Math.min((s.frequencyPct / maxFreq) * 100, 100)}%` }}
                        />
                      </div>
                      <span className="text-gray-300 text-xs w-8 text-right">
                        {s.frequencyPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{s.encounters || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-400">{s.wins || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-red-400">{s.losses || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-yellow-400">{s.ties || '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <WinRateBadge rate={s.winRate} encounters={s.encounters} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!expanded && hasMore && (
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none" />
        )}
      </div>

      {hasMore && (
        <div className="px-4 py-2.5 border-t border-gray-800 flex items-center justify-between">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium flex items-center gap-1"
          >
            <ChevronRight
              className="w-3 h-3 transition-transform duration-200"
              style={{ transform: expanded ? 'rotate(270deg)' : 'rotate(90deg)' }}
            />
            {expanded ? `Show top ${PAGE_SIZE}` : `Show all ${stats.length} decks`}
          </button>
          <span className="text-xs text-gray-600">
            {expanded ? stats.length : Math.min(PAGE_SIZE, stats.length)} / {stats.length}
          </span>
        </div>
      )}
    </div>
  );
}
