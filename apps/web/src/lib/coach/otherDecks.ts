import { ARCHETYPE_SLUG_PATTERN } from '@pokekon/shared';
import type { Deck } from '../../types';

export interface OtherArchetypeGroup {
  archetype: string;
  name: string;
  deckIds: number[];
  /** A valid Limitless slug — the user can switch to it; legacy free-text
   *  archetypes can only be assigned to the active archetype. */
  switchable: boolean;
}

/** The user's decks of OTHER archetypes than the coached one, grouped per
 *  archetype, most lists first (then by name). */
export function otherArchetypeGroups(
  decks: readonly Deck[],
  activeArchetypeId: string,
): OtherArchetypeGroup[] {
  const groups = new Map<string, OtherArchetypeGroup>();
  for (const d of decks) {
    if (d.archetype === activeArchetypeId || d.id === undefined) continue;
    const g = groups.get(d.archetype) ?? {
      archetype: d.archetype,
      name: d.archetypeName || d.archetype,
      deckIds: [],
      switchable: ARCHETYPE_SLUG_PATTERN.test(d.archetype),
    };
    g.deckIds.push(d.id);
    groups.set(d.archetype, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.deckIds.length - a.deckIds.length || a.name.localeCompare(b.name),
  );
}
