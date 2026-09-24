import { describe, expect, it } from 'vitest';
import { resources } from './index';

// Guard for Spec 7 AC 8 (every new text in DE and EN): both languages must
// have exactly the same keys in every namespace.
function keys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('DE/EN locale parity', () => {
  it('has the same namespaces', () => {
    expect(Object.keys(resources.de).sort()).toEqual(Object.keys(resources.en).sort());
  });

  it.each(Object.keys(resources.de))('namespace %s has identical keys in DE and EN', (ns) => {
    const de = keys(resources.de[ns as keyof typeof resources.de]).sort();
    const en = keys(resources.en[ns as keyof typeof resources.en]).sort();
    expect(de).toEqual(en);
  });
});
