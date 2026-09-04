import { create } from 'zustand';
import i18n from '../i18n';
import type {
  Deck,
  DeckCard,
  DeckSnapshot,
  OpponentLog,
  MetaSnapshot,
  ArchetypeStats,
  RecentTournament,
} from '../types';
import {
  getDeckCards,
  getOpponentLogs,
  getLatestMetaSnapshots,
  syncMeta as syncMetaViaApi,
  getArchetypeStats,
  getDeckSnapshots,
  saveDeckSnapshot,
  getDecks,
  createDeck,
  updateDeck,
  deleteDeck as deleteDeckFromDb,
  copyDeckCards,
} from '../db/queries';
import { fetchRecentTournaments } from '../lib/metaFetch';
import {
  ApiError,
  fetchArchetypeCardStats,
  generateDeckSynthesis,
  getDeckSynthesis,
} from '../lib/api';
import type { DeckSynthesisReadResponse } from '../lib/api';
import type { ArchetypeCardStat, MetaSyncResult } from '@pokekon/shared';
import { attachCardDeltas, fetchArchetypeComparison } from '../lib/deckComparison';
import type { ComparisonResult } from '../lib/deckComparison';
import {
  getLocalMeta,
  setLocalMeta,
  getDeckArchSlug,
  setDeckArchSlug,
  getActiveDeckId,
  setActiveDeckId,
} from '../lib/preferences';

// `loadCardStats` can be in flight from two independent, network-timing-
// dependent callers at once (`refresh()` on an archetype switch,
// `runDeckComparison()` after its own slower fetch) — whichever HTTP
// response resolves LAST would otherwise silently win, even if it was
// issued FIRST (i.e. it's for a now-stale archetype). This sequence number
// lets each call recognise when a newer call has superseded it, so the most
// recently ISSUED call always wins, never the most recently RESOLVED one.
let cardStatsRequestSeq = 0;

// Shared by `loadDeckSynthesis` and `runDeckSynthesis` — both write into the
// same `deckSynthesis` slice, so a deck switch (new `loadDeckSynthesis` call)
// while a generation is still in flight (or vice versa) must discard the
// older call's result the same way `cardStatsRequestSeq` does above (plan
// ai-recommendation-synthesis.md §3.10: "demselben Request-Sequenz-Guard wie
// loadCardStats").
let deckSynthesisRequestSeq = 0;

/** The three top-level axes of the IA (plan ui-ux-hub-rework.md §3.1, §3.9). */
export type DashboardTab = 'overview' | 'meta' | 'deck';

/** Sections within "My Deck" (plan ui-ux-hub-rework.md §3.1). */
export type DeckSection = 'deck' | 'analytics' | 'tips';

interface DashboardState {
  // Data
  decks: Deck[];
  activeDeckId: number | null;
  deckCards: DeckCard[];
  deckSnapshots: DeckSnapshot[];
  opponentLogs: OpponentLog[];
  metaSnapshots: MetaSnapshot[];
  archetypeStats: ArchetypeStats[];
  recentTournaments: RecentTournament[];

  // Computed
  activeDeck: Deck | null;

  // User preferences (localStorage-backed)
  localMeta: string[];
  deckArchSlug: string;

  // Deck comparison
  comparisonResult: ComparisonResult | null;
  isComparing: boolean;
  compareProgress: string;
  compareError: string | null;

  // Precomputed card deltas (plan .claude/plans/recommendation-to-prognosis.md
  // §3.7). Auto-loaded alongside the comparison — the whole point of the
  // server-side precomputation (spec decision 3: "sofort verfuegbar") is that
  // no separate click is required.
  cardStats: ArchetypeCardStat[];
  cardStatsSource: ComparisonResult['cardStatsSource'];
  isLoadingCardStats: boolean;

  // AI-synthesised deck tips (plan ai-recommendation-synthesis.md §3.10,
  // Slice K): a rendered text over the same facts as `cardStats`/analytics,
  // generated only on explicit user action (spec decision 1).
  deckSynthesis: DeckSynthesisReadResponse | null;
  isLoadingSynthesis: boolean;
  isSynthesizing: boolean;
  synthesisError: string | null;

  // UI state
  isLoading: boolean;
  lastRefreshed: Date | null;
  activeTab: DashboardTab;
  deckSection: DeckSection;

  // Live meta sync
  isSyncing: boolean;
  syncProgress: string;
  lastSynced: Date | null;
  syncError: string | null;

  // Recent tournaments
  isFetchingTournaments: boolean;
  tournamentsError: string | null;

  // Actions
  refresh: () => Promise<void>;
  setActiveTab: (tab: DashboardTab) => void;
  setDeckSection: (section: DeckSection) => void;
  /** Jumps directly into the deck comparison: sets activeTab='deck' AND
   *  deckSection='tips' in a single store update (plan ui-ux-hub-rework.md
   *  §3.1) — never two sequential calls, which would produce a visible
   *  intermediate "My Deck / Deck List" render. */
  openDeckComparison: () => void;
  syncMeta: () => Promise<MetaSyncResult>;
  loadRecentTournaments: (opts?: {
    days?: number;
    minPlayers?: number;
    onlineOnly?: boolean;
  }) => Promise<void>;
  saveCurrentDeckSnapshot: (label: string) => Promise<number>;
  setLocalMeta: (archetypes: string[]) => void;
  setDeckArchSlug: (slug: string) => void;
  runDeckComparison: () => Promise<void>;
  /** Loads precomputed card deltas for one archetype. A failure never throws
   *  — it clears `cardStats`/`cardStatsSource` and leaves everything else
   *  (notably `comparisonResult`/`compareError`) untouched, so a broken
   *  delta endpoint can never fail the whole comparison. */
  loadCardStats: (archetypeSlug: string) => Promise<void>;
  /** Read-only, no token cost — safe to call on mount / deck switch. */
  loadDeckSynthesis: (deckId: number) => Promise<void>;
  /** User-triggered generation (spec decision 1). Requires a prior
   *  `loadDeckSynthesis` call for this deck — the UI only offers the
   *  generate button once `hasApiKey`/`availableFactCount` are known. */
  runDeckSynthesis: (opts?: { force?: boolean; apiKey?: string }) => Promise<void>;
  // Deck management
  setActiveDeck: (id: number) => Promise<void>;
  createNewDeck: (archetype: string, archetypeName: string, variant: string) => Promise<number>;
  updateCurrentDeck: (patch: Partial<Omit<Deck, 'id'>>) => Promise<void>;
  removeDecks: (id: number) => Promise<void>;
  /** Duplicate the active deck as a new variant of the same archetype. */
  duplicateDeckAsVariant: (
    variantName: string,
    opts?: { copyCards?: boolean },
  ) => Promise<number | null>;
  /** Optimistically update deckCards in-place without a full refresh (no isLoading flash). */
  patchDeckCards: (updater: (cards: DeckCard[]) => DeckCard[]) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  decks: [],
  activeDeckId: getActiveDeckId(),
  deckCards: [],
  deckSnapshots: [],
  opponentLogs: [],
  metaSnapshots: [],
  archetypeStats: [],
  recentTournaments: [],
  activeDeck: null,
  localMeta: getLocalMeta(),
  deckArchSlug: getDeckArchSlug(),
  comparisonResult: null,
  isComparing: false,
  compareProgress: '',
  compareError: null,
  cardStats: [],
  cardStatsSource: null,
  isLoadingCardStats: false,
  deckSynthesis: null,
  isLoadingSynthesis: false,
  isSynthesizing: false,
  synthesisError: null,
  isLoading: false,
  lastRefreshed: null,
  activeTab: 'overview',
  deckSection: 'deck',
  isSyncing: false,
  syncProgress: '',
  lastSynced: null,
  syncError: null,
  isFetchingTournaments: false,
  tournamentsError: null,

  /**
   * Hydrates all store state: decks, active deck, cards, snapshots and logs from
   * the REST API; meta snapshots and archetype stats from the local meta cache.
   * Called once a session exists (see App.tsx) and after every mutation.
   * Server data cannot be orphaned, so no legacy "default deck" safety net is
   * needed — zero decks is a valid state for a fresh account.
   */
  refresh: async () => {
    set({ isLoading: true });
    try {
      // Meta now comes from the server, which already serves only in-season
      // data — no local season hygiene needed.

      // Load decks first to determine active deck
      const decks = await getDecks();

      let activeDeckId = get().activeDeckId;

      // If no active deck ID or it doesn't exist, pick the first deck
      if (!activeDeckId || !decks.find((d) => d.id === activeDeckId)) {
        activeDeckId = decks[0]?.id ?? null;
        if (activeDeckId) setActiveDeckId(activeDeckId);
      }

      const previousArchetype = get().activeDeck?.archetype;
      const activeDeck = decks.find((d) => d.id === activeDeckId) ?? null;

      // Precomputed card deltas are server-side and instant (plan
      // recommendation-to-prognosis §3.7/decision 3: "sofort verfuegbar",
      // no click required) — auto-load them whenever the active archetype
      // actually changes, not on every unrelated refresh. loadCardStats only
      // depends on the archetype slug (already known here), so it runs
      // alongside the other fetches below instead of after them — awaiting
      // it as a separate step would add an unrelated network round-trip to
      // every refresh() caller. It never fails `refresh()`: loadCardStats
      // already catches and reports its own errors.
      const cardStatsPromise =
        activeDeck && activeDeck.archetype !== previousArchetype
          ? get().loadCardStats(activeDeck.archetype)
          : Promise.resolve();

      const [deckCards, deckSnapshots, opponentLogs, metaSnapshots, archetypeStats] =
        await Promise.all([
          getDeckCards(activeDeckId ?? undefined),
          getDeckSnapshots(activeDeckId ?? undefined),
          getOpponentLogs(), // all logs for global archetype stats
          getLatestMetaSnapshots(),
          getArchetypeStats(),
          cardStatsPromise,
        ]);

      set({
        decks,
        activeDeckId,
        activeDeck,
        deckCards,
        deckSnapshots,
        opponentLogs,
        metaSnapshots,
        archetypeStats,
        lastRefreshed: new Date(),
        isLoading: false,
      });

      if (!activeDeck && previousArchetype !== undefined) {
        // The active deck was removed (e.g. the user deleted their last
        // deck) — the previous archetype's deltas no longer apply to
        // anything and must not linger for Rule 2 to keep reading.
        // Bumping the sequence also discards any load still in flight for
        // the deck that just disappeared.
        cardStatsRequestSeq++;
        set({ cardStats: [], cardStatsSource: null });
      }
    } catch (err) {
      console.error('[DashboardStore] refresh failed:', err);
      set({ isLoading: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setDeckSection: (section) => set({ deckSection: section }),

  openDeckComparison: () => set({ activeTab: 'deck', deckSection: 'tips' }),

  setActiveDeck: async (id) => {
    setActiveDeckId(id);
    set({ activeDeckId: id });
    await get().refresh();
  },

  createNewDeck: async (archetype, archetypeName, variant) => {
    const id = await createDeck({
      archetype,
      archetypeName,
      variant,
      createdAt: new Date().toISOString(),
    });
    setActiveDeckId(id);
    set({ activeDeckId: id });
    await get().refresh();
    return id;
  },

  updateCurrentDeck: async (patch) => {
    const { activeDeckId } = get();
    if (!activeDeckId) return;
    await updateDeck(activeDeckId, patch);
    await get().refresh();
  },

  /**
   * Creates a new deck that shares the active deck's archetype and archetype name but has
   * a different variant label. `opts.copyCards` (default `true`) copies the full card list
   * from the source deck into the new one. Returns the new deck's id, or `null` if the
   * active deck is missing or `variantName` is empty.
   */
  duplicateDeckAsVariant: async (variantName, opts = {}) => {
    const { copyCards = true } = opts;
    const { activeDeck, activeDeckId } = get();
    if (!activeDeck || activeDeckId == null) return null;
    const trimmed = variantName.trim();
    if (!trimmed) return null;
    const newId = await createDeck({
      archetype: activeDeck.archetype,
      archetypeName: activeDeck.archetypeName,
      variant: trimmed,
      createdAt: new Date().toISOString(),
    });
    if (copyCards) await copyDeckCards(activeDeckId, newId);
    setActiveDeckId(newId);
    set({ activeDeckId: newId });
    await get().refresh();
    return newId;
  },

  removeDecks: async (id) => {
    await deleteDeckFromDb(id);
    const { activeDeckId } = get();
    if (activeDeckId === id) {
      setActiveDeckId(null);
      set({ activeDeckId: null });
    }
    await get().refresh();
  },

  syncMeta: async () => {
    set({ isSyncing: true, syncError: null, syncProgress: i18n.t('layout:sync.starting') });
    try {
      // Server-side sync — one round trip, no per-step progress stream.
      const result = await syncMetaViaApi();
      set({ isSyncing: false, syncProgress: '', lastSynced: new Date(), syncError: null });
      await get().refresh();
      return result;
    } catch (err) {
      // A 429 (our own sync rate limit OR Limitless throttling our server) is
      // transient — show a calm retry hint, not a raw upstream error string.
      const msg =
        err instanceof ApiError && err.status === 429
          ? i18n.t('layout:sync.rateLimited')
          : err instanceof Error
            ? err.message
            : i18n.t('layout:sync.unknownError');
      set({ isSyncing: false, syncProgress: '', syncError: msg });
      throw err;
    }
  },

  loadRecentTournaments: async (opts) => {
    set({ isFetchingTournaments: true, tournamentsError: null });
    try {
      const tournaments = await fetchRecentTournaments(opts);
      set({ recentTournaments: tournaments, isFetchingTournaments: false });
    } catch (err) {
      set({
        isFetchingTournaments: false,
        tournamentsError:
          err instanceof Error ? err.message : i18n.t('layout:tournaments.fetchFailed'),
      });
    }
  },

  saveCurrentDeckSnapshot: async (label) => {
    const { deckCards, activeDeckId } = get();
    const id = await saveDeckSnapshot(label, deckCards, activeDeckId ?? undefined);
    const snapshots = await getDeckSnapshots(activeDeckId ?? undefined);
    set({ deckSnapshots: snapshots });
    return id;
  },

  patchDeckCards: (updater) => set((state) => ({ deckCards: updater(state.deckCards) })),

  setLocalMeta: (archetypes) => {
    setLocalMeta(archetypes);
    set({ localMeta: archetypes });
  },

  setDeckArchSlug: (slug) => {
    setDeckArchSlug(slug);
    set({ deckArchSlug: slug });
  },

  runDeckComparison: async () => {
    const { activeDeck, deckCards } = get();
    const slug = activeDeck?.archetype ?? get().deckArchSlug;
    if (!slug.trim()) {
      set({ compareError: i18n.t('layout:compare.missingSlug') });
      return;
    }
    set({
      isComparing: true,
      compareError: null,
      compareProgress: i18n.t('layout:compare.starting'),
    });
    try {
      // Run concurrently — loadCardStats only depends on `slug`, not on the
      // comparison result, so awaiting it after fetchArchetypeComparison
      // would add an unrelated network round-trip to every comparison run.
      // loadCardStats never throws — its own try/catch keeps a delta-fetch
      // failure from ever reaching (and failing) this comparison run.
      const [result] = await Promise.all([
        fetchArchetypeComparison(slug, deckCards, (msg) => set({ compareProgress: msg })),
        get().loadCardStats(slug),
      ]);
      const { cardStats, cardStatsSource } = get();
      const finalResult = cardStatsSource
        ? attachCardDeltas(result, cardStats, cardStatsSource)
        : result;
      set({ comparisonResult: finalResult, isComparing: false, compareProgress: '' });
    } catch (err) {
      set({
        isComparing: false,
        compareProgress: '',
        compareError: err instanceof Error ? err.message : i18n.t('layout:compare.failed'),
      });
    }
  },

  loadCardStats: async (archetypeSlug) => {
    const requestId = ++cardStatsRequestSeq;
    set({ isLoadingCardStats: true });
    try {
      const response = await fetchArchetypeCardStats(archetypeSlug);
      // A newer call was issued while this one was in flight — its result
      // already won (or will), so applying this stale response now would
      // silently overwrite it. Discard.
      if (requestId !== cardStatsRequestSeq) return;
      set({
        cardStats: response.cards,
        cardStatsSource: {
          computedAt: response.computedAt,
          windowDays: response.windowDays,
          listsAnalyzed: response.listsAnalyzed,
        },
        isLoadingCardStats: false,
      });
    } catch (err) {
      if (requestId !== cardStatsRequestSeq) return;
      console.warn('[DashboardStore] loadCardStats failed:', err);
      set({ cardStats: [], cardStatsSource: null, isLoadingCardStats: false });
    }
  },

  loadDeckSynthesis: async (deckId) => {
    const requestId = ++deckSynthesisRequestSeq;
    set({ isLoadingSynthesis: true });
    try {
      const response = await getDeckSynthesis(deckId);
      // A newer call (deck switch, or a generation kicked off in the
      // meantime) already won — discard this now-stale response.
      if (requestId !== deckSynthesisRequestSeq) return;
      set({ deckSynthesis: response, isLoadingSynthesis: false });
    } catch (err) {
      if (requestId !== deckSynthesisRequestSeq) return;
      console.warn('[DashboardStore] loadDeckSynthesis failed:', err);
      set({ isLoadingSynthesis: false });
    }
  },

  runDeckSynthesis: async (opts) => {
    // Precondition: `loadDeckSynthesis` has already populated
    // `deckSynthesis` for this deck — the UI only shows the generate button
    // once `hasApiKey`/`availableFactCount` are known. Calling this with no
    // prior load is a caller bug, not a case this action needs to recover
    // from (plan ai-recommendation-synthesis.md §3.10).
    const current = get().deckSynthesis;
    if (!current) return;

    const requestId = ++deckSynthesisRequestSeq;
    set({ isSynthesizing: true, synthesisError: null });
    try {
      const response = await generateDeckSynthesis(current.deckId, opts);
      if (requestId !== deckSynthesisRequestSeq) return;
      // The write response has no `currentInputHash`/`availableFactCount`/
      // `hasApiKey` of its own — flat-merge into the previously loaded,
      // read-shaped state, overwriting only what the write actually
      // reports. `currentInputHash` becomes the freshly generated
      // synthesis's own `inputHash`: after a successful generation that IS
      // the hash the text was written against.
      set({
        deckSynthesis: {
          ...current,
          synthesis: response.synthesis,
          stale: response.stale,
          currentInputHash: response.synthesis.inputHash,
        },
        isSynthesizing: false,
      });
    } catch (err) {
      if (requestId !== deckSynthesisRequestSeq) return;
      set({
        isSynthesizing: false,
        synthesisError: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
