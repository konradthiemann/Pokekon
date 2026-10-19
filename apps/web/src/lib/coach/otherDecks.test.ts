import { describe, expect, it } from 'vitest';
import type { Deck } from '../../types';
import { otherArchetypeGroups } from './otherDecks';

const deck = (id: number, archetype: string, archetypeName = archetype): Deck => ({
  id,
  archetype,
  archetypeName,
  variant: '',
  createdAt: '2026-09-01',
});

describe('otherArchetypeGroups', () => {
  it('excludes the active archetype and groups the rest with deck ids', () => {
    const groups = otherArchetypeGroups(
      [
        deck(1, 'dragapult-ex'),
        deck(2, 'n-zoroark', "N's Zoroark"),
        deck(3, 'n-zoroark', "N's Zoroark"),
      ],
      'dragapult-ex',
    );
    expect(groups).toEqual([
      { archetype: 'n-zoroark', name: "N's Zoroark", deckIds: [2, 3], switchable: true },
    ]);
  });

  it('marks invalid slugs (legacy free text) as not switchable', () => {
    const [g] = otherArchetypeGroups([deck(4, 'N Zoroark', 'N Zoroark')], 'dragapult-ex');
    expect(g).toMatchObject({ archetype: 'N Zoroark', switchable: false });
  });

  it('sorts by number of decks desc, then by name', () => {
    const groups = otherArchetypeGroups(
      [
        deck(1, 'b-deck', 'B'),
        deck(2, 'a-deck', 'A'),
        deck(3, 'c-deck', 'C'),
        deck(4, 'c-deck', 'C'),
      ],
      'dragapult-ex',
    );
    expect(groups.map((g) => g.archetype)).toEqual(['c-deck', 'a-deck', 'b-deck']);
  });

  it('returns [] without other archetypes', () => {
    expect(otherArchetypeGroups([deck(1, 'dragapult-ex')], 'dragapult-ex')).toEqual([]);
  });
});
