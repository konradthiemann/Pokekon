# Plan — Spec 5: Von "was ist stark" zu "was ändert sich, wenn ich X tausche"

> **Bindende Grundlage:** [`specs/recommendation-to-prognosis.md`](../../specs/recommendation-to-prognosis.md).
> Kontext: Teil 5 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> **Baut auf Spec 2 + 3 auf** (beide in `main`: `packages/shared/src/winRate.ts`,
> `packages/shared/src/wilsonInterval.ts`) und auf Spec 4
> ([`.claude/plans/personal-data-role-rework.md`](./personal-data-role-rework.md), PR #48, in `main`).
> **Branch:** `feat/recommendation-to-prognosis`, abzweigen von `main` (`1925056`).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.
> **Architektur-Voraussetzung gelesen** (CLAUDE.md §1): `docs/backend-evolution-plan.md`.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `1925056`)

Alles hier ist aus dem Code gelesen. Wo etwas nicht belegt werden konnte, steht
**Vermutung** oder **Unbekannt** (CLAUDE.md §2.1).

### 0.1 Die drei bindenden Entscheidungen zu den "Offenen Fragen" der Spec

Der Orchestrator gibt sie als **entschieden (2026-09-02)** vor:

1. **Metrik = Platzierungs-Perzentil** (nicht Field-WR-Delta) — nutzt
   `tournament_standings.placing`, keine Matchup-Matrix je Liste nötig.
2. **Mindest-Stichprobe = Konfidenz-Denken statt harter Cutoff**, konsistent zu Spec 3.
3. **Umfang = serverseitige Vorberechnung für ALLE Meta-Archetypen**, neuer Job + Route in
   `apps/api`, Lesequelle `tournament_standings` — **kein** client-seitiger Limitless-Fetch.

> **Erste Diskrepanz — inzwischen bereinigt:** Zum Planungszeitpunkt (Repo-Stand `1925056`,
> das war der Checkout des Planning-Agents) enthielt `specs/recommendation-to-prognosis.md`
> noch keinen Auflösungsblock für "Offene Fragen" (`:86-98`). Das ist mit
> [PR #50](https://github.com/konradthiemann/Pokekon/pull/50) (gemergt) behoben — die Spec
> trägt die drei Entscheidungen jetzt unter "Offene Fragen (entschieden, 2026-09-02)". Kein
> Umsetzungsschritt mehr nötig, hier nur zur Nachvollziehbarkeit belassen.

> **Zweite Diskrepanz, bewusst aufgelöst, aber noch nicht in der Spec nachgetragen:** Die
> User Story der Spec (`:44-46`) verspricht "geschätzt +2 bis +5 Prozentpunkte **Field-WR**".
> Unter Entscheidung 1 ist das **nicht mehr erreichbar** — gemessen wird Platzierung, nicht
> Field-WR. Der Plan liefert stattdessen eine Zahl in derselben *Form* (Prozentpunkte,
> 0 = neutral, mit Konfidenzband), aber anderer *Bedeutung*. Das ist keine stille
> Scope-Verkleinerung, sondern die direkte Folge von Entscheidung 1 und gehört als
> Docs-Korrektur in den ersten Umsetzungs-Slice (§4 Schritt 0 unten).

### 0.2 Datengrundlage — was wirklich in der DB steht

- `apps/api/src/db/schema.ts:316-346` — `tournament_standings`:
  `tournamentId`, `archetypeId` (notNull, `'other'` wenn unbekannt), `archetypeName`,
  `playerName`, **`placing: integer('placing')` — NULLABLE** ("Limitless omits it for drops"),
  `wins`/`losses`/`ties` (notNull default 0), **`decklist: jsonb().$type<TournamentDecklist>()`
  — nullable**, `icons`, `matchResults: jsonb().$type<StandingMatchResult[]>()` — nullable.
  Indizes: `tournament_standings_tournamentId_idx`, `tournament_standings_archetypeId_idx`.
- **Korrektur zur Aufgabenstellung:** eine Spalte `totalPlayers` gibt es auf
  `tournament_standings` **nicht**. Die Feldgröße hängt an `tournaments.players`
  (`schema.ts:288`) und braucht den Join. Das Perzentil ist ohne diesen Join nicht berechenbar.
- `apps/api/src/db/schema.ts:282-314` — `tournaments`: `date`, `players`, `isOnline`,
  `swissMode`, Index `tournaments_online_bo1_idx`.
- `packages/shared/src/meta.ts:23-27` — `TournamentDecklist = { pokemon, trainer, energy:
  DecklistCardEntry[] }`; `DecklistCardEntry` trägt `name`, `count` und **optional `set`/
  `number`** (`meta.ts:57-66`). → **Dieselbe Karte kann in einer Liste mehrfach als Eintrag
  auftauchen** (zwei Printings). Ob das in echten Limitless-Daten vorkommt: **Unbekannt**,
  aber die Aggregation muss es abfangen (siehe 0.5).
- `packages/shared/src/meta.ts:119,133-136` — `OTHER_ARCHETYPE_ID = 'other'`,
  `normalizeArchetypeId`.
- **`matchResults` wird von dieser Spec NICHT gelesen.** Entscheidung 1 macht die
  Matchup-Matrix je Liste überflüssig; die Spalte bleibt für Spec 6 reserviert.

### 0.3 Die bestehende Kartenvergleichs-Engine (bleibt unangetastet, wird nur ergänzt)

- `apps/web/src/lib/deckComparison.ts:113-269` — `fetchArchetypeComparison` läuft
  **im Browser**, holt über `limitlessFetch` (`:41-56`, inkl. `corsproxy.io`-Fallback,
  `:39`) die 50 letzten Turniere, filtert auf `players >= 30`, nimmt die **8 größten**
  (`:127-130`) und sammelt daraus Decklisten.
- `:247-257` — die Schwellen, die laut Spec §Out of Scope **unverändert** bleiben:
  `suggestedAdds` = `frequency >= 55 && !inUserDeck`, `suggestedRemoves` =
  `frequency <= 20 && inUserDeck`, `countAdjustments` = `inUserDeck && frequency >= 50`
  mit `|diff| >= 1` gegen `Math.round(topAvgCount)`.
- `:6-19` — `CardStat` (`name`, `cardType`, `frequency`, `avgCount`, `topAvgCount`,
  `inUserDeck`, `userCount`), `:21-34` — `ComparisonResult`.
- `:177-181` — "Top-Listen" = `placing <= ceil(totalPlayers * 0.3)`, Fallback auf alle
  Listen bei < 3 Top-Listen.
- **Konsumenten (vollständig, es sind nur zwei):**
  `apps/web/src/store/dashboardStore.ts:29-30,59,304-329` (`runDeckComparison`,
  `comparisonResult`) und
  `apps/web/src/components/recommendations/DeckComparisonPanel.tsx:4,18-42`
  (`CardRow` + `FrequencyBar`, `:34` rendert `card.frequency`).
- **Belegter Nebenbefund (nicht in dieser Spec zu fixen, aber zu melden):**
  `deckComparison.ts:200-213` zählt `s.listsCount++` **pro Karteneintrag**, nicht pro Liste.
  Enthält eine Liste dieselbe Karte als zwei Einträge (zwei Printings, siehe 0.2), zählt
  `listsCount` sie doppelt und `frequency` (`:229`) kann **> 100 %** werden. Ob das real
  vorkommt: **Unbekannt**. Die *neue* Aggregation in `@pokekon/shared` (§3.4) macht es
  **richtig** (Dedupe je Liste) — dadurch können `frequency` (Limitless-Pfad) und
  `inclusionPct` (DB-Pfad) für dieselbe Karte leicht auseinanderlaufen. Siehe §6 Risiko 5.

### 0.4 Regel 2 und ihr Umfeld

- `apps/web/src/hooks/useRecommendations.ts:161-183` — Regel 2 feuert je Archetyp mit
  `stats.wins > 0 && stats.winRate <= 50 && stats.encounters >= 5`, Priorität `high` bei
  Local-Meta oder `encounters >= 8`. Text endet auf `t('rules.tech.dataHint')`.
- `useRecommendations.ts:13-19` — der **explizite** Kommentar, warum die alte
  `TECH_SUGGESTIONS`-Tabelle entfernt wurde ("Asserting a specific counter card is not
  defensible"). `docs/features.md:329` wiederholt das als Feature-Doku.
  → **Diese Leitplanke darf durch das neue Delta nicht unterlaufen werden** (§3.8).
- `apps/web/src/i18n/locales/de/recommendations.json` → `rules.tech.*` und der komplette
  `comparison.*`-Block existieren bereits.
- `apps/web/src/hooks/useRecommendations.test.ts` existiert (vitest + `renderHook`,
  `i18n.changeLanguage('en')` in `beforeAll`) — der Harness für die Regel-2-Scheibe ist da.

### 0.5 Präzedenzfälle, an denen dieser Plan hängt

- **Reine Berechnung ohne I/O in `packages/shared`:** `fieldWinRate.ts`, `wilsonInterval.ts`.
  `packages/shared/src/index.ts:1-14` ist das Barrel (braucht einen neuen Re-Export).
- **`wilsonInterval(wins, losses, ties, opts)`** (`wilsonInterval.ts:75-110`) akzeptiert
  **nicht-ganzzahlige** Eingaben — `matchupCellInterval` Fall 3 (`:227-229`) nutzt das
  bereits (`wins = (winRate/100) * total`). Das ist der Hebel, über den §3.3 die vorhandene,
  getestete Wilson-Implementierung wiederverwendet statt eine zweite zu bauen.
  `significant` = `highPct < 50 || lowPct > 50` (`:108`).
- **Job-Muster:** `apps/api/src/jobs/syncMeta.ts:381-507` (`runMetaSync(db, opts)` →
  Result-Objekt) + CLI-Entry `:510-518` + npm-Script `apps/api/package.json:19-20`
  (`job:sync-meta`, `job:backfill-winrates`). Transaktionaler Full-Replace:
  `syncMeta.ts:200-219` und `:273-297`.
- **Batch-Modell über einen Zeitstempel:** `matchup_matrix.importedAt`
  (`schema.ts:352-369`) + `apps/api/src/lib/matchupData.ts:13-35` (`loadLatestBatch`).
- **Route-Muster:** `apps/api/src/routes/meta.ts:405-475` (`/archetypes/:id/lists`) —
  `archetypeIdParamSchema` (`validation.ts:161-163`) + Query-Schema, **keine Auth**
  (öffentliche Referenzdaten), **kein** Rate-Limit auf reinen DB-Lesern (nur `/sync`
  hat eins, `meta.ts:314`).
- **Query-Schemas:** `validation.ts:134-136` (`META_WINDOW_MIN_DAYS = 1`, `MAX = 180`,
  `DEFAULT = 30`), `:149-158` (`metaWindowQuerySchema`), `:166-169`
  (`archetypeListsQuerySchema` als `.extend()`).
- **UI-Anzeige-Helfer für Konfidenz existieren schon:**
  `apps/web/src/components/meta/confidence.ts:8-22` (`confidenceTier(widthPct)`:
  ≤10 `high`, ≤20 `medium`, ≤35 `low`, sonst `veryLow`) und `:27-37`
  (`formatWithInterval`). Beide sind wiederverwendbar — **keine zweite Formatierung bauen.**
- **Architektur-Doku sanktioniert die Tabelle bereits:**
  `docs/backend-evolution-plan.md:212` — "**`archetype_card_stats`** (optional, als Cache) —
  Ergebnis von `deckComparison` pro Archetyp+Zeitraum … TTL über `computedAt`."
  Der Plan realisiert genau diesen vorgesehenen Baustein und markiert ihn dort als
  umgesetzt (Muster `:206-211`).

### 0.6 Infrastruktur

- Gates (Root `package.json:14-25`): `npm run typecheck`, `npm run lint`, `npm run test`
  (baut vorher `@pokekon/shared`).
- Migrationen: `apps/api/drizzle/0000…0012`; generieren mit
  `npm run db:generate -w @pokekon/api`; Deploy über `preDeployCommand` →
  `npm run migrate:deploy -w @pokekon/api`. **Nächste Nummer: `0013`.**
- API-Test-Harness: `apps/api/src/api.test.ts:31-59` — PGlite + **echte** Migrations-SQL
  aus `drizzle/meta/_journal.json`. Meta-Routen bereits abgedeckt (`:1022`, `:1146`),
  Job-Tests ebenfalls (`:2028`, `backfillMetaWinRates`).
- Web-Tests: vitest + jsdom + `@testing-library/react` (`apps/web/package.json:11,33-53`);
  reine Helfer-Tests als Präzedenz (`components/meta/confidence.test.ts`,
  `winRateColor.test.ts`).
- i18n: `apps/web/src/i18n/locales/{de,en}/recommendations.json`.

---

## 1. Summary

Kartenempfehlungen bekommen neben der Kopienhäufigkeit ein zweites, unabhängiges Signal:
**korreliert diese Karte mit besseren Turnierplatzierungen ihres eigenen Archetyps?**
Grundlage ist ausschließlich `tournament_standings` (`decklist` + `placing` +
`tournaments.players`). Pro Archetyp werden die veröffentlichten Listen für jede Karte in
zwei Gruppen geteilt (mit / ohne Karte) und ihre **Platzierungs-Perzentile** verglichen.
Als Effektmaß dient nicht die Differenz der Mittelwerte, sondern die
**Mann-Whitney-Überlegenheitswahrscheinlichkeit θ** ("in wie viel Prozent aller
Direktvergleiche platziert sich eine Liste *mit* der Karte besser als eine *ohne*") — weil θ
eine **Wahrscheinlichkeit in [0,1]** ist und damit die Wilson-Score-Logik aus Spec 3
*legitim* anwendbar bleibt, was für eine rohe Perzentil-Differenz **nicht** gilt (Herleitung
und Abgrenzung in §3.0). Der Delta ist `(θ − 0,5) × 100` in Prozentpunkten, 0 = kein
Unterschied, mit einem Wilson-Band und einem `significant`-Flag, das exakt dieselbe Bedeutung
hat wie in `WeightedMatchup` (Band schließt 50 % aus). Die Rechnung lebt als reine Funktion
in `packages/shared/src/cardPerformance.ts`; ein neuer Job
`apps/api/src/jobs/computeCardStats.ts` (Muster `syncMeta.ts`) berechnet sie **für alle
Meta-Archetypen und die Zeitfenster 7/14/21/28 Tage vorab** und schreibt sie in eine neue
Tabelle `archetype_card_stats` (in `docs/backend-evolution-plan.md` §5.2 bereits so
vorgesehen); `GET /api/meta/archetypes/:id/card-stats` liefert sie aus. Im Frontend werden
die Deltas **an die bestehenden `suggestedAdds`/`suggestedRemoves`/`countAdjustments`
angehängt**, ohne eine einzige Zeile der 55/20/50-Häufigkeitslogik anzufassen — beide
Signale stehen nebeneinander. Eine reine Klassifikationsfunktion `classifyCardSignal` trennt
die Fälle, die die UI unterscheiden muss, allen voran den **Popularitäts-Paradox-Fall**
(häufig gespielt, aber kein oder negatives Delta). Regel 2 in `useRecommendations` verweist
auf konkrete, delta-belegte Karten statt nur generisch auf den Listen-Vergleich — ohne die
bewusst entfernte Tech-Karten-Halluzination wiederzubeleben (die Aussage bleibt archetypweit
und korrelativ, nie matchup-spezifisch). Nutzer ist Konrad selbst (Dogfooding).

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik — Single Source of Truth)**
- [ ] `packages/shared/src/cardPerformance.ts` **(neu)** — `normalizeCardName`,
      `placementPercentile`, `mannWhitneyTheta`, `rankEffectiveSampleSize`,
      `cardPerformanceDelta`, `computeArchetypeCardStats`, `classifyCardSignal`,
      Konstanten `HIGH_INCLUSION_PCT`/`LOW_INCLUSION_PCT`/`MAX_USABLE_BAND_PP`
- [ ] `packages/shared/src/cardPerformance.test.ts` **(neu)** — Golden-/Property-Tests (§3)
- [ ] `packages/shared/src/index.ts` — **ein** neuer Re-Export

**Datenmodell / Migration (`apps/api`)**
- [ ] `apps/api/src/db/schema.ts` — neue Tabelle `archetypeCardStats` (§3.5)
- [ ] `apps/api/drizzle/0013_*.sql` **(generiert, nicht handgeschrieben)** +
      `apps/api/drizzle/meta/*` (Journal/Snapshot)

**API**
- [ ] `apps/api/src/jobs/computeCardStats.ts` **(neu)** + CLI-Entry (Muster `syncMeta.ts:510`)
- [ ] `apps/api/package.json` — Script `job:compute-card-stats`
- [ ] `apps/api/src/lib/cardStatsData.ts` **(neu)** — Leseseite (`loadCardStats`), analog
      `lib/matchupData.ts`, aber **ohne** Lazy-Seed (§3.6)
- [ ] `apps/api/src/routes/meta.ts` — **eine** neue Route
      `GET /archetypes/:archetypeId/card-stats`; alles Bestehende unangetastet;
      `windowConditions` wird exportiert statt dupliziert
- [ ] `apps/api/src/validation.ts` — `cardStatsQuerySchema`, `snapCardStatsWindow`
- [ ] `apps/api/src/api.test.ts` — Job-Test + Route-Test (neue `describe`-Blöcke)

**Web**
- [ ] `apps/web/src/lib/api.ts` — `ArchetypeCardStatsResponse` + `fetchArchetypeCardStats`
      (Delta-Felder tolerant typisiert, damit ein älterer Server nichts bricht)
- [ ] `apps/web/src/lib/deckComparison.ts` — `CardStat` um `delta?`/`tier?` erweitert,
      `ComparisonResult` um `cardStatsSource?`; **neue reine Funktion `attachCardDeltas`**.
      Die 55/20/50-Filter (`:247-257`) und `limitlessFetch` bleiben **buchstäblich unverändert**
- [ ] `apps/web/src/lib/deckComparison.test.ts` **(neu)** — testet **nur** `attachCardDeltas`
      (netzwerkfrei)
- [ ] `apps/web/src/store/dashboardStore.ts` — `runDeckComparison` hängt die Deltas an;
      neuer Store-State `cardStats` + Auto-Load beim Archetyp-Wechsel (§3.7)
- [ ] `apps/web/src/components/recommendations/DeckComparisonPanel.tsx` — zweites Signal
      neben `FrequencyBar`, eigene Darstellung für `popularityParadox`
- [ ] `apps/web/src/hooks/useRecommendations.ts` — optionaler Input `cardDeltas`,
      Regel-2-Anreicherung (§3.8)
- [ ] `apps/web/src/hooks/useRecommendations.test.ts` — neue Fälle
- [ ] `apps/web/src/pages/RecommendationsPage.tsx` — reicht `cardDeltas` in den Hook durch
- [ ] `apps/web/src/i18n/locales/{de,en}/recommendations.json` — neue Keys (§3.9)

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `specs/recommendation-to-prognosis.md` — Auflösungsblock der drei offenen Fragen (§0.1)
- [ ] `docs/features.md` §9 (zweites Signal im Listen-Vergleich, Popularitäts-Paradox-Fall,
      **plus die belegte Einschränkung, dass Häufigkeit und Delta aus zwei verschiedenen
      Turnier-Populationen stammen**), §10 (Regel 2), neuer §17 "Karten-Performance-Delta"
- [ ] `docs/database.md` — `archetype_card_stats`, Migration `0013`, neuer Job
- [ ] `docs/data-types.md` — `ArchetypeCardStat`, `CardPerformanceDelta`, `CardSignalTier`,
      inkl. der dokumentationspflichtigen Näherungen aus §3.0
- [ ] `docs/data-flow.md` — Job → Tabelle → Route → `attachCardDeltas` → UI
- [ ] `docs/backend-evolution-plan.md` §5.2 — `archetype_card_stats` als umgesetzt markieren
- [ ] `apps/api/README.md` — neuer Job im Betriebsteil (nur falls dort Jobs gelistet sind)

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen, Formeln und nachrechenbare Wertetabellen — keine Implementierungsvorgaben darüber
hinaus.

> **Zu allen Zahlentabellen unten:** Die **Formel ist bindend**, die Zahlen sind von Hand
> nachgerechnet und auf die angegebene Stellenzahl gerundet. Weicht ein Wert ab, gilt die
> Formel und der Testwert wird korrigiert — nicht umgekehrt. Werte, die aus Spec 3s bereits
> gepinnter Golden-Tabelle stammen (`wilsonInterval.test.ts`), sind als solche markiert und
> **exakt**.

### 3.0 Warum Wilson hier NICHT direkt passt — und was stattdessen gilt

Die Spec fragt ausdrücklich, ob der Wilson-Gedanke aus Spec 3 auf einen Gruppenvergleich
übertragbar ist. **Die ehrliche Antwort: auf die naheliegende Größe nicht, auf die richtige
Größe schon.**

**Was nicht geht.** Wilson ist ein Intervall für eine **Binomial-Anteilsschätzung**: `n`
unabhängige 0/1-Versuche, Varianz `p(1−p)/n`. Ein Platzierungs-Perzentil ist keine
Bernoulli-Größe, sondern ein stetiger Wert in [0,1]. Man *könnte* Wilson formal auf das
mittlere Perzentil anwenden (für jede auf [0,1] beschränkte Zufallsgröße ist `p(1−p)` eine
obere Schranke der Varianz, das Intervall wäre also konservativ) — aber der Preis ist absurd:
Perzentile innerhalb einer Gruppe sind grob gleichverteilt, `Var ≈ 1/12 ≈ 0,083`, während
Wilson bei `p̂ = 0,5` mit `0,25` rechnet. Das Intervall wäre um Faktor `√3 ≈ 1,73` zu breit,
und praktisch **jede** Karte landete bei "nicht genug Daten". Das wäre der harte Cutoff durch
die Hintertür — genau das, was das zweite AC verbietet.
Und zweitens: Wilson ist ein **Ein**-Stichproben-Intervall. Die Spec braucht eine **Differenz
zweier Gruppen**.

**Was stattdessen gilt.** Statt der Mittelwert-Differenz wird die
**Mann-Whitney-Überlegenheitswahrscheinlichkeit** geschätzt:

```
θ = P(X_mit > X_ohne) + ½ · P(X_mit = X_ohne)
```

Das ist der klassische Rangvergleich (Mann-Whitney-U / Wilcoxon-Rangsumme, identisch zur
AUC bzw. "common language effect size"). Vier Gründe, warum das hier die richtige Größe ist:

1. **θ ist selbst eine Wahrscheinlichkeit in [0,1]** — also ein Anteil. Damit ist die
   Wilson-Logik *legitim* anwendbar, statt sie auf eine Größe zu zwingen, für die sie nicht
   gedacht ist. Das ist die tragfähige Brücke zu Spec 3, kein Force-Fit.
2. **Platzierung ist ordinal, nicht intervallskaliert.** Der Unterschied zwischen Platz 1 und
   2 ist nicht "derselbe Wert" wie zwischen Platz 50 und 51. Ein rangbasiertes Maß ist
   fachlich *korrekter* als eine Mittelwert-Differenz, nicht nur bequemer.
3. **θ = 0,5 ist neutral** — exakt dieselbe Achse wie jede andere Zahl in dieser App
   (`WeightedMatchup.significant`, `winRateColor`, `MatchupMatrix`). `significant` bedeutet
   überall dasselbe: "das Band schließt 50 % aus".
4. **Deterministisch und golden-testbar**, im Gegensatz zu einem Bootstrap-CI.

**Warum nicht Bootstrap?** Ein Bootstrap-CI auf die Perzentil-Differenz wäre statistisch
ebenfalls sauber und annahmeärmer. Verworfen aus drei Gründen: (a) er ist nicht-deterministisch
und braucht einen geseedeten PRNG, sonst sind Golden Tests unmöglich — und die
Zwei-Agenten-TDD dieses Repos lebt von exakten Erwartungswerten; (b) Kosten: ~80 Karten ×
~20 Archetypen × 4 Zeitfenster × 2000 Resamples ist eine Größenordnung mehr Rechenzeit als
der ganze restliche Job; (c) er löst das Ordinalitäts-Problem aus Grund 2 nicht. Als
Gegenprobe *einmalig* sinnvoll (§6 offene Frage 2), nicht als Produktionspfad.

**Warum nicht Welch-t auf die Mittelwert-Differenz?** Setzt näherungsweise Normalität der
Stichprobenmittel voraus. Genau in den interessanten Fällen ist eine Gruppe klein (5–15
Listen) und die Perzentil-Verteilung schief (Top-Listen sind überrepräsentiert, weil
Limitless bevorzugt bei guten Platzierungen Listen veröffentlicht — §6 Risiko 1). Da ist der
CLT-Appell nicht gedeckt.

**Die Brücke Wilson ↔ Mann-Whitney (bindende Herleitung).** Unter der Nullhypothese
(θ = 0,5) ist die Varianz der U-Statistik bekannt:

```
Var0(U) = n1·n2·(n1+n2+1)/12        ->  Var0(θ̂) = (n1+n2+1)/(12·n1·n2)
```

Eine Bernoulli-Anteilsschätzung hat bei `p = 0,5` die Varianz `1/(4n)`. Gleichsetzen:

```
1/(4·n_eff) = (n1+n2+1)/(12·n1·n2)   ->   n_eff = 3·n1·n2/(n1+n2+1)
```

`n_eff` ist damit **die** effektive Stichprobengröße, bei der ein Wilson-Intervall auf θ̂
**am Nullpunkt exakt die richtige Streuung** hat — und der Nullpunkt ist genau der Ort, an
dem die Entscheidung fällt ("schließt das Band 50 % aus?"). Abseits des Nullpunkts greift
Wilsons `p(1−p)`-Schrumpfung, die konservativ wirkt und den Randkollaps verhindert
(θ̂ = 1 ergibt **nicht** [100 %, 100 %], sondern ein echtes Intervall — dieselbe Eigenschaft,
wegen der Spec 3 die Wald-Näherung verboten hat).

Drei Einschränkungen, die als Kommentar an die Funktion **und** in `docs/data-types.md` gehören:
- `Var0(U)` gilt **ohne Bindungen**; mit Bindungen (zwei Listen mit identischem Perzentil)
  ist die wahre Varianz kleiner → das Band ist **zu breit, nie zu schmal**. Dieselbe
  Richtung wie die Ties-Näherung in `wilsonInterval` (`wilsonInterval.ts:63-73`).
- `n_eff` kalibriert die Streuung **am Nullpunkt**. Abseits davon (θ̂ nahe 0 oder 1) ist die
  wahre Varianz verteilungsabhängig; die Wilson-Rechnung ist dort eine Näherung mit
  konservativer Tendenz, kein exaktes Überdeckungsintervall.
- Die Beobachtungen sind **nicht unabhängig** (Listen aus demselben Turnier teilen sich das
  Feld) und die Gruppenzuordnung ist **nicht randomisiert**. Das Ergebnis ist eine
  **Korrelation, keine Kausalität** — es steht nirgends "Karte X macht dich besser",
  sondern "Listen mit X platzierten sich besser". Das ist bindend für jeden UI-Text (§3.9).

### 3.1 `packages/shared/src/cardPerformance.ts` — Bausteine

```ts
/** Inclusion thresholds mirrored from apps/web/src/lib/deckComparison.ts:247-250.
 *  Exported so the signal classification and the existing filters cannot drift
 *  apart. The VALUES are unchanged — Spec 5 "Out of Scope" forbids touching the
 *  copy-frequency logic itself. */
export const HIGH_INCLUSION_PCT = 55;
export const LOW_INCLUSION_PCT = 20;

/** Above this band width (percentage points on theta x 100) a delta is reported
 *  as "no prognosis possible" rather than as a number. NOT a sample-size cutoff:
 *  it is derived from the uncertainty itself, so a small but consistent sample
 *  can still qualify while a large but noisy one does not. Tuned value, see
 *  plan section 6, open question 3. */
export const MAX_USABLE_BAND_PP = 40;

/**
 * Canonical key for matching card names across sources (our DB decklists and
 * the Limitless client fetch): lowercase, trimmed, inner whitespace collapsed
 * to a single space. Set/number are NOT part of the key — two printings of the
 * same card are the same card for this analysis. Punctuation and apostrophes
 * are deliberately NOT normalised: both sources are Limitless, so the spelling
 * is identical, and a lossy normalisation would risk merging distinct cards.
 */
export function normalizeCardName(raw: string): string;
// 'Ultra Ball'      -> 'ultra ball'
// '  Nest   Ball  ' -> 'nest ball'
// 'NEST BALL'       -> 'nest ball'
// ''                -> ''

/**
 * Placement percentile in [0,1]: the fraction of the field this pilot finished
 * ahead of. 1 = won the event, 0 = last. Returns null when the value carries no
 * information: placing missing/non-finite/< 1, or totalPlayers < 2 (a one-player
 * event ranks nobody).
 *   percentile = clamp((totalPlayers - placing) / (totalPlayers - 1), 0, 1)
 */
export function placementPercentile(
  placing: number | null | undefined,
  totalPlayers: number,
): number | null;
```

Verbindliche Wertetabelle `placementPercentile` (exakt):

| placing | totalPlayers | Ergebnis | Bedeutung |
|---|---|---|---|
| 1 | 100 | `1` | Sieger |
| 100 | 100 | `0` | Letzter |
| 50 | 100 | `50/99 = 0.505050…` | Mitte |
| 1 | 2 | `1` | kleinstes sinnvolles Feld |
| 2 | 2 | `0` | |
| 1 | 1 | `null` | Ein-Personen-Feld = keine Information |
| `null` | 100 | `null` | Drop / Limitless liefert nichts |
| 0 | 100 | `null` | ungültige Platzierung |
| 150 | 100 | `0` | geklemmt statt negativ |
| 1 | 0 | `null` | |

### 3.2 Rangvergleich und effektive Stichprobengröße

```ts
/**
 * Mann-Whitney probability of superiority:
 *   theta = ( #{a > b} + 0.5 * #{a == b} ) / (n_a * n_b)
 * over all pairs. Returns null when either group is empty. Deterministic; a
 * naive O(n_a * n_b) implementation is acceptable at this data scale, an
 * O(n log n) rank-sum implementation is equally fine.
 */
export function mannWhitneyTheta(
  withValues: number[],
  withoutValues: number[],
): number | null;

/**
 * Effective sample size that makes a Wilson interval on theta-hat reproduce the
 * exact Mann-Whitney null variance (plan section 3.0):
 *   n_eff = 3 * n1 * n2 / (n1 + n2 + 1)
 * Returns 0 when either group is empty.
 */
export function rankEffectiveSampleSize(n1: number, n2: number): number;
```

Verbindliche Werte `mannWhitneyTheta` (exakt, von Hand nachrechenbar):

| withValues | withoutValues | θ | Begründung |
|---|---|---|---|
| `[1, 1, 1]` | `[0, 0]` | `1` | jede Paarung gewonnen |
| `[0, 0]` | `[1, 1, 1]` | `0` | jede Paarung verloren |
| `[0.5]` | `[0.5]` | `0.5` | eine Bindung, ½ Kredit |
| `[0.9, 0.1]` | `[0.5]` | `0.5` | 1 gewonnen, 1 verloren |
| `[1, 2]` | `[2, 3]` | `0.125` | Paare: 0, 0, ½, 0 → 0.5/4 |
| `[3, 4]` | `[1, 2]` | `1` | |
| `[]` | `[1]` | `null` | |
| `[1]` | `[]` | `null` | |

Verbindliche Werte `rankEffectiveSampleSize` (exakt):

| n1 | n2 | n_eff | Eigenschaft |
|---|---|---|---|
| 1 | 1 | `1` | `3·1/3` |
| 10 | 10 | `300/21 = 14.285714…` | |
| 100 | 100 | `30000/201 = 149.253731…` | |
| 5 | 100 | `1500/106 = 14.150943…` | **die kleine Gruppe dominiert** |
| 5 | 1000 | `15000/1006 = 14.910536…` | eine riesige Gegengruppe rettet 5 Listen nicht |
| 0 | 50 | `0` | |

Die letzten drei Zeilen gehören als **Property-Test** rein: `n_eff` ist bei festem `n1`
nach oben beschränkt (Grenzwert `3·n1` für `n2 → ∞`). Genau das ist der Grund, warum hier
keine Faustregel "≥ 10 Listen je Gruppe" nötig ist — die Mathematik bestraft die
unbalancierte Gruppe von selbst. **Das ist die Antwort auf die zweite offene Frage der Spec.**

### 3.3 Das Delta mit Konfidenzband

```ts
export interface CardPerformanceDelta {
  /** Lists of this archetype that include / do not include the card. */
  listsWith: number;
  listsWithout: number;
  /** Mann-Whitney theta x 100. 50 = no difference. Rounded to 1 decimal. */
  superiorityPct: number;
  /** superiorityPct - 50: the headline delta in percentage points, signed.
   *  NOT a Field-WR delta — see plan section 0.1 and 3.0. */
  deltaPp: number;
  /** Wilson band on superiorityPct, 1 decimal, clamped to [0,100]. */
  lowPct: number;
  highPct: number;
  /** highPct - lowPct, 1 decimal. Feeds confidenceTier() in the UI. */
  widthPct: number;
  /** true when the band excludes 50 — same meaning as WeightedMatchup.significant.
   *  Computed on the UNROUNDED bounds. */
  significant: boolean;
  /** 3*n1*n2/(n1+n2+1), 2 decimals. Exposed so the UI can be honest about it. */
  effectiveN: number;
  /** Descriptive only, NO confidence interval attached: mean placement
   *  percentile per group x 100. There to make the number tangible, never as a
   *  second inferential statistic. 1 decimal. */
  meanPercentileWithPct: number;
  meanPercentileWithoutPct: number;
}

/**
 * Confidence-aware performance delta between two groups of placement
 * percentiles (values in [0,1]). Returns null when either group is empty —
 * that is undefinedness, not a cutoff.
 *
 * Method (plan section 3.0): theta-hat = mannWhitneyTheta(...), n_eff =
 * rankEffectiveSampleSize(...), band = wilsonInterval(theta*n_eff,
 * (1-theta)*n_eff, 0, opts). The Wilson implementation is REUSED, never
 * re-derived (repo rule: exactly one Wilson implementation).
 */
export function cardPerformanceDelta(
  withPercentiles: number[],
  withoutPercentiles: number[],
  opts?: { confidence?: number },
): CardPerformanceDelta | null;
```

Verbindliche Werte (95 %, `z = 1.959963984540054`; **1 Dezimale**, Toleranz 0,1 pp — die
Formelkette oben ist bindend, die Zahlen sind handgerechnete Illustrationen):

| Fall | n1 / n2 | θ̂ | `deltaPp` | `lowPct`–`highPct` | `significant` | Aussage |
|---|---|---|---|---|---|---|
| A | 10 / 10 | 0.70 | `+20.0` | `44.2 – 87.3` | `false` | **Kernfall:** 70 % sieht eindeutig aus, ist es bei 10 vs. 10 Listen nicht |
| B | 100 / 100 | 0.70 | `+20.0` | `62.2 – 76.8` | `true` | dieselbe Punktschätzung, echte Evidenz |
| C | 20 / 5 | 1.00 | `+50.0` | `75.0 – ~100` | `true` | Randfall kollabiert **nicht** auf `[100,100]` |
| D | 1 / 1 | 1.00 | `+50.0` | `20.7 – 100` | `false` | n_eff = 1 → exakt Spec-3-Golden-Zeile `1W/0L` |
| E | 50 / 50 | 0.50 | `0.0` | symmetrisch um 50 | `false` | |
| F | 0 / 30 | — | — | — | — | → `null` |
| G | 30 / 0 | — | — | — | — | → `null` |

Zeile D ist der Anker an Spec 3: `rankEffectiveSampleSize(1,1) = 1`, `θ̂ = 1` ⇒
`wilsonInterval(1, 0, 0)` ⇒ `[20.6549, 100]` — **exakt** der bereits gepinnte Wert aus
`packages/shared/src/wilsonInterval.test.ts`. Der Tester schreibt das ausdrücklich als
Konsistenz-Test (kein neuer Zahlenwert, sondern eine Verkettung).
Zeile A ist das inhaltliche Gegenstück zu Spec 3s `8W/2L`-Lehrstück: eine Zahl, die
überzeugend aussieht und es nicht ist — genau das soll die Spec sichtbar machen.

Weitere verbindliche Eigenschaften (Property-Tests):
- **Antisymmetrie:** `cardPerformanceDelta(a, b).deltaPp === -cardPerformanceDelta(b, a).deltaPp`
  (bis auf Rundung), und `low`/`high` spiegeln an 50.
- **Monotonie:** bei festem θ̂ schrumpft `widthPct` streng monoton, wenn beide Gruppen
  wachsen (Fall A → B).
- `lowPct <= superiorityPct <= highPct` **immer**.
- `confidence: 0.90` liefert ein echt schmaleres Band als `0.95`.
- Ein einziger Wert je Gruppe (`[0.9]` vs `[0.1]`) liefert ein Band, das 50 enthält —
  aus einer Beobachtung entsteht **nie** eine Aussage.

### 3.4 Aggregation über einen ganzen Archetyp

```ts
/** One published tournament list, reduced to what this analysis needs.
 *  Produced by the API job from tournament_standings joined with tournaments. */
export interface ListPerformanceEntry {
  /** Copies per NORMALISED card name, summed across printings within this one
   *  list. A card appearing twice (two sets) is ONE inclusion with the summed
   *  count — the per-entry counting of deckComparison.ts:200-213 (plan section
   *  0.3) is deliberately not reproduced here. */
  counts: Record<string, number>;
  /** Display name per normalised key, for round-tripping to the UI. */
  displayNames: Record<string, string>;
  /** Card type per normalised key. A conflict (same name in two groups)
   *  resolves to the first seen — deterministic, and a non-issue in practice. */
  cardTypes: Record<string, 'pokemon' | 'trainer' | 'energy'>;
  /** placementPercentile(...) of this list, already in [0,1]. */
  percentile: number;
}

export type CardSignalTier =
  /** No prognosis: a group is empty, or the band is wider than MAX_USABLE_BAND_PP. */
  | 'insufficient'
  /** Popular AND significantly positive — the staple that earns its slot. */
  | 'confirmed'
  /** Rarely played AND significantly positive — the underplayed candidate. */
  | 'hiddenGem'
  /** Popular BUT the delta is negative or its band still contains 50 —
   *  the popularity paradox of vision section 3.5 at card level. */
  | 'popularityParadox'
  /** Significantly negative and not popular. */
  | 'discouraged'
  /** Everything else: measurable, but nothing to say. */
  | 'neutral';

export interface ArchetypeCardStat {
  /** Display name (first spelling seen); normalizeCardName(cardName) is the key. */
  cardName: string;
  cardType: 'pokemon' | 'trainer' | 'energy';
  /** Lists of this archetype with a usable percentile (the denominator). */
  listsAnalyzed: number;
  listsWith: number;
  /** listsWith / listsAnalyzed x 100, 1 decimal. This is the DB-side inclusion
   *  rate — it is NOT the number that drives the 55/20 thresholds (those stay
   *  on deckComparison.ts's Limitless data, plan section 0.3 / 6 risk 5). */
  inclusionPct: number;
  /** Mean copies among including lists, 1 decimal. */
  avgCount: number;
  delta: CardPerformanceDelta | null;
  tier: CardSignalTier;
}

/**
 * Split every distinct card of one archetype's published lists into
 * with/without groups and compute its performance delta. Pure, no I/O.
 * Lists without a usable percentile must be filtered out BEFORE calling this.
 * Result sorted by inclusionPct desc, then cardName asc (stable and testable).
 */
export function computeArchetypeCardStats(
  lists: ListPerformanceEntry[],
  opts?: { confidence?: number; maxBandPp?: number },
): ArchetypeCardStat[];

/** Pure classification — the single place that decides which case the UI is
 *  looking at. The UI picks colours and labels from the tier, never re-derives
 *  it from raw numbers. */
export function classifyCardSignal(
  inclusionPct: number,
  delta: CardPerformanceDelta | null,
  opts?: { maxBandPp?: number },
): CardSignalTier;
```

Verbindliche Klassifikationsregeln (Reihenfolge ist bindend, erste Übereinstimmung gewinnt):

| # | Bedingung | Tier |
|---|---|---|
| 1 | `delta === null` **oder** `delta.widthPct > maxBandPp` | `insufficient` |
| 2 | `delta.significant && delta.deltaPp > 0 && inclusionPct >= HIGH_INCLUSION_PCT` | `confirmed` |
| 3 | `delta.significant && delta.deltaPp > 0` | `hiddenGem` |
| 4 | `inclusionPct >= HIGH_INCLUSION_PCT` und (`delta.deltaPp <= 0` **oder** `!delta.significant`) | `popularityParadox` |
| 5 | `delta.significant && delta.deltaPp < 0` | `discouraged` |
| 6 | sonst | `neutral` |

Regel 4 setzt das fünfte Spec-AC **wörtlich** um: "Karte in vielen Listen, aber
**kein/negatives** Performance-Delta" — "kein" schließt den nicht-signifikanten Fall
ausdrücklich ein. Regel 1 steht **vor** Regel 4, damit ein Staple mit 3 Vergleichslisten
nicht fälschlich als Paradox angeprangert wird (dort ist das Band so breit, dass die
ehrliche Aussage `insufficient` lautet). Diese Reihenfolge ist der wichtigste Testfall
der Funktion und gehört als expliziter Test mit Begründungskommentar in die Suite.

Verbindliche Tabelle für `computeArchetypeCardStats` (Testgrundlage):

| Szenario | Erwartung |
|---|---|
| 4 Listen, alle mit "Ultra Ball" | `listsWith === 4`, `inclusionPct === 100`, `delta === null`, `tier === 'insufficient'` |
| 4 Listen, keine mit "Ultra Ball" | Karte taucht gar nicht im Ergebnis auf |
| Eine Liste enthält "Nest Ball" 2x (zwei Sets, `count` 2 und 1) | **eine** Inklusion, `avgCount` rechnet mit `3` |
| Dieselbe Karte in `pokemon` und `trainer` | ein Eintrag, `cardType` = erster gesehener, deterministisch |
| `lists: []` | `[]` |
| Sortierung | `inclusionPct` desc, bei Gleichstand `cardName` asc |
| 20 mit / 20 ohne, "mit" durchgehend besser platziert | `inclusionPct === 50` ⇒ **`hiddenGem`**, nicht `confirmed` (50 < 55) — Grenzfall explizit testen |
| Karte in 90 % der Listen, θ̂ ≈ 0.5, beide Gruppen groß genug | `tier === 'popularityParadox'` |

### 3.5 Datenmodell + Migration

```ts
// apps/api/src/db/schema.ts — new table
export const archetypeCardStats = pgTable(
  'archetype_card_stats',
  {
    id: serial('id').primaryKey(),
    archetypeId: text('archetype_id').notNull(),
    /** normalizeCardName() key — the join key to the client's card list. */
    cardKey: text('card_key').notNull(),
    /** Display spelling as seen in the source lists. */
    cardName: text('card_name').notNull(),
    cardType: text('card_type').notNull(),
    /** Analysis window in days (7 | 14 | 21 | 28). Scope is always the default
     *  online-Bo1 scope — see plan section 5. */
    windowDays: integer('window_days').notNull(),
    listsAnalyzed: integer('lists_analyzed').notNull(),
    listsWith: integer('lists_with').notNull(),
    inclusionPct: real('inclusion_pct').notNull(),
    avgCount: real('avg_count').notNull(),
    /** All delta columns are nullable TOGETHER: null = a group was empty. */
    superiorityPct: real('superiority_pct'),
    deltaPp: real('delta_pp'),
    lowPct: real('low_pct'),
    highPct: real('high_pct'),
    effectiveN: real('effective_n'),
    meanPercentileWithPct: real('mean_percentile_with_pct'),
    meanPercentileWithoutPct: real('mean_percentile_without_pct'),
    significant: boolean('significant').notNull().default(false),
    tier: text('tier').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('archetype_card_stats_uq').on(
      table.archetypeId, table.cardKey, table.windowDays,
    ),
    index('archetype_card_stats_lookup_idx').on(table.archetypeId, table.windowDays),
    check('archetype_card_stats_type_chk',
      sql`${table.cardType} in ('pokemon','trainer','energy')`),
  ],
);
```

Erwartete Migration `apps/api/drizzle/0013_*.sql` (**generiert** mit
`npm run db:generate -w @pokekon/api`; das erzeugte SQL gegen diese Erwartung prüfen):
`CREATE TABLE "archetype_card_stats" (…)` + Unique-Index + Lookup-Index + CHECK.
**Rein additiv:** neue Tabelle, kein `ALTER` an bestehenden Tabellen, kein Drop, kein
Backfill. Auf Railway gefahrlos vor dem Code-Deploy anwendbar.

**Warum eine Tabelle und keine Materialized View** (CLAUDE.md §6 verlangt ausdrücklich, dass
schwere Aggregationen in Postgres-MVs gehören — dieser Punkt braucht eine Begründung, keine
Umgehung): Die Aggregation *bis* zum Gruppen-Split wäre als MV formulierbar, aber die
eigentliche Rechnung (Mann-Whitney-θ über alle Paare + Wilson-Score-Intervall +
Tier-Klassifikation) ist in SQL weder lesbar noch testbar — und sie **muss** in
`@pokekon/shared` liegen, weil die Spec das ausdrücklich verlangt ("reine Berechnung ohne
I/O, Präzedenzfall `fieldWinRate.ts`") und weil sonst eine zweite Wilson-Implementierung
entstünde (was die Spec-3-DoD verbietet). Die Tabelle ist damit **kein** Umgehen der
MV-Regel, sondern das in `docs/backend-evolution-plan.md:212` bereits vorgesehene
Cache-Muster (`archetype_card_stats`, "TTL über `computedAt`"). Das gehört so in die
PR-Beschreibung.

**Warum kein In-Memory-Cache:** Railway startet den Prozess bei jedem Deploy neu, ein
Cron-Job kann einen Prozess-Cache nicht befüllen, und die Rechnung ist zu teuer für den
ersten Request nach dem Neustart. Verworfen.

**Warum keine Batch-Historie** (`computedAt` als Batch-Schlüssel wie `matchup_matrix`):
Kein AC verlangt Historie, und die Tabelle bliebe sonst unbegrenzt wachsend. Der
Vollständige-Ersetzung-Ansatz hält sie bei ~6 400 Zeilen konstant, und die Rohdaten
(`tournament_standings`) erlauben jederzeit eine Rekonstruktion. Kosten: die in
`docs/backend-evolution-plan.md` §3.2 skizzierte "Tech-Karten-Drift" (Inklusionsrate über
Wochen) ist damit **nicht** direkt aus dieser Tabelle ableitbar — bewusst vertagt, siehe
§6 offene Frage 1.

**Größenordnung:** ~20 Archetypen × ~80 distinkte Karten × 4 Fenster ≈ **6 400 Zeilen**.

### 3.6 Job, Leseseite und API-Wire-Contract

```ts
// apps/api/src/jobs/computeCardStats.ts (neu)
export interface CardStatsJobResult {
  computedAt: string;             // ISO
  windows: number[];              // die tatsaechlich gerechneten Fenster
  archetypesProcessed: number;
  /** Archetypen mit zu wenigen verwertbaren Listen (< minLists) — bewusst
   *  ausgelassen, NICHT halb geschrieben. */
  archetypesSkipped: number;
  rowsWritten: number;
  /** Standings im Fenster ohne `decklist` ODER ohne `placing`. */
  listsWithoutData: number;
  dryRun: boolean;
}

export async function computeCardStats(
  db: Db,
  opts?: {
    windows?: number[];        // default [7, 14, 21, 28]
    online?: boolean;          // default true
    bo1?: boolean;             // default true
    minLists?: number;         // default 8 — Begruendung unten
    confidence?: number;       // default DEFAULT_CONFIDENCE
    dryRun?: boolean;
  },
): Promise<CardStatsJobResult>;
```

Verbindliches Verfahren:
1. Je Fenster: `tournament_standings` innerJoin `tournaments` mit
   `windowConditions({ days, online, bo1 })` — die **bestehende** Helferfunktion aus
   `routes/meta.ts:68-73`, die dafür exportiert (nicht dupliziert) wird —, zusätzlich
   `decklist IS NOT NULL` und `placing IS NOT NULL`. Selektiert: `archetypeId`, `placing`,
   `decklist`, `tournaments.players`.
2. `placementPercentile(placing, players)`; Zeilen mit `null` fallen raus und zählen in
   `listsWithoutData`.
3. Gruppieren nach `archetypeId`; `OTHER_ARCHETYPE_ID` wird **übersprungen** (Muster
   `routes/meta.ts:268-270`) — "other" ist kein spielbares Deck.
4. Archetypen mit weniger als `minLists` verwertbaren Listen → `archetypesSkipped`,
   **keine Zeile geschrieben**. `minLists = 8` ist eine reine **Job-Ökonomie**-Grenze, kein
   Modell-Cutoff: unterhalb davon wäre jede Karte `insufficient` und die Zeilen wären
   Rauschen in der Tabelle. Das ist zu begründen, nicht stillschweigend zu setzen
   (§6 offene Frage 3).
5. `computeArchetypeCardStats(...)` aufrufen, Ergebnis in Zeilen mappen.
6. **Ein** `computedAt` für den gesamten Lauf. Schreiben in **einer Transaktion je
   (Archetyp, Fenster)**: `DELETE WHERE archetype_id = … AND window_days = …`, dann chunked
   `INSERT` (Muster `syncMeta.ts:200-219`, Chunkgröße 200). Leser sehen dank Postgres-MVCC
   nie einen halb geschriebenen Zustand.
7. `dryRun: true` führt 1–5 aus, schreibt nichts, liefert identische Zähler.

CLI: `node dist/jobs/computeCardStats.js [--dry-run]`, npm-Script
`job:compute-card-stats` (Muster `job:sync-meta`).

```ts
// apps/api/src/lib/cardStatsData.ts (neu)
export interface CardStatsBatch {
  computedAt: Date | null;
  windowDays: number;
  listsAnalyzed: number;
  cards: ArchetypeCardStat[];
}
/** Reads the precomputed rows. NO lazy seed (unlike lib/matchupData.ts:43-56):
 *  computing them on a read would turn one request into a multi-second job.
 *  An empty table yields an honestly empty result with computedAt === null. */
export async function loadCardStats(
  db: Db, archetypeId: string, windowDays: number,
): Promise<CardStatsBatch>;
```

**Wire-Contract (neue Route, rein additiv — keine bestehende Route ändert sich):**

```
GET /api/meta/archetypes/:archetypeId/card-stats?days=<1..180>

200 ->
{
  archetypeId: string,
  // The window actually served: `days` is SNAPPED to the nearest precomputed
  // window (7|14|21|28). Echoed so the UI never claims a window it didn't get.
  windowDays: number,
  online: true,          // scope is fixed in this spec, see section 5
  bo1: true,
  computedAt: string | null,   // null = never computed yet (cold start)
  listsAnalyzed: number,       // 0 on cold start
  cards: ArchetypeCardStat[]   // [] on cold start
}
400 -> { error, issues }   // ungueltiger Slug oder ungueltiges days
```

**Kein 404 bei unbekanntem Archetyp** — 200 mit `cards: []` und `computedAt: null`.
Begründung: Cold-Start/Empty-State (CLAUDE.md §4); die UI muss das Fehlen des Signals
ohnehin tolerieren, ein 404 würde nur einen zusätzlichen Fehlerpfad erzeugen.
Keine Auth (öffentliche Referenzdaten wie alle `/api/meta/*`-Leser), kein Rate-Limit
(reiner DB-Read ohne externen Call — dieselbe Begründung wie bei `/field-analysis`).
**`security-agent` ist trotzdem Pflicht**, weil CLAUDE.md §3 ihn bei *jeder neuen Route*
verlangt.

```ts
// apps/api/src/validation.ts
export const CARD_STATS_WINDOWS = [7, 14, 21, 28] as const;
export const cardStatsQuerySchema = z.object({
  days: z.coerce.number().int()
    .min(META_WINDOW_MIN_DAYS).max(META_WINDOW_MAX_DAYS)
    .default(META_WINDOW_DEFAULT_DAYS),
});
/** Nearest precomputed window; an exact tie goes to the LARGER window (more data). */
export function snapCardStatsWindow(days: number): number;
// 1 -> 7 | 7 -> 7 | 10 -> 7 | 11 -> 14 | 14 -> 14 | 25 -> 28 | 30 -> 28 | 180 -> 28
```
(Bei ganzzahligen Tagen und 7er-Abständen ist ein exakter Gleichstand nicht erreichbar —
die "ties go to larger"-Regel ist Defensive und gehört als Kommentar an die Funktion.)

### 3.7 Web-Contracts: das Delta an den bestehenden Vergleich anhängen

```ts
// apps/web/src/lib/api.ts
export interface ArchetypeCardStatsResponse {
  archetypeId: string;
  windowDays: number;
  online: boolean;
  bo1: boolean;
  computedAt: string | null;
  listsAnalyzed: number;
  cards: ArchetypeCardStat[];
}
export async function fetchArchetypeCardStats(
  archetypeId: string, days?: number,
): Promise<ArchetypeCardStatsResponse>;
// GET /api/meta/archetypes/{archetypeId}/card-stats?days={days}
```

```ts
// apps/web/src/lib/deckComparison.ts — ADDITIV. Bestehende Felder unveraendert.
export interface CardStat {
  // ... unveraendert: name, cardType, frequency, avgCount, topAvgCount,
  //     inUserDeck, userCount ...
  /** Precomputed performance delta from our own DB. undefined = no server data
   *  for this card (different tournament population, cold start, old server). */
  delta?: CardPerformanceDelta;
  /** Signal classification. undefined when `delta` is undefined. */
  tier?: CardSignalTier;
}

export interface ComparisonResult {
  // ... unveraendert ...
  /** Provenance of the delta signal — deliberately SEPARATE from the frequency
   *  numbers above, which come from a different tournament population
   *  (plan section 6, risk 5). null when no delta data was attached. */
  cardStatsSource?: {
    computedAt: string | null;
    windowDays: number;
    listsAnalyzed: number;
  } | null;
}

/**
 * Pure join: attaches precomputed deltas to an existing ComparisonResult by
 * normalised card name. Never removes, reorders or recomputes anything that
 * fetchArchetypeComparison produced — suggestedAdds/suggestedRemoves/
 * countAdjustments keep their existing frequency-based membership. Cards with
 * no matching server row are returned unchanged (delta stays undefined).
 * No I/O, so it is unit-testable without a network.
 */
export function attachCardDeltas(
  result: ComparisonResult,
  stats: ArchetypeCardStat[],
  source: NonNullable<ComparisonResult['cardStatsSource']>,
): ComparisonResult;
```

Verbindliche Eigenschaften von `attachCardDeltas` (Testgrundlage — **das ist der Test, der
das dritte AC absichert**):
- `result.suggestedAdds.map(c => c.name)` ist vorher und nachher **identisch** (Länge,
  Reihenfolge, Inhalt). Dasselbe für `suggestedRemoves`, `countAdjustments`, `cardStats`.
- `frequency`, `avgCount`, `topAvgCount`, `inUserDeck`, `userCount` bleiben **bitgleich**.
- Die Zuordnung läuft über `normalizeCardName` — `'Ultra Ball'` (Client) findet
  `'ultra ball'` (Server).
- Karte ohne Server-Zeile → `delta === undefined`, `tier === undefined`.
- `stats: []` → Ergebnis strukturell identisch zur Eingabe, nur `cardStatsSource` gesetzt.
- Dieselbe `CardStat`-Instanz erscheint in `cardStats` **und** in `suggestedAdds`
  (`deckComparison.ts:247` filtert dasselbe Array) — der Join muss das berücksichtigen, also
  entweder in-place auf denselben Objekten arbeiten oder alle Listen konsistent neu
  aufbauen. **Ein Test muss prüfen, dass das Delta in beiden Listen ankommt.**

```ts
// apps/web/src/store/dashboardStore.ts
interface DashboardState {
  // ... unveraendert ...
  /** Precomputed card deltas for the active deck's archetype. Auto-loaded on
   *  archetype change — the whole point of the server-side precomputation
   *  (spec decision 3: "sofort verfuegbar") is that no click is required. */
  cardStats: ArchetypeCardStat[];
  cardStatsSource: ComparisonResult['cardStatsSource'];
  isLoadingCardStats: boolean;
  loadCardStats: (archetypeSlug: string) => Promise<void>;
}
```
`runDeckComparison` ruft nach `fetchArchetypeComparison` zusätzlich `loadCardStats` auf
(bzw. nutzt den bereits geladenen State) und wendet `attachCardDeltas` an. **Ein Fehler beim
Laden der Deltas darf den Vergleich nicht scheitern lassen** — `catch`, Deltas bleiben leer,
`compareError` bleibt unberührt.

**UI (`DeckComparisonPanel.tsx`) — Datenvertrag, kein fertiges Design.**
Die visuelle Ausgestaltung gehört in die Umsetzung; verbindlich ist nur:
- `CardRow` rendert **beide** Signale nebeneinander: die bestehende `FrequencyBar`
  (`:34`, unverändert) **und** das Delta.
- Das Delta wird über `formatWithInterval` und `confidenceTier` aus
  `apps/web/src/components/meta/confidence.ts` dargestellt — **keine zweite
  Formatierungs- oder Tier-Logik**. (Falls die Helfer dafür aus `components/meta/` an einen
  neutraleren Ort wandern müssen, ist das ein reiner Move ohne Verhaltensänderung.)
- `tier === 'popularityParadox'` bekommt eine **eigene, sichtbar andere** Behandlung:
  eigenes Icon **und** eigenes Textlabel — nicht nur eine Farbe (a11y-Präzedenz aus dem
  Spec-3-Plan §3.6: "Label, nicht nur Farbe").
- `tier === 'insufficient'` zeigt **keine Zahl**, sondern den Text "nicht genug Daten für
  eine Prognose" (zweites AC).
- `cardStatsSource` wird sichtbar ausgewiesen (Fenster + `computedAt`), getrennt von der
  bestehenden `comparison.statsLine` — die beiden Zahlenwelten dürfen nicht als eine
  erscheinen (§6 Risiko 5).

### 3.8 Regel 2 in `useRecommendations` — Anreicherung ohne Rückfall in die Halluzination

```ts
interface RecommendationInput {
  // ... unveraendert ...
  /** Precomputed card deltas for the user's own archetype. Optional: the hook
   *  must still work with null/[] (cold start, older server, no slug set). */
  cardDeltas?: ArchetypeCardStat[] | null;
}
```

Verbindliches Verhalten (Testgrundlage in `useRecommendations.test.ts`):
1. **Ohne `cardDeltas`** (undefined / null / `[]`) ist der von Regel 2 erzeugte
   `DeckRecommendation` **identisch zu heute** — inklusive `id`, `priority`, `category`,
   `dataPoints` und dem `rules.tech.dataHint`-Schluss. Das ist ein Regressionstest, kein
   Nice-to-have.
2. **Mit `cardDeltas`** wird an `reasoning` ein zusätzlicher Satz angehängt, der bis zu
   **zwei** Karten benennt, die *alle* folgenden Bedingungen erfüllen:
   - `tier === 'hiddenGem'` **oder** `tier === 'confirmed'` (also `significant` und
     `deltaPp > 0`),
   - die Karte ist **nicht** in `deckCards` (nach `normalizeCardName`),
   - sortiert nach `deltaPp` desc, bei Gleichstand nach `inclusionPct` desc.
3. **Bindende Formulierungsgrenze** (die Leitplanke aus `useRecommendations.ts:13-19`):
   Der Satz sagt **nicht**, dass die Karte gegen *diesen* Gegner hilft. Er sagt: "In den
   Turnierlisten deines Archetyps korrelieren X (+12 pp, 95 % 4–19) und Y mit besseren
   Platzierungen; du spielst beide nicht." Die Aussage ist **archetypweit und korrelativ**,
   nie matchup-spezifisch und nie kausal. Ein Test muss prüfen, dass der Gegner-Archetyp
   **nicht** im Delta-Satz vorkommt.
4. Sind keine passenden Karten vorhanden → der Zusatzsatz entfällt, Fall 1 gilt.
5. `priority`, `dataPoints` und die Sortierung der Empfehlungen ändern sich **nicht** —
   das Delta ist eine Begründungsverbesserung, keine neue Regel. Die Zahl der Regeln
   bleibt 14 (die Spec sagt "stärken, nicht ersetzen").

### 3.9 Neue i18n-Keys (`recommendations.json`, de + en)

```
comparison.delta.label            "Platzierungs-Delta"
comparison.delta.value            "{{delta}} pp ({{low}}-{{high}} %)"
comparison.delta.neutral          "kein messbarer Unterschied"
comparison.delta.insufficient     "nicht genug Daten fuer eine Prognose"
comparison.delta.paradox          "haeufig gespielt, aber ohne messbaren Platzierungsvorteil"
comparison.delta.hiddenGem        "selten gespielt, korreliert aber mit besseren Platzierungen"
comparison.delta.confirmed        "haeufig gespielt und mit besseren Platzierungen korreliert"
comparison.delta.discouraged      "korreliert mit schlechteren Platzierungen"
comparison.delta.correlationNote  Korrelation, keine Ursache (Pflichttext, siehe 6/Risiko 2)
comparison.delta.source           "aus {{lists}} Turnierlisten der letzten {{days}} Tage
                                   (Stand {{computedAt}})"
comparison.delta.sourceHint       "Andere Datenquelle als die Haeufigkeit oben."
rules.tech.deltaHint              Regel-2-Zusatzsatz (3.8 — ohne Gegner-Archetyp!)
```

---

## 4. Umsetzungsreihenfolge (test-first)

Jede Verhaltens-Scheibe: **erst** der rote Test (`tester`), **dann** die Implementierung
(`implementer`). Nach jedem Schritt Root-Gates (`npm run typecheck`, `npm run lint`,
`npm run test`) und ein eigener Commit. Slice A ist Voraussetzung für B; B ist Voraussetzung
für C; D (Regel 2) hängt nur an A und kann parallel zu C laufen.

**Schritt 0 — Spec-Nachtrag (kein Code, kein Test)**

0. `specs/recommendation-to-prognosis.md` um einen Block "## Entscheidungen (bestätigt
   2026-09-02)" ergänzen: die drei Antworten aus §0.1 **und** die Klarstellung, dass die
   User Story "+2 bis +5 pp Field-WR" durch Entscheidung 1 zu "Prozentpunkte
   Platzierungs-Überlegenheit" wird.
   → `docs(spec): record the three resolved questions for spec 5`

**Slice A — Statistik-Kern in `@pokekon/shared`**

1. **Rot:** `packages/shared/src/cardPerformance.test.ts` gegen §3.1/§3.2 —
   `normalizeCardName`, komplette `placementPercentile`-Tabelle inkl. aller `null`-Fälle,
   `mannWhitneyTheta`-Tabelle, `rankEffectiveSampleSize`-Tabelle inkl. der
   Beschränktheits-Property.
2. **Grün:** die vier Funktionen in `packages/shared/src/cardPerformance.ts` +
   Re-Export in `index.ts`. Die Herleitung aus §3.0 als Kommentar an
   `rankEffectiveSampleSize` — ohne sie ist die Konstante 3 nicht nachvollziehbar.
   → `test(shared): pin placement percentile and rank comparison primitives`
   → `feat(shared): add rank-based card performance primitives`
3. **Rot:** Tests für `cardPerformanceDelta` (§3.3, alle sieben Zeilen + Antisymmetrie +
   Monotonie + `lowPct <= pct <= highPct` + der Spec-3-Verkettungstest Zeile D).
4. **Grün:** `cardPerformanceDelta` — **ruft `wilsonInterval` auf**, implementiert es nicht neu.
   → `feat(shared): add a confidence-aware card performance delta`
5. **Rot:** Tests für `classifyCardSignal` (alle sechs Regeln, **insbesondere Regel 1 vor
   Regel 4**) und `computeArchetypeCardStats` (§3.4-Tabelle vollständig, inkl.
   Doppel-Printing-Fall und 50-%-Grenzfall).
6. **Grün:** beide Funktionen in derselben Datei.
   → `feat(shared): aggregate per-archetype card stats with signal tiers`

**Slice B — Persistenz, Job und Route**

7. **Rot:** `apps/api/src/api.test.ts`, neuer `describe('computeCardStats job')`:
   Turnier + Standings mit `decklist`/`placing` seeden; Lauf schreibt Zeilen mit erwartetem
   `inclusionPct`/`deltaPp`/`tier`; Standing ohne `placing` → `listsWithoutData`;
   Archetyp `'other'` wird übersprungen; Archetyp unter `minLists` → `archetypesSkipped`
   und **null** Zeilen; `dryRun: true` → identische Zähler, Tabelle leer; zweiter Lauf
   **ersetzt** statt zu duplizieren (Unique-Index hält).
8. **Grün:** `schema.ts` (`archetypeCardStats`) + `npm run db:generate -w @pokekon/api`
   (Migration `0013`) + `apps/api/src/jobs/computeCardStats.ts` + CLI-Entry + npm-Script;
   `windowConditions` in `routes/meta.ts` exportieren.
   → `feat(api): precompute per-archetype card performance deltas`
9. **Rot:** `apps/api/src/api.test.ts`, neuer `describe('GET /api/meta/archetypes/:id/card-stats')`:
   nach einem Job-Lauf liefert die Route `cards[].delta` und `computedAt`; unbekannter
   Archetyp → **200** mit `cards: []`/`computedAt: null`; ungültiger Slug → 400;
   `days=30` → `windowDays === 28`; `days=10` → `windowDays === 7`; `days=999` → 400.
10. **Grün:** `validation.ts` (`cardStatsQuerySchema`, `snapCardStatsWindow`),
    `lib/cardStatsData.ts`, Route in `routes/meta.ts`.
    → `feat(api): expose precomputed card deltas per archetype`

**Slice C — Web: beide Signale nebeneinander**

11. **Rot:** `apps/web/src/lib/deckComparison.test.ts` gegen §3.7 — vor allem die
    Invarianz-Assertions ("`suggestedAdds` identisch", "`frequency` bitgleich") und der
    Fall "Delta erscheint in `cardStats` **und** in `suggestedAdds`".
12. **Grün:** `CardStat`/`ComparisonResult` erweitern + `attachCardDeltas`;
    `apps/web/src/lib/api.ts` um `fetchArchetypeCardStats`.
    → `feat(web): attach precomputed card deltas to the list comparison`
13. **Store + Panel:** `dashboardStore` (`cardStats`, `loadCardStats`, Auto-Load beim
    Archetyp-Wechsel, fehlertoleranter Join in `runDeckComparison`);
    `DeckComparisonPanel` rendert beide Signale, eigene Darstellung für
    `popularityParadox` und `insufficient`; i18n de+en.
    → `feat(web): show the performance delta next to the copy frequency`

**Slice D — Regel 2**

14. **Rot:** `apps/web/src/hooks/useRecommendations.test.ts` gegen §3.8 — der
    Regressionstest "ohne `cardDeltas` unverändert", der Anreicherungsfall, der
    "Gegner-Archetyp kommt im Delta-Satz nicht vor"-Test, der Fall "keine passende Karte".
15. **Grün:** `useRecommendations.ts` (+ Durchreichen in `RecommendationsPage.tsx`), i18n.
    → `feat(web): back rule 2 with measured card deltas instead of a bare pointer`

**Abschluss**

16. Doku-Schritt (alle Dateien aus §2, Block "Doku") — inklusive der Umsetzungs-Markierung
    in `docs/backend-evolution-plan.md` §5.2 und der belegten Einschränkung
    "zwei Turnier-Populationen" in `docs/features.md` §9.
    → `docs: describe card performance deltas and the new precomputation job`
17. **Ein Dry-Run gegen echte Produktionsdaten** (§5) — Zähler und Laufzeit in der PR
    dokumentieren, `MAX_USABLE_BAND_PP` und `minLists` bestätigen oder anpassen.
18. Volle Gates + `security-agent` (**neue Route**, CLAUDE.md §3) + `code-review-agent`
    (Review auch gegen die Spec-AC), dann PR.

---

## 5. Rollout, Migration & Rückwärtskompatibilität

**Reihenfolge auf Railway (verbindlich):**
1. PR mergen → `preDeployCommand` führt `migrate:deploy` aus → Migration `0013` legt
   `archetype_card_stats` an. Rein additiv, für den **alten** laufenden Code unsichtbar →
   auch dann sicher, wenn sie Sekunden vor dem Code-Swap läuft.
2. Neuer Code startet. Die Tabelle ist **leer**: die Route antwortet mit
   `computedAt: null` / `cards: []`, die UI zeigt nur das bestehende Häufigkeits-Signal.
   **Das ist der reguläre Cold-Start-Zustand, kein Fehler.**
3. **Dry-Run zuerst:** `node dist/jobs/computeCardStats.js --dry-run` in der Railway-Shell.
   Zähler (`archetypesProcessed`, `archetypesSkipped`, `listsWithoutData`, `rowsWritten`)
   **und Laufzeit** prüfen und im PR/Issue festhalten. Erst danach der echte Lauf.
4. Danach als **eigener Cron** einrichten, zeitlich **nach** dem `syncMeta`-Cron (der Job
   liest, was der Sync geschrieben hat). Bewusst **nicht** an `POST /api/meta/sync`
   gehängt: die Route ist rate-limitiert und nutzer-ausgelöst; ein mehrsekündiger Zusatzjob
   dort würde ihre Latenz verändern. Folge: frisch gesyncte Turniere schlagen erst mit dem
   nächsten Card-Stats-Lauf durch — deshalb ist `computedAt` Teil der Response und muss in
   der UI sichtbar sein. Siehe §6 offene Frage 4.

**Umfang der Vorberechnung (bewusste Einschränkung):**
Gerechnet wird nur für den **Default-Scope** `online=true, bo1=true` und die vier Fenster
7/14/21/28. Alle 16 Scope-Kombinationen × 4 Fenster wären 16-fache Rechenzeit und 16-fach
Zeilen für einen Nutzungsfall, den es nicht gibt (`docs/features.md` §2: der Meta-Fokus ist
explizit online-Bo1). Die Route nimmt deshalb **keine** `online`/`bo1`-Parameter entgegen
und gibt den festen Scope in der Response zurück. Das gehört in `docs/features.md` §9.

**Rückwärtskompatibilität**
- **Wire additiv.** Ein alter Web-Client kennt die Route nicht und ruft sie nie auf. Ein
  alter Server liefert 404 — deshalb fängt `loadCardStats` im Store jeden Fehler ab und
  lässt die Deltas leer; `attachCardDeltas` wird dann gar nicht erst aufgerufen. Das deckt
  das Deploy-Fenster ab, in dem `apps/api` (das das Web-Bundle selbst ausliefert)
  getauscht wird.
- **`CardStat.delta`/`tier` sind optional.** Jede bestehende Stelle, die `CardStat`
  konsumiert (`DeckComparisonPanel.tsx:18-42`), funktioniert unverändert weiter.
- **Kein Datenverlust möglich.** Der Job liest nur; er schreibt ausschließlich in die neue
  Tabelle. `tournament_standings` wird nicht angefasst.
- **Rollback:** Code-Revert genügt. Die Tabelle bleibt ungenutzt liegen; eine
  Down-Migration ist nicht nötig (und wäre ein `DROP TABLE` auf reine Cache-Daten,
  jederzeit neu berechenbar).

---

## 6. Risiken & offene Fragen

**Risiken**

1. **Selektionsverzerrung der Datengrundlage — das größte inhaltliche Risiko.**
   `tournament_standings.decklist` ist nur gefüllt, wenn der Pilot eine Liste veröffentlicht
   hat. Ob Limitless bzw. die Turnierorganisation das systematisch häufiger bei guten
   Platzierungen tut, ist **Unbekannt** (nicht aus dem Code belegbar). Falls ja, ist die
   Perzentil-Verteilung *beider* Gruppen nach oben verschoben — der **Vergleich** zwischen
   ihnen bleibt aber valide, solange die Veröffentlichungsrate nicht *von der Karte*
   abhängt. Genau das ist die tragende Annahme und gehört als Kommentar an
   `computeArchetypeCardStats` und in `docs/features.md` §9. **Messbar machen:** Der
   Dry-Run (§4 Schritt 17) soll ausgeben, welcher Anteil der Standings je Archetyp
   überhaupt eine Liste hat.
2. **Korrelation ist nicht Kausalität, und die Verwechslung ist hier besonders verführerisch.**
   Eine Karte kann mit guten Platzierungen korrelieren, weil erfahrene Piloten dieselbe
   Listenvariante spielen. Die Zahl misst "Listen mit X platzierten sich besser", nicht
   "X macht besser". Gegenmaßnahme: `comparison.delta.correlationNote` ist **Pflichttext**
   an jeder Delta-Anzeige, nicht optional, und der Regel-2-Satz (§3.8 Punkt 3) darf keine
   Kausalsprache verwenden.
3. **Kollinearität zwischen Karten.** Karten kommen in Paketen (wer Karte A spielt, spielt
   meist auch B). Das Delta jeder Einzelkarte trägt dann den Effekt des ganzen Pakets. Eine
   saubere Trennung bräuchte ein multivariates Modell (Regression über Listen-Features) —
   ausdrücklich Phase-4-Material aus `docs/backend-evolution-plan.md` §6.3, nicht diese
   Spec. Muss aber in `docs/data-types.md` stehen, damit niemand die Deltas addiert.
4. **Mehrfachvergleiche.** Bei ~80 Karten je Archetyp und einem 95-%-Niveau sind rein
   zufällig ~4 "signifikante" Karten je Archetyp zu erwarten. Bewusst **keine**
   Bonferroni-/FDR-Korrektur: sie würde bei diesen Stichprobengrößen praktisch jedes Signal
   auslöschen und wäre der harte Cutoff durch die Hintertür. Stattdessen: die Zahl ist als
   Hinweis positioniert, nicht als Test, und `MAX_USABLE_BAND_PP` filtert die
   unbrauchbarsten Fälle. **Das gehört ehrlich in `docs/features.md` §9** — nicht
   verschweigen.
5. **Zwei Turnier-Populationen nebeneinander.** `frequency` kommt aus dem Client-Fetch
   (8 größte Turniere, alle Scopes, `deckComparison.ts:127-130`), `delta` aus unserer DB
   (online-Bo1, 7–28 Tage). Für dieselbe Karte können `frequency` und `inclusionPct`
   sichtbar auseinanderlaufen — verstärkt durch den in §0.3 belegten Mehrfachzähl-Pfad.
   **Gegenmaßnahme:** beide Herkünfte werden in der UI getrennt ausgewiesen (§3.7), und
   `inclusionPct` treibt **keine** Schwelle. Der saubere Ausweg wäre,
   `fetchArchetypeComparison` ganz auf die Server-Route umzustellen
   (`docs/backend-evolution-plan.md` §6.1 sieht dafür `routes/comparison.ts` vor) — das
   ändert aber die Eingabedaten der 55/20-Schwellen und ist damit **Spec-Out-of-Scope**.
   Siehe offene Frage 5.
6. **Performance des Jobs.** Grobe Abschätzung: 28-Tage-Fenster ungefähr einige tausend
   Standings mit jsonb-Decklisten (wenige MB). θ naiv ist `O(n1*n2)` je Karte; bei 300
   Listen und 80 Karten sind das ~1,8 Mio. Vergleiche je Archetyp und Fenster, also
   ~150 Mio. über 20 Archetypen mal 4 Fenster. In Node sind das Sekunden, nicht Minuten —
   aber **geschätzt, nicht gemessen**. Der Dry-Run (§4 Schritt 17) muss Laufzeit und
   Speicher belegen; liegt es über ~60 s, wird auf die `O(n log n)`-Rangsummen-Variante
   umgestellt (identischer Vertrag, reine Implementierungsänderung).
7. **Performance der Route.** Ein indizierter Lookup auf `(archetype_id, window_days)` mit
   ~80 Zeilen Ergebnis. Keine Aggregation zur Laufzeit, kein externer Call. Trotzdem im
   PGlite-Harness die Response-Zeit notieren (dieselbe Praxis wie Spec 2 und 3).
8. **Bewusst nicht umgesetzt** (damit es niemand für Vergessen hält): kein `topAvgCount`
   aus DB-Daten (bleibt beim Limitless-Pfad); kein Delta auf *Kopienzahl*-Ebene (2 vs. 3
   Kopien wäre eine eigene, ordinale Analyse — die Deltas hängen an "Karte drin / nicht
   drin"); keine Historie bzw. Tech-Karten-Drift; keine Nutzung von `matchResults`
   (Spec 6); keine Änderung an `fieldWinRate.ts`.

**Entscheidungen (in diesem Plan getroffen — verbindlich, aber umkehrbar; bitte
widersprechen, wenn eine davon nicht passt)**

1. **Effektmaß = Mann-Whitney-θ, nicht Mittelwert-Differenz der Perzentile.** Begründung
   vollständig in §3.0. Konsequenz: `deltaPp` bedeutet "Prozentpunkte Überlegenheitsrate",
   **nicht** "Prozentpunkte Field-WR" (§0.1, zweite Diskrepanz).
2. **Wilson wird über `n_eff = 3·n1·n2/(n1+n2+1)` angewandt**, hergeleitet aus der exakten
   Mann-Whitney-Nullvarianz. Die vorhandene `wilsonInterval`-Implementierung wird
   wiederverwendet; es entsteht **keine** zweite Wilson-Formel im Repo.
3. **"Nicht genug Daten" ist eine abgeleitete Anzeige, kein Cutoff.** `delta === null` nur
   bei mathematischer Undefiniertheit (leere Gruppe); sonst immer eine Zahl mit Band, und
   `MAX_USABLE_BAND_PP` entscheidet über die *Darstellung*. Das erfüllt das zweite AC
   ("kein neuer harter Cutoff ohne Unsicherheitsangabe").
4. **`minLists = 8` im Job ist Ökonomie, nicht Modell.** Unter 8 Listen wäre jede Karte
   `insufficient`; die Zeilen wären Rauschen in der Tabelle. Auf der *Modell*-Ebene gibt es
   weiterhin keinen Cutoff.
5. **Neue Tabelle statt Materialized View** — Begründung in §3.5, ausdrücklich gegen
   CLAUDE.md §6 abgewogen, nicht übergangen.
6. **Vollständiger Ersetzungs-Schreibzugriff statt Batch-Historie** — bounded Tabellengröße;
   Historie ist aus `tournament_standings` jederzeit rekonstruierbar.
7. **Die 55/20/50-Schwellen und `limitlessFetch` in `deckComparison.ts` bleiben
   buchstäblich unverändert.** Der Join ist additiv (`attachCardDeltas`), und ein Test
   sichert die Invarianz ab (§3.7).
8. **`HIGH_INCLUSION_PCT`/`LOW_INCLUSION_PCT` werden als benannte Konstanten in
   `@pokekon/shared` gespiegelt**, damit die Tier-Klassifikation und die Filter nicht
   auseinanderdriften. Die **Werte** ändern sich nicht — das ist eine Benennung, keine
   Logikänderung, und damit nicht Out-of-Scope.

**Offene Fragen (echte — vor Slice B zu beantworten, blockieren Slice A nicht)**

1. **Batch-Historie doch jetzt?** Entscheidung 6 verwirft sie. Für die in
   `docs/backend-evolution-plan.md` §3.2 skizzierte "Tech-Karten-Drift" (Inklusionsrate über
   Wochen als Frühindikator für Meta-Anpassung) wäre sie die natürliche Grundlage.
   **Empfehlung: nicht jetzt** — YAGNI, und die Rohdaten bleiben. Nachrüsten wäre später ein
   zusätzlicher Spaltenwert im Unique-Index, kein Umbau. Widersprich, wenn die Drift schon
   Teil deiner Spec-6/7-Planung ist.
2. **Einmalige Bootstrap-Gegenprobe?** Vorschlag: im Rahmen von §4 Schritt 17 **einmal und
   wegwerfbar** (Skript in `scripts/`, nicht im Produktionspfad) für 5–10 reale
   Karten-Gruppen ein Bootstrap-CI auf θ rechnen und mit dem Wilson-`n_eff`-Band
   vergleichen. Kostet ~1 h, belegt oder widerlegt die Kalibrierung aus §3.0 empirisch.
   Blockiert die Umsetzung nicht, wäre aber ein starkes Argument in der PR.
3. **`MAX_USABLE_BAND_PP = 40` und `minLists = 8` sind gesetzt, aber nicht datenbelegt.**
   Gleiche Situation wie bei Spec 3s Tier-Grenzen (10/20/35 pp), die dort ebenfalls als
   offene Frage stehen. Vor dem Merge einmal die reale Verteilung der Bandbreiten über alle
   Archetypen ausgeben (Dry-Run) und die Grenzen ggf. auf Quartile setzen. Falls "fast alles
   `insufficient`" herauskommt, ist das ein **echtes Ergebnis** (die Datenlage trägt die
   Prognose noch nicht) und muss ehrlich so berichtet werden — nicht durch Aufweichen der
   Grenze wegdefiniert.
4. **Wer stößt den Job an?** Der Plan setzt einen **separaten Railway-Cron nach dem
   Meta-Sync**. Alternative: `runMetaSync` ruft ihn am Ende selbst auf (frischere Daten,
   aber `POST /api/meta/sync` würde spürbar langsamer). **Empfehlung: separater Cron**,
   `computedAt` in der UI sichtbar. Prozessentscheidung, muss vor Slice B stehen.
5. **Soll `fetchArchetypeComparison` mittelfristig ganz auf die Server-Route wandern?**
   Das würde `corsproxy.io` aus dem Bundle entfernen, beide Signale auf **eine**
   Turnier-Population stellen (Risiko 5 verschwindet) und
   `docs/backend-evolution-plan.md` §6.1 (`routes/comparison.ts`) erfüllen. Es ändert aber
   die Eingabedaten der 55/20-Schwellen und ist damit **in dieser Spec ausgeschlossen**.
   **Empfehlung: als eigene kleine Spec zwischen 5 und 7 einplanen**, nicht hier
   dranhängen. Bitte bestätigen, damit es nicht vergessen wird.
6. **Der in §0.3 belegte Mehrfachzähl-Pfad in `deckComparison.ts:200-213`** (Häufigkeit
   über 100 % möglich, wenn eine Liste dieselbe Karte in zwei Printings führt): separater
   `fix(web)`-Commit im selben PR, eigener PR, oder bewusst liegen lassen, weil es die
   Häufigkeitslogik berührt (Out of Scope)? **Empfehlung: eigener kleiner `fix`-PR vor
   diesem hier** — dann sind die beiden Signale wenigstens methodisch gleich gezählt.

---

## 7. Definition of Done

Die Spec-AC sind wörtlich abgebildet; jedes AC nennt den Schritt aus §4, der es erfüllt.

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` (Repo-Root) grün — ehrlich
      berichtet, nichts übersprungen, nichts geskippt.
- [ ] **AC 1** ("neue Funktion in `packages/shared`, bildet zwei Gruppen, berechnet
      Performance-Unterschied"): `packages/shared/src/cardPerformance.ts` existiert, ist
      I/O-frei, und `computeArchetypeCardStats` bildet für jede Karte die Gruppen
      mit/ohne — belegt durch die Tests aus §4 Schritt 1/3/5. Die gewählte Metrik
      (Platzierungs-Perzentil → Mann-Whitney-θ) ist in §3.0 hergeleitet und im
      Funktionskommentar wiederholt.
- [ ] **AC 2** ("zu wenige Listen → keine falsch-präzise Zahl, aber **kein** neuer harter
      Cutoff"): `delta === null` **nur** bei leerer Gruppe; sonst immer Zahl + Band;
      `tier === 'insufficient'` leitet sich aus `widthPct > MAX_USABLE_BAND_PP` ab, also aus
      der Unsicherheit selbst. Test: Fall A (10/10, θ̂ = 0,70) liefert eine Zahl **und**
      `significant === false`, nicht `null`.
- [ ] **AC 3** ("`suggestedAdds`/`suggestedRemoves`/`countAdjustments` ergänzt, ohne die
      Häufigkeitsanzeige zu entfernen — beide Signale nebeneinander"): der Invarianz-Test
      aus §3.7 ist grün (Listenzusammensetzung und alle Häufigkeitsfelder bitgleich), und
      `DeckComparisonPanel` rendert `FrequencyBar` **und** Delta. Das Diff auf
      `deckComparison.ts:247-257` ist leer.
- [ ] **AC 4** ("Regel 2 verweist auf das neue Delta, wo verfügbar"): §3.8 umgesetzt, inkl.
      des Regressionstests "ohne `cardDeltas` unverändert" und des Tests "Gegner-Archetyp
      kommt im Delta-Satz nicht vor". Die Zahl der Regeln bleibt 14.
- [ ] **AC 5** ("Popularitäts-Paradox sichtbar **anders** dargestellt"): `classifyCardSignal`
      liefert `'popularityParadox'` für den Fall "häufig + kein/negatives Delta" (Regel 4),
      Regel 1 hat Vorrang; die UI gibt ihm **Icon und Textlabel**, nicht nur eine Farbe.
- [ ] Genau **eine** Wilson-Implementierung im Repo: `cardPerformance.ts` enthält keine
      zweite Intervallrechnung, sondern ruft `wilsonInterval` auf (per Grep über
      `packages` und `apps` belegen).
- [ ] Der Konsistenz-Test "`rankEffectiveSampleSize(1,1) = 1` → `wilsonInterval(1,0,0)` →
      `[20.6549, 100]`" verkettet die neue Rechnung nachweisbar mit Spec 3s Golden-Werten.
- [ ] Neue Tests: Happy Path **und** je ein Fehler-/Randfall pro Slice
      (leere Gruppe → `null`; `placing = null` → Perzentil `null`; θ̂ = 1 → Band kollabiert
      nicht; unbekannter Archetyp → 200 mit leeren Karten; `days = 999` → 400;
      Delta-Fetch schlägt fehl → Vergleich funktioniert trotzdem).
- [ ] Migration `0013` **generiert** (nicht handgeschrieben), im PGlite-Harness angewandt,
      rein additiv, ohne Datenverlust; Rollback-Weg in §5 beschrieben.
- [ ] Job zuerst als **Dry-Run** gelaufen; Zähler **und Laufzeit** in der PR dokumentiert;
      danach echter Lauf. `MAX_USABLE_BAND_PP` und `minLists` daraufhin bestätigt oder
      angepasst.
- [ ] Anteil der Standings mit veröffentlichter Liste je Archetyp gemessen und in der PR
      notiert (Risiko 1).
- [ ] Response-Zeit `/api/meta/archetypes/:id/card-stats` im PGlite-Harness notiert.
- [ ] Cold-Start/Empty-State geprüft: leere Tabelle, Archetyp ohne Listen, Deck ohne
      `archetype`-Slug, Server ohne die Route (alter Deploy), `cardDeltas: []` im Hook.
- [ ] Wire-Kompatibilität: neue Route ist additiv, `CardStat.delta`/`tier` optional,
      ein Fehler beim Delta-Fetch bricht den bestehenden Vergleich nicht.
- [ ] **Korrelations-Hinweis ist Pflichttext** an jeder Delta-Anzeige und im
      Regel-2-Satz — kein Ort, an dem eine Kausalaussage entsteht (Risiko 2).
- [ ] Keine Secrets im Diff, keine neue Dependency, kein kostenpflichtiger Dienst
      (CLAUDE.md §2.2), kein neuer externer API-Call (der Job liest nur die eigene DB).
- [ ] `security-agent` gelaufen (**neue Route**, CLAUDE.md §3) und `code-review-agent`;
      Review auch gegen die Spec-Akzeptanzkriterien.
- [ ] Doku aktualisiert: `specs/recommendation-to-prognosis.md` (Entscheidungsblock),
      `docs/features.md` (§9, §10, neuer §17), `docs/database.md`, `docs/data-types.md`,
      `docs/data-flow.md`, `docs/backend-evolution-plan.md` §5.2.
- [ ] Die drei dokumentationspflichtigen Näherungen bzw. Annahmen aus §3.0 (Bindungen,
      Kalibrierung am Nullpunkt, Unabhängigkeit/Kausalität) stehen als Kommentar an der
      Funktion **und** in `docs/data-types.md`.
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body.
