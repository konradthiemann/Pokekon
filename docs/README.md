# Pokemon TCG Meta Dashboard — Documentation Index

This directory contains all technical documentation for the TCG Meta Dashboard project.
The application source lives at `/Users/konrad.thiemann/tcg/tcg-dashboard/`.

## Documents

| File | What it covers |
|------|---------------|
| [architecture.md](./architecture.md) | App architecture overview — component tree, tech stack, layer diagram |
| [database.md](./database.md) | Dexie/IndexedDB schema, all tables, indexes, migration history, ER diagram |
| [data-types.md](./data-types.md) | All TypeScript interfaces and types explained in plain language |
| [data-flow.md](./data-flow.md) | How data moves from user action to store to DB to component |
| [agents.md](./agents.md) | Claude agent ecosystem — who does what, when to trigger each agent |
| [ai-system.md](./ai-system.md) | **KI-System-Gesamtübersicht** — Schichtenmodell, Guardrails, Orchestrierung, Memory, Diagramme |
| [backend-evolution-plan.md](./backend-evolution-plan.md) | Roadmap: Backend-Ausbau, Battle-Log-Zugqualität, Doku-Viewer (Starlight) |
| [features.md](./features.md) | All app features explained: meta sync, battle log, deck comparison, recommendations, snapshots |
| [getting-started.md](./getting-started.md) | Dev setup, build, deploy |

> ⚠️ **Drift-Hinweis:** Die „Quick orientation" unten beschreibt die App noch als reines local-first SPA ohne Backend. Das ist veraltet — es existiert ein Hono+Postgres-Backend (`apps/api`), das ausgebaut wird. Siehe [backend-evolution-plan.md](./backend-evolution-plan.md) Abschnitt 1. Korrektur erfolgt beim Doku-Viewer-Aufbau.

## Quick orientation

The app is a **local-first, single-page React application** with no backend server. All data is stored in the browser's IndexedDB via Dexie. Live tournament data is fetched from the public Limitless TCG API when the user explicitly triggers a sync.

```
tcg-dashboard/
  src/
    pages/          Five pages: Overview, Deck, Recommendations, Meta, Opponents
    components/     UI components grouped by domain (deck/, meta/, opponent/, recommendations/, layout/)
    store/          dashboardStore.ts — single Zustand store
    db/             database.ts (Dexie schema), queries.ts (all DB operations)
    lib/            Pure logic: metaFetch, deckComparison, battleLogParser, battleLogAnalysis,
                    deckImport, deckPerformanceStats, preferences
    hooks/          useRecommendations — the recommendation engine hook
    types/          index.ts — all shared TypeScript types
  .claude/
    agents/         Eleven specialized Claude agents for different tasks
```
