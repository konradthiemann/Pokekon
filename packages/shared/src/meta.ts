// Pure tournament-meta aggregation, shared by the server sync job (producer) and
// the web meta views (consumer contract). No I/O here — callers fetch standings.

/** A tournament standing row, as far as meta aggregation cares. */
export interface StandingLite {
  deck?: { id: string; name: string };
  record?: { wins: number; losses: number; ties?: number };
}

/** One card entry of a published tournament decklist (Limitless shape, pruned). */
export interface DecklistCardEntry {
  name: string;
  count: number;
  set?: string;
  number?: string;
}

/** A published 60-card tournament decklist, grouped the way Limitless serves it. */
export interface TournamentDecklist {
  pokemon: DecklistCardEntry[];
  trainer: DecklistCardEntry[];
  energy: DecklistCardEntry[];
}

/** Upper bounds for pruned decklists — a legal list has 60 cards, so anything
 *  beyond these caps is malformed or hostile input, not data. */
const MAX_ENTRIES_PER_GROUP = 60;
const MAX_NAME_LENGTH = 200;
const MAX_SET_LENGTH = 40;

/**
 * Reduce an untrusted decklist payload (external API response) to the known
 * `TournamentDecklist` shape. Unknown fields are dropped, strings are length-
 * capped and counts clamped to 1–60, so hostile or malformed payloads cannot
 * smuggle arbitrary blobs into the database. Returns null when nothing usable
 * remains — callers store that as "no list published".
 */
export function pruneDecklist(raw: unknown): TournamentDecklist | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const groups = ['pokemon', 'trainer', 'energy'] as const;
  const result: TournamentDecklist = { pokemon: [], trainer: [], energy: [] };
  let totalCards = 0;

  for (const group of groups) {
    const entries = (raw as Record<string, unknown>)[group];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries.slice(0, MAX_ENTRIES_PER_GROUP)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, count, set, number } = entry as Record<string, unknown>;
      if (typeof name !== 'string' || name.trim() === '') continue;
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) continue;

      const card: DecklistCardEntry = {
        name: name.slice(0, MAX_NAME_LENGTH),
        count: Math.min(Math.trunc(count), 60),
      };
      if (typeof set === 'string' && set !== '') card.set = set.slice(0, MAX_SET_LENGTH);
      if (typeof number === 'string' && number !== '') {
        card.number = number.slice(0, MAX_SET_LENGTH);
      } else if (typeof number === 'number' && Number.isFinite(number)) {
        card.number = String(number);
      }
      result[group].push(card);
      totalCards += card.count;
    }
  }

  return totalCards > 0 ? result : null;
}

/** One aggregated archetype row for a period (the insert/wire shape, sans id). */
export interface MetaSnapshotData {
  archetype: string;
  /** Limitless deck id (slug, e.g. "n-zoroark"); "other" for unidentified decks. */
  archetypeId: string;
  frequencyPct: number; // 0–100, one decimal
  winRatePct: number | null; // 0–100, null when no decisive games
  wins: number;
  losses: number;
  playerCount: number;
  period: string; // ISO week, e.g. "2026-W15"
  sourceNote: string;
}

/** Bucket for players whose deck Limitless did not identify (or whose deck id
 *  failed slug normalisation). Not a playable archetype: it is counted in the
 *  field shares but never ranked, listed or clickable in the drilldown. */
export const OTHER_ARCHETYPE_ID = 'other';

/** The only accepted shape for Limitless deck ids (kebab-case slug, ≤80 chars).
 *  Shared by the CSV import, the route param validation and the ingest
 *  normalisation so the three can never drift apart. */
export const ARCHETYPE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * Normalise an untrusted Limitless deck id to a safe slug. Anything that is
 * not a plain kebab-case slug collapses to 'other' — the same bucket used for
 * players without a detected deck. Keeping this in one place guarantees that
 * meta_snapshots.archetype_id and tournament_standings.archetype_id can never
 * diverge (they are join keys for the drilldown).
 */
export function normalizeArchetypeId(id: string | undefined | null): string {
  if (typeof id !== 'string' || id === '') return OTHER_ARCHETYPE_ID;
  const slug = id.toLowerCase().slice(0, 80);
  return ARCHETYPE_SLUG_PATTERN.test(slug) ? slug : OTHER_ARCHETYPE_ID;
}

/**
 * Heuristic: does a tournament name suggest an online-only event? The Limitless
 * API has no platform field, so this checks for terms like "online", "ptcgl",
 * "weekly", and "webcam". Edge cases will be mis-classified (e.g. an in-person
 * "Online Qualifier") — treat results as approximate filtering only.
 */
export function isLikelyOnlineName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes('online') ||
    n.includes(' live') ||
    n.includes('ptcgl') ||
    n.includes('ptcgo') ||
    n.includes('code') || // prize codes = online
    n.includes('weekly') ||
    n.includes('webcam')
  );
}

/** Swiss-phase match format of a tournament (BO1 for most online events). The
 *  single source of truth for the mode enum — apps/api's schema imports these
 *  values for the swiss_mode column, so the DB enum and this type can't drift. */
export const SWISS_MODE_VALUES = ['BO1', 'BO3', 'OTHER'] as const;
export type SwissMode = (typeof SWISS_MODE_VALUES)[number];

/** Ground-truth classification of a tournament, from the Limitless `/details`
 *  endpoint. The tournament LIST endpoint does not carry these fields, so this
 *  is the only reliable way to tell an online Bo1-Swiss event from an in-person
 *  Bo3 one (the name heuristic in `isLikelyOnlineName` is a lossy fallback). */
export interface TournamentClassification {
  isOnline: boolean;
  platform: string | null;
  /** Mode of the Swiss phase; null when no phase data is present. */
  swissMode: SwissMode | null;
}

const MAX_PLATFORM_LENGTH = 40;
/** A real tournament has a handful of phases; more (or a huge type string) is a
 *  malformed or hostile response, so cap both before any string work. */
const MAX_PHASES = 20;
const MAX_PHASE_TYPE_LENGTH = 100;

function normalizeSwissMode(raw: unknown): SwissMode | null {
  if (typeof raw !== 'string') return null;
  // Slice before trim/upper so a pathological multi-MB string can't blow up.
  const mode = raw.slice(0, 20).trim().toUpperCase();
  if (mode === '') return null;
  if (mode === 'BO1') return 'BO1';
  if (mode === 'BO3') return 'BO3';
  return 'OTHER';
}

/**
 * Classify an untrusted Limitless `/details` payload into
 * `{ isOnline, platform, swissMode }`. Reads the real `isOnline` boolean, the
 * `platform` string and the `mode` of the Swiss phase (the phase explicitly
 * typed `SWISS`, else the first phase — the online norm is Swiss first, a
 * single-elimination top cut second). Defensive against hostile/malformed
 * responses: unknown shapes collapse to `{ isOnline:false, platform:null,
 * swissMode:null }`, strings are length-capped, so a bad payload can neither
 * bloat the database nor smuggle an unexpected value into the meta reads.
 */
export function classifyTournamentDetails(raw: unknown): TournamentClassification {
  const empty: TournamentClassification = { isOnline: false, platform: null, swissMode: null };
  if (typeof raw !== 'object' || raw === null) return empty;
  const obj = raw as Record<string, unknown>;

  const isOnline = obj.isOnline === true;

  let platform: string | null = null;
  if (typeof obj.platform === 'string' && obj.platform.trim() !== '') {
    platform = obj.platform.slice(0, MAX_PLATFORM_LENGTH);
  }

  let swissMode: SwissMode | null = null;
  if (Array.isArray(obj.phases)) {
    const phases = obj.phases
      .slice(0, MAX_PHASES)
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null);
    const isSwiss = (p: Record<string, unknown>): boolean =>
      typeof p.type === 'string' &&
      p.type.length <= MAX_PHASE_TYPE_LENGTH &&
      p.type.toUpperCase().includes('SWISS');
    const swissPhase = phases.find(isSwiss) ?? phases[0];
    if (swissPhase) swissMode = normalizeSwissMode(swissPhase.mode);
  }

  return { isOnline, platform, swissMode };
}

/** Summary of a meta sync run. */
export interface MetaSyncResult {
  archetypes: number;
  tournaments: number;
  totalPlayers: number;
  period: string;
}

/**
 * Aggregate per-tournament standings into archetype meta snapshots for one period.
 * Archetypes with fewer than `minPlayerCount` pilots are dropped as noise. Win rate
 * is wins/(wins+losses) (ties excluded), null when no decisive games. Frequency is
 * the archetype's share of all counted players.
 */
export function computeMetaSnapshots(
  tournaments: StandingLite[][],
  period: string,
  sourceNote: string,
  minPlayerCount = 2,
): { snapshots: MetaSnapshotData[]; totalPlayers: number; tournamentCount: number } {
  const archMap = new Map<
    string,
    { displayName: string; wins: number; losses: number; playerCount: number }
  >();
  let totalPlayers = 0;
  let tournamentCount = 0;

  for (const standings of tournaments) {
    if (!Array.isArray(standings) || standings.length === 0) continue;
    tournamentCount += 1;
    totalPlayers += standings.length;
    for (const p of standings) {
      const id = normalizeArchetypeId(p.deck?.id);
      const displayName = p.deck?.name ?? 'Other';
      const e = archMap.get(id) ?? { displayName, wins: 0, losses: 0, playerCount: 0 };
      e.wins += p.record?.wins ?? 0;
      e.losses += p.record?.losses ?? 0;
      e.playerCount += 1;
      archMap.set(id, e);
    }
  }

  const snapshots: MetaSnapshotData[] = [];
  for (const [archetypeId, s] of archMap.entries()) {
    if (s.playerCount < minPlayerCount) continue;
    const frequencyPct =
      totalPlayers > 0 ? parseFloat(((s.playerCount / totalPlayers) * 100).toFixed(1)) : 0;
    const decisive = s.wins + s.losses;
    const winRatePct = decisive > 0 ? Math.round((s.wins / decisive) * 100) : null;
    snapshots.push({
      archetype: s.displayName,
      archetypeId,
      frequencyPct,
      winRatePct,
      wins: s.wins,
      losses: s.losses,
      playerCount: s.playerCount,
      period,
      sourceNote,
    });
  }
  return { snapshots, totalPlayers, tournamentCount };
}
