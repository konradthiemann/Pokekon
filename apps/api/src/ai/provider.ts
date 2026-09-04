import type {
  BattleAnalysis,
  SynthesisContext,
  SynthesisFact,
  ValidatedSynthesis,
} from '@pokekon/shared';

/** Input to a battle-log analysis: the raw log and which player is "me". */
export interface AnalysisInput {
  log: string;
  playerName: string;
}

/** Input to a structured-facts synthesis: the closed fact list plus deck context. */
export interface SynthesisInput {
  facts: SynthesisFact[];
  context: SynthesisContext;
}

/**
 * Provider-agnostic battle-log analysis. Concrete adapters (GitHub Models, …) wrap
 * a specific LLM API but all reuse the shared anti-hallucination engine and return
 * the same validated BattleAnalysis.
 */
export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<BattleAnalysis>;
  /** Structured-input counterpart. Returns the ALREADY VALIDATED result — the
   *  grounding gate runs inside the adapter, exactly like analyze() calls
   *  validateAnalysis, so no provider can skip it. */
  synthesize(input: SynthesisInput): Promise<ValidatedSynthesis>;
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
