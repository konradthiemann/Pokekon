import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ArchetypeCardStat } from '@pokekon/shared';

/**
 * Plan .claude/plans/recommendation-to-prognosis.md §3.7 — dashboardStore
 * additions: `cardStats`, `cardStatsSource`, `isLoadingCardStats`,
 * `loadCardStats`. Covers:
 * - loadCardStats populates cardStats/cardStatsSource from the API response.
 * - a delta-fetch failure must NOT fail the whole comparison: try/catch,
 *   deltas stay empty, compareError stays untouched (plan §3.7, last
 *   paragraph before "UI").
 *
 * `../lib/deckComparison` and `../lib/api` are partially mocked via
 * `importOriginal` (not a blind `vi.mock(...)` automock) so the REAL
 * `fetchArchetypeComparison`/`attachCardDeltas` keep running once the
 * implementer adds them — only the network-facing calls are stubbed. This
 * matters for this test suite specifically: a full automock of
 * `deckComparison` would silently replace `attachCardDeltas` with a mock
 * returning `undefined` forever, breaking the assertions below even after a
 * correct implementation lands.
 */
vi.mock('../lib/deckComparison', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/deckComparison')>();
  return { ...actual, fetchArchetypeComparison: vi.fn() };
});

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, fetchArchetypeCardStats: vi.fn() };
});

// Automocked for the `refresh()`/auto-load-on-archetype-change tests below —
// `refresh()` pulls decks/cards/snapshots/logs from IndexedDB via this
// module, which vitest/jsdom can't do for real.
vi.mock('../db/queries');

import { useDashboardStore } from './dashboardStore';
import { fetchArchetypeComparison } from '../lib/deckComparison';
import type { ComparisonResult } from '../lib/deckComparison';
import { fetchArchetypeCardStats } from '../lib/api';
import {
  getDecks,
  getDeckCards,
  getDeckSnapshots,
  getOpponentLogs,
  getLatestMetaSnapshots,
  getArchetypeStats,
} from '../db/queries';
import type { Deck } from '../types';

const mockedFetchComparison = vi.mocked(fetchArchetypeComparison);
const mockedFetchCardStats = vi.mocked(fetchArchetypeCardStats);
const mockedGetDecks = vi.mocked(getDecks);
const mockedGetDeckCards = vi.mocked(getDeckCards);
const mockedGetDeckSnapshots = vi.mocked(getDeckSnapshots);
const mockedGetOpponentLogs = vi.mocked(getOpponentLogs);
const mockedGetLatestMetaSnapshots = vi.mocked(getLatestMetaSnapshots);
const mockedGetArchetypeStats = vi.mocked(getArchetypeStats);

const DECK: Deck = {
  id: 1,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Standard',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function comparisonResult(over: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    archetypeSlug: 'dragapult-ex',
    listsAnalyzed: 10,
    topListsAnalyzed: 5,
    cardStats: [],
    suggestedAdds: [],
    suggestedRemoves: [],
    countAdjustments: [],
    fetchedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...over,
  };
}

const CARD_STATS: ArchetypeCardStat[] = [
  {
    cardName: 'ultra ball',
    cardType: 'trainer',
    listsAnalyzed: 20,
    listsWith: 18,
    inclusionPct: 90,
    avgCount: 3.5,
    delta: null,
    tier: 'insufficient',
  },
];

const DECK_A: Deck = {
  id: 1,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Standard',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const DECK_B: Deck = {
  id: 2,
  archetype: 'gardevoir-ex',
  archetypeName: 'Gardevoir ex',
  variant: 'Standard',
  createdAt: '2026-01-02T00:00:00.000Z',
};

beforeEach(() => {
  mockedFetchComparison.mockReset();
  mockedFetchCardStats.mockReset();
  mockedGetDecks.mockReset();
  mockedGetDeckCards.mockReset().mockResolvedValue([]);
  mockedGetDeckSnapshots.mockReset().mockResolvedValue([]);
  mockedGetOpponentLogs.mockReset().mockResolvedValue([]);
  mockedGetLatestMetaSnapshots.mockReset().mockResolvedValue([]);
  mockedGetArchetypeStats.mockReset().mockResolvedValue([]);
  // Reset the relevant store slice before every test — the store is a
  // module-level singleton shared across tests in this file.
  useDashboardStore.setState({
    comparisonResult: null,
    compareError: null,
    isComparing: false,
    compareProgress: '',
    cardStats: [],
    cardStatsSource: null,
    isLoadingCardStats: false,
    activeDeck: null,
    activeDeckId: null,
    deckArchSlug: '',
    deckCards: [],
  } as never);
});

describe('dashboardStore.loadCardStats (plan §3.7)', () => {
  it('populates cardStats and cardStatsSource from the response', async () => {
    mockedFetchCardStats.mockResolvedValueOnce({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });

    await useDashboardStore.getState().loadCardStats('dragapult-ex');

    const state = useDashboardStore.getState();
    expect(state.cardStats).toEqual(CARD_STATS);
    expect(state.cardStatsSource).toEqual({
      computedAt: '2026-06-01T00:00:00.000Z',
      windowDays: 14,
      listsAnalyzed: 20,
    });
    expect(state.isLoadingCardStats).toBe(false);
  });

  it('a delta-fetch failure does not clear an already-successful comparison or set compareError', async () => {
    const priorResult = comparisonResult();
    useDashboardStore.setState({ comparisonResult: priorResult, compareError: null });
    mockedFetchCardStats.mockRejectedValueOnce(new Error('card-stats endpoint down'));

    await useDashboardStore.getState().loadCardStats('dragapult-ex');

    const state = useDashboardStore.getState();
    // The comparison established before the delta call must survive
    // untouched — same instance, not just an equal one.
    expect(state.comparisonResult).toBe(priorResult);
    expect(state.compareError).toBeNull();
    expect(state.cardStats).toEqual([]);
    expect(state.isLoadingCardStats).toBe(false);
  });
});

describe('dashboardStore.runDeckComparison tolerates a delta-fetch failure (plan §3.7)', () => {
  it('actually attempts to load deltas as part of the comparison run (not just an untouched no-op)', async () => {
    useDashboardStore.setState({ activeDeck: DECK, deckArchSlug: 'dragapult-ex', deckCards: [] });
    mockedFetchComparison.mockResolvedValueOnce(comparisonResult());
    mockedFetchCardStats.mockRejectedValueOnce(new Error('card-stats endpoint down'));

    await useDashboardStore.getState().runDeckComparison();

    // The important, easy-to-fake-green assertion: this proves
    // runDeckComparison really wires up the delta fetch (spec: "ruft nach
    // fetchArchetypeComparison zusätzlich loadCardStats auf"), not merely
    // that some untouched state happens to still look right.
    expect(mockedFetchCardStats).toHaveBeenCalledWith('dragapult-ex');
  });

  it('keeps the frequency comparison result and compareError untouched when the delta fetch fails', async () => {
    // Poison the prior cardStats with a non-empty sentinel so a passing
    // assertion below can only mean the failed fetch was actually handled,
    // not that the field was merely never written to.
    useDashboardStore.setState({
      activeDeck: DECK,
      deckArchSlug: 'dragapult-ex',
      deckCards: [],
      cardStats: [
        {
          cardName: 'stale-sentinel',
          cardType: 'trainer',
          listsAnalyzed: 1,
          listsWith: 1,
          inclusionPct: 100,
          avgCount: 1,
          delta: null,
          tier: 'insufficient',
        },
      ],
    } as never);
    mockedFetchComparison.mockResolvedValueOnce(comparisonResult());
    mockedFetchCardStats.mockRejectedValueOnce(new Error('card-stats endpoint down'));

    await useDashboardStore.getState().runDeckComparison();

    const state = useDashboardStore.getState();
    expect(state.compareError).toBeNull();
    expect(state.comparisonResult).not.toBeNull();
    expect(state.comparisonResult?.archetypeSlug).toBe('dragapult-ex');
    // No deltas were attached because the fetch failed — the empty-array
    // side of the try/catch contract, not a crash, and not the stale
    // sentinel surviving because nothing ran.
    expect(state.cardStats).toEqual([]);
  });
});

describe('dashboardStore.refresh auto-loads card deltas on archetype change (plan §3.7)', () => {
  it('loads card deltas for the active deck archetype on first refresh (no click required)', async () => {
    mockedGetDecks.mockResolvedValue([DECK_A]);
    mockedFetchCardStats.mockResolvedValueOnce({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });

    await useDashboardStore.getState().refresh();

    expect(mockedFetchCardStats).toHaveBeenCalledWith('dragapult-ex');
    expect(useDashboardStore.getState().cardStats).toEqual(CARD_STATS);
  });

  it('reloads card deltas when the active deck switches to a different archetype', async () => {
    mockedGetDecks.mockResolvedValue([DECK_A, DECK_B]);
    mockedFetchCardStats.mockResolvedValue({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });
    useDashboardStore.setState({ activeDeckId: 1 });
    await useDashboardStore.getState().refresh();
    expect(mockedFetchCardStats).toHaveBeenCalledTimes(1);

    mockedFetchCardStats.mockClear();
    useDashboardStore.setState({ activeDeckId: 2 });
    await useDashboardStore.getState().refresh();

    expect(mockedFetchCardStats).toHaveBeenCalledWith('gardevoir-ex');
  });

  it('does not re-fetch card deltas on a refresh that keeps the same archetype', async () => {
    mockedGetDecks.mockResolvedValue([DECK_A]);
    mockedFetchCardStats.mockResolvedValue({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });
    useDashboardStore.setState({ activeDeckId: 1 });
    await useDashboardStore.getState().refresh();
    expect(mockedFetchCardStats).toHaveBeenCalledTimes(1);

    mockedFetchCardStats.mockClear();
    // Unrelated re-refresh (e.g. after a card-count edit) — same deck, same
    // archetype. loadCardStats already exists to serve fresh data on demand;
    // re-triggering it on every unrelated refresh would just be wasted
    // network traffic for data that hasn't gone stale.
    await useDashboardStore.getState().refresh();

    expect(mockedFetchCardStats).not.toHaveBeenCalled();
  });

  it('does not attempt to load card deltas when there is no active deck', async () => {
    mockedGetDecks.mockResolvedValue([]);

    await useDashboardStore.getState().refresh();

    expect(mockedFetchCardStats).not.toHaveBeenCalled();
    expect(useDashboardStore.getState().activeDeck).toBeNull();
  });
});
