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
import type {
  FactDirection,
  SynthesisFact,
  SynthesisClaim,
  RejectedClaim,
  ValidatedSynthesis,
  SynthesisContext,
} from './deckSynthesis.js';
import {
  NEUTRAL_EPSILON,
  MAX_SYNTHESIS_CLAIMS,
  CLAIM_REJECTION_REASONS,
  SYNTHESIS_SECTIONS,
  deriveFactDirection,
  sanitizeFactLabel,
  factIdForCard,
  validateSynthesis,
  sectionForClaim,
  renderClaimText,
  assembleSynthesis,
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

// ---------------------------------------------------------------------------
// sectionForClaim / renderClaimText / assembleSynthesis (plan §3.4, Slice C)
// ---------------------------------------------------------------------------
//
// None of `sectionForClaim`, `renderClaimText`, `assembleSynthesis` or
// `SYNTHESIS_SECTIONS` exist on the module yet -- Slices A/B only added the
// fact/claim primitives and `validateSynthesis`. Under Vitest's esbuild-based
// transform, importing a non-existent named export does not fail at
// module-load time (unlike strict Node ESM) -- the binding resolves to
// `undefined`, so each test fails at the call site with "TypeError:
// sectionForClaim/renderClaimText/assembleSynthesis is not a function" --
// red for the right reason. `npx tsc --noEmit` additionally reports
// TS2305 "has no exported member" for all four names, confirming the same
// gap at the type level. @implementer adds them to deckSynthesis.ts next.

/** Minimal-but-complete SynthesisFact fixture builder for this slice's
 *  tests -- only `id`/`kind`/`direction` matter per case, everything else is
 *  a neutral default that gets overridden where the test cares. */
function buildFact(
  overrides: Partial<SynthesisFact> & Pick<SynthesisFact, 'id' | 'kind' | 'direction'>,
): SynthesisFact {
  return {
    label: 'Fixture',
    value: 60,
    unit: 'pct',
    neutralValue: 50,
    lowPct: null,
    highPct: null,
    significant: false,
    usableForRecommendation: true,
    entityNames: [],
    ...overrides,
  };
}

/** SynthesisClaim fixture builder: 'observation'/'positive'/generic text
 *  unless overridden -- mirrors the `makeClaim` helper above but typed
 *  against the real exported `SynthesisClaim`. */
function buildClaim(
  overrides: Partial<SynthesisClaim> & Pick<SynthesisClaim, 'factId'>,
): SynthesisClaim {
  return {
    kind: 'observation',
    direction: 'positive',
    text: 'Fixture text.',
    ...overrides,
  };
}

describe('sectionForClaim — rule table (plan §3.4, exact, first match wins)', () => {
  it('(a) kind "recommendation" -> listLevers, regardless of fact.kind or direction', () => {
    const fact = buildFact({ id: 'matchup.x', kind: 'matchup', direction: 'positive' });
    const claim = buildClaim({ factId: fact.id, kind: 'recommendation', direction: 'positive' });
    expect(sectionForClaim(claim, fact)).toBe('listLevers');
  });

  it('(a) beats (b): a recommendation on a fieldScore fact still lands in listLevers, not headline', () => {
    const fact = buildFact({ id: 'field.winRate', kind: 'fieldScore', direction: 'positive' });
    const claim = buildClaim({ factId: fact.id, kind: 'recommendation', direction: 'positive' });
    expect(sectionForClaim(claim, fact)).toBe('listLevers');
  });

  it('(b) observation on a fieldScore fact -> headline', () => {
    const fact = buildFact({ id: 'field.winRate', kind: 'fieldScore', direction: 'positive' });
    const claim = buildClaim({ factId: fact.id, kind: 'observation', direction: 'positive' });
    expect(sectionForClaim(claim, fact)).toBe('headline');
  });

  it('(c) observation, fact.direction "positive", non-fieldScore -> strengths', () => {
    const fact = buildFact({ id: 'matchup.a', kind: 'matchup', direction: 'positive' });
    const claim = buildClaim({ factId: fact.id, kind: 'observation', direction: 'positive' });
    expect(sectionForClaim(claim, fact)).toBe('strengths');
  });

  it('(d) observation, fact.direction "negative" -> risks', () => {
    const fact = buildFact({ id: 'matchup.b', kind: 'matchup', direction: 'negative' });
    const claim = buildClaim({ factId: fact.id, kind: 'observation', direction: 'negative' });
    expect(sectionForClaim(claim, fact)).toBe('risks');
  });

  it('(e) observation, fact.direction "neutral", non-fieldScore -> context', () => {
    const fact = buildFact({ id: 'meta.share.self', kind: 'metaShare', direction: 'neutral' });
    const claim = buildClaim({ factId: fact.id, kind: 'observation', direction: 'neutral' });
    expect(sectionForClaim(claim, fact)).toBe('context');
  });
});

describe('renderClaimText — placeholder substitution (plan §3.4)', () => {
  it('substitutes all four placeholders in one sentence: bare numbers, one decimal, dot separator (formatWithInterval-consistent)', () => {
    const fact = buildFact({
      id: 'field.winRate',
      kind: 'fieldScore',
      direction: 'positive',
      label: 'Mein Deck',
      value: 55.24,
      neutralValue: 50,
      lowPct: 51.14,
      highPct: 59.26,
    });
    const claim = buildClaim({
      factId: fact.id,
      text: '{label}: {value} % ({low}–{high} %)',
    });
    expect(renderClaimText(claim, fact)).toBe('Mein Deck: 55.2 % (51.1–59.3 %)');
  });

  it('keeps a trailing ".0" -- one decimal is always shown, never a bare integer', () => {
    const fact = buildFact({
      id: 'matchup.dragapult-ex',
      kind: 'matchup',
      direction: 'negative',
      label: 'Dragapult ex',
      value: 41.0,
      lowPct: 33.0,
      highPct: 49.4,
    });
    const claim = buildClaim({
      factId: fact.id,
      direction: 'negative',
      text: '{label} liegt bei {value} %.',
    });
    expect(renderClaimText(claim, fact)).toBe('Dragapult ex liegt bei 41.0 %.');
  });

  it('uses a dot as decimal separator, never a comma -- consistent in both languages', () => {
    const fact = buildFact({
      id: 'field.winRate',
      kind: 'fieldScore',
      direction: 'positive',
      value: 62.5,
    });
    const claim = buildClaim({ factId: fact.id, text: '{value} %' });
    const result = renderClaimText(claim, fact);
    expect(result).toBe('62.5 %');
    expect(result).not.toContain(',');
  });

  it('bandless fact: a text without {low}/{high} renders normally -- the omission is not this function’s concern (that is validateSynthesis’s missingBandPlaceholder job)', () => {
    const fact = buildFact({
      id: 'meta.share.self',
      kind: 'metaShare',
      direction: 'positive',
      label: 'Eigener Meta-Anteil',
      value: 8.4,
      neutralValue: 0,
      lowPct: null,
      highPct: null,
    });
    const claim = buildClaim({
      factId: fact.id,
      text: '{label} liegt bei {value} %.',
    });
    expect(renderClaimText(claim, fact)).toBe('Eigener Meta-Anteil liegt bei 8.4 %.');
  });
});

describe('assembleSynthesis — binding properties (plan §3.4)', () => {
  const context: SynthesisContext = {
    deckId: 1,
    archetypeId: 'mega-kangaskhan-ex',
    archetypeName: 'Mega Kangaskhan ex',
    variant: 'Standard',
    windowDays: 28,
    language: 'de',
    cardStatsComputedAt: null,
    equilibriumComputedAt: null,
    matchupImportedAt: null,
  };

  const meta = {
    inputHash: 'a'.repeat(64),
    source: 'llm' as const,
    provider: 'github-models',
    model: 'openai/gpt-4.1',
    generatedAt: '2026-09-03T12:00:00.000Z',
  };

  /** One fact/claim per SYNTHESIS_SECTIONS entry, PLUS four 'strengths'
   *  facts/claims to pin the "max 3 sentences per section, model order"
   *  rule from the TSDoc on `DeckSynthesis.sections`. The accepted array is
   *  deliberately NOT grouped by section, to prove assembleSynthesis groups
   *  by section itself rather than relying on input order. */
  const headlineFact = buildFact({
    id: 'field.winRate',
    kind: 'fieldScore',
    direction: 'positive',
    label: 'Mein Deck',
    value: 55.2,
    lowPct: 51.1,
    highPct: 59.3,
  });
  const strengthFacts = ['A', 'B', 'C', 'D'].map((letter, i) =>
    buildFact({
      id: `matchup.${letter.toLowerCase()}`,
      kind: 'matchup',
      direction: 'positive',
      label: `Matchup ${letter}`,
      value: 60 + i,
      lowPct: 55 + i,
      highPct: 65 + i,
      significant: true,
      usableForRecommendation: true,
    }),
  );
  const riskFact = buildFact({
    id: 'matchup.risk',
    kind: 'matchup',
    direction: 'negative',
    label: 'Matchup Risk',
    value: 35,
    lowPct: 25,
    highPct: 46,
    significant: true,
    usableForRecommendation: true,
  });
  const leverFact = buildFact({
    id: 'card.ultra-ball',
    kind: 'cardDelta',
    direction: 'positive',
    label: 'Ultra Ball',
    value: 5,
    neutralValue: 0,
    lowPct: 2,
    highPct: 8,
    significant: true,
    usableForRecommendation: true,
  });
  const contextFact = buildFact({
    id: 'meta.share.self',
    kind: 'metaShare',
    direction: 'neutral',
    label: 'Eigener Meta-Anteil',
    value: 8.4,
    neutralValue: 0,
    lowPct: null,
    highPct: null,
  });
  const facts: SynthesisFact[] = [headlineFact, ...strengthFacts, riskFact, leverFact, contextFact];

  const claimHeadline = buildClaim({
    factId: headlineFact.id,
    text: '{label} steht mit {value} % solide da.',
  });
  const claimA = buildClaim({ factId: 'matchup.a', text: '{label} läuft gut.' });
  const claimRisk = buildClaim({
    factId: riskFact.id,
    direction: 'negative',
    text: 'Gegen {label} ist Vorsicht geboten.',
  });
  const claimB = buildClaim({ factId: 'matchup.b', text: '{label} läuft gut.' });
  const claimLever = buildClaim({
    factId: leverFact.id,
    kind: 'recommendation',
    text: 'Erwäge mehr Kopien von {label}.',
  });
  const claimC = buildClaim({ factId: 'matchup.c', text: '{label} läuft gut.' });
  const claimContext = buildClaim({
    factId: contextFact.id,
    direction: 'neutral',
    text: '{label} liegt bei {value} %.',
  });
  const claimD = buildClaim({ factId: 'matchup.d', text: '{label} läuft gut.' });

  // Deliberately unsorted by section, to prove assembleSynthesis groups
  // itself. Within 'strengths' the model order is A, B, C, D -- D is the
  // fourth strengths claim and must be dropped from `sections` by the cap.
  const accepted: SynthesisClaim[] = [
    claimHeadline,
    claimA,
    claimRisk,
    claimB,
    claimLever,
    claimC,
    claimContext,
    claimD,
  ];

  const rejected: RejectedClaim[] = [
    { claim: buildClaim({ factId: 'unknown.fact.1', text: 'x' }), reason: 'unknownFact' },
    { claim: buildClaim({ factId: 'unknown.fact.2', text: 'y' }), reason: 'unknownFact' },
  ];

  const validated: ValidatedSynthesis = { accepted, rejected };

  it('sections contains no block with an empty sentences array', () => {
    const result = assembleSynthesis(validated, facts, context, meta);
    for (const block of result.sections) {
      expect(block.sentences.length).toBeGreaterThan(0);
    }
  });

  it('claims.length equals validated.accepted.length; droppedCount equals validated.rejected.length', () => {
    const result = assembleSynthesis(validated, facts, context, meta);
    expect(result.claims).toHaveLength(accepted.length);
    expect(result.droppedCount).toBe(rejected.length);
  });

  it('all claims rejected -> sections/claims are [] and droppedCount > 0 -- a VALID result, not an error', () => {
    const allRejected: ValidatedSynthesis = {
      accepted: [],
      rejected: [
        { claim: buildClaim({ factId: headlineFact.id, text: 'x' }), reason: 'directionMismatch' },
      ],
    };
    expect(() => assembleSynthesis(allRejected, facts, context, meta)).not.toThrow();
    const result = assembleSynthesis(allRejected, facts, context, meta);
    expect(result.sections).toEqual([]);
    expect(result.claims).toEqual([]);
    expect(result.droppedCount).toBeGreaterThan(0);
  });

  it('no rendered sentence contains a curly brace -- placeholders are always substituted', () => {
    const result = assembleSynthesis(validated, facts, context, meta);
    for (const block of result.sections) {
      for (const sentence of block.sentences) {
        expect(sentence).not.toContain('{');
        expect(sentence).not.toContain('}');
      }
    }
  });

  it('is idempotent: calling twice with identical inputs yields a deeply equal result', () => {
    const first = assembleSynthesis(validated, facts, context, meta);
    const second = assembleSynthesis(validated, facts, context, meta);
    expect(second).toEqual(first);
  });

  it('section order follows SYNTHESIS_SECTIONS and caps at 3 sentences per section, in model order', () => {
    const result = assembleSynthesis(validated, facts, context, meta);
    expect(SYNTHESIS_SECTIONS).toEqual(['headline', 'strengths', 'risks', 'listLevers', 'context']);
    expect(result.sections.map((block) => block.section)).toEqual([
      'headline',
      'strengths',
      'risks',
      'listLevers',
      'context',
    ]);

    const strengths = result.sections.find((block) => block.section === 'strengths');
    expect(strengths?.sentences).toHaveLength(3);
    expect(strengths?.sentences[0]).toContain('Matchup A');
    expect(strengths?.sentences[1]).toContain('Matchup B');
    expect(strengths?.sentences[2]).toContain('Matchup C');
    expect(strengths?.sentences.some((sentence) => sentence.includes('Matchup D'))).toBe(false);

    expect(result.sections.find((block) => block.section === 'headline')?.sentences).toHaveLength(
      1,
    );
    expect(result.sections.find((block) => block.section === 'risks')?.sentences).toHaveLength(1);
    expect(result.sections.find((block) => block.section === 'listLevers')?.sentences).toHaveLength(
      1,
    );
    expect(result.sections.find((block) => block.section === 'context')?.sentences).toHaveLength(1);
  });
});
