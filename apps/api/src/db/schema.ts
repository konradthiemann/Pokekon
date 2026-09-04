import { relations, sql } from 'drizzle-orm';
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
  check,
} from 'drizzle-orm/pg-core';
import {
  BEST_OF_VALUES,
  SWISS_MODE_VALUES,
  CARD_KIND_VALUES,
  CARD_SIGNAL_TIER_VALUES,
  FITNESS_DIRECTION_VALUES,
  SYNTHESIS_LANGUAGE_VALUES,
  DECK_SYNTHESIS_SOURCE_VALUES,
} from '@pokekon/shared';
import type {
  ParsedTurn,
  PrizePoint,
  StandingMatchResult,
  TournamentDecklist,
  SynthesisFact,
  SynthesisContext,
  SynthesisClaim,
} from '@pokekon/shared';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  // Set by Better Auth's `anonymous` plugin for throwaway demo/guest accounts.
  // Used to scope the demo-seed route and to surface the in-app demo banner.
  isAnonymous: boolean('is_anonymous').default(false),
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
/** LLM analysis providers. GitHub Models is the default; further adapters can be added later. */
export const aiProviderValues = ['github-models'] as const;

export type CardType = (typeof cardTypeValues)[number];
export type CardRole = (typeof cardRoleValues)[number];
export type AiProvider = (typeof aiProviderValues)[number];
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
    // NULLABLE = "format unknown" for logs written before this column existed;
    // required at the API layer (validation.ts) for new logs going forward.
    bestOf: text('best_of', { enum: BEST_OF_VALUES }),
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
    // Defence-in-depth: validation.ts already constrains bestOf, but the DB
    // enforces the enum too (NULL passes — the column is nullable).
    check('opponent_logs_best_of_chk', sql`${table.bestOf} in ('BO1', 'BO3')`),
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
    // Limitless deck id (slug) — the join key to tournament_standings and the
    // matchup matrix. Nullable because rows synced before this column existed
    // carry no slug; the sync upsert backfills it on the next run.
    archetypeId: text('archetype_id'),
    frequencyPct: real('frequency_pct').notNull(),
    winRatePct: integer('win_rate_pct'), // nullable: no games at all yet
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull().default(0),
    playerCount: integer('player_count').notNull(),
    // Pokémon sprite slugs from Limitless `deck.icons` (data-driven archetype
    // icons); null for rows synced before this column existed — the frontend
    // falls back to its slug→sprite map then.
    icons: jsonb('icons').$type<string[]>(),
    period: text('period').notNull(), // ISO week, e.g. "2026-W15"
    sourceNote: text('source_note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('meta_period_archetype_uq').on(table.period, table.archetype),
    index('meta_archetype_idx').on(table.archetype),
  ],
);

// ─── Raw tournament data (plan §5.2) ─────────────────────────────────────────
// The sync job persists what Limitless served instead of only aggregating, so
// later analyses (decklists per archetype, time windows, own matchup matrix)
// never need to re-fetch. Not user-scoped: public tournament reference data.

export const tournaments = pgTable(
  'tournaments',
  {
    id: text('id').primaryKey(), // Limitless tournament id
    name: text('name').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    players: integer('players').notNull(),
    format: text('format').notNull().default('standard'),
    // Ground-truth classification from the Limitless `/details` endpoint. `isOnline`
    // keeps a non-null default for legacy rows and the name-heuristic fallback (when a
    // `/details` fetch fails); `platform`/`swissMode` are nullable = unknown. The
    // online-Bo1 meta reads filter on `isOnline = true AND swissMode = 'BO1'`.
    isOnline: boolean('is_online').notNull().default(false),
    platform: text('platform'), // e.g. "PTCGL"; null when unknown
    swissMode: text('swiss_mode', { enum: SWISS_MODE_VALUES }), // BO1/BO3/OTHER; null when unknown
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
    // When the round pairings were fetched and aggregated into tournament_matchups.
    // Null = not yet processed → the delta meta sync picks it up; set = already
    // done → skipped on later runs (a completed tournament is immutable). This is
    // what lets the sync "only load the missing data".
    pairingsSyncedAt: timestamp('pairings_synced_at', { withTimezone: true }),
  },
  (table) => [
    index('tournaments_date_idx').on(table.date),
    // Supports the online-Bo1 window filter. Date is heap-filtered on top; a
    // covering (is_online, swiss_mode, date) index would only matter at a much
    // larger scale than this dataset.
    index('tournaments_online_bo1_idx').on(table.isOnline, table.swissMode),
    // Defence-in-depth: classifyTournamentDetails already constrains swiss_mode,
    // but the DB enforces the enum too (NULL passes — the column is nullable).
    check('tournaments_swiss_mode_chk', sql`${table.swissMode} in ('BO1', 'BO3', 'OTHER')`),
  ],
);

export const tournamentStandings = pgTable(
  'tournament_standings',
  {
    id: serial('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    archetypeId: text('archetype_id').notNull(), // Limitless deck id, 'other' when unknown
    archetypeName: text('archetype_name').notNull(),
    playerName: text('player_name'),
    placing: integer('placing'), // nullable: Limitless omits it for drops
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    ties: integer('ties').notNull().default(0),
    // Published 60-card list (pruned to known fields on ingest); null when the
    // player did not submit one.
    decklist: jsonb('decklist').$type<TournamentDecklist>(),
    // Pokémon sprite slugs from Limitless `deck.icons` (constant per archetype,
    // stored per row like archetype_name); null for legacy rows.
    icons: jsonb('icons').$type<string[]>(),
    // This pilot's game-by-game results (opponent archetype + W/L/T + round),
    // derived from the round pairings on ingest. Lets the prediction drill-down
    // show how THIS decklist actually fared vs each archetype. Null for legacy
    // rows / tournaments whose pairings weren't processed.
    matchResults: jsonb('match_results').$type<StandingMatchResult[]>(),
  },
  (table) => [
    index('tournament_standings_tournamentId_idx').on(table.tournamentId),
    index('tournament_standings_archetypeId_idx').on(table.archetypeId),
  ],
);

// ─── Matchup matrix (plan §5.2, TrainerHill import) ──────────────────────────
// Rows sharing one `importedAt` form a batch; reads use the latest batch. The
// win rate is directional: from deck1's perspective.

export const matchupMatrix = pgTable(
  'matchup_matrix',
  {
    id: serial('id').primaryKey(),
    deck1: text('deck1').notNull(),
    deck2: text('deck2').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull(),
    total: integer('total').notNull(),
    winRate: real('win_rate').notNull(), // 0–100, deck1 vs deck2
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('matchup_matrix_decks_idx').on(table.deck1, table.deck2),
    index('matchup_matrix_importedAt_idx').on(table.importedAt),
  ],
);

// ─── Own matchup matrix (computed from real online-Bo1 round pairings) ────────
// Aggregated head-to-head per tournament, derived by the meta sync from the
// Limitless /pairings endpoint (join: pairing username → standings deck). One
// canonical row per unordered pair per tournament (deckA < deckB); reads sum
// over the day window and join tournaments for the online/Bo1 filter, so the
// win rates are ACTUAL online-Bo1 results and — unlike the external TrainerHill
// matrix — respect the same time window as the metashare. Rows are replaced
// wholesale when a tournament's pairings are (re)processed.

export const tournamentMatchups = pgTable(
  'tournament_matchups',
  {
    id: serial('id').primaryKey(),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    deckA: text('deck_a').notNull(), // archetype slug, canonical deckA < deckB
    deckB: text('deck_b').notNull(),
    aWins: integer('a_wins').notNull().default(0), // games deckA won vs deckB
    bWins: integer('b_wins').notNull().default(0),
    ties: integer('ties').notNull().default(0),
  },
  (table) => [
    index('tournament_matchups_tournamentId_idx').on(table.tournamentId),
    index('tournament_matchups_decks_idx').on(table.deckA, table.deckB),
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

// ─── Per-archetype card performance deltas (plan §3.5) ───────────────────────
// Precomputed by jobs/computeCardStats.ts, one row per (archetype, card, window).
// Full-replace per (archetypeId, windowDays) on every job run — see the job's
// doc comment for why (Postgres cache pattern, not a materialized view: the
// actual statistics live in @pokekon/shared, see the plan). Scope is always
// the default online-Bo1 scope (plan section 5).

export const archetypeCardStats = pgTable(
  'archetype_card_stats',
  {
    id: serial('id').primaryKey(),
    archetypeId: text('archetype_id').notNull(),
    /** normalizeCardName() key — the join key to the client's card list. */
    cardKey: text('card_key').notNull(),
    /** Display spelling as seen in the source lists. */
    cardName: text('card_name').notNull(),
    cardType: text('card_type', { enum: CARD_KIND_VALUES }).notNull(),
    /** Analysis window in days (7 | 14 | 21 | 28). Scope is always the default
     *  online-Bo1 scope — see plan section 5. */
    windowDays: integer('window_days').notNull(),
    listsAnalyzed: integer('lists_analyzed').notNull(),
    listsWith: integer('lists_with').notNull(),
    inclusionPct: real('inclusion_pct').notNull(),
    avgCount: real('avg_count').notNull(),
    /** All delta columns are nullable TOGETHER: null = a group was empty. */
    superiorityPct: real('superiority_pct'),
    deltaPp: real('delta_pp'),
    lowPct: real('low_pct'),
    highPct: real('high_pct'),
    effectiveN: real('effective_n'),
    meanPercentileWithPct: real('mean_percentile_with_pct'),
    meanPercentileWithoutPct: real('mean_percentile_without_pct'),
    significant: boolean('significant').notNull().default(false),
    tier: text('tier', { enum: CARD_SIGNAL_TIER_VALUES }).notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('archetype_card_stats_uq').on(table.archetypeId, table.cardKey, table.windowDays),
    index('archetype_card_stats_lookup_idx').on(table.archetypeId, table.windowDays),
    check(
      'archetype_card_stats_type_chk',
      sql`${table.cardType} in ('pokemon','trainer','energy')`,
    ),
    check(
      'archetype_card_stats_tier_chk',
      sql`${table.tier} in ('insufficient','confirmed','hiddenGem','popularityParadox','discouraged','neutral')`,
    ),
  ],
);

// ─── Meta game-theory layer (plan .claude/plans/meta-game-theory-layer.md
// §3.6) ─────────────────────────────────────────────────────────────────────
// Two tables, not one: about a dozen genuinely run-scaled fields (game value,
// seed, resample count, imputed share, periods, support size, replicator
// mean fitness...) would be error-prone to denormalise onto every archetype
// row (the archetype_card_stats.listsAnalyzed pattern). The FK with
// `onDelete: 'cascade'` also turns the full-replace into ONE DELETE.
// Precomputed by jobs/computeEquilibrium.ts, one run row per windowDays, full
// -replace on every job run — same Postgres-cache-not-materialized-view
// reasoning as archetype_card_stats (the expensive part is an LP plus 2000
// Monte-Carlo resamples, not an aggregate SQL can express). Scope is always
// the default online-Bo1 scope (plan section 5).

export const metaEquilibriumRuns = pgTable(
  'meta_equilibrium_runs',
  {
    id: serial('id').primaryKey(),
    /** Analysis window in days (7 | 14 | 21 | 28). */
    windowDays: integer('window_days').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
    archetypeCount: integer('archetype_count').notNull(),
    /** MUST be 50 for a constant-sum matrix — persisted as a self check that
     *  survives into production data. */
    valuePct: real('value_pct').notNull(),
    supportSize: integer('support_size').notNull(),
    /** #{i : payoff_i == value}; larger than supportSize means other equilibria
     *  cannot be ruled out (plan section 3.0c — a hint, not a certificate). */
    equalizerCount: integer('equalizer_count').notNull(),
    /** Share of off-diagonal cells with no data at all, 1 decimal. */
    imputedCellSharePct: real('imputed_cell_share_pct').notNull(),
    resamples: integer('resamples').notNull(),
    seed: integer('seed').notNull(),
    failedResamples: integer('failed_resamples').notNull(),
    /** Percentage of resamples reproducing the exact support set. */
    exactSupportRatePct: real('exact_support_rate_pct').notNull(),
    /** The two completed ISO weeks the replicator trend used; null on a cold
     *  start with fewer than two completed weeks. */
    currentPeriod: text('current_period'),
    previousPeriod: text('previous_period'),
    /** Wall-clock milliseconds of the whole window computation, so the cron's
     *  cost stays visible without extra tooling. */
    durationMs: integer('duration_ms').notNull(),
  },
  (table) => [uniqueIndex('meta_equilibrium_runs_window_uq').on(table.windowDays)],
);

export const metaEquilibriumArchetypes = pgTable(
  'meta_equilibrium_archetypes',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => metaEquilibriumRuns.id, { onDelete: 'cascade' }),
    archetypeId: text('archetype_id').notNull(),
    archetypeName: text('archetype_name').notNull(),
    /** Observed share in the day window, percent. */
    sharePct: real('share_pct').notNull(),
    /** Equilibrium weight, percent, 2 decimals. */
    weightPct: real('weight_pct').notNull(),
    /** Expected win rate against the equilibrium mixture, percent. */
    equilibriumPayoffPct: real('equilibrium_payoff_pct').notNull(),
    /** sharePct - weightPct: positive = played more than the equilibrium
     *  would justify. The headline "popularity paradox" number. */
    paradoxGapPp: real('paradox_gap_pp').notNull(),
    inSupport: boolean('in_support').notNull(),
    /** Payoff strictly below the value: in the support of NO equilibrium. */
    excludedCertain: boolean('excluded_certain').notNull(),
    /** Opponent-share-weighted share of this row backed by real data. */
    rowCoveragePct: real('row_coverage_pct').notNull(),
    exclusionRatePct: real('exclusion_rate_pct').notNull(),
    certainExclusionRatePct: real('certain_exclusion_rate_pct').notNull(),
    meanWeightPct: real('mean_weight_pct').notNull(),
    weightP05Pct: real('weight_p05_pct').notNull(),
    weightP95Pct: real('weight_p95_pct').notNull(),
    fitnessPct: real('fitness_pct').notNull(),
    replicatorGrowthPct: real('replicator_growth_pct').notNull(),
    projectedSharePct: real('projected_share_pct').notNull(),
    weekFitnessPct: real('week_fitness_pct'),
    previousWeekFitnessPct: real('previous_week_fitness_pct'),
    fitnessDeltaPp: real('fitness_delta_pp'),
    observedShareDeltaPp: real('observed_share_delta_pp'),
    direction: text('direction', { enum: FITNESS_DIRECTION_VALUES }).notNull(),
  },
  (table) => [
    uniqueIndex('meta_equilibrium_archetypes_uq').on(table.runId, table.archetypeId),
    index('meta_equilibrium_archetypes_run_idx').on(table.runId),
    check(
      'meta_equilibrium_direction_chk',
      sql`${table.direction} in ('rising','falling','stable','unknown')`,
    ),
  ],
);

export const metaEquilibriumRunsRelations = relations(metaEquilibriumRuns, ({ many }) => ({
  archetypes: many(metaEquilibriumArchetypes),
}));

export const metaEquilibriumArchetypesRelations = relations(
  metaEquilibriumArchetypes,
  ({ one }) => ({
    run: one(metaEquilibriumRuns, {
      fields: [metaEquilibriumArchetypes.runId],
      references: [metaEquilibriumRuns.id],
    }),
  }),
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

export const tournamentsRelations = relations(tournaments, ({ many }) => ({
  standings: many(tournamentStandings),
}));

export const tournamentStandingsRelations = relations(tournamentStandings, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentStandings.tournamentId],
    references: [tournaments.id],
  }),
}));

// ─── Per-user LLM analysis settings (BYOK) ───────────────────────────────────
// The API key is stored AES-256-GCM-encrypted (see lib/crypto.ts) and is only
// ever decrypted server-side for the analysis call — never returned to clients.

export const userAiSettings = pgTable('user_ai_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider', { enum: aiProviderValues }).default('github-models').notNull(),
  model: text('model'), // null → adapter default
  encryptedApiKey: text('encrypted_api_key'), // null → no key configured
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ─── Legacy Dexie import, one-time-use flag (security review, plan §3.6 addendum) ──
// POST /api/logs/import is the ONLY place a client may write `bestOf: null` —
// otherwise the hard-required-on-create guarantee would be a dead letter for
// any client that just calls this route instead of the regular one. A row
// here means "this account has already run the legacy import once"; the
// route 409s any further attempt. Presence-of-row (not a boolean/nullable
// column) so a unique-constraint violation is the race-safety net for free.

export const legacyImportState = pgTable('legacy_import_state', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Deck synthesis cache (plan §3.7, Spec 8) ────────────────────────────────
// One row per (deck, windowDays, language). The `inputHash` is THE cache key —
// see synthesisInputHash()/canonicalizeFacts() in lib/synthesisFacts.ts (plan
// §3.7): a content hash over the rounded facts, not a timestamp, so a job
// re-run producing identical numbers never invalidates a cached text.

export const deckSynthesis = pgTable(
  'deck_synthesis',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    /** Redundant to decks.userId, but every user-scoped table carries it
     *  (deck_cards, deck_snapshots) — keeps the ownership filter one join
     *  shorter and matches the house style. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    windowDays: integer('window_days').notNull(),
    language: text('language', { enum: SYNTHESIS_LANGUAGE_VALUES }).notNull(),
    promptVersion: integer('prompt_version').notNull(),
    /** sha256 over canonicalizeFacts(...) — THE cache key (above). */
    inputHash: text('input_hash').notNull(),
    /** The fact snapshot the text was generated from. The UI renders these
     *  numbers, never live ones — text and numbers never drift apart. */
    facts: jsonb('facts').$type<SynthesisFact[]>().notNull(),
    context: jsonb('context').$type<SynthesisContext>().notNull(),
    claims: jsonb('claims').$type<SynthesisClaim[]>().notNull(),
    droppedCount: integer('dropped_count').notNull().default(0),
    source: text('source', { enum: DECK_SYNTHESIS_SOURCE_VALUES }).notNull(),
    provider: text('provider'),
    model: text('model'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('deck_synthesis_uq').on(table.deckId, table.windowDays, table.language),
    index('deck_synthesis_userId_idx').on(table.userId),
    // Defence in depth, same pattern as archetype_card_stats_tier_chk
    // (schema.ts:478): a CHECK on `source` limited to 'llm' / 'demo-seed'.
    check('deck_synthesis_source_chk', sql`${table.source} in ('llm', 'demo-seed')`),
  ],
);
