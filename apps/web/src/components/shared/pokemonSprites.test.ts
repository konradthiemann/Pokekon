import { describe, expect, it } from 'vitest';
import { spriteUrlCandidates } from './pokemonSprites';

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
