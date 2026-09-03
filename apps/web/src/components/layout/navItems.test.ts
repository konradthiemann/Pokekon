import { describe, it, expect } from 'vitest';
import { NAV_ITEMS } from './navItems';

describe('NAV_ITEMS (plan ui-ux-hub-rework.md §3.2, Slice D)', () => {
  it('has exactly three entries, with ids overview, meta, deck, in that order', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual(['overview', 'meta', 'deck']);
  });

  it('gives every entry a non-empty labelKey and an Icon component', () => {
    expect(NAV_ITEMS).toHaveLength(3);
    for (const item of NAV_ITEMS) {
      expect(typeof item.labelKey).toBe('string');
      expect(item.labelKey.length).toBeGreaterThan(0);
      expect(item.Icon).toBeDefined();
    }
  });
});
