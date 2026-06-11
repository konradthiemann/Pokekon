---
name: project_architecture
description: Core tech stack decisions, project structure, and data flow for the TCG Meta Dashboard
type: project
---

The app lives at /Users/konrad.thiemann/tcg/tcg-dashboard.

## Tech Stack (all decisions finalized)

- **Bundler**: Vite 8 + React 19 + TypeScript (strict)
- **Styling**: Tailwind CSS v3 (v4 skipped — no stable PostCSS plugin at time of init)
- **Charts**: Recharts (free, React-native, no D3 peer dependency friction)
- **Database**: Dexie.js (IndexedDB wrapper) — pure browser, no server, persists across reloads
- **State**: Zustand store (`useDashboardStore`) — single store, holds all fetched data + UI tab state
- **No React Query** — Zustand + manual `refresh()` action was sufficient; avoided extra dependency

## Project Structure

```
src/
  types/index.ts          — All domain + view types
  db/
    database.ts           — Dexie schema (TCGDatabase class)
    queries.ts            — All DB read/write functions
    seed.ts               — One-time seed guard (localStorage key: tcg-dashboard-seeded-v1)
  data/seedMeta.ts        — Static seed: meta snapshots (W14+W15 2026), starter deck, sample logs
  store/dashboardStore.ts — Zustand store: deckCards, opponentLogs, metaSnapshots, archetypeStats
  hooks/useRecommendations.ts — Pure useMemo recommendation engine
  components/
    layout/               — Sidebar, StatCard
    meta/                 — MetaShareChart, WinRateChart, MetaTable
    deck/                 — DeckPanel, AddCardModal
    opponent/             — OpponentLog, AddLogModal
    recommendations/      — RecommendationsPanel
  pages/                  — OverviewPage, DeckPage, OpponentsPage, RecommendationsPage
  App.tsx                 — Root: seeds DB, triggers refresh, routes activeTab to page
```

## Data Flow

DB (Dexie/IndexedDB) → queries.ts → Zustand `refresh()` → store state → components/pages → charts

The `refresh()` action is the single update trigger: called on mount and by the sidebar Refresh button.

## Why:
Initial build from scratch on 2026-04-15. All choices prioritized free/offline/React-native.

## How to apply:
Any new feature must route through `queries.ts` → `useDashboardStore` before reaching components. No direct Dexie calls in components.
