// Client-side feature flags (Spec 7 §9: Scheibe 1–2 of the archetype-first UI
// live behind `archetypeCoachUi`). Web and API ship as ONE Railway service, so
// a build-time flag alone would switch every user at once — hence a runtime
// override per browser: `?ff=archetypeCoachUi` turns it on (and remembers it),
// `?ff=-archetypeCoachUi` turns it off again. Pure UI switch, not a security
// boundary: the API stays the authority for every piece of data.

export type FeatureFlag = 'archetypeCoachUi';

const KNOWN_FLAGS: readonly FeatureFlag[] = ['archetypeCoachUi'];

export interface FlagSources {
  /** Build-time default, e.g. import.meta.env.VITE_FF_ARCHETYPE_COACH_UI. */
  env: string | undefined;
  /** window.location.search */
  search: string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function storageKey(flag: FeatureFlag): string {
  return `pokekon-ff-${flag}`;
}

/** 'on' / 'off' when `?ff=` mentions the flag, otherwise null. */
function queryOverride(flag: FeatureFlag, search: string): 'on' | 'off' | null {
  const names = (new URLSearchParams(search).get('ff') ?? '').split(',').map((n) => n.trim());
  if (names.includes(`-${flag}`)) return 'off';
  if (names.includes(flag)) return 'on';
  return null;
}

function safeStorage<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null; // private mode / blocked storage — flags must never break the app
  }
}

/** Precedence: ?ff= query > localStorage > build env > false. */
export function resolveFeatureFlag(flag: FeatureFlag, sources: FlagSources): boolean {
  if (!KNOWN_FLAGS.includes(flag)) return false;
  const { storage } = sources;
  const key = storageKey(flag);

  const override = queryOverride(flag, sources.search);
  if (override === 'on') {
    safeStorage(() => storage?.setItem(key, '1'));
    return true;
  }
  if (override === 'off') {
    safeStorage(() => storage?.removeItem(key));
    return false;
  }

  if (safeStorage(() => storage?.getItem(key)) === '1') return true;
  return sources.env === 'true';
}

let archetypeCoachUi: boolean | undefined;

/** Evaluated once per page load (flags never change mid-session). */
export function isArchetypeCoachUiEnabled(): boolean {
  if (archetypeCoachUi === undefined) {
    archetypeCoachUi = resolveFeatureFlag('archetypeCoachUi', {
      env: import.meta.env.VITE_FF_ARCHETYPE_COACH_UI,
      search: typeof window === 'undefined' ? '' : window.location.search,
      storage: typeof window === 'undefined' ? null : safeStorage(() => window.localStorage),
    });
  }
  return archetypeCoachUi;
}
