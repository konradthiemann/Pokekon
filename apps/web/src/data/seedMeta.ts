import type { MetaSnapshot } from '../types';

// ─── Meta snapshot seed data ──────────────────────────────────────────────────
// Post-rotation Standard meta (2026 rotation, see constants/season.ts).
// Approximate community-aggregate numbers — purely a demo baseline so the
// meta views are not empty before the first live sync, which then becomes
// the newest period and takes over every "latest" view.

/**
 * Marks seeded demo rows so they can be told apart from live-synced data
 * (and cleaned up when the demo baseline changes).
 */
export const SEED_SOURCE_NOTE = 'Demo baseline (seed)';

/**
 * Source-note marker of the pre-rotation demo seed shipped before 2026-06.
 * Rows carrying it contain rotated archetypes under a post-rotation period
 * label, so the period-based season cutoff cannot catch them — they are
 * deleted explicitly at startup (see db/seed.ts).
 */
export const LEGACY_SEED_SOURCE_NOTE = 'Community aggregate';

/** ISO 8601 week label (e.g. "2026-W24") — same algorithm as lib/metaFetch. */
function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

const PERIOD = isoWeekLabel(new Date());

/** name, meta share %, win rate % — all post-rotation archetypes. */
const BASELINE: [string, number, number][] = [
  ['Dragapult Dusknoir', 14, 53],
  ["N's Zoroark", 12, 52],
  ['Raging Bolt Ogerpon', 10, 51],
  ['Grimmsnarl Froslass', 9, 54],
  ["Rocket's Mewtwo", 8, 49],
  ['Starmie Froslass', 7, 50],
  ['Ogerpon Meganium', 6, 52],
  ['Mega Absol Box', 6, 48],
  ["Cynthia's Garchomp", 5, 47],
  ['Mega Lucario', 5, 50],
  ['Flareon Noctowl', 4, 49],
  ['Tera Box', 4, 46],
];

export const SEED_META_SNAPSHOTS: Omit<MetaSnapshot, 'id'>[] = BASELINE.map(
  ([archetype, frequencyPct, winRatePct]) => ({
    archetype,
    frequencyPct,
    winRatePct,
    wins: 0,
    losses: 0,
    playerCount: 0,
    period: PERIOD,
    sourceNote: SEED_SOURCE_NOTE,
  }),
);
