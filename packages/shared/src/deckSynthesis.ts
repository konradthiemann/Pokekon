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
