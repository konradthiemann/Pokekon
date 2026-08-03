# Pokékon — Backend-Evolution-Plan

> **Status:** Planungsdokument · Stand 2026-06-16
> **Ziel:** Die Analyse-Logik aus dem Frontend ins bestehende Backend ziehen, schwere Auswertungen nach PostgreSQL verlagern, Deck-Verbesserung daten- und KI-gestützt machen.
> **Entscheidung getroffen:** Bestehendes **TypeScript-Backend** (Hono + Drizzle) erweitern — kein Rewrite. Begründung siehe Abschnitt 2.

---

## 1. Ausgangslage (was heute wirklich existiert)

Das Projekt ist ein npm-Workspace-Monorepo (`pokekon`) mit zwei Apps:

| Bereich | Stack | Zustand |
|---------|-------|---------|
| `apps/web` | React 19 + Vite + Zustand + Dexie (IndexedDB) | Vollständige App, **local-first**. Enthält die gesamte Analyse-Logik. |
| `apps/api` | Hono + Drizzle ORM + PostgreSQL + better-auth | Läuft auf Railway (`/health`). Macht heute **nur CRUD + Auth**. |

Der entscheidende Punkt: Es gibt bereits ein lauffähiges Backend. Was fehlt, ist nicht „ein Backend", sondern dass die *Logik* dort einzieht. Diese Logik liegt aktuell vollständig in `apps/web/src/lib`:

| Datei (Frontend) | Aufgabe | Soll ins Backend? |
|------------------|---------|-------------------|
| `metaFetch.ts` | Limitless-API → Turnier-/Archetyp-Aggregation, schreibt `metaSnapshots` | **Ja** — gehört serverseitig als Job |
| `deckComparison.ts` | Limitless-Decklisten → Kernkarten-Frequenzen, Add/Remove-Vorschläge | **Ja** — datenintensiv, cachebar |
| `deckPerformanceStats.ts` | Aggregiert Battle-Logs → Karten-Performance, Spiellänge, Prize-Effizienz | **Ja** — reine Berechnung über DB-Daten |
| `battleLogParser.ts` | Parst deutsches TCG-Live-Protokoll → strukturierte Züge | **Ja** — einmal beim Speichern parsen, Ergebnis persistieren |
| `battleLogAnalysis.ts` | Claude-API-Analyse eines Logs | **Ja** — API-Key gehört serverseitig, nicht in den Browser |
| `deckImport.ts` | Karten-Typ-Inferenz beim Listen-Import | Teilweise — kann client- oder serverseitig bleiben |

Zusätzlich gibt es eine **Datendoppelung**: Das Web nutzt eine eigene IndexedDB (`apps/web/src/db`) *und* es existiert ein typisierter API-Client (`apps/web/src/lib/api.ts`), der gegen `apps/api` spricht. Die Migration „IndexedDB → API als Quelle der Wahrheit" ist also schon begonnen, aber nicht abgeschlossen. Das Backend-Schema (`apps/api/src/db/schema.ts`) spiegelt die Domänen-Tabellen bereits in Postgres (decks, deck_cards, deck_snapshots, opponent_logs) — `metaSnapshots` existiert serverseitig aber noch **nicht**.

> ✅ *Erledigt (2026-08):* `docs/architecture.md` wurde von der früheren „zero-backend SPA"-Beschreibung auf die reale Hono+Postgres-Architektur (mit serverseitiger, provider-agnostischer LLM-Analyse) umgeschrieben. Der datierte Snapshot dieses Abschnitts (Stand 2026-06-16) bleibt als Ausgangslage stehen.

---

## 2. Sprachwahl: warum TypeScript bleibt (Java/PHP/Python im Vergleich)

Deine Anforderung war „so leichtgewichtig und schnell wie möglich, viele Daten, evtl. langsame Abfragen". Die ehrliche Einordnung:

**Die Performance der schweren Abfragen entscheidet sich nicht in der Programmiersprache, sondern in PostgreSQL.** Aggregationen über Tausende Turnier-/Match-Zeilen macht die Datenbank um Größenordnungen schneller als irgendeine App-Schicht — egal ob Java, PHP, Python oder Node. Die Sprache ist primär der dünne Layer, der SQL absetzt, JSON formt und HTTP bedient. Für diesen I/O-gebundenen Job ist Node/TypeScript exzellent geeignet.

| Kriterium | TypeScript (Ist) | Java/Spring | Python |
|-----------|------------------|-------------|--------|
| Wiederverwendung deiner Logik | **100%** (schon geschrieben) | 0% (Rewrite) | 0% (Rewrite) |
| Eine Sprache im ganzen Stack | **Ja** | Nein | Nein |
| API-Layer-Performance (I/O) | Sehr gut | Sehr gut | Mittel |
| Schwere Daten-Aggregation | → Postgres | → Postgres | → Postgres / pandas |
| KI/ML-Ökosystem | Gut (LLM-SDKs) | Mittel | **Exzellent** |
| Railway-Deploy-Gewicht | Leicht | Schwerer (JVM) | Leicht |
| Portfolio-Wert | Solide | **Hoch** | Hoch |

**Empfehlung:** TS-Backend erweitern. Der „Java fürs Portfolio"-Wunsch ist nachvollziehbar, aber ein Rewrite eines funktionierenden Systems ist hier der teuerste Weg mit dem geringsten Nutzen. Wenn du Java/ein zweites Skill-Set zeigen willst, ist der sauberste Kompromiss **später** ein klar abgegrenzter Service — und der bessere Kandidat dafür ist ohnehin der **KI-/Analytics-Teil in Python** (Phase 4), weil dort das Ökosystem real einen Unterschied macht. Ein gut dokumentiertes TS-Monorepo mit durchdachtem SQL-Datenmodell, Materialized Views, CI und Doku-Viewer ist für sich genommen ein starkes Portfolio-Stück.

---

## 3. Was im Backend ausgewertet werden soll (Metrik-Brainstorm)

Zentrale Frage: „Wie verbessere ich mein Deck?" Dafür braucht es drei Datenquellen, die das Backend zusammenführt:

1. **Externes Meta** (Limitless-Turniere): Was spielen andere, wie gut schneidet es ab?
2. **Externe Matchup-Daten** (TrainerHill-Matrix): Wer schlägt wen?
3. **Deine eigenen getrackten Spiele** (opponent_logs + Battle-Logs): Wie schneidest *du* ab?

Alle Auswertungen sollen über ein **Zeitfenster 1 / 2 / 3 / 4 Wochen** parametrierbar sein (siehe Abschnitt 5).

### 3.1 Archetyp-Performance auf Turnieren
- Frequenz (Meta-Share %) deines Archetyps pro Woche, als Trendlinie über 4 Wochen.
- Turnier-Win-Rate des Archetyps (aus Standings: wins/(wins+losses)).
- Conversion-Rate: Anteil der Piloten, die Tag 2 / Top-Cut erreichen (placing-basiert).
- Sample-Größe pro Datenpunkt (playerCount) — wichtig, um Rauschen von Signal zu trennen.

### 3.2 Kernkarten des Archetyps
- Inklusionsrate jeder Karte (% der Turnierlisten, die sie spielen) — schon in `deckComparison.ts`.
- Durchschnittliche Kopienzahl gesamt vs. in Top-30%-Listen → zeigt, was Top-Spieler anders machen.
- **Tech-Karten-Drift**: Karten, deren Inklusionsrate über die Wochen steigt/fällt → frühes Signal für Meta-Anpassung.
- Abgleich mit *deiner* Liste: `suggestedAdds` (freq ≥ 55%, fehlt dir), `suggestedRemoves` (freq ≤ 20%, spielst du), `countAdjustments` (Kopienzahl-Abweichung ≥ 1).

### 3.3 Gegnerfeld auf Turnieren
- Welche Archetypen tauchen in den Standings auf (Häufigkeitsverteilung).
- Gewichtetes Gegnerfeld: Meta-Share × erwartete Begegnungswahrscheinlichkeit (häufige Decks triffst du öfter).
- Schwingt zusammen mit 3.4.

### 3.4 Meta-Gewichtung & erwarteter Erfolg deines Decks
Das ist die analytisch wertvollste Kennzahl. Kombiniere TrainerHill-Matchup-Matrix mit dem Meta-Share:

```
Erwartete Win-Rate(meinDeck) = Σ_gegner [ MetaShare(gegner) × Matchup-WinRate(meinDeck vs gegner) ]
```

Daraus ableitbar:
- **Field Win Rate**: Wie gut ist dein Deck *gegen das aktuelle Feld* gewichtet (nicht nur 1-vs-1).
- **Worst Matchups gewichtet**: Schlechte Matchups, die zugleich häufig sind = größtes Risiko → Tech-Karten-Priorität.
- **Free Wins**: Gute Matchups mit hohem Meta-Share = warum dein Deck gerade gut positioniert ist.
- **Counterfactual**: Wie würde sich die Field Win Rate ändern, wenn du Archetyp X spielen würdest? (Deck-Auswahl-Hilfe.)

### 3.5 Deine persönliche Performance (aus getrackten Spielen)
Bereits in `deckPerformanceStats.ts`, soll serverseitig laufen:
- Eigene Win-Rate gesamt und **pro Gegner-Archetyp** → wo verlierst *du* (vs. wo verliert der Durchschnitt)?
- Delta „meine Win-Rate vs. Matchup-Erwartung" → identifiziert **Skill-/Listen-Lücken** (Matchup ist eigentlich gut, du verlierst trotzdem → Spielfehler oder Listenproblem).
- Spiellänge (Züge) bei Sieg vs. Niederlage; Turn-1-Aktionen; Low-Activity-Turn-Rate (Anzeichen für Brick-Hände).
- Karten-Performance: Play-Rate, Win-Rate-mit-Karte, Plays/Spiel.
- Prize-Effizienz: Wie nah kam der Gegner bei deinen Siegen / wie nah kamst du bei Niederlagen.
- **Going-first vs going-second** Win-Rate (aus Battle-Log ableitbar) — in Pokémon TCG oft matchup-entscheidend.

### 3.6 Weitere Ideen für die Roadmap
- **Konsistenz-Score** des Decks aus Battle-Logs (Anteil Spiele mit sauberem Setup bis Zug 2).
- **Mulligan-/Dead-Draw-Rate** wenn aus dem Log ableitbar.
- **Trend-Alerts**: „Archetyp X im Gegnerfeld +8% diese Woche, dein Matchup dagegen 38%" → automatische Warnung.
- **Sideboard-/Tech-Empfehlung** rein datengetrieben (vor KI): Karte mit höchster erwarteter Win-Rate-Verbesserung gegen das gewichtete Feld.

---

## 3.7 Spielprotokoll → Zug-Qualität (schlauere Züge, nicht nur Decklisten)

> Bisher zielt fast alles auf die **Liste** ab (`deckComparison`: Karte rein/raus nach Inklusionsrate). Die wertvollere, bisher kaum gehobene Quelle ist das **Spielprotokoll selbst**: Es enthält *Entscheidungen*, nicht nur Karten. Aus dem Log lässt sich ableiten, **wie** gut gespielt wurde — und damit, ob ein Verlust an der Liste oder am Zug lag. Das ist die Grundlage für „schlauere Züge"-Empfehlungen.

Voraussetzung dafür ist, dass der Parser über die heutigen Aggregate (Schaden, KOs, Prizes pro Zug) hinaus eine **Board-State-Rekonstruktion** liefert: pro Zug Hand-/Bank-/aktives-Pokémon, Energie-Stand, gezogene Supporter. Das gehört serverseitig in `match_log_parsed.turns` (jsonb) mit `parserVersion` (Abschnitt 5.2), damit bei Parser-Verbesserungen gezielt neu geparst werden kann.

### 3.7.1 Metriken auf Zug-Ebene
- **Going-first vs. going-second Win-Rate** (aus Münzwurf-Zeile ableitbar) — in PTCG oft matchup-entscheidend. Direkt eine Handlungsempfehlung („gegen Archetyp X immer anfangen/abgeben").
- **Setup-Qualität bis Zug 2**: Hatte man bis Zug 2 Attacker + Energie + Draw-Supporter im Spiel? Anteil „sauberer Starts" bei Sieg vs. Niederlage → trennt Listen-Konsistenz von Spielfehlern.
- **Dead-/Low-Activity-Turns**: Züge mit ~0 sinnvollen Aktionen (Brick-Indikator). Häufung → Konsistenzleck → führt zurück zu einer *Listen*-Empfehlung (mehr Draw/Search).
- **Tempo-Kurve**: Prizes-pro-Zug und KO-Timing. Vergleich der eigenen Prize-Progression gegen die **Durchschnittskurve gewonnener Spiele** desselben Matchups → „Du liegst ab Zug 3 systematisch zurück".
- **Prize-Trade-Effizienz**: Hast du teure (2-/3-Prize-)Pokémon für billige KOs geopfert? Ungünstige Trades als Zeitpunkte markieren.
- **Energie-Effizienz**: verschwendete/abgeworfene Energie, Attach-on-curve-Quote.

### 3.7.2 Muster-Mining (welche Züge korrelieren mit Siegen)
- **Sequencing-Analyse**: Reihenfolge typischer Aktionen (z. B. Draw-Supporter vor/nach Energie-Attach, Suche vor Bank-Aufbau). Über alle Logs die Sequenzen in **gewonnenen vs. verlorenen** Spielen vergleichen → wiederkehrende „gute" und „schlechte" Linien.
- **Entscheidungspunkt-Nachbarschaft**: Board-States als Feature-Vektoren; zu einem aktuellen Zug die ähnlichsten historischen Zustände suchen (Nearest-Neighbor) und zeigen, welche Aktion dort häufiger zum Sieg führte. (Beginnt heuristisch, später ML — passt zu Phase 4 / Python-Service, Abschnitt 6.3.)
- **Matchup-spezifische Spielmuster**: „Gegen Archetyp X verlierst du fast nur in langen Spielen (>Zug N)" → konkrete Strategie-Empfehlung (aggressiver/schneller Plan).

### 3.7.3 KI-Zugkritik (grounded, nicht spekulativ)
Der bestehende `battleLogAnalysis.ts` hat bereits starke **Anti-Halluzinations-Maßnahmen** (Evidence-Quotes müssen wörtlich im Log stehen, temperature=0, nur Karten vorschlagen, die im Log auf der Hand sichtbar waren). Diese Basis serverseitig erweitern: dem LLM nicht nur den Rohlog, sondern den **rekonstruierten Board-State pro Zug** geben und gezielt fragen „In Zug N lag Hand H vor, gespielt wurde A — gab es eine nachweislich stärkere Linie?". Jede Kritik bleibt an einen Evidence-Quote gebunden; ohne Beleg wird der Punkt verworfen.

### 3.7.4 Abgrenzung zur Listen-Empfehlung
Wichtig fürs Produkt: Das Backend soll am Ende **zwei Hebel** unterscheiden können —
1. **Liste** (`deckComparison` + Field-Win-Rate, Abschnitt 3.2/3.4): „Tausche Karte aus."
2. **Spiel** (dieser Abschnitt): „Spiele diesen Zug anders."

Das Delta „mein Win-Rate vs. Matchup-Erwartung" (Abschnitt 3.5) ist der Trigger, der entscheidet, welcher Hebel angezeigt wird: Matchup gut, du verlierst trotzdem → Spiel-/Sequencing-Hinweis statt Karten-Tausch.

### 3.7.5 Daten- & Roadmap-Konsequenzen
- `match_log_parsed` muss Board-State pro Zug halten (nicht nur Damage/Prizes) — Schema in 5.2 entsprechend erweitern.
- `wentFirst`, `setupCleanByTurn2`, `deadTurns`, `prizeCurve` als materialisierte Felder/MV für schnelle Lesezugriffe.
- Einordnung in die Umsetzungsreihenfolge: Datenerfassung in **Phase 2** (Parser serverseitig), Muster-Mining/KI-Zugkritik in **Phase 4** (nach den aggregierten Insights).

---

## 4. Auswertung der getrackten Spiele (Pipeline)

Heute steckt der rohe Battle-Log als Text in `opponent_logs.battleLog`, das Parsen passiert bei jedem Render im Browser. Besser:

```
Eingabe (Battle-Log-Text)
   → [POST /api/logs]  Log speichern
   → [Parser-Schritt]  battleLogParser serverseitig: Züge, Karten, Prize-Verlauf
   → persistiere strukturiertes Ergebnis (neue Tabelle match_log_parsed, siehe 5.2)
   → [Aggregations-Schritt]  Materialized Views / On-write-Update der Kennzahlen
   → optional: [KI-Schritt] battleLogAnalysis (Claude) asynchron, Ergebnis cachen
```

Prinzip: **einmal parsen beim Schreiben, nicht bei jedem Lesen.** Die teure Arbeit (Parsen, KI-Analyse) passiert einmal und wird persistiert; Lese-Abfragen treffen nur fertige Aggregate. Das ist der eigentliche Performance-Gewinn — nicht die Sprache.

---

## 5. Datenbank: wie ein DB-Entwickler erweitern würde

Leitlinien: **normalisieren wo abgefragt wird, denormalisieren/aggregieren wo gelesen wird.** Konkret:

### 5.1 `meta_snapshots` ins Backend bringen (fehlt serverseitig)
Existiert nur in der IndexedDB. Als Postgres-Tabelle mit Compound-Index auf `(period, archetype)`:

```ts
export const metaSnapshots = pgTable('meta_snapshots', {
  id: serial('id').primaryKey(),
  archetype: text('archetype').notNull(),
  frequencyPct: real('frequency_pct').notNull(),
  winRatePct: integer('win_rate_pct'),          // nullable: keine entschiedenen Spiele
  wins: integer('wins').notNull(),
  losses: integer('losses').notNull(),
  playerCount: integer('player_count').notNull(),
  period: text('period').notNull(),              // ISO-Woche "2026-W15"
  sourceNote: text('source_note').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('meta_period_archetype_uq').on(t.period, t.archetype),
  index('meta_archetype_idx').on(t.archetype),
]);
```

### 5.2 Neue Tabellen

**`match_log_parsed`** — strukturiertes Ergebnis des Battle-Log-Parsers (1:1 zu `opponent_logs`):
- `opponentLogId` (FK, unique), `totalTurns`, `wentFirst` (bool), `turns` (jsonb), `prizeProgression` (jsonb), `parserVersion` (int — wichtig, um bei Parser-Updates gezielt neu zu parsen).

**`tournaments`** + **`tournament_standings`** — rohe Limitless-Daten persistieren statt nur aggregieren. Erlaubt beliebige spätere Auswertungen ohne erneutes Abrufen:
- `tournaments`: `id` (Limitless-ID, PK als text), `name`, `date`, `players`, `format`, `isOnline`, `fetchedAt`.
- `tournament_standings`: `tournamentId` (FK), `archetypeId`, `archetypeName`, `placing`, `wins`, `losses`, `ties`, `decklist` (jsonb, optional). Index auf `(tournamentId, archetypeId)`.

**`matchup_matrix`** — TrainerHill-CSV strukturiert statt statisch im Frontend:
- `deck1`, `deck2`, `wins`, `losses`, `ties`, `total`, `winRate`, `importedAt`. PK `(deck1, deck2, importedAt)` für Historie.

**`archetype_card_stats`** (optional, als Cache) — Ergebnis von `deckComparison` pro Archetyp+Zeitraum, damit Limitless nicht bei jedem Aufruf befragt wird. TTL über `computedAt`.

### 5.3 Decklisten normalisieren?
`deck_snapshots.cards` ist heute jsonb — für *deine eigenen* Decks völlig ok (wenige Zeilen, immer als Ganzes gelesen). Für **Turnier-Decklisten** (Tausende, du willst „Karte X über alle Listen aggregieren") ist eine separate normalisierte Tabelle `standing_cards (standingId, cardName, count)` sinnvoll, weil du über Karten *hinweg* aggregierst. Faustregel: jsonb wenn immer als Blob gelesen, normalisiert wenn quer abgefragt.

### 5.4 Zeitfenster 1/2/3/4 Wochen
Nicht pro Anfrage neu rechnen. Zwei Bausteine:
- **Parametrisierte Query**: `WHERE event_date >= now() - ($weeks || ' weeks')::interval`. Index auf `opponent_logs(event_date)` existiert teilweise (`archetype_eventDate_idx`) — ergänzen um reinen `event_date`-Index.
- **Materialized Views** für die teuren, häufig gelesenen Aggregate (z.B. `mv_meta_4w`, `mv_my_matchups_4w`), per Cron (Abschnitt 6) oder `REFRESH MATERIALIZED VIEW CONCURRENTLY` nach jedem Meta-Sync aktualisiert. Lesezugriffe sind dann konstant schnell, unabhängig vom Datenvolumen.

### 5.5 Migrations-Workflow
Drizzle-Kit ist schon konfiguriert (`drizzle.config.ts`, `db:generate`, `db:migrate`). Workflow bleibt: Schema in `schema.ts` ändern → `npm run db:generate -w @pokekon/api` → Migration committen → `db:migrate` läuft im Railway-Deploy (Pre-Deploy-Command). Views/MVs als eigene SQL-Migrationsdateien danebenlegen.

---

## 6. Architektur & Jobs (Logik aus dem Frontend ziehen)

### 6.1 Neue Backend-Struktur
```
apps/api/src/
  routes/
    decks.ts, logs.ts, snapshots.ts        (bestehend)
    meta.ts          → GET /api/meta?weeks=4           (liest meta_snapshots / MV)
    analytics.ts     → GET /api/analytics/deck/:id?weeks=4   (Performance, Field-WR)
    comparison.ts    → GET /api/comparison/:archetype       (Kernkarten, Add/Remove)
    matchups.ts      → GET /api/matchups                    (Matrix + gewichtetes Feld)
  jobs/
    syncMeta.ts      → portiert metaFetch.ts (Limitless → tournaments/standings/meta_snapshots)
    importMatchups.ts→ TrainerHill-CSV einlesen
  lib/
    battleLogParser.ts   (portiert, geteilt)
    deckComparison.ts    (portiert)
    deckPerformanceStats.ts (portiert)
    fieldWinRate.ts      (neu: Meta × Matchup-Gewichtung, Abschnitt 3.4)
  ai/
    analyzeBattleLog.ts  (portiert, API-Key serverseitig)
```

Tipp: Logik, die Frontend *und* Backend brauchen (Typen, evtl. Parser), in ein `packages/shared` ziehen — der Workspace ist dafür schon vorbereitet (`"workspaces": ["apps/*", "packages/*"]`).

### 6.2 Sync als Job statt Browser-Aktion
Heute triggert der User den Meta-Sync im Browser. Serverseitig wird das ein **Cron-Job** (z.B. täglich), der Limitless abruft, `tournaments`/`standings`/`meta_snapshots` schreibt und die MVs neu berechnet. Vorteile: kein CORS-Proxy nötig (Server hat keine CORS-Beschränkung — `corsproxy.io` entfällt), konsistente Daten für alle, keine Wartezeit im UI.

### 6.3 KI-Roadmap (gestuft)
1. **Phase A — LLM-Analyse serverseitig (kurzfristig):** `battleLogAnalysis` ins Backend, API-Key als Railway-Secret. Anti-Halluzinations-Maßnahmen aus dem bestehenden Code (Evidence-Quotes, temperature=0) beibehalten.
   ✅ *Umgesetzt (2026-08):* `POST /api/analysis/log` nutzt einen **provider-agnostischen** Adapter (`apps/api/src/ai/`, Default GitHub Models `openai/gpt-4.1`). Statt eines globalen Railway-Keys wird ein **per-User-BYOK-Key** AES-256-GCM-verschlüsselt in `user_ai_settings` gespeichert und nur serverseitig entschlüsselt; die Anti-Halluzination (Evidence-Quotes, `temperature=0`, JSON-only) liegt in der geteilten Engine `@pokekon/shared`.
2. **Phase B — Aggregierte KI-Insights:** LLM bekommt nicht einen Log, sondern die aggregierten Kennzahlen aus Abschnitt 3 und formuliert konkrete Listen-/Spielempfehlungen („gegen das aktuelle Feld -1 Karte X, +1 Y, weil…").
3. **Phase C — eigenes ML (optional, Portfolio):** Hier wäre ein **Python-Service** sinnvoll (Matchup-Vorhersage, Win-Rate-Regression über Listenfeatures). Konsumiert dieselbe Postgres-DB, kein Eingriff ins TS-Backend.

---

## 7. Railway & Tooling

**Ja, alles bleibt auf Railway.** Empfohlenes Setup:

- **PostgreSQL-Plugin** auf Railway (managed) als `DATABASE_URL`-Service. (Vermutlich schon vorhanden, sonst ergänzen.)
- **API-Service**: bestehendes Deploy. `railway.json` ergänzen um **Pre-Deploy-Command** für Migrationen: `npm run db:migrate -w @pokekon/api`.
- **Cron**: Railway unterstützt Scheduled Services / Cron — den Meta-Sync-Job als eigenen Cron-Service (`startCommand: node dist/jobs/syncMeta.js`) mit Schedule (z.B. `0 6 * * *`).
- **Secrets**: `DATABASE_URL`, better-auth-Secrets und `ENCRYPTION_KEY` (verschlüsselt die per-User-LLM-Keys) als Railway-Variablen — nicht im Browser. Die LLM-Analyse nutzt inzwischen **per-User-BYOK-Keys** statt eines globalen Provider-Keys (kein globaler `ANTHROPIC_API_KEY` mehr).
- Hilfreiche Tools: **Drizzle Studio** (`drizzle-kit studio`) für DB-Inspektion lokal; Railway-Metrics für Query-Last; ggf. **pg_stat_statements** aktivieren, um langsame Queries zu finden, bevor du Indizes/MVs optimierst.

---

## 8. Dokumentations-Viewer (parallel, CI-aktuell)

**Entscheidung getroffen: Astro Starlight, gehostet auf GitHub Pages — komplett kostenlos.**

Du hast bereits gepflegte Markdown-Docs unter `docs/`. Starlight wurde gegenüber VitePress gewählt, weil es genau deine Anforderungen out of the box erfüllt: **automatische Sidebar/Hierarchie** aus der Ordnerstruktur, **Volltextsuche**, saubere **Cross-Links** zwischen `.md`-Dateien und Mermaid-Support. VitePress wäre minimaler, müsste aber für Suche/Sidebar mehr handkonfiguriert werden.

**Kostenfrage — ja, vollständig gratis:** GitHub Pages ist für öffentliche Repos kostenlos, für private Repos im kostenlosen Plan ebenfalls nutzbar. Kein Railway-Static-Service nötig, kein zusätzlicher Hosting-Posten. Der Build läuft in GitHub Actions (im Free-Tier großzügig bemessen).

Konkrete Umsetzung (Details im Implementierungs-Prompt, `docs/prompts/`):
- Als dritte App **`apps/docs`** im Workspace (`@pokekon/docs`), Astro + `@astrojs/starlight`. Liest die Markdown direkt aus `docs/` (per Symlink/Glob oder `src/content/docs`-Mapping), damit die Quelle der Wahrheit das bestehende `docs/`-Verzeichnis bleibt.
- **Hierarchie & Verlinkung**: `astro.config.mjs` definiert die Sidebar-Gruppen (Architektur, Daten, KI-System, Backend-Evolution, Getting Started). Relative `./datei.md`-Links zwischen Docs funktionieren in Starlight nativ — d. h. das vom dir gewünschte „Verzeichnis mit .md-Files, gut verlinkt und hierarchisch" ist exakt das Modell.
- **Mermaid-Diagramme** (in `architecture.md`, `agents.md`, neu `ai-system.md`) via `astro-mermaid` o. ä. rendern.
- **CI-Deploy bei Push auf `main`**: separater Workflow `.github/workflows/docs.yml` (getrennt von `ci.yml`), Trigger `on: push: branches: [main], paths: ['docs/**','apps/docs/**']`. Baut Starlight und deployt mit `actions/deploy-pages`. Damit ist die Doku **automatisch beim Merge aktuell** — genau dein Wunsch.
- **Auto-Aktualität für die API**: API-Routen mit Zod-Schemas → **OpenAPI-Spec** generieren (`@hono/zod-openapi`) und im Viewer einbetten. So kann die API-Doku nicht veralten, weil sie aus dem Code kommt.
- **Pflicht-Erstaufgabe**: `docs/architecture.md` von „zero-backend SPA" auf die Hono+Postgres-Realität umschreiben ✅ *erledigt (2026-08)*; `docs/ai-system.md` (neu, siehe Abschnitt 8a) in die Sidebar aufnehmen.

---

## 8a. KI-System-Governance (Leitplanken für Agents & Coding-Assistenten)

Parallel zum Daten-/Backend-Umbau wird die **AI-System-Umgebung** des Repos formalisiert (in dieser Session bereits angelegt):

- **`CLAUDE.md` (Repo-Root)** — die „Verfassung": Golden Rules, Workflow, Quality-Gates, Hard-Constraints (free-only, Secrets serverseitig, read-before-write, Tests/Lint grün vor „fertig"). Gilt für jeden KI-Assistenten, der im Repo arbeitet.
- **`.claude/commands/`** — wiederverwendbare Prompt-Bausteine (`/feature`, `/review`, `/port-to-backend`, `/docs-sync`), die die Standard-Flows operationalisieren.
- **`docs/ai-system.md`** — die menschenlesbare Doku des gesamten KI-Systems mit Diagrammen (Schichtenmodell, Agent-Roster, Orchestrierung, Memory). Wird im Starlight-Viewer mitgerendert.
- Bestehend bleiben: `.claude/agents/` (11 Agents) und `.claude/agent-memory/`.

---

## 9. Umsetzungsreihenfolge (Vorschlag)

| Phase | Inhalt | Ergebnis |
|-------|--------|----------|
| **0** | `meta_snapshots` + neue Tabellen ins Drizzle-Schema, Migrationen | DB bereit |
| **1** | `metaFetch` → `jobs/syncMeta.ts`, Limitless-Daten persistieren, Cron auf Railway | Server ist Meta-Quelle |
| **2** | Battle-Log-Parsing serverseitig + `match_log_parsed`, `analytics.ts`-Route | Eigene Performance aus DB |
| **3** | `deckComparison` + `matchups` + `fieldWinRate` als Routen, MVs | Deck-Verbesserungs-Insights |
| **4** | KI-Analyse serverseitig (Phase A), dann aggregierte Insights (Phase B) | KI-gestützte Empfehlungen |
| **5** | `apps/docs` (**Astro Starlight**) + GitHub-Pages-CI + OpenAPI | Lebende Doku (kostenlos) |
| **parallel A** | Frontend von IndexedDB auf API umstellen (Migration abschließen) | Eine Quelle der Wahrheit |
| **parallel B** | KI-System-Governance: `CLAUDE.md`, `.claude/commands/`, `docs/ai-system.md` | Leitplanken dokumentiert |

> **Hinweis zu Phase 2:** Der serverseitige Battle-Log-Parser muss bereits die **Board-State-Rekonstruktion** (Abschnitt 3.7) mitliefern, sonst sind die Zug-Qualitäts-Metriken später nicht ableitbar, ohne erneut zu parsen. Mining/KI-Zugkritik selbst kommt erst in Phase 4.

---

## 10. Offene Entscheidungen (für dich)
- **Cron-Frequenz** des Meta-Syncs (täglich reicht meist; Turniere finden v.a. am Wochenende statt).
- **Matchup-Daten**: TrainerHill hat kein offenes API — bleibt es bei manuellem CSV-Import, oder willst du aus den eigenen `tournament_standings` eine eigene Matchup-Matrix aufbauen (unabhängig von TrainerHill, dafür kleinere Stichprobe)?
- ~~**Doku-Viewer-Tool**: Starlight vs. VitePress.~~ → **Entschieden: Astro Starlight auf GitHub Pages** (Abschnitt 8).
- **Frontend-Migration**: IndexedDB ganz aufgeben (reines Server-Modell) oder als Offline-Cache behalten (local-first bleibt erhalten, Server ist Sync-Ziel)?
- **Zug-Qualität (Abschnitt 3.7)**: Wie tief soll die Board-State-Rekonstruktion gehen — reicht Hand-/Bank-/Aktiv-Ebene, oder willst du auch Energie-Zuordnung pro Pokémon (aufwändiger zu parsen)?
