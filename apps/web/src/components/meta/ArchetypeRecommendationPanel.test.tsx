import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { ArchetypeRecommendationPanel } from './ArchetypeRecommendationPanel';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY } from '../../lib/demo';
import { getArchetypeSynthesis, generateArchetypeSynthesis } from '../../lib/api';
import type {
  ArchetypeSynthesisReadResponse,
  ArchetypeSynthesisWriteResponse,
  FieldAnalysisArchetype,
} from '../../lib/api';
import { setLocalMetaWeightOverrides } from '../../lib/preferences';
import type {
  ArchetypeSynthesis,
  ArchetypeSynthesisContext,
  FieldScore,
  RankedCluster,
  SynthesisClaim,
  SynthesisFact,
} from '@pokekon/shared';
import type { ArchetypeStats } from '../../types';

/**
 * Spec 10 (specs/archetype-meta-analysis.md) + plan
 * ~/.claude/plans/velvety-finding-bengio.md — UI slice (AC C/D/E). This panel
 * deliberately uses its own local state
 * (request-key pattern, same as ArchetypeDetail.tsx) instead of the
 * dashboardStore, so — unlike DeckSynthesisPanel.test.tsx — the API module
 * itself is mocked, not a store.
 */

vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null, refetch: vi.fn() })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getArchetypeSynthesis: vi.fn(),
    generateArchetypeSynthesis: vi.fn(),
  };
});

const useSessionMock = vi.mocked(authClient.useSession);
const getArchetypeSynthesisMock = vi.mocked(getArchetypeSynthesis);
const generateArchetypeSynthesisMock = vi.mocked(generateArchetypeSynthesis);

function mockRegularSession() {
  useSessionMock.mockReturnValue({
    data: null,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useSession>);
}

function mockDemoSession() {
  useSessionMock.mockReturnValue({
    data: {
      user: {
        id: 'demo-1',
        name: 'Demo Guest',
        email: 'demo@example.com',
        emailVerified: false,
        isAnonymous: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useSession>);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  mockRegularSession();
  getArchetypeSynthesisMock.mockReset();
  generateArchetypeSynthesisMock.mockReset();
});

function makeCluster(overrides: Partial<RankedCluster> = {}): RankedCluster {
  return {
    representative: {
      pokemon: [{ name: 'Dragapult ex', count: 3 }],
      trainer: [{ name: "Boss's Orders", count: 2 }],
      energy: [{ name: 'Basic Psychic Energy', count: 8 }],
    },
    memberStandingIds: [1, 2],
    totalWins: 12,
    totalLosses: 3,
    totalTies: 0,
    placements: [{ placing: 1, totalPlayers: 128 }],
    matchResults: [],
    winRateLowerBoundPct: 62.5,
    winRateInterval: {
      pct: 80,
      lowPct: 62.5,
      highPct: 90.1,
      widthPct: 27.6,
      n: 15,
      significant: true,
    },
    avgPlacementPercentile: 99,
    rank: 1,
    ...overrides,
  };
}

function makeContext(
  overrides: Partial<ArchetypeSynthesisContext> = {},
): ArchetypeSynthesisContext {
  return {
    archetypeId: 'dragapult-ex',
    archetypeName: 'Dragapult ex',
    windowDays: 90,
    language: 'en',
    scope: 'global',
    ...overrides,
  };
}

function makeFact(overrides: Partial<SynthesisFact> = {}): SynthesisFact {
  return {
    id: 'cluster.1.winRate',
    kind: 'clusterWinRate',
    label: 'Top cluster win rate',
    value: 80,
    unit: 'pct',
    neutralValue: 50,
    lowPct: 62.5,
    highPct: 90.1,
    direction: 'positive',
    significant: true,
    usableForRecommendation: true,
    entityNames: [],
    ...overrides,
  };
}

function makeClaim(overrides: Partial<SynthesisClaim> = {}): SynthesisClaim {
  return {
    factId: 'cluster.1.winRate',
    kind: 'observation',
    direction: 'positive',
    text: 'The top list wins consistently.',
    ...overrides,
  };
}

const HEADLINE_SENTENCE = 'The top list wins consistently.';

function makeSynthesis(overrides: Partial<ArchetypeSynthesis> = {}): ArchetypeSynthesis {
  return {
    archetypeId: 'dragapult-ex',
    archetypeName: 'Dragapult ex',
    windowDays: 90,
    language: 'en',
    scope: 'global',
    promptVersion: 1,
    sections: [{ section: 'headline', sentences: [HEADLINE_SENTENCE] }],
    claims: [makeClaim()],
    facts: [makeFact()],
    context: makeContext(),
    droppedCount: 0,
    source: 'llm',
    provider: 'github-models',
    model: 'openai/gpt-4.1',
    inputHash: 'a'.repeat(64),
    generatedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

function makeReadResponse(
  overrides: Partial<ArchetypeSynthesisReadResponse> = {},
): ArchetypeSynthesisReadResponse {
  return {
    archetypeId: 'dragapult-ex',
    windowDays: 90,
    language: 'en',
    scope: 'global',
    clusters: [makeCluster()],
    synthesis: null,
    stale: false,
    currentInputHash: 'b'.repeat(64),
    availableFactCount: 3,
    hasApiKey: true,
    ...overrides,
  };
}

function makeWriteResponse(
  overrides: Partial<ArchetypeSynthesisWriteResponse> = {},
): ArchetypeSynthesisWriteResponse {
  return {
    synthesis: makeSynthesis(),
    stale: false,
    cached: false,
    ...overrides,
  };
}

function makeArchetypeStats(overrides: Partial<ArchetypeStats> = {}): ArchetypeStats {
  return {
    archetype: 'dragapult-ex',
    encounters: 10,
    wins: 6,
    losses: 3,
    ties: 1,
    winRate: 65,
    frequencyPct: 12,
    metaWinRate: 50,
    bo1EquivalentWinRate: 65,
    bo1Games: 10,
    bo3Games: 0,
    unknownFormatGames: 0,
    ...overrides,
  };
}

function makeFieldAnalysisArchetype(
  overrides: Partial<FieldAnalysisArchetype> = {},
): FieldAnalysisArchetype {
  return {
    archetypeId: 'lost-box',
    archetypeName: 'Lost Box',
    sharePct: 12,
    winRatePct: 55,
    wins: 10,
    losses: 8,
    ties: 0,
    playerCount: 20,
    icons: [],
    fieldWinRatePct: 52,
    coveragePct: 90,
    rank: 2,
    ...overrides,
  };
}

function makeFieldScore(overrides: Partial<FieldScore> = {}): FieldScore {
  return {
    archetypeId: 'dragapult-ex',
    archetypeName: 'Dragapult ex',
    sharePct: 20,
    fieldWinRatePct: 58.4,
    fieldWinRateLowPct: 48.1,
    fieldWinRateHighPct: 68.7,
    coveragePct: 90,
    mirrorSharePct: 5,
    rank: 1,
    threats: [],
    freeWins: [],
    ...overrides,
  };
}

const defaultProps = {
  archetypeId: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  windowDays: 90,
  archetypes: [] as FieldAnalysisArchetype[],
  localMeta: [] as string[],
};

describe('ArchetypeRecommendationPanel — initial load', () => {
  it('fetches the global scope on mount', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));
    expect(getArchetypeSynthesisMock).toHaveBeenCalledWith('dragapult-ex', {
      days: 90,
      scope: 'global',
    });
  });

  it('renders the ranked cluster list with the right count and values', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({
        clusters: [
          makeCluster({ rank: 1, memberStandingIds: [1, 2] }),
          makeCluster({
            rank: 2,
            memberStandingIds: [3],
            winRateInterval: null,
            avgPlacementPercentile: null,
          }),
        ],
      }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getAllByTestId('archetype-recommendation-cluster-item')).toHaveLength(2),
    );
    expect(screen.getAllByText(/Dragapult ex/)).not.toHaveLength(0);
  });

  it("reveals the cluster's full decklist (all three card groups) behind a toggle", async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse({ clusters: [makeCluster()] }));
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    await screen.findAllByTestId('archetype-recommendation-cluster-item');

    // Trainer/energy cards are never shown in the compact summary -- only
    // reachable by expanding the full decklist (collapsed <details> content
    // stays in the DOM but is not visible until toggled open).
    expect(screen.getByText("Boss's Orders")).not.toBeVisible();
    expect(screen.getByText('Basic Psychic Energy')).not.toBeVisible();

    await user.click(screen.getByTestId('archetype-recommendation-cluster-decklist-toggle'));

    const decklist = screen.getByTestId('archetype-recommendation-cluster-decklist');
    expect(within(decklist).getByText('Dragapult ex')).toBeVisible();
    expect(within(decklist).getByText("Boss's Orders")).toBeVisible();
    expect(within(decklist).getByText('Basic Psychic Energy')).toBeVisible();
  });

  it('switches to a new GET when the "Local" scope chip is clicked', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-local'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
    });
    // Scope switch only re-reads -- it must never trigger a generation.
    expect(generateArchetypeSynthesisMock).not.toHaveBeenCalled();
  });
});

describe('ArchetypeRecommendationPanel — cold start (mirrors DeckSynthesisPanel state table)', () => {
  it('shows the intro text and an enabled generate button when a key is present and enough facts exist', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    const button = await screen.findByTestId('archetype-recommendation-generate-button');
    expect(button).not.toBeDisabled();
    expect(
      screen.getByText(i18n.t('meta:archetypeDetail.recommendation.intro')),
    ).toBeInTheDocument();
  });

  it('disables the generate button and shows a "not enough data" notice when availableFactCount is 0', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 0 }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    expect(await screen.findByTestId('archetype-recommendation-no-facts')).toBeInTheDocument();
    expect(screen.getByTestId('archetype-recommendation-generate-button')).toBeDisabled();
  });
});

describe('ArchetypeRecommendationPanel — missing key', () => {
  it('shows a hint referencing the AI settings for a regular user without a stored key', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: false, availableFactCount: 3 }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    expect(await screen.findByTestId('archetype-recommendation-no-key')).toBeInTheDocument();
    expect(screen.getByTestId('archetype-recommendation-generate-button')).toBeDisabled();
  });

  it('shows an ephemeral-token path for a demo guest without a stored key', async () => {
    mockDemoSession();
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: false, availableFactCount: 3 }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    expect(
      await screen.findByText(i18n.t('meta:archetypeDetail.recommendation.noKeyDemo')),
    ).toBeInTheDocument();
    expect(localStorage.getItem(DEMO_AI_TOKEN_KEY)).toBeNull();
  });
});

describe('ArchetypeRecommendationPanel — generation', () => {
  it('calls generateArchetypeSynthesis with the current scope/window when clicked, then renders the sections', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );
    generateArchetypeSynthesisMock.mockResolvedValue(makeWriteResponse());
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    await screen.findByTestId('archetype-recommendation-generate-button');

    await user.click(screen.getByTestId('archetype-recommendation-generate-button'));

    await waitFor(() => expect(generateArchetypeSynthesisMock).toHaveBeenCalledTimes(1));
    expect(generateArchetypeSynthesisMock).toHaveBeenCalledWith('dragapult-ex', {
      days: 90,
      scope: 'global',
    });
    expect(await screen.findByText(HEADLINE_SENTENCE)).toBeInTheDocument();
  });

  it('disables the generate button while a run is in flight', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );
    let resolveGenerate: (value: ArchetypeSynthesisWriteResponse) => void = () => {};
    generateArchetypeSynthesisMock.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    const button = await screen.findByTestId('archetype-recommendation-generate-button');
    await user.click(button);

    expect(screen.getByTestId('archetype-recommendation-generate-button')).toBeDisabled();
    resolveGenerate(makeWriteResponse());
  });

  it('shows an error line while keeping the generate button usable', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );
    generateArchetypeSynthesisMock.mockRejectedValue(
      new Error('GitHub Models rejected the request.'),
    );
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    await user.click(await screen.findByTestId('archetype-recommendation-generate-button'));

    expect(await screen.findByTestId('archetype-recommendation-error')).toHaveTextContent(
      'GitHub Models rejected the request.',
    );
    expect(screen.getByTestId('archetype-recommendation-generate-button')).not.toBeDisabled();
  });

  it('shows a stale badge and the "regenerate" label when stale is true', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: makeSynthesis(), hasApiKey: true, stale: true }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    expect(await screen.findByTestId('archetype-recommendation-stale-badge')).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t('meta:archetypeDetail.recommendation.regenerate')),
    ).toBeInTheDocument();
  });

  it('shows an honest empty text, without crashing, when every claim was dropped', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({
        synthesis: makeSynthesis({ sections: [], claims: [], droppedCount: 3 }),
        hasApiKey: true,
      }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    expect(await screen.findByTestId('archetype-recommendation-empty')).toBeInTheDocument();
  });
});

describe('ArchetypeRecommendationPanel — personal mode (Spec 10 Slice E UI)', () => {
  it('switches to a new GET with usePersonalPrior + personalRecord when the "Mein Spielstil" chip is clicked', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();
    const archetypeStats = [
      makeArchetypeStats({ archetype: 'dragapult-ex', wins: 6, losses: 3, ties: 1 }),
    ];

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypeStats={archetypeStats} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-personal'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      usePersonalPrior: true,
      personalRecord: { wins: 6, losses: 3, ties: 1 },
    });
    // Scope switch only re-reads -- it must never trigger a generation.
    expect(generateArchetypeSynthesisMock).not.toHaveBeenCalled();
  });

  it('shows an insufficient-data hint when archetypeStats has no matching entry', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypeStats={[]} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-personal'));

    expect(
      await screen.findByTestId('archetype-recommendation-personal-insufficient-data'),
    ).toBeInTheDocument();
  });

  it('shows an insufficient-data hint when the matching record has fewer than DEFAULT_MIN_OWN_GAMES games', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();
    // 2 + 1 + 0 = 3 personal games, below the shared DEFAULT_MIN_OWN_GAMES (5) threshold.
    const archetypeStats = [
      makeArchetypeStats({ archetype: 'dragapult-ex', wins: 2, losses: 1, ties: 0 }),
    ];

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypeStats={archetypeStats} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-personal'));

    expect(
      await screen.findByTestId('archetype-recommendation-personal-insufficient-data'),
    ).toBeInTheDocument();
  });

  it('does not show the insufficient-data hint in global/local mode even without enough personal data', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypeStats={[]} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByTestId('archetype-recommendation-personal-insufficient-data'),
    ).not.toBeInTheDocument();
  });

  it('sends usePersonalPrior + personalRecord in the POST body when generating in personal mode', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );
    generateArchetypeSynthesisMock.mockResolvedValue(makeWriteResponse());
    const user = userEvent.setup();
    const archetypeStats = [
      makeArchetypeStats({ archetype: 'dragapult-ex', wins: 6, losses: 3, ties: 1 }),
    ];

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypeStats={archetypeStats} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-personal'));
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));

    await user.click(await screen.findByTestId('archetype-recommendation-generate-button'));

    await waitFor(() => expect(generateArchetypeSynthesisMock).toHaveBeenCalledTimes(1));
    expect(generateArchetypeSynthesisMock).toHaveBeenCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      usePersonalPrior: true,
      personalRecord: { wins: 6, losses: 3, ties: 1 },
    });
  });
});

describe('ArchetypeRecommendationPanel — local field weighting (Spec 10 Slice D UI)', () => {
  const archetypes = [
    makeFieldAnalysisArchetype({
      archetypeId: 'lost-box',
      archetypeName: 'Lost Box',
      sharePct: 12,
    }),
  ];
  const localMeta = ['Lost Box'];

  it('switches to a new GET with localField (seed weight from online share) when the "Local" chip is clicked', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();

    render(
      <ArchetypeRecommendationPanel
        {...defaultProps}
        archetypes={archetypes}
        localMeta={localMeta}
      />,
    );
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-local'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      localField: [{ archetypeId: 'lost-box', name: 'Lost Box', weight: 12 }],
    });
  });

  it('uses a stored weight override instead of the online-share seed weight', async () => {
    setLocalMetaWeightOverrides({ 'lost-box': 7 });
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();

    render(
      <ArchetypeRecommendationPanel
        {...defaultProps}
        archetypes={archetypes}
        localMeta={localMeta}
      />,
    );
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-local'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      localField: [{ archetypeId: 'lost-box', name: 'Lost Box', weight: 7 }],
    });
  });

  it('shows the empty-field hint and sends no localField when localMeta is empty', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();

    render(<ArchetypeRecommendationPanel {...defaultProps} archetypes={[]} localMeta={[]} />);
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-local'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
    });
    expect(
      await screen.findByTestId('archetype-recommendation-local-field-empty'),
    ).toBeInTheDocument();
  });

  it('also sends localField in "Mein Spielstil" mode, alongside usePersonalPrior/personalRecord', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());
    const user = userEvent.setup();
    const archetypeStats = [
      makeArchetypeStats({ archetype: 'dragapult-ex', wins: 6, losses: 3, ties: 1 }),
    ];

    render(
      <ArchetypeRecommendationPanel
        {...defaultProps}
        archetypes={archetypes}
        localMeta={localMeta}
        archetypeStats={archetypeStats}
      />,
    );
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-personal'));

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));
    expect(getArchetypeSynthesisMock).toHaveBeenLastCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      usePersonalPrior: true,
      personalRecord: { wins: 6, losses: 3, ties: 1 },
      localField: [{ archetypeId: 'lost-box', name: 'Lost Box', weight: 12 }],
    });
  });

  it('never sends localField in global mode, even with a non-empty localMeta', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse());

    render(
      <ArchetypeRecommendationPanel
        {...defaultProps}
        archetypes={archetypes}
        localMeta={localMeta}
      />,
    );

    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));
    expect(getArchetypeSynthesisMock).toHaveBeenCalledWith('dragapult-ex', {
      days: 90,
      scope: 'global',
    });
  });

  it('sends localField in the POST body when generating in local mode', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({ synthesis: null, hasApiKey: true, availableFactCount: 3 }),
    );
    generateArchetypeSynthesisMock.mockResolvedValue(makeWriteResponse());
    const user = userEvent.setup();

    render(
      <ArchetypeRecommendationPanel
        {...defaultProps}
        archetypes={archetypes}
        localMeta={localMeta}
      />,
    );
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('archetype-recommendation-scope-local'));
    await waitFor(() => expect(getArchetypeSynthesisMock).toHaveBeenCalledTimes(2));

    await user.click(await screen.findByTestId('archetype-recommendation-generate-button'));

    await waitFor(() => expect(generateArchetypeSynthesisMock).toHaveBeenCalledTimes(1));
    expect(generateArchetypeSynthesisMock).toHaveBeenCalledWith('dragapult-ex', {
      days: 90,
      scope: 'local',
      localField: [{ archetypeId: 'lost-box', name: 'Lost Box', weight: 12 }],
    });
  });

  it('renders the field-weighted score on a cluster that has one', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(
      makeReadResponse({
        clusters: [makeCluster({ fieldScore: makeFieldScore({ fieldWinRatePct: 58.4 }) })],
      }),
    );

    render(<ArchetypeRecommendationPanel {...defaultProps} />);

    const badge = await screen.findByTestId('archetype-recommendation-cluster-field-score');
    expect(badge).toHaveTextContent('58.4%');
  });

  it('does not render the field-score line on a cluster without one', async () => {
    getArchetypeSynthesisMock.mockResolvedValue(makeReadResponse({ clusters: [makeCluster()] }));

    render(<ArchetypeRecommendationPanel {...defaultProps} />);
    await screen.findAllByTestId('archetype-recommendation-cluster-item');

    expect(
      screen.queryByTestId('archetype-recommendation-cluster-field-score'),
    ).not.toBeInTheDocument();
  });
});
