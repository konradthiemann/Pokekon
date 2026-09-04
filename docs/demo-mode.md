# Demo Mode (Guest Access)

A one-click way to explore the app **without signing up** — the visitor gets a
throwaway guest account pre-filled with sample decks and documented matches, so
the recommendation engine and battle-log analysis are immediately demonstrable.
Crucially, it does **not** spend the owner's LLM token.

## How it works

```
WelcomeScreen "Ohne Anmeldung testen"
  → authClient.signIn.anonymous()        (Better Auth `anonymous` plugin → isAnonymous user)
  → localStorage['tcg-player-name'] = 'Gtmap'   (so the parser pins "me")
  → POST /api/demo/seed                   (guest-only, idempotent → seeds decks + matches)
  → dashboardStore.refresh()              (repopulate the now-seeded dashboard)
```

- **Guest accounts** use Better Auth's `anonymous` plugin. The `user.is_anonymous`
  column (migration `0004_kind_surge.sql`) flags them; `SessionUser.isAnonymous`
  carries it into the API, and the client derives demo mode from the live session
  (`lib/demo.ts` → `isAnonymousUser`).
- **Seeding** lives in `apps/api/src/lib/demoSeed.ts` and runs server-side via
  `POST /api/demo/seed` (`routes/demo.ts`). It is restricted to anonymous users and
  is idempotent (no-op if the account already owns a deck), so the call is safe to
  retry.

## What gets seeded

Two decks for player **Gtmap** (from the user's real example log):

| Deck | Role | Data |
|------|------|------|
| **Mega Kangaskhan ex** (Ogerpon Toolbox) | primary, default-active | 2 snapshots (League Cup → Regional), 14 matches, 5 with full German battle logs + pre-baked analyses |
| **N's Zoroark ex** | secondary | 6 result-only matches |

The matchup distribution is engineered to fire the heuristics in
`apps/web/src/hooks/useRecommendations.ts`:

- **Tech suggestions** — Dragapult ex (2W-4L) → *Eri*, N's Zoroark (2W-3L) → *Briar*
  (≥5 encounters, ≤50 % win rate, tech card absent from the deck).
- **Version comparison** — both bad matchups improve from 0 % (v1) to ~67 % (v2).
- **Missing Boss's Orders** — Deck A intentionally omits it.
- **Prize-dominated** — two logged blow-out losses where Gtmap takes ≤1 prize.
- **Battle-log performance** — ≥3 logged games feed the per-card / tempo / brick stats.

The invariants above are guarded by `apps/api/src/lib/demoSeed.test.ts`, which also
runs every seeded log through `parseBattleLog` + `validateAnalysis` so a format/quote
drift fails the build instead of silently shipping an empty analysis.

## AI analysis without spending tokens

### Battle-Log Analysis

1. **Pre-baked analyses** — every logged demo match ships with a stored
   `analysis` JSON (evidence-grounded), so the Match Detail → Analyse tab shows a
   real analysis with **zero** API calls.
2. **Optional own token** — a guest may paste their own GitHub Models token. In
   demo mode it is kept **only in `localStorage`** (`pokekon-demo-ai-token`) and
   sent per request; `POST /api/analysis/log` accepts an ephemeral `apiKey` in the
   body that is used once and **never stored server-side**. Regular users keep the
   existing server-side encrypted-key flow.

### Deck Synthesis

The demo seed includes pre-computed deck syntheses in the `deck_synthesis` table for both demo decks, seeded with `source: 'demo-seed'`. The Mega Kangaskhan ex deck (primary, with field data) has syntheses in both DE and EN; the Zoroark deck is intentionally left without (shows the cold-start state: "No synthesis available — click Synthesize"). This demonstrates the feature without spending tokens on demo-mode visits.

## Try it locally

The fastest way to see the flow before deploying (single-origin, so the auth
cookie stays first-party):

```bash
./scripts/demo-local.sh
```

It ensures the dev database exists, applies migrations, builds `shared → web → api`,
generates local secrets (once, into the gitignored `.env.demo.local`), and serves
everything on **http://localhost:8080**. Open it and click **"Ohne Anmeldung
testen"**. Override the database with `DATABASE_URL="…" ./scripts/demo-local.sh`.

> The API does **not** read `.env` files — when starting things by hand, export
> `DATABASE_URL` in the shell, and in two-terminal dev mode start the web with
> `VITE_API_PROXY_TARGET=http://localhost:8080` (otherwise `/api` calls go nowhere
> and the demo button appears to do nothing). See [getting-started.md](./getting-started.md).

## Caveats

- **Lowercase player names aren't pinned.** The parser's player heuristic only
  accepts names starting with an uppercase letter/digit
  (`battleLogParser.ts`), so the demo player is **`Gtmap`** (capitalised), not
  the original lowercase `gtmap`.
- **Account linking drops demo data.** Better Auth deletes the anonymous user when
  a guest signs up; the in-app demo banner communicates this.
- **Guest accounts accumulate** in Postgres over time. A periodic cleanup of stale
  anonymous users is a sensible follow-up (not yet implemented).
