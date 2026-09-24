// Type of tailwind.config.js for TypeScript consumers (theme/palette.test.ts
// asserts contrast ratios against the real palette).
import type { Config } from 'tailwindcss';

declare const config: Config & {
  theme: { extend: { colors: Record<string, Record<string, string>> } };
};
export default config;
