// Pure helpers of the archetype-first onboarding (Spec 7 §5.1).
import { ARCHETYPE_SLUG_PATTERN, type TournamentDecklist } from '@pokekon/shared';
import type { CardType, Deck } from '../../types';
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

/** Archetypes of the user's own decks (valid slugs only), each once with the
 *  number of lists, most first — shown on top of onboarding step 1. */
export function ownDeckArchetypes(
  decks: readonly Pick<Deck, 'archetype' | 'archetypeName'>[],
): { slug: string; name: string; count: number }[] {
  const bySlug = new Map<string, { slug: string; name: string; count: number }>();
  for (const d of decks) {
    if (!ARCHETYPE_SLUG_PATTERN.test(d.archetype)) continue;
    const entry = bySlug.get(d.archetype) ?? { slug: d.archetype, name: d.archetypeName, count: 0 };
    entry.count += 1;
    bySlug.set(d.archetype, entry);
  }
  return [...bySlug.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
