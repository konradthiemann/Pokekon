# Plan — Spec 3: Konfidenzbänder statt binärem Mindest-Spielzahl-Cutoff

> **Bindende Grundlage:** [`specs/confidence-aware-matchups.md`](../../specs/confidence-aware-matchups.md) (freigegeben 2026-08-31).
> Kontext: Teil 3 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> **Baut auf Spec 2 auf** ([`.claude/plans/data-correctness-fixes.md`](./data-correctness-fixes.md), PR #45,
> Branch `feat/data-correctness-fixes` — zum Planungszeitpunkt **offen, nicht in `main`**).
> `tournamentWinRatePct` aus `packages/shared/src/winRate.ts` ist die Eingabegröße hier.
> **Branch:** `feat/confidence-aware-matchups`, abzweigen von `feat/data-correctness-fixes`
> (bzw. von `main`, sobald #45 gemergt ist — siehe §5).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`)

Alle Pfade/Zeilen beziehen sich auf den Stand von `feat/data-correctness-fixes` (`dc2dfdd`),
nicht auf den Prä-Spec-2-Code. Abweichungen von der Spec sind markiert.

**Der Cutoff und seine drei Fundstellen**
- `packages/shared/src/fieldWinRate.ts:54` — `export const MIN_MATCHUP_GAMES = 10`.
- `packages/shared/src/fieldWinRate.ts:100` — `if (!cell || cell.total < minGames) continue;`
  → die Zelle fällt komplett aus `coveredShare`, `weightedSum`, `threats`, `freeWins`.
  (Spec nennt `:91` — durch Spec 2 auf `:100` verschoben, inhaltlich identisch.)
- `apps/api/src/routes/meta.ts:207-208` — derselbe Wert entscheidet, ob eigene Pairing-Daten
  den TrainerHill-Fallback überschreiben. **Out of Scope** (Spec §Out of Scope: Spec-2-Blend
  bleibt unangetastet) — bleibt unverändert.
- `packages/shared/src/matchupConflict.ts:56` — `minOwnGames = opts?.minOwnGames ?? MIN_MATCHUP_GAMES`.
  **Out of Scope** (Spec §Out of Scope, Spec-2-Rückwirkung) — bleibt unverändert.
- `apps/web/src/components/meta/MatchupMatrix.tsx:39` — `MIN_GAMES_FOR_COLOR = MIN_MATCHUP_GAMES`,
  benutzt in `cellStyle()` (`:41-42`) für das binäre Grau. **In Scope.**
- `apps/web/src/components/meta/MatchupMatrix.tsx:54,64,279` — daneben existiert ein
  **nutzergesteuerter** `minGames`-Filter (`[1,10,20,50]`, Default `10`), der Zellen ganz
  ausblendet (`:281-293`). Das ist ein UI-Filter, kein Modell-Cutoff — bleibt, aber der
  **Default wechselt auf 1** (§6 Entscheidung 4).

**Producer von `MatchupCell`/`MatchupRow` (vollständig — es sind zwei, nicht einer)**
- `apps/api/src/routes/meta.ts:217` — `cells.push({ deck1, deck2, total: row.total, winRate: row.winRate })`
  aus `MatchupRow` (die Counts liegen also bereits vor und werden heute nur weggeworfen).
- `apps/web/src/components/meta/PredictionPanel.tsx:137` — `computeFieldScores(shares, matchups.rows)`
  ruft die Engine **client-seitig** mit `MatchupRow[]` auf (strukturell zuweisbar an
  `MatchupCell`). **Zweite Fundstelle, in der Spec nicht genannt** — sie ist der Grund,
  warum die Konfidenz-Rechnung in `@pokekon/shared` und nicht in der API leben muss.
- `packages/shared/src/matchupCsv.ts:38-81` (`parseMatchupCsv`) — `MatchupRow` mit
  `wins/losses/ties/total/winRate`; `winRate` wird **unverändert** aus der CSV übernommen (`:77`).
- `apps/api/src/routes/meta.ts:146-162` (`directedRow`) — eigene Pairings, `winRate` über
  `tournamentWinRatePct(wins, losses, ties, 1)` (Spec 2), `total = wins + losses + ties`.
- `packages/shared/src/matchupPairings.ts:72` — `if (arch1 === arch2) continue;` → **eigene
  Pairing-Daten enthalten nie Mirror-Zeilen.** Nur die TrainerHill-CSV hat welche.

**Persistenz — Antwort auf die Migrations-Frage: keine Migration nötig (belegt)**
- `apps/api/src/db/schema.ts:352-369` (`matchup_matrix`) — speichert `wins`, `losses`, `ties`,
  `total`, `win_rate`. Rohzahlen sind da.
- `apps/api/src/db/schema.ts:380-397` (`tournament_matchups`) — `a_wins`, `b_wins`, `ties`.
- `apps/api/src/db/schema.ts:309-339` (`tournament_standings`) — `wins`, `losses`, `ties`.
- `apps/api/src/lib/matchupData.ts:22-33` — `loadLatestBatch` selektiert bereits
  `wins/losses/ties/total/winRate`.
- `apps/api/src/routes/meta.ts:167-173` — eigene Pairings selektieren `aWins/bWins/ties`.
→ **`lowPct`/`highPct` sind an jeder Stelle zur Laufzeit aus bereits vorhandenen Rohdaten
ableitbar. Es gibt keine `meta_snapshots.ties`-artige Lücke wie in Spec 2. Kein
`db:generate`, keine Migration, kein Backfill-Job in dieser Spec.**
Einzige Ausnahme mit Nachweis: `apps/api/src/routes/meta.ts:502-506` selektiert für die
Trendlinie nur `period, frequencyPct, winRatePct`. `meta_snapshots` **hat** `wins/losses/ties`
(Spec 2, `schema.ts:242-268`) — ein Trend-Band wäre also durch bloßes Mit-Selektieren möglich.
Bewusst **deferred** (§6 Risiko 6), kein AC verlangt es.

**Empirischer Befund aus `apps/api/data/matchup-matrix.csv` (193 Zeilen, selbst nachgerechnet)**
- **TrainerHill rechnet tie-gewichtet.** Alle **178** Nicht-Mirror-Zeilen erfüllen
  `win_rate == (wins + ties/3)/total × 100` auf < 0,06 pp; nur 5 davon erfüllen zusätzlich
  `wins/(wins+losses)` (das sind die Zeilen mit `ties == 0`). → Das schließt **Risiko 4 aus
  dem Spec-2-Plan** („TrainerHills Tie-Konvention ist Unbekannt") mit Daten: sie ist identisch
  mit unserer. Gehört als Korrektur nach `docs/features.md` §13.
- **Alle 14 Mirror-Zeilen sind in sich inkonsistent.** Beispiel:
  `dragapult-dusknoir,dragapult-dusknoir,634,634,76,710` — `wins == losses` und
  `wins+losses+ties = 1344 ≠ total = 710`. Mirror-Spiele erzeugen für dasselbe Archetyp je
  einen Sieg *und* eine Niederlage; `total` ist die Spielzahl, `wins+losses+ties` doppelt sie.
  → **Aus Mirror-Zeilen darf kein Wilson-Intervall über `wins+losses+ties` gerechnet werden.**
  `computeFieldScores` ist davon nicht betroffen (`fieldWinRate.ts:94-97` behandelt den Mirror
  definitorisch vor dem Cell-Lookup), aber `MatchupMatrix.tsx` rendert die Diagonale (`:278`).

**Konsumenten von `FieldScore` / `WeightedMatchup` (alle rein additiv erweiterbar)**
- `apps/web/src/lib/api.ts:584` (`ArchetypeAnalysis.fieldScore`), `:506-508`
  (`FieldAnalysisArchetype.fieldWinRatePct`/`coveragePct`).
- `apps/web/src/components/meta/FieldScorePanel.tsx:25,36-38` (Score), `:50` (`coveragePct`),
  `:7,62` (`LOW_COVERAGE_PCT = 40` — bleibt, AC verlangt beide Signale nebeneinander).
- `apps/web/src/components/meta/ThreatsPanel.tsx:46-53` (Reihenfolge = Array-Reihenfolge),
  `:36` (`WinRateBadge pct={m.winRatePct}`).
- `apps/web/src/components/meta/MatchupTable.tsx:24-26` (sortiert selbst nach `winRatePct`),
  `:76-79`.
- `apps/web/src/components/meta/ArchetypeDetail.tsx:266-273` (KPI-Kachel Feld-Score),
  `:222-231` (KPI-Kachel Turnier-WR über `winRatePct1(wins, losses, ties)`).
- `apps/web/src/components/meta/PredictionPanel.tsx:286-294` (`bestPositioned`),
  `:302-308` (Perspektiv-Select), `:313-317` (`FieldScorePanel`).

**Bestehende Tests, die durch diese Spec bewusst ungültig werden**
- `packages/shared/src/fieldWinRate.test.ts:47-58` — „drops matchup cells below the sample-size
  threshold from coverage" erwartet `coveragePct === 25` bei einer 9-Spiele-Zelle. Genau dieses
  Verhalten schafft die Spec ab. **Muss umgeschrieben werden, mit Begründung im Commit-Body**
  (TDD-Regel: kein stilles Anpassen). `:50` benutzt `MIN_MATCHUP_GAMES - 1`.
- `packages/shared/src/fieldWinRate.test.ts:11-16` — Helper `cell()` ohne `wins/losses/ties`.
  Bleibt gültig (die neuen Felder sind optional, §3.3 Fallback greift).

**Infrastruktur**
- Gates: `npm run typecheck`, `npm run lint`, `npm run test` im Root (`package.json`) —
  `test` baut vorher `@pokekon/shared`.
- Test-Harnesse vorhanden: `packages/shared/src/*.test.ts` (vitest),
  `apps/api/src/api.test.ts` (PGlite + echte Migrations-SQL),
  `apps/web/src/components/meta/winRateColor.test.ts` (Präzedenz für reine UI-Helper-Tests).
- i18n: `apps/web/src/i18n/locales/{de,en}/meta.json`, Keys `matchupMatrix.*`,
  `archetypeDetail.fieldScore.*`, `archetypeDetail.kpi.*`, `prediction.*`.
- `packages/shared/src/index.ts:1-13` — Barrel, braucht einen neuen Re-Export.

---

## 1. Summary

Der harte `MIN_MATCHUP_GAMES`-Cutoff wird als *Modell*-Schwelle abgeschafft und durch
durchgängige Wilson-Score-Konfidenzintervalle ersetzt. Eine neue reine Funktion
`wilsonInterval(wins, losses, ties, opts)` in `@pokekon/shared` liefert zu jedem
tie-gewichteten Record (Spec-2-Formel) das exakte 95-%-Wilson-Intervall; `MatchupCell` und
`WeightedMatchup` tragen die Grenzen als zusätzliche Felder, beide Producer (`routes/meta.ts`
für Server-Scores, `PredictionPanel.tsx` für die lokale Prognose) reichen die ohnehin
vorhandenen Rohzahlen durch. `computeFieldScores` lässt danach **keine** Zelle mehr wegen zu
weniger Spiele herausfallen: jede Zelle mit Daten zählt, ihre Unsicherheit wird per **voller
Fehlerfortpflanzung** über die share-gewichtete Summe unabhängiger Anteilsschätzungen
(`Var(Σ wᵢXᵢ) = Σ wᵢ² Var(Xᵢ)`) in eine `fieldWinRateLowPct`/`fieldWinRateHighPct`-Bandbreite
propagiert. `threats`/`freeWins` kennzeichnen, ob ihr Intervall die 50 %-Linie ausschließt, und
sortieren nicht-signifikante Matchups nach hinten. Die UI zeigt überall dort, wo eine Win-Rate
die primäre Zahl ist, Punktschätzung **und** Band explizit an („64,0 % (54,5–68,8 %)"); die
Matchup-Matrix färbt nach Intervallbreite gestuft statt binär grau. `coveragePct`/
`LOW_COVERAGE_PCT` bleiben als getrenntes Signal erhalten. **Keine Migration, kein
Datenmodell-Eingriff** — alles ist zur Laufzeit aus vorhandenen Rohdaten berechenbar (§0).
Nutzer ist Konrad selbst (Dogfooding); Spec 5 und 6 erben diese Bänder.

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik — Single Source of Truth)**
- [ ] `packages/shared/src/wilsonInterval.ts` **(neu)** — `DEFAULT_CONFIDENCE`, `zForConfidence`,
      `wilsonInterval`, `matchupCellInterval`, `combineIndependentIntervals`
- [ ] `packages/shared/src/wilsonInterval.test.ts` **(neu)** — Golden Tests (§3.1/§3.2)
- [ ] `packages/shared/src/fieldWinRate.ts` — `MatchupCell` + `WeightedMatchup` + `FieldScore`
      erweitert, `computeFieldScores` ohne Cutoff, mit Fehlerfortpflanzung und
      Signifikanz-Sortierung; `MIN_MATCHUP_GAMES` bleibt exportiert (andere Nutzer, §0),
      `opts.minGamesPerPair` **entfällt** (kein Aufrufer, §6 Entscheidung 3)
- [ ] `packages/shared/src/fieldWinRate.test.ts` — bestehender Cutoff-Test umgeschrieben,
      neue Propagations-/Signifikanz-Tests
- [ ] `packages/shared/src/index.ts` — ein neuer Re-Export

**Datenmodell / Migration**
- [ ] **entfällt bewusst** — siehe §0 „Persistenz" und §5.

**API**
- [ ] `apps/api/src/routes/meta.ts:217` — `wins/losses/ties` in die `MatchupCell` durchreichen
      (die einzige Änderung dort; `directedRow`, Blend, Konflikt-Logik bleiben unangetastet)
- [ ] `apps/api/src/api.test.ts` — Wire-Test: `/field-analysis` und
      `/archetypes/:id/analysis` liefern `fieldWinRateLowPct`/`fieldWinRateHighPct` und
      `threats[].lowPct/highPct/significant`; `/matchups` bleibt unverändert

**Web**
- [ ] `apps/web/src/lib/api.ts` — `FieldAnalysisArchetype` um `fieldWinRateLowPct`/
      `fieldWinRateHighPct` erweitern (optional, damit ein älterer Server nicht crasht)
- [ ] `apps/web/src/components/meta/confidence.ts` **(neu)** — `confidenceTier`,
      `formatWithInterval` (reine, testbare Anzeige-Helfer, Muster `winRateColor.ts`)
- [ ] `apps/web/src/components/meta/confidence.test.ts` **(neu)**
- [ ] `apps/web/src/components/meta/MatchupMatrix.tsx` — `MIN_GAMES_FOR_COLOR` raus, gestufte
      Intensität nach Intervallbreite, Band in Zelle + Tooltip, Mirror-Sonderfall,
      `minGames`-Default 1
- [ ] `apps/web/src/components/meta/FieldScorePanel.tsx` — Band unter der großen Zahl,
      Coverage-Block unverändert daneben
- [ ] `apps/web/src/components/meta/ArchetypeDetail.tsx` — Band in KPI „Feld-Score" **und**
      KPI „Turnier-WR"
- [ ] `apps/web/src/components/meta/PredictionPanel.tsx` — Band in `bestPositioned`
- [ ] `apps/web/src/components/meta/ThreatsPanel.tsx` — Band + „nicht signifikant"-Kennzeichnung
- [ ] `apps/web/src/components/meta/MatchupTable.tsx` — Band-Spalte
- [ ] `apps/web/src/i18n/locales/{de,en}/meta.json` — neue Keys (§3.7)

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `docs/features.md` §13 (Matchup-Matrix: gestufte Konfidenz statt binärem Grau +
      TrainerHill-Tie-Konvention jetzt **belegt**), §15 (Feld-Score-Band, Coverage bleibt
      getrennt), §16 (Prognose zeigt Band)
- [ ] `docs/data-types.md` — `MatchupCell`, `WeightedMatchup`, `FieldScore`, `WilsonInterval`
- [ ] `docs/data-flow.md` — wo das Intervall entsteht (shared, zur Laufzeit) und dass nichts
      persistiert wird
- [ ] `docs/database.md` — **ein Satz**, dass Spec 3 bewusst keine Spalte hinzufügt (damit
      nicht später jemand danach sucht)

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen, Formeln und nachrechenbare Wertetabellen — keine Implementierungsvorgaben darüber
hinaus. Alle Zahlen unten sind mit `z₉₅ = 1.959963984540054` nachgerechnet.

### 3.0 Die Formeln (verbindlich, nicht die Normal-Approximation)

**Wilson-Score-Intervall** (Wilson 1927; Score-Test-Inversion, *ohne* Stetigkeitskorrektur).
Für `n` Beobachtungen mit Score `s` und `p̂ = s/n`:

```
z  = Quantil der Standardnormalverteilung zum Niveau (1 + confidence)/2
d  = 1 + z²/n
c  = (p̂ + z²/(2n)) / d                                    ← Intervall-Mitte
h  = (z / d) · √( p̂(1−p̂)/n + z²/(4n²) )                   ← halbe Breite
low = max(0, c − h)     high = min(1, c + h)
```

Abgrenzung zur **verbotenen** Wald-/Normal-Näherung `p̂ ± z·√(p̂(1−p̂)/n)`: die kollabiert bei
`p̂ ∈ {0, 1}` auf Breite 0 und verlässt sonst [0,1]. Wilson tut beides nicht — sichtbar an
`0/10 → [0 %, 27,75 %]` statt `[0 %, 0 %]`.

**Ties.** Der Score ist die Spec-2-Größe `s = wins + ties/3`, `n = wins + losses + ties`, also
`p̂ = tournamentWinRate(wins, losses, ties)`. Bei `ties = 0` ist das **exakt** das Lehrbuch-
Wilson-Intervall (darauf zielen die Golden Tests). Bei `ties > 0` ist es eine **bewusst
konservative Näherung**: die tatsächliche Varianz einer Beobachtung aus {0, ⅓, 1} ist
`Var = p_w + p_t/9 − (p_w + p_t/3)²`, und die ist ≤ `μ(1−μ)`, was Wilson unterstellt.
Beispiel `p_w = 0,45 / p_t = 0,10 / p_l = 0,45`: `μ = 0,4833`, `μ(1−μ) = 0,2497`,
echte Varianz `0,2275` → das Intervall ist rund 4,6 % zu breit. Zu breit = ehrlich, nie zu
schmal. **Diese Näherung gehört als Kommentar an die Funktion und in `docs/data-types.md`.**
(Die exakte Alternative über einen Design-Effekt steht als offene Frage in §6.)

**Fehlerfortpflanzung über die gewichtete Summe.** Der Feld-Score ist
`F = Σ_B s_B·WR_B / Σ_B s_B` mit `s_B = sharePct`. Mit Normierungsgewichten
`w_B = s_B / Σ s_B` (Σ w_B = 1) und **unabhängigen** Zellen gilt exakt

```
Var(F) = Var(Σ_B w_B·WR_B) = Σ_B w_B² · Var(WR_B)
```

Die per-Zelle-Standardfehler werden aus dem *jeweiligen Wilson-Band* zurückgelesen, damit es
keine zweite, abweichend definierte Unsicherheit gibt — und getrennt nach unten/oben, weil
Wilson asymmetrisch ist:

```
σ⁻_B = (WR_B − low_B) / z      σ⁺_B = (high_B − WR_B) / z
F_low  = clamp( F − z·√(Σ w_B²·σ⁻_B²), 0, 100 ) = clamp( F − √(Σ w_B²·(WR_B − low_B)²), 0, 100 )
F_high = clamp( F + z·√(Σ w_B²·σ⁺_B²), 0, 100 ) = clamp( F + √(Σ w_B²·(high_B − WR_B)²), 0, 100 )
```

`z` kürzt sich in der Aggregation heraus — es steckt nur noch in den Zell-Bändern. Der Mirror
ist **definitorisch** 50 % (`fieldWinRate.ts:94-97`), also eine Konstante, keine Schätzung:
`σ⁻ = σ⁺ = 0`. Das ist statistisch korrekt und nicht nur Bequemlichkeit.

Zwei nachprüfbare Konsequenzen, die als Property-Tests gehören:
1. **Genau ein abgedeckter Gegner mit Gewicht 1** → das Feld-Band ist exakt dessen Zell-Band.
2. **K identische Zellen mit identischem Share** → Bandbreite = Einzel-Bandbreite / √K
   (Verifiziert: 30,9838 pp für eine Zelle → 15,4919 pp bei K = 4).

### 3.1 `packages/shared/src/wilsonInterval.ts` (neu)

```ts
/** Default confidence level (Wilson standard, matches the Spec-1 reference paper). */
export const DEFAULT_CONFIDENCE = 0.95;

/**
 * Two-sided normal quantile z for a confidence level. Table-backed: only the
 * standard levels are supported, anything else throws (a silently wrong z would
 * be worse than a loud failure).
 */
export function zForConfidence(confidence: number): number;
// 0.80 -> 1.2815515655446004
// 0.90 -> 1.6448536269514722
// 0.95 -> 1.959963984540054
// 0.98 -> 2.3263478740408408
// 0.99 -> 2.5758293035489004

export interface WilsonInterval {
  /** Point estimate in percent, tie-weighted: (wins + ties/3)/n × 100. Unrounded. */
  pct: number;
  /** Lower / upper bound in percent, clamped to [0, 100]. Unrounded. */
  lowPct: number;
  highPct: number;
  /** highPct - lowPct, the width used for the UI's confidence tiers. */
  widthPct: number;
  /** Sample size wins + losses + ties. */
  n: number;
  /** true when the interval excludes 50 % — the direction is established. */
  significant: boolean;
}

/**
 * Wilson score interval (score-test inversion, no continuity correction) for a
 * tie-weighted tournament record. Returns null when n === 0. Negative or
 * non-finite inputs are defensively treated as 0 (same contract as
 * tournamentWinRate). With ties === 0 this is the exact textbook interval.
 */
export function wilsonInterval(
  wins: number,
  losses: number,
  ties?: number,
  opts?: { confidence?: number },
): WilsonInterval | null;
```

**Golden Tests — Lehrbuch-Referenzwerte, 95 % (nachrechenbar, Toleranz 1e-4 auf Prozent):**

| wins | losses | ties | `pct` | `lowPct` | `highPct` | Quelle / Bedeutung |
|---|---|---|---|---|---|---|
| 8 | 2 | 0 | 80 | 49.0162 | 94.3318 | Standard-Lehrbuchbeispiel 8/10 |
| 0 | 10 | 0 | 0 | 0 | 27.7533 | Randfall p̂=0 — Wald gäbe [0,0] |
| 10 | 0 | 0 | 100 | 72.2467 | 100 | Randfall p̂=1 |
| 1 | 0 | 0 | 100 | 20.6549 | 100 | n=1, maximale Unsicherheit |
| 15 | 133 | 0 | 10.1351 | 6.2386 | 16.0487 | Newcombe (1998), publiziert 0.0624–0.1605 |
| 10 | 10 | 0 | 50 | 29.9298 | 70.0702 | symmetrischer Fall n=20 |
| 62 | 38 | 0 | 62 | 52.2098 | 70.9024 | das Spec-Beispiel „62 % (54–70 %)" — real 52,2–70,9 |
| 500 | 500 | 0 | 50 | 46.9070 | 53.0930 | großes n → schmal |
| 6 | 4 | 2 | 55.5556 | 29.7019 | 78.7148 | Spec-2-AC-Record, tie-gewichtet |
| 0 | 0 | 0 | — | — | — | → `null` |

Weitere verbindliche Eigenschaften:
- `significant === (highPct < 50 || lowPct > 50)`, berechnet auf den **ungerundeten** Grenzen.
  Verbindliche Prüfwerte:

  | Record | Intervall | `significant` |
  |---|---|---|
  | `8W/2L` | `[49.0162, 94.3318]` | `false` (knapp — Untergrenze liegt noch unter 50) |
  | `8W/1L` | `[56.5000, 98.0109]` | `true` |
  | `40W/60L` | `[30.9401, 49.7997]` | `true` |
  | `20W/80L` | `[13.3367, 28.8829]` | `true` |
  | `6W/5L` | `[28.0092, 78.7287]` | `false` |
  | `9W/11L` | `[25.8198, 65.7915]` | `false` |

  Die erste Zeile ist der wichtigste Testfall: 8 aus 10 Spielen *sieht* eindeutig aus, ist es
  aber nicht — genau das soll die Spec sichtbar machen.
- Monotonie: bei festem `p̂` schrumpft `widthPct` streng monoton in `n`
  (`5W/5L` → 52.68 pp, `50W/50L` → 19.23 pp, `500W/500L` → 6.19 pp).
- `lowPct ≤ pct ≤ highPct` für alle Eingaben (Wilson-Mitte ≠ `p̂`, aber `p̂` liegt immer im
  Intervall — das ist eine echte Eigenschaft, kein Zufall, und gehört als Property-Test rein).
- `confidence: 0.90` liefert ein **echt schmaleres** Intervall als `0.95` bei gleicher Eingabe.
- `zForConfidence(0.93)` → wirft.

### 3.2 Kombination unabhängiger Intervalle (dieselbe Datei)

```ts
export interface IntervalTerm {
  /** Non-negative weight; the function normalises so the weights sum to 1. */
  weight: number;
  pct: number;
  lowPct: number;
  highPct: number;
}

/**
 * Error propagation for a weighted sum of INDEPENDENT proportion estimates:
 * Var(Σ wᵢXᵢ) = Σ wᵢ²Var(Xᵢ). The per-term standard errors are read back from
 * each term's own interval, separately below and above the point estimate
 * (Wilson is asymmetric). Terms with lowPct === pct === highPct (e.g. the
 * definitional 50 % mirror) contribute zero variance, which is correct — they
 * are constants, not estimates. Returns null when the total weight is 0.
 */
export function combineIndependentIntervals(
  terms: IntervalTerm[],
): { pct: number; lowPct: number; highPct: number } | null;
```

**Verbindliche Wertetabelle (nachgerechnet; die Funktion rundet nicht, Toleranz 1e-4):**

| Fall | Terme (weight, pct, low, high) | `pct` | `lowPct` | `highPct` |
|---|---|---|---|---|
| Ein Term | (100, 80, 49.0162, 94.3318) | 80 | 49.0162 | 94.3318 |
| 4× identisch | 4× (25, 80, 49.0162, 94.3318) | 80 | 64.5081 | 87.1659 |
| Mirror + 2 Zellen | (20, 50, 50, 50), (30, 80, 49.0162, 94.3318), (50, 60, 55.6454, 64.2021) | 64 | 54.4533 | 68.7854 |
| Dünn + dick | (50, 100, 20.6549, 100), (50, 60, 55.6454, 64.2021) | 80 | 40.2678 | 82.1011 |
| Leer / weight 0 | `[]` | → `null` | | |

Zeile 3 vollständig nachrechenbar: `F = (20·50 + 30·80 + 50·60)/100 = 64`;
`√(0,3²·30,9838² + 0,5²·4,3546²) = 9,5467` → `low = 54,4533`;
`√(0,3²·14,3318² + 0,5²·4,2021²) = 4,7854` → `high = 68,7854`.

### 3.3 `MatchupCell` und der Intervall-Resolver

```ts
// packages/shared/src/fieldWinRate.ts — MatchupCell erweitert (ALLE neuen Felder optional,
// damit MatchupRow weiter strukturell zuweisbar bleibt und Alt-Aufrufer nicht brechen)
export interface MatchupCell {
  deck1: string;
  deck2: string;
  total: number;
  winRate: number;
  /** Raw record — preferred source for the interval when present. */
  wins?: number;
  losses?: number;
  ties?: number;
  /** Precomputed bounds; win over the raw record when both are present. */
  lowPct?: number;
  highPct?: number;
}
```

```ts
// packages/shared/src/wilsonInterval.ts
/**
 * Resolve one matchup cell's interval, in this precedence order:
 *   1. explicit lowPct/highPct on the cell  → used verbatim (pct = cell.winRate)
 *   2. wins/losses/ties present            → wilsonInterval(wins, losses, ties)
 *   3. otherwise                           → reconstruct from total + winRate:
 *      wilsonInterval-equivalent with n = cell.total, p̂ = cell.winRate / 100
 * Returns null when cell.total <= 0 (no data at all).
 * Mirror cells (deck1 === deck2) are NOT special-cased here — callers that can
 * see a mirror must handle it, because the bundled TrainerHill export
 * double-counts mirror wins/losses (see plan §0).
 */
export function matchupCellInterval(
  cell: MatchupCell,
  opts?: { confidence?: number },
): WilsonInterval | null;
```

Verbindliche Eigenschaften:
- Fall 3 muss für `{ total: 10, winRate: 80 }` dieselben Grenzen liefern wie
  `wilsonInterval(8, 2, 0)` → `[49.0162, 94.3318]`. (Genau das hält
  `fieldWinRate.test.ts:11-16` mit seinem alten `cell()`-Helper am Leben.)
- Fall 2 hat Vorrang vor Fall 3, auch wenn beides vorhanden ist.
- `{ total: 0, ... }` → `null`.

### 3.4 `computeFieldScores` — geänderter Vertrag

```ts
export interface WeightedMatchup {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  winRatePct: number;
  games: number;
  weightPct: number;          // unveraendert: share × |winRatePct − 50| / 100, 2 Dezimalen
  /** NEU: Wilson bounds for this matchup, 1 decimal. */
  lowPct: number;
  highPct: number;
  /** NEU: true when the interval excludes 50 % (computed on UNROUNDED bounds). */
  significant: boolean;
}

export interface FieldScore {
  // ... unveraendert ...
  fieldWinRatePct: number | null;
  /** NEU: propagated band around fieldWinRatePct, 1 decimal, clamped to [0,100].
   *  null exactly when fieldWinRatePct is null. */
  fieldWinRateLowPct: number | null;
  fieldWinRateHighPct: number | null;
  /** coveragePct SEMANTIK GEAENDERT: share of the field with ANY matchup data
   *  (previously: with at least MIN_MATCHUP_GAMES games). */
  coveragePct: number;
}

export function computeFieldScores(
  shares: ArchetypeShare[],
  matchups: MatchupCell[],
  opts?: { confidence?: number },   // minGamesPerPair ENTFAELLT
): FieldScore[];
```

Verbindliches Verhalten:
1. **Kein Sample-Cutoff mehr.** Eine Zelle wird genau dann übersprungen, wenn sie fehlt oder
   `matchupCellInterval` `null` liefert (`total <= 0`). Eine 1-Spiel-Zelle zählt voll in
   `coveredShare` und `weightedSum` — ihre Unsicherheit landet im Band, nicht im Verstecken.
   Die Punktschätzung bleibt der rohe `cell.winRate` (**keine** Shrinkage zur Wilson-Mitte,
   §6 Entscheidung 2), d. h. bei ausreichend Daten ändert sich keine heute angezeigte Zahl.
2. **Mirror** wie bisher definitorisch 50 % ohne Cell-Lookup, Beitrag zur Varianz = 0.
3. **Band** über `combineIndependentIntervals` mit `weight = opponent.sharePct`,
   gerundet auf 1 Dezimale (wie `fieldWinRatePct`). Bei `coveredShare === 0` sind alle drei
   Felder `null`.
4. **threats/freeWins**: Einträge mit `winRatePct === 50` werden wie bisher übersprungen.
   Sortierung **neu**: `Number(b.significant) − Number(a.significant) || b.weightPct − a.weightPct`.
   Nicht-signifikante Matchups verschwinden also nicht (das wäre wieder ein stiller Cutoff),
   sie rutschen nach unten und tragen `significant: false`.
5. Die Sortierung der `FieldScore[]` und `rank` bleiben unverändert (nach `fieldWinRatePct`).

**Verbindliche Wertetabelle (Testgrundlage):**

| Szenario | Erwartung |
|---|---|
| `shares [a:20, b:30, c:50]`, Zellen `a→b {8,2,0}`, `a→c {300,200,0}` | `a.fieldWinRatePct === 64`, `fieldWinRateLowPct === 54.5`, `fieldWinRateHighPct === 68.8`, `coveragePct === 100` |
| `shares [a:25, b:75]`, Zelle `a→b {8,1,0}` (9 Spiele, alter Cutoff hätte sie verworfen) | `coveragePct === 100` (**vorher 25**), `freeWins` enthält `b` mit `significant === true` |
| `shares [a:25, b:75]`, Zelle `a→b` mit `total: 9, winRate: 90` (ohne Counts, Fall 3) | `coveragePct === 100`, `fieldWinRateLowPct < fieldWinRatePct < fieldWinRateHighPct` |
| `shares [a:10, big-bad:30, small-bad:5, prey:20]`, Zellen wie `fieldWinRate.test.ts:60-76` (total 100) | Reihenfolge `threats` bleibt `['big-bad','small-bad']`, beide `significant === true`, `weightPct` 3 / 1.5 unverändert |
| dasselbe, aber `a→big-bad` mit nur 20 Spielen (`9W/11L`) | `big-bad.significant === false` → `threats` = `['small-bad','big-bad']` |
| keine Zellen, `shares [a:9, b:91]` | `fieldWinRatePct === 50`, `low === 50`, `high === 50`, `coveragePct === 9` |
| `shares []` | `[]` |
| Zelle mit `total: 0` | wird übersprungen, zählt nicht in `coveragePct` |

### 3.5 API-Wire-Contract (rein additiv, keine Breaking Change)

```
GET /api/meta/field-analysis
  archetypes[]: + fieldWinRateLowPct: number | null
                + fieldWinRateHighPct: number | null

GET /api/meta/archetypes/:id/analysis
  fieldScore: + fieldWinRateLowPct, + fieldWinRateHighPct
  fieldScore.threats[] / .freeWins[]: + lowPct, + highPct, + significant

GET /api/meta/matchups   UNVERAENDERT (rows tragen bereits wins/losses/ties/total —
                         der Client rechnet das Intervall selbst, wie PredictionPanel es
                         heute schon mit computeFieldScores tut)
GET /api/meta            UNVERAENDERT
matchupSource            UNVERAENDERT (Spec-2-Konfliktfelder bleiben)
```

Kein neuer Endpunkt, kein neues Query-Parameter, keine neue Validierung, kein neues
User-Input-Feld. `confidence` ist vorerst **nicht** über die Wire konfigurierbar — der
Default lebt in `@pokekon/shared`.

### 3.6 Web-Contracts

```ts
// apps/web/src/lib/api.ts
export interface FieldAnalysisArchetype {
  // ... unveraendert ...
  /** Optional, damit ein aelterer Server (Deploy-Reihenfolge) nichts bricht. */
  fieldWinRateLowPct?: number | null;
  fieldWinRateHighPct?: number | null;
}
// FieldScore kommt aus @pokekon/shared und traegt die Felder automatisch.
```

```ts
// apps/web/src/components/meta/confidence.ts (neu)
export type ConfidenceTier = 'high' | 'medium' | 'low' | 'veryLow';

/** Tier by interval width in percentage points. Purely visual emphasis —
 *  NOT a cutoff: every tier still renders its number. */
export function confidenceTier(widthPct: number): ConfidenceTier;
// widthPct <= 10  -> 'high'
// widthPct <= 20  -> 'medium'
// widthPct <= 35  -> 'low'
// else            -> 'veryLow'

/** "62.0 % (52.2–70.9 %)" — the explicit range the spec decided on.
 *  Falls back to just the point estimate when bounds are null/undefined. */
export function formatWithInterval(
  pct: number | null,
  lowPct: number | null | undefined,
  highPct: number | null | undefined,
  decimals?: number,   // default 1
): string;
// formatWithInterval(null, ...)          -> '—'
// formatWithInterval(62, null, null)     -> '62.0 %'
// formatWithInterval(62, 52.21, 70.9)    -> '62.0 % (52.2–70.9 %)'
```

Verbindliche UI-Eigenschaften (testbar):
- `MatchupMatrix`: `MIN_GAMES_FOR_COLOR` ist entfernt; `cellStyle` bekommt keinen
  `total`-Parameter mehr, sondern Hue aus `winRate` und Deckkraft-Stufe aus
  `confidenceTier(width)`. Jede Zelle mit Daten zeigt ihre Zahl (kein Grau-Blackout).
  Zweite, kleinere Zeile in der Zelle: `low–high` (0 Dezimalen, Platz).
  **Diagonale (`row === col`)**: kein Band, kein Tier — die gebündelte TrainerHill-Mirror-Zeile
  ist doppelt gezählt (§0). Weiterhin `opacity-60`.
  `minGames`-Filter bleibt, Default `10` → `1`.
- `FieldScorePanel`: unter der großen Zahl eine Zeile mit dem Band; `coveragePct`-Balken,
  `LOW_COVERAGE_PCT`-Warnung und Mirror-Anteil bleiben **unverändert** daneben stehen.
- `ArchetypeDetail`: KPI „Feld-Score" bekommt das Band als kleine zweite Zeile; KPI
  „Turnier-WR" bekommt das Band aus `wilsonInterval(archetype.wins, losses, ties)`.
- `PredictionPanel`: `prediction.bestPositioned` zeigt `formatWithInterval(...)`; die
  `<option>`-Labels des Perspektiv-Selects bleiben Punktschätzung (Platz).
- `ThreatsPanel` / `MatchupTable`: Band neben der `WinRateBadge`; bei `significant === false`
  ein dezenter „unsicher"-Marker (Label, nicht nur Farbe — a11y).

### 3.7 Neue i18n-Keys (`meta.json`, de + en)

```
matchupMatrix.cellTooltip        ERWEITERT um {{low}}/{{high}}
matchupMatrix.confidenceLegend   "Farbintensität = Stichprobensicherheit"
matchupMatrix.mirrorTooltip      "Mirror — definitionsgemäß 50 %"
archetypeDetail.fieldScore.interval        "95-%-Konfidenzintervall: {{low}}–{{high}} %"
archetypeDetail.fieldScore.intervalHint    Erklaerung Band vs. Coverage (zwei Fragen!)
archetypeDetail.threats.unreliable         "unsicher — Intervall schließt 50 % ein"
archetypeDetail.matchupTable.interval      Spaltenkopf "95-%-Intervall"
prediction.bestPositionedInterval          bestPositioned mit Band
```

---

## 4. Umsetzungsreihenfolge (test-first)

Jede Verhaltens-Scheibe: **erst** der rote Test (`tester`), **dann** die Implementierung
(`implementer`). Nach jedem Schritt Root-Gates (`npm run typecheck && npm run lint &&
npm run test`) und ein eigener Commit. Slice A ist Voraussetzung für B und C; B und C sind
danach unabhängig voneinander (echte Parallelität).

**Slice A — Statistik-Kern in `@pokekon/shared`**

1. **Rot:** `packages/shared/src/wilsonInterval.test.ts` gegen §3.1 — komplette Golden-Tabelle,
   `zForConfidence`-Konstanten, `null`-Fall, `significant`-Fälle, Monotonie in `n`,
   Property `lowPct ≤ pct ≤ highPct`, defensive Eingaben, `zForConfidence(0.93)` wirft.
2. **Grün:** `packages/shared/src/wilsonInterval.ts` (`DEFAULT_CONFIDENCE`, `zForConfidence`,
   `wilsonInterval`) + Re-Export in `index.ts`. Formel-Herleitung und die Ties-Konservativitäts-
   Notiz als Kommentar an der Funktion.
   → `test(shared): pin Wilson score intervals to textbook reference values`
   → `feat(shared): add tie-aware Wilson score confidence intervals`
3. **Rot:** Tests für `combineIndependentIntervals` (§3.2, alle vier Zeilen der Tabelle +
   `null`-Fall) und `matchupCellInterval` (§3.3, alle drei Präzedenz-Fälle + `total: 0`).
4. **Grün:** beide Funktionen in derselben Datei.
   → `feat(shared): propagate matchup uncertainty through a weighted sum`

**Slice B — Feld-Score ohne Cutoff**

5. **Rot:** `packages/shared/src/fieldWinRate.test.ts` — die komplette Wertetabelle aus §3.4.
   Der bestehende Test `:47-58` („drops matchup cells below the sample-size threshold") wird
   auf die neue Semantik umgeschrieben (`coveragePct === 100` statt `25`, Zelle zählt mit,
   Band wird weit). **Diese Teständerung ist bewusst und im Commit-Body zu begründen.**
6. **Grün:** `packages/shared/src/fieldWinRate.ts` — `MatchupCell`/`WeightedMatchup`/`FieldScore`
   erweitern, Cutoff entfernen, `opts.minGamesPerPair` entfernen, `opts.confidence` einführen,
   Propagation + Signifikanz-Sortierung. Doc-Kommentar `:52-54` und `:59-68` korrigieren
   (dort steht heute die Cutoff-Begründung — sonst steht da eine Lüge).
   → `feat(shared): replace the matchup sample cutoff with confidence bands`
7. **Rot:** `apps/api/src/api.test.ts` — Szenario mit einer 6-Spiele-Paarung:
   `/api/meta/field-analysis` liefert `fieldWinRateLowPct`/`fieldWinRateHighPct` und zählt die
   dünne Paarung in `coveragePct` (vorher wäre sie rausgefallen);
   `/api/meta/archetypes/:id/analysis` liefert `threats[].lowPct/highPct/significant`.
8. **Grün:** `apps/api/src/routes/meta.ts:217` — `wins/losses/ties` in die `MatchupCell`.
   → `feat(api): pass raw matchup records into the field score engine`

**Slice C — UI**

9. **Rot:** `apps/web/src/components/meta/confidence.test.ts` gegen §3.6
   (`confidenceTier`-Grenzen inkl. genau-auf-der-Grenze, `formatWithInterval` inkl.
   `null`-Fällen und Dezimalstellen).
10. **Grün:** `apps/web/src/components/meta/confidence.ts`.
    → `feat(web): add confidence tier and interval formatting helpers`
11. **MatchupMatrix:** `MIN_GAMES_FOR_COLOR` raus, gestufte Intensität, Band in Zelle und
    Tooltip, Mirror-Sonderfall, `minGames`-Default 1, Legende. i18n-Keys de+en.
    → `feat(web): grade the matchup matrix by confidence instead of a hard cutoff`
12. **FieldScorePanel + ArchetypeDetail + PredictionPanel:** explizite Bandbreite an den drei
    Stellen, an denen die Win-Rate die primäre Zahl ist; Coverage-Block unverändert daneben.
    → `feat(web): show confidence intervals next to every headline win rate`
13. **ThreatsPanel + MatchupTable:** Band + „unsicher"-Kennzeichnung für
    `significant === false`; `api.ts`-Typen erweitern.
    → `feat(web): flag threats whose interval still includes 50 %`

**Abschluss**

14. Doku-Schritt (alle Dateien aus §2, Block „Doku") — inklusive der **Korrektur** von
    Spec-2-Risiko 4 in `docs/features.md` §13: TrainerHills Tie-Konvention ist jetzt belegt
    identisch mit unserer (§0).
    → `docs: describe confidence bands, tiered matrix colouring and the TrainerHill tie finding`
15. Volle Gates + `code-review-agent` (kein `security-agent` nötig: kein neues User-Input,
    keine neue Route, kein externer Call — im PR ausdrücklich so begründen), dann PR.

---

## 5. Rollout, Migration & Rückwärtskompatibilität

**Migration: keine.** Belegt in §0 — jede benötigte Rohzahl liegt bereits in
`matchup_matrix`, `tournament_matchups` und `tournament_standings`. Kein `db:generate`,
kein `preDeployCommand`-Risiko, kein Backfill, kein Dry-Run-Ritual wie in Spec 2.

**Branch-Abhängigkeit.** Diese Arbeit setzt `packages/shared/src/winRate.ts` voraus, das noch
in PR #45 hängt. Zwei Wege:
- **Bevorzugt:** #45 zuerst mergen, dann `feat/confidence-aware-matchups` von `main`.
- **Sonst:** von `feat/data-correctness-fixes` abzweigen und den PR gegen diesen Branch
  stellen (Stacked PR). Dann darf #45 nicht mehr rebased werden, solange dieser PR offen ist.
Der Plan selbst gehört auf denselben Branch wie die Specs (PR #46) oder auf den
Feature-Branch — er liegt aktuell nur untracked im Haupt-Worktree.

**Rückwärtskompatibilität**
- **Wire additiv.** Ein alter Web-Client ignoriert `fieldWinRateLowPct`/`highPct` und
  `threats[].significant` schadlos. Ein alter Server liefert sie nicht — deshalb sind die
  Felder in `apps/web/src/lib/api.ts` optional und `formatWithInterval` fällt auf die reine
  Punktschätzung zurück (§3.6). Das deckt das Deploy-Fenster ab, in dem `apps/api`
  (das das Web-Bundle selbst ausliefert) getauscht wird.
- **Signaturänderung `computeFieldScores`.** `opts.minGamesPerPair` entfällt. Belegt: kein
  Aufrufer benutzt `opts` (`routes/meta.ts:260`, `PredictionPanel.tsx:137` rufen beide ohne
  `opts` auf). Das ist eine Breaking Change an der `@pokekon/shared`-Oberfläche, die in-repo
  niemanden trifft; das Paket ist nicht veröffentlicht.
- **`coveragePct` wechselt die Bedeutung.** Von „Anteil mit ≥ 10 Spielen" zu „Anteil mit
  überhaupt Daten". Die Zahl **steigt** typischerweise, die `LOW_COVERAGE_PCT`-Warnung
  feuert also seltener — dafür trägt jetzt das Band die dünne Datenlage. Muss in
  `docs/features.md` §15 und im Doc-Kommentar an `FieldScore.coveragePct` nachgezogen werden.
- **Kein Rollback-Aufwand.** Reiner Code-Revert genügt; es gibt keinen persistierten Zustand,
  der nach einem Revert falsch wäre.

---

## 6. Risiken & offene Fragen

**Risiken**
1. **`coveragePct` steigt sprunghaft, ohne dass sich etwas verbessert hat.** Wer die Zahl
   kennt, könnte sie als Fortschritt lesen. Gegenmaßnahme: In §15 der Doku und im
   `intervalHint`-Text ausdrücklich die zwei getrennten Fragen benennen („wie viel Feld ist
   abgedeckt" vs. „wie sicher ist die abgedeckte Zahl") — genau das verlangt auch das
   dritte UI-AC der Spec.
2. **Feld-Score-Bänder werden bei dünner Datenlage sehr breit.** Beispiel aus §3.2, Zeile 4:
   eine 1-Spiel-Zelle mit 50 % Gewicht erzeugt `80 % (40,3–82,1 %)`. Das ist die *ehrliche*
   Antwort und der Punkt der Spec — aber es sieht drastisch aus. Vor dem Merge einmal mit
   echten Produktionsdaten gegenprüfen (`/api/meta/field-analysis?days=14`) und die typischen
   Breiten in der PR-Beschreibung dokumentieren. Falls fast alles „veryLow" ist, sind die
   Tier-Grenzen aus §3.6 nachzujustieren (reine Konstanten, kein Strukturwechsel).
3. **Unabhängigkeitsannahme.** `Var(Σ wᵢXᵢ) = Σ wᵢ²Var(Xᵢ)` gilt nur bei unabhängigen Zellen.
   Reale Matchup-Zellen einer Zeile teilen sich Spieler und Turniere, sind also leicht
   korreliert; zusätzlich sind `shares` selbst geschätzt und werden hier als exakt behandelt.
   Beides macht das Band tendenziell **zu schmal**. Bewusst akzeptiert (die Ties-Näherung aus
   §3.0 wirkt in die Gegenrichtung), gehört aber als Kommentar an
   `combineIndependentIntervals` und in `docs/data-types.md`. Eine Kovarianz-Schätzung wäre
   Spec-6-Material, nicht hier.
4. **Mirror-Doppelzählung in der gebündelten CSV.** 14 Zeilen, belegt in §0. Sie erreichen
   `computeFieldScores` nicht, aber jeder *neue* Konsument von `MatchupRow`, der blind
   `wins+losses+ties` als `n` nimmt, würde die Mirror-Unsicherheit halbieren. Deshalb steht
   der Hinweis im Doc-Kommentar von `matchupCellInterval` (§3.3) und die Diagonale in der
   Matrix bekommt gar kein Band.
5. **Performance.** Pro Feld-Score-Request: `|shares|²` Wilson-Auswertungen. Bei ~20
   Archetypen sind das 400 Auswertungen à ~10 Flops — nicht messbar. Keine neue Query, kein
   neuer Fetch, kein neuer Roundtrip. Trotzdem im PGlite-Harness einmal die Response-Zeit von
   `/field-analysis` vorher/nachher loggen und in der PR notieren (dieselbe Praxis wie Spec 2).
6. **Bewusst nicht umgesetzt (damit es niemand für Vergessen hält):** kein Band an der
   Trendlinie (`routes/meta.ts:502-506` — wäre ohne Migration möglich, siehe §0, aber kein AC
   verlangt es); kein Band in `MetaTable.tsx`/`MetaPage.tsx` (Spec nennt sie nicht); Spec-2s
   15-pp-Konfliktschwelle bleibt fest (Spec §Out of Scope); `DeckAnalyticsPanel.tsx:400`
   bleibt unangetastet (fachlich anderes `coveragePct`, Spec §Out of Scope).

**Entscheidungen (in diesem Plan getroffen — verbindlich, aber umkehrbar; bitte
widersprechen, wenn eine davon nicht passt)**
1. **Ties im Wilson-Intervall:** Score `wins + ties/3` auf `n = wins+losses+ties`, ausgewertet
   mit der Standard-Binomial-Wilson-Formel. Begründung: nur so gilt der Golden-Test-Anspruch
   der Spec („in Lehrbüchern nachschlagbar"), und die Abweichung ist konservativ (Band ~4–5 %
   zu breit bei 10 % Remis-Quote, nachgerechnet in §3.0). Die exakte Alternative über einen
   Design-Effekt `n_eff = n·μ̂(1−μ̂)/V̂` steht unter „Offene Fragen".
2. **Keine Shrinkage der Punktschätzung.** `computeFieldScores` rechnet weiter mit dem rohen
   `cell.winRate`, nicht mit der Wilson-Mitte (die p̂ mit ~1,92 Pseudo-Beobachtungen je Seite
   zu 50 % zieht). Begründung: die Wilson-Mitte wäre bei dünnen Zellen robuster, würde aber
   die angezeigte Matrix-Zahl von der Feld-Score-Eingabe entkoppeln — zwei Wahrheiten für
   dieselbe Zelle. Kandidat für Spec 6.
3. **`opts.minGamesPerPair` wird entfernt statt als toter Parameter belassen.** Kein Aufrufer
   benutzt ihn (belegt, §5). Ein Parameter, dessen Name nicht mehr beschreibt, was er tut,
   ist schlimmer als keiner.
4. **`minGames`-Filter-Default in der Matrix: 10 → 1.** Sonst versteckt ausgerechnet die
   Ansicht, die den Cutoff abschaffen soll, weiterhin alle dünnen Zellen. Der Filter selbst
   bleibt (nutzergesteuert, kein Modell-Cutoff).
5. **Sortierung threats/freeWins: Signifikanz zuerst, dann `weightPct`** — statt einer
   „konservativen Gewichtung" `share × |konservative Grenze − 50|`. Nachgerechneter Grund:
   Bei `big-bad` (30 % Share, 40 % WR aus 100 Spielen, Intervall `[30,9; 49,8]`) wäre die
   konservative Gewichtung `30 × 0,2/100 = 0,06`, bei `small-bad` (5 % Share, 20 % WR aus 100
   Spielen, `[13,3; 28,9]`) dagegen `5 × 21,1/100 = 1,06`. Der Bedrohungs-Ranking würde sich
   umdrehen und das mit Abstand relevanteste Matchup nach unten sortieren. Die
   Signifikanz-Flagge erfüllt das AC („gekennzeichnet **oder** niedriger gewichtet") ohne
   diesen Nebeneffekt.
6. **`zForConfidence` als Tabelle (5 Standardniveaus, sonst `throw`)** statt einer
   Inversen-Normalverteilungs-Approximation. Begründung: nur Standardniveaus werden je
   gebraucht (Spec: 95 % Default, evtl. 90 %), eine Tabelle ist offensichtlich korrekt und
   reviewbar, ~30 Zeilen Acklam-Koeffizienten wären es nicht. Escape-Hatch bleibt trivial
   nachrüstbar.

**Offene Fragen (echte, neue — nicht die bereits in der Spec entschiedenen)**
1. **Exakte Trinomial-Varianz statt konservativer Binomial-Näherung?** Statt Entscheidung 1
   ließe sich Wilson mit einer effektiven Stichprobengröße `n_eff = n · μ̂(1−μ̂)/V̂` rechnen
   (Design-Effekt, Standard in der Survey-Statistik), mit
   `V̂ = (p̂_w + p̂_t/9) − μ̂²`. Vorteil: statistisch exakter, Bänder ~5 % schmaler bei typischen
   Remis-Quoten. Nachteil: kein Lehrbuch-Referenzwert mehr für den Ties-Fall (Golden Tests
   nur noch für `ties = 0`), und der Effekt liegt weit unter der Streuung, um die es
   eigentlich geht. **Empfehlung: nicht jetzt.** Wenn Konrad die statistische Reinheit
   vorzieht, ist es eine ~15-Zeilen-Änderung ausschließlich in `wilsonInterval.ts` — die
   Verträge in §3.2/§3.3/§3.4 bleiben identisch.
2. **Tier-Grenzen (10/20/35 pp) sind gesetzt, aber nicht datenbelegt.** Sie stammen aus der
   Intuition „ein 20-pp-Band ist noch lesbar, ein 40-pp-Band nicht". Vor dem Merge einmal die
   reale Verteilung der Bandbreiten über die aktuelle Matrix ausgeben (siehe Risiko 2) und
   die Grenzen ggf. auf Quartile setzen. Blockiert die Umsetzung nicht.
3. **Branch-Basis** — siehe §5: #45 zuerst mergen (bevorzugt) oder Stacked PR? Das ist eine
   Prozess-, keine Design-Entscheidung, muss aber vor Schritt 1 beantwortet sein.

---

## 7. Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` (Repo-Root) grün — ehrlich
      berichtet, nichts übersprungen, nichts geskippt.
- [ ] Alle Akzeptanzkriterien der Spec abgehakt, inkl.: neue Funktion in eigener Datei,
      Golden Tests gegen Lehrbuchwerte, `MatchupCell` erweitert und von **beiden** Producern
      befüllt (`routes/meta.ts` **und** `PredictionPanel.tsx` über `MatchupRow`), keine Zelle
      fällt mehr wegen Spielzahl raus, `FieldScore` trägt eine Bandbreite,
      threats/freeWins berücksichtigen Unsicherheit, vier UI-Stellen zeigen die explizite
      Zahlen-Bandbreite, `coveragePct`/`LOW_COVERAGE_PCT` existieren unverändert daneben.
- [ ] Golden Tests treffen die publizierten Referenzwerte: `8/10 → [49.0162, 94.3318]`,
      `15/148 → [6.2386, 16.0487]` (Newcombe 1998), `0/10 → [0, 27.7533]`.
- [ ] Propagations-Properties als Tests: ein Term → identisches Band; K identische Terme →
      Breite/√K; Mirror trägt null Varianz.
- [ ] Genau **eine** Implementierung der Wilson-Formel:
      `grep -rn "Math.sqrt" packages apps --include='*.ts' --include='*.tsx'` liefert keine
      zweite Intervall-Rechnung; die UI rechnet nichts selbst nach.
- [ ] Neue Tests: Happy Path **und** je ein Fehler-/Randfall pro Slice
      (`n = 0` → `null`; `total: 0` → Zelle übersprungen; `zForConfidence` mit unbekanntem
      Niveau → wirft; Feld-Score ohne abgedeckte Gegner → alle drei Felder `null`).
- [ ] Der umgeschriebene Test `fieldWinRate.test.ts:47-58` ist im Commit-Body ausdrücklich
      begründet (TDD-Regel: kein stilles Anpassen).
- [ ] **Keine** Migration, kein `db:generate`, kein neuer Job — und im PR ausdrücklich
      begründet, warum nicht (Rohdaten liegen vollständig vor, §0).
- [ ] Cold-Start/Empty-State geprüft: kein Meta, keine eigenen Pairings, leere
      TrainerHill-Tabelle, Archetyp ohne einen einzigen abgedeckten Gegner, `shares = []`.
- [ ] Wire-Kompatibilität geprüft: neue Felder additiv, im Web optional typisiert, alter
      Client bricht nicht.
- [ ] Kein neues User-Input, keine neue Route, kein externer Call, keine Secrets im Diff,
      keine neue Dependency (`zForConfidence` ist eine Tabelle, kein Paket) — im PR
      ausdrücklich begründet, warum `security-agent` diesmal entfällt.
- [ ] Reale Bandbreiten-Verteilung einmal gemessen und in der PR dokumentiert (Risiko 2),
      Tier-Grenzen bestätigt oder angepasst.
- [ ] Response-Zeit `/api/meta/field-analysis` vorher/nachher im PGlite-Harness notiert.
- [ ] Doku aktualisiert: `docs/features.md` (§13, §15, §16), `docs/data-types.md`,
      `docs/data-flow.md`, `docs/database.md` (Ein-Satz-Notiz „bewusst keine Spalte");
      die Doc-Kommentare an `MIN_MATCHUP_GAMES` (`fieldWinRate.ts:52-54`) und
      `computeFieldScores` (`:59-68`) beschreiben nicht mehr den alten Cutoff.
- [ ] Der belegte TrainerHill-Tie-Befund (§0) ist in `docs/features.md` §13 nachgetragen und
      Spec-2-Risiko 4 damit als geklärt markiert.
- [ ] `code-review-agent` gelaufen; Review auch gegen die Spec-Akzeptanzkriterien.
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body.
