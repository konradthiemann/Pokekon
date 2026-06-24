# Architecture Overview

## Purpose

**Pokékon** is a Pokémon-TCG meta dashboard that helps competitive players track
their own games, analyze the tournament meta, and improve both deck **and** play.

The system is a **local-first React SPA backed by a Hono + PostgreSQL service**.
The web app started fully local-first (all data in the browser via IndexedDB) and
is now migrating toward the server as the source of truth. Both layers coexist
today — see [Data Persistence](#data-persistence) — and the direction is set in
[backend-evolution-plan.md](./backend-evolution-plan.md).

> Earlier revisions of this document described the app as a *"zero-backend SPA."*
> That is no longer accurate: a Hono + Drizzle + PostgreSQL backend (`apps/api`)
> with Better Auth runs on Railway and is being expanded from CRUD/auth into the
> analytics backend. This page reflects the real two-app architecture.

---

## Monorepo Layout

npm-workspace monorepo (`pokekon`):

| Workspace | Stack | Role |
|-----------|-------|------|
| `apps/web` | React 19 · Vite · Zustand · Dexie (IndexedDB) · TanStack Query | local-first frontend; still holds most analysis logic |
| `apps/api` | Hono · Drizzle ORM · PostgreSQL · Better Auth | runs on Railway; migrating from CRUD/auth toward analytics backend |
| `apps/docs` | Astro · Starlight | this living documentation site (static, GitHub Pages) |

---

## Tech Stack

### Frontend (`apps/web`)

| Layer | Library / Tool |
|-------|----------------|
| UI framework | React 19 |
| Build tool | Vite 8 |
| Language | TypeScript ~6 |
| State management | Zustand 5 |
| Local database | Dexie (IndexedDB) 4 |
| Server-state caching | TanStack Query 5 |
| Auth client | better-auth |
| i18n | i18next / react-i18next |
| Charts | Recharts 3 |
| Icons | Lucide React |
| CSS | Tailwind CSS 3 |

### Backend (`apps/api`)

| Layer | Library / Tool |
|-------|----------------|
| HTTP framework | Hono 4 (`@hono/node-server`) |
| ORM | Drizzle ORM |
| Database | PostgreSQL (`pg`) |
| Auth | Better Auth + `@better-auth/drizzle-adapter` |
| Transactional email | Resend (password reset) |
| Validation | Zod 4 |
| Migrations | Drizzle Kit (`db:generate` / `db:migrate`) |
| Hosting | Railway |

---

## High-Level Layer Diagram

```mermaid
flowchart TD
    subgraph Browser["Browser — apps/web (React SPA)"]
        UI["Pages & Components"]
        Store["dashboardStore (Zustand)"]
        Logic["src/lib (analysis logic)<br/>metaFetch · deckComparison<br/>deckPerformanceStats · deckImport"]
        ApiClient["api.ts (typed REST client)"]
        Dexie["Dexie / IndexedDB<br/>(local-first store)"]
    end

    subgraph Server["Railway — apps/api (Hono)"]
        Health["/health (DB-free)"]
        AuthH["/api/auth/* (Better Auth)"]
        ApiRoutes["/api/decks · /api/snapshots · /api/logs<br/>/api/analytics · /api/analysis<br/>(session-guarded)"]
        AiLayer["ai/ provider abstraction<br/>(GitHub Models adapter)"]
        Static["Static serving of built SPA<br/>(single-origin)"]
        Drizzle["Drizzle ORM"]
    end

    subgraph Data["Data"]
        PG[("PostgreSQL")]
    end

    subgraph External["External"]
        LimitlessAPI["Limitless TCG API"]
        CORSProxy["corsproxy.io (legacy fallback)"]
        LLMProvider["LLM provider API<br/>(GitHub Models)"]
    end

    UI --> Store
    Store --> ApiClient
    Store --> Dexie
    Store --> Logic
    ApiClient -->|"fetch, credentials: include"| ApiRoutes
    ApiClient -->|sign-in / session| AuthH
    Static -.serves.-> UI
    ApiRoutes --> Drizzle
    ApiRoutes -->|battle-log analysis| AiLayer
    AiLayer -->|"server-side, BYOK key"| LLMProvider
    AuthH --> Drizzle
    Drizzle --> PG
    Logic -->|legacy, browser-side| LimitlessAPI
    Logic --> CORSProxy
```

> Dashed arrow: in production the API process also serves the built web app, so
> the Better Auth session cookie stays first-party (single origin).

---

## Backend (`apps/api`)

`createApp()` ([app.ts](../apps/api/src/app.ts)) is a Hono app factory. Creating
the app needs **no database**: `/health` is fully DB-free and both the Better
Auth handler and the `pg` pool are initialized lazily on the first matching
`/api` request.

Registration order matters:

1. **CORS** (`hono/cors`) with `credentials: true`, origin = `webOrigin` — must be
   first (Better Auth requirement). Relevant only for split-origin deployments.
2. **`GET /health`** — liveness check.
3. **`/api/auth/*`** — handed to the Better Auth handler before the guarded sub-app
   so sign-in works without an existing session.
4. **Guarded `/api` sub-app** — a `sessionMiddleware` runs first, then `db` is
   injected into the context, then the domain routes mount:
   `/api/decks`, `/api/snapshots`, `/api/logs`, `/api/analytics`, `/api/analysis`.

**Battle-log pipeline & analytics** — `POST /api/logs` parses the log server-side
once on write into `match_log_parsed` (plan §4); `GET /api/analytics/deck/:id?weeks=`
reads the turn-quality aggregates. See [data-flow.md](./data-flow.md).

**LLM analysis** ([ai/](../apps/api/src/ai/)): a provider-agnostic `AnalysisProvider`
abstraction (GitHub Models adapter today) powers `POST /api/analysis/log`. The
per-user API key is stored AES-256-GCM-encrypted ([lib/crypto.ts](../apps/api/src/lib/crypto.ts),
key from `ENCRYPTION_KEY`) in `user_ai_settings` and only decrypted server-side —
never sent to the browser. Anti-hallucination (verbatim evidence, `temperature=0`)
lives in the shared engine so every provider is grounded.

**Auth** ([auth.ts](../apps/api/src/auth.ts)): Better Auth with the Drizzle
adapter (`provider: 'pg'`). Email + password is always on (password reset emails
via Resend, [email.ts](../apps/api/src/email.ts)); Google OAuth turns on when
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are present.

**Single-origin deployment** ([static.ts](../apps/api/src/static.ts)): the API
process serves the built web SPA (`apps/web/dist`, overridable via
`WEB_DIST_PATH`), so the browser talks to exactly one origin for both the app
shell and `/api/*` and the session cookie remains first-party.

**Secrets** (`DATABASE_URL`, Better-Auth secret, Resend key, `ENCRYPTION_KEY` for
per-user LLM keys) are Railway variables — never in the browser bundle. User LLM
keys themselves are BYOK: entered by the user, stored encrypted, server-side only.

---

## Frontend (`apps/web`)

### Application Shell

`App.tsx` renders the layout (`Sidebar` + `BottomNav`) and one page based on
`store.activeTab` (overview · deck · recommendations · meta). Opponent-log
functionality is embedded in `DeckPage`'s "Match Log" section rather than a
separate tab.

### State Management Pattern

A single Zustand store (`useDashboardStore`) owns the data arrays
(`decks`, `deckCards`, `deckSnapshots`, `opponentLogs`, `metaSnapshots`,
`archetypeStats`, `recentTournaments`), the active-deck cursor,
localStorage-backed preferences, async-operation flags, and UI state. The
`refresh()` action is the single entry point to reload data; mutations end with
`await get().refresh()` to keep the store consistent.

### Component Tree (frontend)

```mermaid
graph TD
    App --> Sidebar
    App --> BottomNav
    App --> OverviewPage
    App --> DeckPage
    App --> RecommendationsPage
    App --> MetaPage

    OverviewPage --> StatCard
    OverviewPage --> MetaShareChart
    OverviewPage --> WinRateChart
    OverviewPage --> MetaTable_Overview["MetaTable (overview)"]

    DeckPage --> DeckSwitcher
    DeckPage --> DeckPanel
    DeckPage --> DeckAnalyticsPanel
    DeckPage --> OpponentLog
    DeckPage --> LocalMetaPanel
    DeckPage --> SidePanel

    DeckPanel --> AddCardModal
    DeckPanel --> ImportDeckModal

    DeckAnalyticsPanel --> DeckPerformancePanel
    DeckAnalyticsPanel --> MatchupMatrix_Deck["MatchupMatrix"]

    OpponentLog --> AddLogModal
    OpponentLog --> MatchDetailModal
    OpponentLog --> MatchStatsTab

    RecommendationsPage --> RecommendationsPanel
    RecommendationsPage --> DeckComparisonPanel

    MetaPage --> MatchupMatrix
    MetaPage --> MetaTable_Meta["MetaTable (meta)"]
    MetaPage --> CollapsibleSection
```

---

## Data Persistence

The migration "IndexedDB → API as the source of truth" is **in progress**, so two
stores coexist:

| Data | Storage | Notes |
|------|---------|-------|
| Decks, cards, logs, snapshots | PostgreSQL via `apps/api` | server-side source of truth (target state) |
| Parsed logs, meta snapshots, AI settings | PostgreSQL (`match_log_parsed`, `meta_snapshots`, `user_ai_settings`) | server-side; see [database.md](./database.md) |
| Decks, cards, logs, snapshots, meta | IndexedDB via Dexie (`TCGMetaDashboard`) | local-first store, still authoritative for parts of the app |
| LLM API key | PostgreSQL (`user_ai_settings`, AES-256-GCM encrypted) | BYOK, server-side only — never localStorage |
| Active deck ID | localStorage (`tcg-active-deck-id-v3`) | UI preference |
| Local meta archetypes | localStorage (`tcg-local-meta-v1`) | UI preference |
| Deck archetype slug | localStorage (`tcg-deck-arch-slug-v1`) | UI preference |
| Player name (battle-log parsing) | localStorage (`tcg-player-name`) | parser input |

The typed client [api.ts](../apps/web/src/lib/api.ts) talks to `apps/api` with
`credentials: 'include'` (Better Auth session cookie); base URL is `VITE_API_URL`
in split-origin deployments or the empty string for same-origin. It applies a few
boundary adapters between the client types and the wire format
(`DeckSnapshot.cards` string ↔ jsonb array, the `DeckCard.cardId` sentinel,
`null` ↔ `undefined` for optional log columns).

The `meta_snapshots` table now exists server-side (plan §5.1), but the sync job
that populates it is still the browser-side `metaFetch.ts` — porting that to a
server cron (plan §6.2) is the next migration step.

---

## External API Integration

- **Limitless TCG API** — `metaFetch.ts` and `deckComparison.ts` fetch directly,
  falling back to `corsproxy.io` on CORS/HTTP failure. This browser-side path is
  legacy: it moves to a server-side cron job (no CORS proxy needed) per plan §6.2.
- **LLM analysis** — now **server-side and provider-agnostic** ([ai/](../apps/api/src/ai/),
  `POST /api/analysis/log`). The default provider is GitHub Models; the per-user
  API key is BYOK, stored encrypted server-side and never in the browser bundle
  (plan §6.3 / CLAUDE.md golden rule 3). The former browser-side
  `battleLogAnalysis.ts` has been removed.

---

## Responsive Layout

The app uses sidebar navigation on medium+ screens and a bottom nav bar on mobile.
The main content area is capped at `max-w-screen-2xl` with `p-3 md:p-4` padding,
on the light **"playmat"** surface (`#eef3fb`, see [design-system.md](./design-system.md))
using Tailwind utilities throughout.

## Visual design

The UI is a light, playful, WCAG-AA theme — white "cards" on a deck-tinted light
playmat, with the self-hosted Nunito font and Pokémon blue/yellow accents. The
token layer lives in [`apps/web/src/index.css`](../apps/web/src/index.css) and
[`tailwind.config.js`](../apps/web/tailwind.config.js). Full reference, palette
and accessibility baseline: [design-system.md](./design-system.md).
