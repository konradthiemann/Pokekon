---
name: open-findings-archetype-drilldown-2026-07
description: Findings from the 2026-07-08 security audit of the "Archetyp-Drilldown im Meta-Tab" feature — ALL FIXED same day (see resolution block); verify fixes still hold in later audits.
metadata:
  type: project
---

> **RESOLUTION (2026-07-08, same session, applied by the implementing agent):**
> all findings below were fixed immediately after the audit —
> - **High (body buffering):** `bodyLimit({ maxSize: 512 KB })` from `hono/body-limit`
>   now wraps `POST /api/matchups/import` (`routes/matchups.ts`); covered by a 413 test.
> - **Medium (rate limiting):** new dependency-free per-user sliding-window limiter
>   `apps/api/src/lib/rateLimit.ts` (5 req / 10 min) on `POST /api/meta/sync` and
>   `POST /api/matchups/import`; covered by a 429 test.
> - **Medium (unbounded ingest):** `persistTournament` caps standings at 4000 rows
>   (`MAX_STANDINGS_PER_TOURNAMENT`, `jobs/syncMeta.ts`).
> - **Low (length/shape hardening):** `normalizeArchetypeId()` (shared, slug regex →
>   fallback `'other'`) is applied in BOTH `computeMetaSnapshots` and
>   `persistTournament`, so snapshot/standings join keys cannot diverge; `t.id`,
>   `t.name`, `format`, `archetypeName` are length-capped.
> - **Low (raw error messages):** import route now splits business errors (400 with
>   message) from DB errors (500 generic, logged); sync route only forwards
>   `Limitless…`-prefixed fetch errors, everything else → generic 502 + server log.
> - `pruneDecklist` now has dedicated unit tests (`packages/shared/src/meta.test.ts`).

Audit date: 2026-07-08. Scope: uncommitted "Archetyp-Drilldown im Meta-Tab" feature
(decklist ingest in `syncMeta.ts`, CSV import route, new `/api/meta/*` read routes,
frontend rendering in `DecklistCard.tsx`/`ArchetypeDetail.tsx`/`MatchupMatrix.tsx`).
Per the requester's instructions, nothing was fixed — findings only. This memory
tracks what was still open at that point so a future audit can verify fix status
before re-reporting the same issue as new.

**Why:** the calling agent explicitly said "NICHTS fixen"; these findings need a
follow-up pass once `react-dev-implementer`/backend work picks them up.
**How to apply:** when auditing this codebase again, re-check the file:line below
first — if fixed, drop from the report; if not, it's a repeat finding, cite this
memory as prior art rather than re-deriving severity from scratch.

## High
- **CSV-import DoS via check-after-buffer.** `apps/api/src/routes/matchups.ts:25-27`
  calls `c.req.text()` (fully buffers the request body into memory) *before*
  checking `csv.length > MAX_CSV_BYTES` (512 KB). The cap only rejects
  *processing* an oversized payload, not *receiving* it. No `hono/body-limit`
  middleware is used anywhere in `apps/api` despite being available in the
  installed `hono@^4.12.25` (`node_modules/hono/dist/middleware/body-limit`
  exists). Fix: wrap the route with `bodyLimit({ maxSize: 512 * 1024 })` from
  `hono/body-limit` so oversized bodies are rejected while streaming.

## Medium
- **No rate limiting anywhere in `apps/api`**, combined with trivial anonymous
  auth (see `api-architecture-security-baseline.md`). Most exposed on
  `POST /api/matchups/import` and `POST /api/meta/sync` (`apps/api/src/routes/meta.ts:131`)
  — the latter now does substantially more work per call since this feature
  (persists tournaments + standings + decklist jsonb, chunked inserts in
  `apps/api/src/jobs/syncMeta.ts:47-85`), so repeated invocation both costs more
  DB resources and hammers Limitless's public API from the server's own IP
  (confused-deputy / ToS risk). Fix: add per-IP/per-user rate limiting on both
  routes; consider removing the public `/api/meta/sync` HTTP trigger in favor
  of the Railway-cron-only invocation the code comment already describes.
- **Unbounded ingest size from Limitless.** `limitlessJson()`
  (`apps/api/src/jobs/syncMeta.ts:37-42`) has no response-size cap, and
  `persistTournament` (line 47) never bounds `standings.length` before mapping
  and inserting. Combined with `pruneDecklist`'s per-entry caps (200/40/40 chars
  × 60 entries × 3 groups ≈ up to ~54 KB per decklist row), a single hostile or
  buggy Limitless response could write tens of MB per sync call. The per-
  tournament `try/catch` in `runMetaSync` (around line 100) does gracefully skip
  a tournament whose insert throws, so this degrades rather than crashes — but
  there's still no proactive cap. Fix: `standings.slice(0, N)` before processing,
  and/or a response-size guard on `limitlessJson`.

## Low
- **Inconsistent length/shape hardening in `persistTournament`.**
  `apps/api/src/jobs/syncMeta.ts:55-56,71-72` — `t.id`, `t.name`, `p.deck?.id`
  (→ `archetypeId`), `p.deck?.name` (→ `archetypeName`) get no length cap or
  character-class check, unlike `playerName` (`.slice(0,100)`, line 73) and the
  decklist fields (`pruneDecklist`, `packages/shared/src/meta.ts:38-68`).
  Verified NOT an XSS vector (React JSX escaping + the sprite allowlist regex
  in `pokemonSprites.ts:104` already neutralize any injected string) — residual
  impact is DB bloat and a minor self-inflicted bug: an `archetypeId` with
  characters outside `^[a-z0-9-]+$` would appear in `/api/meta/field-analysis`
  but 400 on `/api/meta/archetypes/:id/*` (rejected by
  `archetypeIdParamSchema`, `apps/api/src/validation.ts:94-96`), making that one
  archetype's drilldown permanently unreachable. Fix: apply the same caps (and
  optionally the slug regex, falling back to `'other'` on mismatch).
- **Raw error messages returned to clients.** `apps/api/src/routes/meta.ts:135`
  (`POST /sync`, 502) and `apps/api/src/routes/matchups.ts:32` (`POST /import`,
  400) both do `err instanceof Error ? err.message : '...'` — fine for the
  intended business errors (bad CSV header, no valid rows) but also forwards
  raw DB-driver error text if the underlying `db.insert`/`db.delete` throws
  (e.g. connection errors could reveal internal hostnames). Pre-existing
  app-wide pattern, not unique to this diff, but both call sites are new/changed
  here. Fix: catch DB-layer errors separately, log detail server-side, return a
  generic message to the client.

## Verified safe (no action needed, but re-check if code changes)
- SQL fragment in `.orderBy()` at `apps/api/src/routes/meta.ts:219` — both
  interpolated values are Drizzle `Column` refs (safe identifier rendering),
  no request param touches this `sql` tag. Not an injection vector.
- `href` construction in `DecklistCard.tsx:67` uses `encodeURIComponent` on
  `tournament.id` inside a fixed `https://play.limitlesstcg.com/...` prefix —
  can't be turned into `javascript:` or an off-domain redirect.
- No `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere in the new frontend
  code (`DecklistCard.tsx`, `ArchetypeDetail.tsx`, `MatchupMatrix.tsx`,
  `WinRateBadge.tsx`).
- CSRF exposure on the new POST routes is low: better-auth's session cookie
  defaults to `SameSite=Lax` (see `api-architecture-security-baseline.md`) and
  `apps/api/src/auth.ts` doesn't override it.
- No new secrets/API keys introduced by this diff.
