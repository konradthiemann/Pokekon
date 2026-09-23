import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { TournamentBestListPanel } from './TournamentBestListPanel';
import { getTournamentArchetypeBestList } from '../../lib/api';
import type { TournamentArchetypeBestListResponse } from '../../lib/api';
import { ListFieldPerformance } from './ListFieldPerformance';
import type { RankedCluster } from '@pokekon/shared';

/**
 * Spec 10 AC-G third bullet (specs/archetype-meta-analysis.md): per
 * tournament recommendation UI, mounted below the raw decklists in
 * ArchetypeDetail.tsx. Mirrors ArchetypeRecommendationPanel.test.tsx's
 * "mock the api module" approach; ListFieldPerformance is additionally
 * mocked so the evidence-props contract can be asserted directly instead of
 * re-testing that already-covered component's internal rendering.
 */

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getTournamentArchetypeBestList: vi.fn(),
  };
});

vi.mock('./ListFieldPerformance', () => ({
  ListFieldPerformance: vi.fn(() => <div data-testid="mock-list-field-performance" />),
}));

const getTournamentArchetypeBestListMock = vi.mocked(getTournamentArchetypeBestList);
const ListFieldPerformanceMock = vi.mocked(ListFieldPerformance);

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  getTournamentArchetypeBestListMock.mockReset();
  ListFieldPerformanceMock.mockClear();
});

function makeCluster(overrides: Partial<RankedCluster> = {}): RankedCluster {
  return {
    representative: {
      pokemon: [{ name: 'Charizard ex', count: 2 }],
      trainer: [{ name: "Professor's Research", count: 4 }],
      energy: [{ name: 'Basic Fire Energy', count: 10 }],
    },
    memberStandingIds: [1],
    totalWins: 5,
    totalLosses: 5,
    totalTies: 0,
    placements: [{ placing: 2, totalPlayers: 3 }],
    matchResults: [{ opponentArchetypeId: 'rival-arch', result: 'W', round: 1 }],
    winRateLowerBoundPct: 30,
    winRateInterval: {
      pct: 50,
      lowPct: 30,
      highPct: 70,
      widthPct: 40,
      n: 10,
      significant: false,
    },
    avgPlacementPercentile: 67,
    rank: 1,
    fieldScore: {
      archetypeId: '__cluster_1__',
      archetypeName: '__cluster_1__',
      sharePct: 0,
      fieldWinRatePct: 80,
      fieldWinRateLowPct: 60,
      fieldWinRateHighPct: 95,
      coveragePct: 100,
      mirrorSharePct: 0,
      rank: 1,
      threats: [],
      freeWins: [],
    },
    ...overrides,
  };
}

function makeResponse(
  overrides: Partial<TournamentArchetypeBestListResponse> = {},
): TournamentArchetypeBestListResponse {
  return {
    tournamentId: 't1',
    tournamentName: 'T1 Event',
    tournamentDate: '2026-08-01T00:00:00.000Z',
    totalPlayers: 3,
    archetypeId: 'best-list-arch',
    archetypeName: 'Best List Arch',
    clusters: [makeCluster()],
    field: [
      { archetypeId: 'best-list-arch', archetypeName: 'Best List Arch' },
      { archetypeId: 'rival-arch', archetypeName: 'Rival Arch' },
    ],
    ...overrides,
  };
}

const defaultTournaments = [
  { id: 't1', name: 'T1 Event', date: '2026-08-01T00:00:00.000Z', players: 3 },
  { id: 't2', name: 'T2 Event', date: '2026-08-08T00:00:00.000Z', players: 8 },
];

describe('TournamentBestListPanel', () => {
  it('does not fetch before a tournament is selected', () => {
    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    expect(getTournamentArchetypeBestListMock).not.toHaveBeenCalled();
  });

  it('fetches the selected tournament + archetype when the select changes', async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');

    await waitFor(() =>
      expect(getTournamentArchetypeBestListMock).toHaveBeenCalledWith('t1', 'best-list-arch'),
    );
  });

  it('renders the ranked cluster list once data resolves', async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');

    expect(await screen.findAllByTestId('tournament-best-list-cluster-item')).toHaveLength(1);
    expect(screen.getAllByText(/Charizard ex/).length).toBeGreaterThan(0);
  });

  it("reveals the cluster's full decklist (all three card groups) behind a toggle", async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');
    await screen.findAllByTestId('tournament-best-list-cluster-item');

    expect(screen.getByText("Professor's Research")).not.toBeVisible();
    expect(screen.getByText('Basic Fire Energy')).not.toBeVisible();

    await user.click(screen.getByTestId('tournament-best-list-cluster-decklist-toggle'));

    const decklist = screen.getByTestId('tournament-best-list-cluster-decklist');
    expect(within(decklist).getByText('Charizard ex')).toBeVisible();
    expect(within(decklist).getByText("Professor's Research")).toBeVisible();
    expect(within(decklist).getByText('Basic Fire Energy')).toBeVisible();
  });

  it('shows an honest empty state when the archetype was not played at the selected tournament', async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse({ clusters: [] }));
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="never-played-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');

    expect(await screen.findByTestId('tournament-best-list-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('tournament-best-list-cluster-item')).not.toBeInTheDocument();
  });

  it('passes the top cluster matchResults and the tournament field (as name-mapped entries) to ListFieldPerformance', async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');

    await waitFor(() => expect(ListFieldPerformanceMock).toHaveBeenCalled());
    const lastCallArgs = ListFieldPerformanceMock.mock.calls.at(-1)?.[0];
    expect(lastCallArgs?.matchResults).toEqual([
      { opponentArchetypeId: 'rival-arch', result: 'W', round: 1 },
    ]);
    expect(lastCallArgs?.field).toEqual([
      { archetypeId: 'best-list-arch', name: 'Best List Arch' },
      { archetypeId: 'rival-arch', name: 'Rival Arch' },
    ]);
  });

  it('re-fetches when a different tournament is selected', async () => {
    getTournamentArchetypeBestListMock.mockResolvedValue(makeResponse());
    const user = userEvent.setup();

    render(
      <TournamentBestListPanel archetypeId="best-list-arch" tournaments={defaultTournaments} />,
    );
    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't1');
    await waitFor(() => expect(getTournamentArchetypeBestListMock).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByTestId('tournament-best-list-select'), 't2');
    await waitFor(() => expect(getTournamentArchetypeBestListMock).toHaveBeenCalledTimes(2));
    expect(getTournamentArchetypeBestListMock).toHaveBeenLastCalledWith('t2', 'best-list-arch');
  });
});
