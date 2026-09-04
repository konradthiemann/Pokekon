import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { DeckTipsSection } from './DeckTipsSection';
import type { OpponentLog } from '../../types';

// DeckSynthesisPanel (mounted here as of plan ai-recommendation-synthesis.md
// §3.10) reads the session to tell demo guests apart from regular users —
// mock it the same way DeckSynthesisPanel.test.tsx does (pattern:
// Sidebar.test.tsx, UserMenu.test.tsx) so this suite never hits the network.
vi.mock('../../lib/authClient', () => ({
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

beforeEach(() => {
  localStorage.clear();
});

function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    deckId: 1,
    archetype: 'Gardevoir',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

let opponentLogs: OpponentLog[];

// Same store surface RecommendationsPage.test.tsx used (plan §3.4.1: the
// section reads everything from the store, same as the page did before it).
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    deckCards: [],
    archetypeStats: [],
    opponentLogs,
    deckSnapshots: [],
    localMeta: [],
    activeDeckId: null,
    activeDeck: null,
    cardStats: [],
    deckArchSlug: null,
    comparisonResult: null,
    isComparing: false,
    compareProgress: null,
    compareError: null,
    runDeckComparison: vi.fn(),
    setActiveTab: vi.fn(),
    setDeckSection: vi.fn(),
    // Deck-synthesis slice (plan ai-recommendation-synthesis.md §3.10,
    // dashboardStore.ts:104-107,150-154) — required so DeckSynthesisPanel,
    // mounted directly above RecommendationsPanel, doesn't read `undefined`.
    deckSynthesis: null,
    isLoadingSynthesis: false,
    isSynthesizing: false,
    synthesisError: null,
    loadDeckSynthesis: vi.fn(),
    runDeckSynthesis: vi.fn(),
  }),
}));

describe('DeckTipsSection — meta works without personal logs (plan ui-ux-hub-rework §3.4.1, migrated from RecommendationsPage.test.tsx §41-58)', () => {
  it('shows a notice explaining meta analysis works without logs, listing the three real thresholds, when there are zero logs', () => {
    opponentLogs = [];
    render(<DeckTipsSection />);

    expect(screen.getByText(/5.*(encounters|games).*per archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/3.*games.*(battle log|log)/i)).toBeInTheDocument();
    expect(screen.getByText(/2.*deck versions.*4.*logs/i)).toBeInTheDocument();
  });

  it('does not show the zero-logs notice once at least one log exists (the existing <10-logs hint may still show)', () => {
    opponentLogs = [log({})];
    render(<DeckTipsSection />);

    expect(screen.queryByText(/works without/i)).not.toBeInTheDocument();
    // The pre-existing "log more matches" hint (< 10 logs) must still work.
    expect(screen.getByText(/log 10\+ matches/i)).toBeInTheDocument();
  });
});

describe('DeckTipsSection — deck comparison lives here (plan ui-ux-hub-rework §3.4.1, item 5)', () => {
  it('renders the comparison section title', () => {
    opponentLogs = [];
    render(<DeckTipsSection />);

    // recommendations:comparison.sectionTitle — "List Comparison vs. Tournament Results"
    expect(screen.getByText(/list comparison vs\. tournament results/i)).toBeInTheDocument();
  });
});

describe('DeckTipsSection — deck synthesis panel is mounted above the recommendations list (plan ai-recommendation-synthesis.md §3.10: "direkt über <RecommendationsPanel />")', () => {
  it("renders the DeckSynthesisPanel before RecommendationsPanel's content in DOM order", () => {
    opponentLogs = [];
    render(<DeckTipsSection />);

    // archetypeStats is always [] in this mock, so useRecommendations short-
    // circuits to [] and RecommendationsPanel renders its `panel.empty` text
    // (RecommendationsPanel.tsx) — a stable anchor regardless of log state.
    const synthesisPanel = screen.getByTestId('deck-synthesis-panel');
    const recommendationsEmptyText = screen.getByText(/no recommendations yet/i);

    expect(
      synthesisPanel.compareDocumentPosition(recommendationsEmptyText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
