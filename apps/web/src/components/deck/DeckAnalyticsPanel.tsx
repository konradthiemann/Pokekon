import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  GitCompare,
  Shield,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { tournamentWinRatePct } from '@pokekon/shared';
import type { Deck, OpponentLog, MetaSnapshot, MatchResult } from '../../types';
import { PokemonIcon } from '../shared/PokemonIcon';
import { DeckTurnQualityPanel } from './DeckTurnQualityPanel';

interface Props {
  decks: Deck[];
  allLogs: OpponentLog[];
  metaSnapshots: MetaSnapshot[];
  activeDeckId: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Tie-weighted (a tie counts as a third of a win), not wins/(wins+losses) —
// plan personal-data-role-rework.md §6 decision 1. Found as a sixth,
// previously overlooked spot (not part of Spec 2's original five) while
// implementing that decision — same category of miss as the
// `loadWindowAggregates` spot Spec 2 itself found.
function wr(wins: number, losses: number, ties = 0): number {
  return tournamentWinRatePct(wins, losses, ties, 0) ?? 0;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// Simple Wilson confidence interval lower bound (95%)
function wilsonLower(wins: number, n: number): number {
  if (n === 0) return 0;
  const p = wins / n;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  return Math.round(
    ((p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom) * 100,
  );
}

function FormDot({ r }: { r: MatchResult }) {
  const cls = r === 'W' ? 'bg-emerald-500' : r === 'L' ? 'bg-red-500' : 'bg-amber-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} title={r} />;
}

function WrBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= 60 ? 'bg-emerald-500' : value >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`text-xs tabular-nums w-8 text-right font-semibold ${value >= 60 ? 'text-emerald-700' : value >= 45 ? 'text-amber-700' : 'text-red-700'}`}
      >
        {value}%
      </span>
    </div>
  );
}

// ─── Per-deck analytics ───────────────────────────────────────────────────────

interface DeckStats {
  deck: Deck;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  ciLower: number; // 95% Wilson lower bound
  metaScore: number; // frequency-weighted WR
  recentForm: MatchResult[];
  recentWR: number; // last 10 games WR
  consistency: number; // 100 - stdDev of matchup WRs (capped 0-100)
  matchups: {
    archetype: string;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    metaFreq: number;
    tier: 'favorable' | 'even' | 'unfavorable';
  }[];
}

function computeDeckStats(
  deck: Deck,
  logs: OpponentLog[],
  freqMap: Map<string, number>,
): DeckStats {
  const deckLogs = logs.filter((l) => l.deckId === deck.id);

  const statsMap = new Map<string, { wins: number; losses: number; ties: number }>();
  for (const log of deckLogs) {
    const cur = statsMap.get(log.archetype) ?? { wins: 0, losses: 0, ties: 0 };
    if (log.result === 'W') cur.wins++;
    if (log.result === 'L') cur.losses++;
    if (log.result === 'T') cur.ties++;
    statsMap.set(log.archetype, cur);
  }

  const matchups = [...statsMap.entries()]
    .map(([archetype, s]) => {
      const rate = wr(s.wins, s.losses, s.ties);
      return {
        archetype,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        winRate: rate,
        metaFreq: freqMap.get(archetype.toLowerCase()) ?? 0,
        tier:
          rate >= 58
            ? ('favorable' as const)
            : rate >= 42
              ? ('even' as const)
              : ('unfavorable' as const),
      };
    })
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));

  const wins = deckLogs.filter((l) => l.result === 'W').length;
  const losses = deckLogs.filter((l) => l.result === 'L').length;
  const ties = deckLogs.filter((l) => l.result === 'T').length;
  const decisive = wins + losses;
  const winRate = wr(wins, losses, ties);

  // Meta-weighted score
  const metaMatchups = matchups.filter((m) => m.metaFreq > 0 && m.wins + m.losses >= 2);
  const totalFreq = metaMatchups.reduce((s, m) => s + m.metaFreq, 0);
  const metaScore =
    totalFreq > 0
      ? Math.round(metaMatchups.reduce((s, m) => s + m.metaFreq * m.winRate, 0) / totalFreq)
      : 0;

  // Recent form (last 10)
  const recentForm = deckLogs.slice(0, 10).map((l) => l.result as MatchResult);
  const recentWins = recentForm.filter((r) => r === 'W').length;
  const recentLosses = recentForm.filter((r) => r === 'L').length;
  const recentTies = recentForm.filter((r) => r === 'T').length;
  const recentWR = wr(recentWins, recentLosses, recentTies);

  // Consistency (low std dev = consistent)
  const matchupWRs = matchups.filter((m) => m.wins + m.losses >= 2).map((m) => m.winRate);
  const sd = stdDev(matchupWRs);
  const consistency = Math.max(0, Math.round(100 - sd));

  return {
    deck,
    games: deckLogs.length,
    wins,
    losses,
    ties,
    winRate,
    ciLower: wilsonLower(wins, decisive),
    metaScore,
    recentForm,
    recentWR,
    consistency,
    matchups,
  };
}

// ─── Variant comparison table ─────────────────────────────────────────────────

function VariantComparison({ variants }: { variants: DeckStats[] }) {
  const { t } = useTranslation('deck');
  // Gather all matchups that appear in at least one variant with ≥2 decisive games
  const allMatchups = [
    ...new Set(
      variants.flatMap((v) =>
        v.matchups.filter((m) => m.wins + m.losses >= 2).map((m) => m.archetype),
      ),
    ),
  ];

  if (allMatchups.length === 0) return null;

  return (
    <div className="card overflow-hidden p-0">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-brand-700" />
        <h3 className="card-header mb-0">{t('analytics.comparison.title')}</h3>
        <span className="text-xs text-slate-500 ml-1">{t('analytics.comparison.subtitle')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="px-4 py-2.5 text-left text-slate-600 font-medium">
                {t('analytics.comparison.matchup')}
              </th>
              {variants.map((v) => (
                <th
                  key={v.deck.id}
                  className="px-3 py-2.5 text-center text-slate-600 font-medium min-w-[90px]"
                >
                  {v.deck.variant}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center text-slate-600 font-medium">
                {t('analytics.comparison.edge')}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Overall row */}
            <tr className="border-b border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-semibold text-slate-800">
                {t('analytics.comparison.overallWr')}
              </td>
              {variants.map((v) => (
                <td key={v.deck.id} className="px-3 py-2.5 text-center">
                  <span
                    className={`font-semibold ${v.winRate >= 55 ? 'text-emerald-700' : v.winRate >= 45 ? 'text-slate-800' : 'text-red-700'}`}
                  >
                    {v.games > 0 ? `${v.winRate}%` : '—'}
                  </span>
                  <span className="text-slate-400 ml-1">
                    {t('analytics.comparison.games', { count: v.games })}
                  </span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-center">
                {variants.length >= 2 &&
                  variants[0].games > 0 &&
                  variants[1].games > 0 &&
                  (() => {
                    const best = variants.reduce((a, b) => (a.winRate > b.winRate ? a : b));
                    const diff =
                      Math.max(...variants.map((v) => v.winRate)) -
                      Math.min(...variants.map((v) => v.winRate));
                    return diff >= 3 ? (
                      <span className="text-brand-700 font-medium">
                        {t('analytics.comparison.lead', { variant: best.deck.variant, diff })}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {t('analytics.comparison.approxEqual')}
                      </span>
                    );
                  })()}
              </td>
            </tr>
            {allMatchups.map((arch) => {
              const cells = variants.map((v) => v.matchups.find((m) => m.archetype === arch));
              // `c.winRate` is already the tie-weighted rate computed once in
              // `computeDeckStats` above — reuse it instead of recomputing.
              const rates = cells.map((c) => (c ? c.winRate : -1)).filter((r) => r >= 0);
              const maxRate = Math.max(...rates);
              const minRate = Math.min(...rates);
              const spread = maxRate - minRate;

              return (
                <tr key={arch} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700 truncate max-w-[160px]">{arch}</td>
                  {cells.map((c, i) => (
                    <td key={variants[i].deck.id} className="px-3 py-2 text-center">
                      {c && c.wins + c.losses >= 2 ? (
                        <span
                          className={`font-semibold ${c.winRate >= 58 ? 'text-emerald-700' : c.winRate >= 42 ? 'text-slate-700' : 'text-red-700'}`}
                        >
                          {c.winRate}%
                          <span className="text-slate-400 font-normal ml-1 text-xs">
                            ({c.wins}-{c.losses})
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          {c
                            ? t('analytics.comparison.gamesShort', { count: c.wins + c.losses })
                            : '—'}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    {spread >= 10 ? (
                      <span className="text-brand-700 text-xs font-medium">
                        {t('analytics.comparison.lead', {
                          variant: variants[rates.indexOf(maxRate)]?.deck.variant,
                          diff: spread,
                        })}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Single deck stats panel ──────────────────────────────────────────────────

function MatchupList({ stats }: { stats: DeckStats }) {
  const { t } = useTranslation('deck');
  const sorted = [...stats.matchups].sort((a, b) => {
    // Sort by meta frequency first (meta-relevant matchups first), then by games
    if (b.metaFreq !== a.metaFreq) return b.metaFreq - a.metaFreq;
    return b.wins + b.losses - (a.wins + a.losses);
  });

  if (sorted.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">{t('analytics.matchups.empty')}</div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((m) => {
        const games = m.wins + m.losses + m.ties;
        const isLowData = games < 3;
        return (
          <div
            key={m.archetype}
            className={`flex items-center gap-3 px-1 py-1.5 rounded hover:bg-slate-100 transition-colors ${isLowData ? 'opacity-60' : ''}`}
          >
            <div className="w-36 shrink-0 flex items-center gap-1.5">
              <PokemonIcon archetype={m.archetype} size="sm" dual />
              <div className="min-w-0">
                <span className="text-xs text-slate-700 truncate block">{m.archetype}</span>
                {m.metaFreq > 0 && (
                  <span className="text-xs text-slate-400">
                    {t('analytics.matchups.metaShare', { value: m.metaFreq.toFixed(1) })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1">
              <WrBar value={m.winRate} />
            </div>
            <div className="text-xs text-slate-500 tabular-nums w-20 text-right shrink-0">
              {m.wins}W-{m.losses}L-{m.ties}T
            </div>
            <div className="w-16 shrink-0">
              {isLowData ? (
                <span className="text-xs text-slate-400 italic">
                  {t('analytics.matchups.lowData')}
                </span>
              ) : (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    m.tier === 'favorable'
                      ? 'bg-emerald-100 text-emerald-800'
                      : m.tier === 'unfavorable'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {m.tier === 'favorable'
                    ? t('analytics.matchups.favored')
                    : m.tier === 'unfavorable'
                      ? t('analytics.matchups.unfavorable')
                      : t('analytics.matchups.even')}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Meta insights ────────────────────────────────────────────────────────────

function MetaInsights({
  stats,
  metaSnapshots,
}: {
  stats: DeckStats;
  metaSnapshots: MetaSnapshot[];
}) {
  const { t } = useTranslation('deck');
  const topMeta = metaSnapshots
    .filter((s) => s.frequencyPct >= 5)
    .sort((a, b) => b.frequencyPct - a.frequencyPct)
    .slice(0, 10);

  const coverage = topMeta.filter((m) => {
    const match = stats.matchups.find((mu) =>
      mu.archetype.toLowerCase().includes(m.archetype.toLowerCase().split('-')[0]),
    );
    return match && match.wins + match.losses >= 2;
  }).length;

  const coveragePct = topMeta.length > 0 ? Math.round((coverage / topMeta.length) * 100) : 0;

  const gatekeeper = stats.matchups.find((m) => {
    const isTop3 = topMeta
      .slice(0, 3)
      .some((t) => m.archetype.toLowerCase().includes(t.archetype.toLowerCase().split('-')[0]));
    return isTop3 && m.winRate < 45 && m.wins + m.losses >= 3;
  });

  const bestMatchup = stats.matchups
    .filter((m) => m.wins + m.losses >= 3)
    .sort((a, b) => b.winRate - a.winRate)[0];

  const worstMatchup = stats.matchups
    .filter((m) => m.wins + m.losses >= 3)
    .sort((a, b) => a.winRate - b.winRate)[0];

  return (
    <div className="space-y-2">
      {gatekeeper && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-red-700 shrink-0 mt-0.5" />
          <div>
            <span className="text-red-800 font-medium">
              {t('analytics.insights.gatekeeperLabel')}
            </span>
            <span className="text-slate-700 ml-1">
              {t('analytics.insights.gatekeeperText', {
                archetype: gatekeeper.archetype,
                rate: gatekeeper.winRate,
              })}
            </span>
          </div>
        </div>
      )}

      {coveragePct < 50 && topMeta.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
          <Target className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="text-amber-800 font-medium">
              {t('analytics.insights.lowCoverageLabel')}
            </span>
            <span className="text-slate-700 ml-1">
              {t('analytics.insights.lowCoverageText', { value: coveragePct })}
            </span>
          </div>
        </div>
      )}

      {bestMatchup && (
        <div className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
          <Shield className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
          <span className="text-slate-700">
            <span className="text-emerald-800 font-medium">
              {t('analytics.insights.bestLabel')}
            </span>{' '}
            {bestMatchup.archetype}{' '}
            {t('analytics.insights.rateInGames', {
              rate: bestMatchup.winRate,
              count: bestMatchup.wins + bestMatchup.losses + bestMatchup.ties,
            })}
          </span>
        </div>
      )}

      {worstMatchup &&
        worstMatchup.archetype !== bestMatchup?.archetype &&
        worstMatchup.winRate < 45 && (
          <div className="flex items-start gap-2 p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs">
            <TrendingDown className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
            <span className="text-slate-700">
              <span className="text-slate-800 font-medium">
                {t('analytics.insights.worstLabel')}
              </span>{' '}
              {worstMatchup.archetype}{' '}
              {t('analytics.insights.rateInGames', {
                rate: worstMatchup.winRate,
                count: worstMatchup.wins + worstMatchup.losses + worstMatchup.ties,
              })}
            </span>
          </div>
        )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeckAnalyticsPanel({ decks, allLogs, metaSnapshots, activeDeckId }: Props) {
  const { t } = useTranslation('deck');
  const freqMap = useMemo(
    () => new Map(metaSnapshots.map((s) => [s.archetype.toLowerCase(), s.frequencyPct])),
    [metaSnapshots],
  );

  const allDeckStats = useMemo(
    () => decks.map((d) => computeDeckStats(d, allLogs, freqMap)),
    [decks, allLogs, freqMap],
  );

  // Group by archetype
  const archetypeGroups = useMemo(() => {
    const groups = new Map<string, DeckStats[]>();
    for (const stats of allDeckStats) {
      const key = stats.deck.archetype;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(stats);
    }
    return groups;
  }, [allDeckStats]);

  const activeStats = allDeckStats.find((s) => s.deck.id === activeDeckId);

  // Archetype-level aggregate (all variants of the active archetype)
  const archetypeAggregate = useMemo(() => {
    if (!activeStats) return null;
    const variants = archetypeGroups.get(activeStats.deck.archetype) ?? [];
    if (variants.length === 0) return null;
    const wins = variants.reduce((s, v) => s + v.wins, 0);
    const losses = variants.reduce((s, v) => s + v.losses, 0);
    const ties = variants.reduce((s, v) => s + v.ties, 0);
    const games = variants.reduce((s, v) => s + v.games, 0);
    const bestVariant = [...variants].sort((a, b) => b.winRate - a.winRate)[0];
    return {
      variantCount: variants.length,
      wins,
      losses,
      ties,
      games,
      winRate: wr(wins, losses, ties),
      bestVariant,
    };
  }, [activeStats, archetypeGroups]);

  if (decks.length === 0) {
    return (
      <div className="card py-12 text-center text-slate-400 text-sm">{t('analytics.noDecks')}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Archetype-level overview (all variants combined) ── */}
      {activeStats && archetypeAggregate && archetypeAggregate.variantCount > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-700" />
            <h3 className="card-header mb-0">
              {t('analytics.overallTitle', { name: activeStats.deck.archetypeName })}
            </h3>
            <span className="text-xs text-slate-500 ml-1">
              {t('analytics.variantsCombined', { count: archetypeAggregate.variantCount })}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200">
            <div className="p-4 text-center">
              <div
                className={`text-2xl font-bold ${archetypeAggregate.winRate >= 55 ? 'text-emerald-700' : archetypeAggregate.winRate >= 45 ? 'text-amber-700' : archetypeAggregate.games > 0 ? 'text-red-700' : 'text-slate-400'}`}
              >
                {archetypeAggregate.games > 0 ? `${archetypeAggregate.winRate}%` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.overallWr')}</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-800 tabular-nums">
                {archetypeAggregate.games}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.totalGames')}</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {archetypeAggregate.wins}-{archetypeAggregate.losses}-{archetypeAggregate.ties}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.wlt')}</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-sm font-semibold text-brand-700 truncate px-2">
                {archetypeAggregate.bestVariant && archetypeAggregate.bestVariant.games > 0
                  ? archetypeAggregate.bestVariant.deck.variant || '—'
                  : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {t('analytics.bestVariant')}
                {archetypeAggregate.bestVariant && archetypeAggregate.bestVariant.games > 0
                  ? ` (${archetypeAggregate.bestVariant.winRate}%)`
                  : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server-side turn-quality analytics (from parsed battle logs) */}
      {activeDeckId != null && <DeckTurnQualityPanel deckId={activeDeckId} />}

      {/* Active variant analytics */}
      {activeStats && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider font-bold pt-2">
            <BarChart2 className="w-3.5 h-3.5 text-brand-700" />
            {t('analytics.variantLabel')}{' '}
            <span className="text-slate-700 normal-case font-medium tracking-normal">
              {activeStats.deck.variant || t('analytics.defaultVariant')}
            </span>
          </div>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <div className="flex justify-center mb-1">
                <BarChart2 className="w-4 h-4 text-brand-700" />
              </div>
              <div
                className={`text-2xl font-bold ${activeStats.winRate >= 55 ? 'text-emerald-700' : activeStats.winRate >= 45 ? 'text-amber-700' : 'text-red-700'}`}
              >
                {activeStats.games > 0 ? `${activeStats.winRate}%` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.winRate')}</div>
              {activeStats.games >= 5 && (
                <div className="text-xs text-slate-400 mt-0.5">
                  {t('analytics.ciLower', { value: activeStats.ciLower })}
                </div>
              )}
            </div>

            <div className="card p-4 text-center">
              <div className="flex justify-center mb-1">
                <Target className="w-4 h-4 text-brand-700" />
              </div>
              <div
                className={`text-2xl font-bold ${activeStats.metaScore >= 55 ? 'text-emerald-700' : activeStats.metaScore >= 45 ? 'text-amber-700' : activeStats.metaScore > 0 ? 'text-red-700' : 'text-slate-400'}`}
              >
                {activeStats.metaScore > 0 ? `${activeStats.metaScore}%` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.metaScore')}</div>
              <div className="text-xs text-slate-400 mt-0.5">{t('analytics.freqWeighted')}</div>
            </div>

            <div className="card p-4 text-center">
              <div className="flex justify-center mb-1">
                <Zap className="w-4 h-4 text-brand-700" />
              </div>
              <div
                className={`text-2xl font-bold ${activeStats.recentWR >= 55 ? 'text-emerald-700' : activeStats.recentWR >= 45 ? 'text-amber-700' : activeStats.recentWR > 0 ? 'text-red-700' : 'text-slate-400'}`}
              >
                {activeStats.recentForm.length > 0 ? `${activeStats.recentWR}%` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.recentForm')}</div>
              <div className="flex items-center justify-center gap-0.5 mt-1">
                {activeStats.recentForm.map((r, i) => (
                  <FormDot key={i} r={r} />
                ))}
              </div>
            </div>

            <div className="card p-4 text-center">
              <div className="flex justify-center mb-1">
                <TrendingUp className="w-4 h-4 text-brand-700" />
              </div>
              <div
                className={`text-2xl font-bold ${activeStats.consistency >= 70 ? 'text-emerald-700' : activeStats.consistency >= 50 ? 'text-amber-700' : 'text-red-700'}`}
              >
                {activeStats.games >= 6 ? `${activeStats.consistency}` : '—'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{t('analytics.consistency')}</div>
              <div className="text-xs text-slate-400 mt-0.5">{t('analytics.wrStability')}</div>
            </div>
          </div>

          {/* Meta insights */}
          {activeStats.games >= 3 && (
            <MetaInsights stats={activeStats} metaSnapshots={metaSnapshots} />
          )}

          {/* Matchup breakdown */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-brand-700" />
              <h3 className="card-header mb-0">{t('analytics.matchupPerformance')}</h3>
              <span className="text-xs text-slate-500 ml-1">{t('analytics.sortedByMeta')}</span>
            </div>
            <div className="px-4 py-3">
              <MatchupList stats={activeStats} />
            </div>
          </div>
        </>
      )}

      {/* Variant comparison for archetypes with multiple decks */}
      {[...archetypeGroups.entries()]
        .filter(([, variants]) => variants.length >= 2)
        .map(([archetype, variants]) => (
          <VariantComparison key={archetype} variants={variants} />
        ))}
    </div>
  );
}
