# Spec 5: Von "was ist stark" zu "was ändert sich, wenn ich X tausche"

> Teil 5 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Baut auf Spec 2 (korrekte Win-Rates) und Spec 3 (Konfidenzbänder) auf — eine Prognose auf
> einer noch unkorrigierten oder unsicherheits-blinden Zahl wäre nur eine neue Fehlerquelle
> mit mehr Aufwand dahinter.

## Problem/Ziel

Zwei Engines berechnen unabhängig voneinander Empfehlungen, ohne sich zu kennen:

- **Field-Score-Engine** (`packages/shared/src/fieldWinRate.ts`, `computeFieldScores`) —
  bewertet ganze Decks gegen ein Feld, liefert eine Zahl (`fieldWinRatePct`).
- **Deck-Comparison-Engine** (`apps/web/src/lib/deckComparison.ts`,
  `fetchArchetypeComparison`) — vergleicht die eigene Kartenliste gegen Turnierlisten
  desselben Archetyps und schlägt Karten zum Hinzufügen/Entfernen/Anpassen vor
  (`suggestedAdds`/`suggestedRemoves`/`countAdjustments`, laut `docs/features.md` §9 basierend
  auf reiner Kopienhäufigkeit — **nicht** auf Performance-Auswirkung).

Eine Kartenempfehlung sagt heute nur "55 % der Top-Listen spielen diese Karte", nicht "wenn du
sie spielst, verbessert sich deine erwartete Field-WR voraussichtlich um Y Prozentpunkte".
Das ist der Kern dessen, was die Vision-Datei (§3.4) als Lücke zwischen "was ist stark" und
"was soll ich konkret ändern" beschreibt — und direkt das, was Konrad mit "Prognosen" meint.

**Datengrundlage bereits vorhanden (kein Neubau der Rohdaten nötig):** `tournament_standings`
speichert laut `docs/features.md` §2 pro Turnier-Teilnahme das gepflegte `decklist` (jsonb)
**und** `matchResults` (jsonb, `StandingMatchResult[]`, Gegner-Archetyp + W/L/T je Runde,
Migration `0009`). Das heißt: für jeden veröffentlichten Turnier-Platz ist bereits bekannt,
welche Karten gespielt wurden **und** wie die Person tatsächlich performt hat — die Zutaten
für eine echte Karte-zu-Performance-Korrelation liegen in der DB, werden aber laut
Code-Struktur (`deckComparison.ts` liest nur Kopienhäufigkeit, nicht `matchResults`) aktuell
nicht dafür verwendet.

**Ziel:** Kartenempfehlungen bekommen eine geschätzte Field-WR-Auswirkung, basierend auf dem
Performance-Unterschied zwischen Listen mit und ohne die betreffende Karte (kontrolliert auf
Archetyp), statt nur auf Kopienhäufigkeit.

## User Stories

- Als Spieler, der eine Kartenempfehlung sieht ("55 % der Top-Listen spielen X"), will ich
  wissen, ob X tatsächlich mit besserer Performance korreliert oder nur zufällig populär ist,
  damit ich nicht auf einen "Popularitäts-Paradox"-Fall hereinfalle (siehe Vision-Dokument
  §3.5 — dieselbe Falle wie bei ganzen Decks kann auch bei Einzelkarten auftreten).
- Als Spieler, der eine Karte ersetzen will, will ich eine grobe Prognose ("geschätzt +2 bis
  +5 Prozentpunkte Field-WR"), keine reine Ja/Nein-Empfehlung, damit ich die Größe des
  erwarteten Effekts einschätzen kann.
- Als Konrad, der die 14 bestehenden Recommendation-Regeln kennt: die bereits gute Regel 2
  ("kein erfundener Tech-Vorschlag", `docs/features.md` §10) soll durch echte Performance-
  Korrelation gestärkt werden, nicht durch eine neue Heuristik ersetzt, die denselben Fehler
  in neuer Form wiederholt.

## Akzeptanzkriterien

- [ ] Neue Funktion (Ort: `packages/shared`, da reine Berechnung ohne I/O — Präzedenzfall
      `fieldWinRate.ts`), die für eine gegebene Karte und einen Archetyp-Datensatz
      (Turnier-Decklisten + `matchResults`) zwei Gruppen bildet (Listen mit vs. ohne Karte)
      und einen Performance-Unterschied berechnet — Metrik (Field-WR-Delta, Platzierungs-
      Perzentil, o. ä.) ist Teil der Umsetzungsplanung.
- [ ] Given zu wenige Listen in einer der beiden Gruppen (Analogie zu Spec 3s
      Konfidenz-Denken), then wird kein falsch-präzises Delta ausgewiesen, sondern eine
      "nicht genug Daten für eine Prognose"-Kennzeichnung — **kein** neuer harter Cutoff ohne
      Unsicherheitsangabe (Rückfall in denselben Fehler wie vor Spec 3 wäre inkonsistent).
- [ ] `deckComparison.ts`s bestehende `suggestedAdds`/`suggestedRemoves`/`countAdjustments`
      werden um das geschätzte Performance-Delta ergänzt, ohne die bestehende
      Kopienhäufigkeits-Anzeige zu entfernen (beide Signale nebeneinander: "in 55 % der
      Top-Listen" **und** "korreliert mit +3pp Field-WR").
- [ ] Regel 2 aus `useRecommendations.ts` (Matchup-Schwäche + Verweis auf List Comparison,
      `docs/features.md` §10) verweist auf das neue Delta, wo verfügbar, statt nur auf die
      Kopienhäufigkeit.
- [ ] Ein Popularitäts-Paradox-Fall (Karte in vielen Listen, aber kein/negatives Performance-
      Delta) wird sichtbar **anders** dargestellt als eine Karte mit positivem Delta — nicht
      identisch als "häufig gespielt" präsentiert.

## Out of Scope

- Nash-Gleichgewicht/Replicator-Dynamik auf Decksebene → Spec 6 (diese Spec bleibt auf
  Einzelkarten-Ebene innerhalb eines Archetyps, keine Feld-weite Gleichgewichtsberechnung).
- Neue Datenerhebung — die Spec nutzt ausschließlich bereits persistierte
  `tournament_standings.decklist`/`matchResults`.
- Änderung der Copy-Häufigkeits-Logik selbst (`fetchArchetypeComparison`s bestehende 55%/20%-
  Schwellen) — die bleiben als eigenständiges Signal bestehen, siehe AC.
- Persönliche Matchup-Daten (eigene `opponentLogs`) als Eingabe für diese Korrelation — die
  Berechnung läuft ausschließlich auf öffentlichen Turnierdaten (Konsistenz mit dem
  "funktioniert ohne eigene Logs"-Prinzip aus Spec 4).

## Offene Fragen (entschieden, 2026-09-02)

- **Metrik für "Performance": Platzierungs-Perzentil.** Vergleicht die durchschnittliche
  Turnier-Platzierung von Listen mit vs. ohne Karte X. Nutzt direkt das bereits vorhandene
  `tournament_standings.placing` (kein Aufbau einer vollständigen Matchup-Matrix pro Liste
  nötig — das wäre der Field-WR-Delta-Ansatz gewesen, hier verworfen zugunsten der einfacheren,
  bereits datengedeckten Metrik).
- **Mindest-Stichprobengröße pro Karten-Gruppe: Wilson-artiger Konfidenzgedanke,** konsistent
  mit Spec 3s Prinzip (kein harter Cutoff, Unsicherheit bleibt sichtbar statt eine Gruppe unter
  einer Schwelle komplett auszublenden). Die genaue Herleitung für Perzentil- statt Win/Loss-
  Daten ist Teil der Planung — kein Wilson-Score-Reuse ohne Prüfung, ob die Annahmen (binomial)
  übertragbar sind.
- **Umfang: serverseitig für alle Meta-Archetypen vorberechnet,** nicht on-demand. Begründung:
  `tournament_standings` liegt bereits serverseitig in Postgres (`syncMeta`-Job), und Golden
  Rule §6 dieser CLAUDE.md verlangt, schwere Aggregationen dort statt in der App-Schicht zu
  bauen. Card-Delta-Berechnung läuft daher als serverseitiger Job/Route, nicht als Client-Fetch
  nach dem Vorbild des heutigen `fetchArchetypeComparison` (das live von Limitless liest, nicht
  aus der eigenen DB — bewusster Bruch mit diesem einen Client-Pattern, kein Präzedenzfall dafür
  nötig).

**Folge für die User Story oben (Klarstellung, kein Scope-Verlust):** Unter Entscheidung 1
(Platzierungs-Perzentil statt Field-WR-Delta) ist "geschätzt +2 bis +5 Prozentpunkte
**Field-WR**" nicht mehr die gemessene Größe — gemessen wird Platzierung, nicht Field-WR.
Die Prognose liefert stattdessen eine Zahl in derselben *Form* (Prozentpunkte, 0 = neutral,
mit Konfidenzband), aber anderer *Bedeutung*: Prozentpunkte **Platzierungs-Überlegenheit**
(Mann-Whitney-Effektmaß, siehe `.claude/plans/recommendation-to-prognosis.md` §3.0 für die
Herleitung). Das ist die direkte, bewusste Folge von Entscheidung 1.
