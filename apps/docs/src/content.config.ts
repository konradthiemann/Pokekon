import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Content lives in src/content/docs, which is generated from the repo-level
// docs/ directory by scripts/sync-docs.mjs (see predev/prebuild hooks).
// docs/ stays the single source of truth — this directory is gitignored.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
