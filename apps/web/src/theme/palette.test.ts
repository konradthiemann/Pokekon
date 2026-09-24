import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors';
import config from '../../tailwind.config.js';

// WCAG 2.x relative luminance / contrast ratio (Spec 7 §9a: every text colour
// on white must clear AA 4.5:1; yellow is accent-only, never text).
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
function contrastOnWhite(hex: string): number {
  return (1 + 0.05) / (luminance(hex) + 0.05);
}

const palette = config.theme.extend.colors as Record<string, Record<string, string>>;

describe('coach palette contrast (Spec 7 §9a, AC 10)', () => {
  it('defines the brand red "poke" palette', () => {
    expect(palette.poke?.['600']).toBe('#d62828');
  });

  it.each([
    ['poke-600 (brand red, white text on it)', () => palette.poke!['600']!],
    ['poke-700', () => palette.poke!['700']!],
    ['brand-600 (action blue)', () => palette.brand!['600']!],
    ['brand-700 (positive win rate)', () => palette.brand!['700']!],
    ['orange-700 (negative win rate)', () => colors.orange['700']],
    ['slate-700 (neutral band)', () => colors.slate['700']],
  ])('%s clears AA 4.5:1 against white', (_name, hex) => {
    expect(contrastOnWhite(hex())).toBeGreaterThanOrEqual(4.5);
  });

  it('energy-500 (yellow) is below 3:1 on white — accent only, never text', () => {
    expect(contrastOnWhite(palette.energy!['500']!)).toBeLessThan(3);
  });
});
