import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { COACH_NAV_ITEMS, COACH_TOOLS_ITEM } from './coachNav';

describe('coach navigation items (Spec 7 §4)', () => {
  it('has Start · Deck · Coaching · Opponents in this order, Tools separately', () => {
    expect(COACH_NAV_ITEMS.map((i) => i.id)).toEqual(['start', 'deck', 'coaching', 'opponents']);
    expect(COACH_TOOLS_ITEM.id).toBe('tools');
  });

  // Plan S14: DE labels ≤ 8 characters at 11 px. EN "Opponents" has 9, which
  // still fits a fifth of a 375 px screen (75 px), so EN allows 9.
  it.each([
    ['de', 8],
    ['en', 9],
  ] as const)('keeps every %s bottom-nav label within %i characters', (lng, max) => {
    for (const item of COACH_NAV_ITEMS) {
      const label = i18n.t(item.labelKey, { ns: 'layout', lng });
      expect(label.length, `${lng}: ${label}`).toBeLessThanOrEqual(max);
    }
  });
});
