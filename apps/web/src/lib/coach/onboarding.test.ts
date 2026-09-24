import { describe, expect, it } from 'vitest';
import type { TournamentDecklist } from '@pokekon/shared';
import type { FieldAnalysisArchetype } from '../api';
import { medoidToParsedCards, topFieldArchetypes } from './onboarding';

function entry(archetypeId: string, sharePct: number): FieldAnalysisArchetype {
  return { archetypeId, archetypeName: archetypeId, sharePct } as FieldAnalysisArchetype;
}

describe('topFieldArchetypes', () => {
  it('returns the n most-played archetypes, highest share first', () => {
    const field = Array.from({ length: 12 }, (_, i) => entry(`a-${i}`, i + 1));
    const top = topFieldArchetypes(field, 10);
    expect(top).toHaveLength(10);
    expect(top[0]!.archetypeId).toBe('a-11');
    expect(top.map((a) => a.sharePct)).toEqual(
      [...top.map((a) => a.sharePct)].sort((x, y) => y - x),
    );
  });

  it('does not mutate the input', () => {
    const field = [entry('a', 1), entry('b', 2)];
    topFieldArchetypes(field);
    expect(field.map((f) => f.archetypeId)).toEqual(['a', 'b']);
  });
});

describe('medoidToParsedCards', () => {
  const rep: TournamentDecklist = {
    pokemon: [
      { name: 'Dragapult ex', count: 3, set: 'TWM', number: '130' },
      { name: 'Dreepy', count: 4 },
    ],
    trainer: [{ name: 'Ultra Ball', count: 4, set: 'SVI', number: '196' }],
    energy: [{ name: 'Basic Psychic Energy', count: 5 }],
  };

  it('keeps every card with its count and section', () => {
    const cards = medoidToParsedCards(rep);
    expect(cards.reduce((s, c) => s + c.count, 0)).toBe(16);
    expect(cards.find((c) => c.name === 'Dragapult ex')).toMatchObject({
      count: 3,
      type: 'Pokemon',
    });
    expect(cards.find((c) => c.name === 'Dreepy')).toMatchObject({ count: 4, type: 'Pokemon' });
    expect(cards.find((c) => c.name === 'Ultra Ball')).toMatchObject({ count: 4, type: 'Trainer' });
    expect(cards.filter((c) => c.type === 'Energy').reduce((s, c) => s + c.count, 0)).toBe(5);
  });

  it('keeps the print (set + number) where the list has one', () => {
    const cards = medoidToParsedCards(rep);
    expect(cards.find((c) => c.name === 'Dragapult ex')).toMatchObject({
      set: 'TWM',
      number: '130',
    });
  });
});
