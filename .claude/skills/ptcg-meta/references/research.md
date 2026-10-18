# Meta-Recherche

## Frische
Für das *aktuelle* Meta nur Quellen/Turniere der letzten 7 Tage verwenden. Undatierbare Quellen als potenziell veraltet markieren. Jede Angabe mit Datum festhalten.

## Quellen (Priorität)
**Turniere & Meta**
1. https://play.limitlesstcg.com/tournaments?game=PTCG — laufende/kommende Turniere
2. https://play.limitlesstcg.com/tournaments/completed?game=PTCG — Ergebnisse, Top-8/16-Listen
3. https://labs.limitlesstcg.com/ — Statistiken, Win-Rates, Trends (nur IRL-Events)

**Japan (nur Ausblick)**
4. https://pokecabook.com/ — JP-Sets erscheinen nicht zeitgleich im Westen; JP-Legalität/Rulings nie auf westliche Formate übertragen.

**Regeln & Legalität (westlich/DE maßgeblich)**
5. https://compendium.pokegym.net/ — Rulings
6. https://www.pokemon.com/de/play-pokemon/betreff/turniere-regeln-und-ressourcen — Turnierregeln
7. https://www.pokemon.com/static-assets/content-assets/cms2-de-de/pdf/trading-card-game/rulebook/por_rulebook_de.pdf — Regelbuch DE
8. https://www.pokemon.com/de/play-pokemon/betreff/liste-der-unzulaessigen-karten-im-pokemon-sammelkartenspiel — Bannliste (verbindlich)

## Vorgehen
1. Datum prüfen, Veraltetes verwerfen.
2. Abgeschlossene Turniere: Archetypen in Top-Platzierungen, Format (Standard/Expanded), Region, BO1/BO3 (siehe `limitless-api-schema.md`).
3. Tiers aus Platzierungshäufigkeit: Tier 1 dominant · Tier 2 spielbar · Tier 3 Rand; auf-/absteigende Archetypen gegenüber dem letzten Stand.
4. Bannliste, neue Rulings/Errata, Regel-Updates prüfen.
5. JP-Ausblick getrennt führen.

## Ergebnis-Format
```
## PTCG Meta Update — <Datum>
### Datenlage        Quellen, Zeitraum, nicht erreichbare/veraltete Quellen
### Format           aktives Format, legale Sets, Bannliste (Änderungen mit Datum)
### Tiers            Tier 1/2/3 mit Platzierungen/Win-Rates
### Turniere (7 Tage) Name, Datum, Format, Top 3
### Rulings          neu, mit Quelle + Datum
### JP-Ausblick      (nicht westlich anwendbar)
### Offene Punkte    ⚠️/❌-Einträge
```
