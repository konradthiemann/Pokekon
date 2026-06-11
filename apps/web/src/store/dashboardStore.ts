import { create } from 'zustand';
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
  getArchetypeStats,
  getDeckSnapshots,
  saveDeckSnapshot,
  getDecks,
  createDeck,
  updateDeck,
  deleteDeck as deleteDeckFromDb,
  copyDeckCards,
} from '../db/queries';
import { db } from '../db/database';
import { syncLiveMeta, fetchRecentTournaments } from '../lib/metaFetch';
import type { MetaSyncResult } from '../lib/metaFetch';
import { fetchArchetypeComparison } from '../lib/deckComparison';
import type { ComparisonResult } from '../lib/deckComparison';
import {
  getLocalMeta,
  setLocalMeta,
  getDeckArchSlug,
  setDeckArchSlug,
  getActiveDeckId,
  setActiveDeckId,
} from '../lib/preferences';

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
  setActiveTab: (tab: DashboardState['activeTab'] | 'opponents') => void;
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
   * Hydrates all store state from IndexedDB: decks, active deck, cards, snapshots, logs,
   * meta snapshots, and archetype stats. Called on app mount and after every mutation.
   *
   * Deck fallback: if no decks exist (e.g. first launch or failed migration) a default
   * "My Deck" is created and all untagged cards/logs/snapshots are re-associated with it
   * inside a single atomic transaction, so legacy data is never silently discarded.
   */
  refresh: async () => {
    set({ isLoading: true });
    try {
      // Load decks first to determine active deck
      let decks = await getDecks();

      // ── Safety net: if no decks exist but there is card/log data (e.g. legacy data
      //    that predates multi-deck, or a failed migration), auto-create a default deck
      //    and re-associate all un-tagged records so nothing is lost. ──────────────────
      if (decks.length === 0) {
        const defaultId = await createDeck({
          archetype: 'my-deck',
          archetypeName: 'My Deck',
          variant: 'Default',
          createdAt: new Date().toISOString(),
        });
        // Stamp any records that have no deckId yet — wrapped in a transaction
        // so all three tables are updated atomically; a failure in one leaves
        // none of them partially migrated.
        await db.transaction('rw', db.deckCards, db.deckSnapshots, db.opponentLogs, async () => {
          await db.deckCards.filter((c) => !c.deckId).modify({ deckId: defaultId });
          await db.deckSnapshots.filter((s) => !s.deckId).modify({ deckId: defaultId });
          await db.opponentLogs.filter((l) => !l.deckId).modify({ deckId: defaultId });
        });
        decks = await getDecks();
      }

      let activeDeckId = get().activeDeckId;

      // If no active deck ID or it doesn't exist, pick the first deck
      if (!activeDeckId || !decks.find((d) => d.id === activeDeckId)) {
        activeDeckId = decks[0]?.id ?? null;
        if (activeDeckId) setActiveDeckId(activeDeckId);
      }

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
    } catch (err) {
      console.error('[DashboardStore] refresh failed:', err);
      set({ isLoading: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab === 'opponents' ? 'deck' : tab }),

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
    set({ isSyncing: true, syncError: null, syncProgress: 'Starting…' });
    try {
      const result = await syncLiveMeta((msg) => set({ syncProgress: msg }));
      set({ isSyncing: false, syncProgress: '', lastSynced: new Date(), syncError: null });
      await get().refresh();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
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
        tournamentsError: err instanceof Error ? err.message : 'Failed',
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
      set({ compareError: 'Set your deck archetype slug first (e.g. "n-zoroark").' });
      return;
    }
    set({ isComparing: true, compareError: null, compareProgress: 'Starting…' });
    try {
      const result = await fetchArchetypeComparison(slug, deckCards, (msg) =>
        set({ compareProgress: msg }),
      );
      set({ comparisonResult: result, isComparing: false, compareProgress: '' });
    } catch (err) {
      set({
        isComparing: false,
        compareProgress: '',
        compareError: err instanceof Error ? err.message : 'Comparison failed',
      });
    }
  },
}));
