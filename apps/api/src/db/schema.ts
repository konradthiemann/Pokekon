import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  serial,
  integer,
  real,
  jsonb,
  date,
} from 'drizzle-orm/pg-core';
import type { ParsedTurn, PrizePoint } from '@pokekon/shared';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// ─── Domain tables (Pokémon TCG tracker) ─────────────────────────────────────
// Mirrors the client types in apps/web/src/types/index.ts. The enum-like text
// columns are constrained at the API layer (zod) and typed here via `{ enum }`.

export const cardTypeValues = ['Pokemon', 'Trainer', 'Energy'] as const;
export const cardRoleValues = [
  'attacker',
  'supporter',
  'item',
  'stadium',
  'energy',
  'tech',
] as const;
export const eventTypeValues = ['LC', 'LCup', 'Regional', 'Worlds', 'Online'] as const;
export const matchResultValues = ['W', 'L', 'T'] as const;

export type CardType = (typeof cardTypeValues)[number];
export type CardRole = (typeof cardRoleValues)[number];
export type EventType = (typeof eventTypeValues)[number];
export type MatchResult = (typeof matchResultValues)[number];

/** Shape of a single card entry inside a snapshot's jsonb payload. */
export interface SnapshotCard {
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
  /** Optional link to the client-side card catalogue (0 = quick-text entry). */
  cardId?: number | undefined;
}

export const decks = pgTable(
  'decks',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    archetype: text('archetype').notNull(),
    archetypeName: text('archetype_name').notNull(),
    variant: text('variant').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('decks_userId_idx').on(table.userId)],
);

export const deckCards = pgTable(
  'deck_cards',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    count: integer('count').notNull(),
    type: text('type', { enum: cardTypeValues }).notNull(),
    role: text('role', { enum: cardRoleValues }).notNull(),
  },
  (table) => [
    index('deck_cards_deckId_idx').on(table.deckId),
    index('deck_cards_userId_idx').on(table.userId),
  ],
);

export const deckSnapshots = pgTable(
  'deck_snapshots',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    cards: jsonb('cards').$type<SnapshotCard[]>().notNull(),
    totalCards: integer('total_cards').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('deck_snapshots_deckId_idx').on(table.deckId),
    index('deck_snapshots_userId_idx').on(table.userId),
  ],
);

export const opponentLogs = pgTable(
  'opponent_logs',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id').references(() => decks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    archetype: text('archetype').notNull(),
    eventType: text('event_type', { enum: eventTypeValues }).notNull(),
    eventDate: date('event_date', { mode: 'string' }).notNull(),
    result: text('result', { enum: matchResultValues }).notNull(),
    notes: text('notes').default('').notNull(),
    round: integer('round'),
    deckSnapshotId: integer('deck_snapshot_id').references(() => deckSnapshots.id, {
      onDelete: 'set null',
    }),
    battleLog: text('battle_log'),
    analysis: text('analysis'),
  },
  (table) => [
    index('opponent_logs_userId_idx').on(table.userId),
    index('opponent_logs_deckId_idx').on(table.deckId),
    index('opponent_logs_archetype_eventDate_idx').on(table.archetype, table.eventDate),
    // Plain event_date index for the 1/2/3/4-week time-window analytics queries (plan §5.4).
    index('opponent_logs_eventDate_idx').on(table.eventDate),
  ],
);

// ─── Meta snapshots (global tournament-meta reference data) ──────────────────
// Not user-scoped: the server-side meta sync (plan §6.2) produces one shared
// view of the meta for all users. Mirrors the IndexedDB metaSnapshots shape.

export const metaSnapshots = pgTable(
  'meta_snapshots',
  {
    id: serial('id').primaryKey(),
    archetype: text('archetype').notNull(),
    frequencyPct: real('frequency_pct').notNull(),
    winRatePct: integer('win_rate_pct'), // nullable: no decided games yet
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    playerCount: integer('player_count').notNull(),
    period: text('period').notNull(), // ISO week, e.g. "2026-W15"
    sourceNote: text('source_note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('meta_period_archetype_uq').on(table.period, table.archetype),
    index('meta_archetype_idx').on(table.archetype),
  ],
);

// ─── Parsed battle logs (one row per opponent_log with a battle log) ─────────
// The expensive parse runs once on write (plan §4); read queries hit finished
// aggregates. `turns`/`prizeProgression` hold the @pokekon/shared parser output;
// `parserVersion` allows selective re-parsing after parser improvements (§5.2).

export const matchLogParsed = pgTable(
  'match_log_parsed',
  {
    id: serial('id').primaryKey(),
    opponentLogId: integer('opponent_log_id')
      .notNull()
      .references(() => opponentLogs.id, { onDelete: 'cascade' })
      .unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    totalTurns: integer('total_turns').notNull(),
    wentFirst: boolean('went_first'), // nullable: unknown from log
    turns: jsonb('turns').$type<ParsedTurn[]>().notNull(),
    prizeProgression: jsonb('prize_progression').$type<PrizePoint[]>().notNull(),
    parserVersion: integer('parser_version').notNull(),
    // Materialised turn-quality fields for fast reads (plan §3.7.5).
    setupCleanByTurn2: boolean('setup_clean_by_turn2').notNull(),
    deadTurns: integer('dead_turns').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('match_log_parsed_userId_idx').on(table.userId)],
);

export const decksRelations = relations(decks, ({ one, many }) => ({
  user: one(user, { fields: [decks.userId], references: [user.id] }),
  cards: many(deckCards),
  snapshots: many(deckSnapshots),
  opponentLogs: many(opponentLogs),
}));

export const deckCardsRelations = relations(deckCards, ({ one }) => ({
  deck: one(decks, { fields: [deckCards.deckId], references: [decks.id] }),
}));

export const deckSnapshotsRelations = relations(deckSnapshots, ({ one }) => ({
  deck: one(decks, { fields: [deckSnapshots.deckId], references: [decks.id] }),
}));

export const opponentLogsRelations = relations(opponentLogs, ({ one }) => ({
  deck: one(decks, { fields: [opponentLogs.deckId], references: [decks.id] }),
  deckSnapshot: one(deckSnapshots, {
    fields: [opponentLogs.deckSnapshotId],
    references: [deckSnapshots.id],
  }),
  parsed: one(matchLogParsed, {
    fields: [opponentLogs.id],
    references: [matchLogParsed.opponentLogId],
  }),
}));

export const matchLogParsedRelations = relations(matchLogParsed, ({ one }) => ({
  opponentLog: one(opponentLogs, {
    fields: [matchLogParsed.opponentLogId],
    references: [opponentLogs.id],
  }),
}));
