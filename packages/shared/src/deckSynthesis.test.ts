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
import type { FactDirection, SynthesisFact } from './deckSynthesis.js';
import {
  NEUTRAL_EPSILON,
  MAX_SYNTHESIS_CLAIMS,
  CLAIM_REJECTION_REASONS,
  deriveFactDirection,
  sanitizeFactLabel,
  factIdForCard,
  validateSynthesis,
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

// ---------------------------------------------------------------------------
// validateSynthesis (plan §3.3, Slice B)
// ---------------------------------------------------------------------------
//
// `validateSynthesis` and `CLAIM_REJECTION_REASONS` do not exist on the
// module yet -- Slice A only added deriveFactDirection/sanitizeFactLabel/
// factIdForCard plus the shared types/constants. The import above pulls
// both in as real (non type-only) bindings, so evaluating this file fails
// at module-load time with a named-export resolution error ("does not
// provide an export named 'validateSynthesis'") -- red for the right
// reason. @implementer adds both to deckSynthesis.ts next.

/** The four fixture facts from plan §3.3's binding test table, exact. */
function buildFixtureFacts(): SynthesisFact[] {
  return [
    {
      id: 'field.winRate',
      kind: 'fieldScore',
      label: 'Mein Deck',
      value: 55.2,
      unit: 'pct',
      neutralValue: 50,
      lowPct: 51.1,
      highPct: 59.3,
      direction: 'positive',
      significant: true,
      usableForRecommendation: true,
      entityNames: [],
    },
    {
      id: 'matchup.dragapult-ex',
      kind: 'matchup',
      label: 'Dragapult ex',
      value: 41.0,
      unit: 'pct',
      neutralValue: 50,
      lowPct: 33.0,
      highPct: 49.4,
      direction: 'negative',
      significant: true,
      usableForRecommendation: true,
      entityNames: [],
    },
    {
      id: 'matchup.gholdengo',
      kind: 'matchup',
      label: 'Gholdengo',
      value: 62.0,
      unit: 'pct',
      neutralValue: 50,
      lowPct: 44.0,
      highPct: 78.0,
      direction: 'neutral',
      significant: false,
      usableForRecommendation: false,
      entityNames: [],
    },
    {
      id: 'meta.share.self',
      kind: 'metaShare',
      label: 'Eigener Meta-Anteil',
      value: 8.4,
      unit: 'pct',
      neutralValue: 0,
      lowPct: null,
      highPct: null,
      direction: 'positive',
      significant: false,
      usableForRecommendation: false,
      entityNames: [],
    },
  ];
}

interface TestClaim {
  factId: string;
  kind: 'observation' | 'recommendation';
  direction: FactDirection;
  text: string;
}

/** Convenience builder: 'observation'/'positive' unless overridden. */
function makeClaim(overrides: Partial<TestClaim> & Pick<TestClaim, 'factId' | 'text'>): TestClaim {
  return {
    kind: 'observation',
    direction: 'positive',
    ...overrides,
  };
}

describe('validateSynthesis — binding claim table (plan §3.3, exact)', () => {
  it('#1 accepted: matching direction, only the {value} placeholder', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: 'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.factId).toBe('field.winRate');
  });

  it('#2 directionMismatch: claim.direction does not match fact.direction', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'negative',
        text: 'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('directionMismatch');
  });

  it('#3 unknownFact: factId not present in facts (case-sensitive)', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winrate', // lowercase 'r' -- not an exact match
        direction: 'positive',
        text: 'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unknownFact');
  });

  it('#4 insufficientEvidence: recommendation on a non-usable fact', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.gholdengo',
        kind: 'recommendation',
        direction: 'neutral',
        text: 'Behalte {label} im Blick.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('insufficientEvidence');
  });

  it('#5 accepted: observation on the same non-usable fact -- context is fine, recommendation is not', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.gholdengo',
        kind: 'observation',
        direction: 'neutral',
        text: 'Gegen {label} ist die Lage ausgeglichen.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it('#6 directionMismatch wins over insufficientEvidence -- the core of the third spec decision', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.gholdengo',
        kind: 'observation',
        direction: 'positive', // fact.direction is 'neutral' -- mismatch
        text: 'Gegen {label} stehen wir gut da.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('directionMismatch');
  });

  it('#7 foreignNumber: a digit not present in any referenced label', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: 'Dein Field-Score von 71 % ist stark.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('foreignNumber');
  });

  it('#8 accepted: {label} and {value} placeholders on a matching-direction fact', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.dragapult-ex',
        direction: 'negative',
        text: '{label} liegt bei {value} %.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it('#9 missingBandPlaceholder: {low}/{high} used on a bandless fact', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'meta.share.self',
        direction: 'positive',
        text: '{value} % ({low}–{high} %)',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('missingBandPlaceholder');
  });

  it('#10 duplicate: second claim on the same factId is rejected, the first stays accepted', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: 'Dein Deck steht mit {value} % solide da.',
      }),
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: 'Noch eine Aussage über {value} %.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.text).toBe('Dein Deck steht mit {value} % solide da.');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('duplicate');
  });

  it.each([
    ['null', null],
    ["'nope'", 'nope'],
    ['{}', {}],
    ['[undefined]', [undefined]],
  ])(
    '#11 malformed input %s never throws and yields no accepted claims',
    (_label, malformedClaims) => {
      const facts = buildFixtureFacts();
      expect(() => validateSynthesis(malformedClaims, facts)).not.toThrow();
      const result = validateSynthesis(malformedClaims, facts);
      expect(result.accepted).toEqual([]);
      expect(Array.isArray(result.rejected)).toBe(true);
      for (const rejected of result.rejected) {
        expect(rejected.reason).toBe('malformed');
      }
    },
  );

  it('#12 unknownPlaceholder: {summary} is not one of the four allowed placeholders', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: '{summary}',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unknownPlaceholder');
  });

  it('#13 foreignNumber: digits with no referenced label/entityName at all', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.dragapult-ex',
        direction: 'negative',
        text: 'Karte 4 von 60',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('foreignNumber');
  });

  it('#14 accepted: a digit that only occurs inside fact.entityNames is allowed', () => {
    const facts: SynthesisFact[] = [
      ...buildFixtureFacts(),
      {
        id: 'card.dragapult-ex-2',
        kind: 'cardDelta',
        label: 'Dragapult ex',
        value: 41.0,
        unit: 'pct',
        neutralValue: 50,
        lowPct: 33.0,
        highPct: 49.4,
        direction: 'negative',
        significant: true,
        usableForRecommendation: true,
        entityNames: ['Dragapult ex 2'],
      },
    ];
    const claims = [
      makeClaim({
        factId: 'card.dragapult-ex-2',
        direction: 'negative',
        text: 'Dragapult ex 2 hilft hier.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toHaveLength(1);
  });

  it('#15 truncates at MAX_SYNTHESIS_CLAIMS -- excess valid claims are dropped, not rejected', () => {
    const syntheticFacts: SynthesisFact[] = Array.from({ length: 20 }, (_, i) => ({
      id: `synthetic.fact.${i}`,
      kind: 'matchup' as const,
      label: `Synthetic Fact ${i}`,
      value: 60,
      unit: 'pct' as const,
      neutralValue: 50,
      lowPct: 55,
      highPct: 65,
      direction: 'positive' as const,
      significant: true,
      usableForRecommendation: true,
      entityNames: [],
    }));
    const claims = syntheticFacts.map((fact) =>
      makeClaim({
        factId: fact.id,
        direction: 'positive',
        text: 'Dies ist ein belegter Kontext-Satz ohne Zahlen.',
      }),
    );
    const result = validateSynthesis(claims, syntheticFacts);
    expect(result.accepted).toHaveLength(MAX_SYNTHESIS_CLAIMS);
    expect(result.rejected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateSynthesis -- binding check order (plan §3.3): the order of
// CLAIM_REJECTION_REASONS IS the check order; the first violation wins. Each
// case below deliberately constructs a claim that violates TWO reasons at
// once, and asserts the earlier one in the list wins -- not just that each
// reason can individually fire in isolation.
// ---------------------------------------------------------------------------

describe('validateSynthesis — binding check order (plan §3.3)', () => {
  it('CLAIM_REJECTION_REASONS lists the nine reasons in the binding check order', () => {
    expect(CLAIM_REJECTION_REASONS).toEqual([
      'malformed',
      'emptyText',
      'unknownFact',
      'duplicate',
      'unknownPlaceholder',
      'missingBandPlaceholder',
      'directionMismatch',
      'insufficientEvidence',
      'foreignNumber',
    ]);
  });

  it('malformed wins over emptyText: an unknown kind value is malformed even with empty text', () => {
    const facts = buildFixtureFacts();
    const claims: unknown[] = [
      { factId: 'field.winRate', kind: 'bogus', direction: 'positive', text: '' },
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('malformed');
  });

  it('emptyText wins over unknownFact: blank text is rejected before the factId is even looked up', () => {
    const facts = buildFixtureFacts();
    const claims = [makeClaim({ factId: 'no.such.fact', direction: 'positive', text: '   ' })];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('emptyText');
  });

  it('unknownFact wins over duplicate: two claims on the same unknown factId are both unknownFact, not duplicate', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({ factId: 'ghost.fact', direction: 'positive', text: 'Erste Aussage.' }),
      makeClaim({ factId: 'ghost.fact', direction: 'positive', text: 'Zweite Aussage.' }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected.map((r) => r.reason)).toEqual(['unknownFact', 'unknownFact']);
  });

  it('duplicate wins over unknownPlaceholder: a repeated factId is duplicate even with a bad placeholder', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'field.winRate',
        direction: 'positive',
        text: 'Erste, gültige Aussage.',
      }),
      makeClaim({ factId: 'field.winRate', direction: 'positive', text: '{summary}' }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('duplicate');
  });

  it('unknownPlaceholder wins over missingBandPlaceholder: an unknown placeholder is reported even alongside a band placeholder on a bandless fact', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({ factId: 'meta.share.self', direction: 'positive', text: '{summary}{low}' }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('unknownPlaceholder');
  });

  it('missingBandPlaceholder wins over directionMismatch: a band placeholder on a bandless fact is reported even when direction also mismatches', () => {
    const facts = buildFixtureFacts();
    const claims = [makeClaim({ factId: 'meta.share.self', direction: 'negative', text: '{low}' })];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('missingBandPlaceholder');
  });

  it('directionMismatch wins over insufficientEvidence: a wrong-direction recommendation on a non-usable fact is reported as directionMismatch', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.gholdengo',
        kind: 'recommendation',
        direction: 'positive',
        text: 'Wechsle {label} aus.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('directionMismatch');
  });

  it('insufficientEvidence wins over foreignNumber: a recommendation on a non-usable fact is reported before the foreign-number check runs', () => {
    const facts = buildFixtureFacts();
    const claims = [
      makeClaim({
        factId: 'matchup.gholdengo',
        kind: 'recommendation',
        direction: 'neutral',
        text: 'Nutze Karte 4 dagegen.',
      }),
    ];
    const result = validateSynthesis(claims, facts);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe('insufficientEvidence');
  });
});
