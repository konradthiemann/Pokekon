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
import { ApiError, fetchArchetypeCardStats } from '../lib/api';
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

  // UI state
  isLoading: boolean;
  lastRefreshed: Date | null;
  activeTab: 'overview' | 'deck' | 'recommendations' | 'meta';

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
  setActiveTab: (tab: DashboardState['activeTab']) => void;
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
  isLoading: false,
  lastRefreshed: null,
  activeTab: 'overview',
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

      const [deckCards, deckSnapshots, opponentLogs, metaSnapshots, archetypeStats] =
        await Promise.all([
          getDeckCards(activeDeckId ?? undefined),
          getDeckSnapshots(activeDeckId ?? undefined),
          getOpponentLogs(), // all logs for global archetype stats
          getLatestMetaSnapshots(),
          getArchetypeStats(),
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

      // Precomputed card deltas are server-side and instant (plan
      // recommendation-to-prognosis §3.7/decision 3: "sofort verfuegbar",
      // no click required) — auto-load them whenever the active archetype
      // actually changes, not on every unrelated refresh. Awaited (not
      // fire-and-forget) for determinism, but it never fails `refresh()`:
      // loadCardStats already catches and reports its own errors, and the
      // main `isLoading` flag above is already false by this point, so it
      // doesn't hold up the rest of the UI.
      if (activeDeck && activeDeck.archetype !== previousArchetype) {
        await get().loadCardStats(activeDeck.archetype);
      } else if (!activeDeck && previousArchetype !== undefined) {
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
      const result = await fetchArchetypeComparison(slug, deckCards, (msg) =>
        set({ compareProgress: msg }),
      );
      // loadCardStats never throws — its own try/catch keeps a delta-fetch
      // failure from ever reaching (and failing) this comparison run.
      await get().loadCardStats(slug);
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
}));
