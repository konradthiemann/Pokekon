/**
 * Displays a head-to-head win-rate matrix for the current Standard meta.
 * Data is loaded from /public/matchup-matrix.csv at runtime via fetch().
 * To update: replace public/matchup-matrix.csv with a new TrainerHill export.
 */
import { useMemo, useState, useEffect } from 'react';
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
  return csv.trim()
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
  if (total < MIN_GAMES_FOR_COLOR) return 'bg-gray-800/30 text-gray-500';
  if (winRate >= 70) return 'bg-emerald-950 text-emerald-300 font-semibold';
  if (winRate >= 60) return 'bg-emerald-900/50 text-emerald-400';
  if (winRate >= 55) return 'bg-emerald-900/30 text-emerald-500';
  if (winRate >= 45) return 'bg-gray-800/20 text-gray-300';
  if (winRate >= 40) return 'bg-red-900/30 text-red-400';
  if (winRate >= 30) return 'bg-red-900/50 text-red-400';
  return 'bg-red-950 text-red-300 font-semibold';
}

// ─── Component ────────────────────────────────────────────────────────────────

const MIN_GAMES_FILTER_OPTIONS = [1, 10, 20, 50] as const;

export function MatchupMatrix() {
  const [minGames, setMinGames] = useState<number>(10);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvDate, setCsvDate] = useState('2026-04-17');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const loadCsv = () => {
    setLoading(true);
    setFetchError(false);
    fetch('/matchup-matrix.csv')
      .then(async (r) => {
        const lastMod = r.headers.get('Last-Modified');
        if (lastMod) {
          const d = new Date(lastMod);
          if (!isNaN(d.getTime())) setCsvDate(d.toISOString().slice(0, 10));
        }
        return r.text();
      })
      .then((text) => { setCsvText(text); setLoading(false); })
      .catch(() => { setFetchError(true); setLoading(false); });
  };

  useEffect(() => { loadCsv(); }, []);

  const { decks, matrix } = useMemo(() => {
    if (!csvText) return { decks: [], matrix: {} as MatchupMatrix };
    const entries = parseCsv(csvText);
    const deckSet = new Set<string>();
    entries.forEach((e) => { deckSet.add(e.deck1); deckSet.add(e.deck2); });
    const decks = Array.from(deckSet).filter((d) => !EXCLUDED_SLUGS.has(d)).sort();

    const matrix: MatchupMatrix = {};
    decks.forEach((d) => { matrix[d] = {}; });
    entries.forEach((e) => {
      if (EXCLUDED_SLUGS.has(e.deck1) || EXCLUDED_SLUGS.has(e.deck2)) return;
      matrix[e.deck1][e.deck2] = e;
    });

    return { decks, matrix };
  }, [csvText]);

  if (loading) {
    return (
      <div className="-m-4 py-16 flex items-center justify-center gap-2 text-gray-500 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Lade Matchup-Daten…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="-m-4 py-12 flex flex-col items-center gap-3 text-sm">
        <p className="text-gray-400">Matchup-Daten konnten nicht geladen werden.</p>
        <button onClick={loadCsv} className="btn-ghost text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="-m-4">
      {/* Filter + Legend */}
      <div className="px-4 py-2 border-b border-gray-800 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>Min. games</span>
          <select
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-500"
          >
            {MIN_GAMES_FILTER_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <span className="hidden md:inline">·</span>
        <span>Win rate from row deck's perspective.</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 text-xs">≥70%</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400 text-xs">60–70%</span>
          <span className="px-1.5 py-0.5 rounded bg-gray-800/40 text-gray-300 text-xs">~50%</span>
          <span className="px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 text-xs">30–40%</span>
          <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 text-xs">≤30%</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: `${(labelsOpen ? 160 : 72) + decks.length * 52}px` }}>
          {/* Column headers */}
          <thead>
            <tr>
              {/* top-left corner — accordion toggle */}
              <th
                className="sticky left-0 z-20 bg-gray-900 border-b border-r border-gray-800 align-bottom"
                style={{ minWidth: labelsOpen ? '160px' : '72px', transition: 'min-width 0.2s ease' }}
              >
                <div className="px-2 pb-2">
                  <button
                    onClick={() => setLabelsOpen((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-200 transition-colors"
                    title={labelsOpen ? 'Collapse deck names' : 'Expand deck names'}
                  >
                    <ChevronRight
                      className="w-3 h-3 transition-transform duration-200"
                      style={{ transform: labelsOpen ? 'rotate(180deg)' : 'none' }}
                    />
                    {labelsOpen ? 'Hide' : 'Names'}
                  </button>
                </div>
              </th>
              {decks.map((col) => (
                <th
                  key={col}
                  className="border-b border-r border-gray-800 px-0 py-0 align-bottom"
                  style={{ minWidth: '52px' }}
                >
                  <div className="flex items-end justify-center pb-2" style={{ height: '90px' }}>
                    <span
                      className="text-[10px] text-gray-400 font-medium leading-none whitespace-nowrap"
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
              <tr key={row} className="border-b border-gray-800/40 hover:bg-gray-800/10 transition-colors">
                {/* Row label (sticky) — dual icons + optional name */}
                <td
                  className="sticky left-0 z-10 bg-gray-900 border-r border-gray-800 px-2 py-1.5 whitespace-nowrap"
                  style={{ minWidth: labelsOpen ? '160px' : '72px', transition: 'min-width 0.2s ease' }}
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <PokemonIcon archetype={row} size="sm" dual />
                    {labelsOpen && (
                      <span className="text-xs font-medium text-gray-200 truncate">{formatDeckName(row)}</span>
                    )}
                  </div>
                </td>

                {decks.map((col) => {
                  const entry = matrix[row]?.[col];

                  if (!entry) {
                    return (
                      <td key={col} className="px-1 py-1.5 text-center text-gray-700 bg-gray-900/50">
                        —
                      </td>
                    );
                  }

                  const isDiagonal = row === col;
                  const hasData = entry.total >= minGames;

                  if (!hasData) {
                    return (
                      <td key={col} className="px-1 py-1.5 text-center text-gray-700 bg-gray-900/50" title={`${entry.total} games`}>
                        <div className="text-[10px]">{entry.total}g</div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={col}
                      className={`px-1 py-1.5 text-center ${cellStyle(entry.winRate, entry.total)} ${isDiagonal ? 'opacity-60' : ''}`}
                      title={`${formatDeckName(row)} vs ${formatDeckName(col)}: ${entry.winRate}% · ${entry.wins}W-${entry.losses}L-${entry.ties}T`}
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

      <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-800 flex items-center gap-3">
        <span>Source: TrainerHill.com · {csvDate} · Cells show win rate from row deck's perspective</span>
        <button onClick={loadCsv} className="ml-auto text-gray-600 hover:text-brand-400 transition-colors" title="Daten neu laden">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
