import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { OverviewPage } from './OverviewPage';
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
    deckId: 1,
    archetype: 'Gardevoir',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

let storeState: {
  activeDeckId: number | null;
  activeDeck: Deck | null;
  deckCards: unknown[];
  opponentLogs: OpponentLog[];
  metaSnapshots: unknown[];
  archetypeStats: unknown[];
};

vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

describe('OverviewPage — personal win-rate stat (plan personal-data-role-rework §6 decision 1)', () => {
  it('counts ties as a third of a win in the "Win rate" stat card', () => {
    // 2W/1L/3T: naive wins/(wins+losses) = 67 %, tie-weighted
    // (2 + 3*(1/3)) / 6 = 3/6 = 50 %.
    storeState = {
      activeDeckId: 1,
      activeDeck: DECK,
      deckCards: [],
      opponentLogs: [
        log({ result: 'W' }),
        log({ result: 'W' }),
        log({ result: 'L' }),
        log({ result: 'T' }),
        log({ result: 'T' }),
        log({ result: 'T' }),
      ],
      metaSnapshots: [],
      archetypeStats: [],
    };
    render(<OverviewPage />);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByText('67%')).not.toBeInTheDocument();
  });
});

describe('OverviewPage — meta works without personal logs (plan §3.8)', () => {
  it('shows a notice explaining meta analysis works without logs, listing the three real thresholds, when there are zero logs', () => {
    storeState = {
      activeDeckId: 1,
      activeDeck: DECK,
      deckCards: [],
      opponentLogs: [],
      metaSnapshots: [],
      archetypeStats: [],
    };
    render(<OverviewPage />);

    // The three real recommendation thresholds (useRecommendations.ts /
    // docs/features.md §10) must appear verbatim as a static list.
    expect(screen.getByText(/5.*(encounters|games).*per archetype/i)).toBeInTheDocument();
    expect(screen.getByText(/3.*games.*(battle log|log)/i)).toBeInTheDocument();
    expect(screen.getByText(/2.*deck versions.*4.*logs/i)).toBeInTheDocument();
  });

  it('does not show the zero-logs notice once at least one log exists', () => {
    storeState = {
      activeDeckId: 1,
      activeDeck: DECK,
      deckCards: [],
      opponentLogs: [log({ result: 'W' })],
      metaSnapshots: [],
      archetypeStats: [],
    };
    render(<OverviewPage />);
    expect(screen.queryByText(/works without/i)).not.toBeInTheDocument();
  });
});
