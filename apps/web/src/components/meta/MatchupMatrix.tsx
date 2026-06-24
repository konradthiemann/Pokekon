/**
 * Displays a head-to-head win-rate matrix for the current Standard meta.
 * Data is loaded from /public/matchup-matrix.csv at runtime via fetch().
 * To update: replace public/matchup-matrix.csv with a new TrainerHill export.
 */
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { PokemonIcon } from '../shared/PokemonIcon';

// G-regulation decks rotated out April 10 2026 — exclude from display
const EXCLUDED_SLUGS = new Set(['gardevoir-ex-sv', 'gholdengo-lunatone']);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchupEntry {
  deck1: string;
  deck2: string;
  wins: number;
  losses: number;
  ties: number;
  total: number;
  winRate: number;
}

type MatchupMatrix = Record<string, Record<string, MatchupEntry>>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parses RAW_CSV into typed MatchupEntry objects.
 * Expected format: header row (`deck1,deck2,wins,losses,ties,total,win_rate`)
 * followed by one data row per matchup pair; columns map directly to MatchupEntry
 * fields. Malformed rows (missing columns or non-numeric values) will silently
 * produce 0 for numeric fields rather than throwing — bad data will appear as
 * greyed-out cells due to the MIN_GAMES_FOR_COLOR threshold.
 */
function parseCsv(csv: string): MatchupEntry[] {
  return csv
    .trim()
    .split('\n')
    .slice(1) // skip header
    .filter((line) => line.trim() && line.includes(','))
    .map((line) => {
      const [deck1, deck2, wins, losses, ties, total, win_rate] = line.split(',');
      return {
        deck1,
        deck2,
        wins: Number(wins),
        losses: Number(losses),
        ties: Number(ties),
        total: Number(total),
        winRate: Number(win_rate),
      };
    });
}

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

const MIN_GAMES_FOR_COLOR = 10;

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

export function MatchupMatrix() {
  const { t } = useTranslation('meta');
  const [minGames, setMinGames] = useState<number>(10);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvDate, setCsvDate] = useState('2026-04-17');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchCsv = useCallback(() => {
    fetch('/matchup-matrix.csv')
      .then(async (r) => {
        const lastMod = r.headers.get('Last-Modified');
        if (lastMod) {
          const d = new Date(lastMod);
          if (!isNaN(d.getTime())) setCsvDate(d.toISOString().slice(0, 10));
        }
        return r.text();
      })
      .then((text) => {
        setCsvText(text);
        setLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoading(false);
      });
  }, []);

  const loadCsv = () => {
    setLoading(true);
    setFetchError(false);
    fetchCsv();
  };

  useEffect(() => {
    fetchCsv();
  }, [fetchCsv]);

  const { decks, matrix } = useMemo(() => {
    if (!csvText) return { decks: [], matrix: {} as MatchupMatrix };
    const entries = parseCsv(csvText);
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
  }, [csvText]);

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
        <button onClick={loadCsv} className="btn-ghost text-xs">
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
                    <PokemonIcon archetype={row} size="sm" dual />
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
        <span>{t('matchupMatrix.source', { date: csvDate })}</span>
        <button
          onClick={loadCsv}
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
