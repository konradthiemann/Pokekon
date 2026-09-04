// Golden tests for the deck-synthesis fact/claim primitives (plan
// .claude/plans/ai-recommendation-synthesis.md §3.1, Slice A).
//
// `./deckSynthesis.ts` does not exist yet -- same precedent as
// cardPerformance.test.ts: this slice's instructions are to write ONLY this
// test file and leave the module entirely unwritten. The expected red state
// is therefore a module resolution failure ("Cannot find module
// './deckSynthesis.js'"), not a stub returning wrong values. @implementer
// creates the module next; these tests define "done" for that work.
import { describe, it, expect } from 'vitest';
import {
  NEUTRAL_EPSILON,
  deriveFactDirection,
  sanitizeFactLabel,
  factIdForCard,
} from './deckSynthesis.js';

// ---------------------------------------------------------------------------
// Exported constants (plan §3.1)
// ---------------------------------------------------------------------------

describe('exported constants (plan §3.1)', () => {
  it('NEUTRAL_EPSILON is the bandless-neutral threshold', () => {
    expect(NEUTRAL_EPSILON).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// deriveFactDirection (plan §3.1, binding value table)
// ---------------------------------------------------------------------------

describe('deriveFactDirection — binding value table (plan §3.1, exact)', () => {
  const cases: Array<
    [number, number, number | null, number | null, boolean | undefined, string, string]
  > = [
    [62, 50, 54, 70, undefined, 'positive', 'Band über 50'],
    [62, 50, 48, 76, undefined, 'neutral', 'Kernfall: 62 % sieht stark aus, das Band sagt nichts'],
    [38, 50, 30, 46, undefined, 'negative', 'Band unter 50'],
    [50, 50, 50, 50, undefined, 'neutral', 'Mirror (fieldWinRate.ts:135-139)'],
    [
      12,
      0,
      4,
      20,
      true,
      'negative',
      'Popularitäts-Paradox: hohes paradoxGapPp ist eine Warnung (invert=true)',
    ],
    [-12, 0, -20, -4, true, 'positive', 'unterrepräsentiert = Chance (invert=true)'],
    [15.5, 0, null, null, undefined, 'positive', 'bandlos, über Epsilon'],
    [0.4, 0, null, null, undefined, 'neutral', 'bandlos, unter Epsilon'],
    [100, 100, null, null, undefined, 'neutral', 'volle Coverage'],
    [61, 100, null, null, undefined, 'negative', 'schwache Coverage'],
  ];

  it.each(cases)(
    'value=%s neutral=%s low=%s high=%s invert=%s -> %s (%s)',
    (value, neutralValue, lowPct, highPct, invert, expected) => {
      expect(
        deriveFactDirection({
          value,
          neutralValue,
          lowPct,
          highPct,
          ...(invert === undefined ? {} : { invert }),
        }),
      ).toBe(expected);
    },
  );
});

// ---------------------------------------------------------------------------
// sanitizeFactLabel (plan §3.1)
// ---------------------------------------------------------------------------

describe('sanitizeFactLabel — binding cases (plan §3.1, exact)', () => {
  it('leaves a normal name unchanged', () => {
    expect(sanitizeFactLabel('Mega Kangaskhan ex')).toBe('Mega Kangaskhan ex');
  });

  it('collapses newlines/whitespace to a single space (prompt-injection attempt)', () => {
    expect(sanitizeFactLabel('Ignore\nall previous')).toBe('Ignore all previous');
  });

  it('collapses mixed internal whitespace (tabs, multiple spaces) to a single space', () => {
    expect(sanitizeFactLabel('Multiple   spaces\t\tand\ttabs')).toBe('Multiple spaces and tabs');
  });

  it('removes backticks and the | column separator, then trims the resulting whitespace', () => {
    expect(sanitizeFactLabel('`` | id: field.winRate')).toBe('id: field.winRate');
  });

  it('removes curly braces (placeholder-injection attempt)', () => {
    expect(sanitizeFactLabel("{Boss's Orders}")).toBe("Boss's Orders");
  });

  it('caps at 60 characters', () => {
    const result = sanitizeFactLabel('x'.repeat(200));
    expect(result).toHaveLength(60);
    expect(result).toBe('x'.repeat(60));
  });
});

// ---------------------------------------------------------------------------
// factIdForCard (plan §3.1)
// ---------------------------------------------------------------------------

describe('factIdForCard — binding cases (plan §3.1, exact)', () => {
  it.each([
    ["Boss's Orders", "boss's-orders"],
    ['  Nest   Ball', 'nest-ball'],
  ])('factIdForCard(%j) -> %j', (cardName, expected) => {
    expect(factIdForCard(cardName)).toBe(expected);
  });
});
