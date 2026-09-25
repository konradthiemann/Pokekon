import { describe, expect, it } from 'vitest';
import { resolveArchetypeSprites, spriteUrlCandidates } from './pokemonSprites';

describe('spriteUrlCandidates (Spec 7 §9a: same cascade as PokemonIcon)', () => {
  it('returns the primary sprite on every source, Limitless first', () => {
    expect(spriteUrlCandidates('n-zoroark')).toEqual([
      'https://r2.limitlesstcg.net/pokemon/gen9/zoroark.png',
      'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular/zoroark.png',
    ]);
  });

  it('keeps mega forms (not served by pokesprite) as the first candidate', () => {
    expect(spriteUrlCandidates('mega-lucario')[0]).toBe(
      'https://r2.limitlesstcg.net/pokemon/gen9/lucario-mega.png',
    );
  });

  it('returns no candidates without an archetype', () => {
    expect(spriteUrlCandidates('')).toEqual([]);
  });
});

describe('resolveArchetypeSprites for kebab slugs missing from the map', () => {
  it('builds a mega form from a slug (mega-kangaskhan-ex → kangaskhan-mega)', () => {
    expect(resolveArchetypeSprites('mega-kangaskhan-ex')?.[0]).toBe('kangaskhan-mega');
    expect(spriteUrlCandidates('mega-kangaskhan-ex')[0]).toBe(
      'https://r2.limitlesstcg.net/pokemon/gen9/kangaskhan-mega.png',
    );
  });

  it('strips the ex suffix of a single-Pokémon slug', () => {
    expect(resolveArchetypeSprites('gholdengo-ex')?.[0]).toBe('gholdengo');
  });

  it('keeps mapped slugs and display names unchanged', () => {
    expect(resolveArchetypeSprites('n-zoroark')?.[0]).toBe('zoroark');
    expect(resolveArchetypeSprites('Dragapult ex')?.[0]).toBe('dragapult');
  });
});
