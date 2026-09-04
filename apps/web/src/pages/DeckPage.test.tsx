import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { create } from 'zustand';
import i18n from '../i18n';
import { DeckPage } from './DeckPage';
import type { Deck, OpponentLog } from '../types';
import type { DeckSection } from '../store/dashboardStore';

// DeckSynthesisPanel (mounted inside DeckTipsSection, plan
// ai-recommendation-synthesis.md §3.10) reads the session to tell demo
// guests apart from regular users — mock it the same way
// DeckSynthesisPanel.test.tsx does so this suite never hits the network.
vi.mock('../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null, refetch: vi.fn() })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const DECK: Deck = {
  id: 1,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Standard',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    id: over.id ?? 1,
    deckId: 1,
    archetype: 'Gardevoir',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

const OPPONENT_LOGS: OpponentLog[] = [log({ id: 1 }), log({ id: 2, result: 'L' })];

interface DeckPageStoreMock {
  decks: Deck[];
  activeDeckId: number | null;
  activeDeck: Deck | null;
  deckCards: unknown[];
  opponentLogs: OpponentLog[];
  metaSnapshots: unknown[];
  deckSnapshots: unknown[];
  localMeta: string[];
  archetypeStats: unknown[];
  deckSection: DeckSection;
  cardStats: unknown[];
  deckArchSlug: string | null;
  comparisonResult: unknown;
  isComparing: boolean;
  compareProgress: unknown;
  compareError: unknown;
  // Deck-synthesis slice (plan ai-recommendation-synthesis.md §3.10) —
  // required so DeckSynthesisPanel, mounted inside DeckTipsSection, doesn't
  // read `undefined`.
  deckSynthesis: unknown;
  isLoadingSynthesis: boolean;
  isSynthesizing: boolean;
  synthesisError: string | null;
  loadDeckSynthesis: () => void;
  runDeckSynthesis: () => void;
  runDeckComparison: () => void;
  setActiveTab: () => void;
  setDeckSection: (section: DeckSection) => void;
  setActiveDeck: () => void;
  removeDecks: () => void;
  updateCurrentDeck: () => void;
  duplicateDeckAsVariant: () => void;
  setLocalMeta: () => void;
  refresh: () => void;
  patchDeckCards: () => void;
}

// Stateful mock (pattern: OverviewPage.test.tsx §30-40's mutable `storeState`
// object) — backed by the real `zustand` `create()` instead of a plain
// object, because the section tab now lives in the store (`deckSection` /
// `setDeckSection`, plan ui-ux-hub-rework.md §3.4) instead of local
// `useState`. A plain mutable object is read once per render and cannot make
// a `setDeckSection` call from inside DeckPage re-render the tree — nothing
// would subscribe to the mutation. A real zustand store gives the same
// subscribe/notify behaviour the production store has, so a tab click is
// actually visible in the same way it will be once `DeckPage` reads
// `deckSection` from the (real) store instead of `useState`.
const useTestStore = create<DeckPageStoreMock>((set) => ({
  decks: [DECK],
  activeDeckId: 1,
  activeDeck: DECK,
  deckCards: [],
  opponentLogs: OPPONENT_LOGS,
  metaSnapshots: [],
  deckSnapshots: [],
  localMeta: [],
  archetypeStats: [],
  deckSection: 'deck',
  cardStats: [],
  deckArchSlug: null,
  comparisonResult: null,
  isComparing: false,
  compareProgress: null,
  compareError: null,
  deckSynthesis: null,
  isLoadingSynthesis: false,
  isSynthesizing: false,
  synthesisError: null,
  loadDeckSynthesis: vi.fn(),
  runDeckSynthesis: vi.fn(),
  runDeckComparison: vi.fn(),
  setActiveTab: vi.fn(),
  setDeckSection: (section) => set({ deckSection: section }),
  setActiveDeck: vi.fn(),
  removeDecks: vi.fn(),
  updateCurrentDeck: vi.fn(),
  duplicateDeckAsVariant: vi.fn(),
  setLocalMeta: vi.fn(),
  refresh: vi.fn(),
  patchDeckCards: vi.fn(),
}));

vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => useTestStore(),
}));

beforeEach(() => {
  useTestStore.setState({ deckSection: 'deck' });
});

// DeckPanel/DeckSwitcher/OpponentLog mutate via db/queries on user
// interaction only (never at mount) — auto-mocked so no IndexedDB/API call
// happens in this render test.
vi.mock('../db/queries');

// DeckTurnQualityPanel (inside DeckAnalyticsPanel) fetches server analytics on
// mount — stub it so the test never hits the network.
vi.mock('../lib/api', () => ({
  getDeckAnalytics: vi.fn().mockResolvedValue({
    record: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    goingFirst: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    goingSecond: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    setup: { cleanRatePct: null, parsedGames: 0 },
    deadTurns: { avgPerGame: null, parsedGames: 0 },
    prizeCurveWins: [],
  }),
}));

describe('DeckPage — information architecture (plan personal-data-role-rework §3.8, extended by plan ui-ux-hub-rework.md §3.4)', () => {
  it('has exactly three section tabs (Deck List · Analytics · Tips), and none is labelled "Match Log"', () => {
    // Deliberate, documented change (tdd.md, plan ui-ux-hub-rework.md §5
    // risk 2): this used to assert "exactly two" tabs. "Mein Deck" gains a
    // third "Tips" section for the migrated recommendations/comparison
    // content. The invariant that Spec 4 actually protects — the match log
    // is NOT a tab — is unchanged and still asserted below.
    render(<DeckPage />);
    expect(screen.getByRole('button', { name: /deck list/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^tips$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /match log/i })).not.toBeInTheDocument();
  });

  it('shows a small, permanently visible "Log match" button next to the tabs, on both sections', () => {
    render(<DeckPage />);
    expect(screen.getByRole('button', { name: /log match/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /analytics/i }));
    expect(screen.getByRole('button', { name: /log match/i })).toBeInTheDocument();
  });

  it('opens the AddLogModal when "Log match" is clicked', () => {
    render(<DeckPage />);
    fireEvent.click(screen.getByRole('button', { name: /log match/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the match log as an initially-collapsed section inside Analytics, with the log count in its title', () => {
    render(<DeckPage />);
    fireEvent.click(screen.getByRole('button', { name: /analytics/i }));

    const sectionHeader = screen.getByRole('button', { name: /match.log.*2/i });
    expect(sectionHeader).toBeInTheDocument();
    // Collapsed by default — the raw log TABLE is not in the document yet.
    // NOTE (deliberate test correction, not a silent tweak — tdd.md): the
    // original assertion checked for the text "Gardevoir" being absent, but
    // DeckAnalyticsPanel's always-visible MatchupList (a pre-existing,
    // unrelated feature — a per-archetype win-rate breakdown, not the raw
    // log) legitimately renders every faced archetype's name regardless of
    // whether the match-log section below it is expanded. Asserting on the
    // <table> role instead targets exactly what this test is about: the log
    // TABLE's collapsed/expanded state.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(sectionHeader);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('Gardevoir').length).toBeGreaterThan(0);
  });
});

describe('DeckPage — "Tips" section (plan ui-ux-hub-rework.md §3.4)', () => {
  it('renders the deck comparison section when the "Tips" tab is clicked', () => {
    render(<DeckPage />);
    fireEvent.click(screen.getByRole('button', { name: /^tips$/i }));

    // recommendations:comparison.sectionTitle — "List Comparison vs. Tournament Results"
    expect(screen.getByText(/list comparison vs\. tournament results/i)).toBeInTheDocument();
  });

  it('keeps the "Log match" button visible in the Tips section', () => {
    render(<DeckPage />);
    fireEvent.click(screen.getByRole('button', { name: /^tips$/i }));

    expect(screen.getByRole('button', { name: /log match/i })).toBeInTheDocument();
  });
});

describe('DeckPage — Local Meta moved off the deck list (plan ui-ux-hub-rework.md §3.4, §3.5)', () => {
  it('does not render the Local Meta panel in the "Deck List" section anymore', () => {
    render(<DeckPage />);
    // deck:localMeta.title — "Local Meta". The panel now lives on the Meta
    // page (§3.5); "Deckliste" keeps only DeckSettingsWidget.
    expect(screen.queryByText('Local Meta')).not.toBeInTheDocument();
  });
});
