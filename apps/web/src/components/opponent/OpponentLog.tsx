import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OpponentLog as OpponentLogType } from '../../types';
import { deleteOpponentLog } from '../../db/queries';
import { useDashboardStore } from '../../store/dashboardStore';
import { Plus, Trash2, FileText, Brain } from 'lucide-react';
import { AddLogModal } from './AddLogModal';
import { MatchDetailModal } from './MatchDetailModal';
import { PokemonIcon } from '../shared/PokemonIcon';

/**
 * Maps a match result code to the Tailwind classes that colour the table row.
 *
 * A left-border accent and a subtle background tint give an immediate visual
 * scan of win/loss streaks without relying solely on the badge in the Result
 * column. Using a lookup object rather than inline conditionals keeps the
 * `<tr>` className readable.
 */
const RESULT_ROW: Record<string, string> = {
  W: 'border-l-2 border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100',
  L: 'border-l-2 border-l-red-500 bg-red-50 hover:bg-red-100',
  T: 'border-l-2 border-l-amber-500 bg-amber-50 hover:bg-amber-100',
};

interface Props {
  logs: OpponentLogType[];
  /** When set, only shows logs for this deck and pre-selects it in the add modal */
  deckId?: number;
  /** @deprecated – kept for call-site compatibility; button is now always a FAB */
  showAddButton?: boolean;
}

/**
 * Displays a scrollable table of logged opponent matches with inline actions.
 *
 * Each row is clickable to open a detail modal and shows a coloured left
 * border based on the match result so win/loss patterns are scannable at a
 * glance. The Pokémon sprite next to the archetype name adds visual context
 * without taking up additional column space.
 *
 * React Concept: `detailLog` is kept in local state rather than a URL param
 * because the detail modal is transient — closing it should not affect browser
 * history.
 */
export function OpponentLog({ logs, deckId }: Props) {
  const { t } = useTranslation('opponents');
  const { refresh, decks } = useDashboardStore();
  const [showModal, setShowModal] = useState(false);
  const [detailLog, setDetailLog] = useState<OpponentLogType | null>(null);

  const deckMap = new Map(decks.map((d) => [d.id!, `${d.archetypeName} · ${d.variant}`]));

  const filtered = deckId != null ? logs.filter((l) => l.deckId === deckId) : logs;

  const handleDelete = async (e: React.MouseEvent, id: number | undefined) => {
    e.stopPropagation();
    if (id == null) return;
    await deleteOpponentLog(id);
    refresh();
  };

  return (
    <div className="card overflow-hidden p-0 relative">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-200">
        <div>
          <h3 className="card-header mb-0">{t('logList.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('logList.recordedMatches', { count: filtered.length })}
          </p>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[520px]">
        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-slate-500 text-sm">{t('logList.empty')}</p>
            <button onClick={() => setShowModal(true)} className="btn-primary text-xs mx-auto">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {t('logList.logFirst')}
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white/95 backdrop-blur">
              <tr className="border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('logList.headers.opponent')}
                </th>
                {deckId == null && (
                  <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs">
                    {t('logList.headers.myDeck')}
                  </th>
                )}
                <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs">
                  {t('logList.headers.event')}
                </th>
                {/* Date hidden on small screens — not enough horizontal space */}
                <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs hidden sm:table-cell">
                  {t('logList.headers.date')}
                </th>
                {/* Round hidden on small screens — lower priority information */}
                <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs hidden sm:table-cell">
                  {t('logList.headers.round')}
                </th>
                <th className="text-left px-4 py-2.5 text-slate-500 font-bold text-xs hidden md:table-cell">
                  {t('logList.headers.notes')}
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setDetailLog(log)}
                  className={`border-b border-slate-100 group transition-colors cursor-pointer ${RESULT_ROW[log.result] ?? ''}`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          log.result === 'W'
                            ? 'bg-emerald-500'
                            : log.result === 'L'
                              ? 'bg-red-500'
                              : 'bg-amber-500'
                        }`}
                      />
                      <PokemonIcon archetype={log.archetype} size="sm" dual />
                      <span className="text-slate-800 font-medium text-sm">{log.archetype}</span>
                      {log.battleLog && (
                        <span
                          title={
                            log.analysis ? t('logList.logAndAnalysis') : t('logList.logAvailable')
                          }
                        >
                          {log.analysis ? (
                            <Brain className="w-3 h-3 text-brand-700 shrink-0" />
                          ) : (
                            <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  {deckId == null && (
                    <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[120px] truncate">
                      {log.deckId ? (deckMap.get(log.deckId) ?? '—') : '—'}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <span className={log.eventType === 'LC' ? 'badge-lc' : 'badge-lcup'}>
                      {log.eventType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 text-xs whitespace-nowrap hidden sm:table-cell">
                    {log.eventDate}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs hidden sm:table-cell">
                    {log.round ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-xs truncate hidden md:table-cell">
                    {log.notes || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={(e) => handleDelete(e, log.id)}
                      aria-label={t('delete', { ns: 'common' })}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-700 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* FAB — only visible when there are already entries */}
      {filtered.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('logList.logMatch')}
          </button>
        </div>
      )}

      {showModal && (
        <AddLogModal
          preselectedDeckId={deckId}
          onClose={() => {
            setShowModal(false);
            refresh();
          }}
        />
      )}
      {detailLog && (
        <MatchDetailModal
          log={detailLog}
          onClose={() => {
            setDetailLog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
