import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CoachingPage } from './CoachingPage';

interface StoreMock {
  activeArchetypeId: string | null;
  activeDeckId: number | null;
  decks: { id: number; archetype: string }[];
  opponentLogs: { id: number; deckId: number; archetype: string }[];
  refresh: ReturnType<typeof vi.fn>;
}
let store: StoreMock;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

let shownLogs: { id: number }[] = [];
vi.mock('../../components/opponent/OpponentLog', () => ({
  OpponentLog: ({ logs }: { logs: { id: number }[] }) => {
    shownLogs = logs;
    return <div data-testid="opponent-log" />;
  },
}));
vi.mock('../../components/opponent/AddLogModal', () => ({
  AddLogModal: ({ preselectedDeckId }: { preselectedDeckId?: number }) => (
    <div role="dialog" aria-label="add-log-stub" data-deck={preselectedDeckId} />
  ),
}));
vi.mock('../../components/deck/DeckTurnQualityPanel', () => ({
  DeckTurnQualityPanel: ({ deckId }: { deckId: number }) => (
    <div data-testid="turn-quality" data-deck={deckId} />
  ),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  shownLogs = [];
  store = {
    activeArchetypeId: 'dragapult-ex',
    activeDeckId: 3,
    decks: [
      { id: 3, archetype: 'dragapult-ex' },
      { id: 4, archetype: 'dragapult-ex' },
      { id: 9, archetype: 'n-zoroark' },
    ],
    opponentLogs: [
      { id: 1, deckId: 3, archetype: 'Gardevoir ex' },
      { id: 2, deckId: 4, archetype: 'Raging Bolt ex' },
      { id: 3, deckId: 9, archetype: 'Charizard ex' },
    ],
    refresh: vi.fn(),
  };
});

describe('CoachingPage (Spec 7 §5.4, Scheibe 1)', () => {
  it('has a prominent "paste TCG Live log" action for the active deck', async () => {
    render(<CoachingPage />);
    await userEvent.click(screen.getByRole('button', { name: /Paste TCG Live log/ }));
    expect(screen.getByRole('dialog', { name: 'add-log-stub' })).toHaveAttribute('data-deck', '3');
  });

  it('lists only logs of decks of the active archetype', () => {
    render(<CoachingPage />);
    expect(shownLogs.map((l) => l.id)).toEqual([1, 2]);
  });

  it('shows turn quality for the active deck, and none without one', () => {
    const { unmount } = render(<CoachingPage />);
    expect(screen.getByTestId('turn-quality')).toHaveAttribute('data-deck', '3');
    unmount();
    store.activeDeckId = null;
    render(<CoachingPage />);
    expect(screen.queryByTestId('turn-quality')).toBeNull();
  });

  it('explains how to copy a log from TCG Live when there are no logs', () => {
    store.opponentLogs = [];
    render(<CoachingPage />);
    expect(screen.getByRole('list', { name: /copy a log/i })).toBeInTheDocument();
    expect(screen.queryByTestId('opponent-log')).toBeNull();
  });
});
