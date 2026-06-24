import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { BarChart2, ChevronUp, ChevronDown, AlertTriangle, Info } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { computeDeckPerformanceStats } from '../../lib/deckPerformanceStats';
import type { CardPerformance, DeckPerformanceStats } from '../../types';

const LS_PLAYER = 'tcg-player-name';

// ─── Tiny stat card ──────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  color = 'text-slate-900',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-slate-100 rounded-lg border border-slate-200 px-3 py-2.5">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Win-rate delta pill ──────────────────────────────────────────────────────

function WRDelta({ wr, baseline, n }: { wr: number; baseline: number; n: number }) {
  const { t } = useTranslation('deck');
  if (n < 3) return <span className="text-[10px] text-slate-400">{t('performance.lowData')}</span>;
  const delta = wr - baseline;
  const cls = delta > 8 ? 'text-emerald-700' : delta < -8 ? 'text-red-700' : 'text-slate-600';
  const sign = delta > 0 ? '+' : '';
  return (
    <span className={`text-xs font-medium tabular-nums ${cls}`}>
      {sign}
      {delta}%
    </span>
  );
}

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortKey = 'playRate' | 'avgPlays' | 'winRate';

function sortCards(cards: CardPerformance[], key: SortKey, asc: boolean): CardPerformance[] {
  return [...cards].sort((a, b) => {
    const diff =
      key === 'playRate'
        ? a.playRate - b.playRate
        : key === 'avgPlays'
          ? a.avgPlaysPerGame - b.avgPlaysPerGame
          : a.winRate - b.winRate;
    return asc ? diff : -diff;
  });
}

function SortIcon({ k, sortKey, asc }: { k: SortKey; sortKey: SortKey; asc: boolean }) {
  if (sortKey !== k) return null;
  return asc ? (
    <ChevronUp className="w-3 h-3 inline ml-0.5" />
  ) : (
    <ChevronDown className="w-3 h-3 inline ml-0.5" />
  );
}

// ─── Card table ───────────────────────────────────────────────────────────────

function CardTable({ cards, overallWR }: { cards: CardPerformance[]; overallWR: number }) {
  const { t } = useTranslation('deck');
  const [sortKey, setSortKey] = useState<SortKey>('playRate');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => sortCards(cards, sortKey, asc), [cards, sortKey, asc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 pr-3 text-xs text-slate-600 font-medium">
              {t('performance.table.card')}
            </th>
            <th
              className="text-right py-2 px-3 text-xs text-slate-600 font-medium cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
              onClick={() => handleSort('playRate')}
            >
              {t('performance.table.playRate')}{' '}
              <SortIcon k="playRate" sortKey={sortKey} asc={asc} />
            </th>
            <th
              className="text-right py-2 px-3 text-xs text-slate-600 font-medium cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
              onClick={() => handleSort('avgPlays')}
            >
              {t('performance.table.avgPerGame')}{' '}
              <SortIcon k="avgPlays" sortKey={sortKey} asc={asc} />
            </th>
            <th
              className="text-right py-2 pl-3 text-xs text-slate-600 font-medium cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
              onClick={() => handleSort('winRate')}
            >
              {t('performance.table.wrWhenPlayed')}{' '}
              <SortIcon k="winRate" sortKey={sortKey} asc={asc} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const decisive = c.winsWithCard + c.lossesWithCard;
            return (
              <tr key={c.card} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-3 text-slate-800">{c.card}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Mini progress bar */}
                    <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.playRate < 25 ? 'bg-red-500' : c.playRate >= 75 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                        style={{ width: `${c.playRate}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs tabular-nums ${c.playRate < 25 ? 'text-red-700' : 'text-slate-700'}`}
                    >
                      {c.playRate}%
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({c.gamesPlayed}/{c.totalGames})
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right text-xs text-slate-600 tabular-nums">
                  {c.avgPlaysPerGame}×
                </td>
                <td className="py-2 pl-3 text-right">
                  {decisive >= 2 ? (
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`text-xs tabular-nums ${
                          c.winRate >= 60
                            ? 'text-emerald-700'
                            : c.winRate <= 35
                              ? 'text-red-700'
                              : 'text-slate-700'
                        }`}
                      >
                        {c.winRate}%
                      </span>
                      <WRDelta wr={c.winRate} baseline={overallWR} n={decisive} />
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 mt-2">
        {t('performance.table.footnote', { overallWR })}
      </p>
    </div>
  );
}

// ─── Insight pills ────────────────────────────────────────────────────────────

function Insight({ text, severity }: { text: string; severity: 'warn' | 'ok' | 'info' }) {
  const cls =
    severity === 'warn'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : severity === 'ok'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
        : 'bg-slate-100 border-slate-200 text-slate-600';
  const Icon = severity === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function buildInsights(
  s: DeckPerformanceStats,
  t: TFunction,
): { text: string; severity: 'warn' | 'ok' | 'info' }[] {
  const out: { text: string; severity: 'warn' | 'ok' | 'info' }[] = [];

  // Turn-1 consistency
  if (s.totalGamesAnalyzed >= 3) {
    if (s.avgTurn1Actions < 1.5) {
      out.push({
        severity: 'warn',
        text: t('performance.insights.turn1Low', { value: s.avgTurn1Actions }),
      });
    } else if (s.avgTurn1Actions >= 3) {
      out.push({
        severity: 'ok',
        text: t('performance.insights.turn1Good', { value: s.avgTurn1Actions }),
      });
    }
  }

  // Brick rate
  if (s.totalGamesAnalyzed >= 3) {
    if (s.lowActivityTurnRate > 35) {
      out.push({
        severity: 'warn',
        text: t('performance.insights.brickHigh', { value: s.lowActivityTurnRate }),
      });
    } else if (s.lowActivityTurnRate <= 15 && s.totalGamesAnalyzed >= 4) {
      out.push({
        severity: 'ok',
        text: t('performance.insights.brickLow', { value: s.lowActivityTurnRate }),
      });
    }
  }

  // Game-length disparity
  if (s.avgGameLengthWins > 0 && s.avgGameLengthLosses > 0) {
    const diff = s.avgGameLengthWins - s.avgGameLengthLosses;
    if (diff >= 3) {
      out.push({
        severity: 'warn',
        text: t('performance.insights.tempoGap', {
          wins: s.avgGameLengthWins,
          losses: s.avgGameLengthLosses,
        }),
      });
    } else if (diff <= -2) {
      out.push({
        severity: 'ok',
        text: t('performance.insights.tempoStrong', { diff: Math.abs(diff) }),
      });
    }
  }

  // Prize dominance in losses
  const { avgPrizesYouTookInLosses, lossGamesCount } = s.prizeEfficiency;
  if (lossGamesCount >= 2) {
    if (avgPrizesYouTookInLosses < 2) {
      out.push({
        severity: 'warn',
        text: t('performance.insights.prizesLowInLosses', { value: avgPrizesYouTookInLosses }),
      });
    } else if (avgPrizesYouTookInLosses >= 4) {
      out.push({
        severity: 'info',
        text: t('performance.insights.closeLosses', { value: avgPrizesYouTookInLosses }),
      });
    }
  }

  return out;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DeckPerformancePanel() {
  const { t } = useTranslation('deck');
  const { opponentLogs } = useDashboardStore();
  const playerName = localStorage.getItem(LS_PLAYER) ?? '';

  const stats = useMemo(
    () => computeDeckPerformanceStats(opponentLogs, playerName),
    [opponentLogs, playerName],
  );

  const logsWithLog = opponentLogs.filter((l) => l.battleLog?.trim()).length;

  if (logsWithLog === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-brand-700" />
          <h3 className="card-header mb-0">{t('performance.title')}</h3>
        </div>
        <p className="text-sm text-slate-500">{t('performance.emptyHint')}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 className="w-4 h-4 text-brand-700" />
          <h3 className="card-header mb-0">{t('performance.title')}</h3>
        </div>
        <p className="text-sm text-slate-500">{t('performance.parseFailed')}</p>
      </div>
    );
  }

  const insights = buildInsights(stats, t);

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-700" />
          <h3 className="card-header mb-0">{t('performance.title')}</h3>
        </div>
        <span className="text-xs text-slate-500">
          {t('performance.gamesWithLog', { count: stats.totalGamesAnalyzed })}
          {!playerName && (
            <span className="text-amber-700 ml-2">{t('performance.setPlayerHint')}</span>
          )}
        </span>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat
          label={t('performance.overallWr')}
          value={`${stats.overallWinRate}%`}
          sub={t('performance.wlSub', {
            wins: stats.prizeEfficiency.winGamesCount,
            losses: stats.prizeEfficiency.lossGamesCount,
          })}
          color={
            stats.overallWinRate >= 55
              ? 'text-emerald-700'
              : stats.overallWinRate <= 40
                ? 'text-red-700'
                : 'text-slate-900'
          }
        />
        <Stat
          label={t('performance.avgGameLength')}
          value={t('performance.turnsValue', { count: stats.avgGameLength })}
          sub={
            stats.avgGameLengthWins > 0 && stats.avgGameLengthLosses > 0
              ? t('performance.wlLengths', {
                  wins: stats.avgGameLengthWins,
                  losses: stats.avgGameLengthLosses,
                })
              : undefined
          }
        />
        <Stat
          label={t('performance.avgTurn1')}
          value={stats.avgTurn1Actions}
          color={stats.avgTurn1Actions < 1.5 ? 'text-amber-700' : 'text-slate-900'}
        />
        <Stat
          label={t('performance.brickRate')}
          value={`${stats.lowActivityTurnRate}%`}
          sub={t('performance.brickSub')}
          color={stats.lowActivityTurnRate > 35 ? 'text-amber-700' : 'text-slate-900'}
        />
        <Stat
          label={t('performance.prizesInWins')}
          value={
            stats.prizeEfficiency.winGamesCount > 0
              ? t('performance.opponentValue', {
                  value: stats.prizeEfficiency.avgPrizesOpponentTookInWins,
                })
              : '—'
          }
          sub={t('performance.prizesInWinsSub')}
        />
        <Stat
          label={t('performance.prizesInLosses')}
          value={
            stats.prizeEfficiency.lossGamesCount > 0
              ? t('performance.youValue', {
                  value: stats.prizeEfficiency.avgPrizesYouTookInLosses,
                })
              : '—'
          }
          sub={t('performance.prizesInLossesSub')}
          color={
            stats.prizeEfficiency.lossGamesCount > 0 &&
            stats.prizeEfficiency.avgPrizesYouTookInLosses < 2
              ? 'text-red-700'
              : 'text-slate-900'
          }
        />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.map((i, idx) => (
            <Insight key={idx} text={i.text} severity={i.severity} />
          ))}
        </div>
      )}

      {/* Card performance */}
      {stats.cardPerformance.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
            {t('performance.cardPerformance')}
          </h4>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <CardTable cards={stats.cardPerformance} overallWR={stats.overallWinRate} />
          </div>
        </section>
      )}
    </div>
  );
}
