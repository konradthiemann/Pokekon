# Plan — Spec 6: Spieltheoretische Meta-Schicht (Nash-Gleichgewicht + Replicator-Dynamik)

> **Bindende Grundlage:** [`specs/meta-game-theory-layer.md`](../../specs/meta-game-theory-layer.md),
> inklusive der drei am 2026-09-02 aufgelösten offenen Fragen (LP statt Enumeration ·
> wöchentlicher Batch-Job · UI zeigt Klartext **und** Prozentzahl).
> Kontext: Teil 6 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md),
> Motivation dort §3.5 (Popularitäts-Paradox, Quelle arxiv 2607.08692).
> **Baut auf Spec 2, 3 und 5 auf** (alle in `main`): `packages/shared/src/winRate.ts`,
> `packages/shared/src/wilsonInterval.ts`, `packages/shared/src/cardPerformance.ts`,
> `apps/api/src/jobs/computeCardStats.ts`.
> **Branch:** `feat/meta-game-theory-layer`, abzweigen von `main` (`16f49d8`).
> Vorgehen: Zwei-Agenten-TDD (`tester` dann `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.
> **Architektur-Voraussetzung gelesen** (CLAUDE.md §1): `docs/backend-evolution-plan.md`.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `16f49d8`)

Alles hier ist aus dem Code bzw. der zitierten Quelle gelesen. Wo etwas nicht belegt werden
konnte, steht **Vermutung** oder **Unbekannt** (CLAUDE.md §2.1).

### 0.1 Die drei Entscheidungen der Spec sind da — und eine davon ist präziser als die Spec

`specs/meta-game-theory-layer.md:94-112` trägt den Block "Offene Fragen (entschieden,
2026-09-02)" mit allen drei Antworten. **Kein Spec-Nachtrag nötig** (anders als bei Spec 5,
wo der Planer den fehlenden Block erst anlegen musste).

> **Diskrepanz 1 (Präzisierung, kein Widerspruch).** Der "Methodische Rahmen" der Spec
> (`:32-33`) beschreibt das Referenzpapier als **exhaustive Support-Enumeration**
> (`2^14 − 1` Teilmengen). Der tatsächliche Papiertext (abgerufen 2026-09-02, §0.4) sagt:
> *"Candidate equilibrium weights were obtained via Python's `scipy.optimize.linprog`"* —
> die Enumeration ist dort der **Lean-4-Verifikationsschritt**, nicht das Rechenverfahren.
> Die getroffene Entscheidung ("LP-basiert") ist damit **nicht** eine Abweichung vom
> Papier, sondern exakt dessen Vorgehen. Das gehört so in die PR-Beschreibung, damit
> niemand denkt, hier werde eine Methode vereinfacht.

### 0.2 Die Eingangsdaten — was wirklich in der DB und in den Engines steht

**Matchup-Zellen (Quelle der Payoff-Matrix)**
- `apps/api/src/routes/meta.ts:167-252` — `loadMatchupData(db, window)` liefert
  `cells: MatchupCell[]` **inklusive `wins`/`losses`/`ties`** (`:220-228`), gemischt aus
  eigenen Online-Bo1-Pairings (`tournament_matchups`) und der TrainerHill-CSV als Fallback.
  Die Funktion ist heute **modul-privat**.
- `apps/api/src/routes/meta.ts:149-165` — `directedRow()` erzeugt zu jedem ungerichteten Paar
  **beide** gerichteten Zeilen aus **denselben** Zählern; `winRate` ist
  `tournamentWinRatePct(wins, losses, ties, 1)` (Spec-2-Formel, Remis = ein Drittel Sieg).
- `apps/api/src/routes/meta.ts:210-211` — `MIN_MATCHUP_GAMES` entscheidet weiterhin, ob eigene
  Daten den TrainerHill-Fallback überschreiben. **Out of Scope**, bleibt unangetastet.
- `apps/api/src/db/schema.ts:357-374` (`matchup_matrix`) und `:385-402` (`tournament_matchups`)
  — Rohzähler liegen vollständig vor. **Keine Migration an bestehenden Tabellen nötig.**

**Shares (die Strategie-Menge)**
- `apps/api/src/routes/meta.ts:84-126` — `loadWindowAggregates` aggregiert
  `tournament_standings` im Fenster über `computeMetaSnapshots`; ebenfalls **modul-privat**.
- `packages/shared/src/meta.ts:244-249,293-294` — `computeMetaSnapshots(..., minPlayerCount = 2)`
  **verwirft Archetypen mit nur einem Piloten**. Die Strategie-Menge ist also bereits
  rausch-gefiltert, bevor dieser Plan sie sieht — ein tragendes Argument dafür, dass es
  **keine** zusätzliche Top-N-Deckelung braucht (Spec-Entscheidung 1).
- `apps/api/src/routes/meta.ts:271-273` — `OTHER_ARCHETYPE_ID` wird als **Subjekt** verworfen,
  bleibt aber Gegner. Dieser Plan verwirft `'other'` vollständig: eine Mischung aus
  unidentifizierten Decks ist keine spielbare *Strategie* (§3.2).

**Wochen-über-Wochen-Daten (Replicator)**
- `apps/api/src/db/schema.ts:253-280` (`meta_snapshots`) — `period` (ISO-Woche, `"2026-W15"`),
  `archetypeId` (**nullable** für Alt-Zeilen), `frequencyPct`, `winRatePct` (nullable),
  `wins`/`losses`/`ties`, `playerCount`, Unique-Index `(period, archetype)`.
- `apps/api/src/jobs/syncMeta.ts:229-305` — `recomputeCurrentPeriodSnapshots` schreibt
  **ausschließlich die laufende ISO-Woche** und ersetzt sie bei jedem Sync vollständig.
  Folge: **die aktuelle Woche ist zu jedem Zeitpunkt ein Teilaggregat.** Ein
  Woche-über-Woche-Vergleich, der sie einbezieht, vergleicht eine angefangene mit einer
  fertigen Woche. Dieser Plan schließt die laufende Woche deshalb ausdrücklich aus (§3.5).
  **Das steht nirgends in der Spec und ist der wichtigste Datenfallstrick dieser Scheibe.**
- `packages/shared/src/season.ts:13,31-37,46-54` — `ROTATION_PERIOD = '2026-W13'`,
  `isoWeekLabel`, `isoWeekBounds`. `apps/api/src/routes/meta.ts:514-533` liest die Trendlinie
  bereits genau so (Alt-Zeilen ohne `archetype_id` werden über den Namen gematcht).

### 0.3 Die bestehenden Engines (bleiben unangetastet, liefern aber die Bausteine)

- `packages/shared/src/wilsonInterval.ts:75-110` — `wilsonInterval(wins, losses, ties, opts)`,
  einzige Wilson-Implementierung im Repo (`:1-5` sagt das ausdrücklich). `:112-165`
  `combineIndependentIntervals` (Fehlerfortpflanzung), `:195-230` `matchupCellInterval`
  mit der Präzedenz-Kette explizite Grenzen, Rohzähler, Rekonstruktion aus `total`/`winRate`.
- `packages/shared/src/fieldWinRate.ts:107-203` — `computeFieldScores`. **Out of Scope**
  (Spec "Out of Scope"): keine Zeile davon wird angefasst. `:132-139` behandelt den Mirror
  definitorisch als 50 % mit Varianzbeitrag 0 — dieselbe Konvention übernimmt §3.2.
- `packages/shared/src/winRate.ts:7,14-21` — `TIE_WEIGHT = 1/3`,
  `tournamentWinRate = (W + T/3)/(W+L+T)`. **Genau diese Konvention bricht die
  Nullsummen-Eigenschaft** — siehe Diskrepanz 2.
- `packages/shared/src/cardPerformance.ts:1-17` — Präzedenz für "reine Statistik-Schicht mit
  Herleitung im Dateikopf"; `:104-107` `rankEffectiveSampleSize` als Beispiel für eine
  hergeleitete Konstante mit Beweisskizze im Kommentar.
- `apps/web/src/components/meta/confidence.ts:16-21,25-35` — `confidenceTier(widthPct)`
  (bis 10 `high`, bis 20 `medium`, bis 35 `low`, sonst `veryLow`) und
  `formatWithInterval(...)`. **Wiederverwenden, keine zweite Formatierung bauen.**

> **Diskrepanz 2 (inhaltlich die wichtigste des ganzen Plans).** Mit der Turnier-Konvention
> "Remis = ein Drittel Sieg" gilt für ein Paar (i, j) mit `w` Siegen, `l` Niederlagen,
> `t` Remis und `n = w+l+t`:
> `p_ij + p_ji = (w + t/3)/n + (l + t/3)/n = (n − t/3)/n = 1 − t/(3n)`, also **kleiner als 1**.
> **Die Matchup-Matrix ist unter der Drittel-Konvention kein Nullsummenspiel** — sie ist es
> genau dann, wenn `t = 0`. Das Minimax-Theorem, auf das die gesamte LP-Entscheidung der
> Spec aufbaut, setzt aber Konstantsummigkeit voraus. Die Spec erwähnt das nicht.
> **Beleg aus den Daten des Referenzpapiers:** das Dragapult-Mirror steht dort mit
> 1374–1374–97 (2845 Spiele) und wird als **49,4 %** ausgewiesen, nicht als 50 % —
> `(1374 + 97/3)/2845 = 0,49432`. Genau die Remis-Delle.
> **Auflösung (§3.2):** für die spieltheoretische Schicht wird die Symmetrisierung
> `p_sym(i,j) = (1 + p_ij − p_ji)/2` verwendet. Sie ist beweisbar identisch mit der
> Halbe-Remis-Konvention `(w + t/2)/n` und damit exakt konstantsummig — und sie ist
> **dieselbe Formel, die das Referenzpapier benutzt** (`S_ij = (M_ij + 1000 − M_ji)/2`,
> §0.4). Die Drittel-Konvention bleibt für alles andere (Turnier-Wertung, Field-Score,
> Spec 2/3/5) unverändert gültig.

### 0.4 Das Referenzpapier — was daraus wirklich rekonstruierbar ist

Abgerufen am 2026-09-02 von `https://arxiv.org/html/2607.08692v1` (HTML-Fassung).

> **Belegt (aus dem Abruf), aber mit Vorbehalt:** die Zahlen unten wurden über einen
> **zusammenfassenden Abruf** gelesen, nicht Zeichen für Zeichen aus dem PDF. Vor der
> Verwendung als Test-Fixture ist eine **manuelle Sichtprüfung der Tabellen III und V
> Pflicht** (§4 Schritt 0). Ein Transkriptionsfehler in einer Fixture wäre schlimmer als
> gar keine Fixture.

**Was das Papier veröffentlicht:**
- **Tabelle V** — die 14 Archetypen mit Meta-Share (Dragapult Dusknoir 15,5 % bis
  Ceruledge 2,3 %).
- **Tabelle III** — eine **6x6-Teilmatrix** (Top-6) der Win-Rates in Prozent.
- **Tabelle VI/VII** — die Gleichgewichtsgewichte des *rohen* (nicht konstantsummigen) Spiels
  und des **symmetrisierten** Spiels: Grimmsnarl 34,3 %, Raging Bolt 29,4 %, Charizard 10,2 %,
  Mega Absol 10,2 %, Gholdengo 9,1 %, Gardevoir 4,3 %, Alakazam 2,5 %, **Dragapult 0,0 %**.
- **Robustheit (10 000 Iterationen):** Dragapult in **77,9 %** der Resamples ausgeschlossen;
  der exakte Sieben-Deck-Support nur in **2,1 %** reproduziert; Grimmsnarl 96,5 %,
  Mega Absol 97,3 %, Raging Bolt 98,3 % stabil; Dragapult-95-%-Intervall `[0,0 %; 12,2 %]`
  bei 22,1 % Inklusionsrate (= 100 − 77,9, in sich konsistent).
- **Zwei vollständige Rohbilanzen:** Dragapult-Mirror `1374–1374–97` (2845 Spiele),
  Gholdengo vs Dragapult `988–813–266` (2067 Spiele). Kleinere Matchups "~100 Spiele,
  ±9 pp bei 95 %".
- **Symmetrisierung:** `S_ij = (M_ij + 1000 − M_ji)/2` (Permille-Integer-Arithmetik).
- **Resampling:** *"samples each matchup cell from its Wilson interval and recomputes the
  Nash equilibrium"* — **die Verteilung wird nicht genannt.** Genau diese Lücke muss §3.4
  schließen; sie ist nicht aus der Quelle übernehmbar.
- **Verfahren:** LP (`scipy.optimize.linprog`) für die Kandidatensuche, exhaustive
  Enumeration nur zur Lean-Verifikation (Diskrepanz 1).

**Was das Papier NICHT veröffentlicht:**
- Die **vollständige 14x14-Matrix**. Sie ist "encoded in `RealMetagame.lean`" und liegt als
  *anonymisiertes Supplementary Material* bzw. über eine IEEE-DataPort-Referenz `[44]` vor;
  **keine direkte URL im Fließtext**. Folge: **die publizierten Gleichgewichtsgewichte sind
  ohne diese Matrix NICHT als Golden Test reproduzierbar.** Das ist die ehrliche Antwort auf
  das zweite AC der Spec ("soweit die dortigen Rohdaten rekonstruierbar sind — sonst ein
  selbst konstruiertes, dokumentiertes Beispiel"). §3.3 liefert deshalb **beides**: vier von
  Hand exakt nachrechenbare Beispiele **und** eine Fixture aus der publizierten 6x6-Teilmatrix.
  Ob das Artefakt beschaffbar ist, steht als offene Frage in §6.

**Vier exakte Rekonstruktionen, die schon jetzt als Golden Test taugen** (vom Planer
nachgerechnet; beide Richtungen stimmen auf die publizierte Nachkommastelle):
- `tournamentWinRate(813, 988, 266) = 901,667/2067 = 0,4362200` entspricht **43,6 %** =
  Tabelle III (Dragapult vs Gholdengo).
- `tournamentWinRate(988, 813, 266) = 1076,667/2067 = 0,5208837` entspricht **52,1 %** =
  Tabelle III (Gholdengo vs Dragapult).
- `tournamentWinRate(1374, 1374, 97) = 1406,333/2845 = 0,4943175` entspricht **49,4 %** =
  die Mirror-Diagonale — der Beleg für Diskrepanz 2.
- Symmetrisiert: `(1 + 0,4362200 − 0,5208837)/2 = 0,4576681 = 946/2067`, **exakt** gleich
  `(813 + 266/2)/2067`, also der Halbe-Remis-Konvention.

### 0.5 Präzedenzfälle, an denen dieser Plan hängt

- **Reine Berechnung ohne I/O in `packages/shared`:** `fieldWinRate.ts`, `wilsonInterval.ts`,
  `cardPerformance.ts`. Barrel: `packages/shared/src/index.ts:1-16` (braucht drei neue
  Re-Exports).
- **`@pokekon/shared` hat NULL Runtime-Dependencies** (`packages/shared/package.json:24-31`:
  ausschließlich devDependencies). Das ist das stärkste Argument dafür, den LP-Löser selbst
  zu schreiben statt ein Paket zu ziehen (CLAUDE.md §2.2 "Kostenlos bleiben" und die
  Null-Abhängigkeits-Linie des Pakets).
- **Kein PRNG im Repo:** `grep -rni random packages/shared/src apps/api/src` liefert nur
  `apps/api/src/lib/crypto.ts:1,24` (`randomBytes` für IVs). **Es gibt kein `Math.random` in
  der gesamten Analyse-Schicht** — ein deterministischer, geseedeter PRNG muss neu gebaut
  werden (§3.4), sonst sind Golden Tests über Monte-Carlo unmöglich.
- **Job-Muster:** `apps/api/src/jobs/computeCardStats.ts:151-259` (`computeCardStats(db, opts)`
  liefert ein Result-Objekt, `dryRun`, ein `computedAt` pro Lauf, Transaktion je Gruppe mit
  DELETE plus chunked INSERT, `INSERT_CHUNK_SIZE = 200`) plus CLI-Entry `:262-271` plus
  npm-Script `apps/api/package.json:19`.
- **Export statt Duplikat:** `apps/api/src/routes/meta.ts:71` exportiert `windowConditions`
  ausschließlich, damit `computeCardStats.ts:21` es importieren kann. Derselbe Weg wird hier
  für `loadMatchupData`/`loadWindowAggregates` gegangen (§3.7).
- **Leseseite ohne Lazy-Seed:** `apps/api/src/lib/cardStatsData.ts:13-84` (`loadCardStats`) —
  leere Tabelle bedeutet ehrlich leeres Ergebnis mit `computedAt: null`, kein 404, kein
  On-Demand-Rechnen. Gegenbeispiel bewusst NICHT übernommen: `lib/matchupData.ts:43-56`
  (`ensureMatchups`) mit Lazy-Seed.
- **Route-Muster:** `apps/api/src/routes/meta.ts:565-585` (`/archetypes/:id/card-stats`) —
  Query-Schema, Fenster-Snapping, keine Auth (öffentliche Referenzdaten), kein Rate-Limit
  auf reinen DB-Lesern.
- **Fenster-Snapping:** `apps/api/src/validation.ts:175-201` (`CARD_STATS_WINDOWS`,
  `snapCardStatsWindow`).
- **UI-Einhängepunkt:** `apps/web/src/pages/MetaPage.tsx:620-659` — drei
  `CollapsibleSection`-Blöcke, alle mit `defaultOpen`. Ein vierter Block **ohne**
  `defaultOpen` ist die konkrete, überprüfbare Umsetzung von "experimentell/zusätzlich"
  (AC 5).
- **i18n:** `apps/web/src/i18n/locales/{de,en}/meta.json`, Top-Level-Keys heute
  `page`, `window`, `prediction`, `metaTable`, `archetypeDetail`, `tournaments`,
  `matchupMatrix`, `metaShareChart`, `myMatchups`, `winRateChart`.

### 0.6 Infrastruktur

- Gates (Root `package.json:18-20`): `npm run typecheck`, `npm run lint`, `npm run test`
  (baut vorher `@pokekon/shared`).
- Migrationen: `apps/api/drizzle/0000` bis `0013`; generieren mit
  `npm run db:generate -w @pokekon/api`; Deploy über `railway.json` mit
  `preDeployCommand: npm run migrate:deploy -w @pokekon/api`. **Nächste Nummer: `0014`.**
- API-Test-Harness: `apps/api/src/api.test.ts` — PGlite plus echte Migrations-SQL; Job-Tests
  als eigene `describe`-Blöcke (`:2230` `computeCardStats job`, `:2475` Route, `:2580`
  `snapCardStatsWindow`). Muster: der Job-Test ruft die **bereits gepinnte** reine Engine auf,
  um die Erwartungswerte zu erzeugen, statt die Statistik zweimal zu behaupten (`:2263-2280`).
  Genau dieses Muster gilt hier wieder (§4 Slice C).
- Web-Tests: vitest plus jsdom; reine Helfer-Tests als Präzedenz
  (`components/meta/confidence.test.ts`, `winRateColor.test.ts`, `matchupCellStyle.test.ts`).
- Doku-Nummerierung: `docs/features.md` endet heute bei **§17 Card Performance Deltas**, also
  neuer **§18**. In `docs/database.md`, `docs/data-types.md`, `docs/data-flow.md` und
  `docs/backend-evolution-plan.md` kommt **kein einziges Mal** "Nash", "Replicator" oder
  "Spieltheorie" vor (per grep geprüft) — die Schicht ist in der Architektur-Doku noch gar
  nicht vorgesehen und muss dort neu eingeführt werden (anders als Spec 5, deren Tabelle in
  `backend-evolution-plan.md:212` schon vorgesehen war).

---

## 1. Summary

Oberhalb des bestehenden Field-Score entsteht eine **zweite, unabhängige Bewertungsebene**:
statt "wie gut steht Deck A gegen das *beobachtete* Feld" beantwortet sie "welche
Deck-Mischung wäre gegen sich selbst optimal — und welche Decks fallen dabei heraus,
egal wie populär sie sind". Grundlage ist die vorhandene, Spec-2/3-korrigierte
Matchup-Matrix. Sie wird zunächst in ein **exakt konstantsummiges** Payoff-Spiel überführt
(`p_sym(i,j) = (1 + p_ij − p_ji)/2`, beweisbar identisch mit der Halbe-Remis-Konvention und
identisch mit der Symmetrisierung des Referenzpapiers — ohne diesen Schritt ist die
Drittel-Remis-Matrix *kein* Nullsummenspiel und das Minimax-Theorem gar nicht anwendbar,
§0.3 Diskrepanz 2). Das symmetrische Nullsummenspiel wird per **Linearer Programmierung**
gelöst: `max 1·q` unter `P q ≤ 1`, `q ≥ 0` — ein Standardform-LP mit nichtnegativer rechter
Seite, dessen Ursprung bereits zulässig ist, sodass ein reiner **Phase-II-Simplex mit
Bland-Regel** genügt (rund 100 Zeilen, keine neue Dependency, deterministisch). Aus der
Lösung folgen Gleichgewichtsgewichte `x = q/Σq` und der Spielwert `1/Σq`, der bei einem
symmetrischen Spiel **exakt 50 %** sein muss und deshalb als eingebaute Selbstprüfung dient.
Zusätzlich liefert die Rechnung ein **beweisbares Ausschluss-Zertifikat**: ein Archetyp,
dessen Auszahlung gegen das Gleichgewicht echt unter dem Spielwert liegt, kann im Support
**keines** Gleichgewichts vorkommen (Vertauschbarkeitssatz für Nullsummenspiele) — das ist
die rigorose Form der "Dragapult hat 0 % Gewicht"-Aussage. Weil eine einzelne
Gleichgewichts-Zusammensetzung fragil ist, kommt darüber ein **Monte-Carlo-Robustheitscheck**:
jedes ungerichtete Paar wird **einmal** aus seiner Jeffreys-Beta-Posterior gezogen und die
Gegenrichtung als `1 − p` gesetzt, sodass die Konstantsummigkeit in **jedem** Resample exakt
erhalten bleibt; berichtet wird je Archetyp, in wie viel Prozent der Läufe er nicht im
Support liegt. Getrennt davon berechnet eine **Replicator-Schicht** die Fitness
`f_i = Σ_j x_j p_ij` (mittlere Fitness ist bei Konstantsummigkeit exakt 50 %), daraus die
diskrete Replicator-Fortschreibung und — über die **zwei letzten abgeschlossenen ISO-Wochen**
aus `meta_snapshots` — eine Richtung (steigend/fallend/stabil). Alles läuft als
**wöchentlicher Batch-Job** (`apps/api/src/jobs/computeEquilibrium.ts`, Muster
`computeCardStats.ts`) in zwei neue Tabellen; eine neue Route `GET /api/meta/equilibrium`
liefert sie aus. Die UI bekommt einen **eigenen, standardmäßig eingeklappten** Abschnitt auf
der Meta-Seite, der die robuste Aussage in Klartext **und** als Prozentzahl zeigt und die
exakte Zusammensetzung nur als Detail mit Fragilitäts-Hinweis. Field-Score, Matchup-Matrix
und Prognose-Panel bleiben Zeile für Zeile unverändert. Nutzer ist Konrad selbst
(Dogfooding), zusätzlich Portfolio-Beleg.

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik — Single Source of Truth)**
- [ ] `packages/shared/src/simplex.ts` **(neu)** — `solveStandardFormLp`, `LpResult`
- [ ] `packages/shared/src/simplex.test.ts` **(neu)** — Lehrbuch-LPs (§3.1)
- [ ] `packages/shared/src/deterministicRandom.ts` **(neu)** — `mulberry32`,
      `standardNormal`, `sampleGamma`, `sampleBeta` (§3.4)
- [ ] `packages/shared/src/deterministicRandom.test.ts` **(neu)**
- [ ] `packages/shared/src/nashEquilibrium.ts` **(neu)** — `zeroSumWinRate`,
      `buildPayoffMatrix`, `solveSymmetricZeroSumNash`, `resamplePayoffMatrix`,
      `equilibriumRobustness`, `replicatorStep`, `fitnessTrend`, `monteCarloSePct`,
      Konstanten (§3.2–§3.5)
- [ ] `packages/shared/src/nashEquilibrium.test.ts` **(neu)** — Golden-/Property-Tests
- [ ] `packages/shared/src/index.ts` — **drei** neue Re-Exports

**Datenmodell / Migration (`apps/api`)**
- [ ] `apps/api/src/db/schema.ts` — zwei neue Tabellen `metaEquilibriumRuns`,
      `metaEquilibriumArchetypes` (§3.6)
- [ ] `apps/api/drizzle/0014_*.sql` **(generiert, nicht handgeschrieben)** plus
      `apps/api/drizzle/meta/*` (Journal/Snapshot)

**API**
- [ ] `apps/api/src/jobs/computeEquilibrium.ts` **(neu)** plus CLI-Entry
- [ ] `apps/api/package.json` — Script `job:compute-equilibrium`
- [ ] `apps/api/src/lib/equilibriumData.ts` **(neu)** — `loadEquilibrium`, ohne Lazy-Seed
- [ ] `apps/api/src/routes/meta.ts` — **eine** neue Route `GET /equilibrium`; zusätzlich
      werden `loadMatchupData` und `loadWindowAggregates` **exportiert** (Muster
      `windowConditions`), sonst nichts geändert
- [ ] `apps/api/src/validation.ts` — `EQUILIBRIUM_WINDOWS`, `equilibriumQuerySchema`,
      `snapEquilibriumWindow`; `snapCardStatsWindow` wird auf einen generischen
      `snapToWindow(days, windows)` zurückgeführt (reiner Refactor, bestehende Tests bleiben)
- [ ] `apps/api/src/api.test.ts` — Job-Test plus Route-Test (neue `describe`-Blöcke)

**Web**
- [ ] `apps/web/src/lib/api.ts` — `MetaEquilibriumResponse`, `getMetaEquilibrium`
- [ ] `apps/web/src/components/meta/equilibriumFraming.ts` **(neu)** — reine Anzeige-Logik
      (`exclusionBand`, `paradoxLevel`, `monteCarloSeLabel`)
- [ ] `apps/web/src/components/meta/equilibriumFraming.test.ts` **(neu)**
- [ ] `apps/web/src/components/meta/EquilibriumPanel.tsx` **(neu)**
- [ ] `apps/web/src/pages/MetaPage.tsx` — **ein** zusätzlicher `CollapsibleSection`-Block
      **ohne** `defaultOpen`
- [ ] `apps/web/src/i18n/locales/{de,en}/meta.json` — neuer Key-Block `equilibrium.*` (§3.9)

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `docs/features.md` — neuer **§18 "Spieltheoretische Meta-Schicht (experimentell)"**,
      inklusive der drei dokumentationspflichtigen Annahmen aus §3.0 und der Abgrenzung
      Field-Score vs. Gleichgewichts-Auszahlung vs. Replicator-Fitness
- [ ] `docs/database.md` — `meta_equilibrium_runs`, `meta_equilibrium_archetypes`,
      Migration `0014`, neuer Job
- [ ] `docs/data-types.md` — `PayoffMatrix`, `NashEquilibrium`, `RobustnessResult`,
      `ReplicatorStep`, `FitnessTrend` plus Näherungen/Grenzen
- [ ] `docs/data-flow.md` — Job, Tabellen, Route, Panel
- [ ] `docs/backend-evolution-plan.md` §5.2 — die zwei Tabellen ergänzen (sie waren dort
      **nicht** vorgesehen, §0.6)
- [ ] `docs/architecture.md` — ein Absatz, dass eine reine Optimierungs-Schicht
      (LP-Löser) in `@pokekon/shared` liegt und warum sie dort und nicht in SQL lebt

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen, Formeln und nachrechenbare Wertetabellen — keine Implementierungsvorgaben darüber
hinaus.

> **Zu allen Zahlentabellen unten:** Die **Formel ist bindend**. Alle Gleichgewichte in
> §3.3 wurden vom Planer mit einer **unabhängigen, exakten Referenzrechnung** bestimmt
> (Support-Enumeration über `fractions.Fraction`, also ohne Gleitkomma), nicht geschätzt.
> Weicht ein Wert ab, gilt die Formel und der Testwert wird korrigiert — nicht umgekehrt.
> Werte, die aus Spec 3 stammen (`wilsonInterval.test.ts`), sind als solche markiert und
> **exakt**.

### 3.0 Die Mathematik (bindende Herleitung)

#### (a) Warum die Matrix erst konstantsummig gemacht werden muss

Das Minimax-Theorem und damit die gesamte LP-Entscheidung der Spec gilt für **Nullsummen-
bzw. Konstantsummenspiele**. Die vorhandenen Win-Rates erfüllen das **nicht**: mit
`p_ij = (w + t/3)/n` ist `p_ij + p_ji = 1 − t/(3n)`. Ein Remis verteilt zusammen nur zwei
Drittel eines Sieges — es *verschwindet* also Wert aus dem Spiel. Das ist kein Fehler der
Spec-2-Formel, sondern deren Zweck: die Turnier-Wertung *bestraft* Remis absichtlich
(3 Punkte Sieg, 1 Punkt Remis).

**Symmetrisierung (bindend):**

```
p_sym(i,j) = (1 + p_ij − p_ji) / 2          p_sym(i,i) = 1/2
```

**Satz.** Stammen `p_ij` und `p_ji` aus derselben Bilanz `(w, l, t)`, dann gilt für **jedes**
Remis-Gewicht `k` in `p = (w + k·t)/n`:

```
p_sym = (1 + (w + k t)/n − (l + k t)/n)/2 = (n + w − l)/(2n) = (2w + t)/(2n) = (w + t/2)/n
```

Die Symmetrisierung ist also **exakt die Halbe-Remis-Konvention** und **unabhängig davon,
welche Remis-Konvention die Quelle benutzt hat**. Zwei Konsequenzen, die beide in den
Funktionskommentar gehören:
1. Die offene Frage aus dem Spec-2-Plan ("welche Remis-Konvention benutzt TrainerHill?")
   ist für **diese** Schicht gegenstandslos.
2. `p_sym(i,j) + p_sym(j,i) = 1` gilt per Konstruktion, exakt, ohne Rundung.

Fachliche Begründung, warum Halbe-Remis hier *richtig* und Drittel-Remis *falsch* ist: die
spieltheoretische Frage lautet "welche Mischung ist gegen sich selbst optimal". Ein Remis ist
für beide Seiten dasselbe Ergebnis; ein Modell, in dem beide Seiten zusammen weniger als
einen Sieg erhalten, beschreibt kein Zweipersonen-Nullsummenspiel. Das Referenzpapier macht
genau denselben Schritt (`S_ij = (M_ij + 1000 − M_ji)/2`, §0.4) — hier unabhängig hergeleitet
und dann als übereinstimmend erkannt.

#### (b) Vom Minimax zum LP (Standardverfahren, kein Ersatzverfahren)

Sei `P` die symmetrisierte Matrix (`P_ij + P_ji = 1`, `P_ii = 1/2`), `A = P − 1/2`
antisymmetrisch. Für ein symmetrisches Nullsummenspiel ist der Spielwert von `A` gleich 0,
der von `P` also **exakt 1/2**. Eine Strategie `x` (mit `x ≥ 0`, `Σx = 1`) ist genau dann
optimal, wenn `(A x)_i ≤ 0` für alle `i`, gleichbedeutend mit `(P x)_i ≤ 1/2`.

Da alle Einträge von `P` in `[0,1]` liegen und der Spielwert `v = 1/2` strikt positiv ist,
gilt die klassische Dantzig-Substitution `q = y/v`. Aus dem LP des Minimierers wird:

```
maximiere  1ᵀq      unter      P q ≤ 1 ,      q ≥ 0
```

und daraus
```
Σq* = 1/v = 2        x* = q*/Σq*        valuePct = 100/Σq*
```

Drei Eigenschaften, die dieses LP besonders bequem machen und die als Kommentar an die
Funktion gehören:
- **Rechte Seite ist 1, also nichtnegativ.** Der Ursprung `q = 0` ist zulässig, also ist
  **keine Phase I** nötig — ein reiner Phase-II-Simplex genügt. Das halbiert den Code und
  eliminiert die fehleranfälligste Hälfte eines Simplex.
- **Das LP ist immer beschränkt.** Jede Spalte `j` hat mit `P_jj = 1/2` einen echt positiven
  Eintrag, also begrenzt Zeile `j` das Wachstum von `q_j`. Ein `unbounded`-Ergebnis kann bei
  einer korrekt gebauten Payoff-Matrix nicht auftreten und ist deshalb ein **Fehlerfall**,
  kein Normalfall.
- **Symmetrie erspart die zweite Lösung.** Für ein symmetrisches Spiel ist `x` genau dann
  optimal für den Zeilenspieler, wenn es optimal für den Spaltenspieler ist
  (`xᵀA ≥ 0` genau dann wenn `Ax ≤ 0`, weil `A = −Aᵀ`). Es genügt also **ein** LP; das duale
  muss nicht gelöst werden.

**Verbindliche Selbstprüfung:** `valuePct` muss `50` sein (Toleranz `1e-6`). Weicht es ab,
war die Eingabematrix nicht konstantsummig — das wird als `status: 'failed'` **gemeldet**,
nicht stillschweigend geglättet.

#### (c) Das Ausschluss-Zertifikat (der einzige harte Satz dieser Schicht)

**Satz.** Sei `x*` ein Gleichgewicht des symmetrischen Nullsummenspiels mit Wert `v`. Gilt
`(P x*)_i < v`, so liegt `i` im Support **keines** Gleichgewichts.
**Beweis.** In Nullsummenspielen sind optimale Strategien vertauschbar: ist `y` ebenfalls
optimal, so ist `(y, x*)` ein Gleichgewicht. Gleichgewicht verlangt, dass jede reine
Strategie im Support von `y` eine beste Antwort auf `x*` ist, also `(P x*)_i = v` erfüllt.
Aus `(P x*)_i < v` folgt, dass `i` keine beste Antwort ist, also nicht im Support von `y`
liegt. Ende.

Das ist die rigorose Fassung der Popularitäts-Paradox-Aussage: "Deck X hat nicht nur in
*diesem* Gleichgewicht Gewicht 0, es kann in **keinem** Gleichgewicht vorkommen." Genau diese
Aussage darf die UI treffen — und nur diese.

**Was NICHT gilt (und in keiner UI-Formulierung behauptet werden darf):** die Umkehrung.
`(P x*)_i = v` bedeutet **nicht**, dass `i` in irgendeinem Gleichgewicht vorkommt. Und die
*Zusammensetzung* selbst ist im Allgemeinen nicht eindeutig: schon eine 2x2-Matrix aus
lauter 50 %-Zellen hat unendlich viele Gleichgewichte. Als **Heuristik** (kein Zertifikat)
wird deshalb `equalizerCount = #{i : |payoff_i − v| ≤ eps}` mitgeliefert; ist er größer als
die Support-Größe, kann Eindeutigkeit **nicht ausgeschlossen werden**. Der belastbare Beleg
für Fragilität bleibt der Monte-Carlo-Teil, nicht dieser Zähler.

#### (d) Die Resampling-Verteilung (die Lücke, die das Referenzpapier offenlässt)

Das Papier sagt nur "samples each matchup cell from its Wilson interval" (§0.4). Eine
Verteilung ist damit nicht festgelegt, und die naheliegenden Kandidaten unterscheiden sich
erheblich. Bewertet wurden drei:

1. **Gleichverteilt im Wilson-Intervall** — verworfen. Sie legt gleich viel Masse an die
   Ränder wie in die Mitte; bei einem 30-pp-Band wäre der Rand genauso wahrscheinlich wie die
   Punktschätzung. Das ist keine Unsicherheitsdarstellung, das ist Rauschen.
2. **Zweiseitige (gespaltene) Normalverteilung mit den Streuungen aus dem Wilson-Band**,
   also `sigma_low = (p − low)/z`, `sigma_high = (high − p)/z` — genau die Rücklese-Formel,
   die `wilsonInterval.ts:125-130` bereits für die Fehlerfortpflanzung nutzt. Attraktiv,
   weil sie exakt die vorhandene, getestete Unsicherheits-Repräsentation weiterverwendet.
   **Verworfen wegen eines belegbaren Randdefekts:** für `1W/0L` ist das Wilson-Band
   `[20,65 %; 100 %]`, also `sigma_high = 0` — nach Klemmung an 1 läge die halbe
   Wahrscheinlichkeitsmasse als **Atom exakt auf 100 %**. Für die dünnen Zellen, um die es
   hier gerade geht, ist das falsch.
3. **Jeffreys-Beta-Posterior** `Beta(s + 1/2, n − s + 1/2)` mit `s = w + t/2` (der
   Halbe-Remis-Score aus (a)) und `n = w + l + t`. **Gewählt.** Begründung:
   - Sie ist eine **echte Verteilung auf `[0,1]`**, kollabiert an keinem Rand und erzeugt
     kein Atom.
   - Sie ist der bayessche Zwilling des Wilson-Intervalls: das Jeffreys-Intervall und das
     Wilson-Intervall sind die beiden Standard-Intervalle mit gutem Überdeckungsverhalten
     (im Gegensatz zu Wald) und liegen im mittleren Bereich dicht beieinander.
   - Sie ist **konsistent mit der Symmetrisierung**: mit `s = w + t/2` gilt
     `n − s = l + t/2`, die Posterior der Gegenrichtung ist also die exakte Spiegelung.
     `p_ji = 1 − p_ij` ist damit nicht nur eine Rechenbequemlichkeit, sondern die korrekte
     Gegen-Posterior.

**Empirischer Vergleich Jeffreys gegen Wilson** (vom Planer mit 200 000 Ziehungen je Zeile
gerechnet; Wilson-Werte exakt aus `wilsonInterval.test.ts`):

| Bilanz | Wilson 95 % (Spec 3) | Jeffreys-Beta, empirisches 95 %-Zentralintervall |
|---|---|---|
| 8W/2L | `[49,02 ; 94,33]` | `[49,8 ; 95,6]` |
| 0W/10L | `[0 ; 27,75]` | `[0,0 ; 21,8]` |
| 10W/0L | `[72,25 ; 100]` | `[78,4 ; 100,0]` |
| 1W/0L | `[20,65 ; 100]` | `[14,8 ; 100,0]` |

**Dokumentationspflichtige Einschränkung:** in der Mitte praktisch deckungsgleich, an den
Rändern deutlich abweichend (Wilson ist dort bewusst konservativer). Die berichteten
Robustheitszahlen sind daher **nicht** identisch mit einem "Resampling im Wilson-Band" im
wörtlichen Sinn. Das gehört als Kommentar an `resamplePayoffMatrix` **und** in
`docs/data-types.md`. Die Alternative 2 steht als offene Frage in §6.

**Zellen ohne jede Beobachtung** (`n = 0`, imputiert) werden aus `Beta(1,1)`, also
**gleichverteilt auf `[0,1]`**, gezogen — nicht aus der Jeffreys-Prior `Beta(0,5; 0,5)`.
Grund (nachgerechnet): `Beta(0,5; 0,5)` ist U-förmig, ihr empirisches 95 %-Intervall ist
`[0,15 % ; 99,84 %]` mit Massenkonzentration an beiden Rändern — sie *behauptet*, ein
unbekanntes Matchup sei vermutlich extrem. `Beta(1,1)` liefert `[2,5 % ; 97,5 %]` und sagt
schlicht "irgendwo in `[0,1]`". Das ist die ehrlichere Aussage über Nichtwissen.

**Symmetrieerhaltung (bindend):** gezogen wird **je ungeordnetem Paar genau einmal**;
`p_ji` wird als `1 − p_ij` gesetzt, die Diagonale bleibt `0,5`. Würde man beide Richtungen
unabhängig ziehen, wäre die Resample-Matrix nicht mehr konstantsummig, der Spielwert nicht
mehr 50 % und das LP löste ein anderes Spiel als das Punktschätzungs-LP. **Ein Test muss für
jedes Resample `p_ij + p_ji = 1` und `valuePct = 50` prüfen.**

#### (e) Replicator-Dynamik

Diskrete Replicator-Gleichung mit Auszahlungen als Gewinnwahrscheinlichkeiten:

```
f_i(x) = Σ_j x_j P_ij          phi(x) = Σ_i x_i f_i(x)          x_i' = x_i · f_i / phi
```

Bei konstantsummiger Matrix ist `phi(x) = 1/2` **exakt und für jedes `x`** (denn
`Σ_i Σ_j x_i x_j P_ij = Σ_{i<j} x_i x_j (P_ij + P_ji) + Σ_i x_i² /2 = 1/2`). Daraus folgt
ein **parameterfreier** Wachstumsfaktor:

```
growth_i = f_i/phi − 1 = 2·f_i − 1 = (fitnessPct_i − 50)/50
```

Kein freier Hintergrund-Fitness-Parameter, keine Kalibrierung — das ist der Grund, warum
diese Schicht überhaupt ohne willkürliche Konstante auskommt. `Σ_i x_i' = 1` gilt automatisch.

**Richtung über Woche-über-Woche.** Verglichen werden **zwei Share-Vektoren an derselben
Matrix**: `fitnessDeltaPp_i = f_i(x_t) − f_i(x_{t−1}) = Σ_j (x_{t,j} − x_{t−1,j}) · P_ij`.
Das isoliert exakt die Frage "hat die Veränderung des Feldes mein Deck besser oder schlechter
positioniert". Zwei Matrizen (eine je Woche) wurden verworfen: dann vermischte sich die
Meta-Verschiebung mit dem Stichprobenrauschen der Wochen-Matchup-Daten, und gerade die
Wochen-Matrix ist am dünnsten.

#### (f) Drei Zahlen, die sich zum Verwechseln ähnlich sehen

Nach dieser Spec existieren nebeneinander:

| Zahl | Definition | Quelle |
|---|---|---|
| `fieldWinRatePct` | share-gewichteter EV gegen das **beobachtete** Feld, normiert auf die abgedeckte Share, Remis = ein Drittel | `fieldWinRate.ts` (Spec 3), unverändert |
| `fitnessPct` | `Σ_j x_j P_ij` gegen das **beobachtete** Feld, fehlende Zellen als 50 % imputiert, Remis = ein Halb | neu, §3.5 |
| `equilibriumPayoffPct` | `Σ_j x*_j P_ij` gegen das **Gleichgewicht**, nicht gegen das beobachtete Feld | neu, §3.3 |

Sie sind **nicht** ineinander überführbar (unterschiedliche Remis-Konvention, unterschiedliche
Behandlung fehlender Zellen, unterschiedliche Gewichtsvektoren) und werden auch typischerweise
leicht auseinanderlaufen. Das ist kein Bug. Es ist aber ein echtes UX-Risiko (§6 Risiko 6) und
verlangt drei unterscheidbare Labels plus je einen Tooltip; die Doku bekommt die Tabelle oben
wörtlich.

### 3.1 `packages/shared/src/simplex.ts` (neu)

```ts
export interface LpResult {
  status: 'optimal' | 'unbounded' | 'iterationLimit';
  /** Objective value at the optimum; 0 when the status is not 'optimal'. */
  objective: number;
  /** Primal solution, length n; all zeros when the status is not 'optimal'. */
  x: number[];
  /** Pivots performed — exposed so the job can log/limit real-world cost. */
  iterations: number;
}

/**
 * Phase-II primal simplex for the STANDARD-FORM LP
 *   maximise c·x   subject to   Ax <= b,  x >= 0,   with b >= 0.
 * b >= 0 makes the origin a feasible basic solution, so no Phase I is needed
 * (plan section 3.0b). Bland's rule (lowest index for both the entering column
 * and, on a ratio tie, the leaving row) guarantees termination under
 * degeneracy. Degeneracy is the NORMAL case here — a matchup matrix is full of
 * exact 50 % cells — and determinism is non-negotiable: the same input must
 * always yield the same vertex, otherwise the Monte-Carlo robustness figures
 * would not be reproducible from the stored seed.
 * Throws on shape mismatch, on a negative entry in b and on non-finite input:
 * a silently wrong LP would be worse than a loud failure (same stance as
 * zForConfidence in wilsonInterval.ts).
 */
export function solveStandardFormLp(
  c: number[],
  A: number[][],
  b: number[],
  opts?: { maxIterations?: number; epsilon?: number },
): LpResult;
```

Defaults: `epsilon = 1e-9`, `maxIterations = 200 * (n + m)`.

**Golden Tests (von Hand nachrechenbar):**

| # | LP | Erwartung |
|---|---|---|
| 1 | `max x1+x2`, `x1 <= 1`, `x2 <= 1` | `objective 2`, `x = [1,1]` |
| 2 | Lehrbuch (Wyndor): `max 3x+5y`, `x <= 4`, `2y <= 12`, `3x+2y <= 18` | `objective 36`, `x = [2,6]` |
| 3 | `max x`, `0·x <= 1` | `status 'unbounded'` |
| 4 | `c = [0,0]`, beliebiges zulässiges `A`, `b` | `objective 0`, `x = [0,0]` |
| 5 | entartet: `max x1+x2`, `x1+x2 <= 1`, `x1+x2 <= 1`, `x1 <= 1` | `objective 1`, terminiert (Bland), `iterations` endlich |
| 6 | `b` enthält einen negativen Eintrag | wirft |
| 7 | `A`-Zeile mit falscher Länge | wirft |

Test 2 ist zusätzlich per Constraint-Check verifizierbar: `3·2+5·6 = 36`, `2 <= 4`,
`2·6 = 12 <= 12`, `3·2+2·6 = 18 <= 18`.

### 3.2 Payoff-Matrix und die Nullsummen-Win-Rate

```ts
// packages/shared/src/nashEquilibrium.ts

/**
 * ZERO-SUM win rate: (wins + ties/2) / (wins + losses + ties). Returns null
 * when no game was played.
 *
 * This is NOT tournamentWinRate() from winRate.ts and must never replace it.
 * The tournament convention (a tie is a THIRD of a win) deliberately destroys
 * value: p_ij + p_ji = 1 - t/(3n) < 1, so the matchup matrix is not a
 * constant-sum game and the minimax theorem does not apply to it (plan section
 * 0.3 / 3.0a). The half-tie convention restores p_ij + p_ji = 1 exactly. It
 * lives in THIS file, not in winRate.ts, so nobody can pick the wrong one by
 * autocomplete.
 */
export function zeroSumWinRate(wins: number, losses: number, ties?: number): number | null;
```

Verbindliche Werte:

| wins | losses | ties | Ergebnis | Bedeutung |
|---|---|---|---|---|
| 1374 | 1374 | 97 | `0.5` **exakt** | Dragapult-Mirror des Referenzpapiers (2845 Spiele); `tournamentWinRate` liefert hier `0,4943175` (= publizierte 49,4 %) |
| 813 | 988 | 266 | `946/2067 = 0.4576681…` | Dragapult vs Gholdengo, publizierte Bilanz |
| 988 | 813 | 266 | `1121/2067 = 0.5423319…` | Gegenrichtung; Summe **exakt 1** |
| 8 | 2 | 0 | `0.8` | ohne Remis identisch mit `tournamentWinRate` |
| 0 | 0 | 4 | `0.5` | nur Remis |
| 0 | 0 | 0 | `null` | |
| −5 | 2 | 0 | wie `0 / 2 / 0`, also `0` | defensiv, gleicher Vertrag wie `tournamentWinRate` |

Property-Test (der Satz aus §3.0a): für zufällige `(w,l,t)` gilt
`zeroSumWinRate(w,l,t) === (1 + tournamentWinRate(w,l,t) − tournamentWinRate(l,w,t)) / 2`
bis auf `1e-12`. **Dieser Test ist der Anker, der die Symmetrisierung an Spec 2 bindet.**

```ts
export interface PayoffMatrix {
  archetypeIds: string[];
  /** p[i][j] = probability that i beats j, in [0,1]. Guaranteed by
   *  construction: p[i][j] + p[j][i] === 1 and p[i][i] === 0.5. */
  p: number[][];
  /** Sample size behind the unordered pair {i,j}; 0 when imputed. Symmetric. */
  games: number[][];
  /** true where the cell carries NO data and was imputed as 0.5. Symmetric,
   *  false on the diagonal (the mirror is definitional, not imputed — same
   *  stance as fieldWinRate.ts:132-139). */
  imputed: boolean[][];
  /** Share of the n*(n-1) off-diagonal cells that were imputed, 1 decimal. */
  imputedCellSharePct: number;
  /** Per archetype: opponent-share-weighted coverage of its own row, 1 decimal.
   *  DELIBERATELY NOT the same number as FieldScore.coveragePct — that one
   *  includes the mirror and normalises over the total share (fieldWinRate.ts
   *  :58-64). This one excludes the mirror. Documented in docs/data-types.md. */
  rowCoveragePct: number[];
}

/**
 * Build the constant-sum payoff matrix for a set of archetypes from the
 * directed matchup cells the API already produces (routes/meta.ts:220-228).
 * `sharePct` is only used for rowCoveragePct; the equilibrium itself does NOT
 * depend on the observed shares — that independence is the whole point of the
 * comparison "share vs equilibrium weight".
 */
export function buildPayoffMatrix(
  archetypes: { archetypeId: string; sharePct: number }[],
  cells: MatchupCellLike[],
): PayoffMatrix;
```

**Verbindliche Präzedenz je ungeordnetem Paar {i, j}, erste Übereinstimmung gewinnt:**

| # | Bedingung | `p[i][j]` | `games[i][j]` | `imputed` |
|---|---|---|---|---|
| 1 | Zelle (i,j) hat `wins`/`losses` und `w+l+t > 0` | `zeroSumWinRate(w, l, t)` | `w+l+t` | `false` |
| 2 | sonst Zelle (j,i) mit Zählern | `1 − zeroSumWinRate(w_ji, l_ji, t_ji)` | `w+l+t` | `false` |
| 3 | sonst **beide** gerichteten `winRate` vorhanden, `total > 0` | `(1 + wr_ij/100 − wr_ji/100)/2` | `max(total_ij, total_ji)` | `false` |
| 4 | sonst **eine** gerichtete `winRate`, `total > 0` | `wr/100` (bzw. `1 − wr/100` gespiegelt) | `total` | `false` |
| 5 | sonst | `0.5` | `0` | `true` |

Zeile 4 ist der einzige Fall, in dem die Remis-Delle **nicht** repariert werden kann (es gibt
nur eine Richtung und keine Zähler). Er kommt im heutigen Produktionspfad **nicht** vor
(`routes/meta.ts:220-228` liefert immer Zähler), gehört aber vollständig spezifiziert und
bekommt einen Kommentar.

Verbindliche Eigenschaften (Testgrundlage):
- `p[i][i] === 0.5` und `imputed[i][i] === false` für alle `i`.
- `p[i][j] + p[j][i] === 1` für **alle** `i, j` (Toleranz `1e-12`) — auch bei imputierten und
  bei nur einseitig belegten Paaren.
- Zellen mit `deck1`/`deck2` außerhalb der Archetypen-Liste werden ignoriert.
- `archetypes: []` ergibt eine 0x0-Matrix mit `imputedCellSharePct === 0`.
- Ein Archetyp ohne **jede** Gegner-Zelle hat `rowCoveragePct === 0` und eine Zeile aus
  lauter 0,5 — er ist damit ein **Equalizer**, der gegen jede Mischung genau den Spielwert
  erzielt und dadurch im Support landen kann, ohne dass dafür ein einziger Datenpunkt
  spricht. Das ist der gefährlichste Fall dieser Schicht und wird an drei Stellen adressiert:
  `rowCoveragePct` steht in der Antwort, der Monte-Carlo zieht imputierte Zellen
  gleichverteilt (§3.0d), und die UI kennzeichnet Support-Mitglieder mit niedriger
  Zeilenabdeckung ausdrücklich (§3.8). **Kein Cutoff** — das wäre die Rückkehr des in Spec 3
  abgeschafften Denkmusters.

### 3.3 Das Gleichgewicht plus Ausschluss-Zertifikat

```ts
/** Weight below which an archetype counts as "not in the support". Numerical,
 *  not statistical: the simplex returns exact zeros for non-basic variables,
 *  this only absorbs float noise in degenerate bases. */
export const SUPPORT_EPSILON_PCT = 1e-6;
/** Same idea for the payoff comparison against the game value. */
export const PAYOFF_EPSILON_PP = 1e-6;

export interface NashEquilibrium {
  archetypeIds: string[];
  /** Equilibrium weights in percent, summing to 100. Unrounded here; the job
   *  rounds to 2 decimals when persisting. */
  weightsPct: number[];
  /** (P x*)_i * 100 — expected win rate of playing i AGAINST the equilibrium
   *  mixture. Equals valuePct for every i in the support. */
  payoffsPct: number[];
  /** Value of the game * 100. MUST be 50 for a constant-sum input; any larger
   *  deviation than PAYOFF_EPSILON_PP means the input was not constant-sum. */
  valuePct: number;
  /** archetypeIds with weight above SUPPORT_EPSILON_PCT, weight desc. */
  support: string[];
  /** Provably in the support of NO equilibrium: payoff strictly below the value
   *  (theorem in plan section 3.0c). Sorted by payoff asc. */
  excludedCertain: string[];
  /** #{i : |payoff_i - value| <= PAYOFF_EPSILON_PP}. Heuristic fragility hint,
   *  NOT a uniqueness certificate — see plan section 3.0c. */
  equalizerCount: number;
  iterations: number;
  status: 'optimal' | 'failed';
}

/**
 * Nash equilibrium of a symmetric constant-sum game via linear programming
 * (plan section 3.0b): maximise 1·q s.t. Pq <= 1, q >= 0, then x = q/sum(q)
 * and value = 1/sum(q). Reuses solveStandardFormLp — no second LP anywhere.
 * n === 0 yields an empty result with valuePct 50 and status 'optimal'.
 */
export function solveSymmetricZeroSumNash(
  matrix: PayoffMatrix,
  opts?: { maxIterations?: number; epsilon?: number },
): NashEquilibrium;
```

**Golden Tests — die vier von Hand konstruierten Fälle.** Alle vier wurden vom Planer mit
exakter Bruchrechnung per Support-Enumeration verifiziert; die Erwartungswerte sind exakt,
Toleranz `1e-9` auf Prozent.

**(A) Schere-Stein-Papier (3 Archetypen).** `P = [[.5,1,0],[0,.5,1],[1,0,.5]]`

| Feld | Erwartung |
|---|---|
| `weightsPct` | `[100/3, 100/3, 100/3]` |
| `payoffsPct` | `[50, 50, 50]` |
| `valuePct` | `50` |
| `support` | alle drei |
| `excludedCertain` | `[]` |
| `equalizerCount` | `3` |

Hand-Nachweis: `Σq = 2` mit `q = [2/3, 2/3, 2/3]`; Zeile 1 des LP:
`0,5·2/3 + 1·2/3 + 0·2/3 = 1` (straff). Der Spielwert `1/Σq = 0,5` ist die
eingebaute Selbstprüfung.

**(B) Gewichtetes Schere-Stein-Papier.** `A` beats `B` 60/40, `B` beats `C` 70/30,
`C` beats `A` 55/45, also `a = 0,10`, `b = 0,20`, `c = 0,05`.

| Feld | Erwartung |
|---|---|
| `weightsPct` | `[400/7, 100/7, 200/7] = [57.142857…, 14.285714…, 28.571428…]` |
| `payoffsPct` | `[50, 50, 50]` |
| `valuePct` | `50` |

Hand-Nachweis: für ein antisymmetrisches 3x3 ist das Gleichgewicht proportional zu
`(b, c, a) = (0,20 ; 0,05 ; 0,10)`, normiert `(4/7, 1/7, 2/7)`. Der Testfall belegt, dass die
Gewichte **nicht** einfach den Win-Rates folgen: `A` hat die kleinste Vorteilskante und das
größte Gewicht.

**(C) Der Popularitäts-Paradox-Fall (4 Archetypen).** Schere-Stein-Papier `A/B/C` plus `D`,
das gegen alle drei 40 % gewinnt. Shares (nur für die UI-Aussage, nicht für die Rechnung):
`D 40 %`, `A/B/C` je `20 %`.

| Feld | Erwartung |
|---|---|
| `weightsPct` | `[100/3, 100/3, 100/3, 0]` |
| `payoffsPct` | `[50, 50, 50, 40]` |
| `support` | `['A','B','C']` |
| `excludedCertain` | `['D']` |
| `equalizerCount` | `3` |

**Das ist der inhaltliche Kernfall der ganzen Spec**: das mit Abstand meistgespielte Deck hat
Gleichgewichts-Gewicht 0 und ist per Satz aus §3.0c in **keinem** Gleichgewicht. Der Test
gehört mit genau diesem Kommentar in die Suite.

**(D) Reine Dominanz (2x2).** `A` schlägt `B` 60/40.

| Feld | Erwartung |
|---|---|
| `weightsPct` | `[100, 0]` |
| `payoffsPct` | `[50, 40]` |
| `support` | `['A']`, `excludedCertain` `['B']`, `equalizerCount` `1` |

**(E) Vollständig entartet (3x3 aus lauter 50 %).** Jede Mischung ist optimal.

| Feld | Erwartung |
|---|---|
| `valuePct` | `50` |
| `payoffsPct` | `[50, 50, 50]` |
| `excludedCertain` | `[]` |
| `equalizerCount` | `3`, `support.length === 1` |
| `weightsPct` | `[100, 0, 0]` — deterministische Bland-Ecke, **nicht** `[33,3; 33,3; 33,3]` |

Hand-Nachweis: Bland wählt die erste Spalte, alle Verhältnisse sind gleich 2, also Zeile 0;
nach dem Pivot ist die Zielzeile nichtnegativ, `Σq = 2`, `q = [2,0,0]`. **Genau dieser Fall
zeigt, warum die exakte Zusammensetzung ohne den Robustheitscheck nicht präsentiert werden
darf** — hier behauptete eine naive UI "spiel zu 100 % Deck A", obwohl das Spiel gar keine
Präferenz hat. `equalizerCount (3) > support.length (1)` ist die Warnflagge. Der Test gehört
mit dieser Begründung in die Suite.

**(F) Fixture aus dem Referenzpapier (6x6, echte Daten).** Tabelle III (§0.4), symmetrisiert
mit `S_ij = (M_ij + 100 − M_ji)/2`. Die symmetrisierte Matrix (Prozent, exakt):

| | dragapult | gholdengo | grimmsnarl | absol | gardevoir | charizard |
|---|---|---|---|---|---|---|
| dragapult | 50,000 | 45,750 | 40,700 | 40,300 | 35,800 | 65,850 |
| gholdengo | 54,250 | 50,000 | 50,450 | 46,550 | 47,400 | 50,150 |
| grimmsnarl | 59,300 | 49,550 | 50,000 | 36,150 | 59,600 | 58,050 |
| absol | 59,700 | 53,450 | 63,850 | 50,000 | 57,800 | 50,200 |
| gardevoir | 64,200 | 52,600 | 40,400 | 42,200 | 50,000 | 41,800 |
| charizard | 34,150 | 49,850 | 41,950 | 49,800 | 58,200 | 50,000 |

Erwartung (exakt, per Enumeration verifiziert):

| Feld | Erwartung |
|---|---|
| `valuePct` | `50` |
| `weightsPct` | `absol = 100`, alle anderen `0` |
| `payoffsPct` | `[40.30, 46.55, 36.15, 50.00, 42.20, 49.80]` |
| `support` | `['absol']` |
| `excludedCertain` | alle fünf anderen, sortiert `['grimmsnarl','dragapult','gardevoir','gholdengo','charizard']` |
| `equalizerCount` | `1` |

Der Fall ist **vollständig von Hand prüfbar**: die Absol-Zeile ist überall mindestens 50, also
ist reines Absol optimal, und die Auszahlung jedes anderen gegen reines Absol ist genau die
Absol-**Spalte**.
**Pflicht-Kommentar an diesem Test:** das ist das Gleichgewicht des publizierten
**6x6-Teilspiels**, **nicht** das im Papier berichtete Gleichgewicht des vollen 14-Deck-Spiels
(dort ist Absol nur mit 10,2 % beteiligt, weil Raging Bolt und Alakazam fehlen). Übereinstimmend
ist die *Richtung*: Dragapult, das populärste Deck, hat Gewicht 0 und Auszahlung unter dem
Spielwert. Wer diesen Test später als "Papier reproduziert" liest, liest ihn falsch — deshalb
steht das im Testnamen, nicht nur im Kommentar.

**Weitere verbindliche Eigenschaften (Property-Tests):**
- `Σ weightsPct === 100` (Toleranz `1e-9`) für jede nichtleere Matrix.
- Jeder Archetyp im `support` hat `payoffPct === valuePct` (Toleranz `PAYOFF_EPSILON_PP`).
- Kein Archetyp hat `payoffPct` echt über `valuePct` (Gleichgewichtsbedingung).
- `excludedCertain` und `support` sind disjunkt.
- **Permutationsinvarianz des Ausschlusses:** vertauscht man die Reihenfolge der Archetypen,
  bleibt `excludedCertain` als Menge identisch (der `support` darf sich bei Entartung
  ändern — genau das ist die Fragilität, und dieser Test hält den Unterschied fest).
- `n === 1`: `weightsPct = [100]`, `payoffsPct = [50]`, `excludedCertain = []`.
- `n === 0`: leere Arrays, `valuePct = 50`, `status 'optimal'`.
- **Nicht konstantsummige Eingabe** (eine von Hand gebaute 2x2-Matrix mit
  `p[0][1] = 0.6` UND `p[1][0] = 0.6`, deren Summe also 1.2 statt 1 ergibt): `status 'failed'`
  statt einer stillen Zahl. `buildPayoffMatrix` kann so etwas nie erzeugen, aber
  `solveSymmetricZeroSumNash` nimmt eine `PayoffMatrix` entgegen und muss sich gegen einen
  kuenftigen zweiten Producer wehren.

### 3.4 Deterministischer Zufall und der Monte-Carlo-Robustheitscheck

```ts
// packages/shared/src/deterministicRandom.ts (neu)

/**
 * mulberry32 — a 32-bit seeded PRNG in ~6 lines, uniform on [0,1). Chosen
 * because it is short enough to review by eye, uses only int32 arithmetic
 * (Math.imul), and is therefore bit-identical on every platform Node runs on.
 * There is deliberately NO Math.random anywhere in this layer: without a seed
 * the Monte-Carlo results would not be reproducible from the stored run
 * metadata, and golden tests would be impossible.
 */
export function mulberry32(seed: number): () => number;

/** Box-Muller standard normal, consuming two uniforms per call. */
export function standardNormal(rng: () => number): number;

/** Marsaglia-Tsang gamma sampler; shape < 1 handled by the standard boost
 *  Gamma(a) = Gamma(a+1) * U^(1/a). Scale is always 1. */
export function sampleGamma(shape: number, rng: () => number): number;

/** Beta(a, b) = X/(X+Y) with X ~ Gamma(a), Y ~ Gamma(b). */
export function sampleBeta(a: number, b: number, rng: () => number): number;
```

**Verbindliche Werte `mulberry32` (vom Planer in Node berechnet, exakt):**

| Aufruf | Wert |
|---|---|
| `mulberry32(1)()` 1. | `0.6270739405881613` |
| 2. | `0.0027357211802155` |
| 3. | `0.5274470399599522` |
| 4. | `0.9810509674716741` |
| 5. | `0.9683778982143849` |
| `mulberry32(20260902)()` 1.–3. | `0.2709086062386632`, `0.5421625019516796`, `0.7994366891216487` |

Weitere Eigenschaften: alle Werte in `[0,1)`; zwei Generatoren mit demselben Seed liefern
identische Folgen; mit verschiedenen Seeds unterscheiden sich die ersten fünf Werte.

**Verbindliche Eigenschaften der Sampler** (mit `mulberry32(1)`, deterministisch, daher als
harte Assertions formulierbar):
- `sampleBeta(a, b, rng)` liegt für 10 000 Ziehungen immer echt in `(0,1)`.
- Mittelwert über 50 000 Ziehungen von `Beta(8.5, 2.5)` liegt bei `a/(a+b) = 0,7727`
  (Toleranz `0,01`); Varianz bei `ab/((a+b)²(a+b+1)) = 0,0146` (Toleranz `0,003`).
- `Beta(1,1)` ist gleichverteilt: Mittelwert `0,5` (Toleranz `0,01`), und die zehn Dezile
  sind je mit `10 % ± 1,5 pp` besetzt.
- `sampleGamma(0.5, rng)` (Formfaktor unter 1, also der Boost-Zweig) liefert nur positive,
  endliche Werte; Mittelwert `0,5` (Toleranz `0,02`).

```ts
// packages/shared/src/nashEquilibrium.ts

export const DEFAULT_RESAMPLES = 2000;
export const DEFAULT_SEED = 20260902;

/**
 * Draw ONE resampled payoff matrix. Sampling happens per UNORDERED pair; the
 * mirror cell is set to 1 - p and the diagonal stays 0.5, so the resampled
 * matrix is constant-sum by construction (plan section 3.0d — resampling both
 * directions independently would silently change the game being solved).
 *
 * Distribution per pair:
 *   games > 0 : Beta(s + 0.5, n - s + 0.5)  (Jeffreys posterior),
 *               s = p * n, n = games
 *   games = 0 : Beta(1, 1) = uniform on [0,1]  (honest "unknown", not the
 *               U-shaped Jeffreys prior — see the plan for the numbers)
 */
export function resamplePayoffMatrix(
  matrix: PayoffMatrix,
  rng: () => number,
): PayoffMatrix;

export interface ArchetypeRobustness {
  archetypeId: string;
  /** Percentage of resamples in which the weight stayed at (numerically) zero. */
  exclusionRatePct: number;
  /** Mean equilibrium weight across resamples, percent. */
  meanWeightPct: number;
  /** 5th / 95th percentile of the weight across resamples, percent. */
  weightP05Pct: number;
  weightP95Pct: number;
  /** Percentage of resamples in which the exclusion CERTIFICATE held
   *  (payoff strictly below the value) — the strong statement, always <=
   *  exclusionRatePct. */
  certainExclusionRatePct: number;
}

export interface RobustnessResult {
  resamples: number;
  seed: number;
  perArchetype: ArchetypeRobustness[];
  /** Percentage of resamples whose SUPPORT SET equals the point estimate's —
   *  the analogue of the reference paper's 2.1 % figure. */
  exactSupportRatePct: number;
  /** Resamples whose LP did not return 'optimal'. Reported, never silently
   *  dropped; they are excluded from all rates and the denominator shrinks
   *  accordingly. */
  failedResamples: number;
}

/** Monte-Carlo robustness of the equilibrium support. Deterministic given the
 *  seed. Pure: the caller supplies the seed, this function creates no entropy. */
export function equilibriumRobustness(
  matrix: PayoffMatrix,
  pointEstimate: NashEquilibrium,
  opts?: { resamples?: number; seed?: number; maxIterations?: number },
): RobustnessResult;

/** Standard error of a Monte-Carlo rate, in percentage points:
 *  sqrt(p(1-p)/R) * 100. At R = 2000 and p = 0.78 this is 0.93 pp — the
 *  reported percentage is honest to about one decimal, no further. */
export function monteCarloSePct(ratePct: number, resamples: number): number;
```

**Verbindliche Eigenschaften (Testgrundlage):**

| Szenario | Erwartung |
|---|---|
| Fixture (C) mit `games = 100000` in **jeder** Zelle, `resamples: 500` | `D.exclusionRatePct === 100`, `A/B/C.exclusionRatePct === 0`, `exactSupportRatePct === 100` |
| Fixture (C) mit `games = 20` in jeder Zelle, `resamples: 500` | `D.exclusionRatePct` strikt zwischen 0 und 100; `exactSupportRatePct` unter 100 — die These "dünne Daten machen das exakte Gleichgewicht fragil, den Ausschluss aber nicht sofort" wird als **gemessener Wert im Test festgeschrieben**, nachdem der Implementer ihn einmal ermittelt hat (Regressionsanker, im Test als selbst berechnet gekennzeichnet) |
| gleicher Seed zweimal | **bitgleiches** Ergebnis |
| Seed `1` gegen Seed `2` | mindestens ein `exclusionRatePct` unterscheidet sich |
| jedes Resample | `p[i][j] + p[j][i] === 1` und die Lösung hat `valuePct === 50` (über `resamplePayoffMatrix` direkt geprüft) |
| Matrix vollständig imputiert (`games` überall 0) | `imputedCellSharePct === 100`; alle `exclusionRatePct` liegen echt zwischen 0 und 100 — kein Archetyp wird trotz Datenmangel als robust ausgeschlossen ausgewiesen |
| `resamples: 0` | `perArchetype` mit lauter `0`-Raten, `exactSupportRatePct === 0`, kein Absturz |
| `monteCarloSePct(78, 2000)` | `0.926…` (Toleranz `1e-3`) |
| `monteCarloSePct(78, 10000)` | `0.414…` |
| `monteCarloSePct(100, 500)` | `0` |

### 3.5 Replicator-Fitness und Trendrichtung

```ts
/** Fitness change below this magnitude (percentage points) is reported as
 *  'stable'. A DISPLAY threshold, not an inference rule: the number itself is
 *  always shown next to the label. Tuned value, see plan section 6. */
export const REPLICATOR_STABLE_BAND_PP = 1;

export interface ReplicatorStep {
  archetypeIds: string[];
  /** f_i(x) * 100 — expected win rate of i against the population x. */
  fitnessPct: number[];
  /** Mean population fitness * 100. EXACTLY 50 for a constant-sum matrix — a
   *  built-in self check (plan section 3.0e). */
  meanFitnessPct: number;
  /** (f_i/phi - 1) * 100 = one-week relative growth rate in percent. */
  growthPct: number[];
  /** Renormalised x_i' * 100. Sums to 100 by construction. */
  projectedSharePct: number[];
}

/** One discrete replicator step. `sharePct` need not sum to 100 — it is
 *  renormalised first (the archetype set excludes 'other', so it usually does
 *  not). Returns empty arrays for an empty matrix. */
export function replicatorStep(matrix: PayoffMatrix, sharePct: number[]): ReplicatorStep;

export type FitnessDirection = 'rising' | 'falling' | 'stable' | 'unknown';

export interface FitnessTrend {
  archetypeId: string;
  fitnessPct: number;
  /** null when the archetype had no share in the previous week's vector. */
  previousFitnessPct: number | null;
  fitnessDeltaPp: number | null;
  /** Observed week-over-week share change, DESCRIPTIVE ONLY: it carries no
   *  confidence statement and is never used to derive `direction`. It is there
   *  so the UI can put "theory said grow" next to "reality: shrank". */
  observedShareDeltaPp: number | null;
  direction: FitnessDirection;
}

/**
 * Fitness of each archetype against the current and the previous week's field,
 * evaluated on the SAME payoff matrix (plan section 3.0e): the delta then
 * isolates the meta shift instead of mixing it with per-week matchup noise.
 * Both share vectors are restricted to the matrix's archetype set and
 * renormalised; an archetype missing from the previous week counts as 0 there,
 * which is a real statement (it was below the 2-pilot noise floor), while an
 * archetype missing from the CURRENT set simply has no row and drops out.
 */
export function fitnessTrend(
  matrix: PayoffMatrix,
  currentSharePct: number[],
  previousSharePct: (number | null)[],
  opts?: { stableBandPp?: number },
): FitnessTrend[];
```

**Verbindliche Werte `replicatorStep`** — Schere-Stein-Papier (Fixture A) mit
`sharePct = [50, 30, 20]`, vollständig von Hand nachrechenbar:

| Feld | Erwartung | Rechnung |
|---|---|---|
| `fitnessPct[0]` | `55` | `0,5·0,5 + 1·0,3 + 0·0,2 = 0,55` |
| `fitnessPct[1]` | `35` | `0·0,5 + 0,5·0,3 + 1·0,2 = 0,35` |
| `fitnessPct[2]` | `60` | `1·0,5 + 0·0,3 + 0,5·0,2 = 0,60` |
| `meanFitnessPct` | `50` **exakt** | `0,5·0,55 + 0,3·0,35 + 0,2·0,60 = 0,5` |
| `growthPct` | `[10, −30, 20]` | `f/0,5 − 1` |
| `projectedSharePct` | `[55, 21, 24]` | `(0,55 ; 0,21 ; 0,24)`, Summe 1 |

Weitere Eigenschaften:
- `meanFitnessPct === 50` für **jede** Share-Verteilung und jede konstantsummige Matrix
  (Property-Test mit zufälligen Shares) — genau das ist die Aussage aus §3.0e und der Grund,
  warum es keinen freien Parameter gibt.
- `Σ projectedSharePct === 100` (Toleranz `1e-9`).
- Wird `sharePct` gleich den Gleichgewichtsgewichten gesetzt, ist `growthPct` für alle
  Support-Mitglieder `0` und `projectedSharePct === sharePct` — **das Gleichgewicht ist ein
  Fixpunkt der Replicator-Dynamik.** Dieser Test verbindet §3.3 und §3.5 und gehört
  ausdrücklich als "Konsistenz-Test" in die Suite (Muster: der Spec-5-Verkettungstest
  `rankEffectiveSampleSize(1,1)` an Spec 3).
- Ein Archetyp mit `sharePct = 0` behält `projectedSharePct = 0` (Replicator erzeugt nie
  neue Strategien) — eine bekannte, dokumentationspflichtige Modell-Eigenschaft.

**Verbindliche Werte `fitnessTrend`** — Fixture A, `previous = [100/3, 100/3, 100/3]`,
`current = [50, 30, 20]`, `stableBandPp = 1`:

| Archetyp | `previousFitnessPct` | `fitnessPct` | `fitnessDeltaPp` | `direction` |
|---|---|---|---|---|
| A | `50` | `55` | `+5` | `rising` |
| B | `50` | `35` | `−15` | `falling` |
| C | `50` | `60` | `+10` | `rising` |

| Randfall | Erwartung |
|---|---|
| `previousSharePct` komplett `null` | `previousFitnessPct === null`, `fitnessDeltaPp === null`, `direction === 'unknown'` |
| Delta `+0,4 pp` bei `stableBandPp = 1` | `direction === 'stable'` |
| Delta genau `+1,0 pp` bei `stableBandPp = 1` | `direction === 'stable'` (Grenze inklusiv, explizit getestet) |
| Delta `+1,01 pp` | `direction === 'rising'` |

> **Diskrepanz 3 (bewusste Erweiterung gegenüber der Spec).** Die Spec nennt drei
> Richtungen ("steigend/fallend/stabil"). Dieser Plan führt eine vierte ein: `'unknown'`
> für "es gibt keine Vorwoche". Ohne sie müsste ein fehlender Vergleich als "stabil"
> erscheinen, was eine Aussage behauptet, die die Daten nicht hergeben — genau das
> Ehrlichkeitsprinzip, auf das sich die dritte User Story beruft. Falls Konrad die Spec
> wörtlich will, ist es eine Ein-Zeilen-Änderung; die Verträge bleiben identisch.

**Welche Wochen (bindend, §0.2):** aus `meta_snapshots` werden die **zwei jüngsten Perioden
ab `ROTATION_PERIOD` genommen, die NICHT die laufende ISO-Woche sind**
(`isoWeekLabel(new Date())` wird ausgeschlossen). Grund: `syncMeta.ts:229-305` schreibt die
laufende Woche kontinuierlich neu — sie ist immer ein Teilaggregat, und ein Vergleich mit ihr
misst den Wochentag, nicht das Meta. Findet sich weniger als eine Periode, ist
`previousSharePct` überall `null` und alle Richtungen sind `'unknown'` (regulärer
Cold-Start-Zustand, kein Fehler).

**Namens-Abgrenzung Fenster gegen Woche (bindend, sonst entstehen zwei `fitnessPct`).**
`replicatorStep` wird mit dem **Tages-Fenster**-Share-Vektor aufgerufen (derselbe, der auch
`sharePct` in der Antwort füllt), `fitnessTrend` dagegen mit den **zwei abgeschlossenen
ISO-Wochen**. Die reinen Funktionen bleiben generisch; der Job bildet sie beim Persistieren
auf klar getrennte Spalten ab:

| Reine Funktion | Feld | Spalte in `meta_equilibrium_archetypes` | Bezugsgröße |
|---|---|---|---|
| `replicatorStep` | `fitnessPct` | `fitness_pct` | Tages-Fenster (`windowDays`) |
| `replicatorStep` | `growthPct` | `replicator_growth_pct` | Tages-Fenster |
| `replicatorStep` | `projectedSharePct` | `projected_share_pct` | Tages-Fenster |
| `fitnessTrend` | `fitnessPct` | `week_fitness_pct` | jüngste abgeschlossene ISO-Woche |
| `fitnessTrend` | `previousFitnessPct` | `previous_week_fitness_pct` | Vorwoche |
| `fitnessTrend` | `fitnessDeltaPp` | `fitness_delta_pp` | Wochen-Differenz |
| `fitnessTrend` | `observedShareDeltaPp` | `observed_share_delta_pp` | Wochen-Differenz |
| `fitnessTrend` | `direction` | `direction` | Wochen-Differenz |

`fitness_pct` und `week_fitness_pct` **dürfen** auseinanderlaufen (28-Tage-Mittel gegen eine
Woche) und tragen deshalb in der UI unterschiedliche Labels. Ein Vermischen der beiden
Bezugsgrößen in einer Differenz ist der wahrscheinlichste Folgefehler dieser Scheibe und
gehört als Kommentar an beide Funktionen.

### 3.6 Datenmodell und Migration

**Zwei Tabellen, nicht eine** — begründet, nicht aus Gewohnheit: es gibt rund zwölf echte
**lauf-skalierte** Felder (Spielwert, Seed, Resample-Zahl, Imputationsanteil, Perioden,
Support-Größe, Reproduktionsrate …). Sie auf jede der ~25 Archetyp-Zeilen zu denormalisieren
(Muster `archetype_card_stats.listsAnalyzed`) wäre bei einem oder zwei Feldern in Ordnung,
bei zwölf ist es fehleranfällig. Der Fremdschlüssel mit `onDelete: 'cascade'` macht den
Full-Replace außerdem zu **einem** DELETE.

```ts
// apps/api/src/db/schema.ts — new tables

export const metaEquilibriumRuns = pgTable(
  'meta_equilibrium_runs',
  {
    id: serial('id').primaryKey(),
    /** Analysis window in days (7 | 14 | 21 | 28). Scope is always the default
     *  online-Bo1 scope, like archetype_card_stats. */
    windowDays: integer('window_days').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
    archetypeCount: integer('archetype_count').notNull(),
    /** MUST be 50 for a constant-sum matrix — persisted as a self check that
     *  survives into production data. */
    valuePct: real('value_pct').notNull(),
    supportSize: integer('support_size').notNull(),
    /** #{i : payoff_i == value}; larger than supportSize means other equilibria
     *  cannot be ruled out (plan section 3.0c — a hint, not a certificate). */
    equalizerCount: integer('equalizer_count').notNull(),
    /** Share of off-diagonal cells with no data at all, 1 decimal. */
    imputedCellSharePct: real('imputed_cell_share_pct').notNull(),
    resamples: integer('resamples').notNull(),
    seed: integer('seed').notNull(),
    failedResamples: integer('failed_resamples').notNull(),
    /** Percentage of resamples reproducing the exact support set. */
    exactSupportRatePct: real('exact_support_rate_pct').notNull(),
    /** The two completed ISO weeks the replicator trend used; null on a cold
     *  start with fewer than two completed weeks. */
    currentPeriod: text('current_period'),
    previousPeriod: text('previous_period'),
    /** Wall-clock milliseconds of the whole window computation, so the cron's
     *  cost stays visible without extra tooling. */
    durationMs: integer('duration_ms').notNull(),
  },
  (table) => [uniqueIndex('meta_equilibrium_runs_window_uq').on(table.windowDays)],
);

export const metaEquilibriumArchetypes = pgTable(
  'meta_equilibrium_archetypes',
  {
    id: serial('id').primaryKey(),
    runId: integer('run_id')
      .notNull()
      .references(() => metaEquilibriumRuns.id, { onDelete: 'cascade' }),
    archetypeId: text('archetype_id').notNull(),
    archetypeName: text('archetype_name').notNull(),
    /** Observed share in the day window, percent. */
    sharePct: real('share_pct').notNull(),
    /** Equilibrium weight, percent, 2 decimals. */
    weightPct: real('weight_pct').notNull(),
    /** Expected win rate against the equilibrium mixture, percent. */
    equilibriumPayoffPct: real('equilibrium_payoff_pct').notNull(),
    /** sharePct - weightPct: positive = played more than the equilibrium
     *  would justify. The headline "popularity paradox" number. */
    paradoxGapPp: real('paradox_gap_pp').notNull(),
    inSupport: boolean('in_support').notNull(),
    /** Payoff strictly below the value: in the support of NO equilibrium. */
    excludedCertain: boolean('excluded_certain').notNull(),
    /** Opponent-share-weighted share of this row backed by real data. */
    rowCoveragePct: real('row_coverage_pct').notNull(),
    exclusionRatePct: real('exclusion_rate_pct').notNull(),
    certainExclusionRatePct: real('certain_exclusion_rate_pct').notNull(),
    meanWeightPct: real('mean_weight_pct').notNull(),
    weightP05Pct: real('weight_p05_pct').notNull(),
    weightP95Pct: real('weight_p95_pct').notNull(),
    fitnessPct: real('fitness_pct').notNull(),
    replicatorGrowthPct: real('replicator_growth_pct').notNull(),
    projectedSharePct: real('projected_share_pct').notNull(),
    weekFitnessPct: real('week_fitness_pct'),
    previousWeekFitnessPct: real('previous_week_fitness_pct'),
    fitnessDeltaPp: real('fitness_delta_pp'),
    observedShareDeltaPp: real('observed_share_delta_pp'),
    direction: text('direction', { enum: FITNESS_DIRECTION_VALUES }).notNull(),
  },
  (table) => [
    uniqueIndex('meta_equilibrium_archetypes_uq').on(table.runId, table.archetypeId),
    index('meta_equilibrium_archetypes_run_idx').on(table.runId),
    check(
      'meta_equilibrium_direction_chk',
      sql`${table.direction} in ('rising','falling','stable','unknown')`,
    ),
  ],
);
```

`FITNESS_DIRECTION_VALUES` wird — wie `CARD_SIGNAL_TIER_VALUES` (`schema.ts:20,466`) — aus
`@pokekon/shared` importiert, damit DB-Enum und TS-Typ nicht auseinanderdriften können.

Erwartete Migration `apps/api/drizzle/0014_*.sql` (**generiert** mit
`npm run db:generate -w @pokekon/api`, das erzeugte SQL gegen diese Erwartung prüfen):
zwei `CREATE TABLE`, ein FK mit `ON DELETE CASCADE`, zwei Unique-Indizes, ein Lookup-Index,
ein CHECK. **Rein additiv:** keine `ALTER`-Anweisung an bestehenden Tabellen, kein Drop, kein
Backfill. Auf Railway gefahrlos vor dem Code-Deploy anwendbar.

**Größenordnung:** 4 Fenster x 1 Lauf-Zeile plus 4 x ~25 Archetyp-Zeilen ≈ **~104 Zeilen
konstant**. Full-Replace je `windowDays`, keine Historie.

**Warum keine Materialized View** (CLAUDE.md §6 verlangt für schwere Aggregationen
ausdrücklich Postgres-MVs — der Punkt braucht eine Begründung, keine Umgehung): der teure
Teil ist kein Aggregat, sondern **ein Optimierungsproblem plus 2000 Simplex-Läufe**. Das ist
in SQL weder ausdrückbar noch testbar, und die Spec verlangt die Rechnung ausdrücklich als
reine Funktion in `packages/shared` (erstes AC). Die Tabellen sind reiner Ergebnis-Cache mit
`computedAt`, jederzeit aus `tournament_matchups`/`meta_snapshots` rekonstruierbar. Das
gehört so in die PR-Beschreibung.

**Warum keine Historie:** kein AC verlangt sie, und der Full-Replace hält die Tabelle
konstant klein. Kosten: eine Zeitreihe "wie stabil war der Support über die Wochen" ist
daraus nicht ableitbar. Bewusst vertagt (§6, offene Frage 6) — nachrüstbar durch Aufnahme von
`computedAt` in den Unique-Index, ohne Umbau.

### 3.7 Job, Leseseite und API-Wire-Contract

```ts
// apps/api/src/jobs/computeEquilibrium.ts (neu)

export interface EquilibriumJobResult {
  computedAt: string;            // ISO
  windows: number[];             // the windows actually computed
  /** Per window: how the run went — reported, never averaged away. */
  perWindow: {
    windowDays: number;
    archetypeCount: number;
    valuePct: number;
    supportSize: number;
    equalizerCount: number;
    imputedCellSharePct: number;
    exactSupportRatePct: number;
    failedResamples: number;
    durationMs: number;
    /** null when fewer than two completed ISO weeks exist (cold start). */
    currentPeriod: string | null;
    previousPeriod: string | null;
  }[];
  /** Windows skipped because fewer than minArchetypes archetypes were present. */
  windowsSkipped: number;
  rowsWritten: number;
  dryRun: boolean;
}

export async function computeEquilibrium(
  db: Db,
  opts?: {
    windows?: number[];        // default [7, 14, 21, 28]
    online?: boolean;          // default true
    bo1?: boolean;             // default true
    minArchetypes?: number;    // default 3 — see below
    resamples?: number;        // default DEFAULT_RESAMPLES (2000)
    seed?: number;             // default DEFAULT_SEED
    dryRun?: boolean;
  },
): Promise<EquilibriumJobResult>;
```

**Verbindliches Verfahren:**
1. Je Fenster: `loadWindowAggregates(db, { days, online, bo1 })` und
   `loadMatchupData(db, { days, online, bo1 })` — beide werden dafür aus
   `routes/meta.ts` **exportiert** (Muster `windowConditions`, §0.5), **nicht** dupliziert
   und **nicht** verändert.
2. Archetypen-Menge: alle Aggregate außer `OTHER_ARCHETYPE_ID`. `computeMetaSnapshots`
   hat Ein-Piloten-Archetypen bereits verworfen (§0.2), es kommt **kein weiterer Filter**
   dazu.
3. `buildPayoffMatrix(archetypes, matchup.cells)`.
4. Fenster mit weniger als `minArchetypes` Archetypen: `windowsSkipped`, **keine Zeile
   geschrieben**, vorhandene alte Zeilen dieses Fensters werden gelöscht (sonst würde ein
   geschrumpftes Fenster veraltete Daten weiter ausliefern — dieselbe Falle, die
   `computeCardStats.ts:186-201` schon adressiert). `minArchetypes = 3` ist reine
   **Job-Ökonomie**: unter drei Strategien ist "das Gleichgewicht" trivial und die Aussage
   wertlos; es ist **kein** Modell-Cutoff.
5. `solveSymmetricZeroSumNash(...)`. Bei `status: 'failed'` wird das Fenster **übersprungen
   und geloggt**, nicht halb geschrieben.
6. `equilibriumRobustness(...)` mit `seed` und `resamples`.
7. `replicatorStep(matrix, windowShares)`.
8. Die zwei jüngsten **abgeschlossenen** ISO-Wochen aus `meta_snapshots` laden
   (`period >= ROTATION_PERIOD`, `period != isoWeekLabel(now)`, absteigend, die ersten zwei);
   daraus die Share-Vektoren über `archetypeId` bilden (Alt-Zeilen ohne `archetype_id`
   werden über `archetype` = Anzeigename gematcht, Muster `routes/meta.ts:524-530`) und
   `fitnessTrend(...)` rufen.
9. **Ein** `computedAt` für den gesamten Lauf. Schreiben in **einer Transaktion je Fenster**:
   `DELETE FROM meta_equilibrium_runs WHERE window_days = ...` (Cascade räumt die
   Archetyp-Zeilen ab), dann `INSERT` der Lauf-Zeile, dann chunked `INSERT` der
   Archetyp-Zeilen (Chunkgröße 200, Muster `computeCardStats.ts:243-245`). Leser sehen dank
   Postgres-MVCC nie einen halb geschriebenen Zustand.
10. `dryRun: true` führt 1–8 aus, schreibt nichts, liefert identische Zähler **inklusive
    `durationMs`** — der Dry-Run ist die Messung, auf die §4 Schritt 16 und §6 aufbauen.

CLI: `node dist/jobs/computeEquilibrium.js [--dry-run]`, npm-Script
`job:compute-equilibrium` (Muster `job:compute-card-stats`, `apps/api/package.json:19`).

```ts
// apps/api/src/lib/equilibriumData.ts (neu)

export interface EquilibriumBatch {
  computedAt: Date | null;
  windowDays: number;
  run: {
    archetypeCount: number;
    valuePct: number;
    supportSize: number;
    equalizerCount: number;
    imputedCellSharePct: number;
    resamples: number;
    seed: number;
    failedResamples: number;
    exactSupportRatePct: number;
    currentPeriod: string | null;
    previousPeriod: string | null;
  } | null;
  archetypes: EquilibriumArchetypeRow[];
}

/** Reads the precomputed run for one window. NO lazy seed (same reasoning as
 *  lib/cardStatsData.ts:13-17): computing an equilibrium plus 2000 resamples on
 *  a read would turn one request into a multi-second job. An empty table is an
 *  honestly empty result with computedAt === null, never an error. */
export async function loadEquilibrium(db: Db, windowDays: number): Promise<EquilibriumBatch>;
```

**Wire-Contract (neue Route, rein additiv — keine bestehende Route ändert sich):**

```
GET /api/meta/equilibrium?days=<1..180>

200 ->
{
  windowDays: number,          // SNAPPED to a precomputed window (7|14|21|28), echoed
  online: true,                // scope is fixed in this spec, see section 5
  bo1: true,
  computedAt: string | null,   // null = never computed (cold start)
  run: { ... } | null,         // null on cold start
  archetypes: EquilibriumArchetypeRow[]   // [] on cold start, weightPct desc then sharePct desc
}
400 -> { error, issues }       // invalid days
```

**Kein 404 und kein Archetyp-Parameter.** Die Ansicht ist meta-weit, nicht archetyp-weit
(Spec "Out of Scope": keine Anwendung auf persönliche Decks). Keine Auth (öffentliche
Referenzdaten wie alle `/api/meta/*`-Leser), kein Rate-Limit (reiner DB-Read ohne externen
Call — dieselbe Begründung wie bei `/field-analysis` und `/card-stats`).
**`security-agent` ist trotzdem Pflicht**, weil CLAUDE.md §3 ihn bei *jeder neuen Route*
verlangt.

```ts
// apps/api/src/validation.ts
export const EQUILIBRIUM_WINDOWS = [7, 14, 21, 28] as const;
export const equilibriumQuerySchema = z.object({
  days: z.coerce.number().int()
    .min(META_WINDOW_MIN_DAYS).max(META_WINDOW_MAX_DAYS)
    .default(META_WINDOW_DEFAULT_DAYS),
});
/** Nearest precomputed window; an exact tie goes to the LARGER window. */
export function snapEquilibriumWindow(days: number): number;
// 1 -> 7 | 7 -> 7 | 10 -> 7 | 11 -> 14 | 25 -> 28 | 30 -> 28 | 180 -> 28

/** Extracted from snapCardStatsWindow (validation.ts:190-201) so both windows
 *  share one implementation. Pure refactor: snapCardStatsWindow keeps its
 *  signature and its existing tests (api.test.ts:2580) stay green unchanged. */
export function snapToWindow(days: number, windows: readonly number[]): number;
```

### 3.8 Web-Contracts

```ts
// apps/web/src/lib/api.ts
export interface EquilibriumArchetypeRow {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  weightPct: number;
  equilibriumPayoffPct: number;
  paradoxGapPp: number;
  inSupport: boolean;
  excludedCertain: boolean;
  rowCoveragePct: number;
  exclusionRatePct: number;
  certainExclusionRatePct: number;
  meanWeightPct: number;
  weightP05Pct: number;
  weightP95Pct: number;
  fitnessPct: number;
  replicatorGrowthPct: number;
  projectedSharePct: number;
  weekFitnessPct: number | null;
  previousWeekFitnessPct: number | null;
  fitnessDeltaPp: number | null;
  observedShareDeltaPp: number | null;
  direction: FitnessDirection;
}

export interface MetaEquilibriumResponse {
  windowDays: number;
  online: boolean;
  bo1: boolean;
  computedAt: string | null;
  run: EquilibriumRun | null;
  archetypes: EquilibriumArchetypeRow[];
}

/** GET /api/meta/equilibrium — mirrors fetchArchetypeCardStats' optional-query
 *  pattern (api.ts:670-678): `days` is omitted entirely when not provided. */
export async function getMetaEquilibrium(days?: number): Promise<MetaEquilibriumResponse>;
```

```ts
// apps/web/src/components/meta/equilibriumFraming.ts (neu)
// Pure display logic, pattern: ./confidence.ts and ./winRateColor.ts.

export type ExclusionBand = 'veryRobust' | 'robust' | 'unclear' | 'likelyIn';

/** Plain-language band for an exclusion rate. The spec's third decision is
 *  BOTH: the caller renders the band's sentence AND the raw percentage — this
 *  function never replaces the number, it only labels it. */
export function exclusionBand(exclusionRatePct: number): ExclusionBand;
// >= 90 -> 'veryRobust'   |   >= 70 -> 'robust'
// >= 30 -> 'unclear'      |   <  30 -> 'likelyIn'

/** true when the exact composition must be shown with a fragility warning:
 *  the point estimate's support was reproduced in fewer than
 *  FRAGILE_SUPPORT_RATE_PCT of the resamples, or equalizerCount exceeds the
 *  support size (plan section 3.0c). */
export function isCompositionFragile(
  exactSupportRatePct: number,
  equalizerCount: number,
  supportSize: number,
): boolean;
export const FRAGILE_SUPPORT_RATE_PCT = 50;
```

Verbindliche Grenzwerte (Grenzen ausdrücklich mit-getestet):

| Eingabe | `exclusionBand` |
|---|---|
| `100` | `'veryRobust'` |
| `90` | `'veryRobust'` (Grenze inklusiv) |
| `89.9` | `'robust'` |
| `77.9` (der Papier-Wert für Dragapult) | `'robust'` |
| `70` | `'robust'` (Grenze inklusiv) |
| `69.9` | `'unclear'` |
| `30` | `'unclear'` (Grenze inklusiv) |
| `29.9` | `'likelyIn'` |
| `0` | `'likelyIn'` |

| `exactSupportRatePct` | `equalizerCount` | `supportSize` | `isCompositionFragile` |
|---|---|---|---|
| `2.1` (Papier-Wert) | `7` | `7` | `true` |
| `80` | `7` | `7` | `false` |
| `80` | `9` | `7` | `true` |
| `50` | `3` | `3` | `false` (Grenze inklusiv) |
| `49.9` | `3` | `3` | `true` |

**UI (`EquilibriumPanel.tsx`) — Datenvertrag, kein fertiges Design.** Verbindlich ist nur:
- **Der Abschnitt ist in `MetaPage.tsx` eine `CollapsibleSection` OHNE `defaultOpen`** und
  trägt im Titel ein sichtbares Label "experimentell". Das ist die überprüfbare Umsetzung von
  AC 5 ("ersetzt den Field-Score nicht"). Field-Score-, Matchup- und Prognose-Blöcke bleiben
  unverändert; ihr Diff ist leer.
- **Block 1 (prominent) = die robusten Aussagen.** Je Archetyp mit
  `exclusionBand !== 'likelyIn'` **beides nebeneinander**: der Klartext-Satz aus i18n
  **und** die Zahl, z. B. "Dragapult ist in den meisten Szenarien keine gute Wahl —
  in **77,9 %** der 2000 Durchläufe nicht Teil der optimalen Mischung (±0,9 pp)".
  Der Unsicherheitswert kommt aus `monteCarloSePct` und wird **nicht** neu erfunden.
  Archetypen mit `excludedCertain === true` bekommen zusätzlich den stärkeren Satz
  ("in **keiner** optimalen Mischung enthalten") — nur diese, denn nur für sie gilt der Satz
  aus §3.0c.
- **Block 2 (Detail) = die exakte Zusammensetzung.** Immer mit
  `isCompositionFragile(...)`-Prüfung: ist sie `true`, steht der Fragilitäts-Hinweis
  **über** der Tabelle, nicht als Fußnote. Gewichte werden mit ihrem
  `weightP05Pct`–`weightP95Pct`-Band über `formatWithInterval` aus
  `components/meta/confidence.ts` dargestellt — **keine zweite Formatierung**.
- **Popularitäts-Paradox** wird als eigene, sichtbar andere Darstellung geführt (Icon **und**
  Textlabel, nicht nur Farbe — a11y-Präzedenz aus dem Spec-3-Plan §3.6): Archetypen mit
  großem positivem `paradoxGapPp` und `weightPct === 0`.
- **Zeilenabdeckung.** Support-Mitglieder mit niedrigem `rowCoveragePct` bekommen eine
  ausdrückliche Kennzeichnung ("stützt sich überwiegend auf fehlende Matchup-Daten") —
  das ist die UI-Seite des Equalizer-Problems aus §3.2.
- **Block 3 = Trendrichtung.** `direction` als Pfeil plus Wort, daneben `fitnessDeltaPp`;
  `direction === 'unknown'` zeigt "keine Vorwoche", nicht "stabil".
  `observedShareDeltaPp` steht daneben und ist ausdrücklich als *Beobachtung* (nicht als
  Modellaussage) beschriftet.
- **Provenienz.** `computedAt`, `windowDays`, `resamples`, `seed` und
  `imputedCellSharePct` sind sichtbar. Ohne den Imputationsanteil ist die Robustheitszahl
  nicht interpretierbar.
- **Cold Start.** `computedAt === null` zeigt einen ruhigen Hinweis ("noch nicht berechnet"),
  keinen Fehler.

### 3.9 Neue i18n-Keys (`meta.json`, de + en)

```
equilibrium.title                  "Spieltheoretische Einordnung (experimentell)"
equilibrium.intro                  Was die Ansicht beantwortet — und was nicht
equilibrium.experimentalBadge      "experimentell"
equilibrium.notAReplacement        "Ergaenzt den Feld-Score, ersetzt ihn nicht."
equilibrium.robust.veryRobust      "{{name}} ist in fast allen Szenarien keine gute Wahl"
equilibrium.robust.robust          "{{name}} ist in den meisten Szenarien keine gute Wahl"
equilibrium.robust.unclear         "Bei {{name}} ist die Datenlage nicht eindeutig"
equilibrium.robust.likelyIn        "{{name}} gehoert in den meisten Szenarien dazu"
equilibrium.robust.value           "in {{rate}} % von {{runs}} Durchlaeufen ({{se}} pp)"
equilibrium.robust.certain         "in KEINER optimalen Mischung enthalten (beweisbar)"
equilibrium.composition.title      "Exakte Zusammensetzung"
equilibrium.composition.fragile    Fragilitaets-Hinweis, siehe 3.8
equilibrium.composition.weight     "{{weight}} % ({{low}}-{{high}} %)"
equilibrium.paradox.label          "Popularitaets-Paradox"
equilibrium.paradox.text           "{{share}} % Meta-Anteil, aber {{weight}} % im Gleichgewicht"
equilibrium.coverage.thin          "stuetzt sich ueberwiegend auf fehlende Matchup-Daten"
equilibrium.trend.rising           "Fitness steigt"
equilibrium.trend.falling          "Fitness faellt"
equilibrium.trend.stable           "Fitness stabil"
equilibrium.trend.unknown          "keine Vorwoche zum Vergleich"
equilibrium.trend.observed         "beobachtete Anteilsaenderung: {{delta}} pp"
equilibrium.source                 "Stand {{computedAt}}, Fenster {{days}} Tage, {{runs}} Durchlaeufe, Seed {{seed}}"
equilibrium.source.imputed         "{{pct}} % der Matchup-Zellen ohne Daten"
equilibrium.empty                  "Noch nicht berechnet."
equilibrium.methodNote             Konstantsummen-Symmetrisierung + Korrelations-/Modellgrenzen
```

---

## 4. Umsetzungsreihenfolge (test-first)

Jede Verhaltens-Scheibe: **erst** der rote Test (`tester`), **dann** die Implementierung
(`implementer`). Nach jedem Schritt Root-Gates (`npm run typecheck`, `npm run lint`,
`npm run test`) und ein eigener Commit. Abhängigkeiten: A1 ist Voraussetzung für A2, A2 für
A3; B hängt an A1; C hängt an A2 und A3; D hängt nur an C. A3 und B können **echt parallel**
laufen (verschiedene Dateien, kein gemeinsamer Vertrag).

**Schritt 0 — Quellenprüfung (kein Code, kein Test, blockiert nur Fixture F)**

0. Die Tabellen III und V aus `https://arxiv.org/html/2607.08692v1` **manuell sichtprüfen**
   und die 36 Zahlen der 6x6-Matrix gegen §3.3 Fixture (F) abgleichen. Bei Abweichung gilt
   das Papier, und die symmetrisierte Matrix **sowie** das erwartete Gleichgewicht in (F)
   werden neu gerechnet (Support-Enumeration genügt bei n = 6). Ergebnis der Prüfung im
   PR festhalten. Fällt die Prüfung aus, wird Fixture (F) **weggelassen** statt geraten —
   die Fixtures (A)–(E) tragen die Golden-Test-Anforderung des zweiten AC bereits allein.

**Slice A1 — der LP-Löser**

1. **Rot:** `packages/shared/src/simplex.test.ts` gegen §3.1 — alle sieben Zeilen der
   Tabelle inklusive Wyndor-LP, Unbeschränktheit, Nullziel, Entartung, beide Wurf-Fälle.
2. **Grün:** `packages/shared/src/simplex.ts` (Phase-II-Simplex, Bland-Regel) plus
   Re-Export in `index.ts`. Die Begründung "b nichtnegativ, daher keine Phase I" und
   "Bland wegen Determinismus, nicht wegen Geschwindigkeit" als Kommentar an die Funktion.
   Es sind `test(shared)` und `feat(shared)` als getrennte Commits:
   -> `test(shared): pin a phase-II simplex against textbook linear programs`
   -> `feat(shared): add a dependency-free standard-form LP solver`

**Slice A2 — Payoff-Matrix und Gleichgewicht**

3. **Rot:** `packages/shared/src/nashEquilibrium.test.ts` gegen §3.2 — `zeroSumWinRate`
   (komplette Tabelle inklusive der drei Referenzpapier-Bilanzen), der Property-Test
   `zeroSumWinRate = (1 + tournamentWinRate(w,l,t) − tournamentWinRate(l,w,t))/2`,
   `buildPayoffMatrix` (alle fünf Präzedenz-Zeilen, Antisymmetrie, Diagonale, `imputed`,
   `rowCoveragePct`, unbekannte Decks, leere Liste).
4. **Grün:** `zeroSumWinRate` plus `buildPayoffMatrix` in
   `packages/shared/src/nashEquilibrium.ts`. Die Herleitung aus §3.0a als Datei-Kopf-Kommentar
   — ohne sie ist nicht nachvollziehbar, warum hier eine **zweite** Win-Rate-Funktion existiert.
   -> `feat(shared): build a constant-sum payoff matrix from matchup cells`
5. **Rot:** Tests für `solveSymmetricZeroSumNash` (§3.3, Fixtures A–E vollständig, plus alle
   Property-Tests; Fixture F nur, wenn Schritt 0 sie bestätigt hat). Fixture C und E bekommen
   den Begründungskommentar aus §3.3 in den Testnamen.
6. **Grün:** `solveSymmetricZeroSumNash` — **ruft `solveStandardFormLp` auf**, implementiert
   kein zweites LP. Der Satz aus §3.0c als Kommentar an `excludedCertain`, inklusive der
   ausdrücklichen Warnung, dass die Umkehrung nicht gilt.
   -> `feat(shared): solve the symmetric zero-sum meta game via linear programming`

**Slice A3 — Zufall, Robustheit, Replicator**

7. **Rot:** `packages/shared/src/deterministicRandom.test.ts` gegen §3.4 — die gepinnten
   `mulberry32`-Werte, Determinismus, Beta-/Gamma-Momente, der Boost-Zweig `shape < 1`.
8. **Grün:** `packages/shared/src/deterministicRandom.ts` plus Re-Export.
   -> `feat(shared): add a seeded PRNG and beta sampler for reproducible resampling`
9. **Rot:** Tests für `resamplePayoffMatrix`, `equilibriumRobustness` und `monteCarloSePct`
   (§3.4-Tabelle vollständig). **Der wichtigste Test:** jedes Resample bleibt konstantsummig
   und liefert `valuePct === 50`.
10. **Grün:** die drei Funktionen. Die Verteilungswahl **und** ihre dokumentierte
    Einschränkung (Jeffreys weicht am Rand von Wilson ab) als Kommentar an
    `resamplePayoffMatrix`.
    -> `feat(shared): add a monte-carlo robustness check for the equilibrium support`
11. **Rot:** Tests für `replicatorStep` und `fitnessTrend` (§3.5, beide Tabellen, alle
    Randfälle, der Fixpunkt-Konsistenztest gegen Slice A2).
12. **Grün:** beide Funktionen plus `FITNESS_DIRECTION_VALUES`.
    -> `feat(shared): add replicator fitness and a week-over-week trend direction`

**Slice B — Validierung (klein, unabhängig)**

13. **Rot:** `apps/api/src/api.test.ts`, `describe('snapEquilibriumWindow')` — dieselbe
    Wertetabelle wie §3.7; zusätzlich ein Test, dass `snapCardStatsWindow` **unverändert**
    dieselben Werte liefert wie bisher (Refactor-Absicherung).
14. **Grün:** `snapToWindow` extrahieren, `snapCardStatsWindow` darauf zurückführen,
    `EQUILIBRIUM_WINDOWS`/`equilibriumQuerySchema`/`snapEquilibriumWindow` ergänzen.
    -> `refactor(api): share one window-snapping helper between card stats and equilibrium`

**Slice C — Persistenz, Job und Route**

15. **Rot:** `apps/api/src/api.test.ts`, `describe('computeEquilibrium job')`: Turniere und
    Pairings seeden, sodass eine bekannte kleine Matrix entsteht; der Lauf schreibt eine
    Lauf-Zeile mit `valuePct === 50` und Archetyp-Zeilen mit den Werten, die **die bereits
    gepinnte reine Engine aus Slice A2/A3** für dieselbe Eingabe liefert (Muster
    `api.test.ts:2263-2280` — die Statistik wird nicht zweimal behauptet). Weiter:
    `'other'` taucht nicht auf; ein Fenster unter `minArchetypes` landet in `windowsSkipped`
    und **löscht** alte Zeilen; `dryRun: true` liefert identische Zähler und schreibt nichts;
    ein zweiter Lauf **ersetzt** statt zu duplizieren (Unique-Index plus Cascade halten);
    Cold Start ohne zwei abgeschlossene ISO-Wochen ergibt `direction === 'unknown'` und
    `currentPeriod === null`.
16. **Grün:** `schema.ts` (zwei Tabellen) plus `npm run db:generate -w @pokekon/api`
    (Migration `0014`) plus `apps/api/src/jobs/computeEquilibrium.ts` plus CLI-Entry plus
    npm-Script; `loadMatchupData`/`loadWindowAggregates` in `routes/meta.ts` exportieren.
    -> `feat(api): precompute the meta nash equilibrium and replicator trend weekly`
17. **Rot:** `apps/api/src/api.test.ts`, `describe('GET /api/meta/equilibrium')`: nach einem
    Job-Lauf liefert die Route `run` und `archetypes` (nach `weightPct` desc sortiert);
    leere Tabelle ergibt **200** mit `run: null`/`archetypes: []`/`computedAt: null`;
    `days=30` ergibt `windowDays === 28`; `days=10` ergibt `windowDays === 7`;
    `days=999` ergibt 400.
18. **Grün:** `apps/api/src/lib/equilibriumData.ts` plus die Route in `routes/meta.ts`.
    -> `feat(api): expose the precomputed meta equilibrium`

**Slice D — Web**

19. **Rot:** `apps/web/src/components/meta/equilibriumFraming.test.ts` gegen §3.8 — beide
    Wertetabellen inklusive aller Grenzfälle.
20. **Grün:** `apps/web/src/components/meta/equilibriumFraming.ts`.
    -> `feat(web): add plain-language framing helpers for equilibrium robustness`
21. **Panel und Seite:** `apps/web/src/lib/api.ts` (`getMetaEquilibrium`),
    `EquilibriumPanel.tsx` (drei Blöcke aus §3.8, Klartext **und** Zahl, Fragilitäts-Hinweis,
    Paradox-Kennzeichnung mit Icon **und** Label, Provenienz), `MetaPage.tsx` (ein
    `CollapsibleSection` **ohne** `defaultOpen`), i18n de und en.
    -> `feat(web): show the game-theoretic meta layer as an experimental section`

**Abschluss**

22. Doku-Schritt (alle Dateien aus §2, Block "Doku") — inklusive der Tabelle "drei Zahlen,
    die sich zum Verwechseln ähnlich sehen" (§3.0f), der Konstantsummen-Herleitung und der
    Ergänzung der zwei Tabellen in `docs/backend-evolution-plan.md` §5.2.
    -> `docs: describe the game-theoretic meta layer and its constant-sum assumption`
23. **Ein Dry-Run gegen echte Produktionsdaten** (§5): Archetypen-Zahl je Fenster,
    `imputedCellSharePct`, `equalizerCount`, `exactSupportRatePct`, `failedResamples` und
    **`durationMs`** im PR dokumentieren; danach `resamples`, `REPLICATOR_STABLE_BAND_PP`
    und die `exclusionBand`-Grenzen bestätigen oder anpassen.
24. Volle Gates plus `security-agent` (**neue Route**, CLAUDE.md §3) plus
    `code-review-agent` (Review auch gegen die Spec-Akzeptanzkriterien), dann PR.

---

## 5. Rollout, Migration und Rückwärtskompatibilität

**Reihenfolge auf Railway (verbindlich):**
1. PR mergen, `preDeployCommand` führt `migrate:deploy` aus, Migration `0014` legt die zwei
   Tabellen an. Rein additiv, für den **alten** laufenden Code unsichtbar — auch dann sicher,
   wenn sie Sekunden vor dem Code-Swap läuft.
2. Neuer Code startet. Die Tabellen sind **leer**: die Route antwortet mit
   `computedAt: null`, `run: null`, `archetypes: []`, das Panel zeigt "noch nicht berechnet".
   **Das ist der reguläre Cold-Start-Zustand, kein Fehler.**
3. **Dry-Run zuerst:** `node dist/jobs/computeEquilibrium.js --dry-run` in der Railway-Shell.
   Zähler **und `durationMs` je Fenster** prüfen und im PR/Issue festhalten. Erst danach der
   echte Lauf.
4. Danach als **eigener wöchentlicher Cron** einrichten, zeitlich **nach** dem
   `syncMeta`-Cron (der Job liest, was der Sync geschrieben hat) und idealerweise **montags**,
   wenn die Vorwoche gerade abgeschlossen ist (§3.5). Bewusst **nicht** an
   `POST /api/meta/sync` gehängt: die Route ist rate-limitiert und nutzer-ausgelöst; ein
   mehrsekündiger Zusatzjob mit 4 x 2000 Simplex-Läufen dort würde ihre Latenz sichtbar
   verändern. Folge: frisch gesyncte Turniere schlagen erst mit dem nächsten Lauf durch —
   deshalb ist `computedAt` Teil der Response und in der UI sichtbar (§3.8).

**Umfang der Vorberechnung (bewusste Einschränkung):** gerechnet wird nur für den
**Default-Scope** `online=true, bo1=true` und die vier Fenster 7/14/21/28 (CLAUDE.md §5:
das 1/2/3/4-Wochen-Fenster ist ein durchgängiger Analyse-Parameter, neue Aggregate sollen
ihn unterstützen). Alle 16 Scope-Kombinationen wären 16-fache Rechenzeit für einen
Nutzungsfall, den es nicht gibt (`docs/features.md` §2: der Meta-Fokus ist explizit
online-Bo1). Die Route nimmt deshalb **keine** `online`/`bo1`-Parameter entgegen und gibt
den festen Scope zurück — identisch zu `/card-stats` (Spec 5, §5).

**Rückwärtskompatibilität**
- **Wire additiv.** Ein alter Web-Client kennt die Route nicht und ruft sie nie auf. Ein
  alter Server liefert 404 — deshalb fängt der Panel-Loader jeden Fehler ab und zeigt den
  Leerzustand; **kein bestehender Meta-Block darf davon betroffen sein.** Das deckt das
  Deploy-Fenster ab, in dem `apps/api` (das das Web-Bundle selbst ausliefert) getauscht wird.
- **Keine Signaturänderung an bestehenden Exporten.** `loadMatchupData` und
  `loadWindowAggregates` werden nur von `private` auf `export` gehoben; ihr Verhalten bleibt
  identisch. `snapCardStatsWindow` behält Signatur und Verhalten (Slice B sichert das ab).
- **Kein Datenverlust möglich.** Der Job liest `tournaments`, `tournament_standings`,
  `tournament_matchups`, `matchup_matrix`, `meta_snapshots` und schreibt ausschließlich in
  die zwei neuen Tabellen.
- **Rollback:** Code-Revert genügt. Die Tabellen bleiben ungenutzt liegen; eine
  Down-Migration ist nicht nötig (und wäre ein `DROP TABLE` auf reine Cache-Daten, jederzeit
  neu berechenbar).

---

## 6. Risiken und offene Fragen

**Risiken**

1. **Matrix-Sparsity dominiert das Ergebnis — das größte inhaltliche Risiko.** Ein Archetyp
   ohne Matchup-Daten bekommt eine Zeile aus lauter 50 % und ist damit ein *Equalizer*: er
   erzielt gegen **jede** Mischung exakt den Spielwert und kann deshalb in den Support
   rutschen, ohne dass ein einziger Datenpunkt dafür spricht (§3.2). Wie groß
   `imputedCellSharePct` in Pokekons realen Fenstern ist, ist **Unbekannt** — die eigene
   Matrix hat nur Paare, die im Fenster tatsächlich aufeinandergetroffen sind, plus den
   TrainerHill-Fallback. Gegenmaßnahmen, alle drei umgesetzt: imputierte Zellen werden im
   Monte-Carlo gleichverteilt gezogen (ein Equalizer wird dann eben *nicht* robust
   ausgeschlossen und *nicht* robust eingeschlossen — die ehrliche Antwort);
   `rowCoveragePct` steht je Archetyp in der Antwort; die UI kennzeichnet dünn gestützte
   Support-Mitglieder. **Messbar machen:** der Dry-Run (§4 Schritt 23) muss
   `imputedCellSharePct` je Fenster ausgeben. Liegt er über etwa 50 %, ist das ein **echtes
   Ergebnis** ("die Datenlage trägt diese Analyse noch nicht") und muss so berichtet werden —
   nicht durch einen nachträglichen Mindest-Abdeckungs-Filter wegdefiniert.
2. **Die exakte Zusammensetzung ist fragil und sieht trotzdem präzise aus.** Das
   Referenzpapier reproduziert seinen eigenen Support in nur **2,1 %** der Resamples. Fixture
   (E) zeigt den Extremfall: eine Matrix ohne jede Präferenz liefert "spiel zu 100 % Deck A".
   Gegenmaßnahme: `isCompositionFragile` ist **Pflichtprüfung** vor der Anzeige, der Hinweis
   steht **über** der Tabelle, und die robusten Aussagen stehen prominent davor (AC 5 und die
   dritte User Story).
3. **Korrelation, Kausalität und die Grenzen des Modells.** Das Gleichgewicht sagt "diese
   Mischung wäre gegen sich selbst optimal", nicht "spiel das". Es unterstellt rationale,
   informierte Gegner, ignoriert Spielstärke, Listenvarianten, Verfügbarkeit, persönliche
   Vertrautheit und Turnierstruktur (Top-Cut ist Bo3, nicht Bo1). Es ist außerdem eine
   Momentaufnahme: der Replicator-Teil zeigt gerade, dass sich das Feld bewegt. Das gehört
   als **Pflichttext** in `equilibrium.methodNote` und in `docs/features.md` §18 — dieselbe
   Haltung wie Spec 5s `comparison.delta.correlationNote`.
4. **Zwei Remis-Konventionen im selben Repo.** `tournamentWinRate` (Drittel) und
   `zeroSumWinRate` (Halb) stehen ab jetzt nebeneinander. Wer die falsche greift, bekommt
   plausible, aber falsche Zahlen. Gegenmaßnahmen: getrennte Dateien, unmissverständliche
   Namen, ein Warnkommentar an beiden Funktionen, der Property-Test aus §3.2 als lebende
   Verbindung und ein Absatz in `docs/data-types.md`.
5. **Mehrfachvergleiche und Monte-Carlo-Rauschen.** Die Robustheitszahlen sind selbst
   Schätzungen: bei 2000 Läufen und einer Rate um 78 % beträgt der Standardfehler 0,93 pp
   (§3.4). Eine Anzeige mit zwei Nachkommastellen wäre Pseudo-Präzision. Gegenmaßnahme:
   `monteCarloSePct` wird **mit angezeigt**, und die Zahl wird auf eine Nachkommastelle
   gerundet.
6. **Drei ähnlich aussehende Win-Rate-Zahlen** (§3.0f). Ohne saubere Labels wird
   `equilibriumPayoffPct` als "Field-WR" gelesen. Gegenmaßnahme: die Tabelle aus §3.0f steht
   wörtlich in `docs/features.md` §18, jede der drei Zahlen bekommt in der UI einen eigenen
   Tooltip, und der Gleichgewichts-Block nennt den Field-Score ausdrücklich als die *andere*
   Frage.
7. **Laufzeit.** Grobe Abschätzung: je Resample rund `n(n−1)/2` Beta-Ziehungen (bei n = 25
   also ~300, jede mit ein bis zwei Gamma-Ziehungen) plus ein Simplex mit 25 Zeilen und
   50 Spalten. Das sind pro Fenster Sekunden, nicht Minuten — **geschätzt, nicht gemessen**.
   Der Dry-Run muss `durationMs` belegen. Liegt ein Fenster über etwa 60 s, wird zuerst
   `resamples` reduziert (reiner Parameter, kein Strukturwechsel), nicht der Algorithmus
   getauscht.
8. **Numerik.** Der Simplex arbeitet in `double`. Bei stark entarteten Matchup-Matrizen
   (viele exakte 50 %-Zellen) sind Pivot-Ketten mit Rundungsdrift möglich. Bland-Regel
   verhindert Zyklen, aber nicht Drift. Gegenmaßnahmen: die `valuePct === 50`-Selbstprüfung
   wird **persistiert** (also produktiv überwachbar), `failedResamples` wird berichtet statt
   verschluckt, und `maxIterations` bricht statt zu hängen. Eine exakte Bruchrechnung wäre
   möglich, aber für 2000 Resamples zu langsam — bewusst verworfen.
9. **Bewusst nicht umgesetzt** (damit es niemand für Vergessen hält): keine Bo3-Umrechnung
   (`bestOf.ts`, Spec §Methodischer Rahmen Punkt 5 nennt sie ausdrücklich als für die
   Online-Bo1-Baseline nicht nötig); keine Anwendung auf persönliche Decks oder Karten
   (Spec §Out of Scope); keine Änderung an `fieldWinRate.ts`, `matchupConflict.ts` oder
   `MIN_MATCHUP_GAMES`; keine Historie der Gleichgewichte; kein Gleichgewicht je Scope-
   Kombination; keine Nutzung von `tournament_standings.matchResults`.

**Entscheidungen (in diesem Plan getroffen — verbindlich, aber umkehrbar; bitte
widersprechen, wenn eine davon nicht passt)**

1. **Konstantsummen-Symmetrisierung `p_sym = (1 + p_ij − p_ji)/2` vor jeder
   spieltheoretischen Rechnung.** Ohne sie ist die Matrix wegen der Drittel-Remis-Konvention
   kein Nullsummenspiel und das Minimax-Theorem nicht anwendbar (§0.3 Diskrepanz 2). Die
   Formel ist beweisbar die Halbe-Remis-Konvention und identisch mit der des
   Referenzpapiers. Konsequenz: `equilibriumPayoffPct` ist **nicht** direkt mit
   `fieldWinRatePct` vergleichbar.
2. **LP statt Enumeration, Phase-II-Simplex mit Bland-Regel, selbst geschrieben.** Kein
   neues Paket (CLAUDE.md §2.2; `@pokekon/shared` hat null Runtime-Dependencies, §0.5). Der
   Sonderfall "rechte Seite nichtnegativ" macht Phase I überflüssig und den Löser klein
   genug, um ihn zu reviewen. Bland wegen **Determinismus**, nicht wegen Geschwindigkeit.
3. **Nur ein LP.** Wegen der Symmetrie ist die Zeilen- gleich der Spaltenlösung; das duale
   LP wird nicht gelöst. Das Referenzpapier berichtet in Tabelle VI noch beide Seiten, weil
   es das **rohe**, nicht konstantsummige Spiel löst — nach Entscheidung 1 entfällt dieser
   Unterschied.
4. **Das Ausschluss-Zertifikat ist die tragende Aussage, nicht die Gewichtsverteilung.**
   Nur `excludedCertain` ist ein Satz; alles andere ist Schätzung. Die UI-Hierarchie folgt
   dieser Beweislage (§3.8), nicht der visuellen Attraktivität.
5. **Resampling aus der Jeffreys-Beta-Posterior, je ungeordnetem Paar genau einmal.**
   Begründung und der verworfene Split-Normal-Ansatz mit seinem Randdefekt stehen in §3.0d;
   die Symmetrieerhaltung ist nicht optional, sondern Voraussetzung dafür, dass jedes
   Resample dasselbe Spiel löst.
6. **Zellen ohne Daten werden gleichverteilt gezogen, nicht auf 50 % eingefroren.**
   "Unbekannt" heißt unbekannt. Die Alternative (`'neutral'`) steht als offene Frage 3.
7. **Zwei Tabellen statt einer**, weil zwölf lauf-skalierte Felder denormalisiert
   fehleranfällig wären; Full-Replace über Cascade (§3.6).
8. **Wöchentlicher Cron nach dem Meta-Sync, kein On-Demand-Endpunkt und kein
   In-Memory-Cache** — so entschieden in der Spec; §5 ergänzt nur den Montags-Termin, damit
   die Vorwoche für den Replicator-Teil abgeschlossen ist.
9. **Die laufende ISO-Woche wird vom Woche-über-Woche-Vergleich ausgeschlossen** (§0.2,
   §3.5). Ohne diese Regel misst der Trend den Wochentag des Cron-Laufs.
10. **Vierte Richtung `'unknown'`** statt "stabil" bei fehlender Vorwoche (Diskrepanz 3).
11. **`minArchetypes = 3` im Job ist Ökonomie, nicht Modell.** Auf Modell-Ebene gibt es
    weiterhin keinen Cutoff; insbesondere **keine** Top-N-Deckelung (Spec-Entscheidung 1)
    und **keine** Mindest-Spielzahl je Zelle (Spec-3-Linie).
12. **Der Abschnitt ist standardmäßig eingeklappt und trägt ein "experimentell"-Label.**
    Das ist die überprüfbare, diff-bare Umsetzung von AC 5.

**Offene Fragen (echte — 1 blockiert nur Fixture F, der Rest blockiert Slice A nicht)**

1. **Soll versucht werden, das Artefakt des Referenzpapiers zu beschaffen?** Die vollständige
   14x14-Matrix liegt als anonymisiertes Supplementary Material bzw. über IEEE DataPort
   (Referenz `[44]`) vor, ohne URL im Fließtext (§0.4). Mit ihr wäre ein **echter**
   Regressionsanker gegen die publizierten Gewichte möglich (Grimmsnarl 34,3 %, Dragapult
   0 %, Ausschluss in 77,9 %). **Empfehlung: einmal 30 Minuten versuchen** (DataPort-Suche
   nach dem Titel), sonst wie geplant mit den Fixtures A–F arbeiten und im PR ausdrücklich
   festhalten, dass die Papier-Gewichte **nicht** reproduziert wurden. Blockiert nichts außer
   dem Umfang von Fixture F.
2. **Resampling-Verteilung: Jeffreys-Beta (Plan-Entscheidung 5) oder die wörtliche
   Spec-Lesart "aus dem Wilson-Band"?** Die Vergleichstabelle in §3.0d zeigt: in der Mitte
   praktisch identisch, am Rand deutlich verschieden, und die wörtliche Variante hat einen
   Atom-Defekt bei `1W/0L`. **Empfehlung: Jeffreys.** Wenn du die wörtliche Treue zur Spec
   vorziehst, ist es eine ~20-Zeilen-Änderung ausschließlich in `resamplePayoffMatrix`; die
   Verträge in §3.3–§3.8 bleiben identisch.
3. **Imputierte Zellen: `'resample'` (Plan-Default) oder `'neutral'`?** Bei hohem
   Imputationsanteil dominiert das Resampling der Fantasie-Zellen die Robustheitszahlen;
   bei `'neutral'` sähen sie stabiler aus, als die Daten hergeben. **Empfehlung:
   `'resample'` als Default und im Dry-Run **beide** Policies einmal gegenrechnen und die
   Differenz im PR dokumentieren** — das ist eine halbe Stunde Arbeit und beantwortet die
   Frage empirisch statt per Meinung.
4. **`resamples`: 2000 (Plan-Default) oder 10 000 wie im Papier?** 10 000 halbiert den
   Monte-Carlo-Standardfehler (0,41 pp statt 0,93 pp) und verfünffacht die Laufzeit. Bei
   einem wöchentlichen Cron ist Laufzeit fast egal. **Empfehlung: nach dem Dry-Run
   entscheiden** — liegt ein Fenster unter 10 s, direkt auf 10 000 gehen und damit auch die
   Vergleichbarkeit zum Papier verbessern.
5. **Vier Fenster (7/14/21/28) oder nur 28?** Ein 7-Tage-Fenster liefert die dünnste Matrix
   und damit den höchsten Imputationsanteil — möglicherweise eine Ansicht, die nur Rauschen
   zeigt. **Empfehlung: alle vier rechnen** (CLAUDE.md §5 verlangt die Fenster-Unterstützung,
   die Kosten sind gering) **und nach dem Dry-Run entscheiden, ob die UI die kurzen Fenster
   überhaupt anbietet.**
6. **Historie der Gleichgewichte?** Entscheidung 7 verwirft sie. Für die Frage "wie stabil
   war der Support über die letzten Wochen" wäre sie die natürliche Grundlage — und sie
   passt zur Replicator-Erzählung besser als alles andere in dieser Spec. **Empfehlung:
   nicht jetzt** (YAGNI, Rohdaten bleiben); nachrüstbar durch `computed_at` im Unique-Index.
   Widersprich, wenn die Zeitreihe schon Teil deiner Spec-7-UI-Planung ist.
7. **Grenzwerte `exclusionBand` (90/70/30) und `REPLICATOR_STABLE_BAND_PP = 1` sind gesetzt,
   aber nicht datenbelegt** — dieselbe Situation wie bei Spec 3s Tier-Grenzen und Spec 5s
   `MAX_USABLE_BAND_PP`. Nach dem Dry-Run einmal die reale Verteilung ausgeben und ggf. auf
   Quartile setzen. Blockiert die Umsetzung nicht.
8. **Soll `POST /api/meta/sync` den Job am Ende anstoßen?** Der Plan sagt nein (§5, Risiko
   Latenz). Alternative: ein separater, auth-geschützter Trigger-Endpunkt für manuelles
   Nachrechnen. **Empfehlung: nein** — der Cron plus sichtbares `computedAt` reicht, und
   jeder zusätzliche Schreib-Endpunkt kostet eine Security-Review.

---

## 7. Definition of Done

Die Spec-AC sind wörtlich abgebildet; jedes AC nennt den Schritt aus §4, der es erfüllt.

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` (Repo-Root) grün — ehrlich
      berichtet, nichts übersprungen, nichts geskippt.
- [ ] **AC 1** ("neue reine Berechnungsfunktion(en) in `packages/shared`, kein I/O, aus
      Archetypen plus vollständiger Matchup-Matrix ein symmetrisches Nash-Gleichgewicht mit
      Support-Menge und Gewichten"): `simplex.ts`, `nashEquilibrium.ts`,
      `deterministicRandom.ts` existieren, sind I/O-frei, und
      `solveSymmetricZeroSumNash` liefert `support` plus `weightsPct` — belegt durch die
      Tests aus §4 Schritt 1/3/5.
- [ ] **AC 2** ("Golden Test mit den öffentlich nachvollziehbaren Zahlen des Referenzpapiers,
      soweit rekonstruierbar — sonst selbst konstruiertes, dokumentiertes Beispiel"):
      **beides** ist erfüllt und der Unterschied ist im PR benannt. Rekonstruiert: die drei
      Bilanzen aus §0.4 (`43,6 %`, `52,1 %`, `49,4 %`) und die 6x6-Fixture (F). Selbst
      konstruiert und exakt verifiziert: Fixtures (A)–(E). **Ausdrücklich NICHT reproduziert
      und im PR so gesagt:** die publizierten 14-Deck-Gewichte — die vollständige Matrix ist
      nicht veröffentlicht (§0.4, offene Frage 1).
- [ ] **AC 3** ("Monte-Carlo-Robustheitscheck über die Wilson-Intervalle, liefert je Archetyp
      einen Ausschluss-Robustheitswert, nicht nur binäre Zugehörigkeit"):
      `equilibriumRobustness` liefert `exclusionRatePct`, `certainExclusionRatePct`,
      `meanWeightPct` und ein `P05/P95`-Gewichtsband je Archetyp. Die gewählte
      Resampling-Verteilung **und ihre Abweichung von Wilson** sind an der Funktion **und**
      in `docs/data-types.md` dokumentiert (§3.0d).
- [ ] **AC 4** ("Replicator-Fitness als separate Funktion, Wochen-über-Wochen aus
      `meta_snapshots`, Richtung je Archetyp"): `replicatorStep` und `fitnessTrend` sind
      eigene Funktionen, unabhängig vom Gleichgewicht aufrufbar; die Wochen kommen aus
      `meta_snapshots` unter **Ausschluss der laufenden ISO-Woche** (§0.2), und
      `meanFitnessPct === 50` ist als Property-Test gepinnt.
- [ ] **AC 5** ("UI zeigt robuste Aussagen prominent, exakte Zusammensetzung als Detail mit
      Fragilitäts-Hinweis"): Block 1 vor Block 2, `isCompositionFragile` als Pflichtprüfung,
      Klartext **und** Prozentzahl nebeneinander (Spec-Entscheidung 3), `monteCarloSePct`
      mit angezeigt.
- [ ] **AC 6** ("klar als experimentell/zusätzlich gekennzeichnet, ersetzt den Field-Score
      nicht — beide Ansichten bleiben nebeneinander"): eigener `CollapsibleSection`-Block
      **ohne** `defaultOpen` mit "experimentell"-Label; das Diff auf `FieldScorePanel.tsx`,
      `MatchupMatrix.tsx`, `PredictionPanel.tsx`, `ThreatsPanel.tsx`, `MatchupTable.tsx` und
      `packages/shared/src/fieldWinRate.ts` ist **leer** (im PR per `git diff --stat` belegen).
- [ ] Genau **eine** LP-Implementierung und genau **ein** Gleichgewichts-Löser im Repo:
      `nashEquilibrium.ts` enthält kein zweites Simplex-Tableau, sondern ruft
      `solveStandardFormLp`; per grep über `packages` und `apps` belegen.
- [ ] Genau **eine** Wilson-Implementierung bleibt bestehen: diese Spec fügt **keine** hinzu
      (die Beta-Posterior ist eine Verteilung, kein Intervall — im PR ausdrücklich so
      begründet).
- [ ] Der Konsistenz-Test "Gleichgewicht ist Fixpunkt der Replicator-Dynamik" verkettet
      Slice A2 und A3 nachweisbar (§3.5).
- [ ] Der Property-Test
      `zeroSumWinRate(w,l,t) === (1 + tournamentWinRate(w,l,t) − tournamentWinRate(l,w,t))/2`
      ist grün — er ist die lebende Verbindung zwischen Spec 2 und der
      Konstantsummen-Annahme dieser Spec.
- [ ] Jedes Monte-Carlo-Resample ist nachweislich konstantsummig (`p_ij + p_ji === 1`) und
      liefert `valuePct === 50`; `valuePct` wird **persistiert** und ist damit produktiv
      überwachbar.
- [ ] Neue Tests: Happy Path **und** je ein Fehler-/Randfall pro Slice (`b` negativ wirft;
      unbeschränktes LP; nicht konstantsummige Matrix ergibt `status 'failed'`; `n = 0` und
      `n = 1`; vollständig entartete Matrix; Fenster unter `minArchetypes`; leere Tabelle
      ergibt 200 mit `run: null`; `days = 999` ergibt 400; fehlende Vorwoche ergibt
      `'unknown'`).
- [ ] Migration `0014` **generiert** (nicht handgeschrieben), im PGlite-Harness angewandt,
      rein additiv, ohne Datenverlust; Rollback-Weg in §5 beschrieben.
- [ ] Job zuerst als **Dry-Run** gelaufen; `archetypeCount`, `imputedCellSharePct`,
      `equalizerCount`, `exactSupportRatePct`, `failedResamples` und **`durationMs` je
      Fenster** in der PR dokumentiert; danach `resamples`, `REPLICATOR_STABLE_BAND_PP` und
      die `exclusionBand`-Grenzen bestätigt oder angepasst.
- [ ] Beide Imputations-Policies im Dry-Run einmal gegengerechnet und die Differenz notiert
      (offene Frage 3).
- [ ] Response-Zeit `/api/meta/equilibrium` im PGlite-Harness notiert (dieselbe Praxis wie
      Spec 2, 3 und 5).
- [ ] Cold-Start/Empty-State geprüft: leere Tabellen, keine Turniere im Fenster, weniger als
      drei Archetypen, keine abgeschlossene ISO-Woche, Server ohne die Route (alter Deploy),
      vollständig imputierte Matrix.
- [ ] Wire-Kompatibilität: neue Route additiv, ein Fehler beim Laden bricht **keinen**
      bestehenden Meta-Block.
- [ ] **Modell- und Interpretationsgrenzen sind Pflichttext** (§6 Risiko 3): kein Ort in der
      UI erzeugt eine Kausal- oder Handlungsanweisung ("spiel das"), sondern nur
      Positionsaussagen. Die drei ähnlichen Win-Rate-Zahlen sind in UI **und** Doku
      unterscheidbar benannt (§3.0f).
- [ ] Keine Secrets im Diff, **keine neue Dependency** (Simplex, PRNG und Beta-Sampler sind
      selbst geschrieben — im PR ausdrücklich begründet), kein kostenpflichtiger Dienst
      (CLAUDE.md §2.2), kein neuer externer API-Call (der Job liest ausschließlich die
      eigene DB).
- [ ] `security-agent` gelaufen (**neue Route**, CLAUDE.md §3) und `code-review-agent`;
      Review auch gegen die Spec-Akzeptanzkriterien.
- [ ] Doku aktualisiert: `docs/features.md` (neuer §18 inkl. der Tabelle aus §3.0f und der
      Modellgrenzen), `docs/database.md`, `docs/data-types.md`, `docs/data-flow.md`,
      `docs/backend-evolution-plan.md` §5.2, `docs/architecture.md` (ein Absatz zur
      Optimierungs-Schicht in `@pokekon/shared`).
- [ ] Die dokumentationspflichtigen Annahmen aus §3.0 (Konstantsummen-Symmetrisierung,
      Grenzen des Ausschluss-Zertifikats, Abweichung Jeffreys gegen Wilson, `phi = 1/2`,
      Unabhängigkeitsannahme beim Resampling) stehen als Kommentar an der jeweiligen Funktion
      **und** in `docs/data-types.md`.
- [ ] Die Quellenprüfung aus §4 Schritt 0 ist durchgeführt und ihr Ergebnis im PR notiert
      (bestätigt / korrigiert / Fixture F weggelassen).
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body.
