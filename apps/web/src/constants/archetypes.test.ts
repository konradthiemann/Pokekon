import { describe, it, expect, afterEach } from 'vitest';
import { KNOWN_ARCHETYPES, archetypeSignatures, type KnownArchetype } from './archetypes';

// KNOWN_ARCHETYPES is a shared, mutable module-level array. A couple of the
// tests below push a throwaway synthetic entry onto it to exercise an
// invariant that (before @implementer's step 8, plan §4) no REAL entry
// exhibits yet (an entry that already has `logNames` set). Restore the
// original contents after every test so no other test file is affected.
const ORIGINAL_ARCHETYPES: KnownArchetype[] = [...KNOWN_ARCHETYPES];

afterEach(() => {
  KNOWN_ARCHETYPES.length = 0;
  KNOWN_ARCHETYPES.push(...ORIGINAL_ARCHETYPES);
});

describe('archetypeSignatures (plan personal-data-role-rework §3.6)', () => {
  it('gives every returned signature at least one non-empty logNames fragment', () => {
    const signatures = archetypeSignatures();
    expect(signatures.length).toBeGreaterThan(0);
    for (const sig of signatures) {
      expect(sig.logNames.length).toBeGreaterThanOrEqual(1);
      for (const fragment of sig.logNames) {
        expect(fragment.trim()).not.toBe('');
      }
    }
  });

  it('has a unique slug per signature', () => {
    const signatures = archetypeSignatures();
    const slugs = signatures.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('falls back to name tokens minus the generic stopword "Box" for an entry without logNames', () => {
    // Real, existing entry (archetypes.ts) that has no `logNames` today.
    expect(KNOWN_ARCHETYPES.find((a) => a.slug === 'mega-absol-box')?.logNames).toBeUndefined();

    const signatures = archetypeSignatures();
    const absol = signatures.find((s) => s.slug === 'mega-absol-box');
    expect(absol?.logNames).toEqual(['Mega', 'Absol']);
  });

  it('does not additionally mix in name-fallback tokens for an entry that already has logNames', () => {
    KNOWN_ARCHETYPES.push({
      slug: 'test-entry-with-lognames',
      name: 'Zzz Totally Unrelated Display Name',
      logNames: ['Foo', 'Bar'],
    });

    const signatures = archetypeSignatures();
    const entry = signatures.find((s) => s.slug === 'test-entry-with-lognames');
    expect(entry?.logNames).toEqual(['Foo', 'Bar']);
  });

  it('drops an entry whose fragment list would end up empty (name is only stopwords, no logNames)', () => {
    KNOWN_ARCHETYPES.push({
      slug: 'test-entry-empty-fragments',
      name: 'Box Lead',
    });

    const signatures = archetypeSignatures();
    expect(signatures.find((s) => s.slug === 'test-entry-empty-fragments')).toBeUndefined();
  });
});
