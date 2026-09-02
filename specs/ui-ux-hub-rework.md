# Spec 7: Informationsarchitektur auf das Hub-Ziel ausrichten

> Teil 7 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Bündelt die IA-Konsequenzen aus Spec 4 (Personal Tracker demoted), Spec 5 (Prognosen statt
> reiner Empfehlungen) und optional Spec 6 (neue spieltheoretische Ansicht) zu einer
> kohärenten Navigation — kommt bewusst **nach** diesen inhaltlichen Specs, nicht davor,
> damit nicht zweimal umgebaut wird.

## Problem/Ziel

Die heutige Top-Level-Navigation (`apps/web/src/store/dashboardStore.ts:67`) hat vier
gleichrangige Tabs: `overview | deck | recommendations | meta`. Das bildet **nicht** die vom
Briefing gewünschten zwei tragenden Achsen ("Meta" und "Deckverlauf/Analyse") ab, sondern ist
historisch gewachsen:

- **`meta`** enthält laut `docs/features.md` §2/§12/§13/§15/§16 die öffentliche
  Meta-Intelligence (Live-Sync, Matchup-Matrix, Archetype-Drilldown, Local-Meta-Prediction).
- **`recommendations`** enthält laut `docs/features.md` §9/§10/§11 sowohl personendaten-
  abhängige Empfehlungen als auch die (öffentliche) Deck-Comparison gegen Turnierlisten und
  die Local-Meta-Konfiguration — fachlich eine Mischung aus beiden Achsen in einem Tab.
- **`deck`** enthält laut `todo/todo.md` §5 wiederum drei Unter-Bereiche (Deck List,
  Analytics, Match Log) — der Personal Tracker (Spec 4: wird demoted) lebt hier, genauso wie
  Deck-Analytics, die teils Meta-Daten (Matchup-Vergleich) und teils persönliche Daten
  braucht.
- **`overview`** ist eine Mischansicht aus beidem (Meta-Share-Chart + persönliche Win-Rate-
  Vergleiche, `docs/features.md` §1).

**Ziel:** Eine Navigation, die die zwei tragenden Achsen des Hub-Ziels ("wie verändert sich
die Meta" / "was heißt das für mein Deck") klar erkennbar macht, statt vier historisch
gewachsene, fachlich überlappende Tabs.

## User Stories

- Als Spieler will ich auf den ersten Blick zwei Dinge tun können: die Meta verstehen, und
  herausfinden, was das für mein Deck bedeutet — nicht zwischen vier ähnlich klingenden Tabs
  raten müssen, wo eine bestimmte Information zu finden ist.
- Als neuer/Demo-Nutzer will ich sofort verstehen, dass die Meta-Seite unabhängig von meinen
  eigenen Daten funktioniert, und dass die "was heißt das für mein Deck"-Seite sich mit
  eigenen Logs vertieft, aber auch ohne sie nutzbar ist (Konsistenz mit Spec 4).
- Als Konrad will ich, dass neue Analyse-Ebenen (Prognosen aus Spec 5, ggf. die
  spieltheoretische Schicht aus Spec 6) einen naheliegenden Platz in der IA haben, statt als
  fünfter/sechster Tab angeklebt zu werden.

## Akzeptanzkriterien

- [ ] Die Navigation spiegelt zwei tragende Hauptachsen wider (Arbeitstitel: "Meta" und
      "Mein Deck") statt vier lose verwandter Tabs — genaue Tab-Struktur/Benennung ist Teil
      der Umsetzungsplanung, nicht dieser Spec.
- [ ] Deck-Comparison (`deckComparison.ts`, Spec-5-Erweiterung) und Local-Meta-Konfiguration
      sind eindeutig einer der beiden Achsen zugeordnet (aktuell fachlich unklar zwischen
      `recommendations` und `meta` aufgeteilt) — keine Funktion lebt gleichzeitig sichtbar in
      beiden.
- [ ] Match Log (nach Spec 4 bereits strukturell demoted) hat innerhalb der neuen IA einen
      Platz, der seine Rolle als optionaler Verstärker widerspiegelt — konsistent mit der in
      Spec 4 getroffenen Entscheidung, nicht davon abweichend.
- [ ] Overview-Seite (`docs/features.md` §1) wird daraufhin geprüft, ob sie als dritte
      Mischansicht bestehen bleibt (sinnvoller Einstiegspunkt) oder in eine der beiden Achsen
      aufgeht — Entscheidung Teil der Planung, hier nur als zu klärender Punkt benannt.
- [ ] Bestehender visueller Redesign-Stil ("analytisch/dicht, mehr Zahlen pro Screen", Commits
      `10b286c`/`4b5f1a2`) bleibt die Leitlinie — diese Spec ändert Struktur/Navigation, nicht
      den bereits etablierten visuellen Stil.
- [ ] Mobile-Nutzbarkeit bleibt erhalten (`BottomNav.tsx` existiert separat von `Sidebar.tsx`
      — beide müssen die neue Struktur konsistent abbilden, nicht nur die Desktop-Sidebar).
- [ ] Demo-Modus (`docs/demo-mode.md`) funktioniert nach dem Umbau unverändert End-to-End,
      inkl. der pre-baked Analysen und Recommendation-Trigger — kein Bruch der bestehenden
      `demoSeed.test.ts`-Invarianten.

## Out of Scope

- Inhaltliche Änderungen an Meta-Sync, Field-Score, Recommendations-Logik — diese Spec ist
  reine Struktur-/Navigations-Arbeit auf Basis der in Spec 4–6 bereits getroffenen fachlichen
  Entscheidungen.
- Visuelles Redesign/neues Design-System — der bestehende Stil bleibt, nur die Anordnung
  ändert sich.
- Spec 6s spieltheoretische Ansicht bekommt hier höchstens einen vorgesehenen *Platz* in der
  IA, falls Spec 6 bereits umgesetzt ist — die Funktion selbst ist nicht Teil dieser Spec.

## Offene Fragen

- **Konkrete Tab-Struktur:** Reichen zwei Haupt-Tabs ("Meta" / "Mein Deck") plus Overview als
  Landingpage, oder soll Overview ganz entfallen zugunsten eines der beiden Haupt-Tabs als
  Startpunkt? Bevorzugst du eine grobe Skizze vorab (z. B. als Mockup/Wireframe), bevor das in
  die technische Planung geht?
- **Benennung:** "Meta"/"Mein Deck" ist ein Arbeitstitel aus dieser Spec — gibt es eine
  bevorzugte Terminologie (z. B. angelehnt an eingeführte Begriffe wie "Field Score",
  "Prognose")?
- **Reihenfolge relativ zu Spec 6:** Diese Spec geht davon aus, dass Spec 6 (spieltheoretische
  Schicht) noch nicht zwingend umgesetzt sein muss, aber einen Platz vorbereitet bekommt.
  Ist das gewünscht, oder soll Spec 7 grundsätzlich erst nach Spec 6 in Angriff genommen
  werden, damit die IA nicht zweimal für eine neue Ansicht angepasst wird?
