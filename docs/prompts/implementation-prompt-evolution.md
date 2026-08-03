# Implementierungs-Prompt für den Coding-Agent (Claude Code)

> Kopiere den Block unten in deinen Claude-Coding-Agent (Schreibzugriff aufs `pokekon`-Repo). Er deckt die zwei Bausteine ab, die echten Code brauchen: **(A) Doku-Viewer** und **(B) Battle-Log-Backend mit Zug-Qualität**. Die KI-System-Governance (`CLAUDE.md`, `.claude/commands/`, `docs/ai-system.md`) ist bereits angelegt — der Agent soll sie respektieren, nicht neu erstellen.
>
> **Tool-Aufteilung (wichtig):** Das *Coding* macht Claude (dieser Prompt). **GitHub Copilot wird nicht als Coding-Agent genutzt.** „GitHub" ist nur der **Default-Anbieter der LLM-Analyse in der App** (Baustein B6), in den App-Einstellungen umstellbar. Die **Doku-CI ist ein rein statischer Build** (Astro/Starlight) ohne jegliches LLM.

---

````text
Du arbeitest im Monorepo `pokekon` (npm workspaces: apps/web, apps/api, geplant apps/docs).
Halte dich verbindlich an CLAUDE.md (Repo-Root) und docs/backend-evolution-plan.md.
Goldene Regeln: erst lesen dann ändern · kostenlos bleiben · Secrets serverseitig · eine Quelle der
Wahrheit · typecheck+lint+test müssen grün sein · Anti-Halluzination der KI-Analyse erhalten · Doku
folgt dem Code. Arbeite in kleinen PRs, einer pro Abschnitt unten. Vor jeder nicht-trivialen Änderung
einen kurzen Plan in .claude/plans/ ablegen (oder plan-agent nutzen). Wiederverwendbare Abläufe stehen
als Commands bereit: /feature, /review, /port-to-backend, /docs-sync.

────────────────────────────────────────────────────────
BAUSTEIN A — Doku-Viewer (Astro Starlight → GitHub Pages, kostenlos, STATISCHER Build ohne LLM)
────────────────────────────────────────────────────────
Ziel: docs/*.md werden als durchsuchbare, hierarchisch verlinkte Doku-Site gerendert und bei jedem
Push auf main automatisch und kostenlos auf GitHub Pages deployt. Reiner Static-Site-Build — kein KI-
Schritt in der CI.

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
    - In den Repo-Settings GitHub Pages auf "GitHub Actions" als Source stellen (manueller Schritt
      durch den Repo-Owner, im PR-Text vermerken).
A4. Pflicht-Inhaltsfix: docs/architecture.md von "zero-backend SPA" auf die reale
    Hono+Postgres-Architektur umschreiben (siehe evolution-plan Abschnitt 1). docs/README.md
    "Quick orientation" entsprechend korrigieren. docs/ai-system.md ist bereits vorhanden — nur in die
    Sidebar aufnehmen.
A5. (Optional, wenn Zeit) OpenAPI aus den Zod-Schemas der API generieren (@hono/zod-openapi) und im
    Viewer einbetten, damit die API-Doku nicht veralten kann.
Akzeptanz: lokal `npm run dev -w @pokekon/docs` zeigt alle docs mit funktionierender Suche, Sidebar,
auflösenden Cross-Links und gerenderten Mermaid-Diagrammen; docs.yml deployt erfolgreich auf Pages;
keine bezahlten Dienste; kein LLM im CI-Pfad.

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
B6. LLM-Analyse der Logs (battleLogAnalysis) serverseitig + PROVIDER-AGNOSTISCH:
    - Kapsle den LLM-Call hinter eine kleine Schnittstelle (z. B. AnalysisProvider mit einer
      analyze()-Methode). Konkrete Adapter: GitHub Models (Default) und mind. ein weiterer (z. B.
      OpenAI/Anthropic). Auswahl per ENV-Default + pro Nutzer in den App-Einstellungen umstellbar.
    - Der persönliche API-Key wird vom Nutzer hinterlegt und NUR serverseitig verwendet/gespeichert
      (verschlüsselt bzw. als Server-Variable), niemals ins Browser-Bundle. Default-Provider: GitHub
      Models.
    - Anti-Halluzinations-Maßnahmen 1:1 übernehmen, provider-unabhängig: Evidence-Quote muss wörtlich
      im Log stehen, temperature=0, nur im Log sichtbare Karten vorschlagen.
    - Diesen Schritt zuletzt ausbauen (Phase 4) und vor dem Live-Schalten kurz rückfragen.
B7. Frontend-Konsumenten (deckPerformanceStats-Nutzung) auf die neue API umstellen, ohne neue
    IndexedDB↔API-Doppelung zu schaffen. App-Einstellung für Anbieter-/Key-Wahl ergänzen (B6).
Akzeptanz: ein gespeicherter Log erzeugt einen match_log_parsed-Eintrag mit Board-State; die
analytics-Route liefert die Zug-Qualitäts-Kennzahlen pro Zeitfenster; LLM-Anbieter umschaltbar mit
GitHub Models als Default; Keys nur serverseitig; typecheck+lint+test grün; Doku (architecture,
data-flow, database) nachgezogen.

────────────────────────────────────────────────────────
Reihenfolge & Abschluss
────────────────────────────────────────────────────────
Empfohlen: A (schnell sichtbarer Wert, geringes Risiko) vor B. Innerhalb B: B1→B2→B3→B4→B5, dann
B7, B6 zuletzt. Pro Baustein eigener PR mit: geänderte Dateien, ausgeführte Gate-Befehle + Ergebnis,
und welche Doku aktualisiert wurde. Bei Architekturfragen erst tcg-meta-project-head/plan-agent.
````

---

## Manuelle Schritte für dich (kann der Agent nicht selbst)
- **GitHub Pages aktivieren:** Repo-Settings → Pages → Source = „GitHub Actions" (einmalig). Rein statischer Build, kein LLM.
- **App-Analyse (Baustein B6):** persönlichen API-Key des gewählten Anbieters (Default: GitHub Models) serverseitig als Railway-Variable bzw. verschlüsselt pro Nutzer hinterlegen — nie im Frontend.

## Hinweise
- Coding-Tool ist Claude. GitHub Copilot wird **nicht** als Coding-Agent verwendet; „GitHub" betrifft nur den App-Analyse-Default (B6).
- Guardrails: `CLAUDE.md` + `.claude/commands/` (für Claude) und ergänzend `.github/copilot-instructions.md`.
- Offene Entscheidungen (Cron-Frequenz, Tiefe der Board-State-Rekonstruktion, IndexedDB als Offline-Cache, weitere LLM-Anbieter neben GitHub Models) stehen in [`../backend-evolution-plan.md`](../backend-evolution-plan.md) Abschnitt 10.
