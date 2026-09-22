# Spec 10: Archetyp-zentrierte Meta-Analyse (Listen-Clustering, personalisierte Prediction, Lokale-Meta-Konsolidierung)

> Kein Teil der ursprünglichen 9-Spec-Kette aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md)
> (bestätigt 2026-08-31) — neue Anforderung aus Live-Nutzung der bereits gebauten Specs 3/5/6/7/8.
> Baut auf vorhandener Infrastruktur auf, die **nicht neu gebaut** wird:
> `ArchetypeDetail.tsx` (Archetyp-Drilldown), `packages/shared/src/wilsonInterval.ts` /
> `fieldWinRate.ts` / `nashEquilibrium.ts` / `matchupPairings.ts` (Statistik), `deckSynthesis.ts`
> + `POST /api/analysis/deck/:deckId` + `apps/api/src/ai/provider.ts` (KI-Synthese-Pipeline aus
> Spec 8, Anti-Halluzination erhalten). Diese Spec **erweitert** diese Bausteine, ersetzt sie nicht.

## Problem/Ziel

Der bestehende Archetyp-Drilldown (`ArchetypeDetail.tsx`, ausgelöst durch Klick auf eine Zeile
der `TournamentMetaTable`) zeigt Feld-gewichtete Performance, Threats und Top-Decklisten für
einen Archetyp — aber:

1. **Listen werden nicht dedupliziert.** Zwei Turnier-Decklisten mit 58 von 60 identischen
   Karten zählen heute als zwei unabhängige Datenpunkte statt als eine Liste mit doppelter
   Evidenz. Das verwässert sowohl "welche Liste ist die beste" als auch das Vertrauen in
   seltene, aber starke Varianten.
2. **Platzierung fließt nicht in die Bewertung ein.** Eine Liste, die ein Top-8-Regional
   gewonnen hat, wird aktuell nicht anders gewichtet als eine Liste von Platz 40 mit gleicher
   Matchup-Bilanz.
3. **Es gibt keine "beste Liste"-Ausgabe.** Der Drilldown zeigt Rohdaten (Matchup-Tabelle,
   Decklisten), aber keine synthetisierte Handlungsempfehlung — obwohl die dafür nötige
   Anti-Halluzinations-Pipeline (Spec 8) bereits existiert, nur nicht an diesen Datensatz
   angeschlossen ist.
4. **"Lokales Meta" ist dupliziert.** `LocalMetaPanel` (einfache Namensliste,
   Zustand-Store-Key `localMeta`) und `PredictionPanel`s gewichtetes Feld (`LocalFieldEntry[]`,
   eigener `localStorage`-Key `tcg-local-meta-field-v1`, **nicht** über den Zustand-Store)
   sind zwei komplett getrennte Eingaben ohne Cross-Referenz — der Nutzer pflegt sein
   erwartetes lokales Feld potenziell zweimal.
5. **Turnier-Mindestspielerzahl ist inkonsistent.** Drei verschiedene Defaults an drei Stellen
   (`syncMeta.ts:401` = 16, `metaFetch.ts:126` = 30, `MetaPage.tsx`-UI-State = 30), keiner davon
   nutzerseitig einstellbar unterhalb des Defaults.
6. **Empfehlungen ignorieren den eigenen Spielstil.** Die eigene Matchup-Historie
   (`ArchetypeStats`, `opponentLogs`) existiert bereits getrennt von der Meta-Analyse, fließt
   aber nicht in die Listen-Empfehlung ein.

**Ziel:** Aus einem gewählten Archetyp eine belastbare, dedupliziert-gewichtete
"beste Liste" ableiten — einmal für die globale Meta, einmal für eine vom Nutzer definierte
lokale Meta — mit einer KI-Textempfehlung (Spec-8-Pipeline) und optionaler Anpassung an den
eigenen Spielstil, bei konsolidierter (nicht doppelter) lokaler-Meta-Eingabe und konsistenten,
filterbaren Turnier-Mindestgrößen.

## User Stories

- Als Spieler will ich einen Archetyp auswählen und eine einzige, klar begründete
  Listen-Empfehlung für die aktuelle globale Meta sehen, die nicht durch zehn Kopien
  derselben Liste oder durch Ausreißer-Glück eines schlechten Spielers verzerrt ist.
- Als Spieler, der weiß, welche Decks bei seinen Locals typischerweise auftauchen, will ich
  dieselbe Empfehlung für genau dieses kleinere Feld bekommen, **ohne** das Feld zweimal
  pflegen zu müssen (einmal für "Lokales Meta", einmal für "Prediction").
- Als Spieler mit eigener Matchup-Historie will ich, dass die Empfehlung meine eigenen
  Ergebnisse berücksichtigt, aber nur dann, wenn genug eigene Spiele vorliegen, um nicht auf
  Zufallsstreuung zu reagieren.
- Als Spieler will ich bei einem konkreten Turnier auch kleinere Felder (< 30 Spieler) sehen
  können, per Filter, und für ein gewähltes Turnier wissen, welche Liste dort vermutlich am
  besten abgeschnitten hätte und warum.
- Als Konrad will ich, dass die neue Analyse dieselbe Anti-Halluzinations-Disziplin wie die
  bestehende Deck-Synthese (Spec 8) einhält — keine Karten- oder Zahlen-Behauptung ohne
  konkreten, mitgelieferten Datenpunkt.

## Akzeptanzkriterien

### A — Listen-Clustering (neu, kein bestehender Code)

- [ ] Neue reine Funktion in `packages/shared/` (Analogie zu `matchupConflict.ts`), die zwei
      60-Karten-Decklisten auf Kartenidentität vergleicht und einen Overlap-Score liefert
      (z. B. Anteil identischer Karten inkl. Anzahl).
- [ ] Listen eines Archetyps aus dem Analysefenster werden anhand eines Schwellenwerts zu
      Clustern zusammengefasst (Schwellenwert: siehe Offene Fragen); jedes Cluster trägt die
      **Summe** der Spiele/Ergebnisse seiner Mitgliedslisten, nicht nur die des Cluster-Vertreters.
- [ ] Ein Cluster mit nur einer Liste bleibt erhalten (keine erzwungene Zusammenfassung) — das
      schützt explizit die "Nadel im Heuhaufen"-Anforderung aus der Nutzeranfrage.

### B — Gewichtung/Ranking (erweitert `wilsonInterval.ts`/`fieldWinRate.ts`)

- [ ] Ranking der Cluster nutzt den Wilson-Score-**Lower-Bound** (nicht den rohen Mittelwert)
      über die kombinierte Spielzahl des Clusters — schützt gegen kleine-Stichprobe-Verzerrung,
      ohne seltene Cluster kategorisch auszuschließen (kein hartes Mindest-Spiele-Cutoff, analog
      zur in Spec 3 bereits getroffenen Entscheidung gegen einen binären Cutoff).
- [ ] Turnier-Platzierung eines Piloten fließt als zusätzlicher, dokumentierter Faktor ein
      (z. B. Top-8/Top-16/Top-32-Bonus oder Platzierungs-Perzentil) — Gewichtungsformel ist im
      Code kommentiert nachvollziehbar, kein Black-Box-Score ohne Herleitung.
- [ ] Bestehende `fieldWinRate.ts`/`computeFieldScores`-Logik wird für die Feld-gewichtete
      Performance pro Cluster wiederverwendet, nicht dupliziert.

### C — Beste Liste global + KI-Empfehlung (erweitert Spec 8)

- [ ] Neuer Analyse-Input-Typ für `assembleSynthesis`/`validateSynthesis`
      (`packages/shared/src/deckSynthesis.ts`), der Cluster-Ranking + Konfidenzband +
      Verbesserungsvorschlag (Kartentausch-Ebene, nicht Spielweise — Unterscheidung aus
      `CLAUDE.md` §5 bleibt erhalten) als strukturierte Datenpunkte durchreicht.
- [ ] Jede Aussage der generierten Empfehlung ist auf einen konkreten Cluster-Datenpunkt
      zurückführbar (gleiches Prinzip wie Spec 8 AC 3), inklusive Kartentausch-Vorschlägen, die
      nur Karten nennen, die tatsächlich in mindestens einer Liste des Analysefensters
      vorkommen.
- [ ] Nutzt das bestehende `AnalysisProvider`-Interface (`apps/api/src/ai/provider.ts`) und die
      bestehende BYOK-Schlüsselverwaltung — kein zweiter KI-Integrationsweg.

### D — Lokale Meta: Konsolidierung + eigene beste Liste

- [ ] `LocalMetaPanel` (Archetyp-Namensliste) wird die **einzige** Eingabe-Quelle für "welche
      Decks erwarte ich lokal"; `PredictionPanel`s separates, redundantes Eingabefeld
      (`LocalFieldEntry[]`, `tcg-local-meta-field-v1`) entfällt als zweite manuelle Eingabe.
- [ ] Gewichte für das lokale Feld werden aus `localMeta` **abgeleitet** (sinnvoller Default,
      z. B. Gleichgewichtung oder aus globaler Meta-Frequenz übernommen), mit Override-Möglichkeit
      pro Eintrag statt einer komplett separaten zweiten Liste.
- [ ] Dieselbe Cluster-Ranking- und KI-Empfehlungs-Pipeline aus B/C läuft wahlweise gegen das
      lokale Feld statt der globalen Meta-Verteilung und kann zu einer anderen empfohlenen
      Liste führen als die globale Analyse — beide Ergebnisse sind nebeneinander sichtbar oder
      eindeutig umschaltbar (UI-Detail: Plan-Phase).
- [ ] Keine neue `localStorage`-Datendoppelung eingeführt (CLAUDE.md Golden Rule 4).

### E — Spielstil-Anpassung

- [ ] Eigene Matchup-Historie (`ArchetypeStats`) fließt optional als zusätzlicher Gewichtungsfaktor
      in die Cluster-Bewertung ein (Bayes-Prior-artige Blendung: je mehr eigene Spiele gegen ein
      Matchup, desto mehr Gewicht auf die eigene Erfahrung statt auf die globale Zahl).
- [ ] Ein dokumentierter Mindest-Stichprobenumfang eigener Spiele pro Matchup ist Voraussetzung,
      bevor die eigene Erfahrung überhaupt einfließt (schützt vor Overfitting auf z. B. 2 eigene
      Spiele) — konkreter Schwellenwert: siehe Offene Fragen.
- [ ] Diese Anpassung ist klar als "an deinen Spielstil angepasst" von der reinen
      Meta-Empfehlung unterscheidbar (Nutzer sieht, welche der beiden Empfehlungen er ansieht).

### F — Prediction-Panel UI

- [ ] `PredictionPanel`s äußere `CollapsibleSection` in `MetaPage.tsx` ist standardmäßig
      **eingeklappt** (`defaultOpen={false}`, gleiches Muster wie bereits beim Equilibrium-Layer
      aus Spec 6 und der in dieser Runde bereits umgesetzten Matchup-Matrix).
- [ ] Internes `fieldOpen`-`useState(true)` in `PredictionPanel.tsx` wird konsistent zum äußeren
      Collapse-Zustand behandelt (kein doppelt offener/geschlossener Widerspruch beim ersten
      Aufklappen).
- [ ] Platzierung auf der Seite folgt aus der D-Konsolidierung (Prediction erscheint im
      Kontext des — nun einzigen — lokalen Feldes, nicht als eigenständiger, gleichrangiger
      Abschnitt danebem) — konkretes Layout ist Aufgabe der Plan-Phase, nicht dieser Spec.

### G — Turnier-Filter + Pro-Turnier-Empfehlung

- [ ] Ein einheitlicher, an **einer** Stelle konfigurierter Mindestspieler-Default ersetzt die
      drei aktuell abweichenden Werte (`syncMeta.ts` 16, `metaFetch.ts` 30, `MetaPage.tsx` 30).
- [ ] UI-Filter erlaubt, Turniere unterhalb des Defaults anzuzeigen (nicht nur strenger, auch
      lockerer als der Default einstellbar).
- [ ] Für ein ausgewähltes Turnier + einen ausgewählten Archetyp zeigt die App, welche
      (geclusterte) Liste dieses Archetyps für **dieses spezifische Turnierfeld** die beste
      erwartete Performance gehabt hätte, mit Begründung, die auf die tatsächlichen
      Turnier-Gegner-Daten verweist (baut auf `ArchetypeDetail.tsx`/`getArchetypeLists` auf).

## Out of Scope

- Neue, noch ungeprüfte Datenquellen (RK9 Labs, PokeData.ovh) tatsächlich anbinden — diese Spec
  klärt nur, ob es sich lohnt (siehe Offene Fragen); die Integration selbst ist eine eigene,
  spätere Spec, falls die Prüfung positiv ausfällt.
- Änderungen am deutschsprachigen Battle-Log-Parser (`battleLogParser.ts`) — unberührt.
- Neue kostenpflichtige APIs oder Hosting-Posten (CLAUDE.md Golden Rule 2) — jede neue
  Datenquelle muss auf ihrem kostenlosen Tier nutzbar sein oder braucht explizite Freigabe.
- Ein visuelles Redesign von `PredictionPanel` über "eingeklappt + neue Platzierung" hinaus
  (F) — Farben/Layout im Detail sind Sache der Implementierung, nicht dieser Spec.
- Rückwirkende Neuberechnung von Meta-Daten vor dem Rotations-Cutoff 2026-03-26 (bestehende
  Grenze bleibt unangetastet).
- Spielweise-Empfehlungen ("anders spielen") im Rahmen der Spielstil-Anpassung (E) — E bezieht
  sich ausschließlich auf **Listen**-Empfehlung, nicht auf Zug-für-Zug-Coaching (die
  Listen-vs.-Spiel-Trennung aus CLAUDE.md §5 bleibt bestehen).

## Offene Fragen

- **Datenquellen RK9 Labs / PokeData.ovh:** Kurzrecherche (2026-09-22) findet keine öffentlich
  dokumentierte JSON-API bei RK9 Labs selbst — nur ein Decklist-Einreichungs-Tool
  (`rk9.gg/decklist`) und Web-Standings. `PokeData.ovh` bezieht seine Turnierdaten (Name,
  Datum, Standings, Round-Pairings) laut eigener Beschreibung **aus** RK9 und bietet zusätzlich
  eine "Cards API". Das ist der vielversprechendere Kandidat als RK9 direkt, aber ungeprüft:
  Rate-Limits, Nutzungsbedingungen, tatsächliche API-Stabilität sind offen. Klärung: eigener
  kurzer Recherche-Task (`ptcg-meta-researcher`) vor der Plan-Phase, falls diese Datenquelle
  gewünscht ist — sonst bleibt es bei Limitless + TrainerHill.
- **Cluster-Schwellenwert (A):** Der Nutzer nannte "58 von 60 gleichen Karten" als Beispiel.
  Ob das exakt der Schwellenwert sein soll oder ob ein anderer (z. B. prozentual, oder
  kartenkategorie-gewichtet — ein getauschtes Tech-Tool wiegt anders als eine getauschte
  Kernkarte) sinnvoller ist, ist offen und sollte in der Plan-Phase mit konkreten
  Beispiel-Listenpaaren aus echten Daten geprüft werden.
- **90-Tage-Fenster vs. bestehendes 1/2/3/4-Wochen-Konzept:** CLAUDE.md §5 nennt das
  Wochen-Fenster als "durchgängigen Analyse-Parameter". Offen, ob 90 Tage dieses Konzept für
  diese Analyse ersetzt, als fünfte Fenstergröße ergänzt, oder ob 90 Tage nur der Standardwert
  eines weiterhin frei wählbaren Fensters wird.
- **Platzierungs-Gewichtungsformel (B):** Konkrete Kurve (linear nach Perzentil? Stufen wie
  Top-8/16/32? Turniergröße als zusätzlicher Faktor, da Platz 8 bei 200 Spielern etwas anderes
  bedeutet als Platz 8 bei 20?) ist nicht spezifiziert — Vorschlag für die Plan-Phase, keine
  Vorwegnahme hier.
- **Mindest-Stichprobe für Spielstil-Blending (E):** Kein konkreter Schwellenwert festgelegt
  (Vorschlag als Diskussionsgrundlage: analog zur bestehenden `encounters < 5`-Schwelle in
  `MyMatchupsTable`, aber ggf. pro Matchup statt insgesamt) — mit Konrad zu klären.
- **UI für global vs. lokal vs. spielstil-angepasst (C/D/E):** Drei mögliche Empfehlungen
  nebeneinander — als Tabs, als umschaltbarer Einzel-Slot, oder alle drei gleichzeitig sichtbar?
  Nicht entschieden, Aufgabe der Plan-Phase in Abstimmung mit Konrad.
- **Pro-Turnier-Empfehlung (G):** Reicht die bestehende `ArchetypeDetail`/`getArchetypeLists`-
  Datenlage aus, oder braucht es zusätzliche Persistenz (z. B. welche Liste in welchem
  konkreten Turnier gegen wen spielte), um "beste Liste für DIESES Turnier" wirklich zu
  begründen statt zu schätzen? Zu prüfen in der Plan-Phase.
