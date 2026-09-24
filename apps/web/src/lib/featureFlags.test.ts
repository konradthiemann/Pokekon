import { describe, expect, it } from 'vitest';
import { resolveFeatureFlag, type FlagSources } from './featureFlags';

const KEY = 'pokekon-ff-archetypeCoachUi';

function memStorage(initial: Record<string, string> = {}): NonNullable<FlagSources['storage']> {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function sources(overrides: Partial<FlagSources> = {}): FlagSources {
  return { env: undefined, search: '', storage: memStorage(), ...overrides };
}

describe('resolveFeatureFlag (archetypeCoachUi)', () => {
  it('is off by default (no env, no storage, no query)', () => {
    expect(resolveFeatureFlag('archetypeCoachUi', sources())).toBe(false);
  });

  it('is on when VITE_FF_ARCHETYPE_COACH_UI is exactly "true"', () => {
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ env: 'true' }))).toBe(true);
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ env: '1' }))).toBe(false);
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ env: 'yes' }))).toBe(false);
  });

  it('is on when the storage key is "1"', () => {
    const storage = memStorage({ [KEY]: '1' });
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ storage }))).toBe(true);
  });

  it('?ff=archetypeCoachUi enables it and persists to storage', () => {
    const storage = memStorage();
    expect(
      resolveFeatureFlag('archetypeCoachUi', sources({ search: '?ff=archetypeCoachUi', storage })),
    ).toBe(true);
    expect(storage.getItem(KEY)).toBe('1');
  });

  it('accepts the flag among several comma-separated names and other params', () => {
    expect(
      resolveFeatureFlag(
        'archetypeCoachUi',
        sources({ search: '?tab=deck&ff=foo,archetypeCoachUi' }),
      ),
    ).toBe(true);
  });

  it('?ff=-archetypeCoachUi disables it, removes the storage key and beats env=true', () => {
    const storage = memStorage({ [KEY]: '1' });
    expect(
      resolveFeatureFlag(
        'archetypeCoachUi',
        sources({ env: 'true', search: '?ff=-archetypeCoachUi', storage }),
      ),
    ).toBe(false);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('ignores unknown flag names in ?ff=', () => {
    const storage = memStorage();
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ search: '?ff=foo', storage }))).toBe(
      false,
    );
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('falls back to env when storage throws (private mode)', () => {
    const throwing: NonNullable<FlagSources['storage']> = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(
      resolveFeatureFlag('archetypeCoachUi', sources({ env: 'true', storage: throwing })),
    ).toBe(true);
    expect(
      resolveFeatureFlag(
        'archetypeCoachUi',
        sources({ search: '?ff=archetypeCoachUi', storage: throwing }),
      ),
    ).toBe(true);
  });

  it('works without any storage', () => {
    expect(resolveFeatureFlag('archetypeCoachUi', sources({ storage: null, env: 'true' }))).toBe(
      true,
    );
  });
});
