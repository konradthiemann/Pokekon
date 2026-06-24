/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Nunito Variable (self-hosted) → rounded, friendly, highly legible.
        // ui-rounded / SF Pro Rounded keep the character before the font loads.
        sans: [
          'Nunito Variable',
          'ui-rounded',
          'SF Pro Rounded',
          '-apple-system',
          'system-ui',
          'Segoe UI',
          'sans-serif',
        ],
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
        // Pokémon electric-yellow — accent / highlight only, never text on white.
        energy: {
          400: '#ffd84d',
          500: '#ffcb05',
          600: '#eab308',
          700: '#a16207',
        },
      },
      boxShadow: {
        // Soft, slightly blue-tinted lift — "card floating on the playmat".
        card: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px -14px rgba(37,99,235,0.25)',
        pop: '0 10px 30px -10px rgba(37,99,235,0.45)',
      },
    },
  },
  plugins: [],
};
