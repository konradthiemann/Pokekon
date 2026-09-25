import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { Deck } from '../../types';
import { DeckSwitcher } from './DeckSwitcher';

const deck = (id: number, archetype: string, variant: string): Deck => ({
  id,
  archetype,
  archetypeName: archetype,
  variant,
  createdAt: '2026-01-01T00:00:00.000Z',
});

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    decks: [deck(1, 'dragapult-ex', 'Dusknoir'), deck(2, 'n-zoroark', 'Reshiram')],
    activeDeckId: 1,
    opponentLogs: [],
    setActiveDeck: vi.fn(),
    removeDecks: vi.fn(),
    updateCurrentDeck: vi.fn(),
  }),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('DeckSwitcher archetypeFilter (Spec 7 §5.3)', () => {
  it('shows only decks of archetypeFilter when set', () => {
    render(<DeckSwitcher archetypeFilter="dragapult-ex" />);
    expect(screen.getByText('Dusknoir')).toBeInTheDocument();
    expect(screen.queryByText('Reshiram')).toBeNull();
  });

  it('shows all decks without archetypeFilter (legacy behaviour)', () => {
    render(<DeckSwitcher />);
    expect(screen.getByText('Dusknoir')).toBeInTheDocument();
    expect(screen.getByText('Reshiram')).toBeInTheDocument();
  });
});
