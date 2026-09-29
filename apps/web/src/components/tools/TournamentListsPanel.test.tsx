import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { MetaWindow } from '../../lib/api';
import { TournamentListsPanel } from './TournamentListsPanel';

const W: MetaWindow = { days: 30, online: true, bo1: true };
let lists: {
  lists: { id: number }[];
  total: number;
  isLoading: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
};
let tournaments: unknown[] = [];
vi.mock('../../hooks/useArchetypeLists', () => ({ useArchetypeLists: () => lists }));
vi.mock('../../hooks/useArchetypeTournaments', () => ({
  useArchetypeTournaments: () => tournaments,
}));
vi.mock('../meta/ArchetypeRecommendationPanel', () => ({
  ArchetypeRecommendationPanel: () => <div data-testid="recommendation" />,
}));
vi.mock('../meta/TournamentBestListPanel', () => ({
  TournamentBestListPanel: () => <div data-testid="tournament-best" />,
}));
vi.mock('../meta/DecklistCard', () => ({ DecklistCard: () => <div data-testid="decklist" /> }));
vi.mock('../meta/FieldScorePanel', () => ({
  FieldScorePanel: () => {
    throw new Error('no field score here');
  },
}));
vi.mock('../meta/MatchupTable', () => ({
  MatchupTable: () => {
    throw new Error('no matchup table here');
  },
}));

const props = {
  archetypeId: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  window: W,
  archetypeStats: [],
  archetypes: [],
  localMeta: [],
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  tournaments = [];
  lists = {
    lists: [{ id: 1 }, { id: 2 }],
    total: 5,
    isLoading: false,
    loadMore: vi.fn(),
    isLoadingMore: false,
    loadMoreFailed: false,
  };
});

describe('TournamentListsPanel (Spec 7 §5.6)', () => {
  it('has Recommendation and Decklists tabs; Tournament only with tournaments', () => {
    const { unmount } = render(<TournamentListsPanel {...props} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    unmount();
    tournaments = [{ id: 't1', name: 'Cup', date: '2026-09-01', players: 40 }];
    render(<TournamentListsPanel {...props} />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('opens on the recommendation', () => {
    render(<TournamentListsPanel {...props} />);
    expect(screen.getByTestId('recommendation')).toBeInTheDocument();
  });

  it('decklists show "x of y" and load more', async () => {
    render(<TournamentListsPanel {...props} />);
    await userEvent.click(screen.getByRole('tab', { name: /Decklists/i }));
    expect(screen.getAllByTestId('decklist')).toHaveLength(2);
    expect(screen.getByText(/2.*5/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(lists.loadMore).toHaveBeenCalled();
  });

  it('shows an error line when loading more failed', async () => {
    lists.loadMoreFailed = true;
    render(<TournamentListsPanel {...props} />);
    await userEvent.click(screen.getByRole('tab', { name: /Decklists/i }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
