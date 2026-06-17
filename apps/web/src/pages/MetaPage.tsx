import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../store/dashboardStore';
import {
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Trophy,
  Users,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Minus,
  Grid3X3,
} from 'lucide-react';
import type { MetaSnapshot, RecentTournament } from '../types';
import { MatchupMatrix } from '../components/meta/MatchupMatrix';
import { CollapsibleSection } from '../components/layout/CollapsibleSection';
import { PokemonIcon } from '../components/shared/PokemonIcon';

// ─── Meta table ───────────────────────────────────────────────────────────────

type SortKey = 'frequencyPct' | 'winRatePct' | 'playerCount';

function WinRateBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-600 font-mono">—</span>;
  const color =
    pct >= 55
      ? 'text-emerald-400'
      : pct >= 50
        ? 'text-green-400'
        : pct >= 45
          ? 'text-yellow-400'
          : 'text-red-400';
  return <span className={`font-mono font-semibold ${color}`}>{pct}%</span>;
}

function ShareBar({ pct, max }: { pct: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden min-w-[60px]">
        <div
          className="h-full bg-brand-500 rounded-full"
          style={{ width: `${Math.min((pct / max) * 100, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-300 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <Minus className="w-3 h-3 text-gray-600" aria-hidden="true" />;
  return asc ? (
    <ChevronUp className="w-3 h-3 text-brand-400" aria-hidden="true" />
  ) : (
    <ChevronDown className="w-3 h-3 text-brand-400" aria-hidden="true" />
  );
}

function TH({
  label,
  sortK,
  right = true,
  sortKey,
  asc,
  onSort,
}: {
  label: string;
  sortK?: SortKey;
  right?: boolean;
  sortKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${sortK ? 'cursor-pointer hover:text-gray-200 select-none' : ''}`}
      onClick={sortK ? () => onSort(sortK) : undefined}
    >
      <span className={`flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        {sortK && <SortIcon active={sortKey === sortK} asc={asc} />}
      </span>
    </th>
  );
}

const PAGE_SIZE = 10;

function MetaTable({ snapshots }: { snapshots: MetaSnapshot[] }) {
  const { t } = useTranslation('meta');
  const [sortKey, setSortKey] = useState<SortKey>('frequencyPct');
  const [asc, setAsc] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  const sorted = [...snapshots].sort((a, b) => {
    const va = a[sortKey] ?? 0;
    const vb = b[sortKey] ?? 0;
    return asc ? va - vb : vb - va;
  });

  const visible = expanded ? sorted : sorted.slice(0, PAGE_SIZE);
  const hasMore = sorted.length > PAGE_SIZE;
  const maxFreq = Math.max(...snapshots.map((s) => s.frequencyPct), 1);

  // ICON_BOX: fixed px width for the icon area so every row aligns regardless
  // of whether the archetype has 1 or 2 sprites (24px each + 2px gap = 50px, pad to 54).
  const ICON_BOX = 54;
  // Deck column: icon box only when collapsed, icon box + name when open
  const deckColW = namesOpen ? ICON_BOX + 172 : ICON_BOX + 10;

  return (
    <div className="-m-4">
      {sorted.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">{t('metaTable.empty')}</div>
      ) : (
        <>
          <div className="relative">
            <div className="overflow-x-auto">
              <table
                className="text-sm border-collapse"
                style={{ tableLayout: 'fixed', width: '100%' }}
              >
                {/* Fixed column widths — icon column transitions via state */}
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: deckColW, transition: 'width 0.2s ease' }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 68 }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/30">
                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-left">
                      #
                    </th>
                    {/* Accordion header — same pattern as MatchupMatrix */}
                    <th className="py-3 px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider text-left">
                      <button
                        onClick={() => setNamesOpen((v) => !v)}
                        className="flex items-center gap-1 hover:text-gray-200 transition-colors"
                        title={namesOpen ? t('metaTable.hideNames') : t('metaTable.showNames')}
                      >
                        <ChevronRight
                          className="w-3 h-3 shrink-0 transition-transform duration-200"
                          style={{ transform: namesOpen ? 'rotate(180deg)' : 'none' }}
                          aria-hidden="true"
                        />
                        <span>{namesOpen ? t('metaTable.hide') : t('metaTable.names')}</span>
                      </button>
                    </th>
                    <TH
                      label={t('metaTable.headers.share')}
                      sortK="frequencyPct"
                      right={false}
                      sortKey={sortKey}
                      asc={asc}
                      onSort={handleSort}
                    />
                    <TH
                      label={t('metaTable.headers.players')}
                      sortK="playerCount"
                      sortKey={sortKey}
                      asc={asc}
                      onSort={handleSort}
                    />
                    <th className="px-3 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">
                      {t('metaTable.headers.record')}
                    </th>
                    <TH
                      label={t('metaTable.headers.winPct')}
                      sortK="winRatePct"
                      sortKey={sortKey}
                      asc={asc}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((snap, i) => (
                    <tr
                      key={snap.archetype}
                      className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors"
                    >
                      <td className="px-3 py-2 text-gray-600 text-xs tabular-nums">{i + 1}</td>
                      <td className="py-2 px-2 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <div className="shrink-0 flex items-center" style={{ width: ICON_BOX }}>
                            <PokemonIcon
                              archetype={snap.archetype}
                              size="sm"
                              dual
                              reserveSecondary
                            />
                          </div>
                          {namesOpen && (
                            <span className="text-xs font-medium text-gray-100 truncate leading-tight min-w-0">
                              {snap.archetype}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ShareBar pct={snap.frequencyPct} max={maxFreq} />
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400 tabular-nums text-xs">
                        {snap.playerCount ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 font-mono text-xs">
                        {snap.wins != null && snap.losses != null
                          ? `${snap.wins}-${snap.losses}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <WinRateBadge pct={snap.winRatePct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fade gradient when collapsed and more rows exist */}
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
                  aria-hidden="true"
                />
                {expanded
                  ? t('metaTable.showTop', { count: PAGE_SIZE })
                  : t('metaTable.showAll', { count: sorted.length })}
              </button>
              <span className="text-xs text-gray-600">
                {expanded ? sorted.length : Math.min(PAGE_SIZE, sorted.length)} / {sorted.length}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Recent tournaments ───────────────────────────────────────────────────────

function TournamentCard({ t }: { t: RecentTournament }) {
  // Aliased to avoid clashing with the `t` prop (the tournament object)
  const { t: tMeta } = useTranslation('meta');
  const date = new Date(t.date);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate">{t.name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              {tMeta('tournaments.players', { count: t.players })}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {daysAgo === 0
                ? tMeta('tournaments.today')
                : daysAgo === 1
                  ? tMeta('tournaments.yesterday')
                  : tMeta('tournaments.daysAgo', { count: daysAgo })}
            </span>
          </div>
        </div>
        <a
          href={`https://play.limitlesstcg.com/tournament/${t.id}/standings`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={tMeta('tournaments.openStandings')}
          className="text-gray-600 hover:text-brand-400 transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>

      {t.topArchetypes.length > 0 && (
        <div className="space-y-1">
          {t.topArchetypes.map((arch, i) => {
            // The trophy marks the actual 1st-place deck (winner), wherever it sits
            // in the by-count list — not simply the most-played archetype.
            const isWinner = t.winnerArchetype !== null && arch.name === t.winnerArchetype;
            return (
              <div key={arch.name} className="flex items-center gap-2">
                {isWinner ? (
                  <Trophy className="w-3 h-3 text-yellow-500 shrink-0" />
                ) : (
                  <span className="w-3 h-3 text-center text-xs text-gray-600 shrink-0">
                    {i + 1}
                  </span>
                )}
                <PokemonIcon archetype={arch.name} size="sm" dual />
                <span className="flex-1 text-xs text-gray-300 truncate">{arch.name}</span>
                <span className="text-xs text-gray-500">
                  {tMeta('tournaments.timesPlayed', { count: arch.count })}
                </span>
                <WinRateBadge pct={arch.winRate} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecentTournaments() {
  const { t } = useTranslation('meta');
  const { recentTournaments, isFetchingTournaments, tournamentsError, loadRecentTournaments } =
    useDashboardStore();
  const [days, setDays] = useState(7);
  const [minPlayers, setMinPlayers] = useState(30);
  const [onlineOnly, setOnlineOnly] = useState(true);

  const handleFetch = () => loadRecentTournaments({ days, minPlayers, onlineOnly });

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="card-header mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-400" />
          {t('tournaments.title')}
        </h3>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('tournaments.pastDays')}</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value={3}>3</option>
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t('tournaments.minPlayers')}
            </label>
            <select
              value={minPlayers}
              onChange={(e) => setMinPlayers(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
            >
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlineOnly}
              onChange={(e) => setOnlineOnly(e.target.checked)}
              className="rounded accent-brand-500"
            />
            <span className="text-xs text-gray-400">{t('tournaments.onlineOnly')}</span>
          </label>
          <button
            onClick={handleFetch}
            disabled={isFetchingTournaments}
            className="btn-primary text-xs ml-auto disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isFetchingTournaments ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isFetchingTournaments ? t('loading', { ns: 'common' }) : t('tournaments.load')}
          </button>
        </div>

        {tournamentsError && (
          <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg text-xs text-red-400 mb-3">
            {tournamentsError}
          </div>
        )}
      </div>

      {recentTournaments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {recentTournaments.map((t) => (
            <TournamentCard key={t.id} t={t} />
          ))}
        </div>
      )}

      {!isFetchingTournaments && recentTournaments.length === 0 && !tournamentsError && (
        <p className="text-center text-gray-600 text-sm py-8">{t('tournaments.emptyHint')}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MetaPage() {
  const { t } = useTranslation('meta');
  const { metaSnapshots } = useDashboardStore();
  const sourceNote = metaSnapshots[0]?.sourceNote;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">{t('page.title')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('page.subtitle')}</p>
      </div>

      <div className="space-y-3">
        <CollapsibleSection
          title={t('page.matchupMatrix')}
          icon={<Grid3X3 className="w-4 h-4 text-brand-400" />}
          defaultOpen
        >
          <MatchupMatrix />
        </CollapsibleSection>

        <CollapsibleSection
          title={
            metaSnapshots.length > 0
              ? t('page.tournamentMetaCount', { count: metaSnapshots.length })
              : t('page.tournamentMeta')
          }
          icon={<TrendingUp className="w-4 h-4 text-brand-400" />}
          rightSlot={sourceNote && <span className="text-xs text-gray-500">{sourceNote}</span>}
          defaultOpen
        >
          <MetaTable snapshots={metaSnapshots} />
        </CollapsibleSection>
      </div>

      <RecentTournaments />
    </div>
  );
}
