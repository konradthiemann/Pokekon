import { z } from 'zod';
import { ARCHETYPE_SLUG_PATTERN, BEST_OF_VALUES } from '@pokekon/shared';
import {
  aiProviderValues,
  cardTypeValues,
  cardRoleValues,
  eventTypeValues,
  matchResultValues,
} from './db/schema.js';

// ─── Decks ────────────────────────────────────────────────────────────────────

const deckFields = {
  archetype: z.string().min(1),
  archetypeName: z.string().min(1),
  variant: z.string(),
};

export const deckBodySchema = z.object(deckFields);

export const deckPatchSchema = z
  .object(deckFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

// ─── Deck cards ───────────────────────────────────────────────────────────────

export const deckCardSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(1).max(60),
  type: z.enum(cardTypeValues),
  role: z.enum(cardRoleValues),
});

/** PUT /api/decks/:id/cards — the full card list, replaced atomically. */
export const deckCardsPutSchema = z.array(deckCardSchema).max(200);

// ─── Deck snapshots ───────────────────────────────────────────────────────────

const snapshotCardSchema = deckCardSchema.extend({
  cardId: z.number().int().nonnegative().optional(),
});

export const snapshotBodySchema = z.object({
  label: z.string().min(1),
  cards: z.array(snapshotCardSchema).max(200),
});

// ─── Opponent logs ────────────────────────────────────────────────────────────

/**
 * ~2x the largest realistic PTCG-Live log. Guards the primary paste path
 * (plan personal-data-role-rework §3.7/§0.8) — wired into both
 * `logFields.battleLog` and `analyzeLogSchema.battleLog` below.
 */
export const MAX_BATTLE_LOG_CHARS = 200_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid calendar date' });

const logFields = {
  deckId: z.number().int().positive().nullish(),
  archetype: z.string().min(1),
  eventType: z.enum(eventTypeValues),
  eventDate: isoDate,
  result: z.enum(matchResultValues),
  bestOf: z.enum(BEST_OF_VALUES),
  notes: z.string(),
  round: z.number().int().positive().nullish(),
  deckSnapshotId: z.number().int().positive().nullish(),
  battleLog: z.string().max(MAX_BATTLE_LOG_CHARS).nullish(),
  analysis: z.string().nullish(),
  // Not persisted on opponent_logs — used only to pin "me" when the battle log
  // is parsed server-side (the local player's exact in-game name).
  playerName: z.string().max(100).nullish(),
};

export const logBodySchema = z.object({ ...logFields, notes: z.string().default('') });

/**
 * POST /api/logs/import ONLY (the one-time legacy-Dexie migration path,
 * `localImport.ts`) — the single, narrow exception to `bestOf` being
 * hard-required. Legacy logs genuinely have no known format; importing them
 * requires an *explicit* `bestOf: null` ("format unknown"), never a guessed
 * default (that would undermine the whole point of hard-requiring the field
 * on the regular, interactive create path below). The key must still be
 * present — omitting it entirely is rejected, same as on `logBodySchema`.
 *
 * Batched (one array, one request) rather than one call per log: the route
 * enforces a true once-per-user usage (`legacy_import_state`, 409 on a
 * second attempt) — a per-log endpoint would either only ever let a SINGLE
 * legacy log through per account, or need a separate "session" concept. One
 * request for the whole local Dexie export sidesteps both.
 */
export const logImportEntrySchema = z.object({
  ...logFields,
  bestOf: z.enum(BEST_OF_VALUES).nullable(),
  notes: z.string().default(''),
});

// 20000: generous headroom over any realistic personal TCG match history —
// even several games a day, every day, for multiple years of active play
// stays well under this. Deliberately NOT a multi-batch/resumable-import
// design (over-engineering for a solo-hobby project, CLAUDE.md "kein
// over-engineering"): the import is genuinely once-per-account (see the
// route), so the cap only needs to comfortably exceed real usage, not
// accommodate an unbounded number of batches.
export const logImportBodySchema = z.array(logImportEntrySchema).min(1).max(20_000);

export const logPatchSchema = z
  .object(logFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

export const logsQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Analytics ──────────────────────────────────────────────────────────────

/** Time window for deck analytics — 1/2/3/4 weeks (plan §5.4), default 4. */
export const analyticsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(4).default(4),
});

// ─── Tournament meta (archetype drilldown) ────────────────────────────────────

/** Meta analysis window bounds (days). Wider than personal analytics because a
 *  Bo1-online sample needs several weeks of events to be statistically stable. */
export const META_WINDOW_MIN_DAYS = 1;
export const META_WINDOW_MAX_DAYS = 180;
export const META_WINDOW_DEFAULT_DAYS = 30;

/** Query-string boolean: absent → `def`; "false"/"0" → false; anything else →
 *  true. `z.coerce.boolean()` is unusable here — Boolean("false") === true. */
const queryBool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v !== 'false' && v !== '0'));

/** Window + scope for the tournament-meta reads. `days` generalises the old 1–4
 *  weeks selector; `online`/`bo1` default true (the local-Bo1 use case: only
 *  ground-truth online Bo1-Swiss events, which mirror local Challenge/Cup Swiss). */
export const metaWindowQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(META_WINDOW_MIN_DAYS)
    .max(META_WINDOW_MAX_DAYS)
    .default(META_WINDOW_DEFAULT_DAYS),
  online: queryBool(true),
  bo1: queryBool(true),
});

/** Limitless deck ids are kebab-case slugs (e.g. "n-zoroark", "dragapult-dusknoir"). */
export const archetypeIdParamSchema = z
  .string()
  .regex(ARCHETYPE_SLUG_PATTERN, 'Expected a Limitless deck slug');

/** Query for the paginated archetype decklists (meta window + load-more). */
export const archetypeListsQuerySchema = metaWindowQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(20).default(4),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

// ─── Card performance deltas (plan §3.5/§3.6) ─────────────────────────────────

/** The only windows jobs/computeCardStats.ts precomputes; a read `days` value
 *  is always snapped (below) to one of these. */
export const CARD_STATS_WINDOWS = [7, 14, 21, 28] as const;

export const cardStatsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(META_WINDOW_MIN_DAYS)
    .max(META_WINDOW_MAX_DAYS)
    .default(META_WINDOW_DEFAULT_DAYS),
});

/** Nearest window from `windows`; an exact tie goes to the LARGER window
 *  (more data). Shared by `snapCardStatsWindow` and `snapEquilibriumWindow`
 *  (plan §3.7) — the only precomputed-window snapper in the codebase. */
export function snapToWindow(days: number, windows: readonly number[]): number {
  return windows.reduce((nearest, window) => {
    const distance = Math.abs(days - window);
    const nearestDistance = Math.abs(days - nearest);
    return distance < nearestDistance || (distance === nearestDistance && window > nearest)
      ? window
      : nearest;
  });
}

/** Nearest precomputed window; an exact tie goes to the LARGER window (more
 *  data). At integer `days` and 7-day spacing an exact tie is unreachable via
 *  the query (the midpoints are all *.5) — this rule is defensive, not dead
 *  code, and is a direct property of the function itself. */
export function snapCardStatsWindow(days: number): number {
  return snapToWindow(days, CARD_STATS_WINDOWS);
}

// ─── Meta equilibrium (plan §3.7) ─────────────────────────────────────────────

/** The only windows jobs/computeEquilibrium.ts precomputes; a read `days`
 *  value is always snapped (below) to one of these. */
export const EQUILIBRIUM_WINDOWS = [7, 14, 21, 28] as const;

export const equilibriumQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .min(META_WINDOW_MIN_DAYS)
    .max(META_WINDOW_MAX_DAYS)
    .default(META_WINDOW_DEFAULT_DAYS),
});

/** Nearest precomputed window; an exact tie goes to the LARGER window. */
export function snapEquilibriumWindow(days: number): number {
  return snapToWindow(days, EQUILIBRIUM_WINDOWS);
}

// ─── LLM analysis (B6) ────────────────────────────────────────────────────────

/**
 * Upsert per-user AI settings. All fields optional (partial update):
 * - `apiKey` omitted → keep the stored key; `""` → clear it; otherwise → (re)encrypt.
 * - `model` `""`/null → use the adapter default.
 */
export const aiSettingsPutSchema = z
  .object({
    provider: z.enum(aiProviderValues).optional(),
    model: z.string().max(100).nullish(),
    apiKey: z.string().max(400).nullish(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

/**
 * Body for POST /api/analysis/log — the raw battle log and the local player's name.
 *
 * Optional ephemeral BYOK fields (`apiKey`/`provider`/`model`): when `apiKey` is
 * present it is used for THIS request only and never stored — this powers the demo
 * flow where a guest may try their own token without it being persisted for anyone.
 * When omitted, the server falls back to the caller's stored, encrypted key.
 */
export const analyzeLogSchema = z.object({
  battleLog: z.string().min(1).max(MAX_BATTLE_LOG_CHARS),
  playerName: z.string().min(1).max(100),
  apiKey: z.string().max(400).optional(),
  provider: z.enum(aiProviderValues).optional(),
  model: z.string().max(100).nullish(),
});
