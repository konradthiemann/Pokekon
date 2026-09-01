# Plan — Spec 4: Personal Tracker vom Kern-Feature zum optionalen Verstärker

> **Bindende Grundlage:** [`specs/personal-data-role-rework.md`](../../specs/personal-data-role-rework.md)
> (freigegeben; liegt auf Branch `docs/spec-driven-rework-specs`, noch nicht in `main`).
> Kontext: Teil 4 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> **Baut auf Spec 2 auf** (PR #45, `02c698c` — **in `main` gemergt**): `bestOf`-Feld im
> `AddLogModal`, „Format unbekannt"-Badge, tie-gewichtete `tournamentWinRatePct`.
> **Spec 3** (`feat/confidence-aware-matchups`, `9c2819a`) ist **noch nicht in `main`** — berührt
> aber **keine** der hier geänderten Dateien (belegt: `git diff --stat main origin/feat/confidence-aware-matchups`
> listet nur `packages/shared/{wilsonInterval,fieldWinRate,index}`, `apps/api/{routes/meta,api.test}`,
> `apps/web/src/components/meta/*`, `apps/web/src/lib/api.ts` (+3 Zeilen `FieldAnalysisArchetype`),
> `docs/*`). → **Branch `feat/personal-data-role-rework` zweigt von `main` ab**, unabhängig davon,
> ob Spec 3 vorher merged; der einzige gemeinsame Berührungspunkt ist `apps/web/src/lib/api.ts`
> (Spec 3 fügt Felder an `FieldAnalysisArchetype` an, Spec 4 an `LogWriteBody` — unterschiedliche
> Interfaces, trivialer Merge).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `02c698c`)

Alle Zeilenangaben der **Spec** stammen aus der Zeit **vor** Spec 2 und stimmen nicht mehr.
Korrekturen sind hier markiert. Golden Rule 1.

### 0.1 `AddLogModal.tsx` — alle Spec-Zeilenangaben haben sich verschoben

| Spec sagt | Tatsächlich (`main`) |
|---|---|
| `:53-56` progressive disclosure | Doc-Kommentar `:57-72`; das `<details>` selbst `:375-429` |
| `:57-59` „Save & next round" | Doc-Kommentar `:68-70`; Button `:442-449`; Reset-Logik `:169-176` |
| `:80,133` `battleLog` als Zusatzfeld | State `:108`; Payload `:162`; Textarea `:415-427` |
| `:127-135` `handleSave` | `:148-182` |

**Von Spec 2 neu dazugekommen und in der Spec nicht erwähnt:**
- `AddLogModal.tsx:44-49` — `defaultBestOfForEventType()` (Regional/Worlds → `BO3`, sonst `BO1`).
- `:92-102` — `bestOf`/`bestOfTouched`/`lastEventTypeForDefault`-State inkl. des
  **adjust-state-during-render**-Musters (`if (eventType !== lastEventTypeForDefault) …`).
  Genau dieses Muster wird für die Log-Vorbelegung wiederverwendet (§3.5) — kein neues Konzept.
- `:311-334` — Bo1/Bo3-Auswahlbuttons zwischen „Ergebnis" und „Event-Typ".
- `:149` und `:444`/`:452` — `bestOf === null`-Guards blockieren Speichern.
- `apps/web/src/components/opponent/AddLogModal.test.tsx` — **es gibt bereits einen RTL-Harness**
  für dieses Modal (5 Tests, `vi.mock` auf `db/queries` + `store/dashboardStore`,
  `i18n.changeLanguage('en')`). Der `tester` baut darauf auf, nicht auf grüner Wiese.

### 0.2 Die Section-Navigation liegt **nicht** in `DeckSwitcher.tsx`

Die Spec zitiert `todo/todo.md` §5 („Section-Navigation in `DeckSwitcher.tsx`"). Das ist
**veraltet**: `todo/todo.md:211-251` beschreibt einen Zustand mit Chips und Trash-Icon in
`DeckSwitcher.tsx:111-155`, den es nicht mehr gibt.

- `apps/web/src/components/deck/DeckSwitcher.tsx:10` — enthält **nur noch** den Typ
  `export type DeckSection = 'deck' | 'analytics' | 'log'`. Die Komponente selbst rendert
  ausschließlich die Deck-Liste + Archetyp-Picker.
- `apps/web/src/pages/DeckPage.tsx:166-170` — `SECTIONS` (deckList / analytics / matchLog).
- `apps/web/src/pages/DeckPage.tsx:194-210` — die drei gleichrangigen Tab-Buttons (`flex-1`,
  identisches Styling). **Das ist die Fundstelle für das IA-Akzeptanzkriterium.**
- `apps/web/src/pages/DeckPage.tsx:265-267` — `activeSection === 'log'` → `<OpponentLog … showAddButton />`.
- `apps/web/src/components/opponent/OpponentLog.tsx:29-30` — `showAddButton` ist bereits
  `@deprecated` und wird ignoriert; der Add-Button ist `:190-200` (nur wenn Einträge existieren)
  bzw. `:77-80` (Empty-State).
- **Einziger Aufrufer** von `OpponentLog` ist `DeckPage.tsx:266` (verifiziert per grep).
- Top-Level-Navigation ist davon unberührt: `App.tsx:44-49` + `Sidebar.tsx:20-25` +
  `BottomNav.tsx` = `overview | meta | deck | recommendations`. Match-Log ist dort **kein**
  eigener Punkt — die Spec-Aussage „drei co-gleichrangige Tabs bilden die Haupt-IA" gilt also
  nur **innerhalb** der Deck-Seite.
- `apps/web/src/components/layout/CollapsibleSection.tsx` existiert bereits (`defaultOpen`-Prop,
  `card`-Wrapper, Chevron) — die IA-Umsetzung braucht keine neue Komponente.

### 0.3 Der Parser erkennt **keinen** Gegner-Archetyp — und liefert keine Konfidenz

Das ist der wichtigste Befund. `docs/features.md:153` listet unter „What is parsed" den Punkt
**„Player names (detected by frequency analysis on action lines)"** — die Spec liest das als
„Gegner-Erkennung" im Sinne von *Archetyp*. Das ist eine Fehlinterpretation.

- `packages/shared/src/battleLogParser.ts:57-79` — `ParsedBattleLog` enthält
  `player1`, `player2`, `winner`, `turns`, `prizeProgression`, `damageByTurn`, `cardFrequency`,
  `totalDamage`, `totalKOs`, `parserVersion`, `firstPlayer`, `wentFirst`, `setupCleanByTurn2`,
  `deadTurns`. **Kein Feld für Archetyp, kein Konfidenzwert, kein Score.**
- `:121-185` `detectPlayers` — die „Häufigkeits-Heuristik" betrifft ausschließlich
  **Spielernamen** (`counts`-Map + Stopwort-Liste + Sortierung). Die Rangliste wird nicht
  exportiert; die Funktion ist modul-privat.
- `:329-337` — `myPlayerName` wird **nur bei exaktem String-Match** übernommen, sonst still auf
  `autoP1` zurückgefallen (`:333-334` sagt das ausdrücklich: „silently assigning the wrong player").
  → Ob die „ich/Gegner"-Zuordnung stimmt, ist von außen prüfbar (`parsed.player1 === myPlayerName`),
  aber nur, wenn der Aufrufer es selbst prüft. **Tut heute niemand.**

**Konsequenz für die Spec-Frage „Parser-Konfidenz-Schwelle":** Es gibt nichts zu schwellen.
Eine Archetyp-Erkennung inklusive Eindeutigkeitsmaß muss **neu** gebaut werden (§3.1–3.3).
Das kollidiert **nicht** mit dem Out-of-Scope-Punkt der Spec („Änderungen an
`battleLogParser.ts`"): das neue Modul konsumiert `ParsedBattleLog`, ohne den Parser anzufassen —
mit **einer** begründeten Ausnahme, siehe §0.5.

### 0.4 Welches Material für eine Archetyp-Erkennung überhaupt da ist

Aus `ParsedBattleLog` sind gegnerische Kartennamen ableitbar:
- `battleLogParser.ts:369-406` — jedes `ParsedTurn` trägt `player`, `activePokemon` (aus
  Angriffszeilen, `:262-271`), `bench` (aus „… auf die Bank gelegt", `:247-252`) und
  `cardsPlayed` (aus „… hat X gespielt.", `:232-238`).
- `:274-278` — `kos` sind als `"${pokemon} (${owner})"` formatiert, also besitzer-zuordenbar.
- `:434-444` — `cardFrequency` ist **nur player1** und damit für den Gegner unbrauchbar.

**Was der Parser NICHT erfasst** (jeweils verifiziert an den Regexen):
- „X hat `<Pokémon>` in die Aktive Position gelegt." (Startaufstellung) — kein Match.
- „`<Pokémon>` von X ist jetzt in der Aktiven Position." — kein Match.
- „X hat `<A>` in der Aktiven Position zu `<B>` entwickelt." — kein Match.
→ Die Evidenzmenge ist also lückenhaft, aber nicht leer. Das ist der Grund, warum das
Vorbelegungs-Design **Unter-Erkennung** verkraften muss (und tut, §3.3).

### 0.5 Echte deutsche Logs: zwei harte, belegte Befunde

Referenz ist `apps/api/src/lib/demoSeed.ts:150-224` — ausdrücklich **Konrads eigener,
wörtlich übernommener** Log (`LOG_NZOROARK_WIN`, Kommentar `:150-152`).

**Befund A — Pokémon- UND Trainer-Namen sind vollständig deutsch lokalisiert.**
Belegte Zeilen: `Ns Zoroark-ex`, `Mega-Kangama-ex` (= Kangaskhan), `Türkisgrüne-Maske-Ogerpon-ex`,
`Furienblitz-ex` (= Raging Bolt), `Mega-Schlapor-ex` (= Lopunny), `Haspiror` (= Dudunsparce),
`Rockos Erkundung`, `Schloss von N`, `Hyperball`, `Höhlensystem Null`.
Damit ist auch der Doc-Kommentar `battleLogParser.ts:82-88` („Card names in PTCG Live German
logs are the English print names for Trainers") **für reale Logs falsch** — die
`KNOWN_SUPPORTERS`-Allowlist (`:89-111`, alle Einträge englisch) greift in echten deutschen Logs
praktisch nie, wodurch `setupCleanByTurn2` (`:470-472`) systematisch zu niedrig ausfällt.
*Vorbefund, außerhalb dieses Scopes — gehört als Notiz nach `docs/features.md` §7 und in §6 Risiko 6.*
→ **Für Spec 4 heißt das:** `KNOWN_ARCHETYPES` (englische Namen) kann **nicht** direkt gegen
Log-Zeilen gematcht werden. Es braucht eine deutsche Signaturtabelle (§3.2).

**Befund B — die Gewinner-Erkennung versagt bei Aufgabe/Timeout.**
`battleLogParser.ts:457` — `line.match(/^(\S+) hat gewonnen/)`. Die Schlusszeile des realen Logs
ist `demoSeed.ts:224`: `Du hast aufgegeben. Gtmap hat gewonnen.` — **kein Match** (empirisch
nachgeprüft: `false`). Die anderen vier Demo-Logs enden auf `X hat gewonnen!` → Match.
→ Bei aufgegebenen Spielen (online der Normalfall) ist `winner === null`, die Ergebnis-
Vorbelegung fällt also aus. Deshalb: **ein** begründeter, additiver Eingriff in
`battleLogParser.ts` (§3.4, Entscheidung 5) — umgesetzt, siehe §6 Entscheidung 2.

### 0.6 `playerName` — vorhanden, aber im Log-Anlege-Pfad ungenutzt

- `apps/web/src/lib/demo.ts:11` — `export const PLAYER_NAME_KEY = 'tcg-player-name'`.
- Gesetzt wird der Wert nur an zwei Stellen: `WelcomeScreen.tsx:43` (Demo-Login) und
  `MatchDetailModal.tsx:337` (beim Klick auf „Analysieren").
- Gelesen: `MatchDetailModal.tsx:265`, `DeckPerformancePanel.tsx:279`, `RecommendationsPage.tsx:21`.
- `AddLogModal.tsx` liest ihn **nicht**.
- `apps/api/src/validation.ts:66-70` — `playerName` ist bereits ein akzeptiertes (nicht
  persistiertes) Feld auf `POST /api/logs` **und** `PATCH`, ausdrücklich um serverseitig „mich"
  zu pinnen.
- `apps/api/src/routes/logs.ts:61-65` + `:250-254` → `syncParsedLog(db, { …, playerName: body.playerName })`.
- **Aber:** `apps/web/src/lib/api.ts:322` — `export type LogWriteBody = Omit<OpponentLog, 'id'>`,
  und `types/index.ts:68-82` hat kein `playerName`. Der Web-Client sendet das Feld **nie**.
  → `matchLogPipeline.ts:37` parst serverseitig immer mit `''` und damit heuristisch. Die
  persistierten `match_log_parsed.turns` können der falschen Seite zugeordnet sein.
  **Neue, in der Spec nicht vorgesehene Fundstelle** (Analogon zur `loadWindowAggregates`-Lücke
  aus Spec 2) — Behebung ist Teil dieses Plans (§3.6), weil Spec 4 den Namen ohnehin im Modal
  braucht und ein „im Modal stimmt's, in der DB nicht" Golden Rule 4 verletzen würde.

### 0.7 Von Spec 2 ausdrücklich **auf Spec 4 vertagte** Win-Rate-Stellen

`.claude/plans/data-correctness-fixes.md` §6 Entscheidung 1 (und Commit `06eb0b8`, Body)
listen namentlich die fünf Personal-Analytics-Stellen, die weiter `wins/(wins+losses)` rechnen.
Aktueller Stand (grep `"wins + losses"`, ohne Tests):
- `apps/web/src/components/deck/DeckSwitcher.tsx:54` (WR-Pille pro Deck)
- `apps/web/src/components/deck/DeckAnalyticsPanel.tsx:28` (`wr()`-Helper), `:134`
- `apps/web/src/hooks/useRecommendations.ts:23` (`winRate()`-Helper)
- `apps/web/src/pages/OverviewPage.tsx:17-18`
- `apps/api/src/lib/deckAnalytics.ts:23` (dokumentierte „decided games"-Semantik)
`packages/shared/src/winRate.ts` (`tournamentWinRatePct`) ist die vorhandene Zielfunktion.
**Diese Erbschaft steht in keinem Akzeptanzkriterium von Spec 4** → wird trotzdem mitgenommen, §6 Entscheidung 1.

### 0.8 Eingabe-Validierung: `battleLog` ist unbegrenzt

- `apps/api/src/validation.ts:66` — `battleLog: z.string().nullish()`, **kein `.max()`**.
- `:188` — `analyzeLogSchema.battleLog: z.string().min(1)`, ebenfalls ohne Obergrenze.
- `bodyLimit` wird im gesamten Backend nur für den CSV-Upload benutzt
  (`apps/api/src/routes/matchups.ts:27-32`, `MAX_CSV_BYTES`). `/api/logs` hat keinen.
→ Spec 4 macht den Paste-Pfad zum **primären** Eingabeweg; die Lücke gehört genau jetzt
geschlossen (§3.7) und ist der Hauptpunkt für den `security-agent`.

### 0.9 Infrastruktur

- Gates (Root `package.json`): `npm run typecheck`, `npm run lint`, `npm run test` — jeweils mit
  vorgeschaltetem `npm run build -w @pokekon/shared`.
- Web-Tests: vitest + jsdom + RTL, `apps/web/vitest.config.ts`, Setup `src/test/setup.ts`,
  Include `src/**/*.test.{ts,tsx}`.
- Shared-Tests: vitest, `packages/shared/src/*.test.ts` (u. a. `battleLogParser.test.ts` mit
  `SAMPLE_LOG`-Fixture ab `:4`).
- i18n: `apps/web/src/i18n/locales/{de,en}/{opponents,deck,overview,recommendations}.json`.
  Bestehende Keys: `opponents.addLog.*`, `opponents.bestOf.*`, `deck.page.tabs.*`.
- `packages/shared/src/index.ts` — Barrel, braucht neue Re-Exports.

---

## 1. Summary

Der Battle-Log-Paste wird im „Match loggen"-Formular vom versteckten Zusatzfeld zum **ersten
Feld**: wer einen TCG-Live-Log einfügt, bekommt Gegner-Archetyp und Ergebnis vorgeschlagen,
statt beides erneut von Hand einzutragen. Weil der bestehende Parser weder Archetypen erkennt
noch eine Konfidenz liefert (§0.3), entsteht dafür ein **neues, reines Modul**
`@pokekon/shared/battleLogPrefill` — es liest ausschließlich die vorhandene
`ParsedBattleLog`-Ausgabe, leitet aus den gegnerischen Karten- und Pokémon-Namen
Archetyp-Kandidaten ab und liefert statt einer erfundenen Prozent-Konfidenz eine **belastbare
Eindeutigkeitsaussage**: `unique` (genau ein Archetyp voll belegt → wird automatisch gesetzt),
`ambiguous` (mehrere gleich gut → bis zu drei Chips zum Antippen, nichts wird geraten) oder
`none` (stiller Rückfall auf das manuelle Formular). Das Ergebnis wird nur bei `BO1` und nur bei
korrekt gepinntem Spielernamen vorbelegt; ist der Spielername unbekannt, fragt das Modal
einmalig „Welcher Spieler bist du?" mit den zwei erkannten Namen. Weil deutsche Logs deutsche
Kartennamen tragen (§0.5), bekommt `KNOWN_ARCHETYPES` ein optionales `logNames`-Feld mit
deutschen Signaturfragmenten; fehlt es, greift der englische Name — dessen einzige mögliche
Folge ist eine **verpasste**, nie eine **falsche** Erkennung. Parallel verliert das Match-Log
seinen Tab-Status: die Deck-Seite hat danach zwei statt drei gleichrangige Sections
(Deckliste / Analysen), die Log-Liste lebt als standardmäßig eingeklappter Bereich am Ende der
Analysen, und die Aktion „Match loggen" bleibt als kleiner, dauerhaft sichtbarer Button
einen Klick entfernt. Overview und Empfehlungen erklären bei null Logs, dass die Meta-Analyse
bereits ohne eigene Daten arbeitet. Kein Datenmodell-Eingriff, keine Migration; ergänzt werden
nur das bisher nie mitgesendete `playerName` (schließt eine belegte Inkonsistenz, §0.6) und eine
Längenbegrenzung für `battleLog` (§0.8).

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik — Single Source of Truth)**
- [ ] `packages/shared/src/battleLogPrefill.ts` **(neu)** — `ArchetypeSignature`,
      `ArchetypeCandidate`, `OpponentArchetypeGuess`, `BattleLogPrefill`,
      `normaliseCardName`, `opponentCardNames`, `guessOpponentArchetype`,
      `resultFromParsedLog`, `prefillFromBattleLog`
- [ ] `packages/shared/src/battleLogPrefill.test.ts` **(neu)** — Wertetabellen aus §3
- [ ] `packages/shared/src/battleLogParser.ts` — **eine** Zeile: Gewinner-Regex `:457`
      toleriert einen Satz-Präfix (§3.4, Entscheidung 5). Sonst unangetastet.
- [ ] `packages/shared/src/battleLogParser.test.ts` — Regressionstest für die Aufgabe-Zeile
- [ ] `packages/shared/src/index.ts` — Re-Export

**Datenmodell / Migration**
- [ ] **entfällt bewusst** — es wird kein Feld persistiert, das es nicht schon gibt (§5).

**API**
- [ ] `apps/api/src/validation.ts` — `MAX_BATTLE_LOG_CHARS` + `.max()` auf `logFields.battleLog`
      und `analyzeLogSchema.battleLog` (§3.7)
- [ ] `apps/api/src/api.test.ts` — 413/400-Fall für einen überlangen `battleLog`;
      Wire-Test, dass ein mitgesendetes `playerName` die persistierte
      `match_log_parsed`-Zuordnung pinnt

**Web — Eingabe**
- [ ] `apps/web/src/constants/archetypes.ts` — `KnownArchetype.logNames?: string[]`,
      neue Funktion `archetypeSignatures()`
- [ ] `apps/web/src/constants/archetypes.test.ts` **(neu)** — Invarianten der Signaturtabelle
- [ ] `apps/web/src/components/opponent/AddLogModal.tsx` — Battle-Log-Feld nach oben,
      Vorbelegung, Spielername-Klärung, Kandidaten-Chips, „aus Log"-Marker,
      `playerName` im Save-Payload
- [ ] `apps/web/src/components/opponent/AddLogModal.test.tsx` — neue Suite (bestehende
      `bestOf`-Tests bleiben unverändert gültig)
- [ ] `apps/web/src/lib/api.ts:322` — `LogWriteBody` um optionales `playerName`
- [ ] `apps/web/src/db/queries.ts:181-184` — `addOpponentLog` reicht `playerName` durch

**Web — Informationsarchitektur**
- [ ] `apps/web/src/components/deck/DeckSwitcher.tsx:10` — `DeckSection` auf zwei Werte
- [ ] `apps/web/src/pages/DeckPage.tsx:166-170,194-210,265-267` — zwei Sections,
      „Match loggen"-Button in der Tab-Leiste, Log-Liste als eingeklappter Bereich
- [ ] `apps/web/src/components/opponent/OpponentLog.tsx` — `chrome`-Prop (§3.8),
      `showAddButton` (deprecated) entfernen
- [ ] `apps/web/src/pages/DeckPage.test.tsx` **(neu)** — IA-Akzeptanzkriterium als Test
- [ ] `apps/web/src/pages/OverviewPage.tsx` — Hinweisbanner bei null Logs
- [ ] `apps/web/src/pages/RecommendationsPage.tsx:66-90` — derselbe Hinweis im
      bestehenden Info-Block

**i18n**
- [ ] `apps/web/src/i18n/locales/{de,en}/opponents.json` — `addLog.fromLog.*` (§3.9)
- [ ] `apps/web/src/i18n/locales/{de,en}/deck.json` — `page.tabs` ohne `matchLog`,
      neu `page.matchLogSection`, `page.logMatch`
- [ ] `apps/web/src/i18n/locales/{de,en}/{overview,recommendations}.json` — `metaWorksWithoutLogs.*`

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `docs/features.md` §4 (Snapshots: im Log-Kontext angeboten, kein Hauptbereich),
      §6 (Battle-Log-first, IA), §7 (**Korrektur**: kein Archetyp im Parser; deutsche
      Kartennamen; Gewinner-Zeile bei Aufgabe), §10 (unveränderte Regel-Logik ausdrücklich
      bestätigen)
- [ ] `docs/data-types.md` — die vier neuen Typen
- [ ] `docs/data-flow.md` — wo die Vorbelegung entsteht (Client, `@pokekon/shared`) und dass
      nichts Zusätzliches persistiert wird
- [ ] `docs/architecture.md` — IA-Absatz Deck-Seite, falls dort die drei Sections stehen
      (vor der Änderung prüfen)
- [ ] `todo/todo.md` §5 — als überholt markieren (§0.2), nicht stillschweigend stehen lassen

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen, Regeln und nachrechenbare Wertetabellen — keine Implementierungsvorgaben darüber
hinaus.

### 3.1 `packages/shared/src/battleLogPrefill.ts` — Typen

```ts
import type { ParsedBattleLog } from './battleLogParser.js';

/**
 * One archetype's recognition signature. Supplied BY THE CALLER (the web app owns
 * KNOWN_ARCHETYPES) so this module stays free of UI constants and stays testable
 * with tiny hand-written tables.
 */
export interface ArchetypeSignature {
  slug: string;
  name: string;
  /**
   * Card-name fragments as they appear in a GERMAN PTCG-Live log — Pokémon AND
   * Trainer names are localised (see plan §0.5). Must be non-empty.
   */
  logNames: string[];
}

export interface ArchetypeCandidate {
  slug: string;
  name: string;
  /** Distinct signature fragments found among the opponent's cards. */
  matched: string[];
  /** matched.length / logNames.length, in [0, 1]. Unrounded. */
  coverage: number;
}

/**
 * - 'unique'    exactly one candidate reaches coverage 1 and no other candidate
 *               shares the top coverage  -> safe to pre-select
 * - 'ambiguous' at least one candidate, but not the above -> offer, never pick
 * - 'none'      no fragment matched at all
 */
export type GuessConfidence = 'unique' | 'ambiguous' | 'none';

export interface OpponentArchetypeGuess {
  /** Sorted by coverage desc, then name asc. At most 3 entries. */
  candidates: ArchetypeCandidate[];
  /** Non-null exactly when confidence === 'unique'. */
  best: ArchetypeCandidate | null;
  confidence: GuessConfidence;
}

export interface BattleLogPrefill {
  parsed: ParsedBattleLog;
  /**
   * true when the supplied playerName exactly matched one of the two detected
   * players. false means the me/opponent split is a heuristic guess and the UI
   * MUST ask before using `result` (battleLogParser.ts:333-334).
   */
  playerPinned: boolean;
  detectedPlayers: [string, string];
  /** Opponent-side card names, de-duplicated, first-seen order. */
  opponentCards: string[];
  archetype: OpponentArchetypeGuess;
  /** See resultFromParsedLog. Never 'T'. */
  result: 'W' | 'L' | null;
}
```

### 3.2 Namens-Normalisierung (verbindlich, weil sie das Matching definiert)

```ts
/**
 * Lower-cases, drops apostrophes, turns hyphens/underscores into spaces, removes
 * the card-suffix tokens ex/gx/v/vmax/vstar, and collapses whitespace.
 * "Ns Zoroark-ex" -> "ns zoroark"   "Türkisgrüne-Maske-Ogerpon-ex" -> "türkisgrüne maske ogerpon"
 */
export function normaliseCardName(name: string): string;
```

Verbindliche Wertetabelle:

| Eingabe | Ausgabe |
|---|---|
| `Ns Zoroark-ex` | `ns zoroark` |
| `N's Zoroark ex` | `ns zoroark` |
| `Mega-Kangama-ex` | `mega kangama` |
| `Türkisgrüne-Maske-Ogerpon-ex` | `türkisgrüne maske ogerpon` |
| `Haspiror` | `haspiror` |
| `Schloss von N` | `schloss von n` |
| `  Dragapult   ex ` | `dragapult` |
| `` (leer) | `` |

**Match-Regel (verbindlich):** Ein Fragment `f` matcht eine Karte `c` genau dann, wenn
`(' ' + normaliseCardName(c) + ' ')` die Zeichenkette `(' ' + normaliseCardName(f) + ' ')`
enthält — also **Token-Grenzen-treu**. Damit matcht `Zoroark` auf `Ns Zoroark-ex`, aber
`Absol` nicht auf `Absolem`. Leere Fragmente matchen nie.

### 3.3 Gegner-Karten und Archetyp-Rateschluss

```ts
/**
 * Card and Pokémon names attributable to the OPPONENT (parsed.player2):
 *   - activePokemon of every opponent turn
 *   - bench of every opponent turn
 *   - cardsPlayed of every opponent turn (Trainers included — a non-matching
 *     name is harmless noise, a matching one is real evidence)
 *   - every KO whose owner is player2 (kos entries look like "Name (Owner)",
 *     battleLogParser.ts:274-278)
 * De-duplicated, first-seen order. Empty array when the log has no opponent turns.
 */
export function opponentCardNames(parsed: ParsedBattleLog): string[];

/**
 * Coverage-based, ambiguity-aware archetype guess. Deliberately NOT a score in
 * percent: the parser exposes no confidence at all (plan §0.3), so inventing one
 * would be a fabricated number. Coverage ("how much of this archetype's signature
 * did we actually see") is directly derived from evidence.
 */
export function guessOpponentArchetype(
  opponentCards: string[],
  signatures: ArchetypeSignature[],
): OpponentArchetypeGuess;
```

**Verbindliche Regeln:**
1. `coverage_i = |distinct matched fragments| / |signature_i.logNames|`, nur Signaturen mit
   `matched.length > 0` sind Kandidaten.
2. Sortierung: `coverage` absteigend, dann `name` aufsteigend. `candidates` = die ersten 3.
3. `confidence = 'none'` ⇔ keine Kandidaten ⇒ `candidates: []`, `best: null`.
4. `confidence = 'unique'` ⇔ `candidates[0].coverage === 1` **und**
   `candidates[1]?.coverage !== candidates[0].coverage` ⇒ `best = candidates[0]`.
5. sonst `confidence = 'ambiguous'`, `best = null`.
6. Signaturen mit leerem `logNames` werden ignoriert (kein Division-durch-Null).

**Verbindliche Wertetabelle** (Signaturen: `A = {slug:'n-zoroark', logNames:['Zoroark']}`,
`B = {slug:'lopunny-dudunsparce', logNames:['Schlapor','Haspiror']}`,
`C = {slug:'greninja', logNames:['Quajutsu']}`):

| Gegner-Karten | Kandidaten (slug/coverage) | `confidence` | `best` |
|---|---|---|---|
| `['Ns Zoroark-ex']` | A/1 | `unique` | `n-zoroark` |
| `['Quajutsu']` | C/1 | `unique` | `greninja` |
| `['Mega-Schlapor-ex']` | B/0.5 | `ambiguous` | `null` |
| `['Mega-Schlapor-ex','Haspiror']` | B/1 | `unique` | `lopunny-dudunsparce` |
| `['Ns Zoroark-ex','Mega-Schlapor-ex','Haspiror']` | B/1, A/1 | `ambiguous` | `null` |
| `['Hyperball','Pokégear 3.0']` | — | `none` | `null` |
| `[]` | — | `none` | `null` |

> Zeile 5 ist der **wichtigste Testfall**: sie ist die reale Kartenlage aus
> `demoSeed.ts:150-224` (Premiox spielt N's Zoroark ex *mit* Mega-Schlapor und Haspiror).
> Eine Sortierung, die zusätzlich nach `matched.length` bricht, würde hier
> `lopunny-dudunsparce` **automatisch und falsch** setzen. Regel 4 verhindert genau das —
> deshalb steht sie so und nicht anders.

### 3.4 Ergebnis-Ableitung

```ts
/**
 * 'W' when parsed.winner === parsed.player1, 'L' when it === parsed.player2,
 * null otherwise (no winner line, or a name matching neither).
 * NEVER 'T': German PTCG-Live logs carry no draw marker the parser recognises,
 * so a tie always stays a manual decision (plan §0.3/§3.5).
 */
export function resultFromParsedLog(parsed: ParsedBattleLog): 'W' | 'L' | null;
```

**Zugehörige Ein-Zeilen-Änderung am Parser** (`battleLogParser.ts:457`, Entscheidung 5):

```
alt:  line.match(/^(\S+) hat gewonnen/)
neu:  line.match(/(?:^|[.!?]\s+)(\S+) hat gewonnen/)
```
Verbindliche Testfälle (alle drei gehören nach `battleLogParser.test.ts`):

| Zeile | `winner` alt | `winner` neu |
|---|---|---|
| `Gtmap hat gewonnen!` | `Gtmap` | `Gtmap` |
| `Du hast aufgegeben. Gtmap hat gewonnen.` | `null` | `Gtmap` |
| `Gtmap hat den Münzwurf gewonnen.` | `null` | `null` |

Kein `PARSER_VERSION`-Bump: der Doc-Kommentar `:3-9` bindet die Version an
`ParsedTurn`/Board-State-Ausgabe, und `winner` wird **nicht** persistiert
(`matchLogPipeline.ts:39-49` schreibt `totalTurns/wentFirst/turns/prizeProgression/
parserVersion/setupCleanByTurn2/deadTurns`). Einziger heutiger Konsument von `winner`:
`MatchStatsTab.tsx:83` (Anzeige).

### 3.5 Die Fassade

```ts
/**
 * Returns null when the text is not usable as a battle log — currently: no
 * "Zug von" turn blocks were found (parsed.turns.length === 0). The caller then
 * silently keeps the manual form; per the spec's AC this must NOT look like a crash.
 */
export function prefillFromBattleLog(
  log: string,
  playerName: string,
  signatures: ArchetypeSignature[],
): BattleLogPrefill | null;
```

Verbindliches Verhalten:
1. Leerer/whitespace-only `log` → `null`.
2. `playerPinned === (playerName.trim() !== '' && parsed.player1 === playerName.trim())`.
   Der Aufruf an `parseBattleLog` benutzt den getrimmten Namen.
3. `detectedPlayers = [parsed.player1, parsed.player2]`.
4. `result` immer aus `resultFromParsedLog(parsed)` — **auch wenn `playerPinned === false`**.
   Die Entscheidung, das Ergebnis dann *nicht* zu übernehmen, liegt bewusst in der UI (§3.6),
   damit diese Funktion rein und ohne Policy bleibt.
5. Wirft nie: ein Parser-Fehler wird zu `null` (`try/catch` wie `MatchDetailModal.tsx:315-320`).

**Wertetabelle gegen den realen Log** `demoSeed.ts:150-224` (als Fixture in den Shared-Test
kopieren, ausdrücklich mit Quellenkommentar):

| Aufruf | Erwartung |
|---|---|
| `prefillFromBattleLog(LOG, 'Gtmap', SIGS)` | `playerPinned === true`, `detectedPlayers[1] === 'Premiox'`, `result === 'W'` (nach §3.4), `opponentCards` enthält `'Ns Zoroark-ex'` und `'Haspiror'` |
| dieselbe, mit `SIGS = [A, B]` aus §3.3 | `archetype.confidence === 'ambiguous'`, `candidates.map(c => c.slug)` enthält beide |
| dieselbe, mit `SIGS = [A]` | `archetype.confidence === 'unique'`, `best.slug === 'n-zoroark'` |
| `prefillFromBattleLog(LOG, 'Unbekannt', SIGS)` | `playerPinned === false` |
| `prefillFromBattleLog('nur text', 'Gtmap', SIGS)` | `null` |
| `prefillFromBattleLog('   ', 'Gtmap', SIGS)` | `null` |

### 3.6 `AddLogModal` — Vorbelegungs-Vertrag

```ts
// apps/web/src/constants/archetypes.ts
export interface KnownArchetype {
  slug: string;
  name: string;
  /**
   * Card-name fragments as they appear in a GERMAN PTCG-Live battle log.
   * Optional: when omitted, the English display name's tokens are used — which
   * is correct only where the German name is identical (Zoroark, Absol, Latias).
   * A wrong-language fragment can only cause a MISSED detection, never a wrong
   * one, so the table may be filled in incrementally.
   */
  logNames?: string[];
}

/** KNOWN_ARCHETYPES mapped to shared's ArchetypeSignature. Entries without
 *  logNames fall back to the display-name tokens minus the generic words
 *  'box' and 'lead'. Entries that would end up with an empty fragment list
 *  are dropped. */
export function archetypeSignatures(): ArchetypeSignature[];
```

Verbindliche Eigenschaften (Test `archetypes.test.ts`):
- Jede zurückgegebene Signatur hat `logNames.length >= 1` und keinen Leerstring.
- `slug` ist eindeutig über das ganze Array.
- Für `{ slug: 'mega-absol-box', name: 'Mega Absol Box' }` ohne `logNames` ergeben sich die
  Fragmente `['Mega','Absol']` (Stoppwort `Box` entfällt).
- Für einen Eintrag **mit** `logNames` wird der Name-Fallback nicht zusätzlich gemischt.

**Modal-Verhalten (alles über RTL testbar):**

| # | Gegeben | Dann |
|---|---|---|
| M1 | Log eingefügt, `playerPinned`, `confidence==='unique'`, `bestOf==='BO1'`, `result` erkannt | Archetyp-Kachel des `best.slug` ist `aria-pressed`, Ergebnis-Button `W`/`L` ist `aria-pressed`, beide tragen einen sichtbaren „aus Log"-Marker |
| M2 | wie M1, danach tippt der Nutzer eine andere Archetyp-Kachel an | die manuelle Wahl bleibt bestehen; ein Re-Render überschreibt sie **nicht** |
| M3 | `confidence === 'ambiguous'` | **keine** Kachel wird gesetzt; es erscheint eine Chip-Reihe mit bis zu 3 Kandidatennamen; Antippen setzt den Archetyp |
| M4 | `confidence === 'none'` | keine Fehlerbox, kein rotes Styling; nur ein neutraler Hinweis „Gegner nicht aus dem Log erkannt" |
| M5 | `playerPinned === false` | **Weder Archetyp noch Ergebnis werden vorbelegt.** Stattdessen ein Block „Welcher Spieler bist du?" mit genau zwei Buttons (`detectedPlayers`); ein Klick setzt den Namen, schreibt ihn nach `localStorage['tcg-player-name']` und löst die Vorbelegung dann regulär aus (M1/M3/M4) |
| M6 | `bestOf === 'BO3'` und ein Log liegt vor | Ergebnis wird **nicht** vorbelegt; Hinweis: „Ein Kampfprotokoll deckt ein Spiel ab, nicht das ganze Match" |
| M7 | Text im Log-Feld ist kein Log (`prefill === null`) | keine Fehlermeldung; das Formular verhält sich exakt wie ohne Log |
| M8 | „Save & next round" | `battleLog` wird geleert, die Vorbelegungs-Marker verschwinden, `playerName` bleibt (Event-Kontext, wie `eventType`/`bestOf`) |
| M9 | Speichern mit gesetztem `playerName` | `addOpponentLog` wird mit `playerName` im Objekt aufgerufen |
| M10 | Speichern ohne Log und ohne `playerName` | Payload enthält kein `playerName`; alles Übrige unverändert (die 5 bestehenden `bestOf`-Tests bleiben grün) |

> Begründung zu M5: `opponentCardNames` hängt an `parsed.player2`. Ist die Seite nicht gepinnt,
> kann „player2" der Nutzer selbst sein — der Archetyp-Vorschlag wäre dann das **eigene** Deck
> und das Ergebnis invertiert. Ohne Pin wird deshalb konsequent nichts vorbelegt.

**Anti-Überschreib-Regel (M2), verbindlich:** Vorbelegung geschieht per
adjust-state-during-render nach dem in `AddLogModal.tsx:98-102` bereits etablierten Muster:
ein State `lastPrefillSource: string | null` hält den zuletzt vorbelegten Log-Text; nur wenn
`battleLog !== lastPrefillSource`, wird neu vorbelegt und `lastPrefillSource` aktualisiert.
Keine `useEffect`-Kaskade.

**Reihenfolge im Formular (verbindlich):** Kampfprotokoll → Mein Deck → Gegnerisches Deck →
Ergebnis → Match-Format → Event/Datum/Runde → `<details>` (nur noch Notizen + Deck-Version).
Der i18n-Key `addLog.moreOptions` verliert dabei das Wort „Kampfprotokoll".

### 3.7 API-Contracts

```ts
// apps/web/src/lib/api.ts
/** `playerName` is NOT persisted on opponent_logs — it only pins "me" for the
 *  server-side battle-log parse (apps/api/src/validation.ts:66-70). */
export type LogWriteBody = Omit<OpponentLog, 'id'> & { playerName?: string };
```

```ts
// apps/api/src/validation.ts
/** ~2x the largest realistic PTCG-Live log. Guards the primary paste path. */
export const MAX_BATTLE_LOG_CHARS = 200_000;
// logFields.battleLog:        z.string().max(MAX_BATTLE_LOG_CHARS).nullish()
// analyzeLogSchema.battleLog: z.string().min(1).max(MAX_BATTLE_LOG_CHARS)
```

Wire-Verhalten:
```
POST /api/logs        + playerName?: string (bereits validiert, jetzt auch gesendet)
                      battleLog länger als MAX_BATTLE_LOG_CHARS -> 400 (Zod)
PATCH /api/logs/:id   unverändert (playerName war schon erlaubt)
POST /api/analysis/log  battleLog > MAX -> 400
POST /api/logs/import   unverändert
```
Keine neue Route, kein neues persistiertes Feld, keine Migration.

### 3.8 IA-Contracts

```ts
// apps/web/src/components/deck/DeckSwitcher.tsx
export type DeckSection = 'deck' | 'analytics';   // 'log' entfällt
```

```ts
// apps/web/src/components/opponent/OpponentLog.tsx
interface Props {
  logs: OpponentLogType[];
  deckId?: number;
  /** 'card' (default) renders the own card frame + header; 'bare' omits both so
   *  the component can sit inside an outer CollapsibleSection without a
   *  double border. `showAddButton` (deprecated, ignored) is removed. */
  chrome?: 'card' | 'bare';
}
```

`DeckPage.tsx` — verbindlich (Test `DeckPage.test.tsx`):
- Die Section-Tab-Leiste enthält **genau zwei** Tab-Buttons; keiner heißt „Match Log"/„Match-Log".
- In derselben Zeile rechts steht ein deutlich kleinerer Button „Match loggen", der das
  `AddLogModal` öffnet — auf **beiden** Sections sichtbar.
- Innerhalb der Section `analytics` steht **nach** `DeckAnalyticsPanel` eine
  `CollapsibleSection` mit `defaultOpen={false}`, Titel „Match-Log (`{{count}}`)", die
  `<OpponentLog chrome="bare" …/>` enthält.
- Kein Feature-Verlust: Zeilen-Klick → `MatchDetailModal`, Löschen, Add-Button im Empty-State
  bleiben erreichbar.

`OverviewPage.tsx` / `RecommendationsPage.tsx` — verbindlich:
- Bei `opponentLogs.length === 0` (bzw. `activeLogs.length === 0`) erscheint ein neutraler
  Hinweis mit (a) der Aussage, dass Meta-Übersicht und Empfehlungen ohne eigene Logs
  funktionieren, und (b) einer **statischen** Aufzählung dessen, was eigene Logs zusätzlich
  freischalten. Die Aufzählung nennt genau die drei realen Schwellen aus
  `useRecommendations.ts` / `docs/features.md` §10:
  „≥ 5 Begegnungen pro Archetyp → Matchup-Schwächen", „≥ 3 Spiele mit Kampfprotokoll →
  Zug-Qualität", „≥ 2 Deck-Versionen + ≥ 4 Logs → Versionsvergleich".
- `MetaTable`/`RecommendationsPanel` selbst bleiben unverändert; der Hinweis ersetzt keine
  bestehende Fläche.
- Die vorhandene Warnung `recommendations.page.logMoreHint` (`RecommendationsPage.tsx:77-79`,
  Schwelle `< 10`) bleibt für den Fall „einige, aber wenige Logs" bestehen.

### 3.9 Neue i18n-Keys (de + en)

```
opponents.addLog.battleLogPrimary          Label des jetzt ersten Feldes
opponents.addLog.battleLogPrimaryHint      "Gegner und Ergebnis werden daraus vorgeschlagen"
opponents.addLog.moreOptions               GEÄNDERT: ohne "Kampfprotokoll"
opponents.addLog.fromLog.badge             "aus Log"
opponents.addLog.fromLog.pickOpponent      "Aus dem Protokoll: welches Deck war es?"
opponents.addLog.fromLog.notRecognised     "Gegner nicht aus dem Protokoll erkannt — bitte auswählen."
opponents.addLog.fromLog.resultUnknown     "Ergebnis nicht aus dem Protokoll erkannt."
opponents.addLog.fromLog.whoAreYou         "Welcher Spieler bist du?"
opponents.addLog.fromLog.bo3Notice         "Ein Kampfprotokoll deckt ein Spiel ab, nicht das ganze Match."
deck.page.tabs.matchLog                    ENTFÄLLT
deck.page.matchLogSection                  "Match-Log ({{count}})"
deck.page.logMatch                         "Match loggen"
overview.metaWorksWithoutLogs.title/body/items
recommendations.page.metaWorksWithoutLogs.title/body/items
```

---

## 4. Umsetzungsreihenfolge (test-first)

Jede Verhaltens-Scheibe: **erst** der rote Test (`tester`), **dann** die Implementierung
(`implementer`). Nach jedem Schritt Root-Gates (`npm run typecheck && npm run lint &&
npm run test`) und ein eigener Commit. Slice A ist Voraussetzung für B; **C ist vollständig
unabhängig von A/B** (echte Parallelität möglich, ggf. eigener Worktree).

**Slice A — Erkennungs-Kern in `@pokekon/shared`**

1. **Rot:** `packages/shared/src/battleLogParser.test.ts` — die drei Gewinner-Zeilen aus §3.4
   (die Aufgabe-Zeile schlägt fehl). Fixture: die echte Schlusszeile aus `demoSeed.ts:224`.
2. **Grün:** `battleLogParser.ts:457` — Regex um den Satz-Präfix erweitern. Doc-Kommentar
   `:454` ergänzen (warum, mit Beispiel). **Im Commit-Body ausdrücklich begründen**, dass die
   Spec `battleLogParser.ts` als Out of Scope führt und dies die einzige, minimale Ausnahme ist.
   → `fix(shared): detect the winner in conceded battle logs`
3. **Rot:** `packages/shared/src/battleLogPrefill.test.ts` — `normaliseCardName`-Tabelle (§3.2),
   `opponentCardNames` gegen das kopierte Real-Log-Fixture, `guessOpponentArchetype`-Tabelle
   (§3.3, alle sieben Zeilen inkl. der Ambiguitäts-Zeile), `resultFromParsedLog` (W/L/null).
4. **Grün:** `packages/shared/src/battleLogPrefill.ts` (ohne die Fassade) + Re-Export in
   `index.ts`. Die Begründung „coverage statt Prozent-Konfidenz" als Doc-Kommentar an
   `guessOpponentArchetype`.
   → `feat(shared): infer the opponent archetype from a parsed battle log`
5. **Rot:** Tests für `prefillFromBattleLog` (§3.5, alle sechs Zeilen).
6. **Grün:** die Fassade in derselben Datei.
   → `feat(shared): assemble a battle-log prefill from parser output`

**Slice B — Eingabe-Umbau im Web**

7. **Rot:** `apps/web/src/constants/archetypes.test.ts` gegen §3.6 (`archetypeSignatures()`).
8. **Grün:** `KnownArchetype.logNames?` + `archetypeSignatures()`. Die deutschen Fragmente
   werden als Startliste aus den Demo-Daten befüllt (§6 Entscheidung 3);
   alle anderen laufen über den englischen Fallback.
   → `feat(web): describe archetypes by their German battle-log card names`
9. **Rot:** `apps/web/src/components/opponent/AddLogModal.test.tsx` — neue `describe`-Suite
   für M1–M8 aus §3.6 (die fünf bestehenden `bestOf`-Tests bleiben unverändert stehen und
   müssen grün bleiben).
10. **Grün:** `AddLogModal.tsx` — Feldreihenfolge, Vorbelegung per
    adjust-state-during-render, Kandidaten-Chips, Spielername-Klärung, Marker, Hinweise,
    i18n de+en.
    → `feat(web): pre-fill opponent and result from a pasted battle log`
11. **Rot:** `AddLogModal.test.tsx` M9/M10 + `apps/api/src/api.test.ts`: ein `POST /api/logs`
    mit `playerName` erzeugt eine `match_log_parsed`-Zeile, deren `turns[0].player` dem
    gepinnten Namen entspricht (heute nicht garantiert, §0.6).
12. **Grün:** `api.ts:322` (`LogWriteBody`), `queries.ts:181-184`, `AddLogModal.handleSave`.
    → `fix(web): send the player name so the server pins the right side of the log`
13. **Rot:** `apps/api/src/api.test.ts` — `battleLog` über `MAX_BATTLE_LOG_CHARS` → 400.
14. **Grün:** `apps/api/src/validation.ts` (§3.7).
    → `fix(api): cap the accepted battle-log length`

**Slice C — Informationsarchitektur (unabhängig)**

15. **Rot:** `apps/web/src/pages/DeckPage.test.tsx` — genau zwei Tab-Buttons, keiner heißt
    „Match Log"; „Match loggen"-Button vorhanden und öffnet das Modal; die Log-Liste ist in der
    Analytics-Section vorhanden und initial eingeklappt.
16. **Grün:** `DeckSwitcher.tsx:10`, `DeckPage.tsx:166-170,194-210,256-267`,
    `OpponentLog.tsx` (`chrome`-Prop, `showAddButton` raus), i18n `deck.json` de+en.
    → `feat(web): demote the match log from a co-equal deck tab`
17. **Rot:** Tests für den Null-Log-Hinweis auf Overview und Recommendations (§3.8).
18. **Grün:** `OverviewPage.tsx`, `RecommendationsPage.tsx`, i18n de+en.
    → `feat(web): explain that meta analysis works without personal logs`

**Abschluss**

19. Doku-Schritt (alle Dateien aus §2, Block „Doku") — insbesondere die **Korrekturen** in
    `docs/features.md` §7 (kein Archetyp im Parser; deutsche Kartennamen; Gewinner bei Aufgabe)
    und die Veraltet-Markierung von `todo/todo.md` §5.
    → `docs: describe battle-log-first logging and the demoted match log`
20. `security-agent` (**Pflicht**: der Paste-Pfad wird zum primären User-Input, neue Verarbeitung
    von Fremdtext im Client, neue Längenbegrenzung) + `code-review-agent`, dann volle Gates,
    dann PR.

---

## 5. Rollout, Migration & Rückwärtskompatibilität

**Migration: keine.** Es wird kein Feld persistiert, das nicht schon existiert. `playerName` war
serverseitig bereits erlaubt und wird nicht gespeichert (`validation.ts:66-70`); die
Vorbelegung ist reine Client-Rechnung. Kein `db:generate`, kein Backfill, kein Dry-Run.

**Bestandsdaten.** Kein bestehender Log ändert sich. Insbesondere bleiben Spec-2-Artefakte
unangetastet: `bestOf: null`-Altlogs behalten ihre „Format unbekannt"-Badge
(`OpponentLog.tsx:155-162`) — die Badge wandert lediglich mit der Liste in den eingeklappten
Bereich; der Einmal-Fixup im `MatchDetailModal` (`:242`) ist davon unberührt. Der
Legacy-Import (`POST /api/logs/import`) wird nicht angefasst.

**`match_log_parsed` wird ab jetzt korrekter befüllt** (Slice B, Schritt 12), aber **nicht
rückwirkend**. Alte Zeilen können weiterhin die falsche Seite als „mich" führen. Ein
Re-Parse-Job wäre möglich (`parserVersion`-Mechanik existiert, `schema.ts:402-419`), ist aber
**bewusst nicht Teil dieser Spec** — §6 Entscheidung 4.

**Rückwärtskompatibilität**
- Wire rein additiv: ein alter Server ignoriert `playerName` bereits heute nicht (er kennt es),
  ein alter Client sendet es nicht → beides schadlos.
- `LogWriteBody` bekommt ein **optionales** Feld → kein Aufrufer bricht.
- `DeckSection` verliert einen Union-Wert. Einziger Nutzer ist `DeckPage.tsx:178` (lokaler
  State, kein persistiertes Setting, kein Routing) → keine Deep-Link-/Migrationsfrage.
- `OpponentLog.showAddButton` war bereits als deprecated markiert und wirkungslos; einziger
  Aufrufer ist `DeckPage.tsx:266`.
- `MAX_BATTLE_LOG_CHARS` ist eine **Verschärfung**: ein hypothetischer Bestands-Log über
  200 000 Zeichen ließe sich nicht mehr per `PATCH` speichern. Vor dem Merge einmal
  `SELECT max(length(battle_log)) FROM opponent_logs;` prüfen und den Wert in der PR notieren.
- Rollback: reiner Code-Revert genügt, kein persistierter Zustand wird ungültig.

---

## 6. Risiken & offene Fragen

**Risiken**

1. **Die deutsche Signaturtabelle ist Handarbeit und rotiert mit dem Format.**
   `KNOWN_ARCHETYPES` ist bereits hand-gepflegt (Kommentar `archetypes.ts:1-3`), der Aufwand
   wächst also nicht um eine neue Kategorie, sondern um eine Spalte. Entscheidend ist die
   Fehlerrichtung: ein fehlendes oder falsches Fragment führt zu `coverage 0` und damit zu
   **keiner** Erkennung — nie zu einer falschen. Das macht inkrementelles Befüllen sicher.
2. **Unter-Erkennung bei Paar-Archetypen.** `coverage === 1` verlangt, dass *alle* Fragmente
   im Log auftauchen. Weil der Parser Startaufstellung und Entwicklungen gar nicht erfasst
   (§0.4), wird ein zweites Pokémon oft fehlen → `ambiguous` statt `unique`. Das ist gewollt
   ehrlich, kostet aber einen Tap. Gegenmaßnahme, falls es nervt: `logNames` auf **ein**
   charakteristisches Fragment kürzen (reine Datenpflege, kein Code).
3. **Parsing bei jedem Tastendruck.** `prefillFromBattleLog` läuft in einem `useMemo` über
   `battleLog`. Reale Logs sind einige hundert Zeilen; die Regexe sind linear pro Zeile, aber
   `parseTurnBlock` (`:228-286`) läuft ~10 Regexe je Zeile. Bei Paste (der Normalfall) ist das
   ein einmaliger Lauf. Bei manuellem Tippen im Feld wären es viele. Vor dem Merge einmal messen
   (`performance.now()` um den Aufruf, Ergebnis in die PR); falls > ~30 ms, den Aufruf auf
   `onPaste` + `onBlur` umstellen statt auf jeden `change`. Kein Vertragsbruch, nur UI-Timing.
4. **ReDoS-Fläche wächst.** Die Parser-Regexe enthalten mehrere `(.+?)`-Gruppen
   (`:233, :248, :265, :274`), die künftig auf ungeprüften Fremdtext im **Client** losgelassen
   werden. `MAX_BATTLE_LOG_CHARS` deckelt serverseitig; clientseitig sollte das Textfeld
   dieselbe Grenze per `maxLength` tragen. Ausdrücklich Prüfauftrag an den `security-agent`.
5. **„Ergebnis nur bei Bo1" kann als Bug wirken.** Wer bei einem Regional (Bo3-Default) einen
   Live-Log einfügt, bekommt keinen Ergebnis-Vorschlag. Der Hinweistext aus §3.9
   (`fromLog.bo3Notice`) ist deshalb Pflicht, nicht Kür.
6. **Vorbefund außerhalb des Scopes:** `KNOWN_SUPPORTERS` (`battleLogParser.ts:89-111`) ist
   englisch und greift in echten deutschen Logs nicht → `setupCleanByTurn2` und damit die
   Empfehlungsregeln 11/12 arbeiten auf einer schwachen Grundlage. **Wird hier nicht behoben**
   (Spec: Parser Out of Scope), aber in `docs/features.md` §7 dokumentiert, damit es nicht als
   „übersehen" durchgeht.

**Entscheidungen (in diesem Plan getroffen — verbindlich, aber umkehrbar; bitte widersprechen,
wenn eine davon nicht passt)**

1. **Statt „Parser-Konfidenz-Schwelle" eine Eindeutigkeits-Aussage.** Der Parser hat keine
   Konfidenz (§0.3); eine erfundene Prozentzahl wäre genau die Art Zahl, gegen die Golden
   Rule 6 und der ganze Spec-2/3-Strang argumentieren. `coverage` + Ambiguitätsprüfung ist
   direkt aus Evidenz abgeleitet und im Test nachrechenbar.
2. **Weder „immer vorschlagen" noch „leer lassen", sondern drei Zustände.** Die Spec bot nur
   diese zwei Optionen an. `unique` → setzen, `ambiguous` → bis zu drei Chips anbieten,
   `none` → still manuell. Begründung: „immer vorschlagen" hätte im **realen** Beispiel-Log
   (§3.3, Zeile 5) den falschen Archetyp gesetzt, und ein falscher Archetyp verschmutzt genau
   die Matchup-Daten, die Spec 2/3 gerade korrigiert haben.
3. **IA-Lösung: eingeklappter Bereich am Ende der Analysen + kleiner Dauer-Button.** Von den
   drei Spec-Optionen (Unter-Tab / einklappbarer Bereich / zurückgenommener Menüpunkt) ist das
   die einzige, die ohne neue Navigationsebene auskommt (`CollapsibleSection` existiert, §0.2)
   und trotzdem das Loggen selbst **nicht** erschwert — die AC verlangt Demotion der *Fläche*,
   nicht der *Aktion*.
4. **Empfehlungs-Sichtbarkeit: statische Freischalt-Liste, keine Regel-für-Regel-Erklärung.**
   Die Spec stellt beides zur Wahl. Drei konkrete Schwellen als statischer Text erfüllen
   „motiviert gezielt" fast vollständig, ohne die 14 Regeln um eine Meta-Ebene zu erweitern —
   die gehört fachlich zu Spec 5 (Prognosen), nicht hierher.
5. **Eine Zeile Parser-Änderung trotz Out-of-Scope.** `battleLogParser.ts:457` (§3.4).
   Begründung: ohne sie liefert ausgerechnet Konrads eigener Referenz-Log kein Ergebnis, und
   das zentrale Versprechen der Spec („Ergebnis automatisch") wäre bei jedem aufgegebenen
   Spiel wirkungslos. Der Eingriff ist additiv, verändert kein persistiertes Feld und hat genau
   einen Anzeige-Konsumenten. **Wenn Konrad die Out-of-Scope-Grenze strikt halten will:**
   Schritte 1–2 entfallen ersatzlos, `resultFromParsedLog` liefert dann bei Aufgabe `null` und
   §3.9 `fromLog.resultUnknown` greift — der Rest des Plans bleibt unverändert gültig.
6. **Vorbelegung läuft im Client, nicht serverseitig.** `parseBattleLog` liegt in
   `@pokekon/shared` und wird im Web bereits direkt aufgerufen (`MatchDetailModal.tsx:317`).
   Ein Server-Roundtrip für eine Vorschau wäre langsamer, teurer und ohne Nutzen.

**Entscheidungen (bestätigt 2026-09-01)**

1. **Tie-Win-Rates aus Spec 2 werden mitgenommen** — als eigener, klar getrennter
   Commit-Block (`fix(web): count ties in the personal-analytics win rates`) am Ende von
   Slice C, wie empfohlen. Betrifft `deckAnalytics.ts`, `deckPerformanceStats.ts`,
   `useRecommendations.ts`, `DeckSwitcher.tsx`, `OverviewPage.tsx` — danach gibt es im ganzen
   Repo nur noch eine Win-Rate-Formel.
2. **Parser-Ausnahme wird umgesetzt** (Entscheidung 5 oben) — die eine Zeile Änderung an
   `battleLogParser.ts:457`, additiv, mit Regressionstest.
3. **Deutsche `logNames`: Implementer füllt eine Startliste aus den Demo-Daten**
   (`demoSeed.ts`) — bekannte Lücken werden beim tatsächlichen Weiterspielen inkrementell
   nachgetragen (Risiko 1 macht das gefahrlos: fehlendes Fragment → `coverage 0` → `none`,
   nie eine falsche Erkennung).
4. **Kein Re-Parse der Bestands-Zeilen** nach dem `playerName`-Fix — Notiz in
   `docs/database.md` reicht, wie empfohlen.
5. **Kein zweiter „Match loggen"-Einstiegspunkt** außerhalb der Deck-Seite — wie empfohlen,
   passt zur Demotion.

---

## 7. Definition of Done

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` (Repo-Root) grün — ehrlich berichtet,
      nichts übersprungen, nichts geskippt.
- [ ] Alle Akzeptanzkriterien der Spec abgehakt, namentlich:
      Battle-Log-Paste ist das **erste** Feld und belegt Gegner + Ergebnis vor; die Vorbelegung
      ist editierbar (M2); bei Uneindeutigkeit fällt das Formular **ohne** Fehleroptik auf
      manuell zurück (M3/M4/M7); der rein manuelle Weg (Archetyp-Kacheln + W/L/T) ist
      vollständig erhalten; „Save & next round" funktioniert identisch mit und ohne Log (M8);
      die Deck-Seite hat keine drei gleichrangigen Tabs mehr; Meta/Empfehlungen sind ohne
      Logs sichtbar nutzbar; `deckSnapshotId` ist technisch unangetastet.
- [ ] Die Wertetabellen aus §3.2/§3.3/§3.4/§3.5 sind 1:1 als Tests umgesetzt — inklusive der
      Ambiguitäts-Zeile aus dem **echten** Log (`demoSeed.ts:150-224`), die belegt, dass nicht
      automatisch der falsche Archetyp gesetzt wird.
- [ ] Neue Tests: Happy Path **und** je ein Fehler-/Randfall pro Slice
      (`prefillFromBattleLog('   ')` → `null`; leere Signaturliste → `none`;
      `playerPinned === false` → keine Vorbelegung; `battleLog` über der Grenze → 400).
- [ ] Genau **eine** Implementierung der Archetyp-Erkennung:
      `grep -rn "normaliseCardName\|guessOpponentArchetype" apps packages --include='*.ts' --include='*.tsx'`
      zeigt keine zweite, nachgebaute Matching-Logik in der UI.
- [ ] Die fünf bestehenden `AddLogModal`-`bestOf`-Tests sind **unverändert** grün.
- [ ] Der geänderte Test/Regex in `battleLogParser` ist im Commit-Body ausdrücklich als
      begründete Ausnahme zum Spec-Out-of-Scope markiert (oder Entscheidung 5 wurde verworfen
      und Schritt 1–2 sind entfallen — dann steht das in der PR-Beschreibung).
- [ ] **Keine** Migration, kein `db:generate`, kein neuer Job — im PR ausdrücklich begründet.
- [ ] Cold-Start/Empty-State geprüft: kein Deck, keine Logs, kein Meta, kein `tcg-player-name`,
      Log ohne „Zug von"-Blöcke, Log mit nur einem erkannten Spieler, Demo-Modus.
- [ ] Auth/Validierung: `battleLog` hat eine Obergrenze (Server **und** `maxLength` im Feld),
      `playerName` bleibt bei `z.string().max(100)`, keine neue Route, kein neuer externer Call,
      keine Secrets im Diff, keine neue Dependency, kein kostenpflichtiger Dienst.
- [ ] `max(length(battle_log))` in Produktion geprüft und in der PR notiert (§5).
- [ ] Parse-Laufzeit für einen realen Log einmal gemessen und in der PR notiert (Risiko 3).
- [ ] Doku aktualisiert: `docs/features.md` (§4, §6, §7, §10), `docs/data-types.md`,
      `docs/data-flow.md`, ggf. `docs/architecture.md`; `todo/todo.md` §5 als überholt markiert;
      der falsche Doc-Kommentar `battleLogParser.ts:82-88` (englische Trainer-Namen) korrigiert.
- [ ] `security-agent` gelaufen (**Pflicht**, CLAUDE.md §3: der Battle-Log-Paste wird primärer
      User-Input) und `code-review-agent`; Review auch gegen die Spec-Akzeptanzkriterien.
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body, Branch `feat/personal-data-role-rework`,
      PR gegen `main` mit grüner CI.
