# Plan: Spec 1 – Fundament-Fixes am Cluster-Ranking

> **Bindende Grundlage:** [`specs/archetype-list-foundation.md`](../../specs/archetype-list-foundation.md)
> (Status laut Spec: Entwurf, wartet auf Freigabe). Rahmen: [`specs/archetype-coach-vision.md`](../../specs/archetype-coach-vision.md) §9.
> **Code-Stand der Verifikation:** Branch `feat/ptcgl-export` @ `c2ce751` (PR #100 offen). Die Spec wurde gegen
> `baebcc5` (= `origin/main`) geschrieben.
> **Vorgehen:** Zwei-Agenten-TDD je Scheibe (`tester` schreibt rote Tests aus den ACs → `implementer` macht sie
> grün → Gates → Commit). Eine Spec = ein Branch = ein PR (Vision §9.2.1).
> **Plan-Status:** freigegeben 2026-09-24 mit den Defaults E1–E4; umgesetzt auf `feat/archetype-list-foundation` (von `main` @ `a1d0dc8`).

---

## Kontext

Die als „beste Liste" angezeigte Deckliste eines Archetyps ist heute weder reproduzierbar noch typisch:
Die Standings kommen ohne `ORDER BY` aus PostgreSQL, `clusterDecklists` ist greedy und damit
reihenfolgeabhängig, der Repräsentant ist das zuerst gesehene Mitglied, `rankClusters` hat keinen Tie-Break,
und der Personal Prior bezieht sich auf den falschen Cluster (Spec §1). Ziel (Spec §2): gleiche Daten ⇒
immer dieselben Cluster, dieselbe Rangfolge, derselbe Repräsentant; der Repräsentant ist der **Medoid**.

Übernommene Default-Entscheidungen (Spec §6, nicht verhandelt):
1. `seed` bleibt **intern** und erscheint nicht in der API-Antwort.
2. Keine „Typizität" des Repräsentanten in Spec 1 (kommt mit Spec 5).

Out of Scope (Spec §5): keine neue Gewichtung, keine Konsensliste, keine Änderung an
`DEFAULT_MIN_OVERLAP_RATIO`, kein Regel-Validator.

---

## 0. Beleg-Verifikation (Spec gegen aktuellen Code)

`git diff baebcc5 -- packages/shared/src/decklistClustering.ts packages/shared/src/clusterRanking.ts
apps/api/src/lib/archetypeSynthesisFacts.ts apps/api/src/routes/analysis.ts` ist **leer**: Der TCG-Live-Export
und die Doku-Commits auf diesem Branch haben keine der vier Kerndateien berührt. Alle Zeilennummern der Spec
gelten deshalb unverändert, bis auf die unten markierten Präzisierungen.

| Spec-Angabe | Aktueller Code | Status |
|---|---|---|
| `archetypeSynthesisFacts.ts:103-122` Standings-Query ohne `orderBy` | Query `:103-122`, kein `orderBy` | ✅ Belegt |
| `analysis.ts:542-622` Turnier-Pfad ohne `orderBy` | Route `:542-639`; die Archetyp-Standings-Query liegt bei `:567-585`, die Feld-Query bei `:560-566`, `clusterDecklists` bei `:622`. Beide Queries ohne `orderBy` | ✅ Belegt (präzisiert) |
| `decklistClustering.ts:118-143` greedy, „erster passender Cluster" | Schleife `:118-145` (`clusters.find(...)` bei `:119-121`) | ✅ Belegt (Ende der Schleife `:145`, nicht `:143`) |
| `decklistClustering.ts:85` Feld `representative` | `:85` (Doc-Kommentar `:82-84`) | ✅ Belegt |
| `decklistClustering.ts:136` Repräsentant gesetzt | `:136` `representative: s.decklist` | ✅ Belegt |
| `decklistClustering.ts:16` `DEFAULT_MIN_OVERLAP_RATIO = 55/60` | `:16` | ✅ Belegt |
| `clusterRanking.ts:64` Sort nur nach `winRateLowerBoundPct` | `:64` | ✅ Belegt |
| `archetypeSynthesisFacts.ts:142-150` Re-Ranking mit lokalem Feld | `:142-151` | ✅ Belegt |
| `archetypeSynthesisFacts.ts:154` `rankedClusters[0]` statt `finalClusters[0]` | `:154` `const topCluster = rankedClusters[0];` | ✅ Belegt |
| AC 6: „15 Test-Stellen referenzieren `representative`" | **17 Treffer in 6 Testdateien** (davon 1 nur im Testnamen, `deckSynthesis.test.ts:1995`); Liste in §6.1 | ⚠️ Abweichung (Zählung) |
| §3.1 Sortierschlüssel `placementPercentile` | `ClusterableStanding` (`decklistClustering.ts:66-79`) hat **kein** Feld `placementPercentile`, nur `placing` + `totalPlayers`. Der Schlüssel muss per `placementPercentile(placing, totalPlayers)` (`cardPerformance.ts:62-69`) abgeleitet werden | ⚠️ Präzisierung |
| AC 1 „deterministischer Seed über `deterministicRandom.ts`" | `mulberry32(seed)` in `packages/shared/src/deterministicRandom.ts:12-21`, exportiert über `index.ts:19`. Es gibt **keinen** Shuffle-Helper im Repo | ✅ Belegt; Shuffle wird test-lokal gebaut |
| AC 7 UI-Komponenten lesen `representative` | `ArchetypeRecommendationPanel.tsx:74,144,153,157,161`, `TournamentBestListPanel.tsx:33,100,109,113,117` (die Export-Zeilen `:144`/`:100` kamen mit dem TCG-Live-Export dazu) | ✅ Belegt |

Belege aus der Vision (nur stichprobenartig, nicht Teil dieser Spec):
- `schema.ts:303-309` (Online-Bo1-Filter-Kommentar) liegt jetzt bei **`:311-317`** (+8 Zeilen durch die PTCGL-Print-Spalten). ⚠️ veraltet.
- Vision §4 „Export ins TCG-Live-Format: nicht vorhanden" ist durch `packages/shared/src/deckExport.ts` überholt (Vision §5/§6 sagen das bereits). ⚠️ veraltet, nur Doku.
- `dashboardStore.ts:64`, `syncMeta.ts:43`, `schema.ts:144`, `season.ts:6`, `simplex.ts:89`, `apps/api/package.json:17-20`, `meta.ts:320`: ✅ unverändert.

### Weitere für den Plan relevante Fakten (gelesen)

- ✅ `computeDecklistOverlap` (`decklistClustering.ts:44-58`) baut bei **jedem** Aufruf beide Karten-Maps neu (`cardCountMap`, `:29-36`).
- ✅ `rankClusters` (`clusterRanking.ts:51-66`) verlässt sich auf die Stabilität von `Array.prototype.sort`. Bei Gleichstand gewinnt die Eingabereihenfolge.
- ✅ `reorderClustersByFieldScore` (`clusterFieldScore.ts:86-105`) hat bei gleichem `fieldWinRateLowPct` ebenfalls keinen expliziten Tie-Break. Es gilt die stabile Eingabereihenfolge, also die Wilson-Rangfolge. Mit S1+S3 ist diese Eingabe deterministisch, deshalb **keine Änderung nötig** (Out of Scope).
- ✅ **Fakt-IDs hängen am ersten Mitglied:** `factsFromClusterRanking` bildet `cluster.${memberStandingIds[0]}` (`deckSynthesis.ts:1020`), das Label kommt aus `representative.pokemon.slice(0, 2)` (`deckSynthesis.ts:997-1000`). Beides fließt in `synthesisInputHash` (`analysis.ts:414-419`, POST-Pfad `:480`), siehe Risiken.
- ✅ **API gibt Cluster-Objekte roh aus:** `clusters: factSet.rankedClusters` (`analysis.ts:430`) und `clusters: finalClusters` (`analysis.ts:633`). Jedes neue Feld auf `DecklistCluster`/`RankedCluster` landet also automatisch im JSON.
- ✅ **Web nutzt den Shared-Typ direkt:** `RankedCluster` wird in `apps/web/src/lib/api.ts:13,853,981` und beiden Panels importiert. Fünf Test-Fixtures bauen `RankedCluster`/`DecklistCluster` als Objektliteral (`clusterRanking.test.ts:9-20`, `clusterFieldScore.test.ts:10-25`, `deckSynthesis.test.ts:1928ff`, `ArchetypeRecommendationPanel.test.tsx:96ff`, `TournamentBestListPanel.test.tsx:44ff`). Ein neues **Pflichtfeld** würde alle fünf brechen.
- ✅ Docs-Gate (`.claude/hooks/docs-gate.sh:110-229`): Edits an `packages/shared/src/*.ts` markieren `docs/data-types.md` + `docs/features.md`. Edits an `apps/api/src/routes/analysis.ts` markieren `docs/features.md`, `docs/data-flow.md` und `docs/ai-system.md`. `apps/api/src/lib/*` löst nichts aus. `git commit` wird blockiert, bis **jede** markierte Doku bearbeitet wurde.

---

## Betroffene Dateien

| Datei | Änderungstyp | Grund | Scheibe |
|-------|-------------|-------|---------|
| `packages/shared/src/decklistClustering.ts` | Änderung | kanonische Sortierung, interner `seed`/`members`, Medoid | S1, S2 |
| `packages/shared/src/decklistClustering.test.ts` | Ergänzung | AC 1, 2, 3, 6 | S1, S2 |
| `packages/shared/src/clusterRanking.ts` | Änderung | Tie-Break-Kette | S3 |
| `packages/shared/src/clusterRanking.test.ts` | Ergänzung | AC 4 | S3 |
| `apps/api/src/lib/archetypeSynthesisFacts.ts` | Änderung | `orderBy` (S1), `finalClusters[0]` (S4) | S1, S4 |
| `apps/api/src/routes/analysis.ts` | Änderung | `orderBy` in beiden Queries des Turnier-Pfads | S1 |
| `apps/api/src/api.test.ts` | Ergänzung | AC 5 | S4 |
| `docs/data-types.md` | Doku | §Decklist Clustering Types, §RankedCluster, §Personal-prior blending | S1–S5 |
| `docs/features.md` | Doku | §20 Archetype Synthesis (+ ggf. §15-Verweis) | S1, S2, S4, S5 |
| `apps/web/**` | **keine** | AC 7: Feld `representative` bleibt, Typ-Shape bleibt | – |
| `apps/api/src/db/schema.ts`, Migrationen | **keine** | keine DB-Änderung | – |

---

## Wiederverwendbare Utilities

| Utility | Ort | Verwendung |
|---|---|---|
| `placementPercentile(placing, totalPlayers)` | `packages/shared/src/cardPerformance.ts:62-69` | Sortierschlüssel (S1) und Medoid-Tie-Break (S2). Liefert `null` bei fehlenden oder ungültigen Werten. `decklistClustering.ts` importiert bereits aus `./cardPerformance.js` (`:6`) |
| `cardCountMap` (intern) | `decklistClustering.ts:29-36` | Pro Mitglied **einmal** vorberechnen (S2, Medoid O(m²) ohne Map-Neubau) |
| `computeDecklistOverlap` | `decklistClustering.ts:44-58` | Wird intern auf `overlapFromCounts(mapA, mapB)` umgestellt, Ausgabe identisch (bestehende Overlap-Tests bewachen das) |
| `mulberry32(seed)` | `packages/shared/src/deterministicRandom.ts:12-21` | Deterministisches Mischen im AC-1-Test (Fisher-Yates test-lokal) |
| `rankClusters` | `clusterRanking.ts:51` | AC-1-Test fährt die Pipeline `rankClusters(clusterDecklists(...))` wie beide Aufrufer |
| `blendWithPersonalPrior` | `packages/shared/src/personalPriorBlend.ts:55-80` | AC-5-Test berechnet den Erwartungswert damit |
| `asc` aus `drizzle-orm` | Muster: `desc(...)` in `apps/api/src/lib/cardStatsData.ts:36`, `equilibriumData.ts:59,72` | `orderBy(asc(tournamentStandings.id))` (S1) |
| Test-Fixtures `baseDecklist()`, `standing()` | `decklistClustering.test.ts:14-55` | Wiederverwenden für alle neuen Clustering-Tests |
| Test-Helper `seedFieldWeightingStandings`, `sampleDecklistA/B` | `api.test.ts:5036-5080`, `:4862-4882` | AC-5-Test (liegt im selben `describe`-Scope) |

---

## Architektur-Entscheidung: `seed` und `members` nur intern (Plan-Entscheidung zu Spec §3.2)

Spec §3.2 lässt offen, wie Cluster ihre Mitglieder behalten („oder vergleichbar, Entscheidung im Plan").
**Entscheidung:** `seed` und `members` leben nur in einem **modul-internen Arbeitstyp** `WorkingCluster`
innerhalb von `clusterDecklists`. Der exportierte Typ `DecklistCluster` behält seine Form, nur die
Bedeutung von `representative` ändert sich (Medoid statt erstes Mitglied).

Begründung (✅ belegt, siehe §0):
1. Spec §6.1: `seed` darf nicht in die API-Antwort. Da die Routen Cluster roh serialisieren (`analysis.ts:430,633`), ginge jedes Feld auf dem exportierten Typ automatisch nach außen. Man müsste es also an zwei Stellen wieder abstreifen.
2. `members` mit voller Deckliste je Mitglied würde die Antwort um m × 60-Karten-Listen aufblähen (bei großen Clustern Hunderte).
3. AC 7 („UI ohne weitere Änderung"): Ein neues Pflichtfeld bräche fünf Fixtures in `shared` und `web` (§0). Ohne Typänderung ist AC 7 automatisch erfüllt.

Abweichung vom Wortlaut „Neues Feld `seed`": Das Feld existiert, aber nur intern. Das ist mit §6.1 vereinbar.
**Zur Bestätigung durch Konrad** markiert (siehe „Entscheidungsbedarf"), Default wie hier beschrieben.

---

## Implementierungsschritte (Scheiben)

Reihenfolge Shared → API → Doku. Jede Scheibe ist für sich grün (`npm run typecheck`, `npm run lint`,
`npm run test`) und wird einzeln committet (Conventional Commit, Body Goal/Why/How). **Docs-Gate:** Weil
Shared- und Routen-Edits den Commit blockieren, bis die gemappten Dokus bearbeitet sind, bekommt **jede**
Scheibe ihren Doku-Absatz im selben Commit. S5 ist danach der Konsistenz-Durchlauf plus Abschluss-Gates
(siehe Abweichung A3).

### S1 – Kanonische Reihenfolge + `orderBy` → AC 1, AC 6

**Tests zuerst (rot)**, `packages/shared/src/decklistClustering.test.ts`:

Gemeinsames Fixture „Kette", in einem neuen `describe`-Block als Helper `chainDecklists()`, abgeleitet von `baseDecklist()`:
- `A` = `baseDecklist()`
- `B` = A mit `Switch ×2 → Field Blower ×2` und `Super Rod ×1 → Lost Vacuum ×1` ⇒ overlap(A,B) = 57
- `C` = B mit `Earthen Vessel ×2 → Klawf ×2` und `Counter Catcher 2 → 1` + `Pal Pad ×1` ⇒ overlap(B,C) = 57, overlap(A,C) = 54 (< 55)

Der Tester sichert die drei Overlaps im Test per `computeDecklistOverlap` ab (Fixture-Sanity-Check), damit ein
Rechenfehler im Fixture nicht als Logikfehler erscheint. Bei Reihenfolge A,B,C entstehen `{A,B},{C}`, bei B,A,C
entsteht `{B,A,C}`. Genau diese Reihenfolgeabhängigkeit macht den Test heute rot.

1. `describe('clusterDecklists + rankClusters: order independence (Spec 1 AC 1)')`
   - `it('yields identical clusters, ranking and representatives for 20+ seeded shuffles of the same standings')`
     - Eingabe: ca. 8 Standings. Enthalten sind die Kette A/B/C, zwei Standings mit identischer Perzentile **und** identischem W−L (damit der `id`-Tie-Break greift), mindestens eines ohne Placement (`placing: null`) und mindestens zwei getrennte Cluster mit **gleichem** W/L/T (gleicher `winRateLowerBoundPct`).
     - Ablauf: `baseline = project(rankClusters(clusterDecklists(input)))`. Danach für `seed` 1…25: `rng = mulberry32(seed)`, Fisher-Yates-Shuffle (test-lokale Funktion `shuffled<T>(xs: T[], rng: () => number): T[]`, mutiert die Eingabe nicht), `expect(project(...)).toEqual(baseline)`.
     - `project = (r) => r.map(c => ({ ids: c.memberStandingIds, rank: c.rank, representative: c.representative }))`. Die `ids` werden **nicht** sortiert, auch die Mitgliederreihenfolge muss stabil sein.
     - Zusätzlich: `expect(new Set(seenShuffles).size).toBeGreaterThan(1)`. Das beweist, dass der Shuffle wirklich verschiedene Reihenfolgen erzeugt hat.
     - Rot heute: ✅ ja, wegen der Kette (verschiedene Cluster je Reihenfolge).
2. `describe('clusterDecklists canonical input order (Spec 1 §3.1)')`
   - `it('lets the best-placed standing found the cluster, regardless of input position')`: Eingabe `[C, B, A]`, A hat `placing: 1, totalPlayers: 100`, B und C haben `placing: null`. Erwartung: `clusters.map(c => c.memberStandingIds)` = `[[idA, idB], [idC]]`. Rot heute: ✅ (heute gründet C).
   - `it('orders by placementPercentile, not raw placing, across tournaments of different size')`: `placing 3 / totalPlayers 10` (≈ 0,778) gegen `placing 20 / totalPlayers 200` (≈ 0,905). Der zweite Standing wird erstes Mitglied (`memberStandingIds[0]`). Identische Decklisten, damit beide im selben Cluster landen.
   - `it('sorts standings without a usable placement after those with one')`: `placing: null` bzw. `totalPlayers: null` stehen hinten.
   - `it('breaks placement ties by wins − losses desc, then by id asc')`: zwei Standings ohne Placement, id 7 mit 6−1, id 3 mit 2−2 ⇒ `[7, 3]`. Zwei Standings mit gleichem W−L, ids 9 und 4 ⇒ `[4, 9]`.
   - `it('does not mutate the caller\'s standings array')`: Eingabe-Array vor und nach dem Aufruf per `toEqual` bzw. Referenz-Reihenfolge vergleichen.
3. AC 6 als Charakterisierungstest (heute schon **grün**, bewacht S1 und S2):
   - `it('keeps cluster membership unchanged for already canonically sorted input (Spec 1 AC 6)')`: Eingabe `[A (bester), B, C]` in kanonischer Reihenfolge ⇒ `[[A, B], [C]]`. Das ist dieselbe Partition, die der alte Greedy-Pass liefert.

**Bestehende Tests nach S1** (einzeln geprüft, alle bleiben ohne Änderung grün):
- `:111` Merge 58/60: ids 1 (6−1) und 2 (4−2), beide ohne Placement ⇒ Reihenfolge 1, 2 bleibt. ✅
- `:140`, `:166`, `:190`, `:231`: alle W/L 0, ohne Placement ⇒ `id`-Reihenfolge = Eingabereihenfolge. ✅
- `:179`: id 1 hat Perzentile 1,0, ids 2 und 3 `null` ⇒ 1, 2, 3. `placements` bleibt `[{1,128}]`. ✅
- `:214`: `matchResults` = `[...A, ...B]`, weil ids 1, 2 ohne Placement und W/L gleich sind ⇒ Reihenfolge bleibt. ✅

**Implementierung** (`decklistClustering.ts`):
1. `function standingPlacementPercentile(s: ClusterableStanding): number | null`: gibt `null` zurück, wenn `s.totalPlayers == null`, sonst `placementPercentile(s.placing, s.totalPlayers)`. Import aus `./cardPerformance.js` erweitern.
2. `function compareCanonical(a: ClusterableStanding, b: ClusterableStanding): number`:
   1. Perzentile absteigend, `null` zuletzt,
   2. `(wins − losses)` absteigend,
   3. `id` aufsteigend.
3. In `clusterDecklists`: `const ordered = [...standings].sort(compareCanonical);` und dann über `ordered` iterieren. Den Doc-Kommentar (`:101-110`) um „canonical order, independent of caller order" ergänzen.

**Implementierung API** (kein eigener roter Test möglich, siehe Risiken R4):
- `apps/api/src/lib/archetypeSynthesisFacts.ts`: Import `asc` ergänzen (`:1`), `.orderBy(asc(tournamentStandings.id))` nach `.where(...)` (`:116-122`).
- `apps/api/src/routes/analysis.ts`: Import `asc` ergänzen (`:1`), `.orderBy(asc(tournamentStandings.id))` an die Archetyp-Query (`:578-585`) **und** an die Feld-Query (`:560-566`). Letzteres ist eine ⚠️ Plan-Ergänzung: Die Reihenfolge der Feld-Einträge bestimmt die Summationsreihenfolge in `computeFieldScores`, und Float-Summen können je nach Reihenfolge im letzten Bit abweichen. Theoretisch, aber kostenlos zu schließen.

**Doku im selben Commit:** `docs/data-types.md` §`ClusterableStanding` / `DecklistCluster` (Absatz zu `clusterDecklists`, heute `:834-843`): kanonische Reihenfolge plus Sortierschlüssel. `docs/features.md` §20: ein Satz „deterministisch, unabhängig von der DB-Reihenfolge". `data-flow.md`/`ai-system.md` werden durch `analysis.ts` markiert, siehe Entscheidungsbedarf E2.

### S2 – `seed` intern, Medoid als `representative` → AC 2, AC 3, AC 7

**Tests zuerst (rot)**, `decklistClustering.test.ts`, `describe('clusterDecklists representative = medoid (Spec 1 §3.2)')`:

1. AC 2 `it.each` über drei Varianten, in denen jeweils A, B oder C die beste Platzierung hat und damit der Seed ist. Jede Variante wird zusätzlich in allen 6 Eingabepermutationen geprüft.
   - Fixture „Mitte": `A` = base, `B` = A mit 2 getauschten Karten (58), `C` = B mit 2 **anderen** getauschten Karten (overlap(B,C) = 58, overlap(A,C) = 56 ≥ 55 ⇒ ein Cluster bei jedem Seed). Summen: A 114, **B 116**, C 114. Sanity-Asserts per `computeDecklistOverlap`.
   - `it('picks the middle list B as representative regardless of which list seeds the cluster')` ⇒ `clusters).toHaveLength(1)` und `clusters[0].representative).toEqual(B)`. Rot heute: ✅ in den Varianten mit Seed A oder C.
2. AC 3 `it('uses the only member as representative of a single-member cluster')` ⇒ `representative).toEqual(thatDecklist)`. Heute grün, Regressionswächter.
3. Medoid-Tie-Break:
   - `it('breaks a medoid tie by better placementPercentile before smaller id')`: Seed S ist ein Ausreißer mit der besten Platzierung, zwei Nicht-Seed-Mitglieder X und Y liegen gleichauf (gleiche Overlap-Summe). Vorschlag: Kern M; S = M mit 3 Tauschkarten; X = M mit 1 Tausch α; Y = M mit 1 Tausch β ⇒ S-X 56, S-Y 56, X-Y 58 ⇒ Summen S 112, X 114, Y 114. X hat die bessere Perzentile (z. B. `10/100`) und id 9, Y hat `20/100` und id 4 ⇒ erwartet X. Rot heute: ✅ (heute S).
   - `it('breaks a full medoid tie by smaller id, not by wins − losses')`: zwei verschiedene Listen (Overlap 58, Summen bei 2 Mitgliedern immer gleich), beide `placing: null`. id 7 hat 6−1 (wird Seed), id 3 hat 0−0 ⇒ erwartet die Liste von id 3. Rot heute: ✅.
4. AC 6/Seed-Wächter `it('checks membership against the seed, not the evolving medoid')`: Mitglieder A (Seed, beste Platzierung), B, B′ (B′ = B, identische Liste) ⇒ Medoid ist B (A 114, B 117, B′ 117). Dazu D mit overlap(D,B) = 57, overlap(D,A) = 54 ⇒ D bildet **eigenen** Cluster. Ein Implementierer, der gegen den Medoid prüft, würde D fälschlich aufnehmen. Heute grün, bewacht die S2-Implementierung.
5. AC 7: kein neuer Test. Die bestehenden Web-Tests (`ArchetypeRecommendationPanel.test.tsx`, `TournamentBestListPanel.test.tsx`) müssen ohne Änderung grün bleiben, `npm run typecheck` über alle Workspaces ebenso (Typ-Shape unverändert).

**Implementierung** (`decklistClustering.ts`):
```ts
// module-internal, NOT exported (Spec §6.1: seed stays internal)
interface ClusterMember {
  id: number;
  decklist: TournamentDecklist;
  counts: Map<string, number>;          // precomputed once per member
  placementPercentile: number | null;
}
interface WorkingCluster extends Omit<DecklistCluster, 'representative'> {
  seed: ClusterMember;                  // founding member; membership is ALWAYS checked against it
  members: ClusterMember[];
}

function overlapFromCounts(a: Map<string, number>, b: Map<string, number>): DecklistOverlap;
function selectMedoid(members: ClusterMember[]): TournamentDecklist;
```
1. Refactor ohne Verhaltensänderung: `computeDecklistOverlap(a, b)` ruft `overlapFromCounts(cardCountMap(a), cardCountMap(b))` auf. Die bestehenden Overlap-Tests `:57-108` bewachen das.
2. Der Greedy-Pass arbeitet auf `WorkingCluster[]`: Zugehörigkeit per `overlapFromCounts(c.seed.counts, member.counts).overlapRatio >= minOverlapRatio`. Die Seed-Map wird damit nicht mehr pro Vergleich neu gebaut. Aggregation (`memberStandingIds`, W/L/T, `placements`, `matchResults`) bleibt Zeile für Zeile wie heute.
3. `selectMedoid`: Für m = 1 wird direkt `members[0].decklist` zurückgegeben. Sonst Summe `overlapFromCounts(mi.counts, mj.counts).identicalCards` über alle j ≠ i (die symmetrische Matrix darf halbiert werden: i < j, beide Summen erhöhen). Maximum wählen. Tie-Break: `placementPercentile` absteigend (`null` zuletzt), dann `id` aufsteigend.
4. Rückgabe: `working.map(({ seed: _seed, members, ...rest }) => ({ representative: selectMedoid(members), ...rest }))`. Das Muster „Feld per Destructuring verwerfen" gibt es bereits in `clusterFieldScore.ts:104`.
5. Doc-Kommentare: `DecklistCluster.representative` (`:82-85`) wird zu „medoid: member with the largest summed `identicalCards` to all other members; ties → better placementPercentile, then smaller id". `clusterDecklists` (`:101-110`) bekommt Seed-Semantik und Komplexität (Greedy O(n·k) + Medoid O(m²) je Cluster).

**Doku im selben Commit:** `docs/data-types.md` §`ClusterableStanding` / `DecklistCluster`. Der Code-Block-Kommentar `// first member's list encountered` (`:826`) wird zu `// medoid of the cluster`, dazu Medoid-Absatz und Komplexität. `docs/features.md` §20: Repräsentant ist die typischste Liste.

### S3 – Stabile Rangfolge in `rankClusters` → AC 4

**Tests zuerst (rot)**, `packages/shared/src/clusterRanking.test.ts`, `describe('rankClusters tie-breaks (Spec 1 §3.3)')`. Alle Cluster haben dasselbe W/L/T (z. B. 10−5), damit `winRateLowerBoundPct` exakt gleich ist. Die Eingabe steht jeweils in der **falschen** Reihenfolge, damit der heutige stabile Sort rot wird:
1. `it('breaks a lower-bound tie by avgPlacementPercentile desc, null last')`: Eingabe `[ids [1] ohne placements, ids [2] mit {51,101} (0,5), ids [3] mit {1,101} (1,0)]` ⇒ Reihenfolge `[3, 2, 1]`, `rank` `[1, 2, 3]`.
2. `it('then by member count desc')`: `[ids [1], ids [5, 6]]`, gleiche Placements ⇒ `[5,6]` zuerst.
3. `it('then by smallest member id asc')`: `[ids [9], ids [4]]` ⇒ `[4]` zuerst.
4. `it('produces the same ranking for every permutation of tied clusters')`: 4 gleichauf liegende Cluster, alle 24 Permutationen ⇒ identische `memberStandingIds`-Reihenfolge.
5. Die bestehenden Tests (`:23-116`) bleiben unverändert grün. Der Primärschlüssel wird nicht angefasst, und `:107-116` (0 Spiele ⇒ Rang 2) bleibt, weil die Untergrenze 0 unter jeder positiven liegt.

**Implementierung** (`clusterRanking.ts`):
```ts
function smallestMemberId(c: DecklistCluster): number; // Number.MAX_SAFE_INTEGER for an empty member list
function compareRankedClusters(
  a: Omit<RankedCluster, 'rank'>,
  b: Omit<RankedCluster, 'rank'>,
): number;
```
Kette: `winRateLowerBoundPct` absteigend → `avgPlacementPercentile` absteigend (`null` zuletzt) → `memberStandingIds.length` absteigend → `smallestMemberId` aufsteigend. `:64` wird zu `.sort(compareRankedClusters)`. Den Doc-Kommentar an `rank` (`:28`) um die Tie-Break-Kette ergänzen.

**Doku im selben Commit:** `docs/data-types.md` §`RankedCluster`: Kommentar `// 1-based, descending winRateLowerBoundPct` (`:851`) plus Tie-Break-Satz im Absatz `:856-866`. `docs/features.md` §20: Halbsatz.

### S4 – Personal-Prior-Bug → AC 5

**Test zuerst (rot)**, `apps/api/src/api.test.ts`, im bestehenden `describe('localField / real field-reweighting (Spec 10 Slice D)')` (`:5024`), damit `seedFieldWeightingStandings` und `shockmeisterField` im Scope sind:
- `it("personalPrior is based on the cluster shown first after local-field re-ranking, not the Wilson-first cluster (Spec 1 AC 5)")`
  - `seedFieldWeightingStandings(archetypeId)`. A ist Wilson-Erster (20−2), B ist Feld-Erster (5−5, schlägt `shockmeister-ex`).
  - `const record = { wins: 8, losses: 2, ties: 0 }` (10 Spiele ≥ `DEFAULT_MIN_OWN_GAMES`).
  - `factSet = await buildArchetypeSynthesisFactSet(db, { archetypeId, archetypeName: archetypeId, windowDays: 90, language: 'de', scope: 'local', usePersonalPrior: true, personalRecord: record, localField: shockmeisterField })`.
  - Asserts:
    - `factSet.rankedClusters[0].representative.pokemon[0].name).toBe('Charizard ex')`: Vorbedingung, die Reihenfolge ist wirklich gedreht.
    - `prior = factSet.facts.find(f => f.kind === 'personalPrior')` ist definiert.
    - `prior.value).toBeCloseTo(blendWithPersonalPrior(factSet.rankedClusters[0].winRateLowerBoundPct, record).blendedPct, 6)`.
    - Negativkontrolle: `prior.value).not.toBeCloseTo(blendWithPersonalPrior(<Wilson-Erster>.winRateLowerBoundPct, record).blendedPct, 6)`. Den Wilson-Ersten holt der Test aus `factSet.rankedClusters.find(c => c.representative.pokemon[0].name === 'Dragapult ex')`.
  - Import `blendWithPersonalPrior` aus `@pokekon/shared` in `api.test.ts` ergänzen (✅ heute nicht importiert).
  - Rot heute: ✅. Die Wilson-Untergrenzen von 20−2 und 5−5 unterscheiden sich deutlich, `ownWeight` = 10/30.
  - ⚠️ Vermutung: `selectFacts` (`archetypeSynthesisFacts.ts:168`) wirft den `personalPrior`-Fakt nicht raus. Belegt ist nur, dass der bestehende Test `:5367` ihn in `factSet.facts` findet. Kommt der Fakt in diesem Setup nicht an, zuerst `selectFacts` lesen, nicht den Test anpassen.

**Implementierung:** `archetypeSynthesisFacts.ts:154` `const topCluster = finalClusters[0];`. Den Doc-Kommentar `:87-95` („the top-ranked cluster" wird zu „the cluster shown first, i.e. after optional field re-ranking") anpassen. Für `global` bzw. ohne Feld gilt `finalClusters === rankedClusters` (`:142`), dort also keine Verhaltensänderung. Die bestehenden Tests `:5352-5424` bleiben grün.

**Doku im selben Commit:** `docs/features.md` §20, Satz `:600-601` („top-ranked cluster's win rate") ⇒ „the cluster shown first (after local-field re-ranking, if any)". `docs/data-types.md` `:1004` analog. `apps/api/src/lib/*` löst kein Docs-Gate aus, die Aktualisierung ist trotzdem Pflicht (CLAUDE.md §2.7).

### S5 – Doku-Konsistenz + Abschluss-Gates → AC 8

1. `docs/data-types.md` §Decklist Clustering Types, Einleitung `:799-800`: „Not yet wired into any route or UI" ist veraltet (verdrahtet in `archetypeSynthesisFacts.ts` und im Turnier-Pfad) ⇒ korrigieren.
2. Abschnitte aus S1–S4 in einem Durchgang gegenlesen: Keine Stelle darf mehr „first list encountered" bzw. „zuerst gesehen" behaupten. Kontrolle per `grep -rn "first member\|first standing\|encountered" docs/ packages/shared/src/decklistClustering.ts`.
3. UI-Texte bleiben unverändert (AC 7). ✅ Geprüft: `meta.json` `methodology.record` spricht neutral von der „angezeigten Beispiel-Liste" (`de/meta.json:182,207`) und bleibt damit korrekt.
4. Gates: `npm run typecheck`, `npm run lint`, `npm run test` (inkl. `test:hooks` = Docs-Gate-Selbsttest). Ergebnisse ehrlich berichten.
5. Danach `code-review-agent` (Vision §9.1). `security-agent` ist laut Spec nicht verlangt: keine neue Eingabe, keine neue Route.

---

## Schnittstellen

Öffentliche API von `@pokekon/shared`: **unverändert** (keine neuen Exporte, keine Typänderung).

```ts
// decklistClustering.ts — exported, SHAPE UNCHANGED, semantics of `representative` changed
export interface DecklistCluster {
  /** Medoid: the member with the largest summed identicalCards to all other
   *  members; ties → higher placementPercentile (null last), then smaller id. */
  representative: TournamentDecklist;
  /** Canonical order: seed first (best placementPercentile, then wins−losses, then id). */
  memberStandingIds: number[];
  totalWins: number; totalLosses: number; totalTies: number;
  placements: { placing: number; totalPlayers: number }[];
  matchResults: StandingMatchResult[];
}
export function clusterDecklists(
  standings: ClusterableStanding[],
  opts?: { minOverlapRatio?: number },
): DecklistCluster[]; // unchanged signature; result independent of input order

// internal (not exported)
function standingPlacementPercentile(s: ClusterableStanding): number | null;
function compareCanonical(a: ClusterableStanding, b: ClusterableStanding): number;
function overlapFromCounts(a: Map<string, number>, b: Map<string, number>): DecklistOverlap;
function selectMedoid(members: ClusterMember[]): TournamentDecklist;

// clusterRanking.ts — internal
function smallestMemberId(c: DecklistCluster): number;
function compareRankedClusters(a: Omit<RankedCluster, 'rank'>, b: Omit<RankedCluster, 'rank'>): number;
```

API-Antworten (`GET /api/analysis/archetype/:id`, `GET /api/analysis/tournament/:tid/archetype/:aid`): gleiche
Form, kein `seed`, kein `members`. Geändert sind nur die Werte (`representative`, Reihenfolge von
`memberStandingIds`/`matchResults`/`placements`, Rangfolge bei Gleichstand).

---

## Risiken & Randfälle

- **R1 – Einmalig „stale" Synthesen nach Deploy.** Fakt-IDs (`cluster.${memberStandingIds[0]}`, `deckSynthesis.ts:1020`) und Labels (Pokémon des Repräsentanten, `:997-1000`) ändern sich für bestehende Daten. Deshalb ändert sich `currentInputHash`, und gecachte LLM-Synthesen werden als `stale: true` markiert (`analysis.ts:423`). Das ist gewollt und selbstheilend (Nutzer erzeugt neu), keine Migration nötig. ✅ Belegt über den Code-Pfad, im PR-Text erwähnen.
- **R2 – Medoid-Aufwand O(m²).** Spec verlangt Bestätigung für „< 200". ❌ **Unbekannt**, wie groß Cluster real werden: Das Fenster geht bis `META_WINDOW_MAX_DAYS = 180` (`validation.ts:154`), Default 90 (`:324`). Im Worst Case liegen alle Listen eines Archetyps in einem Cluster. Abschätzung (⚠️ Vermutung): Mit vorberechneten Maps (≈ 25–35 verschiedene Karten je Liste) kosten selbst m = 1000 rund 500.000 Paarvergleiche × ~30 Map-Lookups, also im zweistelligen Millisekundenbereich pro Request. Unkritisch, aber nicht gemessen. Vorschlag zur Bestätigung (lesend, von Konrad gegen die Prod-DB): `SELECT archetype_id, count(*) FROM tournament_standings s JOIN tournaments t ON t.id = s.tournament_id WHERE s.decklist IS NOT NULL AND t.date > now() - interval '180 days' AND t.is_online AND t.swiss_mode = 'BO1' AND t.players >= 15 GROUP BY 1 ORDER BY 2 DESC LIMIT 5;` Keine Timing-Assertion in Tests (flaky).
- **R3 – Float-Gleichheit beim Tie-Break.** Gleiche W/L/T ergeben bitgleiche `winRateLowerBoundPct` (deterministisches `wilsonInterval`). Verschiedene W/L/T mit zufällig gleichem Wert sind praktisch ausgeschlossen, und falls doch, greift die Kette korrekt. Kein Epsilon-Vergleich einführen, sonst ist die Ordnung nicht mehr transitiv.
- **R4 – `orderBy` ist nicht rot testbar.** PGlite liefert in Tests ohnehin Einfügereihenfolge. Die Determinismus-Garantie liefert die kanonische Sortierung in `clusterDecklists` (AC 1). `orderBy` dient Logs und Debugging (Spec §3.1). Der Review prüft es, und die TDD-Regel ist erfüllt (keine eigene Verhaltensänderung).
- **R5 – Leere Mitgliederliste** kommt aus `clusterDecklists` nie vor, nur aus handgebauten Fixtures. Deshalb `smallestMemberId` mit Fallback `Number.MAX_SAFE_INTEGER`, damit `Math.min()` = `Infinity` keinen `NaN`-Vergleich erzeugt.
- **R6 – Medoid-Tie-Break „bessere Platzierung"** wird als höhere `placementPercentile` gelesen, nicht als kleinere rohe `placing`: Mitglieder stammen aus verschiedenen Turnieren unterschiedlicher Größe, das ist konsistent zu §3.1. ⚠️ Auslegung der Spec, siehe E3.
- **R7 – Fixture-Rechenfehler.** Die Overlap-Konstruktionen (Kette, Mitte, Ausreißer) sind knapp an der Schwelle 55. Jeder neue Test sichert seine Overlaps per `computeDecklistOverlap` ab, bevor er das Verhalten prüft.
- **R8 – Docs-Gate blockiert Scheiben-Commits,** wenn der Doku-Absatz fehlt. Deshalb Doku je Scheibe (A3).
- **Cold Start:** 0 Standings ⇒ `clusterDecklists([])` = `[]`, `rankClusters([])` = `[]`, `finalClusters[0]` = `undefined` ⇒ kein Prior-Fakt (Guard `&& topCluster` bleibt, `:155`). Keine Änderung, bestehende Leerzustands-Tests bleiben grün.

---

## Abweichungen Spec ↔ Code / Plan (Zusammenfassung)

- **A1** Zählung „15 Test-Stellen" (AC 6): real 17 Treffer in 6 Dateien. Einzelprüfung in §6.1. Keine muss geändert werden.
- **A2** §3.1 nennt `placementPercentile` als Standing-Feld, das gibt es nicht. Der Wert wird aus `placing`/`totalPlayers` abgeleitet.
- **A3** Spec-Scheibe S5 „Doku" als eigener Schritt ist mit dem Docs-Gate nicht vereinbar (S1–S3 würden am Commit blockiert). Doku wandert pro Scheibe mit, S5 wird Konsistenz-Durchlauf + Gates.
- **A4** `seed`/`members` nur intern statt als Feld auf `DecklistCluster` (Begründung oben).
- **A5** Zusätzlich `orderBy` auch an der Feld-Query des Turnier-Pfads (`analysis.ts:560-566`), nicht nur an der Archetyp-Query.
- **A6** Zeilen-Präzisierungen: Greedy-Schleife endet `:145` (Spec `:143`), Re-Ranking `:142-151` (Spec `:142-150`). Inhaltlich identisch.
- **A7** (Vision, nicht Spec 1) `schema.ts:303-309` ⇒ jetzt `:311-317`, und die Vision §4 „Export nicht vorhanden" ist veraltet.

### 6.1 Einzelprüfung der `representative`-Test-Stellen (AC 6)

| Stelle | Art | Nach Spec 1 |
|---|---|---|
| `clusterRanking.test.ts:11` | Fixture-Feld | unverändert grün (Typ-Shape gleich) |
| `clusterFieldScore.test.ts:12` | Fixture-Feld | unverändert grün |
| `deckSynthesis.test.ts:1930`, `:1998` | Fixture-Feld | unverändert grün |
| `deckSynthesis.test.ts:1995` | nur Testname | – |
| `ArchetypeRecommendationPanel.test.tsx:98` | Fixture-Feld (Web) | unverändert grün (AC 7) |
| `TournamentBestListPanel.test.tsx:46` | Fixture-Feld (Web) | unverändert grün (AC 7) |
| `api.test.ts:5091`, `:5094` | global: `Dragapult ex` führt | grün: Cluster A/B disjunkt (Overlap 0), 1 Mitglied je Cluster ⇒ Medoid = einziges Mitglied |
| `api.test.ts:5103`, `:5106` | local+Feld: `Charizard ex` führt | grün, gleiche Begründung |
| `api.test.ts:5125-5131` | local ohne Feld = global | grün |
| `api.test.ts:5553`, `:5564` | Turnier-Pfad: `Charizard ex` führt | grün: disjunkte Listen, je 1 Mitglied |

---

## Entscheidungsbedarf (Konrad)

Die Spec-Defaults §6.1/§6.2 sind übernommen. Offen bleiben nur Punkte, die der Plan neu aufwirft. Jeweils mit
Default, damit kein Agent raten muss:

- **E1 – `seed`/`members` nur intern (A4).** Default: ja, wie geplant. Alternative: Feld auf `DecklistCluster` und in beiden Routen wieder abstreifen. Mehr Oberfläche, bricht fünf Fixtures.
- **E2 – Docs-Gate für `analysis.ts` (S1).** Das Gate verlangt Edits an `docs/data-flow.md` und `docs/ai-system.md`, obwohl ein `orderBy` dort nichts Beschreibenswertes ändert (`data-flow.md` hat keinen Archetype-Synthesis-Abschnitt). Default: `features.md` §20 inhaltlich aktualisieren, für die zwei anderen den dokumentierten Override `rm .git/claude-docs-dirty` nutzen, mit Begründung im Commit-Body. Alternative: je ein Satz in beiden Dateien.
- **E3 – Medoid-Tie-Break „bessere Platzierung" = höhere `placementPercentile`** (R6). Default: ja.
- **E4 – Branch-Basis.** Spec 1 braucht einen eigenen Branch `feat/archetype-list-foundation` (Vision §9.2.1). PR #100 (`feat/ptcgl-export`, enthält Specs und diesen Plan) ist noch offen, und Rebase + Force-Push sind global geblockt. Default: nach Merge von #100 von `main` abzweigen. Alternative: jetzt von `feat/ptcgl-export` abzweigen (gestapelter PR mit Base `feat/ptcgl-export`) und nach dem Merge `main` hineinmergen, nicht rebasen.
- **E5 – Real-Clustergröße (R2)** optional per SQL bestätigen. Blockiert nichts.

---

## Verifikations-Checkliste

- [ ] `npm run typecheck` grün (baut `@pokekon/shared` zuerst, dann alle Workspaces, inkl. Web mit unverändertem `RankedCluster`)
- [ ] `npm run lint` grün, Prettier sauber
- [ ] `npm run test` grün (shared, api mit PGlite, web, `test:hooks`)
- [ ] AC 1: ≥ 20 Shuffles (`mulberry32`) ⇒ identische Mitglieder-IDs, Ränge, Repräsentanten; Shuffle erzeugt nachweislich > 1 Reihenfolge
- [ ] AC 2: B ist Repräsentant bei Seed A, B und C und bei allen 6 Eingabepermutationen
- [ ] AC 3: Einzel-Cluster ⇒ eigenes Mitglied als Repräsentant
- [ ] AC 4: Tie-Break-Kette Perzentile → Mitgliederzahl → kleinste ID, alle Permutationen stabil
- [ ] AC 5: `personalPrior.value` = Blend auf `finalClusters[0]`, Negativkontrolle gegen den Wilson-Ersten
- [ ] AC 6: Charakterisierungstest (kanonische Eingabe ⇒ gleiche Partition) plus Seed-Wächter; alle bestehenden Tests unverändert grün (§6.1)
- [ ] AC 7: keine Änderung unter `apps/web/`, Web-Tests grün, API-JSON ohne `seed`/`members`
- [ ] AC 8: `docs/data-types.md` + `docs/features.md` aktualisiert, Docs-Gate grün (oder Override gemäß E2 begründet)
- [ ] Cold Start: 0 Standings ⇒ leere Cluster, kein Prior-Fakt, kein Crash
- [ ] Keine Secrets, keine neuen Dependencies, keine DB-Migration
