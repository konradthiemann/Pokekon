# Plan: Online-Bo1-Meta — Ground-Truth-Klassifikation, Tage-Fenster & lokale Prediction

## Context

Der Nutzer analysiert **lokale, kleine Turniere** (League Challenges/Cups), die in den Swiss-Runden
**Best-of-One (Bo1)** gespielt werden. Seine Hypothese: Die **Online-Turnier-Meta** (Limitless,
ebenfalls Bo1-Swiss) repräsentiert diese lokalen Bo1-Felder besser als die großen IRL-**Bo3**-Regionals,
an denen sich Limitless-Labs/TrainerHill primär orientieren. Er will daraus als *Datenanalyst*
Metashare, Deck-Detailanalysen, Matchup-Performance und eine **Prediction für seine lokale Meta** ziehen —
und legt Wert auf **100 % korrekte Werte** (keine still fehlklassifizierten Zahlen).

Das Repo hat bereits ein **fertiges, grünes** (typecheck/lint/test ✓) Archetyp-Drilldown-Feature
(Migration 0005, Matchup-Matrix, Feld-Score `computeFieldScores`, Metashare-Tabelle) — aber uncommittet
auf `chore/repo-hygiene`. Drei Lücken bleiben gegenüber dem Ziel:

1. **Online/Bo1-Fokus fehlt.** `tournaments.isOnline` wird geschrieben (via unzuverlässiger Namens-
   heuristik `isLikelyOnlineName`), aber **nie gelesen**; der Sync nimmt sogar die **6 größten** Events
   (`syncMeta.ts:114`) → tendenziell IRL-Bo3-lastig. Die gesamte Analyse mischt Online+Offline.
2. **Zeitfenster nur in Wochen 1–4**, nicht frei in Tagen.
3. **Keine lokale-Meta-Prediction.**

## Recherche-belegte Grundlage (Quellen: Limitless Developer Docs, Pokémon.com)

- ✅ Limitless liefert pro Turnier unter `GET /api/tournaments/{id}/details` ein **echtes Boolean
  `isOnline`**, `platform` (z. B. `"PTCGL"`) und `phases[].mode` (`"BO1"`/`"BO3"`). Damit ist eine
  **Ground-Truth-Klassifikation** möglich — keine Namensheuristik nötig.
- ⚠️ Diese Felder fehlen im **Listen-Endpunkt** (`/api/tournaments?game=PTCG` → nur id/name/date/players/
  format). Klassifikation erfordert **einen `/details`-Call pro Turnier**.
- ✅ Lokale League Challenges/Cups laufen laut Pokémon.com **Bo1-Swiss** → strukturell identisch zur
  Online-Bo1-Swiss. Die Hypothese ist **strukturell belegt, empirisch unbewiesen** (Caveat im UI).
- ✅ Unsere Definitionen stimmen bereits mit Limitless überein: Metashare = % Piloten (`computeMetaSnapshots`),
  Win-Rate = W/(W+L) ohne Ties. Keine Änderung nötig.
- ⚠️ TrainerHill-Matrix ist vermutlich **gemischtes Format** (Bo1+Bo3, Match-Ebene, undokumentiert).

## Entscheidungen (vom Nutzer bestätigt)

1. **Matchup-Quelle: dauerhaft nur TrainerHill.** Keine eigene Bo1-Matrix aus Pairings. → Der
   Online/Bo1-Fokus greift auf der **Metashare-/Standings-Seite** (Ground Truth); die Matchup-Matrix
   bleibt extern, mit **explizitem „gemischtes-Format"-Hinweis** im UI.
2. **Git: bestehenden Drilldown-WIP zuerst sauber committen** (eigener Feature-Branch + PR), dann die
   neuen Increments darauf.
3. **Prediction: ephemer im Browser (localStorage).** → Berechnung **client-seitig** mit dem bereits
   getesteten `computeFieldScores` aus `@pokekon/shared`; **keine neue Route, keine Tabelle**.

---

## Increment 0 — Drilldown-WIP sauber committen (Git)

- Erst exakten Stand prüfen (`git log`, `git diff --cached`, untracked), Meta-Feature-Dateien von den
  reinen Hygiene-Dateien (`.github/copilot-instructions.md`, `.claude/agent-memory/…`) trennen.
- Feature-Branch `feat/meta-archetype-drilldown` von `main`; die Drilldown-Arbeit (Migration 0005,
  `matchupMatrix`/`tournaments`/`tournamentStandings`, `fieldWinRate.ts`, `matchupCsv.ts`, Routen
  `matchups.ts`/`meta.ts`, Web-Komponenten `components/meta/*`) als kohärente Commit(s) + PR.
- Gates sind bereits grün → nur committen, nicht neu bauen. Commit-Message-Footer: `Co-Authored-By: …`.
- Node 22 vor `git commit` (`nvm use 22`) — sonst crasht der husky-Hook (Memory: `commit-needs-node-22`).

## Increment 1 — Ground-Truth Online/Bo1-Klassifikation (Sync + Schema)

**Schema — Migration 0006** (`apps/api/src/db/schema.ts`, dann `npm run db:generate -w @pokekon/api`):
- `tournaments.swissMode text` (nullable, `'BO1'|'BO3'|'OTHER'`), `tournaments.platform text` (nullable).
- Beide nullable → Bestandszeilen aus 0005 bleiben gültig; nächster Sync backfillt.

**Shared — reine, getestete Klassifikation** (`packages/shared/src/meta.ts`, Muster wie `pruneDecklist`):
- `classifyTournamentDetails(raw: unknown): { isOnline: boolean; platform: string | null; swissMode: 'BO1'|'BO3'|'OTHER'|null }`
  — validiert die untrusted `/details`-Antwort defensiv (length-caps, enum-Whitelist), liest
  `phases[0].mode`. Tests daneben (`meta.test.ts`), inkl. Fallback bei fehlenden Feldern.

**Sync** (`apps/api/src/jobs/syncMeta.ts`):
- Pro Kandidat (post-rotation, im Fenster, ≥ minPlayers) zusätzlich `/api/tournaments/{id}/details`
  holen → `classifyTournamentDetails`. **Auswahl = `isOnline && swissMode==='BO1'`**, nach `players`
  desc, Cap höher (Online-Events sind kleiner/häufiger: Fenster 30 Tage, `minPlayers≈16`, Cap ≈ 20).
- Echtes `isOnline`/`platform`/`swissMode` persistieren (nicht mehr die Namensheuristik). **Fallback**:
  scheitert `/details`, → `isLikelyOnlineName` für `isOnline`, `swissMode=null` (aus Bo1-Filter
  konservativ ausgeschlossen). Höfliches Pacing/Cap für die zusätzlichen Requests.
- `POST /api/meta/sync` (`routes/meta.ts`) ruft mit den breiteren Defaults auf.

## Increment 2 — Tage-Zeitfenster + Online-Filter (Read-Routen & UI)

**Wichtig:** `analyticsQuerySchema` (weeks 1–4) NICHT global ändern — sie wird auch von der **persönlichen**
Deck-Analytics-Route benutzt (`routes/analytics.ts:22`, out of scope). Stattdessen:

- `validation.ts`: neues `metaWindowQuerySchema` = `{ days: int 1..180 default 30, online: bool default true,
  bo1: bool default true }`; `archetypeListsQuerySchema` um dieselben Felder erweitern (behält limit/offset).
- `lib/timeWindow.ts`: `windowStartDays(days: number): Date` ergänzen (die Wochen-Helfer bleiben unangetastet).
- `routes/meta.ts`: `loadWindowAggregates`/`loadFieldScores`/lists/analysis auf `days` umstellen und den
  Filter erweitern: `and(gte(tournaments.date, windowStartDays(days)), online? eq(tournaments.isOnline,true):…,
  bo1? eq(tournaments.swissMode,'BO1'):…)`. `field-analysis` liefert weiterhin `tournamentCount`/`totalPlayers`/
  `coveragePct` (für Sample-Size-Transparenz).
- `apps/web/src/lib/api.ts`: `getFieldAnalysis`/`getArchetypeAnalysis`/`getArchetypeLists` von `weeks` auf
  `days` + `online`/`bo1` umstellen; Wire-Typen anpassen.
- `MetaPage.tsx` + `components/meta/ArchetypeDetail.tsx`: **Tage-Auswahl** (Presets 7/14/30/60 + optionales
  Zahlenfeld) und **Online/Bo1-Toggle (Default an)** statt Wochen-Dropdown; die Feld-Analyse nutzt das
  gewählte Fenster statt des hartkodierten `getFieldAnalysis(4)` (`MetaPage.tsx:510`). Vorhandenes
  `onlineOnly`-Checkbox-Muster aus „Recent Tournaments" wiederverwenden.
- i18n `de/en meta.json`: Tage-/Online-Labels + Caveats (s. u.).

## Increment 3 — Lokale-Meta-Prediction (client-seitig)

- Reuse pur: `computeFieldScores(shares, matchups)` aus `@pokekon/shared` (bereits getestet,
  `fieldWinRate.test.ts`) + `getMatchups()`-Rows (`api.ts`).
- Neue Komponente `apps/web/src/components/meta/PredictionPanel.tsx` (im Meta-Tab):
  - **Lokales Feld bauen:** Archetypen wählen (Picker aus Matchup-Decks + aktueller Online-Meta),
    Gewichte vergeben; **„Aus Online-Meta vorbefüllen"** (operationalisiert die These online≈lokal),
    Gewichte werden zu Shares normalisiert (Summe 100 %).
  - **Ausgabe:** `computeFieldScores` über die lokalen Shares → gerankte Feld-Win-Rate je Deck im Feld
    („in *deiner* lokalen Meta am besten positioniert"), inkl. Threats/Free-Wins. **FieldScorePanel/
    ThreatsPanel wiederverwenden** (identische `FieldScore`-Form). Optional-Erweiterung: ein Deck testen,
    das nicht im Feld ist (Share 0).
- Persistenz: `lib/preferences.ts` um Key `tcg-local-meta-field-v1` (Array `{archetypeId, name, weight}`)
  ergänzen; bestehendes `localMeta` (nur Namen) bleibt unangetastet, kann als Seed dienen.
- i18n `de/en`.

## Korrektheit & Ehrlichkeit (Kern der „100 %"-Vorgabe)

- **Sample-Size sichtbar:** `tournamentCount`, `totalPlayers`, `coveragePct` prominent; Badge „geringe
  Datenbasis" bei `coveragePct < 40` (bereits in `FieldScorePanel`) und bei kleinem `totalPlayers`.
- **Drei Caveats als i18n-Texte** an den passenden Panels:
  1. Metashare/Win-Rate = reine **Online-Bo1**-Turniere, Ground-Truth-klassifiziert (`isOnline`+`phases.mode`).
  2. Matchup-Matrix = externe **TrainerHill**-Daten, **gemischtes Format** (Bo1+Bo3) → als Näherung lesen.
  3. Repräsentativität Online-Bo1 ↔ lokale Cups: **strukturell begründet, nicht empirisch bewiesen**.
- **Reviews:** `code-review-agent` (neuer Code) + `security-agent` (neue externe Datenpfade: `/details`-
  Parsing, Prediction-Input) vor Merge.
- **Doku:** `docs/backend-evolution-plan.md` §10 (Matchup-Entscheidung = TrainerHill; Klassifikation via
  `/details`), `docs/database.md` (neue Spalten), `docs/features.md` §15 (Online/Bo1-Fokus, Tage-Fenster,
  Prediction), Repo-Kopie dieses Plans nach `.claude/plans/`.

## Verifikation

- **Unit:** `packages/shared` — `classifyTournamentDetails`-Tests; bestehende `fieldWinRate`/`meta`-Tests grün.
- **API (`apps/api/src/api.test.ts`, PGlite + echte Migrationen):** online+offline Turniere seeden und
  prüfen, dass `days`/`online`/`bo1`-Filter korrekt greifen (nur Bo1-Online in Aggregat); 404/Empty-States.
- **E2E (preview_* Tools):** Sync ausführen → Online/Bo1-Toggle & Tage ändern → Metashare/Feld-Score
  plausibel; lokales Feld bauen + „aus Online vorbefüllen" → Prediction-Ranking; Screenshots als Beleg.
- **Gates (Node 22):** `npm run typecheck && npm run lint && npm run test` workspace-weit grün.

## Out of scope (bewusst)

- Eigene Bo1-Matchup-Matrix aus Limitless-Pairings (Nutzer-Entscheidung: TrainerHill bleibt).
- Persönliche Deck-Analytics (`routes/analytics.ts`) — bleibt Wochen-basiert, unangetastet.
- Server-seitige gespeicherte Prediction-Szenarien / Railway-Cron für den Sync (spätere Option).
