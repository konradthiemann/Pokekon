import { defineConfig } from 'vitest/config';

// Only run the TypeScript sources — the compiled mirror under dist/ (emitted by
// `tsc -b`) must not be picked up as a second, broken test suite.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
