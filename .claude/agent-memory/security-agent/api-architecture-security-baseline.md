---
name: api-architecture-security-baseline
description: Standing architectural facts about apps/api relevant to every future security audit (auth strength, rate limiting, cookie config, data scoping).
metadata:
  type: project
---

Established while auditing the "Archetyp-Drilldown im Meta-Tab" feature
(2026-07-08) by reading `apps/api/src/auth.ts`, `middleware/session.ts`,
`app.ts`, and `node_modules/better-auth`. These are recurring facts to check
against for *every* future new-route audit, not specific to that feature.

**Why:** re-deriving these from scratch every audit is wasteful and error-prone;
recording them means new findings can cite the actual mechanism instead of
guessing.
**How to apply:** when a new route is added under `/api/*`, use this as the
default threat-model context — "requires a session" is a much weaker gate here
than in a typical app, because sessions are free.

- **Every `/api/*` route requires a Better Auth session** (`sessionMiddleware`,
  `apps/api/src/middleware/session.ts:38-49`), 401 otherwise. BUT the
  `anonymous` better-auth plugin is enabled (`apps/api/src/auth.ts:27`) — a
  throwaway guest account is created with a single click, no email
  verification, no CAPTCHA. So "requires auth" is a negligible barrier against
  scripted abuse; treat auth-gated routes as close to public when assessing
  DoS/abuse severity, not as meaningfully access-controlled.
- **No rate limiting exists anywhere in `apps/api`** (confirmed via grep for
  `rateLimit`/`throttle` — zero hits, no such package in `apps/api/package.json`).
  Every new expensive/state-changing route should be flagged for this until it
  changes.
- **No `hono/body-limit` middleware is used anywhere**, even though it ships
  with the installed `hono@^4.12.25`. Any route that does `c.req.text()` /
  `c.req.json()` on a raw body should be checked for the "read full body before
  checking declared size" anti-pattern (buffers first, rejects too late).
- **Better Auth session cookie is `SameSite=Lax`** — this is the *library
  default* (confirmed in `node_modules/better-auth/dist/cookies/index.mjs:32`,
  `sameSite: "lax"`); `apps/api/src/auth.ts`'s `BetterAuthOptions` does not
  override it via `advanced.cookies`/`session.cookieOptions`. Combined with
  single-origin CORS (`app.ts:32-40`, `origin: env.webOrigin`), CSRF risk on
  state-changing routes is generally low by default — don't re-flag this as a
  vulnerability without first checking whether a specific route needs a
  non-`Lax` cookie (would be a deliberate, notable change).
- **Tournament/meta reference data is intentionally NOT user-scoped.**
  `tournaments`, `tournament_standings`, `matchup_matrix`, `meta_snapshots`
  (see comment at `apps/api/src/db/schema.ts:259-262`) are public
  Limitless-sourced reference data, equally visible to every authenticated
  (including anonymous) user by design. Don't apply IDOR framing here the way
  you would for `decks`/`opponent_logs`/`ai_settings`, which *are* per-user.
- **Limitless TCG (`https://play.limitlesstcg.com`) is the one external,
  non-owned data source** or the API side; fetched only server-side
  (`apps/api/src/jobs/syncMeta.ts`), 15s timeout via `AbortSignal.timeout`, no
  response-size cap. Treat any new consumer of Limitless data as untrusted
  external input per the project's own framing.
