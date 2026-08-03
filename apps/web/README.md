# Pokemon TCG Meta Dashboard

The local-first frontend of [Pokékon](../../README.md), for competitive Pokémon TCG players. Track the current tournament meta, manage your decks, log match results, and get data-driven recommendations. It keeps a local IndexedDB store and talks to the Hono + PostgreSQL API (Better Auth) for sync, meta data, and AI analysis — with a guest/demo mode that needs no account.

Full documentation: [`/docs/`](../docs/)

---

## Features

- **Meta overview** — charts and tables showing archetype frequency and win rates from recent Limitless TCG tournaments
- **Live meta sync** — one-click fetch of current tournament standings from play.limitlesstcg.com
- **Multi-deck management** — maintain multiple deck lists, variants, and builds side by side
- **Deck import** — paste a standard PTCG export list and the app infers card roles automatically
- **Match log** — record opponent archetypes, event type (LC / LCup / Regional / Worlds), and result
- **Deck versioning** — snapshot your deck at any point; match logs can be tagged to a specific version
- **Battle log parsing** — paste a TCG Live battle protocol (German) and get visual turn-by-turn breakdowns
- **AI battle log analysis** — server-side, provider-agnostic, bring-your-own-key analysis with key moments, play mistakes, and deck suggestions (your key is encrypted at rest)
- **Deck comparison** — compare your list against public tournament decklists from the same archetype
- **Recommendations engine** — 14 data-driven rules generate prioritized deck adjustment suggestions based on your match history, meta data, and battle log performance
- **Local meta** — tag archetypes common at your local store for priority-boosted recommendations
- **Matchup matrix** — visual cross-table of your personal win rates per opponent archetype
- **Recent tournaments** — browse individual recent Limitless tournaments and their top archetypes

---

## Tech Stack

| Library | Version | Role |
|---------|---------|------|
| React | 19.2.4 | UI framework |
| TypeScript | ~6.0.2 | Type safety |
| Vite | 8.0.4 | Build tool and dev server |
| Zustand | 5.0.12 | Global state management |
| Dexie | 4.4.2 | IndexedDB wrapper (local database) |
| TanStack Query | 5.99.0 | Server-state caching |
| Recharts | 3.8.1 | Charts and data visualization |
| Lucide React | 1.8.0 | Icons |
| Tailwind CSS | 3.4.19 | Styling |

---

## Quick Start

**Prerequisites:** Node.js 22+, npm

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Demo data is seeded automatically on first load.

### First steps
1. Go to **Deck** and import your real deck list (or use the seeded demo deck)
2. In **Deck Settings**, set your archetype display name and Limitless slug (e.g., `n-zoroark`)
3. Click **Sync Live Meta** in the sidebar to fetch current meta data
4. Start logging matches in the **Match Log** section

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with HMR on port 5173 |
| `npm run build` | TypeScript compile + Vite production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint with TypeScript rules |

---

## Architecture

```
src/
  pages/           OverviewPage, DeckPage, RecommendationsPage, MetaPage, OpponentsPage
  components/      UI components grouped by domain (deck/, meta/, opponent/, recommendations/, layout/)
  store/           dashboardStore.ts — single Zustand store, all app state
  db/              database.ts (Dexie schema v3), queries.ts (all DB operations)
  lib/             Pure logic modules:
                     metaFetch.ts        — Limitless API integration
                     deckComparison.ts   — Tournament list diff
                     battleLogParser.ts  — German TCG Live protocol parser
                     battleLogAnalysis.ts — Claude AI analysis
                     deckImport.ts       — Card type/role inference
                     deckPerformanceStats.ts — Card performance aggregation
                     preferences.ts      — localStorage wrapper
  hooks/           useRecommendations.ts — recommendation engine (useMemo)
  types/           index.ts — all shared TypeScript interfaces
```

The frontend keeps a local-first store in IndexedDB (via Dexie) and talks to the Hono + PostgreSQL API for authentication, meta sync, and CRUD (decks, logs, snapshots). Meta sync and AI battle-log analysis run server-side; migrating the source of truth from IndexedDB to the API is in progress (see [../../docs/backend-evolution-plan.md](../../docs/backend-evolution-plan.md)).

---

## Database

Dexie schema v3 with six tables: `cards`, `decks`, `deckCards`, `deckSnapshots`, `opponentLogs`, `metaSnapshots`. See [`/docs/database.md`](../docs/database.md) for the full schema, ER diagram, and migration history.

---

## Agent Ecosystem

Development is supported by eleven specialized Claude agents defined in `.claude/agents/`. See [`/docs/agents.md`](../docs/agents.md) for the full roster and delegation workflows.

Key agents:
- `tcg-meta-project-head` — architecture and cross-cutting decisions
- `react-dev-implementer` — component and hook implementation
- `docs-agent` — this documentation
- `meta-analyst` — deck strategy recommendations

---

## Further Reading

| Document | Contents |
|----------|----------|
| [`docs/architecture.md`](../docs/architecture.md) | Layer diagram, component tree, state management pattern |
| [`docs/database.md`](../docs/database.md) | Schema, ER diagram, migration history, query patterns |
| [`docs/data-types.md`](../docs/data-types.md) | All TypeScript types explained in plain language |
| [`docs/data-flow.md`](../docs/data-flow.md) | Sequence diagrams for every major operation |
| [`docs/features.md`](../docs/features.md) | Detailed feature documentation |
| [`docs/agents.md`](../docs/agents.md) | Claude agent ecosystem and workflows |
| [`docs/getting-started.md`](../docs/getting-started.md) | Full setup, build, deploy, and troubleshooting guide |
