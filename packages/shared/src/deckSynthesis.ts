// Deck-synthesis fact/claim primitives (plan
// .claude/plans/ai-recommendation-synthesis.md §3.1, Slice A). Pure types and
// grounding helpers over the structured metrics that feed the LLM prompt --
// no I/O, same shape as fieldWinRate.ts / cardPerformance.ts.
import { normalizeCardName } from './cardPerformance.js';
import type { ArchetypeCardStat } from './cardPerformance.js';
import type { FieldScore, WeightedMatchup } from './fieldWinRate.js';
import type { FitnessDirection } from './nashEquilibrium.js';

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

// ---------------------------------------------------------------------------
// 3.2 -- fact production from the three sources (pure, no I/O)
// ---------------------------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** True when the [lowPct, highPct] band excludes neutralValue -- the same
 *  meaning as WeightedMatchup.significant / CardPerformanceDelta.significant.
 *  Bandless facts (either bound null) are never significant. */
function bandExcludesNeutral(
  lowPct: number | null,
  highPct: number | null,
  neutralValue: number,
): boolean {
  if (lowPct === null || highPct === null) {
    return false;
  }
  return lowPct > neutralValue || highPct < neutralValue;
}

/** Field score + weighted matchups of ONE archetype (the user's deck).
 *  Produces 'field.winRate' (only when fieldWinRatePct is not null),
 *  'field.coverage', 'meta.share.self', plus one 'matchup.<id>' per emitted
 *  threat/free win and one 'meta.share.<id>' alongside it. Matchups are
 *  emitted in the order `score.threats`/`score.freeWins` already provide
 *  (heaviest weight first, fieldWinRate.ts:69-74) -- this function does not
 *  re-sort them. */
export function factsFromFieldScore(
  score: FieldScore,
  opts?: { maxThreats?: number; maxFreeWins?: number },
): SynthesisFact[] {
  const maxThreats = opts?.maxThreats ?? 4;
  const maxFreeWins = opts?.maxFreeWins ?? 3;
  const facts: SynthesisFact[] = [];
  const selfLabel = sanitizeFactLabel(score.archetypeName);

  if (score.fieldWinRatePct !== null) {
    const direction = deriveFactDirection({
      value: score.fieldWinRatePct,
      neutralValue: 50,
      lowPct: score.fieldWinRateLowPct,
      highPct: score.fieldWinRateHighPct,
    });
    facts.push({
      id: 'field.winRate',
      kind: 'fieldScore',
      label: selfLabel,
      value: score.fieldWinRatePct,
      unit: 'pct',
      neutralValue: 50,
      lowPct: score.fieldWinRateLowPct,
      highPct: score.fieldWinRateHighPct,
      direction,
      significant: bandExcludesNeutral(score.fieldWinRateLowPct, score.fieldWinRateHighPct, 50),
      usableForRecommendation: direction !== 'neutral',
      entityNames: [],
    });
  }

  const coverageDirection = deriveFactDirection({
    value: score.coveragePct,
    neutralValue: 100,
    lowPct: null,
    highPct: null,
  });
  facts.push({
    id: 'field.coverage',
    kind: 'coverage',
    label: selfLabel,
    value: score.coveragePct,
    unit: 'pct',
    neutralValue: 100,
    lowPct: null,
    highPct: null,
    direction: coverageDirection,
    significant: false,
    usableForRecommendation: false,
    entityNames: [],
  });

  facts.push({
    id: 'meta.share.self',
    kind: 'metaShare',
    label: selfLabel,
    value: score.sharePct,
    unit: 'pct',
    neutralValue: 0,
    lowPct: null,
    highPct: null,
    direction: deriveFactDirection({
      value: score.sharePct,
      neutralValue: 0,
      lowPct: null,
      highPct: null,
    }),
    significant: false,
    usableForRecommendation: false,
    entityNames: [],
  });

  const pushMatchupPair = (matchup: WeightedMatchup): void => {
    const label = sanitizeFactLabel(matchup.archetypeName);
    const direction = deriveFactDirection({
      value: matchup.winRatePct,
      neutralValue: 50,
      lowPct: matchup.lowPct,
      highPct: matchup.highPct,
    });
    facts.push({
      id: `matchup.${matchup.archetypeId}`,
      kind: 'matchup',
      label,
      value: matchup.winRatePct,
      unit: 'pct',
      neutralValue: 50,
      lowPct: matchup.lowPct,
      highPct: matchup.highPct,
      direction,
      // Mirrors WeightedMatchup.significant exactly -- it is computed on the
      // UNROUNDED bounds (fieldWinRate.ts:42-43), a stronger source than
      // re-deriving from the already-rounded band above.
      significant: matchup.significant,
      usableForRecommendation: matchup.significant,
      entityNames: [],
    });
    facts.push({
      id: `meta.share.${matchup.archetypeId}`,
      kind: 'metaShare',
      label,
      value: matchup.sharePct,
      unit: 'pct',
      neutralValue: 0,
      lowPct: null,
      highPct: null,
      direction: deriveFactDirection({
        value: matchup.sharePct,
        neutralValue: 0,
        lowPct: null,
        highPct: null,
      }),
      significant: false,
      usableForRecommendation: false,
      entityNames: [],
    });
  };

  for (const threat of score.threats.slice(0, maxThreats)) {
    pushMatchupPair(threat);
  }
  for (const freeWin of score.freeWins.slice(0, maxFreeWins)) {
    pushMatchupPair(freeWin);
  }

  return facts;
}

/** Card performance deltas (Spec 5) crossed with the user's actual list.
 *  Emits only ACTIONABLE cards: in the deck with a negative deltaPp, or not
 *  in the deck with a positive deltaPp. Cards with tier 'insufficient' are
 *  emitted with usableForRecommendation=false (mentionable as context) --
 *  never silently dropped, so the model cannot mistake absence for "no such
 *  card". Sorted by |deltaPp| desc, then cardName asc. */
export function factsFromCardStats(
  cards: ArchetypeCardStat[],
  deckCards: { name: string; count: number }[],
  opts?: { max?: number },
): SynthesisFact[] {
  const max = opts?.max ?? 6;
  const deckCountByName = new Map(
    deckCards.map((card) => [normalizeCardName(card.name), card.count]),
  );

  const actionable: SynthesisFact[] = [];
  for (const card of cards) {
    if (card.delta === null) {
      continue;
    }
    const normalizedName = normalizeCardName(card.cardName);
    const inUserDeck = deckCountByName.has(normalizedName);
    const deltaPp = card.delta.deltaPp;
    const isActionable = (inUserDeck && deltaPp < 0) || (!inUserDeck && deltaPp > 0);
    if (!isActionable) {
      continue;
    }

    const label = sanitizeFactLabel(card.cardName);
    // The -50 axis shift: CardPerformanceDelta.lowPct/highPct live on the
    // superiorityPct axis (neutral 50), deltaPp lives on the 0-axis (plan
    // §3.2 note, cardPerformance.ts:120-125). Shifting both bounds by the
    // same constant preserves delta.significant on the new axis exactly.
    const lowPct = round1(card.delta.lowPct - 50);
    const highPct = round1(card.delta.highPct - 50);
    const direction = deriveFactDirection({
      value: deltaPp,
      neutralValue: 0,
      lowPct,
      highPct,
    });

    actionable.push({
      id: `card.${factIdForCard(card.cardName)}`,
      kind: 'cardDelta',
      label,
      value: deltaPp,
      unit: 'pp',
      neutralValue: 0,
      lowPct,
      highPct,
      direction,
      significant: card.delta.significant,
      usableForRecommendation: card.tier !== 'insufficient' && card.delta.significant,
      entityNames: [],
      inUserDeck,
      ...(inUserDeck ? { userCount: deckCountByName.get(normalizedName) } : {}),
    });
  }

  actionable.sort((a, b) => {
    const byMagnitude = Math.abs(b.value) - Math.abs(a.value);
    if (byMagnitude !== 0) {
      return byMagnitude;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  return actionable.slice(0, max);
}

/** Equilibrium signals (Spec 6). Emits 'equilibrium.weight', 'equilibrium.gap'
 *  and 'equilibrium.trend' for the user's own archetype and
 *  'equilibrium.trend.<id>' for up to `maxRising` rising opponents (ranked by
 *  fitnessDeltaPp desc). Returns [] when the archetype is not in the run --
 *  the synthesis then simply has no equilibrium facts, it does not fail. */
export function factsFromEquilibrium(
  rows: EquilibriumArchetypeRow[],
  selfArchetypeId: string,
  opts?: { maxRising?: number },
): SynthesisFact[] {
  const maxRising = opts?.maxRising ?? 2;
  const selfRow = rows.find((row) => row.archetypeId === selfArchetypeId);
  if (!selfRow) {
    return [];
  }

  const facts: SynthesisFact[] = [];
  const selfLabel = sanitizeFactLabel(selfRow.archetypeName);

  const weightDirection = deriveFactDirection({
    value: selfRow.weightPct,
    neutralValue: selfRow.sharePct,
    lowPct: selfRow.weightP05Pct,
    highPct: selfRow.weightP95Pct,
  });
  facts.push({
    id: 'equilibrium.weight',
    kind: 'equilibriumWeight',
    label: selfLabel,
    value: selfRow.weightPct,
    unit: 'pct',
    neutralValue: selfRow.sharePct,
    lowPct: selfRow.weightP05Pct,
    highPct: selfRow.weightP95Pct,
    direction: weightDirection,
    significant: bandExcludesNeutral(selfRow.weightP05Pct, selfRow.weightP95Pct, selfRow.sharePct),
    usableForRecommendation: weightDirection !== 'neutral',
    entityNames: [],
  });

  // Inverted: played MORE than the equilibrium justifies (paradoxGapPp > 0)
  // is a warning, not a strength (plan §3.1 example, deriveFactDirection
  // invert=true case).
  const gapDirection = deriveFactDirection({
    value: selfRow.paradoxGapPp,
    neutralValue: 0,
    lowPct: null,
    highPct: null,
    invert: true,
  });
  facts.push({
    id: 'equilibrium.gap',
    kind: 'equilibriumGap',
    label: selfLabel,
    value: selfRow.paradoxGapPp,
    unit: 'pp',
    neutralValue: 0,
    lowPct: null,
    highPct: null,
    direction: gapDirection,
    significant: false,
    usableForRecommendation: selfRow.exclusionRatePct >= 70 || selfRow.inSupport,
    entityNames: [],
  });

  if (selfRow.fitnessDeltaPp !== null) {
    const trendDirection = deriveFactDirection({
      value: selfRow.fitnessDeltaPp,
      neutralValue: 0,
      lowPct: null,
      highPct: null,
    });
    facts.push({
      id: 'equilibrium.trend',
      kind: 'equilibriumTrend',
      label: selfLabel,
      value: selfRow.fitnessDeltaPp,
      unit: 'pp',
      neutralValue: 0,
      lowPct: null,
      highPct: null,
      direction: trendDirection,
      significant: false,
      usableForRecommendation: trendDirection !== 'neutral',
      entityNames: [],
    });
  }

  const risingOpponents = rows
    .filter(
      (row) =>
        row.archetypeId !== selfArchetypeId &&
        row.direction === 'rising' &&
        row.fitnessDeltaPp !== null,
    )
    .sort((a, b) => (b.fitnessDeltaPp ?? 0) - (a.fitnessDeltaPp ?? 0))
    .slice(0, maxRising);

  for (const opponent of risingOpponents) {
    // fitnessDeltaPp !== null guaranteed by the filter above.
    const value = opponent.fitnessDeltaPp as number;
    const direction = deriveFactDirection({
      value,
      neutralValue: 0,
      lowPct: null,
      highPct: null,
    });
    facts.push({
      id: `equilibrium.trend.${opponent.archetypeId}`,
      kind: 'equilibriumTrend',
      label: sanitizeFactLabel(opponent.archetypeName),
      value,
      unit: 'pp',
      neutralValue: 0,
      lowPct: null,
      highPct: null,
      direction,
      significant: false,
      usableForRecommendation: direction !== 'neutral',
      entityNames: [],
    });
  }

  return facts;
}

/** The subset of apps/api's EquilibriumArchetypeRow (equilibriumData.ts:6-29)
 *  that fact production needs. Declared independently here rather than
 *  imported -- packages/shared is browser-safe and does not depend on
 *  apps/api; the two shapes stay compatible structurally, matching the
 *  existing per-layer duplication of this type (equilibriumData.ts,
 *  apps/web/src/lib/api.ts:687). */
export interface EquilibriumArchetypeRow {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  weightPct: number;
  paradoxGapPp: number;
  inSupport: boolean;
  exclusionRatePct: number;
  weightP05Pct: number;
  weightP95Pct: number;
  fitnessDeltaPp: number | null;
  direction: FitnessDirection;
}

/** Fact ids that carry the user's OWN archetype's equilibrium signal --
 *  bucket 4 of selectFacts. Deliberately excludes
 *  'equilibrium.trend.<opponentId>' (opponent facts), which fall through to
 *  the "rest" bucket instead. */
const OWN_EQUILIBRIUM_FACT_IDS = new Set<string>([
  'equilibrium.weight',
  'equilibrium.gap',
  'equilibrium.trend',
]);

/** Deterministic cap at MAX_SYNTHESIS_FACTS. Priority (bindend, plan §3.2):
 *  1. field.winRate  2. field.coverage  3. meta.share.self
 *  4. equilibrium.* (self)  5. matchup.* (input order preserved --
 *     SynthesisFact carries no weightPct of its own; factsFromFieldScore
 *     already emits threats/freeWins heaviest-weight-first, so this is a
 *     stable partition, not a re-derived sort)
 *  6. card.* (|deltaPp| desc, id asc on ties)
 *  7. everything else, incl. meta.share.<id> and
 *     equilibrium.trend.<opponentId> (id asc).
 *  Stable: same input -> same output, always. */
export function selectFacts(facts: SynthesisFact[]): SynthesisFact[] {
  const fieldWinRate: SynthesisFact[] = [];
  const fieldCoverage: SynthesisFact[] = [];
  const metaShareSelf: SynthesisFact[] = [];
  const ownEquilibrium: SynthesisFact[] = [];
  const matchups: SynthesisFact[] = [];
  const cards: SynthesisFact[] = [];
  const rest: SynthesisFact[] = [];

  for (const fact of facts) {
    if (fact.id === 'field.winRate') {
      fieldWinRate.push(fact);
    } else if (fact.id === 'field.coverage') {
      fieldCoverage.push(fact);
    } else if (fact.id === 'meta.share.self') {
      metaShareSelf.push(fact);
    } else if (OWN_EQUILIBRIUM_FACT_IDS.has(fact.id)) {
      ownEquilibrium.push(fact);
    } else if (fact.kind === 'matchup') {
      matchups.push(fact);
    } else if (fact.kind === 'cardDelta') {
      cards.push(fact);
    } else {
      rest.push(fact);
    }
  }

  const byIdAsc = (a: SynthesisFact, b: SynthesisFact): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

  cards.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || byIdAsc(a, b));
  rest.sort(byIdAsc);

  return [
    ...fieldWinRate,
    ...fieldCoverage,
    ...metaShareSelf,
    ...ownEquilibrium,
    ...matchups,
    ...cards,
    ...rest,
  ].slice(0, MAX_SYNTHESIS_FACTS);
}

// ---------------------------------------------------------------------------
// 3.7 -- canonicalization (the cache-key input)
// ---------------------------------------------------------------------------

/** Deterministic string over exactly what goes into the prompt: facts sorted
 *  by id asc, every number rounded to one decimal, meta appended. Excludes
 *  entityNames/inUserDeck/userCount (derived, not prompt-relevant) so a job
 *  re-run producing identical numbers does not invalidate a cached text. */
export function canonicalizeFacts(
  facts: SynthesisFact[],
  meta: {
    archetypeId: string;
    windowDays: number;
    language: SynthesisLanguage;
    promptVersion: number;
  },
): string {
  const sorted = [...facts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lines = sorted.map((fact) =>
    [
      fact.id,
      fact.kind,
      fact.label,
      round1(fact.value),
      fact.unit,
      round1(fact.neutralValue),
      fact.lowPct === null ? 'null' : round1(fact.lowPct),
      fact.highPct === null ? 'null' : round1(fact.highPct),
      fact.direction,
      fact.significant,
      fact.usableForRecommendation,
    ].join('|'),
  );
  lines.push([meta.archetypeId, meta.windowDays, meta.language, meta.promptVersion].join('|'));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3.5 -- prompt construction
// ---------------------------------------------------------------------------

const SYNTHESIS_FACT_KIND_LABELS_DE: Record<SynthesisFactKind, string> = {
  fieldScore: 'Field-Score (gewichtete Gewinnrate gegen das aktuelle Feld)',
  coverage: 'Abdeckung der Matchup-Daten',
  matchup: 'Einzel-Matchup',
  metaShare: 'Feldanteil',
  cardDelta: 'Karten-Performance-Delta',
  equilibriumWeight: 'Nash-Gewicht',
  equilibriumGap: 'Abweichung vom Nash-Gewicht',
  equilibriumTrend: 'Formtrend',
};

const SYNTHESIS_FACT_KIND_LABELS_EN: Record<SynthesisFactKind, string> = {
  fieldScore: 'field score (share-weighted win rate against the current field)',
  coverage: 'matchup data coverage',
  matchup: 'single matchup',
  metaShare: 'field share',
  cardDelta: 'card performance delta',
  equilibriumWeight: 'Nash weight',
  equilibriumGap: 'gap versus the Nash weight',
  equilibriumTrend: 'form trend',
};

/**
 * German/English system + user prompts. The anti-hallucination rules are
 * baked in, mirroring buildAnalysisPrompts (battleAnalysis.ts:81-152): write
 * about the listed facts ONLY, exactly one factId per statement; NEVER write
 * a number, use {value}/{low}/{high}/{label}; declare a `direction` matching
 * the fact's stated direction; a `recommendation` only on facts marked
 * usable; when unsure, omit the statement; answer with JSON only. Facts are
 * listed by id/kind/label/direction/usableForRecommendation -- deliberately
 * WITHOUT their raw numbers, so the model never has a number of its own to
 * leak into prose; the rendered text is filled in afterwards by
 * renderClaimText from the real fact data.
 */
export function buildSynthesisPrompts(
  facts: SynthesisFact[],
  context: SynthesisContext,
): { system: string; user: string } {
  const isDe = context.language === 'de';
  const kindLabels = isDe ? SYNTHESIS_FACT_KIND_LABELS_DE : SYNTHESIS_FACT_KIND_LABELS_EN;

  const system = isDe
    ? `Du bist ein Pokémon-TCG-Meta-Analyst. Du schreibst kurze, belegte Aussagen über ein Deck, ausschließlich auf Basis der dir unten gegebenen Fakten-Liste.

PFLICHTREGELN ZUR VERMEIDUNG VON HALLUZINATIONEN:
1. Schreibe NUR über die gelisteten Fakten, genau ein factId pro Aussage.
2. Schreibe NIEMALS eine Zahl in den Text. Nutze ausschließlich die Platzhalter {value}, {low}, {high}, {label}.
3. Die "direction" deiner Aussage muss exakt der angegebenen direction des Fakts entsprechen.
4. Eine Aussage vom kind "recommendation" ist nur für Fakten mit usableForRecommendation: true erlaubt.
5. Bist du dir unsicher: die Aussage weglassen statt zu spekulieren.
6. Der Leser kennt dieses Deck nicht -- keine internen Abkürzungen, erkläre "Field-Score" einmal in einfachen Worten.
Antworte ausschließlich mit validem JSON im Schema { "claims": [ { "factId": "...", "kind": "observation"|"recommendation", "direction": "positive"|"negative"|"neutral", "text": "..." } ] }, ohne Markdown-Codeblöcke oder Erklärungen.`
    : `You are a Pokémon TCG meta analyst. You write short, evidence-based statements about a deck, based exclusively on the fact list given to you below.

MANDATORY RULES TO AVOID HALLUCINATIONS:
1. Write ONLY about the listed facts, exactly one factId per statement.
2. NEVER write a number in the text. Use only the placeholders {value}, {low}, {high}, {label}.
3. The "direction" of your statement must exactly match the fact's stated direction.
4. A statement of kind "recommendation" is only allowed for facts with usableForRecommendation: true.
5. When unsure: omit the statement instead of speculating.
6. The reader does not know this specific deck -- no internal abbreviations, explain "field score" once in plain words.
Answer with valid JSON only, in the schema { "claims": [ { "factId": "...", "kind": "observation"|"recommendation", "direction": "positive"|"negative"|"neutral", "text": "..." } ] }, without markdown code fences or explanations.`;

  const factLines = facts
    .map((fact) => {
      const kindLabel = kindLabels[fact.kind];
      return isDe
        ? `- id: ${fact.id} | Art: ${kindLabel} | Bezeichnung: ${fact.label} | direction: ${fact.direction} | usableForRecommendation: ${fact.usableForRecommendation}`
        : `- id: ${fact.id} | kind: ${kindLabel} | label: ${fact.label} | direction: ${fact.direction} | usableForRecommendation: ${fact.usableForRecommendation}`;
    })
    .join('\n');

  const user = isDe
    ? `Deck: ${context.archetypeName} (${context.variant}), Zeitfenster ${context.windowDays} Tage.

Fakten (jede id ist als factId zu verwenden):
${factLines}

Schreibe deine Aussagen jetzt als JSON gemäß dem Schema aus der Systemanweisung.`
    : `Deck: ${context.archetypeName} (${context.variant}), window ${context.windowDays} days.

Facts (use each id as factId):
${factLines}

Now write your statements as JSON per the schema from the system instructions.`;

  return { system, user };
}
