# Plan — Spec 2: Daten-Korrektheit (Tie-Handling, Bo1/Bo3, Quellen-Konsistenz)

> **Bindende Grundlage:** [`specs/data-correctness-fixes.md`](../../specs/data-correctness-fixes.md) (freigegeben 2026-08-31).
> Kontext: Teil 2 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> Ablage nach Konvention von `.claude/plans/` (Topic-Slug, kein `-plan`-Suffix; Verwechslung mit der Spec
> ist durch das Verzeichnis ausgeschlossen).
> **Branch:** `feat/data-correctness-fixes` · Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`)
> nach `~/.claude/rules/tdd.md`, Scheibe für Scheibe in der Reihenfolge aus §4.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`)

Alles hier ist aus dem Code gelesen, nicht vermutet. Abweichungen von der Spec sind markiert.

**Tie-Handling**
- `packages/shared/src/meta.ts:279-280` — `decisive = wins + losses`, `winRatePct = Math.round(wins/decisive*100)`, `null` bei `decisive === 0`. Spalte ist ganzzahlig gerundet.
- `apps/api/src/routes/meta.ts:140-149` (`directedRow`) — dieselbe Formel, aber auf 1 Dezimale gerundet, Fallback `50` wenn `decisive === 0`.
- `packages/shared/src/meta.ts:10` — `StandingLite.record.ties?: number` existiert, wird aber nirgends gelesen.
- `apps/api/src/jobs/syncMeta.ts:242-263` — Sync-Query selektiert nur `wins, losses`; `ties` wird nicht durchgereicht (wie in der Spec belegt).
- **Dritte, in der Spec nicht genannte Fundstelle:** `apps/api/src/routes/meta.ts:78-95` (`loadWindowAggregates`) selektiert ebenfalls nur `wins, losses` und baut daraus `StandingLite.record` ohne `ties`. Ohne Fix bliebe `/api/meta/field-analysis` tie-blind, obwohl die Formel korrigiert ist.
- `apps/api/src/db/schema.ts:242-268` — `meta_snapshots` hat `wins`, `losses`, **kein** `ties`; `win_rate_pct` ist `integer` (nullable).
- `apps/api/src/db/schema.ts:309-339` — `tournament_standings.ties` (`integer NOT NULL DEFAULT 0`) existiert, Rohdaten sind da.
- **Client rechnet die Meta-WR teilweise selbst neu:** `apps/web/src/components/meta/winRateColor.ts:13-16` (`winRatePct1(wins, losses)`), genutzt in `apps/web/src/pages/MetaPage.tsx:262` und `apps/web/src/components/meta/ArchetypeDetail.tsx:231` für **Meta**-Zeilen und in `apps/web/src/components/meta/MetaTable.tsx:154` für **persönliche** Zeilen. Ohne `ties` auf der Wire würde die UI eine andere Zahl anzeigen als der Server berechnet hat.
- `packages/shared/src/meta.test.ts:56-68` — bestehender Test „reports a null win rate when there are no decisive games" nutzt `0W/0L/3T` + `0W/0L/2T` und erwartet `null`. Unter der neuen Formel sind das 5 Spiele → 33 %. **Dieser Test muss bewusst umgeschrieben werden** (Spec-AC erlaubt das ausdrücklich); `meta.test.ts:39` (`10W/4L` → 71) bleibt unverändert korrekt.

**Bo1/Bo3**
- `apps/api/src/db/schema.ts:131` — `eventTypeValues = ['LC','LCup','Regional','Worlds','Online']`; `opponent_logs` (`schema.ts:209-236`) hat kein Format-Feld.
- `packages/shared/src/meta.ts:159-160` — `SWISS_MODE_VALUES` liegt in shared und wird von `schema.ts:16` importiert → **Präzedenzfall** für „Enum lebt in shared, DB importiert es".
- `apps/api/src/validation.ts:56-77` — `logFields` / `logBodySchema` / `logPatchSchema`.
- `apps/api/src/routes/logs.ts:54-69` (POST-Insert), `:111-121` (PATCH-Whitelist).
- `apps/web/src/types/index.ts:61-73` (`OpponentLog`), `apps/web/src/lib/api.ts:119-131` (`OpponentLogRow`), `:197-211` (`toOpponentLog`), `:319-336` (`LogWriteBody`, `createLog`, `updateLog`).
- `apps/web/src/components/opponent/AddLogModal.tsx:75,126-136,284-319` — Eingabemaske, `eventType`-Select im 3-Spalten-Grid.
- `apps/web/src/components/opponent/OpponentLog.tsx:150-155` — Badge-Spalte der Log-Liste; `MatchDetailModal.tsx:366-372` — Badge-Zeile im Header (Modal patcht heute nur `battleLog`/`analysis`, `:293`, `:323`, `:333`).
- `apps/web/src/lib/preferences.ts:3-8` — localStorage-Wrapper mit `KEYS`-Map (Ort für das „einmalig dismissable"-Flag, keine DB-Migration nötig).
- `apps/web/src/lib/localImport.ts:134` — importiert Alt-Logs aus Dexie (kein `bestOf` vorhanden).
- `apps/api/src/lib/demoSeed.ts:566-580` (`SeedMatch`), `:883-896` (Insert in `opponent_logs`).
- **Vergleichsflächen persönliche WR ↔ Meta-Baseline:** `apps/web/src/db/queries.ts:229-278` (`getArchetypeStats`, erzeugt `winRate` + `metaWinRate`), gerendert in `apps/web/src/components/meta/WinRateChart.tsx:34-41` (persönliche WR gegen Turnier-WR, `docs/features.md:32`) und `MetaTable.tsx:154`. `useRecommendations.ts:23,161` vergleicht dagegen nur gegen den neutralen 50 %-Wert, nicht gegen die Meta-Baseline.

**Quellen-Konsistenz**
- `apps/api/src/routes/meta.ts:152-216` (`loadMatchupData`) — TrainerHill-Zeilen werden in `byKey` gelegt (`:184-186`) und bei `total >= MIN_MATCHUP_GAMES` **überschrieben** (`:193-194`); der überschriebene Fallback-Wert ist danach verloren.
- `packages/shared/src/fieldWinRate.ts:54` — `MIN_MATCHUP_GAMES = 10`.
- `packages/shared/src/matchupCsv.ts:56-75` — TrainerHills `win_rate` wird **unverändert** aus der CSV übernommen; wie TrainerHill Ties darin gewichtet, ist **Unbekannt** (siehe §6 Risiken).
- `apps/api/src/routes/meta.ts:247-254` (`matchupSourceJson`) — der Ort für das Konflikt-Feld.

**Infrastruktur**
- Migrationen: `apps/api/drizzle/0000…0009`, generiert per `npm run db:generate -w @pokekon/api`; Deploy via `preDeployCommand: npm run migrate:deploy -w @pokekon/api` (`railway.json`, `apps/api/railway.json`) → `apps/api/src/migrate.ts` (drizzle-Migrator, `__drizzle_migrations`).
- Test-Harness: `apps/api/src/api.test.ts:28-57` — PGlite + **echte** Migrations-SQL, Meta-Routen bereits abgedeckt (`:708`, `:779`, mit gemocktem Limitless-`fetch`). Backfill-Job und Konflikt-Flag können dort ohne neuen Harness getestet werden.
- Job-Muster mit CLI-Entry: `apps/api/src/jobs/importMatchups.ts:48-59`, `syncMeta.ts:507-516`; npm-Scripts in `apps/api/package.json` (`job:sync-meta`).
- Gates: `npm run typecheck`, `npm run lint`, `npm run test` im Repo-Root (CLAUDE.md §4/§2.5).

---

## 1. Summary

Drei zusammenhängende Korrektheits-Fixes an der Zahl, die Field-Score, Matchup-Matrix und
Empfehlungen speist. (a) Die Win-Rate rechnet Unentschieden künftig turnierkonform als
Drittel-Sieg (`(W + T/3)/(W + L + T)`) — implementiert **einmal** in `@pokekon/shared` und von
allen drei belegten Fundstellen benutzt; dazu wird das ohnehin vorhandene `ties`-Rohdatum durch
Sync und Window-Aggregation durchgereicht, in `meta_snapshots` mitgespeichert und die
historischen `win_rate_pct`-Werte einmalig per Job neu berechnet, damit die Trendlinie am
Umstellungsdatum nicht bricht. (b) Match-Logs bekommen ein explizites `bestOf`-Feld
(`'BO1'|'BO3'`), das beim Loggen abgefragt (eventType-abhängig vorbelegt, immer änderbar) und
für den Vergleich mit der Bo1-Meta-Baseline per Umkehrfunktion von `P_Bo3 = 3p² − 2p³`
zurückgerechnet wird; Alt-Logs ohne Wert bleiben sichtbar „Format unbekannt" und fallen aus dem
Vergleich, mit einem einmaligen, dismissable Nachtrag-Hinweis. (c) Weichen eigene Pairing-Daten
und der TrainerHill-Fallback für denselben Matchup um mehr als 15 Prozentpunkte ab, wird das
als Konflikt gemeldet (Response-Feld + Server-Log) — ohne die angezeigte Zahl zu ändern.
Nutzer ist Konrad selbst (Dogfooding); alle nachgelagerten Specs (3, 5, 6) rechnen auf diesen
Zahlen weiter.

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik — Single Source of Truth)**
- [ ] `packages/shared/src/winRate.ts` **(neu)** — `tournamentWinRate` / `tournamentWinRatePct`
- [ ] `packages/shared/src/winRate.test.ts` **(neu)**
- [ ] `packages/shared/src/bestOf.ts` **(neu)** — `BEST_OF_VALUES`, Bo1↔Bo3-Konvertierung, Bo1-Äquivalent-Aggregation
- [ ] `packages/shared/src/bestOf.test.ts` **(neu)**
- [ ] `packages/shared/src/matchupConflict.ts` **(neu)** — `detectMatchupConflicts`
- [ ] `packages/shared/src/matchupConflict.test.ts` **(neu)**
- [ ] `packages/shared/src/meta.ts` — `MetaSnapshotData.ties`, `computeMetaSnapshots` summiert Ties + nutzt die geteilte Formel; Doc-Kommentar `:237-240`
- [ ] `packages/shared/src/meta.test.ts` — Ties-Fall (AC-Beispiel), Umschreiben des `null`-Tests
- [ ] `packages/shared/src/index.ts` — drei neue Re-Exports

**Datenmodell / Migration (`apps/api`)**
- [ ] `apps/api/src/db/schema.ts` — `opponentLogs.bestOf` (nullable + CHECK), `metaSnapshots.ties` (NOT NULL DEFAULT 0)
- [ ] `apps/api/drizzle/0010_*.sql` **(generiert)** + `apps/api/drizzle/meta/*` (Journal/Snapshot)

**API**
- [ ] `apps/api/src/validation.ts` — `bestOf` in `logFields` (POST Pflicht, PATCH optional)
- [ ] `apps/api/src/routes/logs.ts` — Insert- und PATCH-Whitelist
- [ ] `apps/api/src/routes/meta.ts` — `directedRow` auf geteilte Formel, `loadWindowAggregates` reicht `ties` durch, `WindowAggregates.archetypes[].ties`, Konflikt-Erkennung in `loadMatchupData` + `matchupSourceJson`
- [ ] `apps/api/src/jobs/syncMeta.ts` — `ties` selektieren/durchreichen, im Upsert mitschreiben
- [ ] `apps/api/src/jobs/backfillMetaWinRates.ts` **(neu)** + CLI-Entry
- [ ] `apps/api/package.json` — Script `job:backfill-winrates`
- [ ] `apps/api/src/lib/demoSeed.ts` — `bestOf` je Seed-Match
- [ ] `apps/api/src/api.test.ts` — Route-/Job-Tests (bestOf-Roundtrip, Konflikt-Flag, Backfill)

**Web**
- [ ] `apps/web/src/types/index.ts` — `OpponentLog.bestOf`, `MetaSnapshot.ties`, `ArchetypeStats`-Erweiterung, korrigierte Doc-Kommentare (`:6-10`, `:124-126`)
- [ ] `apps/web/src/lib/api.ts` — `OpponentLogRow.bestOf`, `toOpponentLog`
- [ ] `apps/web/src/db/queries.ts` — `getArchetypeStats` liefert Bo1-Äquivalent + Unknown-Zähler **und**
      berechnet `winRate` (`:256-257`, bisher `wins/(wins+losses)`) über `tournamentWinRatePct` neu
      (bestätigte Entscheidung 2026-08-31, siehe §6 Frage 1 — **nicht** mehr auf Spec 4 verschoben)
- [ ] `apps/web/src/components/opponent/AddLogModal.tsx` — Pflicht-Auswahl mit eventType-Default
- [ ] `apps/web/src/components/opponent/OpponentLog.tsx` — „Format unbekannt"-Badge
- [ ] `apps/web/src/components/opponent/MatchDetailModal.tsx` — Badge + Nachtrag-Auswahl + einmaliger Hinweis
- [ ] `apps/web/src/lib/preferences.ts` — `bestOfHintDismissed`
- [ ] `apps/web/src/components/meta/winRateColor.ts` — `winRatePct1(wins, losses, ties)`
- [ ] `apps/web/src/components/meta/MetaTable.tsx`, `WinRateChart.tsx` — Bo1-Äquivalent + Unknown-Hinweis
- [ ] `apps/web/src/components/meta/MetaPage.tsx` / `ArchetypeDetail.tsx` — `ties` an `winRatePct1` durchreichen
- [ ] `apps/web/src/lib/localImport.ts` — Alt-Logs ohne `bestOf` importieren (explizit „unbekannt")
- [ ] `apps/web/src/i18n/locales/{de,en}/opponents.json`, `.../meta.json` — neue Labels
- [ ] `apps/web/src/components/opponent/AddLogModal.test.tsx` **(neu)** — Pflichtfeld + Default-Verhalten

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `docs/features.md` §1 (Win-Rate-Chart-Semantik), §2 (Sync liest Ties), §6 (Match-Log-Feldliste + `bestOf`), §13 (Matchup-Matrix + Konflikt-Hinweis), §15 (Trend/Backfill-Fußnote)
- [ ] `docs/database.md` — `meta_snapshots.ties`, `opponent_logs.best_of`, Migrations-Historie (`0010`), Abschnitt zum Backfill-Job
- [ ] `docs/data-types.md` — `OpponentLog`, `MetaSnapshot`, `ArchetypeStats`, `EventType`-Abgrenzung zu `BestOf`
- [ ] `docs/data-flow.md` — Ties im Sync-Pfad, Matchup-Blend inkl. Konflikt-Meldung
- [ ] `apps/api/README.md` — neuer Job im Betriebsteil (nur falls dort Jobs gelistet sind; sonst weglassen)

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen und Shapes — keine Implementierungsvorgaben darüber hinaus.

### 3.1 `packages/shared/src/winRate.ts` (neu)

```ts
/** Offizielle Turnierwertung: ein Unentschieden zählt wie ein Drittel-Sieg. */
export const TIE_WEIGHT: number; // 1 / 3

/**
 * (wins + ties/3) / (wins + losses + ties) als Bruch 0..1.
 * null, wenn ueberhaupt kein Spiel vorliegt (Summe 0).
 * Nicht-endliche oder negative Eingaben werden defensiv als 0 behandelt.
 */
export function tournamentWinRate(wins: number, losses: number, ties?: number): number | null;

/** Dasselbe in Prozent, gerundet auf `decimals` Nachkommastellen (Default 0). */
export function tournamentWinRatePct(
  wins: number,
  losses: number,
  ties?: number,
  decimals?: number,
): number | null;
```

Verbindliche Wertetabelle (Testgrundlage):

| wins | losses | ties | `tournamentWinRatePct(..., 1)` | `tournamentWinRatePct(..., 0)` |
|---|---|---|---|---|
| 6 | 4 | 2 | `55.6` (AC-Beispiel) | `56` |
| 10 | 4 | 0 | `71.4` | `71` (unverändert zu heute) |
| 0 | 0 | 5 | `33.3` | `33` (**Semantikwechsel**, vorher `null`) |
| 0 | 0 | 0 | `null` | `null` |
| 3 | 0 | 0 | `100` | `100` |

### 3.2 `packages/shared/src/bestOf.ts` (neu)

```ts
export const BEST_OF_VALUES: readonly ['BO1', 'BO3'];
export type BestOf = (typeof BEST_OF_VALUES)[number];

/** Wahrscheinlichkeit, ein Bo3 zu gewinnen, bei Einzelspiel-WR p: 3p^2 - 2p^3. p wird auf [0,1] geklemmt. */
export function bo1ToBo3WinRate(p: number): number;

/** Umkehrung: Einzelspiel-WR aus einer Bo3-WR q. Geschlossene Form: 0.5 + sin(asin(2q - 1) / 3). q wird auf [0,1] geklemmt. */
export function bo3ToBo1WinRate(q: number): number;

export interface FormatRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface Bo1EquivalentInput {
  bo1: FormatRecord;
  bo3: FormatRecord;
  /** Logs ohne `bestOf` — fliessen NICHT in die Zahl ein, werden nur gezaehlt. */
  unknown: FormatRecord;
}

export interface Bo1EquivalentWinRate {
  /** Bo1-vergleichbare WR in Prozent (Ties als 1/3), null wenn keine verwertbaren Spiele. */
  winRatePct: number | null;
  bo1Games: number;
  bo3Games: number;
  /** Ausgeschlossene Spiele ohne bekanntes Format (UI-Hinweis "Format unbekannt"). */
  unknownGames: number;
  /** true, sobald mindestens ein Bo3-Spiel zurueckgerechnet wurde. */
  convertedFromBo3: boolean;
}

/**
 * Aggregat-Ebene, NICHT pro Log: WR der Bo1-Gruppe und WR der Bo3-Gruppe werden je
 * tie-gewichtet berechnet, die Bo3-WR mit `bo3ToBo1WinRate` zurueckgerechnet und beide
 * anschliessend nach Spielanzahl gewichtet gemittelt. (Eine Rueckrechnung pro Einzelspiel
 * waere wirkungslos: 0 und 1 sind Fixpunkte der Funktion.)
 */
export function bo1EquivalentWinRate(
  input: Bo1EquivalentInput,
  decimals?: number,
): Bo1EquivalentWinRate;
```

Verbindliche Eigenschaften (Testgrundlage):
- Fixpunkte: `bo1ToBo3WinRate(0) === 0`, `(0.5) === 0.5`, `(1) === 1`; dito `bo3ToBo1WinRate`.
- Round-Trip: `bo3ToBo1WinRate(bo1ToBo3WinRate(p)) ≈ p` für `p ∈ {0, 0.1, …, 1.0}`, Toleranz `1e-9`.
- Richtung: `bo1ToBo3WinRate(0.6) ≈ 0.648`; `bo3ToBo1WinRate(0.648) ≈ 0.6`.
- Monotonie: `q1 < q2 ⇒ bo3ToBo1WinRate(q1) < bo3ToBo1WinRate(q2)`.
- `bo1EquivalentWinRate({ bo1: 0/0/0, bo3: 0/0/0, unknown: 3/1/0 })` → `{ winRatePct: null, unknownGames: 4, convertedFromBo3: false }`.
- Reines Bo1 (`6W/4L/2T`) → `winRatePct === 55.6` bei `decimals = 1`, `convertedFromBo3 === false`.

### 3.3 `packages/shared/src/matchupConflict.ts` (neu)

```ts
import type { MatchupRow } from './matchupCsv.js';

/** Ab dieser Abweichung (Prozentpunkte) gelten zwei Quellen als widerspruechlich. */
export const MATCHUP_CONFLICT_THRESHOLD_PP: number; // 15

export interface MatchupConflict {
  /** Kanonisch sortiert: deck1 < deck2 (jedes Paar erscheint genau einmal). */
  deck1: string;
  deck2: string;
  /** WR aus eigenen Pairing-Daten, 0-100, aus deck1-Sicht. */
  ownWinRate: number;
  /** WR aus dem TrainerHill-Fallback, 0-100, aus deck1-Sicht. */
  fallbackWinRate: number;
  /** |ownWinRate - fallbackWinRate|, auf 1 Dezimale gerundet. */
  deltaPp: number;
  ownGames: number;
  fallbackGames: number;
}

/**
 * Findet Paare, die in beiden Quellen vorkommen, in denen die eigenen Daten den Fallback
 * ueberschreiben (>= minOwnGames) und deren WR um mehr als `thresholdPp` auseinanderliegen.
 * Rein und I/O-frei. Sortiert nach deltaPp absteigend, dann deck1, dann deck2.
 */
export function detectMatchupConflicts(
  own: MatchupRow[],
  fallback: MatchupRow[],
  opts?: { thresholdPp?: number; minOwnGames?: number },
): MatchupConflict[];
```

Verbindliche Eigenschaften:
- AC-Fall: eigene `70:30` (100 Spiele) vs. TrainerHill `45:55` → genau **ein** Konflikt-Eintrag mit `deltaPp === 25`; die Gegenrichtung erzeugt **keinen** zweiten Eintrag.
- Exakt am Schwellwert (`deltaPp === 15`) → **kein** Konflikt (`> threshold`, nicht `>=`).
- Eigene Daten unter `minOwnGames` (Default `MIN_MATCHUP_GAMES`) → kein Konflikt (der Fallback wird ja gar nicht überschrieben).
- Paar nur in einer Quelle → kein Konflikt.

### 3.4 Geänderte shared-Typen

```ts
// packages/shared/src/meta.ts
export interface MetaSnapshotData {
  // ... unveraendert ...
  wins: number;
  losses: number;
  ties: number; // NEU — Summe der Unentschieden der Periode
  // winRatePct: number | null;  Semantik NEU: (W + T/3)/(W+L+T), gerundet auf integer;
  //                             null nur noch, wenn ueberhaupt kein Spiel vorliegt.
}
```
`computeMetaSnapshots` summiert `p.record?.ties ?? 0` je Archetyp und benutzt
`tournamentWinRatePct(wins, losses, ties, 0)`. `MatchupRow` (`matchupCsv.ts:9-17`) bleibt
unverändert; nur die *Berechnung* von `winRate` in `directedRow` wechselt auf die geteilte Funktion.

### 3.5 Datenmodell + Migration

```ts
// apps/api/src/db/schema.ts
import { BEST_OF_VALUES } from '@pokekon/shared'; // Praezedenz: SWISS_MODE_VALUES, schema.ts:16

// opponentLogs:
bestOf: text('best_of', { enum: BEST_OF_VALUES }),   // NULLABLE = "Format unbekannt" (Altbestand)
// + check('opponent_logs_best_of_chk', sql`${table.bestOf} in ('BO1','BO3')`)

// metaSnapshots:
ties: integer('ties').notNull().default(0),
```

Erwartete Migration `apps/api/drizzle/0010_*.sql` (**generiert**, nicht handgeschrieben —
`npm run db:generate -w @pokekon/api`; das erzeugte SQL gegen diese Erwartung prüfen):

```sql
ALTER TABLE "opponent_logs" ADD COLUMN "best_of" text;
ALTER TABLE "opponent_logs" ADD CONSTRAINT "opponent_logs_best_of_chk" CHECK ("best_of" in ('BO1','BO3'));
ALTER TABLE "meta_snapshots" ADD COLUMN "ties" integer DEFAULT 0 NOT NULL;
```

Beide Änderungen sind rein additiv, ohne Rewrite bestehender Zeilen, ohne Drop, ohne
NOT-NULL-Zwang auf Altdaten → auf Railway gefahrlos vor dem Code-Deploy anwendbar (§5).

### 3.6 API-Wire-Contracts

```ts
// POST /api/logs  (apps/api/src/validation.ts)
// logFields NEU:  bestOf: z.enum(BEST_OF_VALUES)
// logBodySchema:  bestOf ist PFLICHT (kein Default, kein Raten aus eventType)
// logPatchSchema: bestOf optional ('BO1'|'BO3'); ein Zuruecksetzen auf null ist NICHT vorgesehen.
// -> 400 mit issues[].path === ['bestOf'], wenn beim POST nicht gesetzt.

// GET /api/logs -> Zeile
interface OpponentLogRow {
  // ... unveraendert ...
  bestOf: 'BO1' | 'BO3' | null; // null = Format unbekannt (Altbestand)
}

// GET /api/meta  (meta_snapshots)
// Zeilen enthalten zusaetzlich: ties: number

// GET /api/meta/field-analysis
// archetypes[]: zusaetzlich ties: number
// matchupSource: siehe unten

// GET /api/meta/archetypes/:id/analysis
// archetype: zusaetzlich ties: number

// GET /api/meta/matchups  &  /field-analysis  &  /archetypes/:id/analysis
interface MatchupSourceJson {
  ownPairs: number;
  fallbackPairs: number;
  ownGames: number;
  trainerHillImportedAt: string | null;
  /** NEU: Gesamtzahl widerspruechlicher Paare. */
  conflictCount: number;
  /** NEU: die staerksten Konflikte, absteigend nach deltaPp, auf 25 Eintraege gedeckelt. */
  conflicts: MatchupConflict[];
}
```
Zusätzlich: `loadMatchupData` schreibt bei `conflictCount > 0` **eine** zusammenfassende
`console.warn`-Zeile (`[meta] N matchup conflicts > 15pp …`) — die serverseitige Sichtbarkeit
aus dem AC. Die angezeigte Zahl bleibt in jedem Fall der eigene Wert.

### 3.7 Web-Contracts

```ts
// apps/web/src/types/index.ts
import type { BestOf } from '@pokekon/shared';

export interface OpponentLog {
  // ... unveraendert ...
  /** undefined = Format unbekannt (vor Einfuehrung des Feldes geloggt). */
  bestOf?: BestOf;
}

export interface MetaSnapshot {
  // ... unveraendert ...
  ties: number;
}

export interface ArchetypeStats {
  // winRate bleibt die Zahl ueber ALLE eigenen Logs — Formel wechselt aber auf
  // tournamentWinRatePct (tie-gewichtet), statt wins/(wins+losses). Entschieden 2026-08-31:
  // die Uneinheitlichkeit zwischen persoenlicher und Meta-WR wird NICHT auf Spec 4 verschoben.
  winRate: number | null;
  /** Bo1-vergleichbare persoenliche WR (Bo3 zurueckgerechnet, Unbekannte ausgeschlossen). */
  bo1EquivalentWinRate: number | null;
  bo1Games: number;
  bo3Games: number;
  unknownFormatGames: number;
}
```

```ts
// apps/web/src/components/meta/winRateColor.ts — Signatur erweitert (abwaertskompatibel)
export function winRatePct1(wins: number, losses: number, ties?: number): number | null;
```

```ts
// apps/web/src/lib/preferences.ts
export function isBestOfHintDismissed(): boolean;
export function dismissBestOfHint(): void;
// KEYS.bestOfHint = 'tcg-bestof-hint-dismissed-v1'
```

UI-Verhalten (verbindlich, testbar in `AddLogModal.test.tsx`):
- `bestOf`-Auswahl (zwei Buttons oder Select) ist im Formular **sichtbar** und immer änderbar.
- Vorbelegung: `eventType ∈ {Regional, Worlds}` → `'BO3'`, sonst `'BO1'`. Wechselt der Nutzer den
  `eventType`, wird die Vorbelegung nur nachgezogen, solange er `bestOf` **nicht** selbst angefasst hat.
- Speichern-Buttons bleiben deaktiviert, solange `bestOf === null`.
- „Save & next round" behält `bestOf` als Event-Kontext (wie `eventType`/Datum), setzt es nicht zurück.
- Log ohne `bestOf` → Badge mit Label `opponents:bestOf.unknown` in Liste und Detail-Modal.
- Detail-Modal eines Alt-Logs: einmaliger Hinweis mit Nachtrag-Auswahl; nach „Nicht mehr anzeigen"
  (bzw. Schließen des Hinweises) bleibt dauerhaft nur das Badge. Der Hinweis wird nie erneut
  gezeigt, sobald `isBestOfHintDismissed()`.

### 3.8 Backfill-Job

```ts
// apps/api/src/jobs/backfillMetaWinRates.ts (neu)
export interface BackfillMetaWinRatesResult {
  /** Perioden, fuer die Rohdaten (tournaments + standings) gefunden wurden. */
  periodsRecomputed: number;
  rowsUpdated: number;
  /** Wert war bereits korrekt. */
  rowsUnchanged: number;
  /** Keine Rohdaten fuer die Periode -> unangetastet gelassen. */
  rowsWithoutRawData: number;
  /** Rohdaten vorhanden, aber wins/losses weichen von der gespeicherten Zeile ab
   *  (anderer Sync-Scope) -> bewusst NICHT ueberschrieben, nur geloggt. */
  rowsSkippedMismatch: number;
  dryRun: boolean;
}

export async function backfillMetaWinRates(
  db: Db,
  opts?: { dryRun?: boolean; onlineOnly?: boolean; bo1Only?: boolean },
): Promise<BackfillMetaWinRatesResult>;
```
Verfahren (verbindlich):
1. `tournament_standings ⨝ tournaments` über die **gesamte** Historie lesen, gefiltert mit
   demselben Scope wie der Sync (`onlineOnly`/`bo1Only`, Default `true`/`true`).
2. Zeilen per `isoWeekLabel(tournament.date)` zu Perioden gruppieren, je Periode nach
   `tournamentId` untergruppieren und `computeMetaSnapshots(...)` aufrufen.
3. Je vorhandener `meta_snapshots`-Zeile (Match über `(period, archetype)`):
   - keine Rohdaten für die Periode → `rowsWithoutRawData`, **kein** Schreibzugriff;
   - `wins`/`losses` weichen ab → `rowsSkippedMismatch`, **kein** Schreibzugriff, `console.warn`;
   - sonst `UPDATE meta_snapshots SET win_rate_pct = …, ties = …` (nur diese zwei Spalten).
4. Es werden **keine** Zeilen eingefügt und **keine** gelöscht.
5. `dryRun: true` führt Schritt 3 ohne Schreibzugriff aus und liefert dieselben Zähler.

CLI: `node dist/jobs/backfillMetaWinRates.js [--dry-run]`, npm-Script
`job:backfill-winrates` in `apps/api/package.json` (Muster: `job:sync-meta`).

---

## 4. Umsetzungsreihenfolge (test-first)

Jede Verhaltens-Scheibe: **erst** der rote Test (`tester`), **dann** die Implementierung
(`implementer`). Nach jedem Schritt Root-Gates (`npm run typecheck && npm run lint && npm run test`)
und ein eigener Commit. Schritte 1–7 (Ties) und 12–14 (Konflikt) sind unabhängig von 8–11 (Bo1/Bo3)
— das sind die beiden Slices, die parallel laufen können.

**Slice A — Tie-Handling**

1. **Rot:** `packages/shared/src/winRate.test.ts` gegen §3.1 (Wertetabelle vollständig, inkl.
   `null`-Fall und defensiver Eingaben).
2. **Grün:** `packages/shared/src/winRate.ts` + Export in `packages/shared/src/index.ts`.
   → `test(shared): cover tournament win rate with tie weighting`, `feat(shared): add tie-aware tournament win rate`
3. **Rot:** `packages/shared/src/meta.test.ts` — neuer Test „counts ties as a third of a win"
   (`6W/4L/2T` → `winRatePct === 56`, `ties === 2`); der bestehende Test `:56-68` wird auf die neue
   Semantik umgeschrieben (`0W/0L/5T` → `33`) und ein echter `null`-Fall (keine Spiele) ergänzt.
   **Diese Teständerung ist bewusst und im Commit-Body zu begründen** (TDD-Regel: kein stilles Anpassen).
4. **Grün:** `packages/shared/src/meta.ts` — `MetaSnapshotData.ties`, Ties-Summierung,
   `tournamentWinRatePct`, Doc-Kommentar `:237-240` korrigieren.
   → `fix(shared): count ties as a third of a win in meta snapshots`
5. **Rot:** `apps/api/src/api.test.ts` — Meta-Sync-Szenario mit Ties in den gemockten Standings:
   `GET /api/meta` liefert `ties` und die tie-korrigierte `winRatePct`; `GET /api/meta/field-analysis`
   liefert `archetypes[].ties` und die korrigierte `winRatePct`; ein Matchup mit Ties in
   `/api/meta/matchups` liefert die tie-korrigierte `winRate` (AC-Beispiel `6/4/2` → `55.6`).
6. **Grün:** Schema (`metaSnapshots.ties`) + `npm run db:generate -w @pokekon/api` (Migration `0010`
   zusammen mit `best_of` erzeugen, s. Schritt 9 — falls Slice B später kommt, zwei getrennte
   Migrationen; beide additiv, Reihenfolge egal), `syncMeta.ts` (Select + Upsert),
   `routes/meta.ts` (`loadWindowAggregates` mit `ties`, `directedRow` über die geteilte Funktion,
   `ties` in beiden Response-Shapes).
   → `fix(api): propagate ties through meta sync and window aggregates`
7. **Rot → Grün:** Backfill-Job. Test in `apps/api/src/api.test.ts` (neuer `describe`, nutzt den
   bestehenden PGlite-Harness): Zeile mit altem, falschem `win_rate_pct` + passenden Rohdaten →
   `rowsUpdated === 1` und korrigierter Wert; Periode ohne Rohdaten → `rowsWithoutRawData === 1`,
   Wert **unverändert**; `wins`-Mismatch → `rowsSkippedMismatch === 1`, Wert unverändert;
   `dryRun: true` → identische Zähler, DB unverändert. Danach `backfillMetaWinRates.ts` + npm-Script.
   → `feat(api): add one-off backfill for historical meta win rates`
8. **Web-Anschluss:** `MetaSnapshot.ties`, `winRatePct1(wins, losses, ties)` und die drei
   Aufrufstellen (`MetaPage.tsx:262`, `ArchetypeDetail.tsx:231`, `MetaTable.tsx:154`), damit die
   Anzeige nicht von der Server-Zahl abweicht.
   → `fix(web): show tie-aware win rates in meta views`

**Slice B — Bo1/Bo3**

9. **Rot:** `packages/shared/src/bestOf.test.ts` gegen §3.2 (Fixpunkte, Round-Trip, Monotonie,
   Aggregat-Kombination, Unknown-Ausschluss).
10. **Grün:** `packages/shared/src/bestOf.ts` + Export.
    → `feat(shared): add best-of conversion and Bo1-equivalent win rate`
11. **Rot:** `apps/api/src/api.test.ts` — POST `/api/logs` **ohne** `bestOf` → 400; mit `'BO3'` → 201
    und `GET` liefert `bestOf: 'BO3'`; PATCH setzt `bestOf` auf einem Alt-Log nach; direkt in die DB
    geschriebene Zeile ohne `best_of` → `GET` liefert `bestOf: null`.
12. **Grün:** Schema (`opponentLogs.bestOf` + CHECK) + `db:generate`, `validation.ts`,
    `routes/logs.ts` (Insert + PATCH-Whitelist), `demoSeed.ts` (jedes Seed-Match bekommt einen Wert).
    → `feat(api): add explicit bestOf field to match logs`
13. **Rot:** `apps/web/src/components/opponent/AddLogModal.test.tsx` gegen §3.7
    (Default aus `eventType`, manuelle Änderung überschreibt den Default nicht mehr, Speichern
    blockiert ohne Auswahl, Wert landet im `createLog`-Body).
14. **Grün:** `AddLogModal.tsx`, `types/index.ts`, `lib/api.ts`, `lib/localImport.ts`, i18n-Keys.
    → `feat(web): ask for the match format when logging a game`
15. **Rot → Grün:** `getArchetypeStats` liefert `bo1EquivalentWinRate`/`unknownFormatGames` **und**
    berechnet `winRate` selbst tie-gewichtet über `tournamentWinRatePct` statt `wins/(wins+losses)`
    (Test in einem neuen `apps/web/src/db/queries.test.ts` oder — falls dort kein Harness existiert —
    in `apps/web/src/lib/api.test.ts`-Stil mit gemocktem `api`-Modul, inkl. AC-Beispiel `6W/4L/2T →
    55.6`); danach `MetaTable`/`WinRateChart` auf den Bo1-äquivalenten Wert umstellen und die
    ausgeschlossenen Spiele sichtbar machen.
    → `fix(web): count ties in personal win rate`, `feat(web): compare personal win rate to the meta on a Bo1 basis`
16. **Alt-Log-Handling:** „Format unbekannt"-Badge (`OpponentLog.tsx`, `MatchDetailModal.tsx`),
    Nachtrag-Auswahl im Modal, einmaliger dismissable Hinweis über `preferences.ts`.
    → `feat(web): flag logs with unknown match format and offer a one-time fix-up`

**Slice C — Quellen-Konsistenz**

17. **Rot:** `packages/shared/src/matchupConflict.test.ts` gegen §3.3 (AC-Fall 70:30 vs 45:55,
    Schwellwert-Grenze, zu wenige eigene Spiele, Paar nur in einer Quelle, Dedupe der Gegenrichtung).
18. **Grün:** `packages/shared/src/matchupConflict.ts` + Export.
    → `feat(shared): detect conflicts between own and TrainerHill matchup data`
19. **Rot:** `apps/api/src/api.test.ts` — Szenario mit eigenen Pairings, die dem gebündelten
    TrainerHill-Wert widersprechen: `/api/meta/matchups` liefert `matchupSource.conflictCount >= 1`
    und den Konflikt-Eintrag, **und** die ausgewiesene `rows[]`-WR bleibt der eigene Wert.
20. **Grün:** `routes/meta.ts` — Fallback-Zeile vor dem Überschreiben festhalten,
    `detectMatchupConflicts` aufrufen, `conflicts`/`conflictCount` in `matchupSourceJson`, ein
    `console.warn` pro Request mit Konflikten.
    → `feat(api): flag matchup pairs where own data contradicts TrainerHill`
21. **UI (klein):** Konfliktzahl im bestehenden Quellen-Hinweis der Matchup-Matrix
    (`MatchupMatrix.tsx` / `FieldScorePanel.tsx`, je nachdem wo `matchupSource` heute gerendert wird —
    vor der Umsetzung dort nachsehen) + i18n-Keys.
    → `feat(web): surface matchup source conflicts in the matrix note`

**Abschluss**

22. Doku-Schritt (alle Dateien aus §2, Block „Doku").
    → `docs: describe tie-aware win rate, bestOf field and matchup conflicts`
23. Volle Gates + `security-agent`-Review (neues User-Input-Feld `bestOf` → CLAUDE.md §3) +
    `code-review-agent`, dann PR.

---

## 5. Rollout, Migration & Rückwärtskompatibilität

**Reihenfolge auf Railway (verbindlich):**
1. PR mergen → Railway `preDeployCommand` führt `migrate:deploy` aus → Migration `0010` legt
   `best_of` (nullable) und `meta_snapshots.ties` (Default 0) an. Beide Spalten sind für den
   **alten** laufenden Code unsichtbar (kein NOT NULL ohne Default, kein Drop) → die Migration ist
   auch dann sicher, wenn sie Sekunden vor dem Code-Swap läuft.
2. Neuer Code startet. `meta_snapshots.ties` ist für alle Altzeilen `0` → deren `win_rate_pct`
   bleibt vorerst der alte (falsche) Wert, wird aber nicht *zusätzlich* verfälscht.
3. **Backfill zuerst als Dry-Run** (`node dist/jobs/backfillMetaWinRates.js --dry-run` in der
   Railway-Shell), Zähler prüfen und im PR/Issue festhalten. Erst danach der echte Lauf.
4. Erster regulärer Sync-Lauf schreibt die laufende Woche ohnehin komplett neu.

**Rückwärtskompatibilität**
- **Alt-Logs ohne `bestOf`:** bleiben `NULL`. Sie werden nirgends stillschweigend auf einen Default
  gemappt, sind in der UI als „Format unbekannt" erkennbar und fallen aus dem Bo1-Vergleich
  (`unknownGames`), zählen aber weiter in `winRate`, Record und allen bestehenden Auswertungen.
- **Alte Browser-Tabs:** Nach dem Deploy verlangt `POST /api/logs` `bestOf`. Ein noch offener Tab
  mit dem alten Bundle bekommt beim Speichern ein `400`. Da `apps/api` das Web-Bundle selbst
  ausliefert (`static.ts`), betrifft das nur Tabs, die den Deploy überdauern; ein Reload löst es.
  Alternative (falls das zu hart ist, siehe §6 Frage 3): `bestOf` serverseitig optional lassen und
  nur die UI erzwingen.
- **Backfill ist nicht destruktiv:** Er ändert nur `win_rate_pct` und `ties` von Zeilen, deren
  `wins`/`losses` exakt zur Neuberechnung passen; alles andere wird gezählt und geloggt statt
  überschrieben. Rückweg im Zweifel: erneuter Lauf nach Korrektur, oder `win_rate_pct` bleibt eben
  auf dem alten Wert — es gehen keine Rohdaten verloren (`tournament_standings` bleibt unangetastet).
- **Rollback der Migration:** additive Spalten; ein Code-Rollback funktioniert ohne Down-Migration
  (die Spalten bleiben dann ungenutzt liegen).

---

## 6. Risiken & offene Fragen

**Risiken**
1. **Nicht alle historischen Perioden sind rekonstruierbar.** `tournaments`/`tournament_standings`
   existieren erst seit Migration `0005`; ältere `meta_snapshots`-Zeilen haben keine Rohdaten
   (`rowsWithoutRawData`) und behalten ihren alten Wert. Der Trendbruch verschiebt sich damit an den
   Anfang der Rohdaten-Historie, statt ganz zu verschwinden. Der Dry-Run zeigt vor dem echten Lauf,
   wie viele Zeilen betroffen sind; das Ergebnis gehört ehrlich in die PR-Beschreibung (CLAUDE.md §2.1).
2. **Scope-Drift zwischen Sync und Backfill.** Der Sync schrieb historische Perioden ggf. mit anderen
   Filtern (`onlineOnly`/`bo1Only`, Turnier-Caps). Deshalb die `rowsSkippedMismatch`-Regel: bei
   abweichenden `wins`/`losses` wird nichts überschrieben. Ohne diese Regel könnte der Backfill
   stillschweigend eine andere Grundgesamtheit in alte Zeilen schreiben.
3. **Semantikwechsel von `winRatePct === null`.** Bisher „keine entschiedenen Spiele", künftig „gar
   keine Spiele". Betroffen: `WinRateBadge`, `winRateColor.ts`, die Doc-Kommentare in
   `apps/web/src/types/index.ts:6-10` und `:124-126`. Muss in Code-Kommentar **und** Doku
   nachgezogen werden, sonst steht dort eine Lüge.
4. **TrainerHills Tie-Konvention ist unbekannt.** `matchupCsv.ts` übernimmt `win_rate` unverändert
   (**belegt**); ob TrainerHill Ties rausrechnet oder mitzählt, ist **Unbekannt**. Der Konflikt-Check
   vergleicht also potenziell zwei unterschiedlich definierte Zahlen — genau deshalb ist er ein
   *Hinweis* und kein Auto-Fix. Diese Einschränkung gehört als Kommentar an `detectMatchupConflicts`
   und in `docs/features.md` §13.
5. **Performance `/api/meta/matchups`:** Die Konflikt-Erkennung läuft über die bereits geladenen
   Zeilen (O(Paare), keine zusätzliche Query, kein zusätzlicher Fetch) → keine messbare Regression
   erwartet. AC verlangt trotzdem einen Vorher/Nachher-Vergleich: einmal mit demselben Datensatz
   im PGlite-Harness die Response-Zeit loggen und in der PR notieren.
6. **`meta_snapshots.win_rate_pct` bleibt `integer`.** Der AC-Wert `55.6` entsteht auf dem
   Matchup-Pfad (1 Dezimale); der Snapshot-Pfad rundet weiterhin ganzzahlig (`56`). Bewusste
   Entscheidung: kein Spaltentyp-Wechsel in dieser Spec (Migrationsrisiko > Nutzen); Spec 3
   (Konfidenzbänder) kann das neu bewerten.
7. **Doppelte Wahrheit vermeiden (Golden Rule 4):** Es wird **keine** neue Dexie-Version angelegt —
   `apps/web/src/db/database.ts` bleibt unverändert, der lokale Store ist nur noch Import-Quelle.
   `bestOf` existiert damit ausschließlich serverseitig.

**Entscheidungen (bestätigt 2026-08-31 — alle vier Empfehlungen übernommen)**
1. **`ArchetypeStats.winRate` wird ebenfalls tie-gewichtet** — dieselbe geteilte
   `tournamentWinRatePct`-Funktion wie Meta-Snapshots/Matchup-Matrix (umgesetzt oben in §2/§3.7/
   Schritt 15). Weiterhin **nicht** angefasst, weil fachlich anderer Scope (Spec 4):
   `apps/api/src/lib/deckAnalytics.ts:23-30` (`WinRateBlock`, dokumentierte „decided games"-
   Semantik), `deckPerformanceStats.ts:45`, `useRecommendations.ts:23`, `DeckSwitcher.tsx:54`,
   `OverviewPage.tsx:17`.
2. **Konflikt-Schwelle:** Konstante in `@pokekon/shared` (`MATCHUP_CONFLICT_THRESHOLD_PP`), per
   `opts` überschreibbar — keine Env-Variable, kein UI-Regler. Bereits so in §3.3 umgesetzt.
3. **`bestOf` beim POST hart Pflicht (400).** Bereits so in §3.6 umgesetzt (kein Plan-Update nötig,
   diese Frage bestätigte nur das bereits verbindliche Design).
4. **Demo-Seed:** alle Demo-Logs bekommen einen `bestOf`-Wert. Bereits so in §2/Schritt 12 umgesetzt.

---

## 7. Definition of Done

> **Nachtrag 2026-08-31 (nach Umsetzung):** Die Zeile "keine neue Route" unten wurde während der
> Umsetzung bewusst gebrochen. `localImport.ts` (Alt-Logs aus der lokalen Dexie-DB, kein `bestOf`
> vorhanden) hätte sonst der harten `bestOf`-Pflicht am regulären `POST /api/logs` widersprochen
> (Entscheidung: `bestOf` wird abgefragt, nicht geraten — kein eventType-Default für Altdaten).
> Lösung: neuer Batch-Endpoint `POST /api/logs/import` (Commit `ef17f42`) + eine Begleit-Tabelle
> `legacy_import_state` (Migration `0012`), die pro Nutzer genau einen erfolgreichen Aufruf mit
> `bestOf: null` zulässt (Commit `664e927`). Grund: Import ist ein einmaliger Migrations-Vorgang
> pro Nutzer, kein laufendes Feature — eine zweite Route mit harter Einmal-Sperre ist die
> risikoärmere Lösung gegenüber einem Sonderfall in der regulären Validierung. Review-Runde 2/3
> (Code-Review, siehe PR-Historie) deckte eine Race Condition zwischen Log-Insert und
> Sperr-Zeilen-Insert auf, die die Einmal-Garantie unterlief — Fix: Sperr-Zeile per
> `INSERT ... ON CONFLICT (user_id) DO NOTHING RETURNING` zuerst beanspruchen, gesamte Operation
> in eine Transaktion.

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` (Repo-Root) grün — ehrlich berichtet, nichts übersprungen.
- [ ] Alle Akzeptanzkriterien der Spec abgehakt, inkl. des AC-Beispiels `6W/4L/2T → 55.6 %`.
- [ ] Genau **eine** Implementierung der Win-Rate-Formel; `grep -rn "wins + losses" apps packages`
      liefert weder an den Meta-Pfaden noch bei `ArchetypeStats.winRate` (`queries.ts`) eine zweite
      Berechnung mehr. Verbleibende Treffer sind bewusst unangetastete, fachlich andere
      Personal-Analytics-Semantik (`deckAnalytics.ts`, `deckPerformanceStats.ts`,
      `useRecommendations.ts`, `DeckSwitcher.tsx`, `OverviewPage.tsx` — Scope Spec 4, siehe §6
      Entscheidung 1).
- [ ] Neue Tests: Happy Path **und** je ein Fehler-/Randfall pro Slice (kein Spiel → `null`;
      POST ohne `bestOf` → 400; Konflikt exakt auf der Schwelle → kein Flag; Backfill ohne Rohdaten
      → keine Schreiboperation).
- [ ] Migration `0010` generiert (nicht handgeschrieben), im PGlite-Harness angewandt, additiv,
      ohne Datenverlust; Down-Weg in §5 beschrieben.
- [ ] Backfill zuerst als Dry-Run gelaufen, Zähler in der PR dokumentiert; danach echter Lauf.
- [ ] Cold-Start/Empty-State geprüft: kein Deck, keine Logs, kein Meta, keine eigenen Pairings
      (Konflikt-Liste dann leer, nicht `undefined`).
- [ ] Auth/Validierung: `bestOf` durchläuft Zod (`z.enum`) **und** den DB-CHECK; keine neue Route,
      kein neuer externer Call, keine Secrets im Diff, kein kostenpflichtiger Dienst.
- [ ] Doku aktualisiert: `docs/features.md` (§1, §2, §6, §13, §15), `docs/database.md`
      (Spalten + Migrations-Historie + Backfill-Job), `docs/data-types.md`, `docs/data-flow.md`.
- [ ] `security-agent` (neues User-Input-Feld) und `code-review-agent` gelaufen; Review auch gegen
      die Spec-Akzeptanzkriterien.
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body; die bewusste Änderung des
      bestehenden `meta.test.ts`-Tests ist im Commit-Body begründet.
