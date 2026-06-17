import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  createDeckSnapshot,
  getDeckAnalytics,
  listDeckSnapshots,
  listAllLogs,
} from './api';
import type { DeckCard } from '../types';

/**
 * The api.ts boundary adapters under test:
 * - DeckSnapshot.cards: jsonb ARRAY on the wire ↔ JSON string in the client type
 * - non-2xx responses → typed ApiError with status + parsed body
 * - log pagination loop
 */

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const WIRE_CARDS = [
  { name: 'Dragapult ex', count: 3, type: 'Pokemon', role: 'attacker' },
  { name: 'Iono', count: 4, type: 'Trainer', role: 'supporter' },
];

describe('api snapshot cards adapter', () => {
  it('listDeckSnapshots stringifies the jsonb cards array into the client type', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 7,
          deckId: 3,
          label: 'v1',
          cards: WIRE_CARDS,
          totalCards: 7,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );

    const snapshots = await listDeckSnapshots(3);

    expect(fetchMock).toHaveBeenCalledWith('/api/decks/3/snapshots', expect.anything());
    expect(snapshots).toHaveLength(1);
    expect(typeof snapshots[0].cards).toBe('string');
    expect(JSON.parse(snapshots[0].cards)).toEqual(WIRE_CARDS);
    expect(snapshots[0].totalCards).toBe(7);
  });

  it('createDeckSnapshot parses the client JSON string into a wire array', async () => {
    const clientCards: DeckCard[] = [
      {
        id: 11,
        deckId: 3,
        cardId: 0,
        name: 'Dragapult ex',
        count: 3,
        type: 'Pokemon',
        role: 'attacker',
      },
    ];
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          id: 9,
          deckId: 3,
          label: 'v2',
          cards: [{ name: 'Dragapult ex', count: 3, type: 'Pokemon', role: 'attacker', cardId: 0 }],
          totalCards: 3,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
        201,
      ),
    );

    const created = await createDeckSnapshot(3, {
      label: 'v2',
      cards: JSON.stringify(clientCards),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    // Body is an object {label, cards: ARRAY} — local row ids are stripped.
    expect(sentBody.label).toBe('v2');
    expect(Array.isArray(sentBody.cards)).toBe(true);
    expect(sentBody.cards).toEqual([
      { name: 'Dragapult ex', count: 3, type: 'Pokemon', role: 'attacker', cardId: 0 },
    ]);
    expect(sentBody.cards[0]).not.toHaveProperty('id');
    expect(sentBody.cards[0]).not.toHaveProperty('deckId');

    // Response converted back: cards is a JSON string again.
    expect(created.id).toBe(9);
    expect(typeof created.cards).toBe('string');
  });

  it('createDeckSnapshot tolerates a malformed cards string by sending an empty list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ id: 1, deckId: 3, label: 'x', cards: [], totalCards: 0, createdAt: '' }, 201),
    );

    await createDeckSnapshot(3, { label: 'x', cards: 'not-json' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).cards).toEqual([]);
  });
});

describe('ApiError', () => {
  it('throws a typed error with status and parsed body on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

    const promise = listDeckSnapshots(3);
    await expect(promise).rejects.toBeInstanceOf(ApiError);

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));
    try {
      await listDeckSnapshots(3);
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.body).toEqual({ error: 'Unauthorized' });
    }
  });
});

describe('getDeckAnalytics', () => {
  it('requests the deck analytics endpoint with the week window and returns the contract shape', async () => {
    const analytics = {
      deckId: 3,
      weeks: 2,
      record: { games: 5, wins: 3, losses: 2, ties: 0, winRatePct: 60 },
      goingFirst: { games: 3, wins: 2, losses: 1, ties: 0, winRatePct: 66.7 },
      goingSecond: { games: 2, wins: 1, losses: 1, ties: 0, winRatePct: 50 },
      setup: { parsedGames: 5, cleanByTurn2: 4, cleanRatePct: 80 },
      deadTurns: { parsedGames: 5, avgPerGame: 0.4 },
      prizeCurveWins: [{ turn: 1, avgPrizesRemaining: 4.5, games: 3 }],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(analytics));

    const result = await getDeckAnalytics(3, 2);

    expect(fetchMock).toHaveBeenCalledWith('/api/analytics/deck/3?weeks=2', expect.anything());
    expect(result).toEqual(analytics);
  });

  it('omits the weeks query when not provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        deckId: 1,
        weeks: 4,
        record: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
        goingFirst: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
        goingSecond: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
        setup: { parsedGames: 0, cleanByTurn2: 0, cleanRatePct: null },
        deadTurns: { parsedGames: 0, avgPerGame: null },
        prizeCurveWins: [],
      }),
    );

    await getDeckAnalytics(1);

    expect(fetchMock).toHaveBeenCalledWith('/api/analytics/deck/1', expect.anything());
  });
});

describe('listAllLogs pagination', () => {
  it('follows pages until a short page is returned', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      deckId: null,
      archetype: 'a',
      eventType: 'Online',
      eventDate: '2026-06-01',
      result: 'W',
      notes: '',
      round: null,
      deckSnapshotId: null,
      battleLog: null,
      analysis: null,
    }));
    fetchMock
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse(fullPage.slice(0, 5)));

    const logs = await listAllLogs();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=200');
    expect(fetchMock.mock.calls[1][0]).toContain('offset=200');
    expect(logs).toHaveLength(205);
    // null wire fields become undefined optionals on the client type
    expect(logs[0].deckId).toBeUndefined();
    expect(logs[0].deckSnapshotId).toBeUndefined();
  });
});
