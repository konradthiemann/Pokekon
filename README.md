# Pokékon — Pokémon TCG Meta Dashboard

[![CI](https://github.com/konradthiemann/Pokekon/actions/workflows/ci.yml/badge.svg)](https://github.com/konradthiemann/Pokekon/actions/workflows/ci.yml)
[![Docs](https://github.com/konradthiemann/Pokekon/actions/workflows/docs.yml/badge.svg)](https://konradthiemann.github.io/Pokekon/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Track your Pokémon TCG games, analyze the competitive meta, and get data-driven
help to improve both your **deck list** and your **play**.

- 📖 **Documentation:** https://konradthiemann.github.io/Pokekon/
- 🧩 **Stack:** React 19 · Vite · TypeScript · Hono · Drizzle ORM · PostgreSQL · Better Auth

> **Status:** actively evolving. The app is being migrated from a local-first,
> IndexedDB-only SPA toward a server-backed architecture where the API (Hono +
> PostgreSQL on Railway) is the source of truth. See
> [`docs/backend-evolution-plan.md`](./docs/backend-evolution-plan.md).

---

## Monorepo layout

An npm-workspace monorepo (**Node ≥ 22**):

| Workspace | Stack | Role |
| --------- | ----- | ---- |
| [`apps/web`](./apps/web) | React 19, Vite, TypeScript, Tailwind, Zustand, Dexie (IndexedDB), TanStack Query, Better Auth, i18next, Recharts | Local-first frontend; holds most analysis logic today |
| [`apps/api`](./apps/api) | Hono, Drizzle ORM, PostgreSQL, Better Auth, Zod, Resend | HTTP API + auth on Railway; single-origin server that also serves the built web app |
| [`apps/docs`](./apps/docs) | Astro Starlight, Mermaid | Living documentation → GitHub Pages |
| `packages/shared` | TypeScript | Types and pure logic shared across web and api |

## Features

- **Meta overview** — archetype frequency and win rates from recent Limitless TCG tournaments
- **Live meta sync** — server-side sync of current tournament standings (single source of truth)
- **Multi-deck management** — maintain multiple lists, variants, and builds
- **Deck import** — paste a standard PTCG export list; card roles are inferred automatically
- **Match log** — record opponent archetype, event type (LC / LCup / Regional / Worlds), and result
- **Deck versioning** — snapshot a deck at any point and tag match logs to a version
- **Battle-log parsing** — paste a TCG Live battle protocol (German) for a turn-by-turn breakdown
- **AI battle-log analysis** — server-side, provider-agnostic, **bring-your-own-key** analysis with key moments, play mistakes, and suggestions (keys encrypted at rest)
- **Deck comparison** — diff your list against public tournament decklists of the same archetype
- **Recommendations engine** — data-driven rules generate prioritized adjustments, separating *list* vs. *play* levers
- **Matchup matrix** — cross-table of your personal win rates per opponent archetype
- **Guest/demo mode** — try the app with seeded sample data, no account required

## Quick start

**Prerequisites:** Node.js **≥ 22**, npm.

```bash
npm install

# Frontend (Vite dev server on http://localhost:5173, proxies /api)
npm run dev

# API (Hono server on http://localhost:8080)
npm run dev:api
```

To run the whole app single-origin (API also serves the built web app, so the
guest/demo flow works end-to-end) use [`scripts/demo-local.sh`](./scripts/demo-local.sh).

Per-app setup and environment variables:
[`apps/web/README.md`](./apps/web/README.md) · [`apps/api/README.md`](./apps/api/README.md).

## Scripts (repo root)

| Script | Purpose |
| ------ | ------- |
| `npm run dev` | Build `@pokekon/shared`, then start the web dev server |
| `npm run dev:api` | Build `@pokekon/shared`, then start the API dev server |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run lint` | Lint all workspaces |
| `npm run test` | Run all workspace test suites (Vitest) |
| `npm run format` | Format with Prettier |

## Deployment

- **App:** deployed to **Railway** as a single-origin service (the API serves the
  built SPA). Deploys run from `main` after typecheck + tests pass — see
  [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).
- **Docs:** the Astro Starlight site publishes to **GitHub Pages** on changes
  under `docs/**` — see [`.github/workflows/docs.yml`](./.github/workflows/docs.yml)
  and https://konradthiemann.github.io/Pokekon/.

## Documentation

Full technical docs live in [`docs/`](./docs/) and are published to the
[documentation site](https://konradthiemann.github.io/Pokekon/). Highlights:

- [`docs/architecture.md`](./docs/architecture.md) — architecture overview
- [`docs/database.md`](./docs/database.md) — data model, schema, migrations
- [`docs/features.md`](./docs/features.md) — feature documentation
- [`docs/backend-evolution-plan.md`](./docs/backend-evolution-plan.md) — roadmap
- [`docs/ai-system.md`](./docs/ai-system.md) — the KI/agent system

## Contributing

CI (lint, typecheck, test, build) must be green on every pull request. Prettier
runs via a husky/lint-staged pre-commit hook. Please open a PR rather than
pushing to `main`.

## Security

See [`.github/SECURITY.md`](./.github/SECURITY.md) for how to report
vulnerabilities and how secrets are handled.

## License

[MIT](./LICENSE) © 2026 Konrad Thiemann.
