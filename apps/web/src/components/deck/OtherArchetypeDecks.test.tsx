import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { OtherArchetypeDecks } from './OtherArchetypeDecks';

let store: Record<string, unknown>;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

const deck = (id: number, archetype: string, archetypeName = archetype) => ({
  id,
  archetype,
  archetypeName,
  variant: '',
  createdAt: '2026-09-01',
});

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = {
    activeArchetypeId: 'dragapult-ex',
    decks: [
      deck(1, 'dragapult-ex'),
      deck(2, 'n-zoroark', "N's Zoroark"),
      deck(7, 'N Zoroark', 'N Zoroark'),
    ],
    setActiveArchetype: vi.fn(),
    reassignDeckArchetype: vi.fn(),
  };
});

describe('OtherArchetypeDecks (Spec 7 Scheibe 2, risk R2)', () => {
  it('renders nothing without decks of other archetypes', () => {
    store.decks = [deck(1, 'dragapult-ex')];
    const { container } = render(<OtherArchetypeDecks />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers switching to another valid archetype', async () => {
    render(<OtherArchetypeDecks />);
    await userEvent.click(screen.getByRole('button', { name: /Switch to N's Zoroark/ }));
    expect(store.setActiveArchetype).toHaveBeenCalledWith('n-zoroark');
  });

  it('offers assigning a legacy deck with an invalid slug to the active archetype', async () => {
    render(<OtherArchetypeDecks />);
    expect(screen.queryByRole('button', { name: /Switch to N Zoroark/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Assign N Zoroark/ }));
    expect(store.reassignDeckArchetype).toHaveBeenCalledWith(7);
  });

  it('uses real buttons of at least 44 px', () => {
    render(<OtherArchetypeDecks />);
    for (const b of screen.getAllByRole('button'))
      expect(b.className).toMatch(/min-h-\[44px\]|\bbtn/);
  });
});
