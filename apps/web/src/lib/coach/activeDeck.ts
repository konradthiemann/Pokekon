// Pure resolution logic for the archetype-first UI (Spec 7 §5.1): which deck is
// active for the coached archetype, and which archetype an existing account is
// migrated to. No I/O — the store wires these to the API.
import { ARCHETYPE_SLUG_PATTERN } from '@pokekon/shared';
import type { Deck } from '../../types';

function isValidSlug(value: string | null | undefined): value is string {
  return value != null && ARCHETYPE_SLUG_PATTERN.test(value);
}

/**
 * Which deck is active for an archetype: the remembered one → the fallback (only
 * if it has the same archetype) → the newest deck of that archetype → null.
 * `archetypeId: null` keeps the legacy rule of the old layout: the fallback if it
 * still exists, else the first deck.
 */
export function resolveActiveDeckId(input: {
  decks: Deck[];
  archetypeId: string | null;
  remembered: Record<string, number>;
  fallbackId: number | null;
}): number | null {
  const { decks, archetypeId, remembered, fallbackId } = input;

  if (archetypeId === null) {
    if (fallbackId !== null && decks.some((d) => d.id === fallbackId)) return fallbackId;
    return decks[0]?.id ?? null;
  }

  const ofArchetype = decks.filter((d) => d.archetype === archetypeId && d.id != null);
  const rememberedId = remembered[archetypeId];
  if (rememberedId !== undefined && ofArchetype.some((d) => d.id === rememberedId)) {
    return rememberedId;
  }
  if (fallbackId !== null && ofArchetype.some((d) => d.id === fallbackId)) return fallbackId;

  const newest = [...ofArchetype].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return newest?.id ?? null;
}

/** One-time migration source: a valid legacy slug first, else the active deck's archetype. */
export function pickMigrationArchetype(input: {
  legacySlug: string | null;
  activeDeck: Deck | null;
}): string | null {
  const legacy = input.legacySlug?.trim() ?? null;
  if (isValidSlug(legacy)) return legacy;
  const fromDeck = input.activeDeck?.archetype ?? null;
  return isValidSlug(fromDeck) ? fromDeck : null;
}
