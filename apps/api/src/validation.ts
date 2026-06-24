import { z } from 'zod';
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
  notes: z.string(),
  round: z.number().int().positive().nullish(),
  deckSnapshotId: z.number().int().positive().nullish(),
  battleLog: z.string().nullish(),
  analysis: z.string().nullish(),
  // Not persisted on opponent_logs — used only to pin "me" when the battle log
  // is parsed server-side (the local player's exact in-game name).
  playerName: z.string().max(100).nullish(),
};

export const logBodySchema = z.object({ ...logFields, notes: z.string().default('') });

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
  battleLog: z.string().min(1),
  playerName: z.string().min(1).max(100),
  apiKey: z.string().max(400).optional(),
  provider: z.enum(aiProviderValues).optional(),
  model: z.string().max(100).nullish(),
});
