// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

// GitHub Pages: repo is github.com/konradthiemann/Pokekon
// → served at https://konradthiemann.github.io/Pokekon/
// base must match the repo name exactly (case-sensitive).
export default defineConfig({
  site: 'https://konradthiemann.github.io',
  base: '/Pokekon/',
  integrations: [
    // Mermaid must be registered BEFORE Starlight so its remark/rehype
    // transform runs ahead of Starlight's code-block handling.
    // Client-side rendering → no headless browser needed in CI (stays free/static).
    mermaid({
      theme: 'default',
      autoTheme: true,
    }),
    starlight({
      title: 'Pokékon Docs',
      description: 'Technische Dokumentation des Pokémon-TCG-Meta-Dashboards (pokekon).',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/konradthiemann/Pokekon',
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [{ label: 'Setup, Build & Deploy', slug: 'getting-started' }],
        },
        {
          label: 'Architektur',
          items: [{ label: 'Architecture Overview', slug: 'architecture' }],
        },
        {
          label: 'Datenmodell',
          items: [
            { label: 'Database (Schema & Migrations)', slug: 'database' },
            { label: 'Data Types', slug: 'data-types' },
            { label: 'Data Flow', slug: 'data-flow' },
          ],
        },
        {
          label: 'KI-System',
          items: [
            { label: 'KI-System-Übersicht', slug: 'ai-system' },
            { label: 'Agent-Referenz', slug: 'agents' },
          ],
        },
        {
          label: 'Backend-Evolution',
          items: [{ label: 'Backend-Evolution-Plan', slug: 'backend-evolution-plan' }],
        },
        {
          label: 'Features',
          items: [{ label: 'Feature-Überblick', slug: 'features' }],
        },
      ],
    }),
  ],
});
