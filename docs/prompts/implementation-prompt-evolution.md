# Implementierungs-Prompt für den Coding-Agent

> Kopiere den Block unten in deinen Coding-Agent (Claude Code o. ä.), der Schreibzugriff auf das `pokekon`-Repo hat. Er deckt die zwei Bausteine ab, die echten Code brauchen: **(A) den Doku-Viewer** und **(B) die Battle-Log-Backend-Pipeline mit Zug-Qualität**. Die KI-System-Governance (CLAUDE.md, `.claude/commands/`, `docs/ai-system.md`) ist bereits angelegt — der Agent soll sie nur respektieren, nicht neu erstellen.

---

````text
Du arbeitest im Monorepo `pokekon` (npm workspaces: apps/web, apps/api, geplant apps/docs).
Halte dich verbindlich an CLAUDE.md (Repo-Root) und docs/backend-evolution-plan.md.
Goldene Regeln: erst lesen dann ändern · kostenlos bleiben · Secrets serverseitig · eine Quelle der
Wahrheit · typecheck+lint+test müssen grün sein · Anti-Halluzination der KI-Analyse erhalten · Doku
folgt dem Code. Arbeite in kleinen PRs, einer pro Abschnitt unten. Vor jeder nicht-trivialen Änderung
einen kurzen Plan in .claude/plans/ ablegen.

────────────────────────────────────────────────────────
BAUSTEIN A — Doku-Viewer (Astro Starlight → GitHub Pages, kostenlos)
────────────────────────────────────────────────────────
Ziel: docs/*.md werden als durchsuchbare, hierarchisch verlinkte Doku-Site gerendert und bei jedem
Push auf main automatisch und kostenlos auf GitHub Pages deployt.

A1. Lege apps/docs als Workspace-Paket @pokekon/docs an: Astro + @astrojs/starlight.
    - Quelle der Wahrheit bleibt das bestehende docs/-Verzeichnis. Mappe es nach
      apps/docs/src/content/docs (Symlink ODER ein Sync-Step im Build, der docs/ hineinkopiert —
      keine Doppelpflege, docs/ bleibt führend).
    - Mermaid-Rendering aktivieren (z. B. astro-mermaid oder rehype-mermaid).
A2. astro.config.mjs: Sidebar-Gruppen explizit oder per autogenerate aus der Ordnerstruktur:
      Getting Started · Architektur · Datenmodell (database, data-types, data-flow) ·
      KI-System (ai-system, agents) · Backend-Evolution · Features.
    - site/base passend für GitHub Pages setzen (Repo-Subpfad beachten).
A3. Workflow .github/workflows/docs.yml (getrennt von ci.yml):
      on: push: branches: [main], paths: ['docs/**','apps/docs/**','.github/workflows/docs.yml']
      Steps: checkout · setup-node · npm ci · npm run build -w @pokekon/docs ·
             actions/upload-pages-artifact · actions/deploy-pages.
      Permissions: pages: write, id-token: write. Concurrency-Group setzen.
    - In den Repo-Settings GitHub Pages auf "GitHub Actions" als Source stellen (im PR-Text vermerken).
A4. Pflicht-Inhaltsfix: docs/architecture.md von "zero-backend SPA" auf die reale
    Hono+Postgres-Architektur umschreiben (siehe evolution-plan Abschnitt 1). docs/README.md
    "Quick orientation" entsprechend korrigieren. ai-system.md ist bereits vorhanden — nur in die
    Sidebar aufnehmen.
A5. (Optional, wenn Zeit) OpenAPI aus den Zod-Schemas der API generieren (@hono/zod-openapi) und im
    Viewer einbetten, damit die API-Doku nicht veralten kann.
Akzeptanz: lokal `npm run dev -w @pokekon/docs` zeigt alle docs mit funktionierender Suche, Sidebar,
auflösenden Cross-Links und gerenderten Mermaid-Diagrammen; docs.yml deployt erfolgreich auf Pages;
keine bezahlten Dienste.

────────────────────────────────────────────────────────
BAUSTEIN B — Battle-Log-Backend-Pipeline + Zug-Qualität (Plan Abschnitte 4, 5, 3.7)
────────────────────────────────────────────────────────
Ziel: Spiel-Logs werden einmal beim Schreiben serverseitig geparst und so persistiert, dass spätere
Zug-Qualitäts-Analysen ("schlauere Züge", nicht nur Decklisten) ohne erneutes Parsen möglich sind.

B1. packages/shared anlegen und den reinen Parser + geteilte Typen aus
    apps/web/src/lib/battleLogParser.ts dorthin ziehen (Web UND API importieren daraus, keine
    Duplikation). Bestehende Tests mitnehmen/erweitern. Der Parser ist deutschsprachig — Sprach-
    annahmen beibehalten, mit echten Logs testen.
B2. Parser um BOARD-STATE-REKONSTRUKTION erweitern (Plan 3.7): pro Zug zusätzlich
    aktives Pokémon, Bank, Handgröße/-inhalt soweit ableitbar, Energie-Stand, gezogene Supporter.
    Versioniere mit parserVersion (Konstante, bei Logikänderung erhöhen).
B3. Drizzle-Schema (apps/api/src/db/schema.ts) erweitern:
    - meta_snapshots (fehlt serverseitig — siehe Plan 5.1, unique (period, archetype)).
    - match_log_parsed: opponentLogId FK unique, totalTurns, wentFirst bool, turns jsonb (mit
      Board-State), prizeProgression jsonb, parserVersion int,
      plus abgeleitete Felder setupCleanByTurn2 bool, deadTurns int.
    Danach: npm run db:generate -w @pokekon/api, Migration committen.
B4. Pipeline beim Speichern eines Logs (POST /api/logs erweitern): Log speichern → serverseitig
    parsen → match_log_parsed schreiben. Einmal beim Schreiben rechnen, nicht beim Lesen.
B5. Route analytics.ts: GET /api/analytics/deck/:id?weeks=1|2|3|4 — liefert aus den geparsten Daten
    die eigene Performance inkl. der Zug-Qualitäts-Metriken aus Plan 3.7.1:
    going-first/second-WR, Setup-Quote, Dead-Turn-Rate, Prize-Kurve vs. Sieg-Durchschnitt.
    Das Zeitfenster über parametrisierte Query (Plan 5.4), Index auf event_date ergänzen.
B6. KI-Zugkritik vorbereiten (noch nicht voll ausbauen — Phase 4): battleLogAnalysis serverseitig
    spiegeln, ANTHROPIC_API_KEY als Railway-Secret, NICHT im Client. Anti-Halluzinations-Maßnahmen
    1:1 übernehmen (Evidence-Quote muss wörtlich im Log stehen, temperature=0, nur sichtbare Karten
    vorschlagen).
B7. Frontend-Konsumenten (deckPerformanceStats-Nutzung) auf die neue API umstellen, ohne neue
    IndexedDB↔API-Doppelung zu schaffen.
Akzeptanz: ein gespeicherter Log erzeugt einen match_log_parsed-Eintrag mit Board-State; die
analytics-Route liefert die Zug-Qualitäts-Kennzahlen pro Zeitfenster; Secrets nur serverseitig;
typecheck+lint+test grün; Doku (architecture, data-flow, database) nachgezogen.

────────────────────────────────────────────────────────
Reihenfolge & Abschluss
────────────────────────────────────────────────────────
Empfohlen: A (schnell sichtbarer Wert, geringes Risiko) vor B. Innerhalb B: B1→B2→B3→B4→B5, dann
B7, B6 zuletzt. Pro Baustein eigener PR mit: geänderte Dateien, ausgeführte Gate-Befehle + Ergebnis,
und welche Doku aktualisiert wurde. Bei Architekturfragen erst tcg-meta-project-head/plan-agent.
````

---

## Hinweise zur Nutzung

- Der Prompt setzt voraus, dass `CLAUDE.md`, `.claude/commands/` und `docs/ai-system.md` bereits im Repo liegen (in dieser Session angelegt).
- Offene Entscheidungen, die der Agent ggf. rückfragen soll, stehen in [`backend-evolution-plan.md`](../backend-evolution-plan.md) Abschnitt 10 (u. a. Cron-Frequenz, Tiefe der Board-State-Rekonstruktion, IndexedDB als Offline-Cache ja/nein).
- Für einzelne Teilschritte können im Repo die Commands `/feature`, `/port-to-backend`, `/docs-sync` genutzt werden.
