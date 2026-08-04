/**
 * Displays a head-to-head win-rate matrix for the current Standard meta.
 * Data comes from GET /api/meta/matchups — REAL online-Bo1 head-to-heads (own
 * data computed from Limitless round pairings) blended with the external
 * TrainerHill matrix as a fallback for pairs the own data doesn't cover with
 * enough games. Scoped to the same day/online window as the metashare.
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { MIN_MATCHUP_GAMES, type MatchupRow } from '@pokekon/shared';
import { getMetaMatchups, type MatchupSource, type MetaWindow } from '../../lib/api';
import { PokemonIcon } from '../shared/PokemonIcon';

// G-regulation decks rotated out April 10 2026 — exclude from display
const EXCLUDED_SLUGS = new Set(['gardevoir-ex-sv', 'gholdengo-lunatone']);

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchupMatrix = Record<string, Record<string, MatchupRow>>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converts a kebab-case slug into a title-cased display name for row/column labels
 * (e.g. "dragapult-ex" → "Dragapult Ex"). Note: `shortName` below is identical
 * in implementation — it was likely intended to return only the first word but
 * was never diverged. Keeping both to avoid breaking call sites.
 */
function formatDeckName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// The same "sample too small" threshold the field-score coverage uses — one
// shared constant so matrix greying and score coverage can never drift apart.
const MIN_GAMES_FOR_COLOR = MIN_MATCHUP_GAMES;

function cellStyle(winRate: number, total: number): string {
  if (total < MIN_GAMES_FOR_COLOR) return 'bg-slate-100 text-slate-400';
  if (winRate >= 70) return 'bg-emerald-700 text-white font-bold';
  if (winRate >= 60) return 'bg-emerald-200 text-emerald-900 font-bold';
  if (winRate >= 55) return 'bg-emerald-100 text-emerald-800';
  if (winRate >= 45) return 'bg-slate-50 text-slate-600';
  if (winRate >= 40) return 'bg-red-100 text-red-800';
  if (winRate >= 30) return 'bg-red-200 text-red-900 font-bold';
  return 'bg-red-700 text-white font-bold';
}

// ─── Component ────────────────────────────────────────────────────────────────

const MIN_GAMES_FILTER_OPTIONS = [1, 10, 20, 50] as const;

export function MatchupMatrix({
  window,
  iconsById,
}: {
  window: MetaWindow;
  iconsById: Record<string, string[]>;
}) {
  const { t } = useTranslation('meta');
  const [minGames, setMinGames] = useState<number>(10);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [entries, setEntries] = useState<MatchupRow[] | null>(null);
  const [source, setSource] = useState<MatchupSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Guards against overlapping requests (e.g. a quick double reload): only the
  // most recently started fetch may write state.
  const [fetchSeq, setFetchSeq] = useState(0);

  const { days, online, bo1 } = window;
  const fetchData = useCallback(() => {
    // No synchronous setState here — the effect calls this directly, and React 19
    // forbids sync state updates in an effect body. Loading/error are flipped in
    // the async resolution (allowed) or by the reload handler (an event).
    let cancelled = false;
    getMetaMatchups({ days, online, bo1 })
      .then((data) => {
        if (cancelled) return;
        setEntries(data.rows);
        setSource(data.matchupSource);
        setFetchError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFetchError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, online, bo1]);

  const loadData = () => {
    setLoading(true);
    setFetchError(false);
    setFetchSeq((n) => n + 1);
  };

  useEffect(() => fetchData(), [fetchData, fetchSeq]);

  const { decks, matrix } = useMemo(() => {
    if (!entries) return { decks: [], matrix: {} as MatchupMatrix };
    const deckSet = new Set<string>();
    entries.forEach((e) => {
      deckSet.add(e.deck1);
      deckSet.add(e.deck2);
    });
    const decks = Array.from(deckSet)
      .filter((d) => !EXCLUDED_SLUGS.has(d))
      .sort();

    const matrix: MatchupMatrix = {};
    decks.forEach((d) => {
      matrix[d] = {};
    });
    entries.forEach((e) => {
      if (EXCLUDED_SLUGS.has(e.deck1) || EXCLUDED_SLUGS.has(e.deck2)) return;
      matrix[e.deck1][e.deck2] = e;
    });

    return { decks, matrix };
  }, [entries]);

  if (loading) {
    return (
      <div className="-m-4 py-16 flex items-center justify-center gap-2 text-slate-500 text-sm font-semibold">
        <RefreshCw className="w-4 h-4 animate-spin" />
        {t('matchupMatrix.loading')}
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="-m-4 py-12 flex flex-col items-center gap-3 text-sm">
        <p className="text-slate-600 font-semibold">{t('matchupMatrix.loadError')}</p>
        <button onClick={loadData} className="btn-ghost text-xs">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {t('retry', { ns: 'common' })}
        </button>
      </div>
    );
  }

  return (
    <div className="-m-4">
      {/* Filter + Legend */}
      <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-3 text-xs text-slate-500 font-semibold">
        <div className="flex items-center gap-2">
          <span>{t('matchupMatrix.minGames')}</span>
          <select
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-brand-500"
          >
            {MIN_GAMES_FILTER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <span className="hidden md:inline">·</span>
        <span>{t('matchupMatrix.perspectiveNote')}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-xs font-bold">
            ≥70%
          </span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 text-xs font-bold">
            60–70%
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold">
            ~50%
          </span>
          <span className="px-1.5 py-0.5 rounded bg-red-200 text-red-900 text-xs font-bold">
            30–40%
          </span>
          <span className="px-1.5 py-0.5 rounded bg-red-700 text-white text-xs font-bold">
            ≤30%
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="text-xs border-collapse"
          style={{ minWidth: `${(labelsOpen ? 160 : 72) + decks.length * 52}px` }}
        >
          {/* Column headers */}
          <thead>
            <tr>
              {/* top-left corner — accordion toggle */}
              <th
                className="sticky left-0 z-20 bg-white border-b border-r border-slate-200 align-bottom"
                style={{
                  minWidth: labelsOpen ? '160px' : '72px',
                  transition: 'min-width 0.2s ease',
                }}
              >
                <div className="px-2 pb-2">
                  <button
                    onClick={() => setLabelsOpen((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-900 transition-colors font-bold"
                    title={
                      labelsOpen ? t('matchupMatrix.collapseNames') : t('matchupMatrix.expandNames')
                    }
                  >
                    <ChevronRight
                      className="w-3 h-3 transition-transform duration-200"
                      style={{ transform: labelsOpen ? 'rotate(180deg)' : 'none' }}
                      aria-hidden="true"
                    />
                    {labelsOpen ? t('matchupMatrix.hide') : t('matchupMatrix.names')}
                  </button>
                </div>
              </th>
              {decks.map((col) => (
                <th
                  key={col}
                  className="border-b border-r border-slate-200 px-0 py-0 align-bottom"
                  style={{ minWidth: '52px' }}
                >
                  <div className="flex items-end justify-center pb-2" style={{ height: '90px' }}>
                    <span
                      className="text-[10px] text-slate-600 font-bold leading-none whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                      title={formatDeckName(col)}
                    >
                      {formatDeckName(col)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {decks.map((row) => (
              <tr
                key={row}
                className="border-b border-slate-100 hover:bg-brand-50/50 transition-colors"
              >
                {/* Row label (sticky) — dual icons + optional name */}
                <td
                  className="sticky left-0 z-10 bg-white border-r border-slate-200 px-2 py-1.5 whitespace-nowrap"
                  style={{
                    minWidth: labelsOpen ? '160px' : '72px',
                    transition: 'min-width 0.2s ease',
                  }}
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <PokemonIcon archetype={row} icons={iconsById[row]} size="sm" dual />
                    {labelsOpen && (
                      <span className="text-xs font-bold text-slate-800 truncate">
                        {formatDeckName(row)}
                      </span>
                    )}
                  </div>
                </td>

                {decks.map((col) => {
                  const entry = matrix[row]?.[col];

                  if (!entry) {
                    return (
                      <td key={col} className="px-1 py-1.5 text-center text-slate-300 bg-slate-50">
                        —
                      </td>
                    );
                  }

                  const isDiagonal = row === col;
                  const hasData = entry.total >= minGames;

                  if (!hasData) {
                    return (
                      <td
                        key={col}
                        className="px-1 py-1.5 text-center text-slate-300 bg-slate-50"
                        title={t('matchupMatrix.gamesTooltip', { count: entry.total })}
                      >
                        <div className="text-[10px]">
                          {t('matchupMatrix.gamesShort', { count: entry.total })}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={col}
                      className={`px-1 py-1.5 text-center ${cellStyle(entry.winRate, entry.total)} ${isDiagonal ? 'opacity-60' : ''}`}
                      title={t('matchupMatrix.cellTooltip', {
                        row: formatDeckName(row),
                        col: formatDeckName(col),
                        winRate: entry.winRate,
                        wins: entry.wins,
                        losses: entry.losses,
                        ties: entry.ties,
                      })}
                    >
                      <div className="font-mono text-xs font-semibold leading-none whitespace-nowrap">
                        {entry.winRate.toFixed(1)}%
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 text-xs text-slate-500 font-semibold border-t border-slate-200 flex items-center gap-3">
        <span>
          {source && source.ownGames > 0
            ? t('matchupMatrix.sourceBlend', {
                ownGames: source.ownGames,
                ownPairs: source.ownPairs,
                fallback: source.fallbackPairs,
              })
            : t('matchupMatrix.source', {
                date: source?.trainerHillImportedAt?.slice(0, 10) ?? '—',
              })}
        </span>
        <button
          onClick={loadData}
          className="ml-auto text-slate-400 hover:text-brand-700 transition-colors"
          title={t('matchupMatrix.reload')}
          aria-label={t('matchupMatrix.reload')}
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
