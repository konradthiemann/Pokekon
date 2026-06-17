---
description: Neues Feature nach dem Standard-Flow umsetzen (Plan → Implement → Review → Docs)
---

Setze das folgende Feature im `pokekon`-Monorepo um und halte dich strikt an die Leitplanken in `CLAUDE.md`.

**Feature:** $ARGUMENTS

Vorgehen:
1. **Lesen.** Identifiziere und lies die betroffenen Dateien (`apps/web/src/...`, ggf. `apps/api/src/...`). Keine Behauptung über Code ohne ihn gelesen zu haben.
2. **Planen.** Erstelle (oder triggere `plan-agent` für) einen kurzen Plan: betroffene Dateien, Datenfluss, DB-Impact, Edge-/Empty-States, Tests.
3. **Implementieren.** TDD wo sinnvoll (`*.test.ts` neben der Datei). Saubere Trennung Daten-/Logik-/Präsentationsschicht. Keine Secrets im Client, keine kostenpflichtigen Dependencies.
4. **Prüfen.** `code-review-agent`; bei neuem User-Input oder API-Call zusätzlich `security-agent`.
5. **Dokumentieren.** Betroffene Docs in `docs/` aktualisieren (`docs-agent`).
6. **Gates.** `npm run typecheck && npm run lint && npm run test` müssen grün sein, bevor du „fertig" meldest.

Liefere am Ende: geänderte Dateien, ausgeführte Gate-Befehle mit Ergebnis, offene Punkte.
