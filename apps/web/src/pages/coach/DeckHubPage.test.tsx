import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { DeckHubPage } from './DeckHubPage';

interface StoreMock {
  activeArchetypeId: string | null;
  activeDeck: { id: number; archetype: string; archetypeName: string } | null;
  activeDeckId: number | null;
  decks: { id: number; archetype: string; archetypeName: string }[];
  deckCards: unknown[];
  opponentLogs: unknown[];
  metaSnapshots: unknown[];
  deckView: 'metaList' | 'myLists';
  setDeckView: ReturnType<typeof vi.fn>;
  setCoachTab: ReturnType<typeof vi.fn>;
  createNewDeck: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
}
let store: StoreMock;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));

const seen: Record<string, unknown> = {};
vi.mock('../../components/deck/DeckSwitcher', () => ({
  DeckSwitcher: (p: { archetypeFilter?: string }) => {
    seen.switcherFilter = p.archetypeFilter;
    return <div data-testid="deck-switcher" />;
  },
}));
vi.mock('../../components/deck/DeckPanel', () => ({
  DeckPanel: () => <div data-testid="deck-panel" />,
}));
vi.mock('../../components/deck/DeckSettingsWidget', () => ({
  DeckSettingsWidget: () => <div data-testid="deck-settings" />,
}));
vi.mock('../../components/deck/DeckAnalyticsPanel', () => ({
  DeckAnalyticsPanel: (p: { omitTurnQuality?: boolean }) => {
    seen.omitTurnQuality = p.omitTurnQuality;
    return <div data-testid="deck-analytics" />;
  },
}));
vi.mock('../../components/deck/DeckTipsSection', () => ({
  DeckTipsSection: (p: { onOpenLocalMeta?: () => void }) => (
    <button data-testid="deck-tips" onClick={p.onOpenLocalMeta}>
      tips
    </button>
  ),
}));
vi.mock('../../components/meta/MyMatchupsTable', () => ({
  MyMatchupsTable: () => <div data-testid="my-matchups" />,
}));
vi.mock('../../components/coach/onboarding/OnboardingFlow', () => ({
  ListSetup: () => <div data-testid="list-setup" />,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const DECK = { id: 3, archetype: 'dragapult-ex', archetypeName: 'Dragapult ex' };
beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
  store = {
    activeArchetypeId: 'dragapult-ex',
    activeDeck: DECK,
    activeDeckId: 3,
    decks: [DECK],
    deckCards: [],
    opponentLogs: [],
    metaSnapshots: [],
    deckView: 'myLists',
    setDeckView: vi.fn(),
    setCoachTab: vi.fn(),
    createNewDeck: vi.fn(),
    refresh: vi.fn(),
  };
});

describe('DeckHubPage (Spec 7 §5.3)', () => {
  it('has exactly the two segments Meta list and My lists (no Lab before Spec 6)', () => {
    render(<DeckHubPage />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Meta list', 'My lists']);
    expect(screen.getByRole('tab', { name: 'My lists' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches segments via setDeckView', async () => {
    render(<DeckHubPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'Meta list' }));
    expect(store.setDeckView).toHaveBeenCalledWith('metaList');
  });

  it('My lists: filtered switcher, deck panel, settings and analytics without turn quality', () => {
    render(<DeckHubPage />);
    expect(screen.getByTestId('deck-switcher')).toBeInTheDocument();
    expect(seen.switcherFilter).toBe('dragapult-ex');
    expect(screen.getByTestId('deck-panel')).toBeInTheDocument();
    expect(screen.getByTestId('deck-settings')).toBeInTheDocument();
    expect(screen.getByTestId('deck-analytics')).toBeInTheDocument();
    expect(seen.omitTurnQuality).toBe(true);
  });

  it('Meta list: deck tips whose local-meta link opens Opponents', async () => {
    store.deckView = 'metaList';
    render(<DeckHubPage />);
    await userEvent.click(screen.getByTestId('deck-tips'));
    expect(store.setCoachTab).toHaveBeenCalledWith('opponents');
  });

  it('keeps "log match" and MyMatchupsTable off this page', () => {
    render(<DeckHubPage />);
    expect(screen.queryByTestId('my-matchups')).toBeNull();
    expect(screen.queryByRole('button', { name: /log match/i })).toBeNull();
  });

  it('archetype without a list: shows the list setup instead of the deck content', () => {
    store.activeDeck = null;
    store.activeDeckId = null;
    store.decks = [];
    render(<DeckHubPage />);
    expect(screen.getByTestId('list-setup')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-panel')).toBeNull();
  });
});
