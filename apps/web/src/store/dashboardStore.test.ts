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
  return {
    ...actual,
    fetchArchetypeCardStats: vi.fn(),
    getDeckSynthesis: vi.fn(),
    generateDeckSynthesis: vi.fn(),
  };
});

// Automocked for the `refresh()`/auto-load-on-archetype-change tests below —
// `refresh()` pulls decks/cards/snapshots/logs from IndexedDB via this
// module, which vitest/jsdom can't do for real.
vi.mock('../db/queries');

import { useDashboardStore } from './dashboardStore';
import { fetchArchetypeComparison } from '../lib/deckComparison';
import type { ComparisonResult } from '../lib/deckComparison';
import { fetchArchetypeCardStats, generateDeckSynthesis, getDeckSynthesis } from '../lib/api';
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
const mockedGetDeckSynthesis = vi.mocked(getDeckSynthesis);
const mockedGenerateDeckSynthesis = vi.mocked(generateDeckSynthesis);
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
  mockedGetDeckSynthesis.mockReset();
  mockedGenerateDeckSynthesis.mockReset();
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

/**
 * Plan .claude/plans/ui-ux-hub-rework.md §3.1, Slice A (§4) — the store
 * contract for the new "Mein Deck" sections: `deckSection`, `setDeckSection`,
 * `openDeckComparison`. None of these exist yet — this is expected to fail
 * with "not a function" / `undefined` until the implementer adds them.
 */
describe('dashboardStore deckSection contract (plan ui-ux-hub-rework.md §3.1, Slice A)', () => {
  it('defaults deckSection to "deck"', () => {
    expect(useDashboardStore.getState().deckSection).toBe('deck');
  });

  it('setDeckSection updates only deckSection, leaving activeTab untouched', () => {
    useDashboardStore.setState({ activeTab: 'overview', deckSection: 'deck' } as never);

    useDashboardStore.getState().setDeckSection('analytics');

    const state = useDashboardStore.getState();
    expect(state.deckSection).toBe('analytics');
    expect(state.activeTab).toBe('overview');
  });

  it('openDeckComparison sets activeTab="deck" and deckSection="tips" in a single update, starting from activeTab="overview"', () => {
    useDashboardStore.setState({ activeTab: 'overview', deckSection: 'deck' } as never);

    useDashboardStore.getState().openDeckComparison();

    const state = useDashboardStore.getState();
    expect(state.activeTab).toBe('deck');
    expect(state.deckSection).toBe('tips');
  });
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

  it('clears cardStats/cardStatsSource when the active deck is deleted (no deck left)', async () => {
    // First refresh: a deck exists, deltas load.
    mockedGetDecks.mockResolvedValueOnce([DECK_A]);
    mockedFetchCardStats.mockResolvedValueOnce({
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
    expect(useDashboardStore.getState().cardStats).toEqual(CARD_STATS);

    // Second refresh: the deck was deleted — no decks left at all.
    mockedGetDecks.mockResolvedValueOnce([]);
    await useDashboardStore.getState().refresh();

    const state = useDashboardStore.getState();
    expect(state.activeDeck).toBeNull();
    expect(state.cardStats).toEqual([]);
    expect(state.cardStatsSource).toBeNull();
  });
});

describe('dashboardStore.refresh runs loadCardStats concurrently with the other fetches', () => {
  // Code review finding on the recommendation-to-prognosis branch
  // (2026-09-02): loadCardStats only depends on the archetype slug, which is
  // already known before the decks/cards/snapshots/logs Promise.all starts —
  // awaiting it AFTER that Promise.all (as a separate step) adds a full
  // unrelated network round-trip to every refresh() caller, including ones
  // with no interest in card stats (e.g. WelcomeScreen's startDemo()).
  it('issues the card-stats fetch before the other refresh fetches resolve, not after', async () => {
    mockedGetDecks.mockResolvedValue([DECK_A]);

    let resolveDeckCards!: (value: Awaited<ReturnType<typeof getDeckCards>>) => void;
    mockedGetDeckCards.mockReset().mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDeckCards = resolve;
      }),
    );

    let resolveCardStats!: (value: Awaited<ReturnType<typeof fetchArchetypeCardStats>>) => void;
    mockedFetchCardStats.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCardStats = resolve;
      }),
    );

    const refreshPromise = useDashboardStore.getState().refresh();

    // Flush pending microtasks WITHOUT resolving the deck-cards fetch — if
    // the card-stats fetch only fires after the Promise.all resolves, it
    // cannot have been called yet at this point.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedFetchCardStats).toHaveBeenCalledWith('dragapult-ex');

    resolveDeckCards([]);
    resolveCardStats({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });

    await refreshPromise;

    expect(useDashboardStore.getState().cardStats).toEqual(CARD_STATS);
  });
});

describe('dashboardStore.runDeckComparison runs loadCardStats concurrently with the comparison fetch', () => {
  it('issues the card-stats fetch before the comparison fetch resolves, not after', async () => {
    useDashboardStore.setState({ activeDeck: DECK, deckArchSlug: 'dragapult-ex', deckCards: [] });

    let resolveComparison!: (value: Awaited<ReturnType<typeof fetchArchetypeComparison>>) => void;
    mockedFetchComparison.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveComparison = resolve;
      }),
    );
    mockedFetchCardStats.mockResolvedValueOnce({
      archetypeId: 'dragapult-ex',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });

    const runPromise = useDashboardStore.getState().runDeckComparison();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedFetchCardStats).toHaveBeenCalledWith('dragapult-ex');

    resolveComparison(comparisonResult());
    await runPromise;

    expect(useDashboardStore.getState().comparisonResult?.archetypeSlug).toBe('dragapult-ex');
  });
});

describe('dashboardStore.loadCardStats discards a stale, out-of-order response', () => {
  // Two independent, network-timing-dependent callers (refresh() on an
  // archetype switch, runDeckComparison() after its own slower fetch) can
  // both have loadCardStats in flight at once. Whichever HTTP response
  // resolves LAST must not be allowed to silently overwrite a NEWER
  // request's result just because its own network call happened to take
  // longer — the most RECENTLY ISSUED call must always win, not the most
  // recently RESOLVED one.
  it('keeps the result of the most recently issued call, even if an earlier call resolves later', async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof fetchArchetypeCardStats>>) => void;
    let resolveSecond!: (value: Awaited<ReturnType<typeof fetchArchetypeCardStats>>) => void;
    const firstResponse = new Promise<Awaited<ReturnType<typeof fetchArchetypeCardStats>>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const secondResponse = new Promise<Awaited<ReturnType<typeof fetchArchetypeCardStats>>>(
      (resolve) => {
        resolveSecond = resolve;
      },
    );
    mockedFetchCardStats.mockReturnValueOnce(firstResponse);
    mockedFetchCardStats.mockReturnValueOnce(secondResponse);

    // Call order: 'archetype-a' first, 'archetype-b' second — but let
    // 'archetype-b' (the second, more recent call) resolve FIRST.
    const firstCall = useDashboardStore.getState().loadCardStats('archetype-a');
    const secondCall = useDashboardStore.getState().loadCardStats('archetype-b');

    resolveSecond({
      archetypeId: 'archetype-b',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-02T00:00:00.000Z',
      listsAnalyzed: 5,
      cards: [],
    });
    await secondCall;

    // The first (now-stale) call resolves AFTER the second one already won.
    resolveFirst({
      archetypeId: 'archetype-a',
      windowDays: 14,
      online: true,
      bo1: true,
      computedAt: '2026-06-01T00:00:00.000Z',
      listsAnalyzed: 20,
      cards: CARD_STATS,
    });
    await firstCall;

    // 'archetype-b' was issued last and must be what's in the store —
    // never overwritten back to the stale 'archetype-a' result.
    expect(useDashboardStore.getState().cardStatsSource?.computedAt).toBe(
      '2026-06-02T00:00:00.000Z',
    );
    expect(useDashboardStore.getState().cardStats).toEqual([]);
  });
});

/**
 * Plan .claude/plans/ai-recommendation-synthesis.md §3.10, Slice K — the
 * `deckSynthesis`/`isLoadingSynthesis`/`isSynthesizing`/`synthesisError`
 * store slice plus `loadDeckSynthesis`/`runDeckSynthesis`. None of these
 * exist on the store yet — expected to fail with "is not a function" /
 * `undefined` until the implementer adds them.
 */
describe('dashboardStore deck synthesis (plan ai-recommendation-synthesis.md §3.10, Slice K)', () => {
  const READ_RESPONSE = {
    deckId: 5,
    archetypeId: 'dragapult-ex',
    windowDays: 14,
    language: 'de' as const,
    synthesis: null,
    stale: false,
    currentInputHash: 'a'.repeat(64),
    availableFactCount: 4,
    hasApiKey: true,
  };

  const DECK_SYNTHESIS = {
    deckId: 5,
    archetypeId: 'dragapult-ex',
    archetypeName: 'Dragapult ex',
    windowDays: 14,
    language: 'de' as const,
    promptVersion: 1,
    sections: [{ section: 'headline' as const, sentences: ['Dein Deck steht solide da.'] }],
    claims: [],
    facts: [],
    context: {
      deckId: 5,
      archetypeId: 'dragapult-ex',
      archetypeName: 'Dragapult ex',
      variant: 'Standard',
      windowDays: 14,
      language: 'de' as const,
      cardStatsComputedAt: null,
      equilibriumComputedAt: null,
      matchupImportedAt: null,
    },
    droppedCount: 0,
    source: 'llm' as const,
    provider: 'github-models',
    model: null,
    inputHash: 'b'.repeat(64),
    generatedAt: '2026-06-01T00:00:00.000Z',
  };

  it('defaults the synthesis slice to its cold-start values', () => {
    const state = useDashboardStore.getState();
    expect(state.deckSynthesis).toBeNull();
    expect(state.isLoadingSynthesis).toBe(false);
    expect(state.isSynthesizing).toBe(false);
    expect(state.synthesisError).toBeNull();
  });

  it('loadDeckSynthesis sets isLoadingSynthesis during the call and fills deckSynthesis on success', async () => {
    let resolve!: (value: typeof READ_RESPONSE) => void;
    const pending = new Promise<typeof READ_RESPONSE>((res) => {
      resolve = res;
    });
    mockedGetDeckSynthesis.mockReturnValueOnce(pending);

    const call = useDashboardStore.getState().loadDeckSynthesis(5);
    await Promise.resolve();
    expect(useDashboardStore.getState().isLoadingSynthesis).toBe(true);

    resolve(READ_RESPONSE);
    await call;

    const state = useDashboardStore.getState();
    expect(state.deckSynthesis).toEqual(READ_RESPONSE);
    expect(state.isLoadingSynthesis).toBe(false);
  });

  it('runDeckSynthesis sets isSynthesizing during the call and updates deckSynthesis from the write response on success', async () => {
    let resolve!: (value: {
      synthesis: typeof DECK_SYNTHESIS;
      stale: false;
      cached: boolean;
    }) => void;
    const pending = new Promise<{
      synthesis: typeof DECK_SYNTHESIS;
      stale: false;
      cached: boolean;
    }>((res) => {
      resolve = res;
    });
    mockedGenerateDeckSynthesis.mockReturnValueOnce(pending);

    const call = useDashboardStore.getState().runDeckSynthesis();
    await Promise.resolve();
    expect(useDashboardStore.getState().isSynthesizing).toBe(true);

    resolve({ synthesis: DECK_SYNTHESIS, stale: false, cached: false });
    await call;

    const state = useDashboardStore.getState();
    expect(state.isSynthesizing).toBe(false);
    // The write response has no `currentInputHash`/`availableFactCount`/
    // `hasApiKey` fields of its own — only `synthesis` and `stale` are
    // contractually pinned by the plan (§3.10) as to what a write maps
    // into the read-shaped `deckSynthesis` state.
    expect(state.deckSynthesis).toMatchObject({ synthesis: DECK_SYNTHESIS, stale: false });
    expect(state.synthesisError).toBeNull();
  });

  it('runDeckSynthesis sets synthesisError on failure and leaves isSynthesizing false', async () => {
    mockedGenerateDeckSynthesis.mockRejectedValueOnce(new Error('No API key configured.'));

    await useDashboardStore.getState().runDeckSynthesis();

    const state = useDashboardStore.getState();
    expect(state.isSynthesizing).toBe(false);
    expect(state.synthesisError).toBeTruthy();
  });

  it('loadDeckSynthesis keeps the result of the most recently issued call, even if an earlier call for a different deck resolves later (request-sequence guard, mirrors loadCardStats)', async () => {
    let resolveFirst!: (value: typeof READ_RESPONSE) => void;
    let resolveSecond!: (value: typeof READ_RESPONSE) => void;
    const firstResponse = new Promise<typeof READ_RESPONSE>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<typeof READ_RESPONSE>((resolve) => {
      resolveSecond = resolve;
    });
    mockedGetDeckSynthesis.mockReturnValueOnce(firstResponse);
    mockedGetDeckSynthesis.mockReturnValueOnce(secondResponse);

    // Call order: deck 5 first, deck 6 second — but let deck 6 (the second,
    // more recently issued call) resolve FIRST, simulating a deck switch
    // while the first load is still in flight.
    const firstCall = useDashboardStore.getState().loadDeckSynthesis(5);
    const secondCall = useDashboardStore.getState().loadDeckSynthesis(6);

    resolveSecond({ ...READ_RESPONSE, deckId: 6, archetypeId: 'gardevoir-ex' });
    await secondCall;

    // The first (now-stale) call resolves AFTER the second one already won.
    resolveFirst({ ...READ_RESPONSE, deckId: 5, archetypeId: 'dragapult-ex' });
    await firstCall;

    // Deck 6 was issued last and must be what's in the store — never
    // overwritten back to the stale deck-5 result.
    expect(useDashboardStore.getState().deckSynthesis?.deckId).toBe(6);
    expect(useDashboardStore.getState().deckSynthesis?.archetypeId).toBe('gardevoir-ex');
  });
});
