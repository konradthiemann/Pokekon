import { useEffect, useState } from 'react';
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
  Globe,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';
import type { RecentTournament } from '../types';
import {
  getFieldAnalysis,
  type FieldAnalysis,
  type FieldAnalysisArchetype,
  type MetaWindow,
} from '../lib/api';
import { ArchetypeDetail } from '../components/meta/ArchetypeDetail';
import { MetaWindowControl } from '../components/meta/MetaWindowControl';
import { META_DEFAULT_DAYS } from '../components/meta/metaWindow';
import { PredictionPanel } from '../components/meta/PredictionPanel';
import { MatchupMatrix } from '../components/meta/MatchupMatrix';
import { WinRateBadge } from '../components/meta/WinRateBadge';
import { CollapsibleSection } from '../components/layout/CollapsibleSection';
import { PokemonIcon } from '../components/shared/PokemonIcon';

// ─── Meta table ───────────────────────────────────────────────────────────────

type SortKey = 'sharePct' | 'winRatePct' | 'playerCount' | 'fieldScore';

/** A selected archetype (drilldown target) — requires the Limitless slug. */
export interface ArchetypeSelection {
  archetypeId: string;
  archetypeName: string;
}

function ShareBar({ pct, max }: { pct: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
        <div
          className="h-full bg-brand-500 rounded-full"
          style={{ width: `${Math.min((pct / max) * 100, 100)}%` }}
        />
      </div>
      <span className="text-xs text-slate-700 tabular-nums w-10 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return <Minus className="w-3 h-3 text-slate-400" aria-hidden="true" />;
  return asc ? (
    <ChevronUp className="w-3 h-3 text-brand-700" aria-hidden="true" />
  ) : (
    <ChevronDown className="w-3 h-3 text-brand-700" aria-hidden="true" />
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
      className={`px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${sortK ? 'cursor-pointer hover:text-slate-900 select-none' : ''}`}
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

function MetaTable({
  archetypes,
  onSelect,
}: {
  archetypes: FieldAnalysisArchetype[];
  onSelect: (selection: ArchetypeSelection) => void;
}) {
  const { t } = useTranslation('meta');
  const [sortKey, setSortKey] = useState<SortKey>('sharePct');
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

  const valueOf = (a: FieldAnalysisArchetype): number | null =>
    sortKey === 'fieldScore' ? a.fieldWinRatePct : a[sortKey];

  const sorted = [...archetypes].sort((a, b) => {
    // Missing values (no matchup data / no decided games) sort to the end, not as 0.
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return asc ? va - vb : vb - va;
  });

  const visible = expanded ? sorted : sorted.slice(0, PAGE_SIZE);
  const hasMore = sorted.length > PAGE_SIZE;
  const maxShare = Math.max(...archetypes.map((a) => a.sharePct), 1);

  // ICON_BOX: fixed px width for the icon area so every row aligns regardless
  // of whether the archetype has 1 or 2 sprites (24px each + 2px gap = 50px, pad to 54).
  const ICON_BOX = 54;
  // Deck column: icon box only when collapsed, icon box + name when open
  const deckColW = namesOpen ? ICON_BOX + 172 : ICON_BOX + 10;

  return (
    <div className="-m-4">
      {sorted.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">{t('metaTable.empty')}</div>
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
                  <col style={{ width: 88 }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100">
                    <th className="px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-left">
                      #
                    </th>
                    {/* Accordion header — same pattern as MatchupMatrix */}
                    <th className="py-3 px-2 text-xs font-semibold text-slate-600 uppercase tracking-wider text-left">
                      <button
                        onClick={() => setNamesOpen((v) => !v)}
                        className="flex items-center gap-1 hover:text-slate-900 transition-colors"
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
                      sortK="sharePct"
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
                    <th className="px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">
                      {t('metaTable.headers.record')}
                    </th>
                    <TH
                      label={t('metaTable.headers.winPct')}
                      sortK="winRatePct"
                      sortKey={sortKey}
                      asc={asc}
                      onSort={handleSort}
                    />
                    <th
                      className="px-3 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right whitespace-nowrap cursor-pointer hover:text-slate-900 select-none"
                      onClick={() => handleSort('fieldScore')}
                      title={t('metaTable.fieldScoreHint')}
                    >
                      <span className="flex items-center gap-1 justify-end">
                        {t('metaTable.headers.fieldScore')}
                        <SortIcon active={sortKey === 'fieldScore'} asc={asc} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a, i) => (
                    <tr
                      key={a.archetypeId}
                      className="border-b border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() =>
                        onSelect({ archetypeId: a.archetypeId, archetypeName: a.archetypeName })
                      }
                      title={t('metaTable.clickHint')}
                    >
                      <td className="px-3 py-2 text-slate-400 text-xs tabular-nums">{i + 1}</td>
                      <td className="py-2 px-2 overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <div className="shrink-0 flex items-center" style={{ width: ICON_BOX }}>
                            <PokemonIcon
                              archetype={a.archetypeName}
                              icons={a.icons}
                              size="sm"
                              dual
                              reserveSecondary
                            />
                          </div>
                          {namesOpen && (
                            <span className="text-xs font-medium text-slate-800 truncate leading-tight min-w-0">
                              {a.archetypeName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ShareBar pct={a.sharePct} max={maxShare} />
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600 tabular-nums text-xs">
                        {a.playerCount}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-500 font-mono text-xs">
                        {a.wins}-{a.losses}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <WinRateBadge pct={a.winRatePct} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {a.fieldWinRatePct !== null ? (
                          <>
                            <WinRateBadge pct={Math.round(a.fieldWinRatePct * 10) / 10} />
                            <span className="text-[10px] font-bold text-brand-700 ml-1">
                              #{a.rank}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fade gradient when collapsed and more rows exist */}
            {!expanded && hasMore && (
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
            )}
          </div>

          {hasMore && (
            <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-brand-700 hover:text-brand-800 transition-colors font-medium flex items-center gap-1"
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
              <span className="text-xs text-slate-500">
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
          <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Users className="w-3 h-3" />
              {tMeta('tournaments.players', { count: t.players })}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
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
          className="text-slate-400 hover:text-brand-700 transition-colors shrink-0"
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
                  <Trophy className="w-3 h-3 text-amber-700 shrink-0" />
                ) : (
                  <span className="w-3 h-3 text-center text-xs text-slate-400 shrink-0">
                    {i + 1}
                  </span>
                )}
                <PokemonIcon archetype={arch.name} size="sm" dual />
                <span className="flex-1 text-xs text-slate-700 truncate">{arch.name}</span>
                <span className="text-xs text-slate-500">
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
          <Calendar className="w-4 h-4 text-brand-700" />
          {t('tournaments.title')}
        </h3>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t('tournaments.pastDays')}</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="input px-3 py-1.5 text-sm"
            >
              <option value={3}>3</option>
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              {t('tournaments.minPlayers')}
            </label>
            <select
              value={minPlayers}
              onChange={(e) => setMinPlayers(Number(e.target.value))}
              className="input px-3 py-1.5 text-sm"
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
            <span className="text-xs text-slate-600">{t('tournaments.onlineOnly')}</span>
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 mb-3">
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
        <p className="text-center text-slate-500 text-sm py-8">{t('tournaments.emptyHint')}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MetaPage() {
  const { t } = useTranslation('meta');
  const { syncMeta, isSyncing, syncProgress, syncError, lastSynced } = useDashboardStore();
  const [selected, setSelected] = useState<ArchetypeSelection | null>(null);

  // Meta window (days back + online Bo1-Swiss scope). Drives BOTH the overview
  // field analysis and the drilldown, so the whole tab reflects one window. The
  // online + bo1 flags move together — the local-Bo1 proxy is the whole point.
  const [days, setDays] = useState<number>(META_DEFAULT_DAYS);
  const [onlineBo1, setOnlineBo1] = useState(true);
  const metaWindow: MetaWindow = { days, online: onlineBo1, bo1: onlineBo1 };

  // The overview table IS the day-window field analysis (share, win rate, record
  // and meta-weighted field score per archetype), so the day/online controls
  // genuinely drive the metashare. The result is tagged with the request key it
  // answers (window + last sync) so switching windows shows a loading state
  // rather than stale data — and no setState runs synchronously in the effect.
  const [loaded, setLoaded] = useState<{ key: string; data: FieldAnalysis } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${days}|${onlineBo1}|${lastSynced?.getTime() ?? 0}`;
    getFieldAnalysis({ days, online: onlineBo1, bo1: onlineBo1 })
      .then((res) => {
        if (!cancelled) setLoaded({ key, data: res });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [days, onlineBo1, lastSynced]);

  const requestKey = `${days}|${onlineBo1}|${lastSynced?.getTime() ?? 0}`;
  const fieldAnalysis = loaded?.key === requestKey ? loaded.data : null;
  const fieldError = failedKey === requestKey;
  const isLoadingField = fieldAnalysis === null && !fieldError;

  // The "Sync Live Meta" action also lives in the desktop sidebar, but that is
  // hidden on mobile (`md:flex`) — so the meta page carries its own copy,
  // making the page self-sufficient on every viewport. Errors surface via the
  // store's syncError; the throw is swallowed here.
  const handleSync = async () => {
    try {
      await syncMeta();
    } catch {
      /* error is shown via the store's syncError */
    }
  };

  if (selected) {
    return (
      <ArchetypeDetail
        archetypeId={selected.archetypeId}
        archetypeName={selected.archetypeName}
        window={metaWindow}
        onDaysChange={setDays}
        onOnlineBo1Change={setOnlineBo1}
        onBack={() => setSelected(null)}
      />
    );
  }

  const archetypes = fieldAnalysis?.archetypes ?? [];
  // Data-driven archetype icons (Limitless deck.icons), keyed by slug — shared
  // with the matchup matrix so every deck renders the icons the source publishes.
  // `icons` is additive: an API that predates it (rollout window) or legacy
  // snapshot rows omit it, so guard with optional chaining — never crash the tab.
  const iconsById: Record<string, string[]> = {};
  for (const a of archetypes) if (a.icons?.length) iconsById[a.archetypeId] = a.icons;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {t('page.title')}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{t('page.subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="btn-primary text-xs disabled:opacity-60"
          >
            <Globe
              className={`w-3.5 h-3.5 ${isSyncing ? 'animate-pulse' : ''}`}
              aria-hidden="true"
            />
            {isSyncing
              ? t('sidebar.syncing', { ns: 'layout' })
              : t('sidebar.syncLiveMeta', { ns: 'layout' })}
          </button>
          {!isSyncing && lastSynced && (
            <span className="text-[11px] text-slate-500">
              {t('sidebar.syncedAt', { ns: 'layout', time: lastSynced.toLocaleTimeString() })}
            </span>
          )}
        </div>
      </div>

      {isSyncing && syncProgress && (
        <p className="-mt-3 truncate text-xs text-slate-500" title={syncProgress}>
          {syncProgress}
        </p>
      )}
      {!isSyncing && syncError && (
        <div className="-mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="break-words">{syncError}</span>
        </div>
      )}

      {/* Window control (days + online-Bo1 scope) + sample-size readout */}
      <div className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
        <MetaWindowControl
          window={metaWindow}
          onDaysChange={setDays}
          onOnlineBo1Change={setOnlineBo1}
        />
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {isLoadingField && <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />}
          {fieldAnalysis
            ? t('window.sample', {
                tournaments: fieldAnalysis.tournamentCount,
                players: fieldAnalysis.totalPlayers,
              })
            : isLoadingField
              ? t('window.loading')
              : t('window.noData')}
        </span>
      </div>
      <p className="-mt-4 text-[11px] leading-snug text-slate-400">
        {onlineBo1 ? t('window.scopeOnline') : t('window.scopeAll')}
      </p>

      <div className="space-y-3">
        <CollapsibleSection
          title={t('page.matchupMatrix')}
          icon={<Grid3X3 className="w-4 h-4 text-brand-700" />}
          defaultOpen
        >
          <MatchupMatrix window={metaWindow} iconsById={iconsById} />
        </CollapsibleSection>

        <CollapsibleSection
          title={
            archetypes.length > 0
              ? t('page.tournamentMetaCount', { count: archetypes.length })
              : t('page.tournamentMeta')
          }
          icon={<TrendingUp className="w-4 h-4 text-brand-700" />}
          defaultOpen
        >
          {fieldError ? (
            <div className="-m-4 py-16 text-center text-sm text-slate-500">
              {t('metaTable.loadError')}
            </div>
          ) : isLoadingField && archetypes.length === 0 ? (
            <div className="-m-4 flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('metaTable.loading')}
            </div>
          ) : (
            <MetaTable archetypes={archetypes} onSelect={setSelected} />
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title={t('prediction.title')}
          icon={<FlaskConical className="w-4 h-4 text-brand-700" />}
          defaultOpen
        >
          <PredictionPanel archetypes={archetypes} window={metaWindow} />
        </CollapsibleSection>
      </div>

      <RecentTournaments />
    </div>
  );
}
