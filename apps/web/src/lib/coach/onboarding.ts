// Pure helpers of the archetype-first onboarding (Spec 7 §5.1).
import type { TournamentDecklist } from '@pokekon/shared';
import type { CardType } from '../../types';
import type { FieldAnalysisArchetype } from '../api';
import { inferCardRole, type ParsedCard } from '../deckImport';

/** The n most-played archetypes of the field, highest share first. */
export function topFieldArchetypes(
  field: readonly FieldAnalysisArchetype[],
  n = 10,
): FieldAnalysisArchetype[] {
  return [...field].sort((a, b) => b.sharePct - a.sharePct).slice(0, n);
}

/** Cards of a published list (the best cluster's medoid, Spec 1) as importable
 *  deck cards. Mapped directly rather than via the PTCGL text format: the text
 *  parser needs a print on every line, and published lists do not always carry
 *  one — those cards would silently disappear. Missing prints stay empty (the
 *  export button flags them). */
export function medoidToParsedCards(representative: TournamentDecklist): ParsedCard[] {
  const map = (entries: TournamentDecklist['pokemon'], type: CardType): ParsedCard[] =>
    entries.map((e) => ({
      count: e.count,
      name: e.name,
      set: e.set ?? '',
      number: e.number ?? '',
      type,
      role: inferCardRole(e.name, type),
    }));
  return [
    ...map(representative.pokemon, 'Pokemon'),
    ...map(representative.trainer, 'Trainer'),
    ...map(representative.energy, 'Energy'),
  ];
}
