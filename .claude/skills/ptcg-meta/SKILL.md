---
name: ptcg-meta
description: Pokémon-TCG-Fachwissen für Pokekon — aktuelle Meta-Daten recherchieren (Limitless, Regeln, Bannliste) und daraus Deck-/Matchup-Empfehlungen ableiten. Nutzen bei Meta-Recherche, Turnierdaten, Archetyp-Einordnung, Deck-Empfehlungen oder wenn ein Feature Limitless-Daten/Bo1-Formate betrifft.
---
# PTCG-Meta

Zwei Aufgaben, je eine Referenz — nur die lesen, die gebraucht wird:

- **Recherche** (externe Turnier-/Regel-Daten holen) → [references/research.md](references/research.md). Breite Web-Recherche in einem Subagent laufen lassen, damit der Hauptkontext sauber bleibt; dem Subagent den Inhalt der Referenz mitgeben.
- **Analyse & Empfehlung** (Zahlen in Deck-/Matchup-Entscheidungen übersetzen) → [references/analysis.md](references/analysis.md).

Fakten zu Datenquellen, bereits verifiziert:
- [Limitless-API-Felder](references/limitless-api-schema.md) — `isOnline`, `phases.mode` (BO1/BO3), `platform`
- [Limitless-Labs-Metriken](references/limitless-labs-metrics.md) — Share/Win%/Record; Labs = nur IRL-Daten
- [Bo1-/Bo3-Formate lokaler Turniere](references/bo1-format-facts.md)

## Immer gilt
- **Westliches Format** ist Standard. Japanische Daten (z. B. pokecabook) nur als „JP Format Only" kennzeichnen, nie in westliche Bewertungen mischen.
- **Meta-Daten erst ab Rotation** (Cutoff 2026-03-26).
- Aussagen kennzeichnen: ✅ Belegt (Quelle + Datum) · ⚠️ Vermutung · ❌ Unbekannt. Tiers nur aus Platzierungsdaten, nicht aus Meinung.
- Empfehlungen sagen, welcher Hebel gemeint ist: **Liste** (Karte tauschen) oder **Spiel** (Zug anders spielen).
