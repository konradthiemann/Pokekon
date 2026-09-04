// Deck-synthesis fact/claim primitives (plan
// .claude/plans/ai-recommendation-synthesis.md §3.1, Slice A). Pure types and
// grounding helpers over the structured metrics that feed the LLM prompt --
// no I/O, same shape as fieldWinRate.ts / cardPerformance.ts.
import { normalizeCardName } from './cardPerformance.js';

// ---------------------------------------------------------------------------
// 3.1 -- constants
// ---------------------------------------------------------------------------

/** Prompt- und Validierungs-Version. Teil des Cache-Schlüssels: ändert sich die
 *  Prompt- oder Validierungs-Logik, sind alte Texte automatisch veraltet.
 *  Bei JEDER Änderung an buildSynthesisPrompts/validateSynthesis erhöhen. */
export const SYNTHESIS_PROMPT_VERSION = 1;

/** Maximum an Fakten im Prompt — Token-Kosten und Auswahl-Determinismus. */
export const MAX_SYNTHESIS_FACTS = 24;

/** Maximum an Claims, die aus einer Modellantwort übernommen werden. */
export const MAX_SYNTHESIS_CLAIMS = 12;

/** Maximale Zeichenlänge eines Claim-Textes; längere werden verworfen. */
export const MAX_CLAIM_TEXT_CHARS = 240;

/** |value - neutralValue| unterhalb dieser Schwelle gilt als neutral, wenn der
 *  Fakt KEIN Band hat (bandlos: Meta-Share, Coverage). */
export const NEUTRAL_EPSILON = 1;

export const SYNTHESIS_FACT_KINDS = [
  'fieldScore', // Field-Win-Rate des eigenen Archetyps, neutral = 50
  'coverage', // Abdeckung der Matchup-Daten, neutral = 100 (bandlos)
  'matchup', // gewichtetes Einzel-Matchup, neutral = 50
  'metaShare', // Feldanteil eines Archetyps, bandlos
  'cardDelta', // Karten-Performance-Delta (Spec 5), neutral = 0
  'equilibriumWeight', // Nash-Gewicht des eigenen Archetyps, neutral = sharePct
  'equilibriumGap', // paradoxGapPp, neutral = 0, INVERTIERT
  'equilibriumTrend', // fitnessDeltaPp, neutral = 0
] as const;
export type SynthesisFactKind = (typeof SYNTHESIS_FACT_KINDS)[number];

export type FactDirection = 'positive' | 'negative' | 'neutral';

export const SYNTHESIS_LANGUAGE_VALUES = ['de', 'en'] as const;
export type SynthesisLanguage = (typeof SYNTHESIS_LANGUAGE_VALUES)[number];

// ---------------------------------------------------------------------------
// 3.1 -- types
// ---------------------------------------------------------------------------

export interface SynthesisFact {
  /** Stabile, im Prompt zitierbare id. Grammatik (bindend):
   *  'field.winRate' | 'field.coverage' | 'meta.share.self'
   *  | 'matchup.<archetypeId>' | 'meta.share.<archetypeId>'
   *  | 'card.<factIdForCard(name)>'
   *  | 'equilibrium.weight' | 'equilibrium.gap' | 'equilibrium.trend'
   *  | 'equilibrium.trend.<archetypeId>' */
  id: string;
  kind: SynthesisFactKind;
  /** Menschenlesbare Entität ("Dragapult ex", "Ultra Ball").
   *  IMMER durch sanitizeFactLabel() gelaufen. */
  label: string;
  /** Die Kennzahl, über die geschrieben werden darf. */
  value: number;
  unit: 'pct' | 'pp' | 'games' | 'copies';
  /** Wert, an dem die Richtung kippt. */
  neutralValue: number;
  /** Bandgrenzen auf derselben Achse wie `value`; null = bandloser Fakt. */
  lowPct: number | null;
  highPct: number | null;
  /** Abgeleitet (deriveFactDirection), NIE vom Modell geliefert. */
  direction: FactDirection;
  /** Band schließt neutralValue aus. Bei bandlosen Fakten immer false. */
  significant: boolean;
  /** false ⇒ darf als Kontext erwähnt, aber NIE Grundlage einer
   *  'recommendation' sein (viertes AC). */
  usableForRecommendation: boolean;
  /** Zusätzlich erlaubte Ziffern-Literale für die foreignNumber-Prüfung
   *  (z. B. Kartennamen mit Zahl). Immer sanitisiert. */
  entityNames: string[];
  /** Nur für cardDelta. */
  inUserDeck?: boolean;
  userCount?: number;
}

/** Deck-/Meta-Kontext, der die Sätze rahmt (keine Aussagen daraus). */
export interface SynthesisContext {
  deckId: number;
  archetypeId: string;
  archetypeName: string; // sanitizeFactLabel()-behandelt
  variant: string; // sanitizeFactLabel()-behandelt
  windowDays: number;
  language: SynthesisLanguage;
  /** ISO-Zeitpunkte der Vorberechnungen, für den Quellen-Hinweis in der UI. */
  cardStatsComputedAt: string | null;
  equilibriumComputedAt: string | null;
  matchupImportedAt: string | null;
}

export interface SynthesisFactSet {
  facts: SynthesisFact[];
  context: SynthesisContext;
}

// ---------------------------------------------------------------------------
// 3.1 -- deriveFactDirection
// ---------------------------------------------------------------------------

/**
 * Direction of a fact, derived from its confidence band when it has one and
 * from the point estimate otherwise. `invert` flips the meaning for facts
 * where "higher" is worse (equilibriumGap: played MORE than the equilibrium
 * justifies is a warning, not a strength).
 */
export function deriveFactDirection(args: {
  value: number;
  neutralValue: number;
  lowPct: number | null;
  highPct: number | null;
  invert?: boolean;
}): FactDirection {
  const { value, neutralValue, lowPct, highPct, invert = false } = args;
  const hasBand = lowPct !== null && highPct !== null;

  let direction: FactDirection;
  if (hasBand && lowPct > neutralValue) {
    direction = 'positive';
  } else if (hasBand && highPct < neutralValue) {
    direction = 'negative';
  } else if (hasBand) {
    direction = 'neutral';
  } else if (value - neutralValue > NEUTRAL_EPSILON) {
    direction = 'positive';
  } else if (neutralValue - value > NEUTRAL_EPSILON) {
    direction = 'negative';
  } else {
    direction = 'neutral';
  }

  if (!invert || direction === 'neutral') {
    return direction;
  }
  return direction === 'positive' ? 'negative' : 'positive';
}

// ---------------------------------------------------------------------------
// 3.1 -- helper functions
// ---------------------------------------------------------------------------

/** Strip anything that could steer the model or break the prompt frame:
 *  collapse all whitespace (incl. newlines) to single spaces, remove
 *  backticks, curly braces and the '|' column separator, trim, cap at 60
 *  chars. Deck/archetype/card names are USER INPUT (decks.archetype_name,
 *  deck_cards.name) — this is the prompt-injection boundary. */
export function sanitizeFactLabel(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/[`{}|]/g, '')
    .trim()
    .slice(0, 60);
}

/** Fact-id fragment for a card: normalizeCardName() (reused from
 *  cardPerformance.ts:51) with spaces replaced by '-'. */
export function factIdForCard(cardName: string): string {
  return normalizeCardName(cardName).replace(/ /g, '-');
}

// ---------------------------------------------------------------------------
// 3.3 -- claims and validation
// ---------------------------------------------------------------------------

export const SYNTHESIS_CLAIM_KINDS = ['observation', 'recommendation'] as const;
export type SynthesisClaimKind = (typeof SYNTHESIS_CLAIM_KINDS)[number];

export interface SynthesisClaim {
  /** Must match a SynthesisFact.id exactly (case-sensitive). */
  factId: string;
  kind: SynthesisClaimKind;
  /** The model's own reading of the number. Must equal fact.direction. */
  direction: FactDirection;
  /** Prose WITHOUT numbers. Placeholders: {value} {low} {high} {label}. */
  text: string;
}

export const CLAIM_REJECTION_REASONS = [
  'malformed', // wrong shape / unknown kind or direction value
  'emptyText', // empty, whitespace, or longer than MAX_CLAIM_TEXT_CHARS
  'unknownFact', // factId not in the supplied facts
  'duplicate', // second claim on the same factId
  'unknownPlaceholder', // a placeholder that is not one of the four allowed
  'missingBandPlaceholder', // {low}/{high} used on a bandless fact
  'directionMismatch', // claim.direction !== fact.direction
  'insufficientEvidence', // recommendation on a fact below the Spec 3/5 bar
  'foreignNumber', // digit in text that no referenced label contains
] as const;
export type ClaimRejectionReason = (typeof CLAIM_REJECTION_REASONS)[number];

export interface RejectedClaim {
  claim: SynthesisClaim;
  reason: ClaimRejectionReason;
}

export interface ValidatedSynthesis {
  accepted: SynthesisClaim[];
  rejected: RejectedClaim[];
}

const FACT_DIRECTION_VALUES: readonly FactDirection[] = ['positive', 'negative', 'neutral'];

const ALLOWED_PLACEHOLDERS = ['value', 'low', 'high', 'label'] as const;
const BAND_PLACEHOLDERS = ['low', 'high'] as const;

const PLACEHOLDER_PATTERN = /\{([a-zA-Z]*)\}/g;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural check only (reason 'malformed'): correct shape, known kind and
 *  direction values. Does not know about facts yet. */
function coerceClaim(candidate: unknown): SynthesisClaim | null {
  if (!isRecord(candidate)) {
    return null;
  }
  const { factId, kind, direction, text } = candidate;
  if (typeof factId !== 'string' || factId.length === 0) {
    return null;
  }
  if (typeof kind !== 'string' || !SYNTHESIS_CLAIM_KINDS.includes(kind as SynthesisClaimKind)) {
    return null;
  }
  if (
    typeof direction !== 'string' ||
    !FACT_DIRECTION_VALUES.includes(direction as FactDirection)
  ) {
    return null;
  }
  if (typeof text !== 'string') {
    return null;
  }
  return {
    factId,
    kind: kind as SynthesisClaimKind,
    direction: direction as FactDirection,
    text,
  };
}

/** Placeholders present in the text, in order of appearance (including
 *  unknown ones, so the caller can decide malformed vs. unknownPlaceholder). */
function extractPlaceholders(text: string): string[] {
  const placeholders: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.push(match[1] ?? '');
  }
  return placeholders;
}

/** Digits left over after stripping placeholders that are allowed only when
 *  they occur as a substring of fact.label or one of fact.entityNames. */
function hasForeignNumber(text: string, fact: SynthesisFact): boolean {
  const withoutPlaceholders = text.replace(PLACEHOLDER_PATTERN, '');
  const numbers = withoutPlaceholders.match(NUMBER_PATTERN) ?? [];
  return numbers.some((token) => {
    const inLabel = fact.label.includes(token);
    const inEntityNames = fact.entityNames.some((name) => name.includes(token));
    return !inLabel && !inEntityNames;
  });
}

/**
 * The provider-independent grounding gate for structured input -- the
 * counterpart to validateAnalysis() for battle logs. Never throws: unusable
 * input yields { accepted: [], rejected: [] }. `accepted` keeps the model's
 * order; the first claim per factId wins.
 */
export function validateSynthesis(claims: unknown, facts: SynthesisFact[]): ValidatedSynthesis {
  const accepted: SynthesisClaim[] = [];
  const rejected: RejectedClaim[] = [];

  if (!Array.isArray(claims)) {
    return { accepted, rejected };
  }

  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const seenFactIds = new Set<string>();
  const limitedClaims = claims.slice(0, MAX_SYNTHESIS_CLAIMS);

  for (const candidate of limitedClaims) {
    const claim = coerceClaim(candidate);
    if (!claim) {
      // Malformed candidates have no valid SynthesisClaim shape to attach to
      // RejectedClaim.claim; the plan's malformed-input tests only assert on
      // `reason`, never on `claim`, for this case.
      rejected.push({ claim: candidate as SynthesisClaim, reason: 'malformed' });
      continue;
    }

    const trimmedText = claim.text.trim();
    if (trimmedText.length === 0 || claim.text.length > MAX_CLAIM_TEXT_CHARS) {
      rejected.push({ claim, reason: 'emptyText' });
      continue;
    }

    const fact = factsById.get(claim.factId);
    if (!fact) {
      rejected.push({ claim, reason: 'unknownFact' });
      continue;
    }

    if (seenFactIds.has(claim.factId)) {
      rejected.push({ claim, reason: 'duplicate' });
      continue;
    }

    const placeholders = extractPlaceholders(claim.text);
    const hasUnknownPlaceholder = placeholders.some(
      (name) => !ALLOWED_PLACEHOLDERS.includes(name as (typeof ALLOWED_PLACEHOLDERS)[number]),
    );
    if (hasUnknownPlaceholder) {
      rejected.push({ claim, reason: 'unknownPlaceholder' });
      continue;
    }

    const hasBand = fact.lowPct !== null && fact.highPct !== null;
    const usesBandPlaceholder = placeholders.some((name) =>
      BAND_PLACEHOLDERS.includes(name as (typeof BAND_PLACEHOLDERS)[number]),
    );
    if (usesBandPlaceholder && !hasBand) {
      rejected.push({ claim, reason: 'missingBandPlaceholder' });
      continue;
    }

    if (claim.direction !== fact.direction) {
      rejected.push({ claim, reason: 'directionMismatch' });
      continue;
    }

    if (claim.kind === 'recommendation' && !fact.usableForRecommendation) {
      rejected.push({ claim, reason: 'insufficientEvidence' });
      continue;
    }

    if (hasForeignNumber(claim.text, fact)) {
      rejected.push({ claim, reason: 'foreignNumber' });
      continue;
    }

    seenFactIds.add(claim.factId);
    accepted.push(claim);
  }

  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// 3.4 -- rendering and assembly (deterministic, no second LLM round)
// ---------------------------------------------------------------------------

export const SYNTHESIS_SECTIONS = [
  'headline',
  'strengths',
  'risks',
  'listLevers',
  'context',
] as const;
export type SynthesisSection = (typeof SYNTHESIS_SECTIONS)[number];

/** Max rendered sentences kept per section; excess (model order) are dropped
 *  from `sections` without affecting `droppedCount` (that only counts
 *  `validated.rejected`). */
const MAX_SECTION_SENTENCES = 3;

/**
 * Section for a claim -- derived, never chosen by the model. First match
 * wins, in this exact order:
 *  1. claim.kind === 'recommendation' -> 'listLevers'
 *  2. fact.kind === 'fieldScore'      -> 'headline'
 *  3. fact.direction === 'positive'   -> 'strengths'
 *  4. fact.direction === 'negative'   -> 'risks'
 *  5. else                            -> 'context'
 */
export function sectionForClaim(claim: SynthesisClaim, fact: SynthesisFact): SynthesisSection {
  if (claim.kind === 'recommendation') {
    return 'listLevers';
  }
  if (fact.kind === 'fieldScore') {
    return 'headline';
  }
  if (fact.direction === 'positive') {
    return 'strengths';
  }
  if (fact.direction === 'negative') {
    return 'risks';
  }
  return 'context';
}

const CLAIM_PLACEHOLDER_PATTERN = /\{(value|low|high|label)\}/g;

/** One decimal, dot separator -- consistent with the existing
 *  formatWithInterval (apps/web/src/components/meta/confidence.ts:27-37). */
function formatSynthesisNumber(value: number): string {
  return value.toFixed(1);
}

/**
 * Substitute the four placeholders from the fact. Numbers use one decimal
 * and a dot separator, without a unit (the model writes the unit itself);
 * {label} renders fact.label.
 */
export function renderClaimText(claim: SynthesisClaim, fact: SynthesisFact): string {
  return claim.text.replace(CLAIM_PLACEHOLDER_PATTERN, (match, name: string) => {
    switch (name) {
      case 'value':
        return formatSynthesisNumber(fact.value);
      case 'low':
        return fact.lowPct === null ? match : formatSynthesisNumber(fact.lowPct);
      case 'high':
        return fact.highPct === null ? match : formatSynthesisNumber(fact.highPct);
      case 'label':
        return fact.label;
      default:
        return match;
    }
  });
}

export interface SynthesisSectionBlock {
  section: SynthesisSection;
  sentences: string[];
}

export const DECK_SYNTHESIS_SOURCE_VALUES = ['llm', 'demo-seed'] as const;
export type DeckSynthesisSource = (typeof DECK_SYNTHESIS_SOURCE_VALUES)[number];

export interface DeckSynthesis {
  deckId: number;
  archetypeId: string;
  archetypeName: string;
  windowDays: number;
  language: SynthesisLanguage;
  promptVersion: number;
  /** Rendered, ready to display. Empty sections omitted; section order is
   *  SYNTHESIS_SECTIONS order; max 3 sentences per section (model order). */
  sections: SynthesisSectionBlock[];
  /** The surviving claims, for the "worauf beruht das?" disclosure. */
  claims: SynthesisClaim[];
  /** Snapshot the text was generated from -- the UI renders THESE numbers. */
  facts: SynthesisFact[];
  context: SynthesisContext;
  /** How many model claims the gate dropped. Surfaced, never hidden. */
  droppedCount: number;
  source: DeckSynthesisSource;
  provider: string | null;
  model: string | null;
  inputHash: string;
  generatedAt: string; // ISO
}

/** Pure assembly: validated claims + facts + context -> DeckSynthesis. No
 *  I/O, no Date.now()/Math.random() -- idempotent for identical inputs. */
export function assembleSynthesis(
  validated: ValidatedSynthesis,
  facts: SynthesisFact[],
  context: SynthesisContext,
  meta: {
    inputHash: string;
    source: DeckSynthesisSource;
    provider: string | null;
    model: string | null;
    generatedAt: string;
  },
): DeckSynthesis {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));

  const sentencesBySection = new Map<SynthesisSection, string[]>();
  for (const claim of validated.accepted) {
    const fact = factsById.get(claim.factId);
    if (!fact) {
      continue;
    }
    const section = sectionForClaim(claim, fact);
    const sentence = renderClaimText(claim, fact);
    const existing = sentencesBySection.get(section);
    if (existing) {
      existing.push(sentence);
    } else {
      sentencesBySection.set(section, [sentence]);
    }
  }

  const sections: SynthesisSectionBlock[] = [];
  for (const section of SYNTHESIS_SECTIONS) {
    const sentences = sentencesBySection.get(section);
    if (sentences && sentences.length > 0) {
      sections.push({ section, sentences: sentences.slice(0, MAX_SECTION_SENTENCES) });
    }
  }

  return {
    deckId: context.deckId,
    archetypeId: context.archetypeId,
    archetypeName: context.archetypeName,
    windowDays: context.windowDays,
    language: context.language,
    promptVersion: SYNTHESIS_PROMPT_VERSION,
    sections,
    claims: validated.accepted,
    facts,
    context,
    droppedCount: validated.rejected.length,
    source: meta.source,
    provider: meta.provider,
    model: meta.model,
    inputHash: meta.inputHash,
    generatedAt: meta.generatedAt,
  };
}
