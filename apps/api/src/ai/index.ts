import type { AiProvider } from '../db/schema.js';
import { createGitHubModelsProvider } from './githubModels.js';
import type { AnalysisProvider } from './provider.js';

export type { AnalysisInput, AnalysisProvider } from './provider.js';
export { AnalysisError } from './provider.js';

/**
 * Resolve a concrete analysis provider. Only GitHub Models is implemented today;
 * the signature is provider-agnostic so adapters (OpenAI/Anthropic/…) can be added
 * without touching the routes.
 */
export function getAnalysisProvider(
  provider: AiProvider,
  opts: { apiKey: string; model?: string | null },
): AnalysisProvider {
  switch (provider) {
    case 'github-models':
      return createGitHubModelsProvider(opts);
    default:
      throw new Error(`Unsupported analysis provider: ${provider as string}`);
  }
}
