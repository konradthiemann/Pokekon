import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../i18n';
import { DeckPage } from './DeckPage';
import type { Deck, OpponentLog } from '../types';

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

vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    decks: [DECK],
    activeDeckId: 1,
    activeDeck: DECK,
    deckCards: [],
    opponentLogs: OPPONENT_LOGS,
    metaSnapshots: [],
    deckSnapshots: [],
    localMeta: [],
    archetypeStats: [],
    setActiveDeck: vi.fn(),
    removeDecks: vi.fn(),
    updateCurrentDeck: vi.fn(),
    duplicateDeckAsVariant: vi.fn(),
    setLocalMeta: vi.fn(),
    refresh: vi.fn(),
    patchDeckCards: vi.fn(),
  }),
}));

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

describe('DeckPage — information architecture (plan personal-data-role-rework §3.8)', () => {
  it('has exactly two section tabs, and neither is labelled "Match Log"', () => {
    render(<DeckPage />);
    expect(screen.getByRole('button', { name: /deck list/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analytics/i })).toBeInTheDocument();
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
