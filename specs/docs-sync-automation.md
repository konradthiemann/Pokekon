# Spec 9: Automatisierte Doku-Aktualität (Hook-gestützt)

> Teil 9 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Unabhängiger Tooling-Strang (Entscheidung aus dem Briefing: **im selben Rework-Fluss**, aber
> inhaltlich losgelöst von Spec 2–8) — kann parallel zu diesen laufen, sobald Kapazität da ist.

## Problem/Ziel

CLAUDE.md Golden Rule 7 verlangt: "Strukturändernde Arbeit aktualisiert die betroffene Doku
in `docs/` im selben Zug." Der Standard-Workflow (CLAUDE.md §3) sieht dafür bereits einen
`docs-agent`-Schritt vor (`implementieren → code-review-agent + security-agent → docs-agent →
Gates prüfen`) — aber **es gibt aktuell keine Durchsetzung**: kein Projekt-`.claude/settings.json`
mit Hooks (nur `.vscode/settings.json` existiert), der `docs-agent` läuft nur, wenn eine
Session dem Workflow tatsächlich folgt. Eine schnelle/unvollständige Session kann Code ändern,
ohne dass `docs/features.md`, `docs/architecture.md` etc. je geprüft werden.

**Referenz-Muster, das nicht 1:1 übertragbar ist:** `~/.claude/hooks/infra-dashboard-sync.sh`
(global, für `agentic-infra-dashboard`) markiert bei relevanten Datei-Änderungen einen
"dirty"-Zustand und generiert beim `Stop`-Event **automatisch** einen neuen Daten-Snapshot,
den es auf einen bot-only `data`-Branch pusht — komplett ohne LLM-Aufruf, weil der Snapshot
ein rein mechanisch aus dem Dateisystem generierter JSON-Datensatz ist (immer korrekt, per
Definition). **Pokekons Doku ist das nicht** — `docs/features.md` & Co. sind Prosa, von einem
Agenten/Menschen geschrieben, nicht mechanisch aus dem Code ableitbar. Ein Skript kann
"Datei X wurde geändert, Doku Y ist vermutlich veraltet" **erkennen**, aber nicht **korrekt
neu schreiben** — das bräuchte einen LLM-Aufruf (den `docs-agent`), nicht ein Bash-Skript.

**Ziel:** Ein Hook-Mechanismus, der zuverlässig **erkennt**, wenn strukturändernde Arbeit ohne
begleitendes Doku-Update passiert ist — und daraus je nach gewünschtem Automatisierungsgrad
entweder einen Hinweis, einen Block (analog zum bestehenden `tdd-gate.sh`-Hook im Workspace-
Root) oder einen automatisch angestoßenen `docs-agent`-Lauf macht.

## User Stories

- Als Konrad will ich nicht mehr selbst daran denken müssen, nach einer Schema-/Route-Änderung
  `docs-agent` manuell aufzurufen — das Vergessen ist der eigentliche Fehlermodus, nicht
  fehlender Wille.
- Als Konrad will ich, dass die Erkennung "Doku könnte veraltet sein" nicht durch unsichtbare,
  automatisch generierte Falschaussagen ersetzt wird — lieber ein Hinweis zu viel als eine
  von einer KI unbeaufsichtigt "aktualisierte" Doku, die niemand geprüft hat.
- Als zukünftiger Mitwirkender/Reviewer will ich mich darauf verlassen können, dass
  `docs/features.md` den tatsächlichen Code-Stand beschreibt, ohne jede Zeile selbst
  gegenzuprüfen.

## Akzeptanzkriterien

- [ ] Neuer Hook (Ort: `.claude/hooks/` **innerhalb von Pokekon**, projekt-lokal — anders als
      das globale `infra-dashboard-sync.sh`, weil diese Logik nur für dieses eine Repo gilt),
      registriert in einem neuen `Pokekon/.claude/settings.json`.
- [ ] `PostToolUse`-Matcher auf strukturändernde Pfade (mindestens: `apps/api/src/db/schema.ts`,
      `apps/api/src/routes/*.ts`, `packages/shared/src/*.ts`, neue/gelöschte Dateien unter
      `apps/web/src/components/`) markiert einen "docs-dirty"-Zustand, analog zum bestehenden
      `mark_dirty`-Muster in `infra-dashboard-sync.sh`.
- [ ] Der Hook **schreibt keine Doku-Inhalte selbst** — er markiert nur Zustand (dirty/clean)
      und die betroffenen Bereiche (welche `docs/*.md`-Dateien laut einer einfachen
      Pfad-zu-Doku-Zuordnung betroffen sein könnten).
- [ ] Bei `git commit` (analog zum bestehenden globalen `tdd-gate.sh`-Muster) wird geprüft, ob
      seit der letzten Doku-Aktualisierung strukturändernde Arbeit stattfand — Verhalten bei
      Treffer ist Teil der Umsetzungsplanung (Hinweis vs. Block, siehe Offene Fragen).
- [ ] Bewusstes Übersteuern ist möglich (analog zu `rm .git/claude-tdd-dirty` im
      Workspace-Root) für Fälle, in denen die Heuristik fälschlich "dirty" meldet.
- [ ] Der Hook ist best-effort und blockiert eine Session nie durch einen eigenen Fehler
      (Fehler landen in einem Log, nie sichtbar als Absturz) — dieselbe Eigenschaft wie
      `infra-dashboard-sync.sh`.

## Out of Scope

- Automatisches, unbeaufsichtigtes Umschreiben von Doku-Inhalten durch ein Skript ohne
  LLM-Review — bewusst nicht Teil dieser Spec (siehe Problem/Ziel: Prosa ist nicht mechanisch
  korrekt generierbar).
- Übertragung auf andere Workspace-Repos — diese Spec ist Pokekon-lokal (`.claude/settings.json`
  im Repo, nicht global unter `~/.claude/`).
- Der `docs-agent` selbst wird inhaltlich nicht verändert — diese Spec baut nur die
  Erkennungs-/Anstoß-Mechanik drumherum.

## Offene Fragen

- **Automatisierungsgrad:** Reiner Hinweis bei `git commit` (wie eine Warnung, kein Block),
  ein harter Block analog zu `tdd-gate.sh` (verhindert den Commit, bis Doku angefasst wurde),
  oder ein automatisch angestoßener `docs-agent`-Lauf **mit** anschließendem Pflicht-Review
  durch Konrad vor dem Commit (mittlere Automatisierung, kein unbeaufsichtigtes Schreiben)?
  Das ist die zentrale Design-Entscheidung dieser Spec.
- **Pfad-zu-Doku-Zuordnung:** Reicht eine grobe, hart hinterlegte Zuordnung (z. B. "Änderung
  an `schema.ts` → `docs/database.md` vermutlich betroffen"), oder soll das differenzierter
  sein? Eine zu grobe Zuordnung erzeugt viele Fehlalarme, eine zu feine ist pflegeintensiv.
- **Verhältnis zum bestehenden `tdd-gate.sh`:** Soll das ein eigener, zusätzlicher Commit-Hook
  sein, oder in denselben Mechanismus integriert werden (ein Commit könnte dann theoretisch an
  zwei Gates gleichzeitig scheitern — Test-Frische und Doku-Frische)? Getrennte Hooks sind
  einfacher zu verstehen, ein kombinierter Hook vermeidet doppelte Infrastruktur.
