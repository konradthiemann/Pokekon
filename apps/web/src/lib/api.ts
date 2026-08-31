import type {
  AiSettings,
  BattleAnalysis,
  DeckAnalytics,
  FieldScore,
  MatchupRow,
  MetaSyncResult,
  StandingMatchResult,
  TournamentDecklist,
} from '@pokekon/shared';
import type {
  BestOf,
  CardRole,
  CardType,
  Deck,
  DeckCard,
  DeckSnapshot,
  MetaSnapshot,
  OpponentLog,
} from '../types';

/**
 * Thin typed client for the deployed REST API (apps/api).
 *
 * All requests carry the Better Auth session cookie (`credentials: 'include'`);
 * without a session every domain route answers 401, which surfaces here as an
 * `ApiError`. The base URL is `VITE_API_URL` in split-origin deployments and
 * the empty string (same-origin relative paths via the Vite dev proxy or a
 * shared domain) otherwise.
 *
 * Boundary adapters — the rest of the app keeps using the client types from
 * src/types/index.ts unchanged:
 * - `DeckSnapshot.cards` is a jsonb ARRAY on the wire but a JSON **string** in
 *   the client type → stringified on receive, parsed on send.
 * - `DeckCard.cardId` does not exist server-side → restored as the `0`
 *   sentinel on receive, stripped on send.
 * - Nullable log columns arrive as `null` → converted to `undefined` to match
 *   the optional fields of the client `OpponentLog` type.
 */

const BASE_URL: string = import.meta.env.VITE_API_URL || '';

/** Error thrown for every non-2xx response, carrying status and parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const detail =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : '';
    super(`API request failed with status ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> =
    init.body != null ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body (proxy error page etc.) — keep null.
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── Wire types (server row shapes) ──────────────────────────────────────────

interface DeckRow {
  id: number;
  archetype: string;
  archetypeName: string;
  variant: string;
  createdAt: string;
}

interface DeckCardRow {
  id: number;
  deckId: number;
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
}

/** Single card entry inside a snapshot's jsonb payload. */
interface SnapshotCardWire {
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
  cardId?: number;
}

interface DeckSnapshotRow {
  id: number;
  deckId: number;
  label: string;
  cards: SnapshotCardWire[];
  totalCards: number;
  createdAt: string;
}

interface OpponentLogRow {
  id: number;
  deckId: number | null;
  archetype: string;
  eventType: OpponentLog['eventType'];
  eventDate: string;
  result: OpponentLog['result'];
  bestOf: OpponentLog['bestOf'] | null;
  notes: string;
  round: number | null;
  deckSnapshotId: number | null;
  battleLog: string | null;
  analysis: string | null;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

function toDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    archetype: row.archetype,
    archetypeName: row.archetypeName,
    variant: row.variant,
    createdAt: row.createdAt,
  };
}

function toDeckCard(row: DeckCardRow): DeckCard {
  return {
    id: row.id,
    deckId: row.deckId,
    cardId: 0, // server has no card catalogue link — restore the sentinel
    name: row.name,
    count: row.count,
    type: row.type,
    role: row.role,
  };
}

/** Strip client-only fields; the PUT body is exactly {name,count,type,role}. */
function toWireCard(card: Pick<DeckCard, 'name' | 'count' | 'type' | 'role'>): {
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
} {
  return { name: card.name, count: card.count, type: card.type, role: card.role };
}

function toDeckSnapshot(row: DeckSnapshotRow): DeckSnapshot {
  return {
    id: row.id,
    deckId: row.deckId,
    label: row.label,
    // Client type stores the card list as a JSON string (see types/index.ts).
    cards: JSON.stringify(row.cards),
    totalCards: row.totalCards,
    createdAt: row.createdAt,
  };
}

/** Parse the client's JSON-string card list into the wire array shape. */
function toWireSnapshotCards(cardsJson: string): SnapshotCardWire[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cardsJson);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];
  return (parsed as DeckCard[]).map((c) => ({
    name: c.name,
    count: c.count,
    type: c.type,
    role: c.role,
    ...(typeof c.cardId === 'number' && c.cardId >= 0 && { cardId: c.cardId }),
  }));
}

function toOpponentLog(row: OpponentLogRow): OpponentLog {
  return {
    id: row.id,
    deckId: row.deckId ?? undefined,
    archetype: row.archetype,
    eventType: row.eventType,
    eventDate: row.eventDate,
    result: row.result,
    bestOf: row.bestOf ?? undefined,
    notes: row.notes,
    round: row.round ?? undefined,
    deckSnapshotId: row.deckSnapshotId ?? undefined,
    battleLog: row.battleLog ?? undefined,
    analysis: row.analysis ?? undefined,
  };
}

// ─── Decks ────────────────────────────────────────────────────────────────────

export async function listDecks(): Promise<Deck[]> {
  const rows = await request<DeckRow[]>('/api/decks');
  return rows.map(toDeck);
}

export async function createDeck(body: {
  archetype: string;
  archetypeName: string;
  variant: string;
}): Promise<Deck> {
  const row = await request<DeckRow>('/api/decks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return toDeck(row);
}

export async function updateDeck(
  id: number,
  patch: Partial<{ archetype: string; archetypeName: string; variant: string }>,
): Promise<Deck> {
  const row = await request<DeckRow>(`/api/decks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return toDeck(row);
}

export async function deleteDeck(id: number): Promise<void> {
  await request<void>(`/api/decks/${id}`, { method: 'DELETE' });
}

// ─── Deck cards ───────────────────────────────────────────────────────────────

export async function listDeckCards(deckId: number): Promise<DeckCard[]> {
  const rows = await request<DeckCardRow[]>(`/api/decks/${deckId}/cards`);
  return rows.map(toDeckCard);
}

/** Replace the deck's full card list atomically (PUT semantics). */
export async function replaceDeckCards(
  deckId: number,
  cards: Pick<DeckCard, 'name' | 'count' | 'type' | 'role'>[],
): Promise<DeckCard[]> {
  const rows = await request<DeckCardRow[]>(`/api/decks/${deckId}/cards`, {
    method: 'PUT',
    body: JSON.stringify(cards.map(toWireCard)),
  });
  return rows.map(toDeckCard);
}

// ─── Deck snapshots ───────────────────────────────────────────────────────────

export async function listDeckSnapshots(deckId: number): Promise<DeckSnapshot[]> {
  const rows = await request<DeckSnapshotRow[]>(`/api/decks/${deckId}/snapshots`);
  return rows.map(toDeckSnapshot);
}

/**
 * Create a snapshot. `cards` is the client-side JSON string — it is parsed
 * into the wire array here; the server computes `totalCards` itself.
 */
export async function createDeckSnapshot(
  deckId: number,
  snapshot: { label: string; cards: string },
): Promise<DeckSnapshot> {
  const row = await request<DeckSnapshotRow>(`/api/decks/${deckId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify({ label: snapshot.label, cards: toWireSnapshotCards(snapshot.cards) }),
  });
  return toDeckSnapshot(row);
}

export async function deleteDeckSnapshot(id: number): Promise<void> {
  await request<void>(`/api/snapshots/${id}`, { method: 'DELETE' });
}

// ─── Opponent logs ────────────────────────────────────────────────────────────

export async function listLogs(opts?: {
  deckId?: number;
  limit?: number;
  offset?: number;
}): Promise<OpponentLog[]> {
  const params = new URLSearchParams();
  if (opts?.deckId !== undefined) params.set('deckId', String(opts.deckId));
  if (opts?.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts?.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.toString();
  const rows = await request<OpponentLogRow[]>(`/api/logs${query ? `?${query}` : ''}`);
  return rows.map(toOpponentLog);
}

/** Fetch every log page-by-page (the server caps a single page at 200). */
export async function listAllLogs(deckId?: number): Promise<OpponentLog[]> {
  const limit = 200;
  const all: OpponentLog[] = [];
  for (let offset = 0; ; offset += limit) {
    const page = await listLogs({ deckId, limit, offset });
    all.push(...page);
    if (page.length < limit) return all;
  }
}

export type LogWriteBody = Omit<OpponentLog, 'id'>;

export async function createLog(log: LogWriteBody): Promise<OpponentLog> {
  const row = await request<OpponentLogRow>('/api/logs', {
    method: 'POST',
    // JSON.stringify drops `undefined` optionals — exactly what the API expects.
    body: JSON.stringify({ ...log, notes: log.notes ?? '' }),
  });
  return toOpponentLog(row);
}

/** Body for POST /api/logs/import — the one-time legacy-Dexie migration path
 *  ONLY (`localImport.ts`). Unlike `LogWriteBody`, `bestOf` is explicit and
 *  nullable here: legacy logs genuinely predate the field, so they import as
 *  `null` ("format unknown") rather than a guessed default. The regular
 *  create path (`createLog`) stays hard-required and never accepts `null`. */
export type LogImportBody = Omit<LogWriteBody, 'bestOf'> & { bestOf: BestOf | null };

export async function createImportedLog(log: LogImportBody): Promise<OpponentLog> {
  const row = await request<OpponentLogRow>('/api/logs/import', {
    method: 'POST',
    body: JSON.stringify({ ...log, notes: log.notes ?? '' }),
  });
  return toOpponentLog(row);
}

export async function updateLog(id: number, patch: Partial<LogWriteBody>): Promise<OpponentLog> {
  const row = await request<OpponentLogRow>(`/api/logs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return toOpponentLog(row);
}

export async function deleteLog(id: number): Promise<void> {
  await request<void>(`/api/logs/${id}`, { method: 'DELETE' });
}

// ─── Analytics ──────────────────────────────────────────────────────────────

/**
 * Server-computed deck performance over a 1/2/3/4-week window, derived from the
 * parsed battle logs. The response already matches the shared DeckAnalytics
 * contract, so no boundary adapter is needed.
 */
export async function getDeckAnalytics(
  deckId: number,
  weeks?: 1 | 2 | 3 | 4,
): Promise<DeckAnalytics> {
  const query = weeks === undefined ? '' : `?weeks=${weeks}`;
  return request<DeckAnalytics>(`/api/analytics/deck/${deckId}${query}`);
}

// ─── AI analysis (server-side, BYOK) ──────────────────────────────────────────

/** Read the current user's AI settings (provider/model + whether a key is stored). */
export async function getAiSettings(): Promise<AiSettings> {
  return request<AiSettings>('/api/analysis/settings');
}

/**
 * Update AI settings. `apiKey` is stored server-side encrypted and never returned:
 * omit it to keep the existing key, send `""` to clear it, or a value to (re)set it.
 */
export async function updateAiSettings(body: {
  provider?: string;
  model?: string | null;
  apiKey?: string | null;
}): Promise<AiSettings> {
  return request<AiSettings>('/api/analysis/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Run the server-side LLM analysis on a battle log.
 *
 * By default the caller's stored, encrypted key is used. Pass `opts.apiKey` to
 * supply an ephemeral key for this request only — it is used once and never
 * stored server-side (the demo flow uses this so a guest can try their own token
 * without persisting it for anyone else).
 */
export async function analyzeBattleLogViaApi(
  battleLog: string,
  playerName: string,
  opts?: { apiKey?: string; provider?: string; model?: string | null },
): Promise<BattleAnalysis> {
  return request<BattleAnalysis>('/api/analysis/log', {
    method: 'POST',
    body: JSON.stringify({
      battleLog,
      playerName,
      ...(opts?.apiKey ? { apiKey: opts.apiKey } : {}),
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.model !== undefined ? { model: opts.model } : {}),
    }),
  });
}

// ─── Demo (guest accounts) ────────────────────────────────────────────────────

/**
 * Seed the current (anonymous) account with sample decks + documented matches.
 * Server-side this is restricted to guest accounts and is idempotent, so calling
 * it more than once is safe. Returns whether data was actually written.
 */
export async function seedDemo(): Promise<{ seeded: boolean }> {
  return request<{ seeded: boolean }>('/api/demo/seed', { method: 'POST' });
}

// ─── Meta snapshots (global, server-side) ─────────────────────────────────────

interface MetaSnapshotRow {
  id: number;
  archetype: string;
  archetypeId: string | null;
  frequencyPct: number;
  winRatePct: number | null;
  wins: number;
  losses: number;
  ties: number;
  playerCount: number;
  period: string;
  sourceNote: string;
  createdAt: string;
}

function toMetaSnapshot(row: MetaSnapshotRow): MetaSnapshot {
  return {
    id: row.id,
    archetype: row.archetype,
    archetypeId: row.archetypeId ?? null,
    frequencyPct: row.frequencyPct,
    winRatePct: row.winRatePct,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    playerCount: row.playerCount,
    period: row.period,
    sourceNote: row.sourceNote,
  };
}

/** All in-season meta snapshots (every post-rotation period), oldest first. */
export async function getMeta(): Promise<MetaSnapshot[]> {
  const rows = await request<MetaSnapshotRow[]>('/api/meta');
  return rows.map(toMetaSnapshot);
}

/** Trigger the server-side meta sync (fetches Limitless, upserts snapshots). */
export async function syncMeta(): Promise<MetaSyncResult> {
  return request<MetaSyncResult>('/api/meta/sync', { method: 'POST' });
}

// ─── Tournament drilldown (field analysis, decklists, matchups) ──────────────

/** Window + scope for the tournament-meta reads (mirrors metaWindowQuerySchema):
 *  `days` back from today; `online`/`bo1` restrict to online Bo1-Swiss events. */
export interface MetaWindow {
  days: number;
  online: boolean;
  bo1: boolean;
}

const metaWindowParams = (w: MetaWindow): URLSearchParams =>
  new URLSearchParams({ days: String(w.days), online: String(w.online), bo1: String(w.bo1) });

/** One archetype's window stats + meta-weighted field score (rank 1 = best). */
export interface FieldAnalysisArchetype {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  winRatePct: number | null;
  wins: number;
  losses: number;
  ties: number;
  playerCount: number;
  /** Data-driven Pokémon sprite slugs (Limitless deck.icons); [] when none. */
  icons: string[];
  fieldWinRatePct: number | null;
  coveragePct: number;
  rank: number;
}

/** How much of the matchup data behind a field score is real vs. approximate:
 *  `ownPairs`/`ownGames` come from real online-Bo1 matches, `fallbackPairs` from
 *  the external TrainerHill matrix filling coverage gaps. */
/** One matchup pair where our own data and the TrainerHill fallback disagree
 *  by more than the conflict threshold — a hint, not an auto-fix; the number
 *  actually shown is always the own value. */
export interface MatchupConflict {
  deck1: string;
  deck2: string;
  ownWinRate: number;
  fallbackWinRate: number;
  deltaPp: number;
  ownGames: number;
  fallbackGames: number;
}

export interface MatchupSource {
  ownPairs: number;
  fallbackPairs: number;
  ownGames: number;
  trainerHillImportedAt: string | null;
  /** Total number of conflicting pairs; `conflicts` is capped to the top 25. */
  conflictCount: number;
  conflicts: MatchupConflict[];
}

export interface FieldAnalysis extends MetaWindow {
  tournamentCount: number;
  totalPlayers: number;
  matchupImportedAt: string | null;
  matchupSource: MatchupSource;
  archetypes: FieldAnalysisArchetype[];
}

/** One published tournament decklist with its finish and event context. */
export interface ArchetypeListEntry {
  id: number;
  playerName: string | null;
  placing: number | null;
  wins: number;
  losses: number;
  ties: number;
  /** Non-null by invariant, not by schema: the lists route filters
   *  `decklist IS NOT NULL` — standings without a published list never
   *  reach this endpoint. */
  decklist: TournamentDecklist;
  /** This pilot's game-by-game results (opponent archetype + W/L/T), for the
   *  drill-down. Empty when the tournament's pairings weren't processed. */
  matchResults: StandingMatchResult[];
  tournament: { id: string; name: string; date: string; players: number };
}

export interface ArchetypeLists {
  total: number;
  lists: ArchetypeListEntry[];
}

export interface ArchetypeAnalysis extends MetaWindow {
  tournamentCount: number;
  totalPlayers: number;
  matchupImportedAt: string | null;
  matchupSource: MatchupSource;
  archetype: {
    archetypeId: string;
    archetypeName: string;
    sharePct: number;
    winRatePct: number | null;
    wins: number;
    losses: number;
    ties: number;
    playerCount: number;
    icons: string[];
  };
  fieldScore: FieldScore;
  /** archetypeId → data-driven sprite slugs, for the drilldown matchup table's
   *  opponent icons (covers every archetype in the field). */
  iconsById: Record<string, string[]>;
  totalRanked: number;
  listsAvailable: number;
  trend: { period: string; frequencyPct: number; winRatePct: number | null }[];
}

/** Every archetype's meta-weighted field win rate over the window (plan §3.4). */
export async function getFieldAnalysis(window: MetaWindow): Promise<FieldAnalysis> {
  return request<FieldAnalysis>(`/api/meta/field-analysis?${metaWindowParams(window)}`);
}

/** The most successful published decklists of one archetype, paginated. */
export async function getArchetypeLists(
  archetypeId: string,
  opts: MetaWindow & { limit: number; offset: number },
): Promise<ArchetypeLists> {
  const params = metaWindowParams(opts);
  params.set('limit', String(opts.limit));
  params.set('offset', String(opts.offset));
  return request<ArchetypeLists>(
    `/api/meta/archetypes/${encodeURIComponent(archetypeId)}/lists?${params}`,
  );
}

/** One archetype's field position: score, rank, threats, free wins, trend. */
export async function getArchetypeAnalysis(
  archetypeId: string,
  window: MetaWindow,
): Promise<ArchetypeAnalysis> {
  return request<ArchetypeAnalysis>(
    `/api/meta/archetypes/${encodeURIComponent(archetypeId)}/analysis?${metaWindowParams(window)}`,
  );
}

/** The latest head-to-head matchup batch (seeded server-side when empty). */
export interface MatchupData {
  importedAt: string | null;
  rows: MatchupRow[];
}

export async function getMatchups(): Promise<MatchupData> {
  return request<MatchupData>('/api/matchups');
}

/** The windowed head-to-head matrix: real online-Bo1 results (own data) with
 *  TrainerHill filling coverage gaps, scoped to the same day/online window as
 *  the metashare. `matchupSource` reports the real-vs-approximate blend. */
export interface MetaMatchups extends MetaWindow {
  matchupSource: MatchupSource;
  rows: MatchupRow[];
}

export async function getMetaMatchups(window: MetaWindow): Promise<MetaMatchups> {
  return request<MetaMatchups>(`/api/meta/matchups?${metaWindowParams(window)}`);
}
