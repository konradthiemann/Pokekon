# Plan — Spec 9: Automatisierte Doku-Aktualität (Hook-gestützt)

> **Bindende Grundlage:** [`specs/docs-sync-automation.md`](../../specs/docs-sync-automation.md),
> inkl. der drei Entscheidungen aus „Offene Fragen (entschieden, 2026-09-07)" (`:75-93`).
> Kontext: Teil 9 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md);
> Teile 1–8 sind auf `main` (`8f09c95`).
> **Branch:** `chore/docs-sync-automation`, abzweigen von `main` (`8f09c95`).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md` —
> die Testbarkeit eines Bash-Hooks ist in §3.8 und §4 ausdrücklich geklärt, sie wird nicht
> stillschweigend übersprungen.
> **Kein Anwendungs-Code.** Dieser Plan ändert ausschließlich Tooling: ein Hook-Skript,
> ein neues `.claude/settings.json`, ein Test-Harness, ein Root-npm-Script, Doku.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `8f09c95`)

Alles hier ist aus den genannten Dateien gelesen. Wo etwas nicht belegt werden konnte,
steht **Vermutung** oder **Unbekannt** (CLAUDE.md §2.1).

### 0.1 Die drei bindenden Entscheidungen der Spec

`specs/docs-sync-automation.md:77-93`:

1. **Automatisierungsgrad:** harter **Block** bei `git commit`, analog `tdd-gate.sh`;
   Übersteuern bleibt möglich; **kein** automatischer `docs-agent`-Lauf.
2. **Pfad-zu-Doku-Zuordnung:** **differenziert** — je Pfad-Gruppe eine eigene, spezifische
   Ziel-Doku statt eines Catch-alls („`routes/meta.ts` → `docs/features.md` §Meta-Sync
   statt pauschal `docs/api.md`", `:86-87`).
3. **Verhältnis zu `tdd-gate.sh`:** **eigener, separater Hook**, eigener Dirty-Marker,
   eigener Override. Beide Gates scheitern unabhängig voneinander.

Zusätzlich bindend aus den Akzeptanzkriterien (`:46-63`): Ort `.claude/hooks/` **in Pokekon**,
Registrierung in einem **neuen** `Pokekon/.claude/settings.json`, der Hook **schreibt keine
Doku-Inhalte**, er ist best-effort und darf eine Session **nie** durch einen eigenen Fehler
abbrechen.

### 0.2 Das Block-Muster (`~/.claude/hooks/tdd-gate.sh`, gelesen)

- `:17-30` — `PAYLOAD=$(cat)`; `field()` liest ein Feld über `python3` aus dem JSON-Payload,
  schluckt jeden Fehler (`2>/dev/null`, `except: print('')`).
- `:32-37` — genutzte Felder: `hook_event_name`, `tool_name`, `cwd`, `tool_input.command`,
  `tool_input.file_path`, `tool_response.success`.
- `:39-40` — `SCOPE="/Users/charliekonni/Softwareentwicklung"`, `DIR="${CLAUDE_PROJECT_DIR:-$CWD}"`.
- **`:48` — `[ -d "$DIR/.claude/hooks" ] && exit 0` („Projekt-eigene Hooks haben Vorrang").**
  Das ist der kritische Punkt dieses Plans, siehe §5.1.
- `:50-54` — `GITROOT=$(git -C "$DIR" rev-parse --show-toplevel)`; Marker liegen als
  `"$GITROOT/.git/claude-{tdd,lint,typecheck}-dirty"`.
- `:155-161` — `PostToolUse:Edit|Write|MultiEdit` markiert dirty; `:158` schließt
  `\.(md|txt)$|/(specs|docs)/` aus.
- `:162-175` — `PostToolUse:Bash` löscht Marker bei erfolgreichem Lauf
  (`SUCCESS` wird gegen `True`/`true` geprüft, `:164`).
- `:176-185` — `PreToolUse:Bash` + Regex `(^|[;&|[:space:]])git[[:space:]]+commit\b`
  → `echo "BLOCKED: …" >&2; exit 2`. **Exit 2 ist der Block-Mechanismus.**
- `:59-76` — `log_block()` schreibt einen JSONL-Datensatz
  (`timestamp`,`repo`,`gate`,`command`) nach `~/.claude/logs/agentic-events.jsonl`.
- `:206-208` — jeder unbekannte Event fällt auf `exit 0`.

### 0.3 Das Dirty-Marker-Muster (`~/.claude/hooks/infra-dashboard-sync.sh`, gelesen)

- `:53-56` — `mark_dirty()` = `mkdir -p` + `touch` (Marker ohne Inhalt).
- `:106-113` — `case "$FILEPATH"` mit Glob-Armen als Zuordnungstabelle; **genau dieses Muster**
  wird hier für die differenzierte Zuordnung übernommen, nur mit Inhalt statt leerem `touch`.
- `:140-146` — alle Nebenwirkungen laufen in ein Logfile (`>>"$LOG_FILE" 2>&1`), nie auf stderr.
- `:58-104` — `do_sync()` generiert und pusht einen Snapshot. **Genau dieser Teil wird
  ausdrücklich NICHT übernommen** (Spec `:17-25`: Prosa ist nicht mechanisch generierbar).

### 0.4 Registrierungs-Syntax (gelesen)

- `~/.claude/settings.json` → `hooks.PreToolUse[].matcher = "Bash"`,
  `hooks[].hooks[] = { "type": "command", "command": "bash \"$HOME/.claude/hooks/tdd-gate.sh\"", "timeout": 10 }`.
- **Präzedenz für projekt-lokale Hooks im Workspace:** `Doewe/.claude/settings.json` nutzt
  `"command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/<skript>.sh"` mit `matcher` `"Bash"`
  bzw. `"Edit|Write"` und `timeout`/`async`. Diese Syntax wird hier übernommen.
- `Doewe/.claude/hooks/` enthält `git-safety.sh`, `post-edit-lint.sh`, `post-edit-typecheck.sh`,
  `stop-notify.sh` — **kein** `tdd-gate.sh`.
- **Vermutung (nicht verifiziert):** Projekt-`settings.json`-Hooks und globale Hooks werden
  additiv zusammengeführt. Dass Doewe `git-safety.sh` lokal **nochmals** registriert, obwohl es
  global registriert ist, spricht eher für Unsicherheit als für einen Beleg. Verifikation:
  §4 Schritt 0.b.

### 0.5 Pokekon-Zustand (gelesen)

- **`Pokekon/.claude/settings.json` existiert nicht**, `Pokekon/.claude/hooks/` existiert nicht.
  Vorhanden sind `.claude/{agents,commands,plans,agent-memory,worktrees}` und `launch.json`.
- `docs/` enthält genau: `README.md`, `agents.md`, `ai-system.md`, `architecture.md`,
  `backend-evolution-plan.md`, `data-flow.md`, `data-types.md`, `database.md`, `demo-mode.md`,
  `design-system.md`, `features.md`, `getting-started.md`, `prompts/`.
  **Es gibt kein `docs/api.md`** — die Zuordnung darf keine erfinden.
- `apps/api/src/routes/`: `analysis.ts`, `analytics.ts`, `decks.ts`, `demo.ts`, `logs.ts`,
  `matchups.ts`, `meta.ts`, `shared.ts`, `snapshots.ts`.
  `apps/api/src/routes/shared.ts:6-25` ist ein reines Helfer-Modul (`parseId`, `readJson`,
  Deck-Ownership) — kein Feature, entsprechend schmal zugeordnet.
- `apps/api/src/db/` enthält nur `index.ts` und `schema.ts`.
- `packages/shared/src/` enthält 20 Module + jeweils `*.test.ts` daneben.
- `apps/web/src/components/` hat die Unterordner `auth`, `deck`, `layout`, `meta`, `opponent`,
  `recommendations`, `settings`, `shared` (+ `DeckSpriteBackground.tsx` direkt darin).
- Root-`package.json`-Scripts: `test` = `npm run build -w @pokekon/shared && npm run test --workspaces --if-present`.
  Analog `lint`, `typecheck`, `format`, `format:check` (`prettier --check .`).
- Jede der drei Workspaces (`apps/api`, `apps/web`, `packages/shared`) hat `"test": "vitest run"`
  und eine eigene `vitest.config.ts`. **Es gibt keinen Root-Test-Runner** — ein Test auf
  Repo-Ebene würde ohne Verdrahtung von `npm run test` nicht laufen.
- `.husky/pre-commit` = `npx lint-staged` + `npm run -w @pokekon/web lint`.
- `.github/workflows/ci.yml` fährt `format:check` → `lint` → `typecheck` → `test` → `build`,
  alle aus dem Root. **Wenn der Hook-Test in `npm run test` hängt, läuft er automatisch in CI.**
- `.gitignore` enthält `*.local` → ein späteres `.claude/settings.local.json` wäre automatisch
  ignoriert. `.claude/` selbst ist **nicht** ignoriert, ist also getrackt.
- `.prettierignore` ignoriert u. a. `*.md` und `/docs`. **`.claude/settings.json` (JSON) wird
  von `prettier --check .` erfasst** und muss Prettier-konform formatiert sein; `*.sh` hat
  keinen Prettier-Parser und wird ignoriert.
- CLAUDE.md Golden Rule 7: „Strukturändernde Arbeit aktualisiert die betroffene Doku in
  `docs/` im selben Zug." — die Regel, die dieses Gate durchsetzt.
- `.claude/agents/docs-agent.md` existiert — der im Block-Text genannte nächste Schritt ist real.

### 0.6 Monitoring-Anschluss (gelesen, für §3.7)

`agentic-infra-dashboard/src/lib/snapshot-schema.ts:65-79` — `tddGateAggregate` mit
`byGate` als dynamischer Map und `gate: z.string()`; `src/app/monitoring/page.tsx:17,43-45`
rendert `Object.entries(tddGate.byGate)`. Ein zusätzlicher Gate-Name `docs` in
`agentic-events.jsonl` ist damit **schema-verträglich und rein additiv** — kein Feld, keine
Whitelist bricht.

### 0.7 Was NICHT verifiziert werden konnte

- **Unbekannt:** ob Claude Code projekt-lokale und globale Hooks additiv mergt (§0.4).
- **Unbekannt:** ob `$CLAUDE_PROJECT_DIR` bzw. `${CLAUDE_PROJECT_DIR}` in `command` zuverlässig
  expandiert wird (Doewe nutzt es, ob es dort *funktioniert*, wurde nicht zur Laufzeit geprüft).
- **Unbekannt:** ob PostToolUse für das `Edit`-Tool auch bei Datei-**Löschung** feuert — Claude
  Code löscht Dateien üblicherweise per `Bash rm`, deshalb deckt §3.5 den Löschfall über den
  `Bash`-Arm ab statt sich darauf zu verlassen.

---

## 1. Summary

Ein projekt-lokaler Bash-Hook (`Pokekon/.claude/hooks/docs-gate.sh`) beobachtet
strukturändernde Datei-Änderungen, bildet sie über eine differenzierte Tabelle auf konkrete
`docs/*.md`-Dateien (mit Abschnitts-Hinweis) ab und schreibt das Ergebnis in einen
Dirty-Marker im Git-Verzeichnis. Beim nächsten `git commit` blockiert derselbe Hook
(Exit-Code 2) und zeigt, welche Doku-Datei wegen welcher Code-Datei als veraltet gilt.
Wird eine der genannten `docs/*.md` bearbeitet, verschwinden genau deren Einträge aus dem
Marker; ist er leer, wird er gelöscht und der Commit läuft. Der Hook **schreibt niemals
Doku-Inhalte** — das Aktualisieren bleibt ein bewusster `docs-agent`-Schritt. Nutzer ist
Konrad (und jeder Agent in diesem Repo); gelöstes Problem ist der Fehlermodus „Doku-Update
vergessen", den CLAUDE.md Golden Rule 7 bisher nur appellativ adressiert.

---

## 2. Betroffene Schichten

Keine Änderung an Datenmodell, Migrationen, API, Domänen-Logik oder UI. Betroffen ist
ausschließlich die Tooling-/Repo-Schicht:

- [ ] **Neu:** `.claude/hooks/docs-gate.sh` — das Gate (§3.1–3.7).
- [ ] **Neu:** `.claude/hooks/docs-gate.test.sh` — automatisiertes Test-Harness (§3.8).
- [ ] **Neu:** `.claude/settings.json` — Hook-Registrierung (§3.2).
- [ ] **Geändert:** `package.json` (Root) — neues Script `test:hooks`, eingehängt in `test`.
- [ ] **Geändert:** `CLAUDE.md` — §4 Quality-Gates um das Docs-Gate + Override ergänzen,
      Verweis bei Golden Rule 7.
- [ ] **Geändert:** `docs/ai-system.md` §6 „Quality-Gates" — das neue Gate beschreiben
      (die Datei ist die Gesamtübersicht des KI-Systems, `:184`).
- [ ] **Geändert:** `docs/agents.md` — beim `docs-agent` vermerken, dass das Gate ihn auslöst.
- [ ] **Ggf. geändert (Entscheidung nötig, §5.1):** `~/.claude/hooks/tdd-gate.sh:48` —
      **außerhalb dieses Repos**, kein PR möglich (`~/.claude` ist kein Git-Repo).

---

## 3. Interfaces & Contracts

Diese Sektion ist der Handoff-Vertrag: `tester` schreibt die Tests aus §3.1–3.7 + §3.8,
`implementer` macht sie grün — beide ohne Rückfrage aneinander.

### 3.1 Hook-Aufruf-Vertrag

**Datei:** `.claude/hooks/docs-gate.sh` (Modus `755`, Shebang `#!/bin/bash`).
**Aufruf:** `bash .claude/hooks/docs-gate.sh`, JSON-Payload auf **stdin**.
**Env:** `CLAUDE_PROJECT_DIR` optional; fällt auf `cwd` aus dem Payload zurück
(`DIR="${CLAUDE_PROJECT_DIR:-$CWD}"`, identisch zu `tdd-gate.sh:40`).

**Gelesene Payload-Felder** (über dieselbe `field()`-Hilfsfunktion wie `tdd-gate.sh:19-30`):

| Feld | Verwendung |
|---|---|
| `hook_event_name` | `PostToolUse` \| `PreToolUse` |
| `tool_name` | `Edit` \| `Write` \| `MultiEdit` \| `Bash` |
| `cwd` | Fallback für `CLAUDE_PROJECT_DIR` |
| `tool_input.file_path` | absoluter Pfad der geänderten Datei |
| `tool_input.command` | Bash-Kommando |
| `tool_response.success` | `"true"`/`"True"` = Erfolg (Vergleich wie `tdd-gate.sh:164`) |

**Exit-Codes (vollständig, keine weiteren erlaubt):**

| Code | Wann |
|---|---|
| `0` | Normalfall — inkl. jedem internen Fehler, jedem unbekannten Event, jedem Pfad außerhalb des Scopes |
| `2` | **einzig** bei `PreToolUse` + `Bash` + `git commit` + nicht-leerem Marker; Meldung auf stderr |

**Scope-Guards (in dieser Reihenfolge, jeweils `exit 0` bei Nichterfüllung):**
1. `GITDIR=$(git -C "$DIR" rev-parse --absolute-git-dir 2>/dev/null)` nicht leer.
2. `GITROOT=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)` nicht leer.
3. `[ -d "$GITROOT/docs" ] && [ -f "$GITROOT/CLAUDE.md" ]` — schützt vor Fehlzündung, falls
   der Hook je aus einem anderen Verzeichnis heraus aufgerufen wird, und funktioniert in
   Worktrees von Pokekon (siehe `.claude/rules/worktrees.md`) unverändert.

> `--absolute-git-dir` statt `"$GITROOT/.git"`: In einem Worktree ist `.git` eine **Datei**,
> kein Verzeichnis — `tdd-gate.sh:52` würde dort auf einen ungültigen Marker-Pfad zeigen.
> Dieser Hook macht es bewusst richtig; der Block-Text nennt deshalb den **aufgelösten**
> Marker-Pfad (§3.6), nicht blind `.git/claude-docs-dirty`.

### 3.2 `.claude/settings.json` (neu, vollständiger Inhalt)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/docs-gate.sh", "timeout": 10 }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/docs-gate.sh", "timeout": 10 }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/docs-gate.sh", "timeout": 10 }
        ]
      }
    ]
  }
}
```

Syntax und `${CLAUDE_PROJECT_DIR}`-Form sind 1:1 aus `Doewe/.claude/settings.json` übernommen
(§0.4). Die Datei muss Prettier-konform sein (§0.5).

### 3.3 Dirty-Marker (Format ist Vertrag — Tests prüfen ihn zeichengenau)

- **Pfad:** `$GITDIR/claude-docs-dirty` (normale Klone: `Pokekon/.git/claude-docs-dirty`).
  Liegt im Git-Verzeichnis → nie committbar, kein `.gitignore`-Eintrag nötig.
- **Format:** UTF-8-Text, eine Zeile je Datensatz, **drei Tab-getrennte Spalten**:

  ```
  <doc-pfad>\t<abschnitts-hinweis>\t<ausloeser-pfad>
  ```

  Alle Pfade repo-relativ. `<abschnitts-hinweis>` ist Freitext (darf leer sein), z. B.
  `§2 Live Meta Sync`. Beispiel-Inhalt:

  ```
  docs/data-types.md	Database Entity Types	apps/api/src/db/schema.ts
  docs/database.md	Server-side schema (apps/api · PostgreSQL via Drizzle)	apps/api/src/db/schema.ts
  docs/features.md	§2 Live Meta Sync	apps/api/src/routes/meta.ts
  ```

- **Invarianten:**
  - Zeilen sind **sortiert und dedupliziert** (`sort -u`) — zweimal dieselbe Datei ändern
    erzeugt keine zweite Zeile.
  - Die Datei existiert **nur**, wenn sie mindestens eine Zeile hat. Beim Entfernen der
    letzten Zeile wird sie gelöscht (`rm -f`).
  - Schreibvorgänge laufen über eine temporäre Datei + `mv` (atomar genug für Best-Effort).
- **Override:** `rm <marker-pfad>` — mehr nicht. Analog `rm .git/claude-tdd-dirty`
  (`.claude/rules/tdd.md`, „Durchsetzung").

### 3.4 Pfad-zu-Doku-Zuordnung (differenziert — Entscheidung 2)

Implementiert als `docs_for <repo-relativer-pfad>`: schreibt **null oder mehr** Zeilen
`<doc-pfad>\t<abschnitts-hinweis>` auf stdout. **Keine Ausgabe = nicht strukturändernd.**
`case`-Arme werden von spezifisch nach allgemein geprüft, **erster Treffer gewinnt**
(Muster: `infra-dashboard-sync.sh:106-113`).

**Ausschlüsse (zuerst, liefern immer nichts):**
`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`, alles unter `docs/`, `specs/`, `.claude/`,
`todo/`, `documents/`, `node_modules/`, `dist/`, jede `*.md`, `packages/shared/src/index.ts`
(reine Re-Exports — das zugehörige neue Modul markiert bereits selbst).

| # | Pfad-Muster (repo-relativ) | Ziel-Doku(s) mit Abschnitts-Hinweis |
|---|---|---|
| 1 | `apps/api/src/db/schema.ts` | `docs/database.md` §Server-side schema (apps/api · PostgreSQL via Drizzle) · `docs/data-types.md` §Database Entity Types |
| 2 | `apps/api/src/routes/meta.ts` | `docs/features.md` §2 Live Meta Sync / §13 Matchup Matrix / §15 Archetype Drilldown · `docs/data-flow.md` §Meta Sync (Limitless API) |
| 3 | `apps/api/src/routes/analysis.ts` | `docs/features.md` §8 Battle Log Analysis / §19 Deck Synthesis · `docs/data-flow.md` §Deck Synthesis / §Battle Log Analysis · `docs/ai-system.md` §2 Schichtenmodell |
| 4 | `apps/api/src/routes/analytics.ts` | `docs/features.md` §10 Data-Driven Recommendations / §17 Card Performance Deltas · `docs/data-flow.md` §Deck Analytics Read Path |
| 5 | `apps/api/src/routes/logs.ts` | `docs/features.md` §6 Match Log / §7 Battle Log Parsing · `docs/data-flow.md` §User Logs a Match / §Server-side Battle-Log Pipeline |
| 6 | `apps/api/src/routes/decks.ts` | `docs/features.md` §3 Deck Management / §5 Deck Variants · `docs/data-flow.md` §Deck Import (Text Paste) |
| 7 | `apps/api/src/routes/snapshots.ts` | `docs/features.md` §4 Deck Versioning (Snapshots) · `docs/data-flow.md` §Snapshot Save and Version Tracking |
| 8 | `apps/api/src/routes/matchups.ts` | `docs/features.md` §13 Matchup Matrix / §11 Local Meta Configuration |
| 9 | `apps/api/src/routes/demo.ts` | `docs/demo-mode.md` §What gets seeded |
| 10 | `apps/api/src/routes/shared.ts` | `docs/architecture.md` §Backend (`apps/api`) |
| 11 | `apps/api/src/routes/*.ts` (kein Treffer oben) | `docs/features.md` (ohne Hinweis) · `docs/architecture.md` §Backend (`apps/api`) — **zusätzlich Log-Zeile `mapping: unmapped route <pfad>`** (§3.7) |
| 12 | `packages/shared/src/battleLogParser.ts`, `…/battleLogPrefill.ts` | `docs/features.md` §7 Battle Log Parsing · `docs/data-types.md` §Battle-Log Prefill Types |
| 13 | `packages/shared/src/battleAnalysis.ts` | `docs/features.md` §8 Battle Log Analysis · `docs/data-types.md` §Battle Log Analysis Types · `docs/ai-system.md` §2 Schichtenmodell |
| 14 | `packages/shared/src/deckSynthesis.ts` | `docs/features.md` §19 Deck Synthesis · `docs/data-types.md` §Deck Synthesis Types · `docs/data-flow.md` §Deck Synthesis · `docs/ai-system.md` §2 Schichtenmodell |
| 15 | `packages/shared/src/cardPerformance.ts` | `docs/features.md` §17 Card Performance Deltas · `docs/data-types.md` §Card Performance Delta Types · `docs/data-flow.md` §Card Performance Delta Precomputation |
| 16 | `packages/shared/src/nashEquilibrium.ts`, `…/simplex.ts` | `docs/features.md` §18 Game-Theoretic Meta Layer · `docs/data-types.md` §Game-Theoretic Meta Layer Types · `docs/data-flow.md` §Meta Equilibrium Computation |
| 17 | `packages/shared/src/fieldWinRate.ts`, `…/wilsonInterval.ts`, `…/winRate.ts`, `…/bestOf.ts` | `docs/features.md` §15 Archetype Drilldown (Field Score) · `docs/data-types.md` §Deck Performance Types |
| 18 | `packages/shared/src/matchup*.ts` | `docs/features.md` §13 Matchup Matrix · `docs/data-types.md` §Meta Data Types |
| 19 | `packages/shared/src/meta.ts`, `…/analytics.ts`, `…/season.ts` | `docs/data-types.md` §Meta Data Types · `docs/features.md` §1 Meta Overview |
| 20 | `packages/shared/src/*.ts` (kein Treffer oben) | `docs/data-types.md` (ohne Hinweis) · `docs/features.md` (ohne Hinweis) — **plus Log-Zeile `mapping: unmapped shared module <pfad>`** |
| 21 | `apps/web/src/components/deck/**` ¹ | `docs/features.md` §3 Deck Management / §10 Data-Driven Recommendations · `docs/architecture.md` §Frontend (`apps/web`) |
| 22 | `apps/web/src/components/meta/**` ¹ | `docs/features.md` §1 Meta Overview / §13 Matchup Matrix / §15 Archetype Drilldown · `docs/architecture.md` §Frontend (`apps/web`) |
| 23 | `apps/web/src/components/recommendations/**` ¹ | `docs/features.md` §10 Data-Driven Recommendations / §19 Deck Synthesis |
| 24 | `apps/web/src/components/opponent/**` ¹ | `docs/features.md` §6 Match Log |
| 25 | `apps/web/src/components/auth/**` ¹ | `docs/demo-mode.md` §How it works · `docs/architecture.md` §Frontend (`apps/web`) |
| 26 | `apps/web/src/components/settings/**` ¹ | `docs/features.md` §8 Battle Log Analysis (BYOK-Settings) · `docs/ai-system.md` §2 Schichtenmodell |
| 27 | `apps/web/src/components/layout/**` ¹ | `docs/architecture.md` §Frontend (`apps/web`) · `docs/design-system.md` §Component classes |
| 28 | `apps/web/src/components/shared/**` ¹ | `docs/design-system.md` §Component classes |
| 29 | `apps/web/src/components/**` (kein Treffer oben) ¹ | `docs/architecture.md` §Frontend (`apps/web`) — **plus Log-Zeile `mapping: unmapped component <pfad>`** |

¹ **Nur bei Neuanlage oder Löschung**, nicht bei Änderung einer bestehenden Komponente
(Akzeptanzkriterium `specs/docs-sync-automation.md:51-52`: „neue/gelöschte Dateien unter
`apps/web/src/components/`"). Erkennung siehe §3.5.

**Bewusst nicht in der Tabelle** (verhindert Fehlalarme): `apps/api/src/lib/**`,
`apps/api/src/jobs/**`, `apps/web/src/pages/**`, `apps/web/src/store/**`, `apps/web/src/lib/**`.
Das ist eine bewusste Enge der ersten Version — siehe §5.4.

### 3.5 Event-Verhalten (der Zustandsautomat)

**A) `PostToolUse` + `Edit|Write|MultiEdit`**

1. `REL="${FILEPATH#$GITROOT/}"`; ist `FILEPATH` leer oder liegt außerhalb von `GITROOT` → `exit 0`.
2. Liegt `REL` unter `docs/` **und** endet auf `.md` → **`clear_doc "$REL"`** (§3.5-D), `exit 0`.
3. Liegt `REL` unter `apps/web/src/components/` → **Neuheits-Test**:
   `git -C "$GITROOT" ls-files --error-unmatch -- "$REL" >/dev/null 2>&1`.
   Exit 0 = getrackt = bestehende Datei → `exit 0` (nicht dirty).
   Exit ≠ 0 = ungetrackt = neue Datei → weiter zu 4.
4. `docs_for "$REL"` → jede Ausgabezeile mit `\t$REL` ergänzt und über `mark_dirty` in den
   Marker geschrieben. Keine Ausgabe → nichts tun. `exit 0`.

**B) `PostToolUse` + `Bash`** (deckt Löschungen/Umbenennungen ab, §0.7)

1. Nur bei `SUCCESS` = `true`/`True`, sonst `exit 0`.
2. Nur wenn `CMD` auf `(^|[;&|[:space:]])(rm|mv|git[[:space:]]+rm|git[[:space:]]+mv)\b` matcht,
   sonst `exit 0`.
3. `git -C "$GITROOT" status --porcelain` lesen; jede Zeile, deren XY-Status ein `D` enthält
   (` D pfad`, `D  pfad`) oder mit `R` beginnt (`R  alt -> neu` → **alter** Pfad zählt),
   liefert einen `REL`.
4. Für jeden solchen `REL`: `docs_for "$REL"` → `mark_dirty` (der Neuheits-Test aus A.3
   entfällt hier — eine gelöschte Komponente ist per Definition eine Strukturänderung).
5. `exit 0`.

**C) `PreToolUse` + `Bash`** (das Gate)

1. `CMD` matcht `(^|[;&|[:space:]])git[[:space:]]+commit\b`? Nein → `exit 0`
   (identische Regex wie `tdd-gate.sh:177`).
2. Marker existiert nicht oder ist leer → `exit 0`.
3. Sonst: `log_block docs` (§3.7), Block-Text (§3.6) auf **stderr**, `exit 2`.

**D) `clear_doc <doc-pfad>`**

Entfernt aus dem Marker **alle** Zeilen, deren **erste Spalte exakt** `<doc-pfad>` ist
(kein Präfix-Match — `docs/data-flow.md` darf `docs/data-types.md` nicht treffen).
Bleiben Zeilen übrig → Datei neu schreiben. Bleibt nichts übrig → `rm -f` des Markers.

**E) Alles andere** (`Stop`, `SessionStart`, unbekannte Tools, kaputtes JSON) → `exit 0`.

### 3.6 Block-Text (stderr, wörtlicher Vertrag)

Erste Zeile ist stabil und beginnt mit `BLOCKED (docs-gate):` — Tests prüfen darauf.
Danach eine Zeile je betroffener Doku-Datei, gruppiert (Auslöser kommasepariert), zuletzt
Kontext, nächster Schritt und Override mit dem **aufgelösten** Marker-Pfad.

```
BLOCKED (docs-gate): Strukturaendernde Aenderungen ohne begleitendes Doku-Update.

  docs/database.md   — §Server-side schema  <- apps/api/src/db/schema.ts
  docs/data-types.md — §Database Entity Types  <- apps/api/src/db/schema.ts
  docs/features.md   — §2 Live Meta Sync  <- apps/api/src/routes/meta.ts

CLAUDE.md Golden Rule 7: "Doku folgt dem Code." Erst die genannten Dateien aktualisieren
(docs-agent oder von Hand), dann committen — das Gate loescht sich beim Bearbeiten selbst.
Bewusstes Uebersteuern, wenn die Heuristik danebenlag:
  rm /Users/.../Pokekon/.git/claude-docs-dirty
```

Nicht-ASCII im Block-Text wird vermieden (Umlaute als `ae/oe/ue`), damit die Ausgabe in jedem
Terminal/Log gleich aussieht; die Doku-Pfade und der `§`-Hinweis bleiben unverändert.

### 3.7 Logging (best-effort, nie sichtbar)

- **Fehler-/Diagnose-Log:** `$GITDIR/claude-docs-gate.log`, Zeilenformat
  `<ISO-8601-UTC> <level>: <text>`. Genutzt für die `mapping:`-Hinweise aus §3.4
  (Zeilen 11/20/29) und für jeden abgefangenen internen Fehler. **Niemals stderr**
  (Akzeptanzkriterium `specs/docs-sync-automation.md:61-63`). Liegt im Git-Verzeichnis →
  nicht committbar.
- **Block-Event (additiv, empfohlen):** derselbe `log_block`-Aufbau wie
  `tdd-gate.sh:59-76`, nach `~/.claude/logs/agentic-events.jsonl` mit `gate: "docs"`.
  Belegt verträglich (§0.6). Fehler dabei werden verschluckt und dürfen den Block nie
  beeinflussen.

### 3.8 Testbarkeit — warum hier ein Bash-Harness statt Vitest (ausdrücklich geklärt)

Das Repo verlangt TDD (CLAUDE.md §4, `.claude/rules/tdd.md`). Ein Hook ist ein Bash-Skript,
das über stdin/Exit-Code/Dateisystem kommuniziert — **das ist vollständig automatisiert
testbar**, es gibt hier keine Ausnahme von Rot-Grün. Der Test startet den Hook als
Subprozess gegen ein temporäres Git-Repo und prüft Exit-Code, stderr und Marker-Inhalt.

*Verworfene Alternative:* ein Vitest-Test auf Repo-Ebene. Es gibt keinen Root-Runner (§0.5);
er bräuchte eine neue Root-`vitest.config.ts`, eine Root-Dev-Dependency und läge außerhalb
jeder `tsconfig.json` (also ohne Typecheck-Abdeckung) — mehr Bewegung im Repo für weniger
Nähe zum getesteten Artefakt.

**Vertrag des Harness** (`.claude/hooks/docs-gate.test.sh`):

- Aufruf: `bash .claude/hooks/docs-gate.test.sh`. Exit `0` = alle Fälle grün, `1` = mindestens
  einer rot. Pro Fall eine Zeile `ok - <name>` / `not ok - <name>` + Diff-Ausgabe bei Fehlschlag.
- **Fixture je Fall:** `TMP=$(mktemp -d)`, darin `git init -q`, `docs/` und `CLAUDE.md`
  anlegen, die realen Beispielpfade als leere Dateien anlegen und **committen**
  (`git -c user.email=test@example.invalid -c user.name=test commit -q -m init`), damit der
  Neuheits-Test aus §3.5-A.3 „getrackt" sehen kann. Danach `rm -rf "$TMP"`.
- **Isolation (zwingend):** Aufruf immer als
  `env -u CLAUDE_PROJECT_DIR bash "$HOOK" <<<"$payload"` mit `cwd` = `$TMP` im Payload.
  Ohne `-u` würde der Hook auf das **echte** Pokekon-Repo zeigen und dessen Marker anfassen.
  Der Test darf `$GITDIR/claude-docs-dirty` des echten Repos unter keinen Umständen berühren.
- **Payload-Bau:** kleine Hilfsfunktion, die JSON per `printf` zusammensetzt; keine
  Abhängigkeit über das hinaus, was der Hook selbst nutzt (`bash`, `git`, `python3`).

**Pflicht-Fälle (das ist die Rot-Liste für `tester`):**

| # | Fall | Erwartung |
|---|---|---|
| 1 | Edit `apps/api/src/db/schema.ts` | exit 0; Marker hat genau 2 Zeilen: `docs/database.md`, `docs/data-types.md`, dritte Spalte = Auslöserpfad |
| 2 | Edit `apps/api/src/routes/meta.ts`, zweimal | exit 0; Zeilen dedupliziert (keine Verdopplung); enthält `docs/features.md` und `docs/data-flow.md` |
| 3 | Edit `packages/shared/src/battleAnalysis.ts` | Marker enthält `docs/ai-system.md` (differenzierte Zuordnung greift) |
| 4 | Edit `packages/shared/src/meta.test.ts` | **kein** Marker |
| 5 | Edit `packages/shared/src/index.ts` | **kein** Marker (Re-Export-Ausschluss) |
| 6 | Edit `docs/features.md` bei leerem Zustand | **kein** Marker, exit 0 |
| 7 | Edit **getrackter** `apps/web/src/components/deck/DeckPanel.tsx` | **kein** Marker |
| 8 | Write **ungetrackter** `apps/web/src/components/deck/NewPanel.tsx` | Marker mit `docs/features.md` + `docs/architecture.md` |
| 9 | Bash `rm apps/web/src/components/deck/DeckPanel.tsx`, `success:true`, Datei wirklich gelöscht | Marker gesetzt |
| 10 | Bash `rm …`, `success:false` | **kein** Marker |
| 11 | PreToolUse `git commit -m "x"` bei gesetztem Marker | **exit 2**; stderr beginnt mit `BLOCKED (docs-gate):`; enthält jede Doku-Zeile und `rm ` + realen Marker-Pfad |
| 12 | PreToolUse `git commit --amend` bei gesetztem Marker | exit 2 (Regex greift auch hier) |
| 13 | PreToolUse `git commit` ohne Marker | exit 0, stderr leer |
| 14 | PreToolUse `npm run test` bei gesetztem Marker | exit 0, stderr leer |
| 15 | Teil-Clearing: Marker mit `features.md` + `data-flow.md`, dann Edit `docs/features.md` | nur `features.md`-Zeilen weg, `data-flow.md` bleibt, Marker existiert |
| 16 | Voll-Clearing: letzte Zeile entfernt | Marker-**Datei gelöscht** |
| 17 | Kein Präfix-Irrtum: Marker enthält `docs/data-types.md`, Edit `docs/data-flow.md` | `data-types.md`-Zeile bleibt |
| 18 | Payload `{}` und Payload `kein-json` | exit 0, kein Marker, kein stderr |
| 19 | `cwd` = Verzeichnis ohne Git-Repo | exit 0, kein Fehler |
| 20 | Git-Repo **ohne** `docs/` | exit 0, kein Marker (Scope-Guard) |
| 21 | Edit `apps/api/src/routes/tournaments.ts` (unbekannte Route) | Fallback-Zuordnung gesetzt **und** Zeile `mapping: unmapped route` im `claude-docs-gate.log` |
| 22 | Zwei Auslöser für dieselbe Doku (`schema.ts` + `routes/decks.ts`) | Block-Text nennt jede Doku-Datei genau einmal, mit beiden Auslösern |

**Nicht automatisiert testbar (manueller Verifikationsplan, §4 Scheibe F):** dass Claude Code
den Hook tatsächlich registriert, dass `${CLAUDE_PROJECT_DIR}` expandiert, und dass exit 2 im
laufenden Agenten wirklich als Block ankommt. Das sind Eigenschaften der Harness, nicht des
Skripts — sie werden per Checkliste in einer echten Session geprüft, nicht behauptet.

### 3.9 Was ausdrücklich NICHT gebaut wird

- Kein Schreiben, Generieren oder Umformulieren von Doku-Inhalten (Spec `:53-55`, `:66-69`).
- Kein automatischer `docs-agent`-Aufruf (Entscheidung 1).
- Keine Änderung an `tdd-gate.sh`-**Logik** (Entscheidung 3) — die einzige diskutierte
  Berührung ist der Vorrang-Guard, §5.1.
- Keine Übertragung auf andere Repos, kein globaler Hook (Spec `:70-71`).
- Kein `Stop`-Event, kein Throttle, kein Git-Push (das ist `infra-dashboard-sync.sh`,
  nicht dieses Gate).

---

## 4. Umsetzungsreihenfolge (test-first, Scheibe für Scheibe)

Jede Verhaltens-Scheibe ist **erst rot** (`tester`), **dann grün** (`implementer`); der
`implementer` bestätigt vor dem Grün-Machen den gemeldeten Rot-Grund
(`.claude/rules/tdd.md`, Schritt 2).

**Schritt 0 — Vorbereitung + zwei Verifikationen vor jeder Zeile Code.**

```bash
git -C /Users/charliekonni/Softwareentwicklung/Pokekon switch -c chore/docs-sync-automation
```

- **0.a (blockierend, §5.1):** Konrads Entscheidung zu `tdd-gate.sh:48` einholen.
  Ohne diese Entscheidung darf `.claude/hooks/` nicht angelegt werden.
- **0.b:** Merge-Verhalten projekt-lokaler Hooks prüfen (`/hooks`-Übersicht in einer Session
  bzw. Testlauf), Ergebnis im PR-Text festhalten — es entscheidet, ob §5.1 überhaupt greift.

**Scheibe A — Zuordnung + Marker-Format (Rot: Fälle 1–6, 17–20 aus §3.8).**
1. `tester`: `.claude/hooks/docs-gate.test.sh` mit Harness (Fixture, `run_hook`, Assertions)
   und den Fällen 1–6, 17–20. Rot: Hook existiert nicht.
2. `implementer`: `.claude/hooks/docs-gate.sh` — `field()`, Scope-Guards, `docs_for`
   (§3.4), `mark_dirty`, `clear_doc`, Arm A ohne Neuheits-Test. Grün.

**Scheibe B — Neuheits-/Löschungs-Erkennung für Komponenten (Rot: 7–10).**
3. `tester`: Fälle 7–10 ergänzen (getrackt vs. ungetrackt, Bash-`rm` mit/ohne `success`). Rot.
4. `implementer`: `ls-files --error-unmatch`-Test (§3.5-A.3) + Bash-Arm B (§3.5-B). Grün.

**Scheibe C — Das Gate (Rot: 11–14, 22).**
5. `tester`: Exit-Code 2, stderr-Präfix, Gruppierung, Override-Zeile mit realem Marker-Pfad. Rot.
6. `implementer`: `PreToolUse`-Arm + Block-Text (§3.6) + `log_block docs` (§3.7). Grün.

**Scheibe D — Fehlertoleranz + Log (Rot: 18, 21).**
7. `tester`: kaputtes JSON, fehlende Felder, unbekannte Route mit `mapping:`-Log-Zeile. Rot.
8. `implementer`: Log-Funktion, Fallback-Arme, `exit 0` auf allen Fehlerpfaden. Grün.

**Scheibe E — Verdrahtung (kein neuer Test, bestehende Suite bleibt grün).**
9. `chmod +x .claude/hooks/docs-gate.sh .claude/hooks/docs-gate.test.sh`.
10. Root-`package.json`:
    ```jsonc
    "test:hooks": "bash .claude/hooks/docs-gate.test.sh",
    "test": "npm run build -w @pokekon/shared && npm run test --workspaces --if-present && npm run test:hooks"
    ```
    Damit läuft der Hook-Test automatisch in `ci.yml` (§0.5) — **keine Workflow-Änderung nötig**.
11. `.claude/settings.json` anlegen (§3.2), danach `npx prettier --write .claude/settings.json`.

**Scheibe F — Manuelle Verifikation in einer echten Session (Checkliste).**
12. Session in Pokekon starten, `apps/api/src/db/schema.ts` per `Edit` minimal anfassen
    (Kommentarzeile), prüfen: `.git/claude-docs-dirty` existiert mit den 2 erwarteten Zeilen.
13. `git commit` versuchen → Block-Text erscheint, Commit findet nicht statt.
14. `docs/database.md` + `docs/data-types.md` per `Edit` anfassen → Marker verschwindet.
15. `git commit` läuft durch. Danach die Test-Änderungen **gezielt** zurücknehmen
    (`git restore <pfad>` bzw. `git revert <sha>`); die im Workspace global geblockten
    destruktiven Varianten sind laut `.claude/rules/git-and-commits.md` tabu.
16. Gegenprobe: `rm .git/claude-docs-dirty` hebt den Block ebenfalls auf.
17. Gegenprobe TDD-Gate (§5.1): Code ändern ohne Testlauf → `git commit` muss **weiterhin**
    am TDD-Gate scheitern. Scheitert es nicht, ist §5.1 nicht sauber gelöst.

**Scheibe G — Doku (Golden Rule 7 gilt für diesen PR selbst).**
18. `CLAUDE.md` §4 um die Docs-Gate-Zeile + Override ergänzen; bei Golden Rule 7 auf das Gate
    verweisen. `docs/ai-system.md` §6 „Quality-Gates" um das Gate erweitern.
    `docs/agents.md` beim `docs-agent` ergänzen, dass das Gate ihn auslöst.
19. `docs/README.md` braucht **keinen** neuen Eintrag (keine neue Doku-Datei).

**Scheibe H — Gates + PR.**

```bash
npm run format:check     # .claude/settings.json muss Prettier-konform sein
npm run lint
npm run typecheck
npm run test             # enthaelt jetzt test:hooks
npm run build
```

20. `code-review-agent` (CLAUDE.md §3). `security-agent` ist **nicht** zwingend — es gibt kein
    neues User-Input-Processing und keinen externen API-Call; der Hook führt allerdings
    `git`-Kommandos aus, deshalb ein kurzer Review-Punkt: keine unquotierte Variablen-Expansion,
    kein `eval`, kein Kommando aus Payload-Daten (§5.3).

**Commit-Messages (Conventional Commits, `.claude/rules/git-and-commits.md`):**

```
test(hooks): add failing harness for the docs freshness gate

Goal: Rot-Zustand fuer docs-gate.sh nach Plan-Kontrakt (Spec 9).
Why:  TDD-Pflicht — der Hook ist ueber stdin/Exit-Code/Marker vollstaendig testbar.
How:  .claude/hooks/docs-gate.test.sh mit temporaerem Git-Fixture und 22 Faellen.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```
chore(hooks): block commits when structural changes outrun the docs

Goal: Golden Rule 7 durchsetzen statt nur appellieren.
Why:  Spec 9 — der docs-agent lief bisher nur, wenn eine Session dem Workflow folgte.
How:  .claude/hooks/docs-gate.sh (differenzierte Pfad-zu-Doku-Zuordnung, Marker in
      $GIT_DIR/claude-docs-dirty, Exit 2 bei git commit), Registrierung in
      .claude/settings.json, test:hooks in npm run test.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```
docs(gates): document the docs freshness gate and its override

Goal: Das neue Gate steht dort, wo die anderen Gates stehen.
Why:  Ein Gate, das niemand kennt, wird als Bug erlebt.
How:  CLAUDE.md §4, docs/ai-system.md §6, docs/agents.md.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## 5. Risiken & offene Fragen

### 5.1 BLOCKER — dieses Feature schaltet versehentlich das TDD-Gate ab

**Belegt:** `~/.claude/hooks/tdd-gate.sh:47-48`

```bash
# 2) Projekt-eigene Hooks haben Vorrang.
[ -d "$DIR/.claude/hooks" ] && exit 0
```

Sobald `Pokekon/.claude/hooks/` **existiert**, beendet sich das globale Gate für Pokekon
sofort — für **alle drei** Events. Pokekon verlöre damit exakt in dem Moment sein
Test-/Lint-/Typecheck-Gate, in dem es ein Doku-Gate bekommt. Das ist ein Netto-Rückschritt
und widerspricht Entscheidung 3 („Ein Commit kann an beiden Gates unabhängig scheitern").
**Belegter Präzedenzfall:** `Doewe/.claude/hooks/` existiert und enthält kein `tdd-gate.sh` —
dort ist das TDD-Gate heute schon still abgeschaltet.

**Entscheidung nötig, bevor irgendetwas angelegt wird:**

| Option | Was passiert | Kosten / Risiko |
|---|---|---|
| **A (Empfehlung)** | `tdd-gate.sh:48` wird präzisiert zu `[ -f "$DIR/.claude/hooks/tdd-gate.sh" ] && exit 0` — Vorrang nur noch, wenn das Projekt ein **eigenes TDD-Gate** mitbringt | Eine Zeile. Wirkt global auf alle Workspace-Repos; für Doewe **stellt sie das TDD-Gate wieder her** (könnte dort erstmals Commits blocken — bewusste Nebenwirkung, muss Konrad wollen). `~/.claude` ist **kein Git-Repo** (verifiziert) → Änderung ist unversioniert, per Hand, ohne PR |
| **B** | `tdd-gate.sh` wird nach `Pokekon/.claude/hooks/` kopiert | Duplikat mit garantierter Drift; widerspricht „bestehende Utilities wiederverwenden" (`.claude/rules/code-style.md`) |
| **C** | Hook liegt außerhalb von `.claude/hooks/`, z. B. `Pokekon/.claude/gates/docs-gate.sh` | Global-Gate bleibt aktiv, **aber** weicht vom Akzeptanzkriterium `specs/docs-sync-automation.md:46` („Ort: `.claude/hooks/`") ab → braucht einen Spec-Nachtrag, kein stilles Abweichen |

Ich wähle das nicht selbst. **Empfehlung: A**, weil sie die Regel repariert statt sie zu
umgehen und den identischen Effekt für Repos mit echtem Eigen-Gate behält.
Fällt die Wahl auf C, ändern sich in diesem Plan nur die Pfade — Vertrag, Tests und
Zuordnungstabelle bleiben unberührt.

### 5.2 Falsch-Positive und die Kosten des Blocks

- Ein Refactoring ohne fachliche Änderung (internes Umbenennen in `routes/meta.ts`) markiert
  dirty, obwohl keine Doku betroffen ist. **Bewusst akzeptiert** (Spec `:37-39`: „lieber ein
  Hinweis zu viel"), Ausweg ist der dokumentierte Override.
- Der Marker überlebt Sessions und Branch-Wechsel (er liegt im Git-Verzeichnis, nicht im
  Arbeitsbaum) — wie bei `tdd-gate.sh`. Nach einem `git switch` kann ein Block auftauchen,
  der zur vorigen Arbeit gehört. **Bewusst akzeptiert**, im Block-Text steht der Override.
- Ein Doku-Update per `Bash` (`sed -i`, Skript) **löscht keine Marker-Zeilen** — nur `Edit`/
  `Write`/`MultiEdit` auf `docs/*.md`. Bekannte Lücke, kein Fix in v1.
- Ein `git commit`, der **nur** Doku enthält, wird trotzdem geblockt, solange Marker-Zeilen
  offen sind. In der Praxis löscht genau dieses Doku-Editieren die Zeilen vorher.
- Ein Agent, der die Doku-Zeilen „wegräumen" will, könnte auf die Idee kommen, die genannten
  `docs/*.md` sinnlos anzufassen. Das ist keine technische, sondern eine Verhaltensfrage —
  `CLAUDE.md`/`docs/agents.md` sollen in Scheibe G ausdrücklich sagen, dass das Gate ein
  **Hinweis auf inhaltliche Arbeit** ist, kein zu befriedigender Zähler.

### 5.3 Sicherheit / Robustheit des Skripts

- **Payload-Daten dürfen nie ausgeführt werden.** `CMD` wird ausschließlich mit `grep -qE`
  geprüft, `FILEPATH` nur in Parameter-Expansion und `case`-Globs verwendet — kein `eval`,
  keine Kommandosubstitution auf Payload-Inhalt. Jede Variable in doppelten Anführungszeichen.
- Ein Dateiname mit Tab oder Newline würde das Marker-Format verletzen. Praktisch
  ausgeschlossen in diesem Repo; Mitigation: solche Zeilen werden verworfen und geloggt statt
  geschrieben (im `implementer`-Umfang enthalten).
- Der Hook ruft `git status --porcelain` (nur Arm B). Bei sehr großem Arbeitsbaum kostet das
  Millisekunden; `timeout: 10` in `settings.json` ist reichlich Puffer.

### 5.4 Bewusst enge erste Version (Scope-Hinweis)

`apps/web/src/pages/**`, `apps/web/src/store/**`, `apps/web/src/lib/**`, `apps/api/src/lib/**`
und `apps/api/src/jobs/**` sind **nicht** in der Zuordnung, obwohl dort strukturändernde Arbeit
passiert (z. B. `apps/api/src/lib/synthesisFacts.ts` aus Spec 8). Grund: Die Akzeptanzkriterien
nennen genau vier Pfad-Gruppen (`specs/docs-sync-automation.md:49-51`), und jede zusätzliche
Gruppe erhöht die Falsch-Positiv-Rate, bevor Erfahrungswerte vorliegen. **Offene Frage an
Konrad:** sollen `apps/api/src/jobs/**` → `docs/data-flow.md` und `apps/web/src/pages/**` →
`docs/architecture.md` §Frontend gleich mit hinein, oder erst nach zwei Wochen Praxis?
Ich setze sie ohne Ansage **nicht** ein.

### 5.5 Produktionsdaten / Irreversibles

Keine. Kein Schema, keine Migration, kein Backfill, kein Laufzeit-Pfad der App berührt.
`deploy.yml` ignoriert nur `docs/**`, `apps/docs/**` und `docs.yml`; `.claude/**` steht in
keinem `paths`-Filter — ein Merge dieses PRs auf `main` löst also einen Railway-Deploy mit
unverändertem App-Bundle aus (harmlos, aber erwartbar).

### 5.6 Performance

Pro Tool-Aufruf ein Bash-Prozess + einige `python3`-Aufrufe für die Feld-Extraktion (Muster
`tdd-gate.sh`) und höchstens ein bis zwei `git`-Aufrufe. **Vermutung** (nicht gemessen):
< 200 ms. Wenn das im Alltag stört, ist der offensichtliche Hebel, `field()` auf **einen**
Python-Aufruf für alle Felder zu reduzieren — bewusst nicht in v1, um dem belegten Muster
der beiden Referenz-Hooks zu folgen.

---

## 6. Definition of Done

- [ ] §5.1 ist **entschieden** und umgesetzt; nachweislich blockt in Pokekon weiterhin auch
      das TDD-Gate (manuell verifiziert, nicht angenommen — Scheibe F, Schritt 17).
- [ ] `.claude/hooks/docs-gate.sh` existiert, ist ausführbar, enthält keinen Pfad, der
      Doku-Inhalte schreibt.
- [ ] `.claude/hooks/docs-gate.test.sh` deckt alle 22 Fälle aus §3.8 ab und ist grün.
- [ ] `npm run test` (Root) führt `test:hooks` mit aus; CI (`ci.yml`) bleibt grün.
- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run build` grün.
- [ ] Manuelle Checkliste Scheibe F abgearbeitet: Markierung, Block, Selbst-Löschung durch
      Doku-Edit, Override — jeweils real gesehen, nicht abgeleitet.
- [ ] Fehlerpfade abgedeckt: kaputtes JSON, kein Git-Repo, fehlendes `docs/` → Exit 0,
      nichts auf stderr.
- [ ] Der Hook schreibt nur nach `$GIT_DIR/claude-docs-dirty`, `$GIT_DIR/claude-docs-gate.log`
      und (additiv) `~/.claude/logs/agentic-events.jsonl` — sonst nirgendwo hin.
- [ ] `CLAUDE.md` §4, `docs/ai-system.md` §6 und `docs/agents.md` beschreiben Gate und Override.
- [ ] `code-review-agent` gelaufen, die Punkte aus §5.3 explizit adressiert.
- [ ] PR-Beschreibung auf Deutsch mit Testschritten; Merge nur mit grüner CI.
