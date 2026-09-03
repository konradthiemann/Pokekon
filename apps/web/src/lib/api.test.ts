import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  analyzeBattleLogViaApi,
  createDeckSnapshot,
  fetchArchetypeCardStats,
  getAiSettings,
  getDeckAnalytics,
  getMeta,
  getMetaEquilibrium,
  listDeckSnapshots,
  listAllLogs,
  syncMeta,
  updateAiSettings,
} from './api';
import type { ArchetypeCardStatsResponse, MetaEquilibriumResponse } from './api';
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

describe('AI analysis client', () => {
  it('getAiSettings reads the settings endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ provider: 'github-models', model: null, hasApiKey: true }),
    );
    const settings = await getAiSettings();
    expect(fetchMock).toHaveBeenCalledWith('/api/analysis/settings', expect.anything());
    expect(settings).toEqual({ provider: 'github-models', model: null, hasApiKey: true });
  });

  it('updateAiSettings PUTs the provided fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ provider: 'github-models', model: null, hasApiKey: true }),
    );
    await updateAiSettings({ apiKey: 'ghp_abc' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/analysis/settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'ghp_abc' });
  });

  it('analyzeBattleLogViaApi POSTs the log + player name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        playerName: 'Konrad',
        opponentName: 'X',
        summary: 's',
        keyMoments: [],
        playMistakes: [],
        cardNotes: [],
        deckSuggestions: [],
        analyzedAt: '2026-06-17T00:00:00.000Z',
      }),
    );
    const result = await analyzeBattleLogViaApi('Zug von Konrad', 'Konrad');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/analysis/log');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      battleLog: 'Zug von Konrad',
      playerName: 'Konrad',
    });
    expect(result.playerName).toBe('Konrad');
  });

  it('surfaces a 400 (no key configured) as an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'No API key configured.' }, 400));
    await expect(analyzeBattleLogViaApi('log', 'Konrad')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('meta client', () => {
  it('getMeta maps wire rows to MetaSnapshot (drops createdAt)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: 1,
          archetype: 'Charizard',
          archetypeId: 'charizard',
          frequencyPct: 20,
          winRatePct: 55,
          wins: 11,
          losses: 9,
          playerCount: 10,
          period: '2026-W20',
          sourceNote: 'Limitless',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ]),
    );
    const meta = await getMeta();
    expect(fetchMock).toHaveBeenCalledWith('/api/meta', expect.anything());
    expect(meta).toHaveLength(1);
    expect(meta[0]).not.toHaveProperty('createdAt');
    expect(meta[0]).toMatchObject({ archetype: 'Charizard', period: '2026-W20', winRatePct: 55 });
  });

  it('syncMeta POSTs to the sync endpoint and returns the summary', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ archetypes: 12, tournaments: 4, totalPlayers: 240, period: '2026-W25' }),
    );
    const result = await syncMeta();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/meta/sync');
    expect(init.method).toBe('POST');
    expect(result).toMatchObject({ archetypes: 12, tournaments: 4 });
  });
});

describe('fetchArchetypeCardStats (plan .claude/plans/recommendation-to-prognosis.md §3.7)', () => {
  const WIRE_RESPONSE: ArchetypeCardStatsResponse = {
    archetypeId: 'dragapult-ex',
    windowDays: 14,
    online: true,
    bo1: true,
    computedAt: '2026-06-01T00:00:00.000Z',
    listsAnalyzed: 42,
    cards: [
      {
        cardName: 'ultra ball',
        cardType: 'trainer',
        listsAnalyzed: 42,
        listsWith: 38,
        inclusionPct: 90.5,
        avgCount: 3.2,
        delta: {
          listsWith: 38,
          listsWithout: 4,
          superiorityPct: 62.1,
          deltaPp: 12.1,
          lowPct: 44.0,
          highPct: 78.5,
          widthPct: 34.5,
          significant: false,
          effectiveN: 14.29,
          meanPercentileWithPct: 55.0,
          meanPercentileWithoutPct: 40.0,
        },
        tier: 'hiddenGem',
      },
    ],
  };

  it('requests the card-stats endpoint for the given window and returns the wire shape unchanged (delta fields tolerant-typed, no adapter)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(WIRE_RESPONSE));

    const result = await fetchArchetypeCardStats('dragapult-ex', 14);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meta/archetypes/dragapult-ex/card-stats?days=14',
      expect.anything(),
    );
    expect(result).toEqual(WIRE_RESPONSE);
  });

  it('omits the days query when no window is provided (mirrors getDeckAnalytics)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(WIRE_RESPONSE));

    await fetchArchetypeCardStats('dragapult-ex');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meta/archetypes/dragapult-ex/card-stats',
      expect.anything(),
    );
  });

  it('surfaces a 400 (invalid slug) as an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid archetype id' }, 400));

    await expect(fetchArchetypeCardStats('bad slug')).rejects.toBeInstanceOf(ApiError);
  });

  it('tolerates a cold-start response (computedAt: null, cards: [])', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        archetypeId: 'unknown-archetype',
        windowDays: 28,
        online: true,
        bo1: true,
        computedAt: null,
        listsAnalyzed: 0,
        cards: [],
      }),
    );

    const result = await fetchArchetypeCardStats('unknown-archetype', 30);

    expect(result.computedAt).toBeNull();
    expect(result.cards).toEqual([]);
  });
});

describe('getMetaEquilibrium (plan .claude/plans/meta-game-theory-layer.md §3.8)', () => {
  const ARCHETYPE_ROW = {
    archetypeId: 'grimmsnarl-ex',
    archetypeName: 'Grimmsnarl ex',
    sharePct: 12.4,
    weightPct: 34.3,
    equilibriumPayoffPct: 50.0,
    paradoxGapPp: -21.9,
    inSupport: true,
    excludedCertain: false,
    rowCoveragePct: 88.0,
    exclusionRatePct: 3.5,
    certainExclusionRatePct: 0.0,
    meanWeightPct: 33.8,
    weightP05Pct: 20.1,
    weightP95Pct: 45.2,
    fitnessPct: 50.0,
    replicatorGrowthPct: 0.0,
    projectedSharePct: 12.4,
    weekFitnessPct: 50.2,
    previousWeekFitnessPct: 49.8,
    fitnessDeltaPp: 0.4,
    observedShareDeltaPp: 0.6,
    direction: 'rising' as const,
  };

  const WIRE_RESPONSE: MetaEquilibriumResponse = {
    windowDays: 14,
    online: true,
    bo1: true,
    computedAt: '2026-06-01T00:00:00.000Z',
    run: {
      archetypeCount: 8,
      valuePct: 50.0,
      supportSize: 7,
      equalizerCount: 7,
      imputedCellSharePct: 4.2,
      resamples: 2000,
      seed: 42,
      failedResamples: 0,
      exactSupportRatePct: 2.1,
      currentPeriod: '2026-W23',
      previousPeriod: '2026-W22',
    },
    archetypes: [ARCHETYPE_ROW],
  };

  it('requests the equilibrium endpoint for the given window and returns the wire shape unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(WIRE_RESPONSE));

    const result = await getMetaEquilibrium(14);

    expect(fetchMock).toHaveBeenCalledWith('/api/meta/equilibrium?days=14', expect.anything());
    expect(result).toEqual(WIRE_RESPONSE);
  });

  it('omits the days query when no window is provided (mirrors fetchArchetypeCardStats)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(WIRE_RESPONSE));

    await getMetaEquilibrium();

    expect(fetchMock).toHaveBeenCalledWith('/api/meta/equilibrium', expect.anything());
  });

  it('surfaces a 400 (invalid days) as an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid days', issues: [] }, 400));

    await expect(getMetaEquilibrium(999)).rejects.toBeInstanceOf(ApiError);
  });

  it('tolerates the cold-start response (computedAt: null, run: null, archetypes: [])', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        windowDays: 28,
        online: true,
        bo1: true,
        computedAt: null,
        run: null,
        archetypes: [],
      }),
    );

    const result = await getMetaEquilibrium(28);

    expect(result.computedAt).toBeNull();
    expect(result.run).toBeNull();
    expect(result.archetypes).toEqual([]);
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
