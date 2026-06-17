---
description: Dokumentation mit dem aktuellen Code-Stand abgleichen und aktualisieren
---

Rolle: `docs-agent`. Bringe die Dokumentation in `docs/` mit dem tatsächlichen Code in Einklang. **Erst Code lesen, dann schreiben.**

**Fokus:** $ARGUMENTS  (leer = vollständiger Abgleich)

Aufgaben:
1. Prüfe, ob `docs/architecture.md` noch „zero-backend SPA" behauptet — falls ja, auf die reale Hono+Postgres-Architektur korrigieren (siehe `docs/backend-evolution-plan.md` Abschnitt 1).
2. Verifiziere alle **Mermaid-Diagramme** gegen den aktuellen Komponenten-/Datenstand.
3. Prüfe **Cross-Links** zwischen den `.md`-Dateien — alle relativen Links müssen auflösen (relevant für den Starlight-Viewer).
4. Halte `docs/README.md` (Index) und `docs/ai-system.md` (KI-System) aktuell.
5. Markiere veraltete Aussagen explizit, statt sie still zu lassen.

Liefere: Liste geänderter Docs + welche Drift behoben wurde.
