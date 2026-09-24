import { describe, expect, it } from 'vitest';
import type { FieldAnalysisArchetype } from '../api';
import type { Deck } from '../../types';
import { archetypeDisplayName } from './archetypeName';

const field = [
  { archetypeId: 'raging-bolt-ogerpon', archetypeName: 'Raging Bolt Ogerpon' },
] as FieldAnalysisArchetype[];
const decks = [
  { id: 1, archetype: 'homebrew-x', archetypeName: 'Homebrew X', variant: 'v', createdAt: '' },
] as Deck[];
const known = [{ slug: 'n-zoroark', name: "N's Zoroark" }];

describe('archetypeDisplayName', () => {
  it('prefers the curated known list', () => {
    expect(archetypeDisplayName('n-zoroark', { known, field, decks })).toBe("N's Zoroark");
  });
  it('then the field analysis', () => {
    expect(archetypeDisplayName('raging-bolt-ogerpon', { known, field, decks })).toBe(
      'Raging Bolt Ogerpon',
    );
  });
  it('then an own deck', () => {
    expect(archetypeDisplayName('homebrew-x', { known, field, decks })).toBe('Homebrew X');
  });
  it('falls back to the slug', () => {
    expect(archetypeDisplayName('unknown-y', { known, field, decks })).toBe('unknown-y');
  });
});
