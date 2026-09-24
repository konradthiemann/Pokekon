/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Neutral, crisp system sans — the rounded Nunito read too "playful" for
        // an analytics/finance-style dashboard. System fonts (SF Pro on macOS,
        // Segoe UI on Windows) are sharp and legible with no web-font dependency.
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Tabular monospace for dense figures (records, matrix cells).
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Primary accent — Pokémon blue, deepened so white text clears AA (5.2:1).
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Pokémon red — BRAND colour only (Spec 7 §9a): header band, onboarding
        // strip, destructive OUTLINE. Never a filled button (red reads as
        // "warning/delete"). 600 on white / white on 600 = 5.0:1 (AA).
        poke: {
          50: '#fdecec',
          100: '#f9d4d4',
          600: '#d62828',
          700: '#b01f1f',
        },
        // Pokémon electric-yellow — accent / highlight only, never text on white.
        energy: {
          400: '#ffd84d',
          500: '#ffcb05',
          600: '#eab308',
          700: '#a16207',
        },
      },
      boxShadow: {
        // Flat, neutral lift — a crisp data panel rather than a glossy floating
        // card. Smaller spread + slate (not blue) tint reads more analytical.
        card: '0 1px 2px rgba(15,23,42,0.06), 0 4px 12px -6px rgba(15,23,42,0.10)',
        pop: '0 8px 22px -10px rgba(37,99,235,0.40)',
      },
    },
  },
  plugins: [],
};
