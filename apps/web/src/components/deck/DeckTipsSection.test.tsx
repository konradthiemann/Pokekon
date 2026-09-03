import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { DeckTipsSection } from './DeckTipsSection';
import type { OpponentLog } from '../../types';

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
