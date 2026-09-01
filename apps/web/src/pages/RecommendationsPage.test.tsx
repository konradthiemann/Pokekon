import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { RecommendationsPage } from './RecommendationsPage';
import type { OpponentLog } from '../types';

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

vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    deckCards: [],
    archetypeStats: [],
    opponentLogs,
    deckSnapshots: [],
    localMeta: [],
    activeDeckId: null,
    activeDeck: null,
  }),
}));

describe('RecommendationsPage — meta works without personal logs (plan personal-data-role-rework §3.8)', () => {
  it('shows a notice explaining meta analysis works without logs, listing the three real thresholds, when there are zero logs', () => {
    opponentLogs = [];
    render(<RecommendationsPage />);

    expect(screen.getByText(/5.*(encounters|games).*per archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/3.*games.*(battle log|log)/i)).toBeInTheDocument();
    expect(screen.getByText(/2.*deck versions.*4.*logs/i)).toBeInTheDocument();
  });

  it('does not show the zero-logs notice once at least one log exists (the existing <10-logs hint may still show)', () => {
    opponentLogs = [log({})];
    render(<RecommendationsPage />);

    expect(screen.queryByText(/works without/i)).not.toBeInTheDocument();
    // The pre-existing "log more matches" hint (< 10 logs) must still work.
    expect(screen.getByText(/log 10\+ matches/i)).toBeInTheDocument();
  });
});
