import type { CardRole, CardType, Deck, DeckCard, DeckSnapshot, OpponentLog } from '../types';

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
