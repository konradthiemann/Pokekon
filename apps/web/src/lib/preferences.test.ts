import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLocalMetaWeightOverrides,
  setLocalMetaWeightOverrides,
  migrateLocalMetaField,
  readLegacyDeckArchSlug,
  clearLegacyDeckArchSlug,
} from './preferences';

const LEGACY_KEY = 'tcg-local-meta-field-v1';
const OVERRIDES_KEY = 'tcg-local-meta-weight-overrides-v1';

beforeEach(() => {
  localStorage.clear();
});

describe('getLocalMetaWeightOverrides / setLocalMetaWeightOverrides (Spec 10 Slice D)', () => {
  it('round-trips a weight-overrides map', () => {
    setLocalMetaWeightOverrides({ 'dragapult-ex': 12, 'n-zoroark-ex': 3 });
    expect(getLocalMetaWeightOverrides()).toEqual({ 'dragapult-ex': 12, 'n-zoroark-ex': 3 });
  });

  it('defaults to {} when nothing is stored', () => {
    expect(getLocalMetaWeightOverrides()).toEqual({});
  });

  it('defensively drops non-numeric / non-finite entries instead of throwing', () => {
    localStorage.setItem(
      OVERRIDES_KEY,
      JSON.stringify({ good: 5, bad: 'nope', alsoBad: Infinity, alsoGood: 0 }),
    );
    expect(getLocalMetaWeightOverrides()).toEqual({ good: 5, alsoGood: 0 });
  });

  it('returns {} for malformed JSON or a non-object value instead of throwing', () => {
    localStorage.setItem(OVERRIDES_KEY, 'not json');
    expect(getLocalMetaWeightOverrides()).toEqual({});
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify([1, 2, 3]));
    expect(getLocalMetaWeightOverrides()).toEqual({});
  });
});

describe('migrateLocalMetaField (Spec 10 Slice D — one-time move off the duplicated field key)', () => {
  it('returns null and touches nothing when the legacy key was never set', () => {
    expect(migrateLocalMetaField()).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('extracts names + per-archetype weight overrides from the legacy entries, then deletes the legacy key', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        { archetypeId: 'dragapult-ex', name: 'Dragapult ex', weight: 12 },
        { archetypeId: 'n-zoroark-ex', name: "N's Zoroark ex", weight: 5 },
      ]),
    );
    const migrated = migrateLocalMetaField();
    expect(migrated).toEqual({
      names: ['Dragapult ex', "N's Zoroark ex"],
      overrides: { 'dragapult-ex': 12, 'n-zoroark-ex': 5 },
    });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('is a true one-time migration: a second call after the first returns null', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ archetypeId: 'x', name: 'X', weight: 1 }]));
    expect(migrateLocalMetaField()).not.toBeNull();
    expect(migrateLocalMetaField()).toBeNull();
  });

  it('returns null (but still deletes the key) for a legacy value that is not a JSON array', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ not: 'an array' }));
    expect(migrateLocalMetaField()).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('returns null (but still deletes the key) for malformed JSON', () => {
    localStorage.setItem(LEGACY_KEY, 'not json at all');
    expect(migrateLocalMetaField()).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('returns null when the legacy array is empty', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify([]));
    expect(migrateLocalMetaField()).toBeNull();
  });

  it('filters out malformed individual entries rather than failing the whole migration', () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        { archetypeId: 'good', name: 'Good', weight: 3 },
        { archetypeId: 'bad', name: 'Bad' }, // missing weight
        'not an object',
      ]),
    );
    const migrated = migrateLocalMetaField();
    expect(migrated).toEqual({ names: ['Good'], overrides: { good: 3 } });
  });
});

describe('legacy deckArchSlug (Spec 7 §5.1: migrated once, deleted after a successful save)', () => {
  it('reads the legacy slug without deleting it', () => {
    localStorage.setItem('tcg-deck-arch-slug-v1', 'dragapult-ex');
    expect(readLegacyDeckArchSlug()).toBe('dragapult-ex');
    expect(localStorage.getItem('tcg-deck-arch-slug-v1')).toBe('dragapult-ex');
  });

  it('clearLegacyDeckArchSlug removes the key', () => {
    localStorage.setItem('tcg-deck-arch-slug-v1', 'dragapult-ex');
    clearLegacyDeckArchSlug();
    expect(readLegacyDeckArchSlug()).toBeNull();
  });

  it('returns null when the key is absent', () => {
    expect(readLegacyDeckArchSlug()).toBeNull();
  });
});
