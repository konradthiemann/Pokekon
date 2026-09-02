# Spec 4: Personal Tracker — vom Kern-Feature zum optionalen Verstärker

> Teil 4 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Baut auf [Spec 2](./data-correctness-fixes.md) auf (`bestOf`-Feld, tie-korrekte
> `ArchetypeStats.winRate`) — diese Spec ändert das Formular, das Spec 2 bereits um `bestOf`
> erweitert hat, kein zweites Mal von Grund auf.
> Entscheidung aus dem Briefing: **strukturelle Änderung**, nicht nur Repositionierung.

## Problem/Ziel

Drei co-gleichrangige Tabs — "Deck List" / "Analytics" / "Match Log" — bilden laut
`todo/todo.md` §5 (Section-Navigation in `DeckSwitcher.tsx`) die Haupt-IA von Pokekon. Das
Match-Log konkurriert damit visuell und im Nutzungsgewicht mit der Meta-Intelligence-Seite,
obwohl es laut Konrad "schon lange nicht mehr benutzt" wird — es ist strukturell so gebaut,
als sei persönliche Dateneingabe genauso zentral wie die öffentliche Meta-Analyse.

**Konkret belegt in `apps/web/src/components/opponent/AddLogModal.tsx`:**
- Das Formular ist bereits UX-optimiert (progressive disclosure: Gegner-Archetyp, Ergebnis,
  Event-Typ, Runde immer sichtbar; Notizen/Deck-Version/Battle-Log in einem `<details>`-
  Element versteckt, `AddLogModal.tsx:53-56`) und hat bereits einen schnellen Turnier-Flow
  ("Save & next round", `:57-59`). **Das UI selbst ist also nicht das Problem** — reine
  UX-Politur würde hier wenig bringen.
- Das eigentliche Problem: **Battle-Log-Paste und manuelle Eingabe laufen nebeneinander,
  nicht nacheinander.** `battleLog` ist ein rein optionales Zusatzfeld
  (`AddLogModal.tsx:80,133`) — auch wer einen Log einfügt, muss `archetype` und `result`
  weiterhin **manuell** setzen (`:127-135`, `handleSave`). Das Parsing
  (`docs/features.md` §7: Gegner-Erkennung, Turn-by-Turn, Gewinner-Erkennung) passiert erst
  **nach** dem Speichern, beim Öffnen des Match-Detail-Modals — nicht beim Eintragen selbst.
  Der eigentliche Reibungspunkt (Gegner-Archetyp + Ergebnis von Hand eintragen) bleibt also
  bestehen, obwohl die Information im Log bereits vorhanden ist.

**Ziel:** Persönliche Daten werden struktureller Verstärker statt gleichrangiges Kern-Feature
— (a) Battle-Log-Paste wird zum primären Eingabeweg, der Gegner-Archetyp und Ergebnis
**automatisch vorschlägt** (weiterhin korrigierbar), manuelle Eingabe ohne Log bleibt als
Fallback für Fälle ohne digitalen Log (persönliches In-Person-Bo3-Event); (b) Match Log
verliert seinen Status als co-gleichrangiger Tab und wird in die IA so eingeordnet, dass klar
wird: Meta-Intelligence funktioniert auch ohne diese Daten, persönliche Logs sind Zusatz.

## User Stories

- Als Spieler, der nach einem Online-Match sein Ergebnis festhalten will, will ich den
  TCG-Live-Battle-Log einfach einfügen können und Gegner-Archetyp + Ergebnis automatisch
  vorgeschlagen bekommen, statt beides zusätzlich manuell einzutragen — sonst logge ich es
  gar nicht erst (Konrads eigene Erfahrung).
- Als Spieler ohne digitalen Log (In-Person-Event) will ich weiterhin ganz normal manuell
  loggen können, ohne dass mir ein Log aufgezwungen wird.
- Als neuer Nutzer, der Pokekon zum ersten Mal öffnet, will ich sofort verstehen, dass Meta-
  Übersicht und Empfehlungen auch ohne eigene Match-Historie funktionieren, statt den
  Eindruck zu bekommen, ich müsse erst X Spiele eintragen, bevor die App etwas taugt.

## Akzeptanzkriterien

**Log-Erstellung: Battle-Log-Paste als primärer Pfad**
- [ ] Given der Nutzer öffnet "Match loggen", when er zuerst einen Battle-Log einfügt, then
      werden Gegner-Archetyp und Ergebnis (aus dem bestehenden Parser, `docs/features.md` §7)
      automatisch vorbelegt, bleiben aber editierbar (kein Zwang, den Vorschlag zu übernehmen).
- [ ] Given der geparste Log liefert keinen eindeutigen Gegner/Gewinner (z. B. Parser-
      Unsicherheit), then fällt das Formular sichtbar auf manuelle Eingabe zurück, ohne
      Fehlermeldung, die wie ein Absturz wirkt.
- [ ] Given der Nutzer hat keinen Log zur Hand, then bleibt der bisherige rein manuelle Weg
      (Archetyp-Kacheln + W/L/T-Tasten) vollständig nutzbar — kein Feature-Verlust.
- [ ] "Save & next round"-Flow (`AddLogModal.tsx:57-59`) bleibt erhalten und funktioniert
      identisch, unabhängig davon, ob der aktuelle Log aus einem Battle-Log oder manuell kam.

**Informationsarchitektur**
- [ ] Match Log ist nicht mehr einer von drei visuell gleichrangigen Haupt-Tabs
      (`DeckSwitcher.tsx`, Section-Buttons). Konkrete Umsetzung (Unter-Tab, eingeklappter
      Bereich, o. ä.) ist Teil der Umsetzungsplanung — Vorgabe hier ist nur die Zielaussage:
      **kein visuelles Gleichgewicht mit Meta/Analytics mehr.**
- [ ] Empfehlungen/Field-Score/Meta-Übersicht sind ohne jeden eigenen Match-Log vollständig
      nutzbar (bereits heute größtenteils der Fall, siehe Vision-Dokument §2 — hier nur
      **sichtbar machen**, nicht neu bauen): ein Erstnutzer ohne Logs sieht keine leere/kaputt
      wirkende Fläche, sondern eine funktionierende Meta-Ansicht mit einem Hinweis, dass mehr
      Tiefe durch eigene Logs möglich ist.
- [ ] Deck-Versionierung (Snapshots) bleibt technisch unverändert nutzbar (Spec 2 hat
      `deckSnapshotId` nicht angefasst), verliert aber ebenfalls die Prominenz eines
      Kern-Features — sie wird im Kontext des Loggens angeboten, nicht als eigener
      Haupt-Bereich beworben.

**Nicht-Verschlechterung**
- [ ] Bestehende Recommendation-Regeln, die auf `opponentLogs`/`deckSnapshots` basieren
      (`docs/features.md` §10, Regeln 1, 2, 3, 6, 8–14), funktionieren unverändert für Nutzer,
      die weiterhin loggen — die Rolle ändert sich (Verstärker statt Pflicht), nicht die Logik.

## Out of Scope

- Automatisches Ingestieren von Logs ohne manuellen Paste-Schritt (z. B. Datei-Upload,
  Browser-Extension) — reiner Komfort-Ausbau für eine spätere Iteration, nicht Teil dieser
  Spec.
- Verknüpfung von Empfehlungen mit konkreten Kartenänderungs-Prognosen → Spec 5.
- Löschen/Entfernen des manuellen Formulars — es bleibt als Fallback vollständig erhalten.
- Änderungen an der Battle-Log-Parser-Logik selbst (`battleLogParser.ts`) — diese Spec nutzt
  den bestehenden Parser früher im Flow, ändert ihn aber nicht.

## Offene Fragen

- **Genaue IA-Platzierung von Match Log:** Unter-Tab von "Analytics", ein einklappbarer
  Bereich auf der Deck-Seite, oder ein eigener, aber visuell zurückgenommener Menüpunkt? Die
  AC verlangt nur "kein Gleichgewicht mehr" — die konkrete Lösung ist eine Design-Frage für
  die Planungsphase. Gibt es eine bevorzugte Richtung, oder soll das offen in die Planung?
- **Parser-Konfidenz-Schwelle für Auto-Vorbelegung:** Ab welcher Sicherheit soll der Parser
  einen Gegner-Archetyp automatisch vorschlagen vs. das Feld leer lassen? Der bestehende
  Parser hat laut `docs/features.md` §7 eine Häufigkeits-Heuristik zur Spielererkennung, aber
  keine dokumentierte Konfidenzangabe für die Archetyp-Erkennung selbst — das müsste in der
  Planung geprüft werden, ob eine solche Schwelle überhaupt sinnvoll bestimmbar ist, oder ob
  "immer vorschlagen, immer editierbar" der pragmatischere Weg ist.
- **Empfehlungs-Sichtbarkeit ohne Logs:** Sollen die 9 Log-abhängigen Recommendation-Regeln
  bei fehlenden Daten künftig aktiv erklären, *was* an Daten fehlen würde ("logge 3 Spiele für
  Tempo-Analyse"), oder reicht ein allgemeiner Hinweis "mehr Tiefe mit eigenen Logs"? Ersteres
  ist näher am Hub-Ziel (motiviert gezielt), Letzteres ist deutlich weniger Aufwand.
