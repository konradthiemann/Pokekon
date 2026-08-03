// Strict parser for the TrainerHill matchup-matrix CSV export, shared by the
// API import job/route (producer of matchup_matrix rows) and its tests. The
// deck slugs in the export match Limitless deck ids (e.g. "n-zoroark"), which
// is what makes the meta-weighted field analysis joinable.

import { ARCHETYPE_SLUG_PATTERN } from './meta.js';

/** One directed matchup row; `winRate` is from deck1's perspective, 0–100. */
export interface MatchupRow {
  deck1: string;
  deck2: string;
  wins: number;
  losses: number;
  ties: number;
  total: number;
  winRate: number;
}

const EXPECTED_HEADER = 'deck1,deck2,wins,losses,ties,total,win_rate';

function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

/**
 * Parse and validate a matchup CSV. Rows that fail validation (wrong column
 * count, non-slug deck names, non-numeric or out-of-range values) are skipped
 * and counted rather than aborting the import — TrainerHill exports are hand-
 * curated files and a single stray line should not block the rest. A repeated
 * (deck1, deck2) pair keeps the last occurrence and counts the earlier one as
 * skipped, so a batch can never contain the same directed pair twice.
 *
 * Throws only when the header row is missing or wrong, because that means the
 * file is not a matchup export at all.
 */
export function parseMatchupCsv(csv: string): { rows: MatchupRow[]; skipped: number } {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0]?.trim().toLowerCase();
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Unexpected CSV header — expected "${EXPECTED_HEADER}"`);
  }

  const byPair = new Map<string, MatchupRow>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue;
    const cols = line.split(',').map((c) => c.trim());
    const [deck1, deck2] = [cols[0]?.toLowerCase() ?? '', cols[1]?.toLowerCase() ?? ''];
    const wins = parseCount(cols[2]);
    const losses = parseCount(cols[3]);
    const ties = parseCount(cols[4]);
    const total = parseCount(cols[5]);
    const winRate = cols[6] === undefined ? null : Number(cols[6]);

    const valid =
      cols.length === 7 &&
      ARCHETYPE_SLUG_PATTERN.test(deck1) &&
      ARCHETYPE_SLUG_PATTERN.test(deck2) &&
      wins !== null &&
      losses !== null &&
      ties !== null &&
      total !== null &&
      winRate !== null &&
      Number.isFinite(winRate) &&
      winRate >= 0 &&
      winRate <= 100;

    if (!valid) {
      skipped++;
      continue;
    }
    const key = `${deck1}|${deck2}`;
    if (byPair.has(key)) skipped++;
    byPair.set(key, { deck1, deck2, wins, losses, ties, total, winRate });
  }

  return { rows: [...byPair.values()], skipped };
}
