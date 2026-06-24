# Getting Started

Pokékon is an npm-workspace monorepo:

| Workspace | Stack | Role |
|-----------|-------|------|
| `apps/web` | React 19 · Vite · Zustand · Dexie | frontend UI |
| `apps/api` | Hono · Drizzle · PostgreSQL · Better Auth | API + auth, serves the SPA in prod |
| `apps/docs` | Astro · Starlight | this documentation site (GitHub Pages) |
| `packages/shared` | TypeScript | `@pokekon/shared` — battle-log parser, analytics/meta types, analysis engine |

Domain data (decks, cards, snapshots, match logs) and the tournament meta live
**server-side in PostgreSQL** behind the REST API; the browser talks to it via a
session cookie. (IndexedDB remains only as a legacy local cache for the one-time
import of pre-account data.)

---

## Prerequisites

- **Node.js** 22 or later (the repo targets Node ≥ 22)
- **npm** 9 or later (comes with Node)
- A modern browser (Chrome, Firefox, Edge, Safari)
- For the API: a **PostgreSQL** database (`DATABASE_URL`) — or point the web dev
  server at the deployed API (see [Development](#development)).

---

## Installation

From the repository root (installs all workspaces):

```bash
npm install
```

---

## Development

Because domain data is session-scoped behind the API, the web app needs an API
to talk to. Two options:

**Option A — proxy to the deployed API (no local Postgres):**
```bash
# apps/web/.env.local
VITE_API_PROXY_TARGET=https://<your-api>.up.railway.app
```
```bash
npm run dev          # web on http://localhost:5173, /api proxied to the target
```
The Vite proxy rewrites the cookie domain so the Better Auth session works.

**Option B — full local stack (hot reload, two terminals):**
```bash
# Terminal 1 — API (DATABASE_URL must be exported; the API does NOT read .env)
export DATABASE_URL="postgresql://$(whoami)@127.0.0.1:5432/pokekon_dev"
npm run db:migrate -w @pokekon/api    # apply migrations to your local DB
npm run dev:api                        # API on http://localhost:8080

# Terminal 2 — web. The Vite /api proxy is ONLY active when this var is set:
VITE_API_PROXY_TARGET="http://localhost:8080" npm run dev   # web on :5173 → proxies /api to :8080
```
Open http://localhost:5173. Without `VITE_API_PROXY_TARGET`, the web app has no API
to talk to and every request fails silently.

Then sign in (or create an account) — domain data starts empty for a new account.
Hot module replacement is active for the web app.

**Option C — one-command guest demo (single-origin, closest to production):**
```bash
./scripts/demo-local.sh
```
Builds everything, applies migrations, and serves the API + web on
**http://localhost:8080** from one process. Open it and click
**"Ohne Anmeldung testen"** to explore with seeded sample decks and matches — no
sign-up, no LLM token. Needs a local PostgreSQL running; override the connection
with `DATABASE_URL="…" ./scripts/demo-local.sh`. See [demo-mode.md](./demo-mode.md).

---

## Available Scripts (root)

| Script | What it does |
|--------|--------------|
| `npm run dev` | Web dev server (Vite, port 5173) |
| `npm run dev:api` | API dev server (tsx watch, port 8080) |
| `npm run build` | Build all workspaces (shared → web/api/docs) |
| `npm run lint` | ESLint across workspaces |
| `npm run typecheck` | Type-check across workspaces |
| `npm run test` | Vitest across workspaces |
| `npm run format` / `format:check` | Prettier write / check |

API-only: `db:generate` / `db:migrate` (Drizzle), `job:sync-meta` (meta cron),
`migrate:deploy` (programmatic migrator used on deploy).

---

## Deployment

Production runs on **Railway, single-origin**: the API process (`apps/api`) serves
both `/api/*` and the built web SPA, so the Better Auth session cookie stays
first-party. Deploys are gated by CI (`.github/workflows/deploy.yml`: typecheck +
test → `railway up`), and migrations run automatically via the `preDeployCommand`
in `railway.json`.

### API server environment (`apps/api`)

Railway variables (never in the browser bundle):

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | yes in production | Better Auth signing secret |
| `ENCRYPTION_KEY` | for LLM analysis | 32-byte AES key for per-user LLM keys — `openssl rand -hex 32` |
| `WEB_ORIGIN` | split-origin only | allowed browser origin for CORS |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | transactional email (else logged to stdout) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | enables Google OAuth |

CI deploy needs a repo secret `RAILWAY_TOKEN` (Railway project token). The docs
site deploys separately to GitHub Pages via `.github/workflows/docs.yml`.

---

## First Use

> **Just want to look around?** Click **"Ohne Anmeldung testen"** on the welcome
> screen for an instant guest demo — a throwaway account pre-filled with sample
> decks, documented matches and ready-made AI analyses. See [demo-mode.md](./demo-mode.md).

1. Sign in / create an account (top-right or sidebar). A fresh account starts empty.
2. **Deck** → create a deck, then "Import" your list (paste your PTCG export).
3. Set the archetype + Limitless slug (e.g. `n-zoroark`) in Deck Settings.
4. **Sync Live Meta** (sidebar on desktop, or the button in the Meta page header on mobile) to fetch current tournament data (server-side sync).
5. Log matches in the **Match Log** section; paste battle logs for turn-quality
   analytics and (optional) LLM analysis.

---

## Using the Battle Log Analysis

The AI analysis runs **server-side** (provider-agnostic, GitHub Models by default)
with your own key (BYOK) — stored **encrypted on the server**, never in the browser.
Requires `ENCRYPTION_KEY` set on the API.

1. Set your **GitHub Models token** once: account menu → **KI-Analyse / AI analysis**
   (a fine-grained PAT with the *Models: Read-only* permission). Stored encrypted.
2. Export a battle log from Pokémon TCG Live (Battle Log → Copy).
3. In a match's detail → **Analyse** tab, paste the log and click "Analyze".
4. The grounded analysis (every claim quotes the log verbatim, `temperature=0`) is
   saved to the match.

> TCG Live exports battle logs in **German** regardless of UI language — the parser
> targets German protocol text.

---

## Resetting Data

Domain data is server-side per account. To clear it, delete your decks/logs in the
app (cascades remove their cards, snapshots and parsed logs). The legacy local
cache can be cleared via DevTools → Application → IndexedDB → delete
`TCGMetaDashboard`.

---

## Project Structure

```
tcg/                      # repo root (npm workspaces)
├── apps/
│   ├── web/              # React 19 + Vite frontend
│   │   └── src/
│   │       ├── pages/            # Overview, Deck, Recommendations, Meta
│   │       ├── components/       # deck/ meta/ opponent/ recommendations/ layout/ auth/ settings/
│   │       ├── store/            # dashboardStore.ts (Zustand)
│   │       ├── db/               # queries.ts (delegates to the API), database.ts (Dexie legacy cache)
│   │       ├── lib/              # api.ts (REST client), metaFetch, deckComparison, deckImport, deckPerformanceStats
│   │       ├── hooks/ types/ i18n/  # recommendations hook, shared types, de/en translations
│   ├── api/              # Hono + Drizzle + PostgreSQL
│   │   ├── src/
│   │   │   ├── app.ts            # Hono app factory; routes mounted here
│   │   │   ├── auth.ts           # Better Auth
│   │   │   ├── db/               # schema.ts (Drizzle), index.ts (pg pool)
│   │   │   ├── routes/           # decks, snapshots, logs, analytics, analysis, meta
│   │   │   ├── ai/               # provider abstraction + GitHub Models adapter
│   │   │   ├── jobs/             # syncMeta.ts (meta cron)
│   │   │   ├── lib/              # crypto, deckAnalytics, matchLogPipeline
│   │   │   └── migrate.ts        # programmatic migrator (preDeployCommand)
│   │   └── drizzle/              # generated SQL migrations
│   └── docs/             # Astro Starlight site (renders ../../docs)
├── packages/
│   └── shared/           # @pokekon/shared: parser, analytics/meta/analysis types + engine, season helpers
├── docs/                 # Markdown docs (source of truth)
├── .claude/              # agents, commands, plans
├── railway.json          # Railway build + deploy (single-origin) + preDeployCommand
└── package.json          # workspaces root
```

---

## Troubleshooting

**"No meta data yet":** click **Sync Live Meta** (in the sidebar, or in the Meta page header on mobile) — the server fetches Limitless (needs the API + an internet connection).

**Battle-log parsing shows the wrong player:** set your TCG Live username so the parser pins "you" correctly:
```javascript
localStorage.setItem('tcg-player-name', 'YourTCGLiveUsername');
```

**AI analysis returns an error:** ensure `ENCRYPTION_KEY` is set on the API and that you saved a valid GitHub Models token (account menu → AI analysis).

**Deck comparison returns "No public decklists found":** the Limitless slug must match Limitless exactly (e.g. `n-zoroark`). Verify it by searching the archetype on [play.limitlesstcg.com](https://play.limitlesstcg.com).

**`@pokekon/shared` not found during a build:** build the shared package first (`npm run build -w @pokekon/shared`) — the root `build`/`typecheck`/`test` scripts already do this.
