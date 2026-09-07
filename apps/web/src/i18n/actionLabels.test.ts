import { describe, it, expect } from 'vitest';
import { resources } from './index';

/**
 * Plan .claude/plans/ui-ux-button-consolidation.md §3.1 / §3.11-A — the
 * scope-prefixed action-label contract. Purely data-driven against `resources`
 * (i18n/index.ts:27), no rendering: an i18n-key based UI test elsewhere would
 * stay "accidentally green" on a pure value rename (§0.6, BottomNav.test.tsx
 * precedent), so this is the dedicated test the spec's acceptance criteria
 * demand (specs/ui-ux-button-consolidation.md:107-109).
 */

type Lang = 'de' | 'en';
type Namespace = keyof (typeof resources)['de'];

const LANGS: readonly Lang[] = ['de', 'en'];

/** Resolves a dotted key path (e.g. "sidebar.syncLiveMeta") against a
 *  namespace's JSON object. Returns `undefined` for a missing key instead of
 *  throwing, so a typo in the path surfaces as a clear assertion failure
 *  rather than a crash. */
function resolvePath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc !== null && typeof acc === 'object' && segment in acc) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

function label(lang: Lang, ns: Namespace, path: string): unknown {
  return resolvePath(resources[lang][ns], path);
}

// ─── A1 — exact soll-values from the §3.1 table ──────────────────────────────

interface LabelCase {
  ns: Namespace;
  path: string;
  de: string;
  en: string;
}

const LABEL_CONTRACT: readonly LabelCase[] = [
  { ns: 'layout', path: 'nav.comparison', de: 'Zum Vergleich', en: 'To comparison' },
  {
    ns: 'layout',
    path: 'sidebar.refreshData',
    de: 'Alle Daten neu laden',
    en: 'Reload all data',
  },
  {
    ns: 'meta',
    path: 'matchupMatrix.reload',
    de: 'Matchup-Daten neu laden',
    en: 'Reload matchup data',
  },
  {
    ns: 'meta',
    path: 'tournaments.load',
    de: 'Turnierliste laden',
    en: 'Load tournament list',
  },
  {
    ns: 'recommendations',
    path: 'comparison.refresh',
    de: 'Listen-Vergleich aktualisieren',
    en: 'Refresh list comparison',
  },
];

describe('A1 — scope-prefixed labels match the exact §3.1 soll-values', () => {
  for (const { ns, path, de, en } of LABEL_CONTRACT) {
    it(`${ns}:${path}`, () => {
      expect(label('de', ns, path)).toBe(de);
      expect(label('en', ns, path)).toBe(en);
    });
  }
});

// ─── A2 — the five reload-style labels are pairwise distinct per language ────

const RELOAD_GROUP: ReadonlyArray<{ ns: Namespace; path: string }> = [
  { ns: 'layout', path: 'sidebar.syncLiveMeta' },
  { ns: 'layout', path: 'sidebar.refreshData' },
  { ns: 'meta', path: 'matchupMatrix.reload' },
  { ns: 'meta', path: 'tournaments.load' },
  { ns: 'recommendations', path: 'comparison.refresh' },
];

describe('A2 — the five "reload"-style action labels are pairwise distinct per language', () => {
  for (const lang of LANGS) {
    it(`${lang}: 5 distinct values`, () => {
      const values = RELOAD_GROUP.map(({ ns, path }) => label(lang, ns, path));
      expect(new Set(values).size).toBe(5);
    });
  }
});

// ─── A3 — nav.comparison stays distinct from comparison.compare ─────────────

describe('A3 — layout:nav.comparison !== recommendations:comparison.compare per language', () => {
  for (const lang of LANGS) {
    it(`${lang}`, () => {
      const navComparison = label(lang, 'layout', 'nav.comparison');
      const compare = label(lang, 'recommendations', 'comparison.compare');
      expect(navComparison).not.toBe(compare);
    });
  }
});

// ─── A4 — tournaments.emptyHint quotes the current tournaments.load label ───

describe('A4 — meta:tournaments.emptyHint quotes meta:tournaments.load (zitat-konsistenz, §3.1)', () => {
  for (const lang of LANGS) {
    it(`${lang}`, () => {
      const load = label(lang, 'meta', 'tournaments.load');
      const emptyHint = label(lang, 'meta', 'tournaments.emptyHint');
      expect(typeof load).toBe('string');
      expect(typeof emptyHint).toBe('string');
      expect(emptyHint as string).toContain(load as string);
    });
  }
});

// ─── A5 — de and en share the same key tree in every namespace ──────────────

/** Reduces a (possibly nested) JSON object to just its key structure (sorted,
 *  values replaced with `null`) so two locales can be compared for parity
 *  without caring about the actual translated text. */
function keyTree(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const sortedTree: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sortedTree[key] = keyTree((value as Record<string, unknown>)[key]);
  }
  return sortedTree;
}

describe('A5 — de and en have the same key tree in all 9 namespaces (catches missed second-language updates)', () => {
  const namespaces = Object.keys(resources.de) as Namespace[];
  expect(namespaces).toHaveLength(9);

  for (const ns of namespaces) {
    it(`${ns}`, () => {
      expect(keyTree(resources.de[ns])).toEqual(keyTree(resources.en[ns]));
    });
  }
});
