import type { BattleAnalysis } from '@pokekon/shared';

/** Input to a battle-log analysis: the raw log and which player is "me". */
export interface AnalysisInput {
  log: string;
  playerName: string;
}

/**
 * Provider-agnostic battle-log analysis. Concrete adapters (GitHub Models, …) wrap
 * a specific LLM API but all reuse the shared anti-hallucination engine and return
 * the same validated BattleAnalysis.
 */
export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<BattleAnalysis>;
}

/** Error carrying an HTTP status so the route can surface a sensible code. */
export class AnalysisError extends Error {
  readonly status: number;
  readonly detail: string | undefined;

  constructor(message: string, status = 502, detail?: string) {
    super(message);
    this.name = 'AnalysisError';
    this.status = status;
    this.detail = detail;
  }
}
