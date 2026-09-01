import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { DeckSwitcher } from './DeckSwitcher';
import type { Deck, OpponentLog } from '../../types';

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

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    decks: [DECK],
    activeDeckId: 1,
    // 2W/1L/3T: naive wins/(wins+losses) = 67 %, tie-weighted
    // (2 + 3*(1/3)) / 6 = 3/6 = 50 % (plan personal-data-role-rework §6
    // decision 1 — one of the five carried-over Spec-2 win-rate laggards).
    opponentLogs: [
      log({ result: 'W' }),
      log({ result: 'W' }),
      log({ result: 'L' }),
      log({ result: 'T' }),
      log({ result: 'T' }),
      log({ result: 'T' }),
    ],
    setActiveDeck: vi.fn(),
    removeDecks: vi.fn(),
    updateCurrentDeck: vi.fn(),
  }),
}));

describe('DeckSwitcher — per-deck win-rate pill (plan §6 decision 1)', () => {
  it('counts ties as a third of a win in the per-deck WR pill', () => {
    render(<DeckSwitcher />);
    expect(screen.getByText('50% · 6g')).toBeInTheDocument();
    expect(screen.queryByText('67% · 6g')).not.toBeInTheDocument();
  });
});
