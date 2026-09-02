# Spec 6: Spieltheoretische Meta-Schicht (Nash-Gleichgewicht + Replicator-Dynamik)

> Teil 6 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Baut auf Spec 2 (korrekte Win-Rates) und Spec 3 (Konfidenzbänder) auf — eine
> Gleichgewichtsberechnung auf unkorrigierten oder unsicherheits-blinden Win-Rates würde ein
> falsches Ergebnis nur präziser aussehen lassen.
> Entscheidung aus dem Briefing: **volle spieltheoretische Tiefe wie im Referenzpapier**
> (echtes Nash-Gleichgewicht, keine vereinfachte Heuristik).

## Problem/Ziel

Die bestehende Field-Score-Engine (`packages/shared/src/fieldWinRate.ts`) beantwortet "wie gut
performt Deck A gegen das aktuelle/erwartete Feld" — eine reine Erwartungswert-Rechnung gegen
eine gegebene Feld-Verteilung. Sie beantwortet **nicht**, ob diese Feld-Verteilung selbst
rational ist, und kann daher ein "Popularitäts-Paradox" nicht erkennen: ein Deck kann hohen
Meta-Share haben, obwohl es gegen eine *rationale* Gegner-Verteilung schlecht abschneidet
(siehe Vision-Dokument §3.5, belegt am realen PTCG-Beispiel Dragapult/Grimmsnarl,
Quelle: arxiv 2607.08692). Weder Limitless noch TrainerHill exponieren diese Bewertung
gegenüber Spielern — das ist die im Vision-Dokument identifizierte Differenzierungs-Lücke.

**Ziel:** Eine optionale, zusätzliche Analyse-Ebene oberhalb des bestehenden Field-Score, die
(a) ein Nash-Gleichgewicht über die aktuellen Meta-Archetypen berechnet (welche Deck-Mischung
ist gegen sich selbst optimal, unabhängig von der beobachteten Popularität) und (b)
Replicator-Dynamik nutzt, um eine Trendrichtung ("dieser Archetyp gewinnt/verliert gerade an
Fitness") zu zeigen — nicht nur eine statische Momentaufnahme.

## Methodischer Rahmen (aus Quelle 1 der Vision-Datei, direkt übertragbar)

1. Eingabe ist die bereits vorhandene Matchup-Matrix (`tournament_matchups`, nach Spec 2/3
   korrigiert und konfidenzbewertet) plus die aktuellen Meta-Shares (`meta_snapshots`).
2. **Exhaustive Enumeration über Support-Teilmengen** zur Verifikation eines symmetrischen
   Nash-Gleichgewichts (Referenzpapier: `2^14 − 1` Teilmengen bei 14 Archetypen). Das ist der
   Punkt mit dem größten Rechenaufwand — siehe Offene Fragen zur Archetypen-Zahl.
3. **Robustheit statt Punktschätzung:** Das Referenzpapier verifiziert die Ausschluss-
   Ergebnisse zusätzlich per Monte-Carlo-Resampling über die Wilson-Intervalle (aus Spec 3!)
   der Matchup-Zellen — ein Deck, das in 78 % der Resampling-Läufe ausgeschlossen bleibt, ist
   eine robustere Aussage als die exakte Gleichgewichts-Zusammensetzung selbst (die im
   Referenzpapier nur in 2,1 % der Läufe exakt reproduzierbar war). **Diese Unterscheidung
   (robuster Ausschluss vs. fragile exakte Zusammensetzung) muss in der UI ankommen**, sonst
   wird eine fragile Zahl als scheinbar exakte Empfehlung präsentiert.
4. **Replicator-Fitness** als separate, einfachere Zusatzberechnung für die Trendrichtung
   ("Fitness steigt/fällt") — läuft auf denselben Eingabedaten, ist aber unabhängig vom
   Gleichgewicht berechenbar und eignet sich für wöchentliche Updates (passt zum bestehenden
   `period`-Konzept in `meta_snapshots`).
5. **Bo1/Bo3-Konvertierung** (`P_Bo3 = 3p² − 2p³`, bereits in Spec 2 als
   `packages/shared/src/bestOf.ts` geplant) ist relevant, falls die Gleichgewichtsberechnung
   je auf Bo3-Turnierformate angewendet werden soll — für die Online-Bo1-Baseline (Pokekons
   primärer Fokus) nicht nötig.

## User Stories

- Als Spieler, der wissen will, was er spielen soll, will ich sehen, ob mein bevorzugtes Deck
  im Gleichgewicht überhaupt eine rationale Wahl ist, statt mich nur an dessen Popularität zu
  orientieren.
- Als Spieler, der die Meta-Seite regelmäßig checkt, will ich eine Trendrichtung pro Archetyp
  sehen (steigt/fällt gerade an Stärke), nicht nur eine statische Wochen-Momentaufnahme.
- Als Konrad, der diese Funktion auch als Portfolio-Beleg zeigen will, will ich, dass die
  Darstellung ehrlich zwischen robusten und fragilen Aussagen unterscheidet, statt
  Pseudo-Präzision zu suggerieren (passt zum bestehenden Anti-Halluzinations-Anspruch der
  KI-Analyse, CLAUDE.md Golden Rule 6 — dieselbe Ehrlichkeits-Haltung, nur statistisch statt
  sprachmodell-bezogen).

## Akzeptanzkriterien

- [ ] Neue reine Berechnungsfunktion(en) in `packages/shared` (kein I/O), die aus einer Liste
      von Archetypen + vollständiger Matchup-Matrix ein symmetrisches Nash-Gleichgewicht
      berechnet (Support-Menge + Gewichte).
- [ ] Golden-Test mit den öffentlich nachvollziehbaren Zahlen aus dem Referenzpapier
      (14-Archetypen-PTCG-Fall, Jan–Feb 2026) als Regressionsanker, soweit die dortigen
      Rohdaten/Matchup-Werte rekonstruierbar sind — sonst ein selbst konstruiertes,
      dokumentiertes Beispiel mit von Hand verifizierbarem Ergebnis.
- [ ] Monte-Carlo-Robustheits-Check (Resampling über die Wilson-Intervalle aus Spec 3):
      Ergebnis liefert für jeden Archetyp einen "Ausschluss-Robustheits"-Wert (z. B. "in X %
      der Resampling-Läufe nicht im Gleichgewichts-Support"), nicht nur eine binäre
      Ja/Nein-Zugehörigkeit zum exakten Gleichgewicht.
- [ ] Replicator-Fitness-Berechnung als separate Funktion, nutzt Wochen-über-Wochen-Daten aus
      `meta_snapshots`, liefert eine Richtung (steigend/fallend/stabil) pro Archetyp.
- [ ] UI zeigt beides klar getrennt: (a) robuste Aussagen (z. B. "X ist in 78 % der
      Robustheits-Läufe raus") prominent, (b) die exakte Gleichgewichts-Zusammensetzung als
      Detail mit explizitem Fragilitäts-Hinweis, wenn die Robustheit niedrig ist.
- [ ] Feature ist klar als "experimentell/zusätzlich" gekennzeichnet und ersetzt den
      bestehenden Field-Score nicht — beide Ansichten bleiben nebeneinander verfügbar.

## Out of Scope

- Änderungen an der bestehenden Field-Score-Berechnung selbst (`fieldWinRate.ts`) — diese
  Spec ergänzt eine neue, unabhängige Analyse-Schicht.
- Anwendung auf persönliche Decks/Empfehlungen (Spec 5) — diese Spec bleibt auf Meta-Ebene
  (welche Archetypen sind im Gleichgewicht), nicht auf Karten-Ebene innerhalb eines Decks.
- Echtzeit-Neuberechnung bei jedem Seitenaufruf — angesichts des Rechenaufwands (siehe Offene
  Fragen) ist ein periodischer Batch-Job (analog `syncMeta.ts`) wahrscheinlicher als ein
  On-Demand-Endpoint, aber das ist Teil der Planung.

## Offene Fragen

- **Rechenaufwand bei mehr als ~15–18 Archetypen:** Exhaustive Enumeration ist `2^n − 1`
  Teilmengen. Das Referenzpapier nutzte 14 Archetypen (69,5 % des Feldes); Pokekons Meta kann
  je nach Zeitfenster mehr umfassen. Muss die Eingabemenge auf die Top-N Archetypen begrenzt
  werden (mit dokumentierter Begründung, welcher Anteil des Feldes das abdeckt), oder ist ein
  effizienterer Algorithmus (z. B. Linear-Programming-basierte Nash-Berechnung für
  Zwei-Spieler-Nullsummenspiele) vorzuziehen? Das ist eine substanzielle algorithmische
  Entscheidung für die Planungsphase.
- **Batch- vs. On-Demand-Berechnung:** Periodischer Job (wöchentlich, analog `syncMeta.ts`)
  mit persistiertem Ergebnis, oder On-Demand mit Caching? Beeinflusst, ob eine neue
  `apps/api/src/jobs/*.ts`-Datei plus Tabelle nötig ist oder eine reine
  Request-Zeit-Berechnung mit In-Memory-Cache reicht.
- **Darstellung der Robustheits-Nuance für Laien:** Die Unterscheidung "robuster Ausschluss"
  vs. "fragile exakte Zusammensetzung" ist statistisch wichtig, aber für Nicht-Statistiker
  potenziell verwirrend — insbesondere im Hinblick auf die "demo-mode-taugliche" Anforderung
  aus dem Briefing. Reicht eine einfache Sprache ("X ist in den meisten Szenarien keine gute
  Wahl") oder soll die Zahl selbst (78 %) sichtbar bleiben?
