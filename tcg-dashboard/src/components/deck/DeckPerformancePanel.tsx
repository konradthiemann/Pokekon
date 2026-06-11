import { useMemo, useState } from 'react';
import { BarChart2, ChevronUp, ChevronDown, AlertTriangle, Info } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { computeDeckPerformanceStats } from '../../lib/deckPerformanceStats';
import type { CardPerformance, DeckPerformanceStats } from '../../types';

const LS_PLAYER = 'tcg-player-name';

// ─── Tiny stat card ──────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/40 px-3 py-2.5">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Win-rate delta pill ──────────────────────────────────────────────────────

function WRDelta({ wr, baseline, n }: { wr: number; baseline: number; n: number }) {
  if (n < 3) return <span className="text-[10px] text-gray-600">wenig Daten</span>;
  const delta = wr - baseline;
  const cls =
    delta > 8  ? 'text-emerald-400' :
    delta < -8 ? 'text-red-400' :
                 'text-gray-400';
  const sign = delta > 0 ? '+' : '';
  return <span className={`text-xs font-medium tabular-nums ${cls}`}>{sign}{delta}%</span>;
}

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortKey = 'playRate' | 'avgPlays' | 'winRate';

function sortCards(cards: CardPerformance[], key: SortKey, asc: boolean): CardPerformance[] {
  return [...cards].sort((a, b) => {
    const diff = key === 'playRate' ? a.playRate - b.playRate
               : key === 'avgPlays' ? a.avgPlaysPerGame - b.avgPlaysPerGame
               : a.winRate - b.winRate;
    return asc ? diff : -diff;
  });
}

// ─── Card table ───────────────────────────────────────────────────────────────

function CardTable({ cards, overallWR }: { cards: CardPerformance[]; overallWR: number }) {
  const [sortKey, setSortKey] = useState<SortKey>('playRate');
  const [asc, setAsc]         = useState(false);

  const sorted = useMemo(() => sortCards(cards, sortKey, asc), [cards, sortKey, asc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? asc ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 pr-3 text-xs text-gray-400 font-medium">Karte</th>
            <th
              className="text-right py-2 px-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
              onClick={() => handleSort('playRate')}
            >
              Spielrate <SortIcon k="playRate" />
            </th>
            <th
              className="text-right py-2 px-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
              onClick={() => handleSort('avgPlays')}
            >
              Ø/Spiel <SortIcon k="avgPlays" />
            </th>
            <th
              className="text-right py-2 pl-3 text-xs text-gray-400 font-medium cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
              onClick={() => handleSort('winRate')}
            >
              WR wenn gespielt <SortIcon k="winRate" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const decisive = c.winsWithCard + c.lossesWithCard;
            return (
              <tr key={c.card} className="border-b border-gray-800/40 hover:bg-gray-800/20">
                <td className="py-2 pr-3 text-gray-200">{c.card}</td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Mini progress bar */}
                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.playRate < 25 ? 'bg-red-500' : c.playRate >= 75 ? 'bg-emerald-500' : 'bg-brand-500'}`}
                        style={{ width: `${c.playRate}%` }}
                      />
                    </div>
                    <span className={`text-xs tabular-nums ${c.playRate < 25 ? 'text-red-400' : 'text-gray-300'}`}>
                      {c.playRate}%
                    </span>
                    <span className="text-[10px] text-gray-600">
                      ({c.gamesPlayed}/{c.totalGames})
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-400 tabular-nums">
                  {c.avgPlaysPerGame}×
                </td>
                <td className="py-2 pl-3 text-right">
                  {decisive >= 2 ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs tabular-nums ${
                        c.winRate >= 60 ? 'text-emerald-400' :
                        c.winRate <= 35 ? 'text-red-400' :
                        'text-gray-300'
                      }`}>
                        {c.winRate}%
                      </span>
                      <WRDelta wr={c.winRate} baseline={overallWR} n={decisive} />
                    </div>
                  ) : (
                    <span className="text-[10px] text-gray-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-700 mt-2">
        WR-Delta = Abweichung von deiner Gesamt-WR ({overallWR}%). Grün = besser wenn gespielt, Rot = schlechter.
        Nur Karten mit ≥2 Spielen gezeigt.
      </p>
    </div>
  );
}

// ─── Insight pills ────────────────────────────────────────────────────────────

function Insight({ text, severity }: { text: string; severity: 'warn' | 'ok' | 'info' }) {
  const cls = severity === 'warn' ? 'bg-yellow-900/30 border-yellow-700/40 text-yellow-300'
            : severity === 'ok'   ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
            :                       'bg-gray-800/60 border-gray-700/40 text-gray-400';
  const Icon = severity === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function buildInsights(s: DeckPerformanceStats): { text: string; severity: 'warn' | 'ok' | 'info' }[] {
  const out: { text: string; severity: 'warn' | 'ok' | 'info' }[] = [];

  // Turn-1 consistency
  if (s.totalGamesAnalyzed >= 3) {
    if (s.avgTurn1Actions < 1.5) {
      out.push({ severity: 'warn', text: `Zug-1-Konsistenz: Ø nur ${s.avgTurn1Actions} Aktionen im ersten Zug — mögliches Setup-Problem.` });
    } else if (s.avgTurn1Actions >= 3) {
      out.push({ severity: 'ok', text: `Gute Zug-1-Konsistenz: Ø ${s.avgTurn1Actions} Aktionen im ersten Zug.` });
    }
  }

  // Brick rate
  if (s.totalGamesAnalyzed >= 3) {
    if (s.lowActivityTurnRate > 35) {
      out.push({ severity: 'warn', text: `Hohe Brick-Rate: ${s.lowActivityTurnRate}% deiner Züge hatten ≤1 Aktion — Konsistenz verbessern.` });
    } else if (s.lowActivityTurnRate <= 15 && s.totalGamesAnalyzed >= 4) {
      out.push({ severity: 'ok', text: `Niedrige Brick-Rate: Nur ${s.lowActivityTurnRate}% niedrig-aktive Züge.` });
    }
  }

  // Game-length disparity
  if (s.avgGameLengthWins > 0 && s.avgGameLengthLosses > 0) {
    const diff = s.avgGameLengthWins - s.avgGameLengthLosses;
    if (diff >= 3) {
      out.push({ severity: 'warn', text: `Tempo-Lücke: Siege dauern Ø ${s.avgGameLengthWins} Züge, Niederlagen nur ${s.avgGameLengthLosses} — du wirst häufig überrollt.` });
    } else if (diff <= -2) {
      out.push({ severity: 'ok', text: `Starkes Tempo: Du gewinnst Ø ${Math.abs(diff)} Züge früher als du verlierst.` });
    }
  }

  // Prize dominance in losses
  const { avgPrizesYouTookInLosses, lossGamesCount } = s.prizeEfficiency;
  if (lossGamesCount >= 2) {
    if (avgPrizesYouTookInLosses < 2) {
      out.push({ severity: 'warn', text: `Ø ${avgPrizesYouTookInLosses} Preiskarten in Niederlagen — du wirst in vielen Spielen früh dominiert.` });
    } else if (avgPrizesYouTookInLosses >= 4) {
      out.push({ severity: 'info', text: `Knappe Niederlagen: Du nimmst Ø ${avgPrizesYouTookInLosses} Preiskarten — die Spiele sind oft eng.` });
    }
  }

  return out;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DeckPerformancePanel() {
  const { opponentLogs } = useDashboardStore();
  const playerName = localStorage.getItem(LS_PLAYER) ?? '';

  const stats = useMemo(() => computeDeckPerformanceStats(opponentLogs, playerName), [opponentLogs, playerName]);

  const logsWithLog = opponentLogs.filter((l) => l.battleLog?.trim()).length;

  if (logsWithLog === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-brand-400" />
          <h3 className="card-header mb-0">Kampfverlauf-Statistiken</h3>
        </div>
        <p className="text-sm text-gray-500">
          Füge in deinen Matches unter "Kampfprotokoll" Spielprotokolle hinzu — dann erscheinen hier detaillierte Performance-Analysen.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <BarChart2 className="w-4 h-4 text-brand-400" />
          <h3 className="card-header mb-0">Kampfverlauf-Statistiken</h3>
        </div>
        <p className="text-sm text-gray-500">Protokolle konnten nicht ausgewertet werden.</p>
      </div>
    );
  }

  const insights = buildInsights(stats);

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-brand-400" />
          <h3 className="card-header mb-0">Kampfverlauf-Statistiken</h3>
        </div>
        <span className="text-xs text-gray-600">
          {stats.totalGamesAnalyzed} Spiel{stats.totalGamesAnalyzed !== 1 ? 'e' : ''} mit Protokoll
          {!playerName && (
            <span className="text-yellow-500 ml-2">
              — Spielernamen in der Detailansicht setzen für genauere Auswertung
            </span>
          )}
        </span>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Stat
          label="Gesamt-WR"
          value={`${stats.overallWinRate}%`}
          sub={`${stats.prizeEfficiency.winGamesCount}S / ${stats.prizeEfficiency.lossGamesCount}N`}
          color={stats.overallWinRate >= 55 ? 'text-emerald-400' : stats.overallWinRate <= 40 ? 'text-red-400' : 'text-white'}
        />
        <Stat
          label="Ø Spiellänge"
          value={`${stats.avgGameLength} Züge`}
          sub={stats.avgGameLengthWins > 0 && stats.avgGameLengthLosses > 0
            ? `S: ${stats.avgGameLengthWins} / N: ${stats.avgGameLengthLosses}`
            : undefined}
        />
        <Stat
          label="Ø Zug-1-Aktionen"
          value={stats.avgTurn1Actions}
          color={stats.avgTurn1Actions < 1.5 ? 'text-yellow-400' : 'text-white'}
        />
        <Stat
          label="Brick-Rate"
          value={`${stats.lowActivityTurnRate}%`}
          sub="Züge mit ≤1 Aktion"
          color={stats.lowActivityTurnRate > 35 ? 'text-yellow-400' : 'text-white'}
        />
        <Stat
          label="Preiskarten in Siegen"
          value={stats.prizeEfficiency.winGamesCount > 0
            ? `Gegner: ${stats.prizeEfficiency.avgPrizesOpponentTookInWins}`
            : '—'}
          sub="Ø Preisk. des Gegners"
        />
        <Stat
          label="Preiskarten in Niederl."
          value={stats.prizeEfficiency.lossGamesCount > 0
            ? `Du: ${stats.prizeEfficiency.avgPrizesYouTookInLosses}`
            : '—'}
          sub="Ø eigene Preiskarten"
          color={
            stats.prizeEfficiency.lossGamesCount > 0 && stats.prizeEfficiency.avgPrizesYouTookInLosses < 2
              ? 'text-red-400'
              : 'text-white'
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
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Karten-Performance
          </h4>
          <div className="bg-gray-800/20 rounded-lg border border-gray-700/30 p-3">
            <CardTable cards={stats.cardPerformance} overallWR={stats.overallWinRate} />
          </div>
        </section>
      )}
    </div>
  );
}
