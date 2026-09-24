# Spec 4: Gewichtungsmodell für Turnierdaten

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 4 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Voraussetzung:** Spec 1 (Cluster für die Spieler-Dämpfung). Spec 2 für Set-Release-Daten
> (Fallback: eigene Konstante). Spec 3 ist optional und derzeit zurückgestellt.

## 1. Problem

Heute zählt jede Liste im Zeitfenster gleich viel:

- Eine Liste von gestern wiegt so viel wie eine von vor vier Wochen. Das Fenster ist ein
  harter Schnitt (7/14/21/28 Tage, `archetype_card_stats.windowDays`,
  `apps/api/src/db/schema.ts:448-470`).
- Ein 40-Spieler-Online-Turnier wiegt so viel wie ein großes Event. Es gibt nur einen
  Mindest-Filter `DEFAULT_MIN_TOURNAMENT_PLAYERS`
  (`apps/api/src/lib/archetypeSynthesisFacts.ts:119`).
- Die Platzierung fließt nur als Tie-Breaker bzw. Anzeige ein (`clusterRanking.ts:21-27`).
- Ein neues Set verändert das Meta sofort. Das weiß das Modell nicht.

## 2. Ziel

Ein **einziges, dokumentiertes Gewicht pro Standing**, das alle Auswertungen für Spec 5 und 6
nutzen: Konsensliste, Kartenwerte, Matchups. Das Gewicht bildet Konrads Vorgaben ab:
**je aktueller, je größer das Event, je besser die Platzierung, desto wichtiger.**

## User Stories

- Als Spieler will ich, dass **aktuelle** Ergebnisse, **große** Events und **gute** Platzierungen
  mehr zählen als alte, kleine und schlechte.
- Als Spieler will ich **ehrliche Unsicherheitsbänder**, die nicht mehr Präzision vortäuschen, als
  die Daten hergeben.
- Als Spieler will ich nicht, dass ein einzelner Vielspieler das Bild verzerrt.

## 3. Das Gewicht

```
w(s) = zeit(s) × tier(s) × platz(s) × set(s) × spieler(s)
```

| Faktor | Formel | Startwert |
|---|---|---|
| `zeit` | `0,5 ^ (AlterInTagen / HALBWERTSZEIT)` | `HALBWERTSZEIT = 14` Tage |
| `tier` | Tabelle | online 1,0 · regional 1,25 · special 1,4 · ic 1,5 · worlds 1,75 |
| `platz` | `0,5 + p`, mit `p = placementPercentile` ∈ [0,1] (`cardPerformance.ts:62`) | Spanne 0,5–1,5; fehlende Platzierung → 1,0 |
| `set` | `SET_PENALTY` für Daten vor dem neuesten legalen Set, sonst 1 | `SET_PENALTY = 0,5` |
| `spieler` | `1 / m`, mit m = Anzahl Standings desselben Spielers mit derselben Liste (gleicher Cluster, Spec 1) im Fenster | siehe §3.3 |

- Alle Startwerte sind **Setzungen, keine Messungen**. Sie liegen als benannte Konstanten in
  `packages/shared/src/weighting.ts`, jede mit Kommentar zur Begründung.
- Kalibrierung ist ein späterer Schritt über den Backtest aus Spec 5 §8.

### 3.1 Kritische Prüfung der Startwerte (2026-09-23)

Konrad hat die Werte nicht selbst gesetzt, sondern um eine kritische Prüfung gebeten. Ergebnis:

1. **Halbwertszeit 14 Tage: bleibt.** Nach 4 Wochen hat eine Liste noch 25 % Gewicht. Damit
   dominieren die letzten zwei Wochen, und das bestehende 28-Tage-Fenster bleibt sinnvoll.
   Kürzer (7 Tage) würde die ohnehin kleine Stichprobe eines einzelnen Archetyps stark
   verkleinern. Länger (28 Tage) würde Reaktionen auf neue Techs um Wochen verzögern.
2. **Tier-Faktoren: gesenkt** (vorher bis 2,5). Große Events tragen schon durch ihre
   **Menge** an Listen mehr bei: Ein Regional mit 40 Zoroark-Spielern liefert 40 Datenpunkte,
   ein Online-Turnier drei. Ein hoher Faktor zählte die Eventgröße doppelt. Der verbleibende
   Aufschlag begründet sich mit Bo3 (weniger Zufall pro Ergebnis) und stärkerem Feld.
3. **Platzierung: bleibt für den Konsens, fällt für Performance-Werte weg.** Das ist die
   wichtigste Korrektur, siehe §3.2.
4. **Neu: Spieler-Dämpfung.** Siehe §3.3.
5. **`SET_PENALTY = 0,5`: bleibt.** Direkt nach einem Release betrifft sie alle Daten gleich,
   ändert also nichts an deren Verhältnis zueinander. Sie wirkt erst, sobald neue Daten
   dazukommen, und genau dann soll sie wirken.

### 3.2 Zwei Gewichtsvarianten: Konsens vs. Performance

Die Platzierung ist das **Ergebnis**, das Spec 5 erklären will. Wer Listen nach ihrem Ergebnis
gewichtet und dann misst, welche Karten mit gutem Ergebnis zusammenhängen, verstärkt den
Zusammenhang künstlich. Deshalb gibt es zwei Varianten:

| Variante | Formel | Nutzung |
|---|---|---|
| `w_konsens` | `zeit × tier × platz × set × spieler` | Was spielen erfolgreiche Spieler gerade? (Spec 5 Schritt A: Kern/Flex, Spec 6 Co-Occurrence) |
| `w_performance` | `zeit × tier × set × spieler` (**ohne** `platz`) | Welche Karten hängen mit Siegen zusammen? (Spec 5 Schritt B: δ-Werte, Matchup-WR) |

### 3.3 Spieler-Dämpfung

Online spielen dieselben Personen oft mehrere Turniere pro Woche mit derselben Liste. Ohne
Dämpfung zählt ein aktiver Spieler fünffach, und seine persönliche Stärke verzerrt die
Kartenwerte.

- Pro Spieler und Cluster (Spec 1) im Fenster teilen sich die m Standings das Gewicht: Faktor
  `1 / m`.
- **Datenschutz:** Der Sync speichert Benutzernamen heute bewusst nicht
  (`apps/api/src/jobs/syncMeta.ts:160`, Kommentar „usernames are never persisted"). Deshalb
  wird nur ein **Pseudonym** gespeichert: `HMAC-SHA256(username, PLAYER_KEY_SECRET)` als neue
  Spalte `tournament_standings.player_key`. Das Secret liegt als Railway-Variable
  (CLAUDE.md §2.3). Ohne Secret gibt es keine Rückführung auf den Namen.
- Bestehende Standings ohne `player_key` bekommen Faktor 1. Eine Nachberechnung ist nicht
  nötig, weil der Zeitfaktor sie ohnehin schnell entwertet.
- `security-agent` prüft die Pseudonymisierung.

## 4. Popularität richtig einordnen

Konrads Vorgabe „je höher die Popularität eines Archetyps" wird **nicht** als Gewicht auf die
Listen des eigenen Archetyps angewendet. Dessen Popularität sagt nichts darüber, welche
*Zoroark*-Liste besser ist. Popularität wirkt an zwei anderen Stellen:

1. **Feld-Gewichte:** Wie wichtig ein Matchup ist, bestimmt der gewichtete Feldanteil des
   *Gegners* (Spec 5, Zielfunktion). Hier wird derselbe Zeitfaktor genutzt, damit ein gerade
   aufsteigender Archetyp schnell zählt.
2. **Vertrauen:** Mehr Listen ergeben eine größere effektive Stichprobe und damit schmalere
   Bänder (§5).

**Bitte bestätigen**, dass das Konrads Intention trifft.

## 5. Unsicherheit mit Gewichten

Gewichtete Daten brauchen eine **effektive Stichprobengröße** (Kish):

```
n_eff = (Σ w)² / Σ w²
```

- Gewichtete Win-Rate = `Σ w·(W + T/3) / Σ w·(W + L + T)`. Die Tie-Formel folgt der
  bestehenden Konvention aus Spec 2 (Datenkorrektheit).
- Das Konfidenzband ist ein Wilson-Intervall (`packages/shared/src/wilsonInterval.ts`) mit
  `n_eff` statt der Rohzahl der Spiele.
- Ohne diesen Schritt würden 50 alte, niedrig gewichtete Spiele eine Präzision vortäuschen,
  die sie nicht haben.

## 6. Zeitfenster und Formatgrenzen

- **Formatgrenze hart:** nichts vor `ROTATION_DATE` (`packages/shared/src/season.ts:6`).
- **Zeitfenster** 7/14/21/28 Tage bleibt als Nutzer-Parameter erhalten (CLAUDE.md §5).
  Innerhalb des Fensters wirkt der Zerfall.
- **Neue Option „Seit letztem Set"** als fünfter Fensterwert, weil ein Set-Release die
  natürliche Grenze eines Metas ist.
- **Große Events** (Spec 3) sind selten, oft liegt keines im 28-Tage-Fenster. Vorschlag: Sie
  gelten immer ab dem letzten Set-Release, unabhängig vom gewählten Fenster. Ihr Zeitfaktor
  zerfällt trotzdem. **Offen, bitte entscheiden.**
- Set-Release-Daten kommen aus dem Kartenkatalog (Spec 2, `card_prints.release_date`).
  **Zu klären:** Ab wann ist ein Set in Online-Turnieren legal (Release in TCG Live) und ab
  wann bei großen Events? Die Grenze kann pro Tier unterschiedlich sein.

## 7. Umsetzung

- Reine Funktionen in `packages/shared/src/weighting.ts`: `standingWeight`, `effectiveN`,
  `weightedWinRate`, `weightedWilson`. Keine I/O.
- Die Gewichte werden **nicht gespeichert**, sondern bei jeder Auswertung aus den Rohdaten
  berechnet. Sie hängen vom Stichtag ab, gespeicherte Werte würden also sofort veralten.
  Gespeichert werden erst die Ergebnisse (Spec 5).
- Bestehende Auswertungen (`computeCardStats`, Cluster-Ranking, Equilibrium) bleiben in
  dieser Spec **unverändert**. Sie wechseln erst in eigenen Specs auf gewichtete Daten, damit
  jede Änderung einzeln prüfbar bleibt.

## Umsetzungsscheiben

| Scheibe | Inhalt | ACs |
|---|---|---|
| S1 | `packages/shared/src/weighting.ts`: beide Gewichtsvarianten, `effectiveN`, `weightedWinRate`, `weightedWilson` | 1, 2, 4, 5, 6 |
| S2 | Spalte `tournament_standings.player_key` (HMAC) im Sync + Spieler-Dämpfung | 3, 8 |
| S3 | Doku der Konstanten inkl. §3.1 | 7 |

S2 braucht den `security-agent` (Pseudonymisierung, neues Secret).

## 8. Akzeptanzkriterien

1. `standingWeight` ist für jeden Faktor einzeln getestet, einschließlich Grenzfällen
   (Alter 0, fehlende Platzierung, fehlendes Tier → online).
2. Ein Standing von heute mit Platz 1 bei Worlds (einziges Standing des Spielers) hat genau
   `w_konsens = 1 × 1,75 × 1,5 × 1 × 1 = 2,625` und `w_performance = 1,75` (Beispieltest).
3. Drei Standings desselben Spielers im selben Cluster haben zusammen dasselbe Gewicht wie ein
   einzelnes (bei sonst gleichen Faktoren).
4. `effectiveN` von n gleichen Gewichten ist n. Ein einziges dominantes Gewicht gibt ≈ 1.
5. `weightedWilson` ist mit gleichen Gewichten identisch zur bestehenden `wilsonInterval`.
6. Kein bestehender Read ändert sein Ergebnis.
7. Die Konstanten sind in `docs/` mit Begründung dokumentiert, inklusive §3.1.
8. `player_key` enthält nie den Klartext-Namen (Test), Secret nur serverseitig.

## 9. Entscheidungen (Default 2026-09-23, überschreibbar)

1. **Startwerte:** entschieden nach kritischer Prüfung, siehe §3.1. Kalibrierung später per
   Backtest (Spec 5 §8).
2. **Große Events** gelten ab dem letzten Set, unabhängig vom Fenster. Nur relevant, falls
   Spec 3 wieder aufgenommen wird.
3. **Popularität** wirkt wie in §4 über Feld-Gewichte und Vertrauen, nicht auf die eigenen
   Listen.
