---
description: Eine Frontend-Logikdatei nach dem Evolution-Plan ins Backend portieren
---

Portiere die genannte Logik aus `apps/web/src/lib` ins `apps/api`-Backend — gemäß `docs/backend-evolution-plan.md` (Abschnitte 4–6).

**Zu portieren:** $ARGUMENTS  (z. B. `metaFetch`, `deckComparison`, `battleLogParser`, `deckPerformanceStats`, `battleLogAnalysis`)

Leitplanken:
1. **Lies zuerst** die Quelldatei in `apps/web/src/lib/` UND das aktuelle `apps/api/src/db/schema.ts` + Routen.
2. **Geteilte Logik** (Typen, reiner Parser) nach `packages/shared` ziehen, nicht duplizieren — Workspace ist dafür vorbereitet.
3. **Schema zuerst:** nötige Tabellen/Felder in `schema.ts`, dann `npm run db:generate -w @pokekon/api`, Migration committen.
4. **Einmal beim Schreiben rechnen, nicht beim Lesen** — teure Aggregate als Materialized View oder On-write-Update; `parserVersion` mitschreiben.
5. **Secrets serverseitig** (Railway-Variablen), nie im Client.
6. Route + Test ergänzen; `data-analyst`/`meta-analyst`-Konsumenten im Frontend auf die neue API umstellen, ohne neue Datendoppelung.
7. **Gates** grün, Doku in `docs/` aktualisieren (besonders `architecture.md`, das noch „zero-backend" behauptet).

Liefere: Schema-Diff, Migration, neue Route(n), Tests, Gate-Ergebnis.
