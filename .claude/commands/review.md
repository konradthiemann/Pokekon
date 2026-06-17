---
description: Strukturiertes Code-Review der aktuellen Änderungen
---

Führe ein kritisches, rein lesendes Review durch (Rolle: `code-review-agent`, plus `security-agent` wenn zutreffend).

**Scope:** $ARGUMENTS  (leer = aktuelle uncommitteten Änderungen / der aktuelle Branch)

Prüfe und gib strukturierte Findings mit `datei:zeile` und Schweregrad (🔴 blockierend / 🟡 sollte / 🟢 nice):
- **TypeScript:** keine unbegründeten `any`, korrekte Typen, Null-/Undefined-Handling.
- **React:** Memoization, Effect-Dependencies, Smart/Presentational-Trennung, Empty-States.
- **Dexie/Drizzle:** Index-Nutzung, Transaktionen, keine N+1-Lesezugriffe.
- **Security:** User-Input-Validierung (Deck-Import, Battle-Log-Paste), keine Secrets im Client, sichere externe Calls.
- **Anti-Halluzination:** falls KI-Analyse berührt — Evidence-Quote-Pflicht und `temperature=0` intakt?
- **Gates:** laufen `typecheck`, `lint`, `test`? Fehlende Tests benennen.

Keine Implementierung — nur Befund + konkrete Empfehlung pro Finding.
