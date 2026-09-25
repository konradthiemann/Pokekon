import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { FieldAnalysisArchetype } from '../../lib/api';
import { StartPage } from './StartPage';

const today = new Date().toISOString().slice(0, 10);

interface StoreMock {
  activeArchetypeId: string | null;
  activeDeck: { id: number; archetype: string; archetypeName: string; variant: string } | null;
  activeDeckId: number | null;
  decks: {
    id: number;
    archetype: string;
    archetypeName: string;
    variant: string;
    createdAt: string;
  }[];
  deckCards: { name: string; count: number; type: string }[];
  opponentLogs: {
    id: number;
    deckId: number;
    archetype: string;
    eventDate: string;
    result: string;
  }[];
  archetypeStats: { archetype: string; encounters: number; winRate: number }[];
  setCoachTab: ReturnType<typeof vi.fn>;
  setDeckView: ReturnType<typeof vi.fn>;
}
let store: StoreMock;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

let field: FieldAnalysisArchetype[] = [];
vi.mock('../../hooks/useFieldAnalysis', () => ({
  useFieldAnalysis: () => ({ data: { archetypes: field }, isLoading: false, error: false }),
}));
vi.mock('../../components/opponent/AddLogModal', () => ({
  AddLogModal: ({ preselectedDeckId }: { preselectedDeckId?: number }) => (
    <div role="dialog" aria-label="add-log-stub" data-deck={preselectedDeckId} />
  ),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const DECK = {
  id: 3,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Dusknoir',
  createdAt: '2026-09-01',
};

beforeEach(() => {
  field = [
    { archetypeId: 'gardevoir-ex', archetypeName: 'Gardevoir ex', sharePct: 12 },
    { archetypeId: 'raging-bolt-ex', archetypeName: 'Raging Bolt ex', sharePct: 9 },
  ] as FieldAnalysisArchetype[];
  store = {
    activeArchetypeId: 'dragapult-ex',
    activeDeck: DECK,
    activeDeckId: 3,
    decks: [
      DECK,
      {
        id: 9,
        archetype: 'n-zoroark',
        archetypeName: "N's Zoroark",
        variant: '',
        createdAt: '2026-09-01',
      },
    ],
    deckCards: [{ name: 'Dragapult ex', count: 3, type: 'Pokemon' }],
    opponentLogs: [
      { id: 1, deckId: 3, archetype: 'Gardevoir ex', eventDate: today, result: 'W' },
      { id: 2, deckId: 3, archetype: 'Raging Bolt ex', eventDate: today, result: 'L' },
      { id: 3, deckId: 3, archetype: 'Charizard ex', eventDate: '2026-01-02', result: 'W' },
      { id: 4, deckId: 3, archetype: 'Gholdengo ex', eventDate: '2026-01-01', result: 'W' },
      { id: 5, deckId: 9, archetype: 'Other deck log', eventDate: today, result: 'W' },
    ],
    archetypeStats: [{ archetype: 'Gardevoir ex', encounters: 1, winRate: 100 }],
    setCoachTab: vi.fn(),
    setDeckView: vi.fn(),
  };
});

describe('StartPage (Spec 7 §5.2)', () => {
  it('renders the five blocks in order', () => {
    render(<StartPage />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Active list',
      'Next step',
      'Your form',
      'Field this week',
      'Recent games',
    ]);
  });

  it('offers copying the active list for TCG Live', () => {
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Active list' });
    expect(within(block).getByText('Dusknoir')).toBeInTheDocument();
    expect(within(block).getByRole('button', { name: /TCG Live|Copy/i })).toBeInTheDocument();
  });

  it('without a deck offers adopting a list (→ Deck › My lists)', async () => {
    store.activeDeck = null;
    store.activeDeckId = null;
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Active list' });
    await userEvent.click(within(block).getByRole('button', { name: /Set up a list/ }));
    expect(store.setCoachTab).toHaveBeenCalledWith('deck');
    expect(store.setDeckView).toHaveBeenCalledWith('myLists');
  });

  it('next step "paste a log" opens AddLogModal for the active deck', async () => {
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Next step' });
    await userEvent.click(within(block).getByRole('button', { name: /Paste a log/ }));
    expect(screen.getByRole('dialog', { name: 'add-log-stub' })).toHaveAttribute('data-deck', '3');
  });

  it('shows the recent form of this archetype only', () => {
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Your form' });
    expect(block).toHaveTextContent('1–1–0');
  });

  it('lists the field with own win rates; tapping an opponent opens Opponents', async () => {
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Field this week' });
    expect(block).toHaveTextContent('Gardevoir ex');
    expect(block).toHaveTextContent('100 %');
    await userEvent.click(within(block).getByRole('button', { name: /Gardevoir ex/ }));
    expect(store.setCoachTab).toHaveBeenCalledWith('opponents');
  });

  it('shows exactly the 3 newest games of this archetype; tapping one opens Coaching', async () => {
    render(<StartPage />);
    const block = screen.getByRole('region', { name: 'Recent games' });
    const games = within(block).getAllByRole('button');
    expect(games).toHaveLength(3);
    expect(block).not.toHaveTextContent('Other deck log');
    expect(block).not.toHaveTextContent('Gholdengo ex');
    await userEvent.click(games[0]!);
    expect(store.setCoachTab).toHaveBeenCalledWith('coaching');
  });

  it('without games explains how to start', () => {
    store.opponentLogs = [];
    render(<StartPage />);
    expect(screen.getByRole('region', { name: 'Recent games' })).toHaveTextContent(/Play a round/);
  });
});
