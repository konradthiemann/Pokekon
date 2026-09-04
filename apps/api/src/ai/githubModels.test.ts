import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SynthesisContext, SynthesisFact } from '@pokekon/shared';
import { createGitHubModelsProvider } from './githubModels.js';
import { AnalysisError } from './provider.js';

// Plan §3.6 / §4 Scheibe F step 11: `synthesize` reuses the same GitHub Models
// HTTP endpoint as `analyze` (chatJson), but with maxTokens: 2048 (vs. 4096) and
// parses `{ "claims": [...] }`, running the shared grounding gate (validateSynthesis)
// internally so no provider can skip it.

const ENDPOINT = 'https://models.github.ai/inference/chat/completions';

const FACT: SynthesisFact = {
  id: 'field.winRate',
  kind: 'fieldScore',
  label: 'Feld-Score',
  value: 55.2,
  unit: 'pct',
  neutralValue: 50,
  lowPct: 51.1,
  highPct: 59.3,
  direction: 'positive',
  significant: true,
  usableForRecommendation: true,
  entityNames: [],
};

const CONTEXT: SynthesisContext = {
  deckId: 1,
  archetypeId: 'mega-kangaskhan-ex',
  archetypeName: 'Mega Kangaskhan ex',
  variant: 'Standard',
  windowDays: 28,
  language: 'de',
  cardStatsComputedAt: null,
  equilibriumComputedAt: null,
  matchupImportedAt: null,
};

/** Wraps a GitHub Models chat-completion response the way the real API does. */
function modelResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createGitHubModelsProvider().synthesize', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the GitHub Models endpoint with temperature 0, json_object format, max_tokens 2048 and a bearer token, and returns the grounded claim as accepted', async () => {
    const content = JSON.stringify({
      claims: [
        {
          factId: 'field.winRate',
          kind: 'observation',
          direction: 'positive',
          text: 'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.',
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue(modelResponse(content));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGitHubModelsProvider({ apiKey: 'ghp_secret_token' });
    const result = await provider.synthesize({ facts: [FACT], context: CONTEXT });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_secret_token');

    const body = JSON.parse(init.body as string) as {
      temperature: number;
      max_tokens: number;
      response_format: { type: string };
      messages: { role: string; content: string }[];
    };
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(2048);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[1]?.role).toBe('user');

    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.factId).toBe('field.winRate');
  });

  it('throws an AnalysisError with status 502 when the model response is not valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(modelResponse('this is not { valid json'));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGitHubModelsProvider({ apiKey: 'ghp_secret_token' });

    await expect(provider.synthesize({ facts: [FACT], context: CONTEXT })).rejects.toBeInstanceOf(
      AnalysisError,
    );

    const fetchMock2 = vi.fn().mockResolvedValue(modelResponse('this is not { valid json'));
    vi.stubGlobal('fetch', fetchMock2);
    const provider2 = createGitHubModelsProvider({ apiKey: 'ghp_secret_token' });
    await expect(provider2.synthesize({ facts: [FACT], context: CONTEXT })).rejects.toMatchObject({
      status: 502,
    });
  });

  it('runs the shared grounding gate internally: a claim with an unknown factId lands in rejected, not thrown, and is absent from accepted', async () => {
    const content = JSON.stringify({
      claims: [
        {
          factId: 'field.winrate', // wrong case -> not a known factId
          kind: 'observation',
          direction: 'positive',
          text: 'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.',
        },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue(modelResponse(content));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGitHubModelsProvider({ apiKey: 'ghp_secret_token' });
    const result = await provider.synthesize({ facts: [FACT], context: CONTEXT });

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unknownFact');
    expect(result.rejected[0]?.claim.factId).toBe('field.winrate');
  });
});
