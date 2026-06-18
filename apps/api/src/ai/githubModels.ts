import {
  buildAnalysisPrompts,
  stripJsonFences,
  validateAnalysis,
  type BattleAnalysis,
} from '@pokekon/shared';
import { AnalysisError, type AnalysisInput, type AnalysisProvider } from './provider.js';

// GitHub Models inference API (OpenAI-compatible chat completions).
const ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const API_VERSION = '2026-03-10';
const DEFAULT_MODEL = 'openai/gpt-4.1';

/**
 * GitHub Models adapter. The personal access token is supplied per request (decrypted
 * server-side from user_ai_settings) and never logged. Anti-hallucination is enforced
 * by the shared engine: temperature=0, JSON-only output, and every returned item must
 * quote the log verbatim (validateAnalysis drops the rest).
 */
export function createGitHubModelsProvider(opts: {
  apiKey: string;
  model?: string | null;
}): AnalysisProvider {
  const model = opts.model && opts.model.trim() !== '' ? opts.model : DEFAULT_MODEL;

  return {
    async analyze({ log, playerName }: AnalysisInput): Promise<BattleAnalysis> {
      const analyzedAt = new Date().toISOString();
      const { system, user } = buildAnalysisPrompts(log, playerName, analyzedAt);

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${opts.apiKey}`,
            'X-GitHub-Api-Version': API_VERSION,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
      } catch (err) {
        throw new AnalysisError('Could not reach the GitHub Models API.', 502, String(err));
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // 401/403/429 from the provider are surfaced as-is; others as 502.
        const status =
          res.status === 401 || res.status === 403 || res.status === 429 ? res.status : 502;
        throw new AnalysisError(`GitHub Models request failed (${res.status}).`, status, detail);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const rawText = data.choices?.[0]?.message?.content ?? '';

      let parsed: BattleAnalysis;
      try {
        parsed = JSON.parse(stripJsonFences(rawText)) as BattleAnalysis;
      } catch {
        throw new AnalysisError('The model response was not valid JSON.', 502);
      }

      if (!parsed.analyzedAt) parsed.analyzedAt = analyzedAt;
      return validateAnalysis(parsed, log);
    },
  };
}
