import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { DeckSynthesisPanel } from './DeckSynthesisPanel';
import { authClient } from '../../lib/authClient';
import { DEMO_AI_TOKEN_KEY } from '../../lib/demo';
import type { DeckSynthesisReadResponse } from '../../lib/api';
import type {
  DeckSynthesis,
  SynthesisClaim,
  SynthesisContext,
  SynthesisFact,
} from '@pokekon/shared';

/**
 * Plan .claude/plans/ai-recommendation-synthesis.md §3.10 — the binding state
 * table for DeckSynthesisPanel. The plan does not dictate markup, only the
 * per-state behaviour, so (following the precedent set by
 * DeckComparisonPanel.test.tsx) this suite:
 * - resolves user-visible copy via `i18n.t(...)` with the EXACT keys §3.10
 *   requires under `recommendations.synthesis.*`, never hard-coded English;
 * - INFERRED, NOT DICTATED BY THE PLAN: `data-testid` hooks
 *   (`deck-synthesis-panel`, `deck-synthesis-generate-button`,
 *   `deck-synthesis-stale-badge`, `deck-synthesis-empty`,
 *   `deck-synthesis-error`, `deck-synthesis-no-key`,
 *   `deck-synthesis-no-facts`, `deck-synthesis-demo-token-input`) to scope
 *   assertions to one region of the panel. The implementer may use different
 *   hooks as long as an equivalent way to scope these assertions exists.
 */

// Tests must never hit the network: the entire auth client is replaced
// (pattern: Sidebar.test.tsx, UserMenu.test.tsx).
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null, refetch: vi.fn() })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

const useSessionMock = vi.mocked(authClient.useSession);

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

interface StoreMock {
  deckSynthesis: DeckSynthesisReadResponse | null;
  isLoadingSynthesis: boolean;
  isSynthesizing: boolean;
  synthesisError: string | null;
  loadDeckSynthesis: ReturnType<typeof vi.fn>;
  runDeckSynthesis: ReturnType<typeof vi.fn>;
}

let storeState: StoreMock;

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  mockRegularSession();
  storeState = {
    deckSynthesis: null,
    isLoadingSynthesis: false,
    isSynthesizing: false,
    synthesisError: null,
    loadDeckSynthesis: vi.fn(),
    runDeckSynthesis: vi.fn(),
  };
});

function makeFact(overrides: Partial<SynthesisFact> = {}): SynthesisFact {
  return {
    id: 'field.winRate',
    kind: 'fieldScore',
    label: 'Field-Score',
    value: 55.2,
    unit: 'pct',
    neutralValue: 50,
    lowPct: 51.1,
    highPct: 59.3,
    direction: 'positive',
    significant: true,
    usableForRecommendation: true,
    entityNames: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<SynthesisContext> = {}): SynthesisContext {
  return {
    deckId: 1,
    archetypeId: 'mega-kangaskhan-ex',
    archetypeName: 'Mega Kangaskhan ex',
    variant: 'Standard',
    windowDays: 28,
    language: 'en',
    cardStatsComputedAt: '2026-08-01T00:00:00.000Z',
    equilibriumComputedAt: '2026-08-01T00:00:00.000Z',
    matchupImportedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeClaim(overrides: Partial<SynthesisClaim> = {}): SynthesisClaim {
  return {
    factId: 'field.winRate',
    kind: 'observation',
    direction: 'positive',
    text: 'Your deck performs solidly against the current meta.',
    ...overrides,
  };
}

const HEADLINE_SENTENCE = 'Your deck performs solidly against the current meta.';
const STRENGTHS_SENTENCE = 'You have a reliable edge in the mirror match.';

function makeSynthesis(overrides: Partial<DeckSynthesis> = {}): DeckSynthesis {
  return {
    deckId: 1,
    archetypeId: 'mega-kangaskhan-ex',
    archetypeName: 'Mega Kangaskhan ex',
    windowDays: 28,
    language: 'en',
    promptVersion: 1,
    sections: [
      { section: 'headline', sentences: [HEADLINE_SENTENCE] },
      { section: 'strengths', sentences: [STRENGTHS_SENTENCE] },
    ],
    claims: [
      makeClaim(),
      makeClaim({
        factId: 'matchup.dragapult-ex',
        text: '{label} is a reliable matchup for you at {value} %.',
      }),
    ],
    facts: [makeFact(), makeFact({ id: 'matchup.dragapult-ex', label: 'Dragapult ex' })],
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
  overrides: Partial<DeckSynthesisReadResponse> = {},
): DeckSynthesisReadResponse {
  return {
    deckId: 1,
    archetypeId: 'mega-kangaskhan-ex',
    windowDays: 28,
    language: 'en',
    synthesis: null,
    stale: false,
    currentInputHash: 'b'.repeat(64),
    availableFactCount: 5,
    hasApiKey: true,
    ...overrides,
  };
}

describe('DeckSynthesisPanel — cold start (plan §3.10 state table)', () => {
  it('shows the intro text and an enabled generate button when there is no synthesis yet, a key is present, and enough facts exist', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: true,
      availableFactCount: 5,
    });

    render(<DeckSynthesisPanel />);

    const button = screen.getByTestId('deck-synthesis-generate-button');
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.getByText(i18n.t('recommendations:synthesis.intro'))).toBeInTheDocument();
  });

  it('calls runDeckSynthesis when the generate button is clicked', async () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: true,
      availableFactCount: 5,
    });
    const user = userEvent.setup();

    render(<DeckSynthesisPanel />);
    await user.click(screen.getByTestId('deck-synthesis-generate-button'));

    expect(storeState.runDeckSynthesis).toHaveBeenCalledTimes(1);
  });

  it('disables the generate button and shows a "not enough data" notice when availableFactCount is 0', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: true,
      availableFactCount: 0,
    });

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-no-facts')).toBeInTheDocument();
    expect(screen.getByTestId('deck-synthesis-generate-button')).toBeDisabled();
  });
});

describe('DeckSynthesisPanel — missing key (plan §3.10 state table)', () => {
  it('shows a hint referencing the AI settings for a regular user without a stored key', () => {
    mockRegularSession();
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: false,
      availableFactCount: 5,
    });

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-no-key')).toBeInTheDocument();
    expect(screen.queryByTestId('deck-synthesis-demo-token-input')).not.toBeInTheDocument();
  });

  it('shows an ephemeral-token input for a demo guest without a stored key', () => {
    mockDemoSession();
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: false,
      availableFactCount: 5,
    });

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-demo-token-input')).toBeInTheDocument();
    expect(localStorage.getItem(DEMO_AI_TOKEN_KEY)).toBeNull();
  });
});

describe('DeckSynthesisPanel — synthesis present (plan §3.10 state table)', () => {
  it('renders the sections as paragraphs, using the text from their sentences', () => {
    storeState.deckSynthesis = makeReadResponse({ synthesis: makeSynthesis(), hasApiKey: true });

    render(<DeckSynthesisPanel />);

    const headline = screen.getByText(HEADLINE_SENTENCE);
    const strengths = screen.getByText(STRENGTHS_SENTENCE);
    expect(headline.tagName).toBe('P');
    expect(strengths.tagName).toBe('P');
  });

  it('shows a stale badge and the "regenerate" label when stale is true', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: makeSynthesis(),
      hasApiKey: true,
      stale: true,
    });

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-stale-badge')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('recommendations:synthesis.regenerate'))).toBeInTheDocument();
  });

  it('shows an honest empty text, without crashing, when every claim was dropped', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: makeSynthesis({ sections: [], claims: [], droppedCount: 3 }),
      hasApiKey: true,
    });

    expect(() => render(<DeckSynthesisPanel />)).not.toThrow();
    expect(screen.getByTestId('deck-synthesis-empty')).toBeInTheDocument();
  });

  it('does NOT show the "not enough data" notice when a synthesis already exists, even if the live availableFactCount has since dropped to 0', () => {
    // Regression: a demo-seed (or previously cached) synthesis renders its
    // sections from its own stored fact snapshot -- it is independent of
    // the live availableFactCount, which reflects only the CURRENT facts
    // computed for staleness checking. Showing "not enough data" above a
    // fully rendered analysis is misleading, and the plan's §3.10 state
    // table only pairs `noFacts` with `synthesis === null`.
    storeState.deckSynthesis = makeReadResponse({
      synthesis: makeSynthesis(),
      hasApiKey: true,
      availableFactCount: 0,
    });

    render(<DeckSynthesisPanel />);

    expect(screen.queryByTestId('deck-synthesis-no-facts')).not.toBeInTheDocument();
    expect(screen.getByText(HEADLINE_SENTENCE)).toBeInTheDocument();
  });
});

describe('DeckSynthesisPanel — loading and error (plan §3.10 state table)', () => {
  it('disables the generate button while a synthesis run is in flight', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: true,
      availableFactCount: 5,
    });
    storeState.isSynthesizing = true;

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-generate-button')).toBeDisabled();
  });

  it('shows an error line while keeping the generate button usable', () => {
    storeState.deckSynthesis = makeReadResponse({
      synthesis: null,
      hasApiKey: true,
      availableFactCount: 5,
    });
    storeState.synthesisError = 'GitHub Models rejected the request.';

    render(<DeckSynthesisPanel />);

    expect(screen.getByTestId('deck-synthesis-error')).toHaveTextContent(
      'GitHub Models rejected the request.',
    );
    expect(screen.getByTestId('deck-synthesis-generate-button')).not.toBeDisabled();
  });
});
