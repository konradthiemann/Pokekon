import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { ArchetypeRecommendationPanel } from './ArchetypeRecommendationPanel';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY } from '../../lib/demo';
import { getArchetypeSynthesis, generateArchetypeSynthesis } from '../../lib/api';
import type {
  ArchetypeSynthesisReadResponse,
  ArchetypeSynthesisWriteResponse,
} from '../../lib/api';
import type {
  ArchetypeSynthesis,
  ArchetypeSynthesisContext,
  RankedCluster,
  SynthesisClaim,
  SynthesisFact,
} from '@pokekon/shared';

/**
 * Spec 10 (specs/archetype-meta-analysis.md) + plan
 * ~/.claude/plans/velvety-finding-bengio.md — UI slice ("Was fehlt", point 1+2
 * of HANDOVER_SPEC10.md). This panel deliberately uses its own local state
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

const defaultProps = {
  archetypeId: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  windowDays: 90,
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
