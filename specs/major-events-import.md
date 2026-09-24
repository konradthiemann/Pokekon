# Spec 3: Große Events (Regionals, ICs, Worlds) importieren

> **Status:** **Zurückgestellt (2026-09-23).** Konrad möchte vorerst niemanden anfragen. Die
> Spec ist nicht essenziell: Spec 4–6 laufen mit den Online-Daten der offenen Play-API, die ohne
> Key und ohne Anfrage nutzbar ist. Wiederaufnahme erst nach Klärung von §3.
> Kontext: Teil 3 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Wichtig:** Spec 4 und 5 funktionieren auch ohne diese Spec, nur mit Online-Daten.
> Diese Spec ist ein Qualitätsgewinn, keine Voraussetzung.

## 1. Problem

Die stärksten Datenpunkte eines Formats fehlen:

- Der Sync liest ausschließlich die Plattform `play.limitlesstcg.com`
  (`apps/api/src/jobs/syncMeta.ts:43`). Dort laufen Online-Turniere.
- In-Person- und Bo3-Events werden nur klassifiziert und **ohne** Standings und Pairings
  abgelegt (`syncMeta.ts:350-378`, `persistClassificationOnly`).
- Alle Meta-Reads filtern auf `isOnline = true AND swissMode = 'BO1'`
  (`apps/api/src/db/schema.ts:303-309`, Index `:322`).
- Regionals, ICs und Worlds liegen auf **Limitless Labs** (`labs.limitlesstcg.com`), das im
  Code nirgends vorkommt. Dort sind laut Konrad pro Spieler alle Runden einsehbar.

## 2. Ziel

Große Events als eigene, klar gekennzeichnete Datenquelle: Standings, Decklisten (soweit
veröffentlicht) und Runden-Ergebnisse. Die Daten werden **getrennt** von Online-Bo1 gespeichert
und nur über das Gewichtungsmodell (Spec 4) zusammengeführt.

## User Stories

- Als Spieler will ich, dass Ergebnisse großer Events (Regionals, ICs, Worlds) in die Empfehlungen
  einfließen, weil dort das stärkste Feld spielt.

## 3. Blockierende Vorfrage: Zugriff

**Belegt** (Limitless-Entwicklerdoku, abgerufen 2026-09-23):
- Die dokumentierte API umfasst die Endpunkte `/tournaments`, `/details`, `/standings` und
  `/pairings` auf `play.limitlesstcg.com/api`.
- Für die Turnierdaten braucht es **keinen API-Key**. Keys gibt es für höhere Limits und
  werden nur an öffentliche Projekte mit legitimem Zweck vergeben.
- Es gibt **Webhooks** („Turnier beendet"), registrierbar über dasselbe Formular wie der Key.

**Nicht belegt:** eine API oder ein Export für **Labs**. Ohne Freigabe liefe das auf Scraping
hinaus.

**Vorgehen:** Konrad fragt im Limitless-Discord (Entwickler-Kanal) nach:
1. Gibt es einen Endpunkt oder Export für Labs-Events (Standings, Decklisten, Runden)?
2. Wenn nein: Ist behutsames Abrufen der Labs-Seiten erlaubt, mit Quellenangabe, Caching und
   niedriger Rate?
3. Gleich mitbeantragen: API-Key und Webhook für Pokekon als öffentliches Projekt. Das hilft
   auch dem bestehenden Sync (siehe §8).

| Antwort | Folge |
|---|---|
| Endpunkt/Export vorhanden | Umsetzung wie §5–§7 |
| Abrufen erlaubt | Umsetzung wie §5–§7, Parser für HTML statt JSON, strenge Rate-Limits |
| Nein | Spec 3 entfällt. Optional: **manueller Import** eines Events aus einer Datei, die Konrad selbst erstellt (nur eigene Nutzung) |

## 4. Offene Datenfragen (vor dem Plan zu klären)

- **Archetyp-Zuordnung:** Nutzt Labs dieselben Deck-IDs wie die Play-Plattform?
  **Unbekannt.** Wenn nicht, braucht es eine Mapping-Tabelle `labs_deck → archetype_id` mit
  Pflege-UI für den Admin.
- **Abdeckung der Decklisten:** Sind bei großen Events alle Listen veröffentlicht oder nur
  Day 2 bzw. Top Cut? **Unbekannt.** Davon hängt ab, wie Spec 4 den Selection Bias behandelt.
- **Divisionen:** Nur Masters importieren (Empfehlung), Juniors/Seniors ignorieren.
- **Runden-Ergebnisse:** Bo3-**Match**-Ergebnisse (Sieg/Niederlage/Unentschieden pro Match),
  keine einzelnen Spiele.

## 5. Datenmodell

- `tournaments.source`: `limitless_play` (Default für bestehende Zeilen) | `limitless_labs`
- `tournaments.tier`: `online` | `regional` | `special` | `ic` | `worlds`
  (Klassifizierung aus Eventname und -typ; Mapping-Regeln als getestete Funktion in shared)
- `tournaments.best_of`: für Labs-Events immer `BO3`. Bestehendes `swissMode` bleibt.
- `tournament_standings`: unverändert nutzbar. `matchResults` bekommen ein Feld `unit`:
  `game` (Bo1) | `match` (Bo3).
- `tournament_standings.decklist_published`: boolean, damit Auswertungen wissen, ob eine
  fehlende Liste „nicht veröffentlicht" oder „nicht vorhanden" bedeutet.

## 6. Import

- Job `apps/api/src/jobs/syncMajors.ts`, Skript `job:sync-majors`.
- Ablauf pro Event: Header → Tier → Standings → Decklisten → Runden → Persistenz in **einer**
  Transaktion (gleiches Muster wie `persistTournament`, `syncMeta.ts:130-230`).
- Delta-Logik: abgeschlossene Events sind unveränderlich, einmal importiert heißt fertig.
- Rate-Limit: höchstens 1 Anfrage pro Sekunde, Retry mit Backoff (Muster `syncMeta.ts:63-122`).
- Nur Events ab `ROTATION_DATE` (`packages/shared/src/season.ts:6`).
- `security-agent` ist Pflicht (externer Abruf, HTML-Parsing, CLAUDE.md §3).

## 7. Auswertung

- Bestehende Reads bleiben **unverändert** auf Online-Bo1 (keine Regression).
- Neuer Scope-Parameter für Reads, die ihn brauchen:
  `online_bo1` (Default) | `majors` | `weighted` (alles, gewichtet nach Spec 4).
- Bo3-Match-Ergebnisse werden nie mit Bo1-Spielen addiert. Für Vergleiche wandelt eine
  Funktion Bo1 in Bo3 um (`P_Bo3 = 3p² − 2p³`, Quelle: `specs/deck-improvement-hub-vision.md`
  §3.2). Die Umkehrung ist numerisch zu lösen und wird in shared getestet.

## 8. Nebeneffekt für den bestehenden Sync

Mit Webhook-Zugang kann `syncMeta` von Polling auf „Turnier beendet → dieses Event
importieren" umgestellt werden. Das ist eine eigene kleine Spec, hier nur vermerkt.

## 9. Akzeptanzkriterien

1. Ein importiertes Regional erscheint mit `source = limitless_labs`, `tier = regional`,
   `best_of = BO3` und Standings aller Masters-Spieler.
2. Runden-Ergebnisse haben `unit = match`.
3. Kein bestehender Online-Bo1-Read ändert sein Ergebnis (Snapshot-Test vorher/nachher).
4. Erneuter Lauf des Jobs importiert nichts doppelt.
5. Events vor `ROTATION_DATE` werden nicht importiert.
6. Archetyp-Zuordnung: Jede Standing hat entweder eine gültige `archetype_id` oder landet in
   einer Admin-Liste „nicht zugeordnet". Sie wird nie still verworfen.
7. Gates grün, `security-agent` durchlaufen, Doku aktualisiert.

## 10. Out of Scope

- Keine Juniors/Seniors.
- Keine Live-Daten laufender Events.
- Kein Import von RK9 oder anderen Plattformen.
