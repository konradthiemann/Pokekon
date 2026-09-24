import { describe, expect, it } from 'vitest';
import type { Deck } from '../../types';
import { pickMigrationArchetype, resolveActiveDeckId } from './activeDeck';

function deck(id: number, archetype: string, createdAt: string): Deck {
  return { id, archetype, archetypeName: archetype, variant: 'Standard', createdAt };
}

const ZORO_OLD = deck(1, 'n-zoroark', '2026-01-01T00:00:00.000Z');
const DRAGA = deck(2, 'dragapult-ex', '2026-01-02T00:00:00.000Z');
const ZORO_NEW = deck(3, 'n-zoroark', '2026-01-03T00:00:00.000Z');
const DECKS = [ZORO_OLD, DRAGA, ZORO_NEW];

describe('resolveActiveDeckId', () => {
  it('prefers the remembered deck of the archetype', () => {
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: { 'n-zoroark': 1 },
        fallbackId: 3,
      }),
    ).toBe(1);
  });

  it('ignores a remembered deck that no longer exists or has another archetype', () => {
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: { 'n-zoroark': 99 },
        fallbackId: 1,
      }),
    ).toBe(1);
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: { 'n-zoroark': 2 },
        fallbackId: null,
      }),
    ).toBe(3);
  });

  it('uses the fallback only when it has the same archetype', () => {
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: {},
        fallbackId: 2,
      }),
    ).toBe(3);
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: {},
        fallbackId: 1,
      }),
    ).toBe(1);
  });

  it('falls back to the newest deck of the archetype', () => {
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'n-zoroark',
        remembered: {},
        fallbackId: null,
      }),
    ).toBe(3);
  });

  it('returns null when the user has no deck of that archetype', () => {
    expect(
      resolveActiveDeckId({
        decks: DECKS,
        archetypeId: 'gardevoir-ex',
        remembered: {},
        fallbackId: 2,
      }),
    ).toBeNull();
  });

  it('keeps the legacy rule without an archetype: existing fallback, else first deck', () => {
    expect(
      resolveActiveDeckId({ decks: DECKS, archetypeId: null, remembered: {}, fallbackId: 2 }),
    ).toBe(2);
    expect(
      resolveActiveDeckId({ decks: DECKS, archetypeId: null, remembered: {}, fallbackId: 42 }),
    ).toBe(1);
    expect(
      resolveActiveDeckId({ decks: [], archetypeId: null, remembered: {}, fallbackId: null }),
    ).toBeNull();
  });
});

describe('pickMigrationArchetype', () => {
  it('prefers a valid legacy slug', () => {
    expect(pickMigrationArchetype({ legacySlug: 'dragapult-ex', activeDeck: ZORO_OLD })).toBe(
      'dragapult-ex',
    );
  });

  it('falls back to the active deck archetype for an invalid legacy slug', () => {
    expect(pickMigrationArchetype({ legacySlug: 'N Zoroark', activeDeck: ZORO_OLD })).toBe(
      'n-zoroark',
    );
    expect(pickMigrationArchetype({ legacySlug: '  ', activeDeck: ZORO_OLD })).toBe('n-zoroark');
  });

  it('returns null without any source', () => {
    expect(pickMigrationArchetype({ legacySlug: null, activeDeck: null })).toBeNull();
  });

  it('returns null when the active deck archetype is not a valid slug', () => {
    expect(
      pickMigrationArchetype({
        legacySlug: null,
        activeDeck: deck(4, "N's Zoroark", '2026-01-01T00:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
