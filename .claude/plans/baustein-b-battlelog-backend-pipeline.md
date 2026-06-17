# Plan — Baustein B: Battle-Log-Backend-Pipeline + Zug-Qualität

> Quelle: `docs/prompts/implementation-prompt-evolution.md` (Baustein B) + `docs/backend-evolution-plan.md` §3.7, §4, §5.
> Branch: `feat/battlelog-backend-pipeline` (off main, unabhängig von PR #10/Baustein A).
> **Entscheidung (User, 2026-06-17):** Board-State-Tiefe = **Hand/Bank/Aktiv + Energie-Summe** (keine Energie-Zuordnung pro Pokémon).

## Belegte Fakten (gelesen)
- Parser `apps/web/src/lib/battleLogParser.ts` (313 Z.) ist deterministisch, deutschsprachig; Marker: `Zug von `, `… hat … gespielt.`, `…-Energie an <Pokémon> angelegt`, `<Pokémon> von X hat … für N Schadenspunkte eingesetzt`, `… wurde kampfunfähig gemacht!`, `… hat den Münzwurf …`, `… hat für die Starthand N Karten gezogen`, `… hat (N) Preiskarte(n) aufgenommen`, `… hat gewonnen`.
- Parser-Importeure (Web): `components/opponent/MatchStatsTab.tsx`, `MatchDetailModal.tsx`, `lib/deckPerformanceStats.ts`, `battleLogParser.test.ts`.
- API: Hono-Factory `app.ts`; Routen `/api/decks|snapshots|logs`. `logs.ts` POST schreibt `opponent_logs` (battleLog text, analysis text). Kein `meta_snapshots`, kein `match_log_parsed` serverseitig.
- Schema `apps/api/src/db/schema.ts`: domain-Tabellen vorhanden; `opponentLogs` hat `eventDate` (date, mode string), Index `archetype_eventDate`. Kein reiner `event_date`-Index.
- Tests API: PGlite + echte Drizzle-Migrationen (`api.test.ts`), DB+Session per DI injizierbar → Pipeline/Analytics integrationstestbar.
- Kein echtes Log-Korpus im Repo (nur Test-Sample in `battleLogParser.test.ts`).

## Cross-Package-Wiring (packages/shared)
- **`@pokekon/shared`**: pure TS, `composite`, baut nach `dist` (js + d.ts), `exports` → dist. Eigene vitest (testet Source), eigene eslint-flat-config.
- **api** (NodeNext, emit dist, prod `node dist`): TS **project reference** auf shared; `build`/`typecheck` via `tsc -b` (baut shared zuerst, respektiert `rootDir`); Laufzeit/Prod nutzt shared/dist. `apps/api/vitest.config.ts` aliasst `@pokekon/shared` → Source (Tests brauchen kein dist). `dev` prependet shared-Build.
- **web** (bundler, noEmit): tsconfig.app `paths` + Vite/vitest `resolve.alias` `@pokekon/shared` → Source. Kein dist nötig.
- `@pokekon/shared` als dependency in api+web (`*`). Root-`workspaces` ggf. auf `["packages/*","apps/*"]` umsortieren, damit shared in `--workspaces`-Läufen zuerst kommt.

## Schritte
- **B1** packages/shared: Parser + Parsed*-Typen verschieben, Web-Importe auf `@pokekon/shared` umstellen, api konsumiert, Tests mitnehmen. Keine Verhaltensänderung. Gates grün → commit.
- **B2** Board-State im Parser: pro Zug `activePokemon`, `bench` (Namen), `handSize` (ab Starthand 7 ± Draw/Play), `supportersPlayed`, `energyAttached` (Summe, schon da). Neue Marker: Bank-Platzierung, Aktiv-Wechsel, Draw-Zeilen. `PARSER_VERSION`-Konstante. Abgeleitet: `wentFirst`, `setupCleanByTurn2`, `deadTurns`. Tests gegen Sample erweitern.
- **B3** Schema: `metaSnapshots` (unique (period,archetype)), `matchLogParsed` (opponentLogId FK unique, totalTurns, wentFirst, turns jsonb, prizeProgression jsonb, parserVersion, setupCleanByTurn2, deadTurns). `db:generate` + Migration committen. Reiner `event_date`-Index auf opponent_logs.
- **B4** POST /api/logs: nach Insert serverseitig parsen → `match_log_parsed` upsert (parserVersion). Einmal beim Schreiben.
- **B5** `routes/analytics.ts`: GET /api/analytics/deck/:id?weeks=1|2|3|4 → going-first/second-WR, Setup-Quote, Dead-Turn-Rate, Prize-Kurve vs. Sieg-Schnitt. Zeitfenster parametrisiert (`event_date >= now() - $weeks weeks`).
- **B7** Frontend: Analytics-Konsumenten auf neue API; keine neue IndexedDB↔API-Doppelung.
- **B6** LLM provider-agnostisch serverseitig — **zuletzt, vor Live-Schalten rückfragen** (Phase 4). In diesem Durchgang NICHT live schalten.

## Doku (Akzeptanz)
- `docs/database.md` (+ neue Tabellen/Felder), `docs/data-flow.md` (Parse-on-write-Pipeline). `architecture.md` bewusst NICHT anfassen (kollidiert mit PR #10).

## Gates pro Schritt
`typecheck` + `lint` + `test` grün; neue Logik mit Tests (PGlite-Harness für Routen).
