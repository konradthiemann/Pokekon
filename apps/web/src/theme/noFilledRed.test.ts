/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 7 §9a / AC 10: red is brand colour only (header band, onboarding strip),
// never a filled button. Destructive actions use the outline `.btn-destructive`.
// Machine check for the parts this can see; the rest is manual acceptance.
const sources = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Files allowed to paint a filled brand-red surface (not buttons). */
const BRAND_RED_ALLOWLIST = [
  '../components/coach/CoachHeader.tsx',
  '../components/coach/onboarding/OnboardingFlow.tsx',
];

const isTest = (path: string) => /\.test\.tsx$/.test(path);

describe('no filled red buttons (Spec 7 AC 10)', () => {
  it('finds the source files at all (guards against a silently empty glob)', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('uses filled bg-poke-* only in the brand-surface allowlist', () => {
    const offenders = Object.entries(sources)
      .filter(([path, src]) => !isTest(path) && /\bbg-poke-(?:[5-9]00)\b/.test(src))
      .map(([path]) => path)
      .filter((path) => !BRAND_RED_ALLOWLIST.includes(path));
    expect(offenders).toEqual([]);
  });

  it('has no filled red background in the coach UI', () => {
    const offenders = Object.entries(sources)
      .filter(
        ([path]) =>
          !isTest(path) &&
          (path.startsWith('../components/coach/') || path.startsWith('../pages/coach/')) &&
          !BRAND_RED_ALLOWLIST.includes(path),
      )
      .filter(([, src]) => /\bbg-(?:red|rose|poke)-(?:[5-9]00)\b/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('keeps btn-destructive an outline style (no filled red)', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8'); // vitest runs in apps/web;
    const rule = /\.btn-destructive\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('border-poke-600');
    expect(rule).toContain('text-poke-600');
    expect(rule).not.toMatch(/\bbg-(?:red|poke)-(?:[5-9]00)\b/);
  });
});
