# Pokemon TCG Meta Dashboard — Documentation Index

This directory contains all technical documentation for the Pokékon project.
It is an npm-workspace monorepo: the frontend lives in `apps/web`, the
Hono + PostgreSQL backend in `apps/api`, and this documentation site in
`apps/docs` (Astro Starlight → GitHub Pages).

## Documents

| File | What it covers |
|------|---------------|
| [architecture.md](./architecture.md) | App architecture overview — component tree, tech stack, layer diagram |
| [design-system.md](./design-system.md) | Visual design system — "Poké-Light" palette, tokens, component classes, WCAG-AA baseline |
| [database.md](./database.md) | Dexie/IndexedDB schema, all tables, indexes, migration history, ER diagram |
| [data-types.md](./data-types.md) | All TypeScript interfaces and types explained in plain language |
| [data-flow.md](./data-flow.md) | How data moves from user action to store to DB to component |
| [agents.md](./agents.md) | Claude agent ecosystem — who does what, when to trigger each agent |
| [ai-system.md](./ai-system.md) | **KI-System-Gesamtübersicht** — Schichtenmodell, Guardrails, Orchestrierung, Memory, Diagramme |
| [backend-evolution-plan.md](./backend-evolution-plan.md) | Roadmap: Backend-Ausbau, Battle-Log-Zugqualität, Doku-Viewer (Starlight) |
| [features.md](./features.md) | All app features explained: meta sync, battle log, deck comparison, recommendations, snapshots |
| [demo-mode.md](./demo-mode.md) | Guest/demo access — anonymous login, seeded sample data, AI analysis without spending tokens |
| [getting-started.md](./getting-started.md) | Dev setup, build, deploy |

## Quick orientation

Pokékon is a **local-first React SPA backed by a Hono + PostgreSQL service**. The
frontend (`apps/web`) keeps the IndexedDB/Dexie store and most analysis logic; the
backend (`apps/api`, on Railway) handles auth (Better Auth) and CRUD today and is
being expanded into the analytics backend. The migration "IndexedDB → API as the
source of truth" is in progress — see [architecture.md](./architecture.md) and
[backend-evolution-plan.md](./backend-evolution-plan.md) §1.

```
apps/
  web/                 React 19 + Vite frontend (local-first)
    src/
      pages/           Overview, Deck, Recommendations, Meta (+ embedded Opponents)
      components/      UI by domain (deck/, meta/, opponent/, recommendations/, layout/)
      store/           dashboardStore.ts — single Zustand store
      db/              database.ts (Dexie schema), queries.ts (all DB operations)
      lib/             Logic + API client: api.ts, metaFetch, deckComparison,
                       deckImport, deckPerformanceStats (battle-log parsing lives in
                       @pokekon/shared; LLM analysis is server-side in apps/api)
      hooks/           useRecommendations — the recommendation engine hook
      types/           index.ts — shared TypeScript types
  api/                 Hono + Drizzle + PostgreSQL backend (Better Auth)
    src/
      app.ts           Hono app factory; routes: /health, /api/auth/*, /api/decks,
                       /api/snapshots, /api/logs, /api/analytics, /api/analysis,
                       /api/meta, /api/demo
      ai/              provider-agnostic LLM analysis (GitHub Models adapter)
      auth.ts          Better Auth (email/password + optional Google)
      db/schema.ts     Drizzle schema (Postgres tables)
      static.ts        single-origin serving of the built web app
  docs/                Astro Starlight documentation site (this content)
.claude/
  agents/              Specialized Claude agents for different tasks
```
