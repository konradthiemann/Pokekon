# Spec 2: Kartenkatalog, Regel-Validator und TCG-Live-Export

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 2 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Voraussetzung für:** Spec 5 (Validator als Nebenbedingung), Spec 6 (Kandidaten aus allen
> Karten), Spec 7 (Export-Knopf), Spec 8 (deutsche Kartennamen im Log).

## 1. Problem

Pokekon kennt Karten nur als **Namen**. Es gibt keinen Katalog, keine Legalität und keine
Regelprüfung:

- `deck_cards` speichert nur `name`, `count`, `type`, `role`
  (`apps/api/src/db/schema.ts:180-199`). Set und Nummer fehlen.
- Kartentyp und Rolle werden beim Import über **hartkodierte Namenslisten** geraten
  (`apps/web/src/lib/deckImport.ts:7-60`: `SUPPORTER_EXACT`, `KNOWN_NON_SUPPORTERS`,
  `STADIUM_SUBSTRINGS`, `TECH_POKEMON`). Jede neue Karte muss von Hand nachgetragen werden,
  und Heuristiken wie „enthält `tower`" sind fehleranfällig.
- Turnier-Decklisten haben `set` und `number` (`packages/shared/src/meta.ts:15-20`), eigene
  Decks nicht. Ein Abgleich über Prints hinweg ist so nicht möglich.
- Es gibt **keine Regelprüfung**. Die Deck-Seite prüft nur „zu viele / zu wenige Karten"
  (`apps/web/src/pages/DeckPage.tsx:284-285`).
- Es gibt **keinen Export** ins TCG-Live-Format, nur einen Import
  (`deckImport.ts:158`, `parseDeckList`).
- Battle-Logs sind **deutsch** (CLAUDE.md §5), Turnierlisten **englisch**. Eine Zuordnung
  deutscher zu englischen Kartennamen fehlt.

## 2. Ziel

Ein serverseitiger **Kartenkatalog aller Karten**, täglich synchronisiert, als eine Quelle der
Wahrheit für Kartentyp, Legalität, Regeln, deutsche und englische Namen und Funktions-Tags.
Darauf bauen ein **Validator** in `@pokekon/shared` und ein **Export** ins TCG-Live-Format auf.

## User Stories

- Als Spieler will ich sofort sehen, ob meine Liste **turnierlegal** ist, und bei Fehlern genau
  welche Karte das Problem ist.
- Als Spieler will ich jede Liste mit einem Tap **in TCG Live übernehmen** (✅ umgesetzt).
- Als Spieler will ich, dass die App auch Karten kennt, **die niemand im Meta spielt**, damit
  das Lab sie vorschlagen kann.
- Als Spieler will ich deutsche Kartennamen aus meinen Logs richtig zugeordnet bekommen.

## 3. Datenquelle

**Empfehlung: TCGdex** (`api.tcgdex.net`). Die Datenbank ist quelloffen unter MIT-Lizenz, die
API braucht keinen Key, und sie ist mehrsprachig, **inklusive Deutsch**. Das löst die
Namenszuordnung für die Battle-Logs gleich mit. Das passt zu CLAUDE.md §2.2 (kostenlos).

Zu verifizieren im Plan:
- **TCG-Live-Set-Kürzel:** Laut Doku des quelloffenen Parsers `pokemon-tcg-deck-parser`
  (osamc, MIT) liefert TCGdex die Kürzel über die Set-Felder `abbreviation.official` und
  `tcgOnline`. Für Promos und das SVE-Energie-Set braucht es eine kleine Alias-Tabelle
  (z. B. `PR-SV`, `SVE`). **Wahrscheinlich gelöst**, im Plan durch Abruf der API bestätigen.
- wie verlässlich Regulation Mark und Standard-Legalität bei ganz neuen Sets sind.
- Rate-Limits und empfohlenes Sync-Muster (Voll-Sync vs. Delta pro Set).

Fallback, falls TCGdex nicht reicht: pokemontcg.io (**Vermutung:** ohne Deutsch). Wegen der
deutschen Logs ist das nur zweite Wahl.

## 4. Datenmodell

### 4.1 Tabelle `card_prints` (eine Zeile pro Druck)
| Feld | Bedeutung |
|---|---|
| `id` | TCGdex-ID, Primärschlüssel |
| `name_en`, `name_de` | Anzeigenamen |
| `name_key` | `normalizeCardName(name_en)` (`cardPerformance.ts:51`), Schlüssel für die 4er-Regel und den Join zu `archetype_card_stats.card_key` |
| `category` | `pokemon` \| `trainer` \| `energy` |
| `trainer_type` | `item` \| `supporter` \| `stadium` \| `tool` \| null |
| `energy_type` | `basic` \| `special` \| null |
| `stage` | `basic` \| `stage1` \| `stage2` \| null |
| `evolves_from` | Name der Vorstufe (für Linien-Prüfung, z. B. Darmanitan) |
| `flags` | Array: `ex`, `ace_spec`, `radiant`, `tera`, `n`, `team_rocket` … |
| `regulation_mark` | Buchstabe oder null (Basis-Energie hat keinen) |
| `set_id`, `ptcgl_set`, `number` | Druck-Identität |
| `release_date` | Set-Release, auch für Spec 4 (Formatgrenzen) |
| `text` | JSONB: Fähigkeiten, Attacken, Effekttext (EN + DE) |
| `synced_at` | Zeitstempel |

### 4.2 Abgeleitete Sicht `card_names` (eine Zeile pro `name_key`)
Legalität, Kategorie, Flags und Tags **pro Name**, weil Regeln und Empfehlungen auf
Namensebene arbeiten. Ein Name ist legal, wenn *mindestens ein* Druck legal ist.
Materialized View, damit keine schwere Aggregation in der App-Schicht entsteht (CLAUDE.md §6).

### 4.3 Funktions-Tags `card_tags`
`(name_key, tag, source, confidence)`. Tags: `search_pokemon`, `search_trainer`, `draw`,
`hand_disruption`, `energy_accel`, `energy_recovery`, `damage_boost`, `switch`, `gust`,
`recovery`, `protection`, `bench_setup`, `evolution_support`.
- `source = 'rule'`: regelbasiert aus dem englischen Kartentext (Regex-Muster wie
  „search your deck for … Pokémon"), deterministisch und getestet.
- `source = 'manual'`: vom Admin korrigiert oder ergänzt, hat immer Vorrang.
- **Kein LLM zur Laufzeit.** Eine einmalige LLM-Vorschlagsrunde für Karten ohne Regeltreffer
  ist optional. Die Ergebnisse landen als `manual`-Kandidaten und brauchen eine Freigabe.
  **Offen** (Vision §7, Frage 5). Empfehlung: erst nur `rule` + `manual`.

## 5. Validator (`packages/shared/src/deckValidator.ts`)

Reine Funktion `validateDeck(cards, catalog, format) → { ok, errors[], warnings[] }`.

**Fehler** (Liste ist nicht spielbar):
1. Summe ≠ 60
2. mehr als 4 Karten mit gleichem `name_key` (Basis-Energie ausgenommen)
3. mehr als 1 Karte mit Flag `ace_spec`
4. mehr als 1 Karte mit Flag `radiant`
5. kein Basis-Pokémon
6. Karte im gewählten Format nicht legal

**Warnungen** (spielbar, aber auffällig):
- Karte nicht im Katalog (Tippfehler, sehr neues Set): kein harter Fehler, damit ein fehlender
  Sync das Deckbauen nicht blockiert
- Entwicklungsstufe ohne passende Vorstufe in der Liste
- Pokémon, die Energie brauchen, ohne passende Energie oder Energie-Suche (**Vermutung**,
  dass das sinnvoll ist; im Plan entscheiden, ob es in v1 gehört)

Jeder Fehler hat einen Code (`TOO_MANY_COPIES` …), die betroffenen Karten und einen i18n-Key.
Regulation Marks für „Standard" kommen aus einer Konstante in `packages/shared/src/season.ts`
neben `ROTATION_DATE` (`:6`), damit die nächste Rotation eine Ein-Zeilen-Änderung ist.

## 6. TCG-Live-Export ✅ vorgezogen und umgesetzt

**Umgesetzt** im Patch `feat: copy decks in Pokémon TCG Live format` (Branch
`feat/ptcgl-export`), unabhängig vom Katalog:

- `packages/shared/src/deckExport.ts`: `exportDeckList`, `exportCardsFromDecklist`,
  `basicEnergyType`
- Format (belegt durch zwei unabhängige Quellen: die bestehende Import-Fixture und die Doku von
  `pokemon-tcg-deck-parser`): Abschnitte `Pokémon:`/`Trainer:`/`Energy:` mit der **Summe** der
  Kopien, Zeilen `<Anzahl> <Name> <Set> <Nummer>`, Abschluss `Total Cards: N`. Englische
  Kopfzeilen, weil PTCGL und Limitless sie standardmäßig ausgeben. Deutsch ist als Option
  vorhanden (`lang: 'de'`), wird aber nicht genutzt.
- Basis-Energie in jeder Schreibweise → `Basic {X} Energy SVE n` (SVE 1–8).
- Der Import behält jetzt Set und Nummer (`deck_cards.set_code`/`set_number`, Migration `0017`).
- Drei Import-Fehler behoben, die echte PTCGL-Zeilen still verworfen haben: `PH`-Marker am
  Zeilenende, das Pseudo-Set `Energy` und Promo-Kürzel mit Bindestrich (`PR-SV`).
- Knopf „Für TCG Live kopieren" an der eigenen Liste, an Turnierlisten und an den
  Cluster-Listen, inklusive Hinweis bei Karten ohne Set-Angabe.

**Bleibt für diese Spec:** Karten ohne Druck (per Name hinzugefügt oder vor der Migration
importiert) bekommen mit dem Katalog automatisch den **neuesten standard-legalen Druck** ihres
`name_key`. Bis dahin exportiert der Knopf sie ohne Set und warnt.

**Manueller Abnahmetest (offen):** Ein kopierter Export wird in TCG Live importiert. Das kann
nur Konrad im Client prüfen. Falls TCG Live etwas ablehnt, ist die Zeile im Hinweis unter dem
Knopf sichtbar.

## 7. Anbindung an Bestehendes

- **Import:** `parseDeckList` löst Kartentyp über den Katalog auf. Die hartkodierten Listen
  (`deckImport.ts:7-60`) bleiben nur als Fallback für Karten, die nicht im Katalog sind.
- **`deck_cards`:** neue, nullable Spalten `card_print_id` bzw. `ptcgl_set` + `number`.
  Bestehende Zeilen bleiben gültig. Eine Migration ordnet sie über `name_key` zu, wo das
  eindeutig ist.
- **Battle-Log:** Mapping `name_de → name_key` für Spec 8. Die Anti-Halluzinationslogik
  (`packages/shared/src/battleAnalysis.ts:52`, `extractRevealedCards`) bleibt unverändert.
  Das Mapping ergänzt sie nur.

## 8. Betrieb

- Job `apps/api/src/jobs/syncCards.ts`, Skript `job:sync-cards` analog zu
  `apps/api/package.json:17-20`.
- Täglich, zusätzlich manuell auslösbar. Delta pro Set: nur Sets mit `release_date` in den
  letzten 60 Tagen oder ohne vollständigen Sync neu laden.
- Nach dem Sync: Materialized View `card_names` auffrischen, Regel-Tags neu berechnen.

## Umsetzungsscheiben

| Scheibe | Inhalt | ACs |
|---|---|---|
| ✅ S0 | TCG-Live-Export, Druck im Import speichern, Import-Bugs (Patch `feat/ptcgl-export`) | 5 |
| S1 | Tabelle `card_prints` + Sync-Job `syncCards` (TCGdex) + Alias-Tabelle für Set-Kürzel | 1 |
| S2 | Sicht `card_names` + regelbasierte Funktions-Tags `card_tags` | – (Grundlage Spec 6) |
| S3 | Validator in shared | 2, 3, 4, 7 |
| S4 | Import löst Kartentyp über den Katalog auf | 8 |
| S5 | Export ergänzt fehlende Drucke aus dem Katalog | 6 |
| S6 | Validator-Hinweis in der UI, Doku | 9 |

S1 braucht den `security-agent` (externer Abruf).

## 9. Akzeptanzkriterien

1. Nach einem Sync sind alle Karten des Standard-Formats im Katalog, mit englischem **und**
   deutschem Namen, soweit TCGdex sie liefert.
2. Der Validator erkennt jeden der sechs Fehlerfälle aus §5, je mit Test.
3. Die N's-Zoroark-Liste aus dem Gespräch vom 2026-09-23 validiert **ohne Fehler**
   (Regressionstest: Secret Box ist das einzige ACE SPEC, Special Red Card ist keins).
4. Eine Liste mit Secret Box + Unfair Stamp ergibt `ACE_SPEC_LIMIT`.
5. ✅ Export: Tests für Format, Energie-Normalisierung, fehlende Drucke und Zusammenführen.
6. Der Export von Pokekon wird von TCG Live angenommen (manueller Abnahmetest durch Konrad).
7. Import einer Liste mit unbekannter Karte: Warnung, kein Abbruch.
8. Der Kartentyp beim Import kommt aus dem Katalog. Der Test mit „Team Rocket's Watchtower"
   ergibt `Stadium`, ohne Namensheuristik.
9. Gates grün, Doku (`docs/database.md`, `docs/data-flow.md`) aktualisiert.

## 10. Out of Scope

- Keine Kartenbilder in v1 (Lizenz- und Traffic-Frage).
- Keine Preise.
- Expanded-Format nur als Datenfeld, keine UI.

## 11. Entscheidungen (Default 2026-09-23, überschreibbar)

1. **Set-Kürzel:** über die TCGdex-Felder `abbreviation.official` und `tcgOnline`, plus eine
   kleine Alias-Tabelle für Promos und SVE. Der Plan bestätigt das per API-Abruf, bevor S1
   gebaut wird.
2. **Echte TCG-Live-Exporte:** nicht mehr nötig, Format aus zwei Quellen belegt und umgesetzt.
   Offen ist nur der manuelle Import-Test in TCG Live durch Konrad (§6).
3. **Funktions-Tags v1:** nur regelbasiert plus manuell. Keine LLM-Runde.
