# Spec 3: Konfidenzbänder statt binärem Mindest-Spielzahl-Cutoff

> Teil 3 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Baut auf [Spec 2](./data-correctness-fixes.md) auf (korrekte Win-Rate-Formel als Eingabe) —
> Spec 2 sollte implementiert oder zumindest final geplant sein, bevor hier Zahlen final
> validiert werden, weil sich die Eingabegröße durch Spec 2 noch ändert (Ties).

## Problem/Ziel

`packages/shared/src/fieldWinRate.ts:54` definiert `MIN_MATCHUP_GAMES = 10` als harten
Ja/Nein-Cutoff. Diese eine Konstante wird an drei Stellen konsistent wiederverwendet (kein
Duplikations-Bug wie in Spec 2) — aber das **Design selbst** ist das Problem:

- `packages/shared/src/fieldWinRate.ts:91` — `if (!cell || cell.total < minGames) continue;`:
  eine Zelle mit 9 Spielen (8-1) fällt **komplett** aus `coveragePct`, `threats`, `freeWins`
  raus, so als gäbe es keine Daten.
- `apps/web/src/components/meta/MatchupMatrix.tsx:39/42` — dieselbe Grenze färbt eine Zelle
  mit 11 Spielen (6-5) exakt gleich ein wie eine mit 500 Spielen (6-5) — beide gelten als
  "genug Daten", obwohl die Unsicherheit um Größenordnungen unterschiedlich ist.
- `apps/api/src/routes/meta.ts:193-194` — dieselbe Grenze entscheidet, ob eigene Pairing-
  Daten den TrainerHill-Fallback komplett überschreiben (Spec 2, "Quellen-Konsistenz").

Ergebnis: `FieldScore.fieldWinRatePct` (`fieldWinRate.ts:31`) und alle UI-Stellen, die ihn
zeigen (`FieldScorePanel.tsx`, `MatchupMatrix.tsx`, `ArchetypeDetail.tsx`,
`PredictionPanel.tsx` laut `docs/features.md` §13/§15/§16), präsentieren scharfe
Einzelzahlen ohne jede Unsicherheitsangabe — ein 62 % aus 11 Spielen sieht identisch
vertrauenswürdig aus wie ein 62 % aus 400 Spielen. Genau das identifiziert die
Referenzquelle aus Spec 1 (arxiv 2607.08692) als vermeidbaren Praxisfehler: **Wilson-Score-
Intervalle statt binärer Schwellen.**

**Ziel:** Jede angezeigte/aggregierte Win-Rate trägt ein Konfidenzintervall statt eines
binären "genug/nicht genug Daten"-Zustands — bevor Spec 5 (Prognosen) und Spec 6
(Nash-/Replicator-Schicht) auf denselben Zahlen aufbauen und deren Unsicherheit erben.

## User Stories

- Als Spieler, der die Matchup-Matrix liest, will ich sehen, wie sicher eine Win-Rate
  tatsächlich ist (nicht nur ein binäres Grau/Farbig), damit ich Grenzfälle selbst
  einschätzen kann statt sie blind zu übernehmen.
- Als Spieler, der Field-Score/Threats/Free-Wins zur Deck-Wahl nutzt, will ich, dass die
  Rangfolge statistische Unsicherheit berücksichtigt, damit ein Ausreißer aus einer kleinen
  Stichprobe nicht einen gut belegten Matchup verdrängt.
- Als Konrad, der später Spec 2s festen 15-Prozentpunkte-Konflikt-Schwellwert (eigene Daten
  vs. TrainerHill) überarbeiten will, will ich eine wiederverwendbare Konfidenz-Grundlage,
  statt eine zweite, unabhängige Heuristik zu pflegen.

## Akzeptanzkriterien

**Kern-Funktion**
- [ ] Neue Funktion `wilsonInterval(wins, losses, ties, confidence = 0.95)` in
      `packages/shared/src/` (eigene Datei, z. B. `wilsonInterval.ts`), die `{ pct, lowPct,
      highPct, n }` zurückgibt. Nutzt dieselbe Ties-Behandlung wie die in Spec 2 korrigierte
      Win-Rate-Formel (`(wins + ties/3)/(wins+losses+ties)`), nicht die alte.
- [ ] Golden Tests mit bekannten Referenzwerten (z. B. 8 Siege aus 10 Spielen → Standard-
      Wilson-95%-Intervall, in Lehrbüchern nachschlagbar) — kein selbst erfundener
      Toleranzbereich.
- [ ] `MatchupCell` (`fieldWinRate.ts:11`) bekommt `lowPct`/`highPct` als zusätzliche,
      optionale Felder; alle Produzenten (`directedRow` in `routes/meta.ts:133`,
      TrainerHill-CSV-Parsing in `matchupCsv.ts`) befüllen sie.

**Field-Score ohne harten Cutoff**
- [ ] `computeFieldScores` (`fieldWinRate.ts:70`) lässt **keine** Zelle mehr wegen
      `cell.total < minGames` komplett aus `coveredShare` herausfallen. Stattdessen fließt
      jede Zelle mit Daten ein, aber ihr Beitrag zur Unsicherheit von `FieldScore` wird
      sichtbar (siehe nächster Punkt) statt sie zu verstecken.
- [ ] `FieldScore` bekommt `fieldWinRateLowPct`/`fieldWinRateHighPct` (oder eine
      vergleichbare Bandbreiten-Angabe) — Berechnungsmethode ist Teil der Umsetzungsplanung
      (siehe Offene Fragen zur Genauigkeit).
- [ ] `threats`/`freeWins`-Sortierung (`fieldWinRate.ts:113-119`) berücksichtigt Unsicherheit:
      ein Matchup mit weitem Intervall, das 50 % einschließt, ist kein verlässlicher
      "Threat"/"Free Win" mehr und wird entsprechend gekennzeichnet oder niedriger gewichtet
      (nicht stillschweigend gleich behandelt wie ein enges Intervall mit derselben
      Punktschätzung).

**UI-Sichtbarkeit**
- [ ] `MatchupMatrix.tsx` zeigt Konfidenz nicht mehr nur binär (Grau bei `< MIN_GAMES_FOR_COLOR`,
      sonst normal), sondern gestuft nach Intervallbreite (z. B. Farbintensität, Muster oder
      ein Tooltip mit dem Intervall) — Umsetzungsdetail für den Planer, kein neuer Cutoff.
- [ ] `FieldScorePanel.tsx`, `ArchetypeDetail.tsx`, `PredictionPanel.tsx` zeigen die
      Win-Rate-Punktschätzung zusammen mit ihrem Intervall dort, wo sie die primäre Zahl auf
      dem Screen ist (Format z. B. "62 % (54–70 %)"), nicht nur als Fußnote.
- [ ] Bestehendes `coveragePct`/`LOW_COVERAGE_PCT`-Konzept (`FieldScorePanel.tsx:7,62`) bleibt
      erhalten (unterschiedliche Frage: "wie viel Meta ist überhaupt abgedeckt" vs. "wie
      sicher ist die abgedeckte Zahl") — beide Signale nebeneinander, nicht eines ersetzt
      durch das andere.

## Out of Scope

- Nash-Gleichgewicht/Replicator-Dynamik → Spec 6.
- Rückwirkende Änderung an Spec 2s festem 15-Prozentpunkte-Konflikt-Schwellwert (eigene
  Daten vs. TrainerHill) — Spec 2 liefert mit fixem Wert, eine spätere Umstellung auf
  Wilson-Bänder ist eine bewusste Folge-Entscheidung, kein Teil dieser Spec (siehe Offene
  Fragen).
- `DeckAnalyticsPanel.tsx:400` (`coveragePct` für Deck-Vergleich gegen Turnierlisten) — ein
  gleichnamiges, aber fachlich anderes Konzept (Anteil abgedeckter Meta-Archetypen, keine
  Win-Rate-Konfidenz). Nicht anfassen, um Verwechslung zu vermeiden.
- Verknüpfung von Konfidenz mit konkreten Kartenempfehlungen ("wenn du X tauschst") → Spec 5.

## Entscheidungen (bestätigt 2026-08-31)

- **Genauigkeit der Field-Score-Konfidenz:** **volle Fehlerfortpflanzung** — Varianzen der
  einzelnen Matchup-Zellen werden korrekt kombiniert, keine vereinfachte Näherung. Konsistent
  mit der bereits für Spec 6 gewünschten vollen spieltheoretischen Tiefe; die
  Umsetzungsdetails (Kombinationsformel für gewichtete, unabhängige Binomial-Anteile) sind
  Teil der Planung, nicht dieser Spec.
- **Visuelle Umsetzung:** **explizite Zahlen-Bandbreite** (z. B. "62 % (54–70 %)") überall,
  wo eine Win-Rate die primäre Zahl auf dem Screen ist — passend zum bestehenden
  Redesign-Stil "analytisch/dicht, mehr Zahlen pro Screen" (`10b286c`).

## Offene Fragen

- **Konfidenzniveau:** Default **95 %** (Wilson-Standard, entspricht der Referenzquelle aus
  Spec 1) — niedrigschwellig genug als Startwert, dass er sich ohne strukturelle Änderung
  später konfigurierbar machen lässt, falls sich 90 % bei den ohnehin knappen
  Online-Bo1-Stichproben als praktikabler erweist. Kein Blocker, nur als Default gesetzt statt
  offen gelassen.
- **Spec-2-Rückwirkung:** Der 15-Prozentpunkte-Konflikt-Schwellwert aus Spec 2 bleibt dort
  vorerst als feste, überschreibbare Konstante bestehen (siehe Spec-2-Plan). Eine Umstellung
  auf Wilson-Bänder ist ein sinnvoller, aber eigenständiger Folge-Schritt **nach** Abschluss
  dieser Spec — kein Teil der Umsetzung hier, damit Spec 2 nicht nachträglich wieder aufgerissen
  wird.
