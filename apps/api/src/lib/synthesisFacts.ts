import { createHash } from 'node:crypto';
import {
  canonicalizeFacts,
  factsFromCardStats,
  factsFromEquilibrium,
  factsFromFieldScore,
  sanitizeFactLabel,
  selectFacts,
  type SynthesisContext,
  type SynthesisFact,
  type SynthesisFactSet,
  type SynthesisLanguage,
} from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { loadFieldScores } from '../routes/meta.js';
import { loadCardStats } from './cardStatsData.js';
import { loadEquilibrium } from './equilibriumData.js';

export interface BuildFactSetInput {
  deck: { id: number; archetype: string; archetypeName: string; variant: string };
  deckCards: { name: string; count: number }[];
  windowDays: number;
  language: SynthesisLanguage;
}

/** The ONLY I/O in the synthesis path (plan §3.9). Reads loadFieldScores,
 *  loadCardStats and loadEquilibrium (always the default online-Bo1 scope,
 *  matching the card-stats and equilibrium readers) and turns their rows into
 *  facts via the pure `factsFrom*` producers. Never throws: an archetype
 *  missing from the field score yields `facts: []` with a fully populated
 *  `context`; cold `archetype_card_stats`/`meta_equilibrium_runs` tables
 *  yield only field-score facts (same "honestly empty" contract as
 *  loadCardStats/loadEquilibrium themselves). */
export async function buildSynthesisFactSet(
  db: Db,
  input: BuildFactSetInput,
): Promise<SynthesisFactSet> {
  const { deck, deckCards, windowDays, language } = input;

  const [fieldScores, cardStats, equilibrium] = await Promise.all([
    loadFieldScores(db, { days: windowDays, online: true, bo1: true }),
    loadCardStats(db, deck.archetype, windowDays),
    loadEquilibrium(db, windowDays),
  ]);

  const score = fieldScores.scores.find((s) => s.archetypeId === deck.archetype);

  // Missing from the field score entirely means the deck's archetype has no
  // tournament presence in this window — the synthesis then has nothing
  // reliable to say about it, from ANY source (plan §3.9: "Archetyp nicht im
  // Field-Score-Ergebnis ⇒ facts: []"), not just no field-score facts.
  const facts: SynthesisFact[] = score
    ? [
        ...factsFromFieldScore(score),
        ...factsFromCardStats(cardStats.cards, deckCards),
        ...factsFromEquilibrium(equilibrium.archetypes, deck.archetype),
      ]
    : [];

  const context: SynthesisContext = {
    deckId: deck.id,
    archetypeId: deck.archetype,
    archetypeName: sanitizeFactLabel(deck.archetypeName),
    variant: sanitizeFactLabel(deck.variant),
    windowDays,
    language,
    cardStatsComputedAt: cardStats.computedAt?.toISOString() ?? null,
    equilibriumComputedAt: equilibrium.computedAt?.toISOString() ?? null,
    matchupImportedAt: fieldScores.matchup.trainerHillImportedAt?.toISOString() ?? null,
  };

  return { facts: selectFacts(facts), context };
}

/** sha256 (hex) over canonicalizeFacts(facts, meta) — the deck-synthesis
 *  cache key (plan §3.7). Hashes canonicalizeFacts's deterministic output,
 *  not the raw fact objects, so it inherits its rounding/ordering guarantees. */
export function synthesisInputHash(
  facts: SynthesisFact[],
  meta: {
    archetypeId: string;
    windowDays: number;
    language: SynthesisLanguage;
    promptVersion: number;
  },
): string {
  return createHash('sha256').update(canonicalizeFacts(facts, meta)).digest('hex');
}
