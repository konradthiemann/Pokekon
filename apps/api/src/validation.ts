import { z } from 'zod';
import { cardTypeValues, cardRoleValues, eventTypeValues, matchResultValues } from './db/schema.js';

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
