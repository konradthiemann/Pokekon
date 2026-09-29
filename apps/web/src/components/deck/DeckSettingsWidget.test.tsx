import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { DeckSettingsWidget } from './DeckSettingsWidget';

let store: Record<string, unknown>;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = {
    activeDeck: {
      id: 3,
      archetype: 'dragapult-ex',
      archetypeName: 'Dragapult ex',
      variant: 'Dusknoir',
    },
    activeArchetypeId: 'dragapult-ex',
    decks: [],
    updateCurrentDeck: vi.fn(),
    duplicateDeckAsVariant: vi.fn(),
  };
});

describe('DeckSettingsWidget lockArchetype (Spec 7 E13)', () => {
  it('hides the slug and archetype-name inputs and shows the archetype as text', () => {
    render(<DeckSettingsWidget lockArchetype />);
    expect(screen.queryByPlaceholderText('n-zoroark')).toBeNull();
    expect(screen.queryByDisplayValue('Dragapult ex')).toBeNull();
    expect(screen.getByText(/Archetype: Dragapult ex/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Dusknoir')).toBeInTheDocument();
  });

  it('saves only the variant', async () => {
    render(<DeckSettingsWidget lockArchetype />);
    const input = screen.getByDisplayValue('Dusknoir');
    await userEvent.clear(input);
    await userEvent.type(input, 'Budew');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(store.updateCurrentDeck).toHaveBeenCalledWith({ variant: 'Budew' });
  });

  it('without lockArchetype keeps the archetype-name input and the slug field (legacy)', async () => {
    render(<DeckSettingsWidget />);
    expect(screen.getByDisplayValue('Dragapult ex')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Limitless slug/i }));
    expect(screen.getByPlaceholderText('n-zoroark')).toBeInTheDocument();
  });
});
