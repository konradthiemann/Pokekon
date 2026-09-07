# Spec: Button-/Aktions-Konsolidierung

> Bewusst zurückgestellte Folge-Spec zu [`ui-ux-hub-rework.md`](./ui-ux-hub-rework.md) (Spec 7
> im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md)).
> Spec 7 war laut eigenem Wortlaut ("Struktur, nicht Optik") ausdrücklich nur
> Informationsarchitektur — Tab-/Navigationsebene — und hat **nie** einzelne Buttons oder
> Aktionen innerhalb einer Seite angefasst. Konrad hat diese Konsolidierung bewusst auf
> "nach Abschluss der Rework-Fluss-Logik" verschoben; der Rework-Fluss ist mit Spec 9
> (`docs-sync-automation.md`, gemergt 2026-09-07) komplett, diese Spec ist der angekündigte
> nächste Schritt.
>
> **Kein Redesign.** Das bestehende visuelle Design (Farben, Layout-Grundraster,
> Komponentenbibliothek unter `docs/design-system.md`) bleibt im Kern erhalten. Ziel ist
> Verständlichkeit und weniger gleichzeitig sichtbare Aktionen, nicht ein neuer Look.

## Problem/Ziel

Ein vollständiger Audit aller klickbaren Action-Buttons im Frontend (`apps/web/src`,
durchgeführt 2026-09-07, alle Fundstellen `datei:zeile`-belegt) zeigt drei wiederkehrende
Muster von Redundanz, die Nutzer beim ersten Kontakt mit der App überfordern können, weil
ähnliche Labels an mehreren Stellen unterschiedliche Wirkungsradien haben — oder umgekehrt
dieselbe Aktion an mehreren Stellen unter leicht unterschiedlichem Namen auftaucht:

### 1. Sechs "neu laden"-Buttons, sechs Wirkungsradien, keine Kennzeichnung

| Button | Ort | Handler | Wirkungsradius |
|---|---|---|---|
| "Live-Meta synchronisieren" | `components/layout/Sidebar.tsx:75-93` (global, jede Desktop-Seite) | `syncMeta()` (Store-Action → API-Sync) | Globaler Server-Sync, schreibt Meta-Snapshots für alle Nutzer |
| "Daten aktualisieren" | `components/layout/Sidebar.tsx:113-123` (global, jede Desktop-Seite) | `refresh` (Store-Action) | Lokaler Store-Refresh (lädt bereits vorhandene Server-Daten neu in den Client) |
| "Live-Meta synchronisieren" | `pages/MetaPage.tsx:598-610` (nur MetaPage) | `syncMeta()` — **dieselbe Store-Action wie oben** | Identisch zum Sidebar-Button; laut Code-Kommentar (`MetaPage.tsx:555-558`) bewusst dupliziert, weil die Sidebar auf Mobile (`md:flex`) nicht sichtbar ist |
| "Daten neu laden" | `components/meta/MatchupMatrix.tsx:130,364-371` (nur Matchup-Matrix-Sektion) | lokale Fetch-Funktion → `getMetaMatchups()` | Nur die Matchup-Matrix-Sektion |
| "Laden" | `pages/MetaPage.tsx:444-454` (nur "Aktuelle Turniere"-Sektion) | `loadRecentTournaments()` (Store-Action → API) | Lädt eine separate Turnier-Liste, kein Meta-Snapshot |
| "Aktualisieren" | `components/recommendations/DeckComparisonPanel.tsx:212-225` (nur Tipps-Section) | `runDeckComparison` (Store-Action) | Deck-Vergleich neu berechnen |

Ein Nutzer, der irgendwo "Meta ist veraltet" vermutet, hat sechs ähnlich benannte Buttons zur
Auswahl, von denen die meisten sein eigentliches Problem nicht lösen. Zusätzlich dupliziert
sich "Live-Meta synchronisieren" wortgleich zwischen Sidebar und MetaPage.

### 2. "Match loggen" an vier Stellen gleichzeitig

Alle vier öffnen denselben `AddLogModal` mit identischem Formular:

- Globaler FAB, mobil, jede Seite (`components/layout/BottomNav.tsx:40-46`)
- Header-Button, immer sichtbar auf der DeckPage (`pages/DeckPage.tsx:234-241`)
- Empty-State-Button in der Match-Log-Section (`components/opponent/OpponentLog.tsx:81-84`)
- Footer-Button in derselben Match-Log-Section, sobald Logs existieren
  (`components/opponent/OpponentLog.tsx:196-202`)

`DeckPage.tsx:212-215` kommentiert das als bewusste Entscheidung ("Log match stays one tap
away on both sections") — das war zum Zeitpunkt der Entscheidung vermutlich richtig, ist aber
nie gegen das jetzige Ziel "Anzahl der Aktionen minimieren" geprüft worden.

### 3. Beinahe-identische Labels für unterschiedliche Aktionen

"Vergleich" (`components/layout/BottomNav.tsx:68-74`, reine Navigation zu
DeckPage/Tipps-Section via `openDeckComparison`) vs. "Vergleichen"
(`components/recommendations/DeckComparisonPanel.tsx:212-225`, löst tatsächlich den
API-Call `runDeckComparison` aus) — ein Nutzer kann aus dem Label allein nicht ableiten, dass
das eine nur navigiert und das andere tatsächlich Daten neu berechnet.

**Für wen:** Primär Konrad selbst (Dogfooding), sekundär jeder Nutzer im Demo-Modus, der ohne
Vorwissen über die App-Struktur zurechtkommen soll (`docs/demo-mode.md`) — genau diese Gruppe
trifft auf die verwirrendsten Stellen zuerst (WelcomeScreen → Sidebar/MetaPage → Sync-Wirrwarr).

## User Stories

- Als Nutzer will ich beim Blick auf einen "neu laden"-artigen Button sofort erkennen können,
  was genau er neu lädt (global vs. eine einzelne Sektion), ohne den Quellcode lesen zu müssen.
- Als Nutzer will ich nicht denselben Button-Text ("Live-Meta synchronisieren") an zwei
  Stellen der App sehen und rätseln, ob sich beide unterschiedlich verhalten.
- Als Nutzer will ich "Match loggen" nicht an vier verschiedenen Stellen präsentiert bekommen,
  wenn eine kleinere, aber weiterhin leicht erreichbare Anzahl an Einstiegspunkten denselben
  Zweck erfüllt.
- Als Nutzer will ich, dass zwei fast gleich benannte Buttons ("Vergleich"/"Vergleichen")
  entweder unterschiedlich benannt sind oder erkennbar dieselbe Wirkung haben — nicht beides
  gleichzeitig unklar.
- Als Konrad (Maintainer) will ich, dass diese Konsolidierung das bestehende visuelle Design
  nicht anfasst — nur Beschriftung, Anzahl und Anordnung von Aktionen.

## Akzeptanzkriterien

- [ ] **Sync/Aktualisieren-Gruppe:** Jeder der sechs in Problem/Ziel §1 gelisteten Buttons hat
      danach entweder (a) einen Label-Text, der seinen tatsächlichen Wirkungsradius eindeutig
      erkennen lässt (z. B. durch Scope-Präfix, Tooltip oder Umbenennung), oder (b) ist entfernt/
      zusammengelegt, weil er redundant zu einem anderen wurde. Kein Button-Paar mit identischem
      Label und identischer Aktion bleibt an zwei Stellen gleichzeitig bestehen, ohne dass die
      Duplikation für den Nutzer erkennbar begründet ist (z. B. "diese Aktion ist hier verfügbar,
      weil die Sidebar auf diesem Viewport nicht sichtbar ist" — sichtbar oder zumindest im Code
      dokumentiert bleibt erlaubt, wenn die UI selbst keine Verwirrung erzeugt).
- [ ] **"Match loggen":** Eine bewusste Entscheidung steht am Ende dieser Spec (nicht mehr nur
      im Code-Kommentar), wie viele der vier Einstiegspunkte erhalten bleiben und warum — nicht
      automatisch alle vier, aber auch nicht automatisch reduziert, ohne den Trade-off
      (Erreichbarkeit vs. Überladung) explizit abgewogen zu haben.
- [ ] **"Vergleich"/"Vergleichen":** Die beiden Labels sind nach Umsetzung entweder klar
      unterscheidbar benannt, oder ihre Wirkung ist tatsächlich angeglichen (z. B. beide navigieren
      nur, oder beide lösen dieselbe Aktion aus) — nicht mehr "gleicher Wortstamm, andere Wirkung".
- [ ] **Kein Verhaltensverlust:** Jede Aktion, die im Audit katalogisiert wurde (siehe
      Referenz-Katalog unten), bleibt über mindestens einen Weg erreichbar. Konsolidieren heißt
      hier Klarheit schaffen, nicht Funktionalität entfernen.
- [ ] **Kein Redesign:** Farben, Layout-Grundraster, Komponentenbibliothek
      (`docs/design-system.md`) bleiben unverändert. Änderungen beschränken sich auf Label-Texte,
      Anzahl/Position bestehender Buttons, Tooltips, und ggf. Zusammenlegen von Buttons mit
      identischer Aktion.
- [ ] **i18n intakt:** Alle geänderten Label-Texte sind weiterhin über die bestehenden
      `apps/web/src/locales/*/*.json`-Namespaces geführt (kein hartkodierter String), analog zum
      bestehenden Muster (z. B. `meta.json`, `deck.json`, `layout.json`, `recommendations.json`).
- [ ] **Tests:** Bestehende Component-/Interaction-Tests, die eines der betroffenen Labels per
      Text-Query finden (`getByText`/`getByRole`), sind aktualisiert, nicht nur zufällig weiterhin
      grün.

## Referenz-Katalog (Ist-Zustand, vollständig, Audit 2026-09-07)

Der vollständige Button-Katalog aus dem Audit (alle global sichtbaren Elemente, MetaPage,
DeckPage + Deck-Komponenten, Auth-Komponenten) liegt als Grundlage für den `planner` vor und
wird hier nicht dupliziert, um die Spec nicht aufzublähen — er ist Teil des Session-Kontexts,
mit dem diese Spec entstanden ist, und wird vom `planner` beim Einlesen erneut aus dem
aktuellen Code verifiziert (Golden Rule 1: Spec-Wissen ist keine Ausrede, den Code selbst nicht
mehr zu lesen). Zusätzlich im Audit gefunden, aber **nicht** Teil dieser Spec (siehe Out of
Scope): die tote Komponente `AddCardModal.tsx` (separat geflaggt) sowie die strukturelle
Duplikation von `UserMenu.tsx`/`MobileAccountSheet.tsx` für Desktop/Mobile (funktional keine
Nutzer-Verwirrung, da nie gleichzeitig sichtbar).

## Out of Scope

- **Kein visuelles Redesign.** Keine neue Farbpalette, kein neues Layout-Grundraster, keine
  Änderung an `docs/design-system.md` selbst.
- **`AddCardModal.tsx` (toter Code).** Separat als Housekeeping geflaggt, kein Teil dieser Spec
  — keine UX-Entscheidung, reine Repo-Hygiene.
- **`UserMenu.tsx`/`MobileAccountSheet.tsx`-Duplikation.** Beide sind nie gleichzeitig sichtbar
  (Desktop vs. Mobile), erzeugen also keine Nutzer-seitige Verwirrung — bleibt unangetastet.
- **Neue Features oder neue Aktionen.** Diese Spec entfernt/klärt bestehende Aktionen, fügt
  keine neuen hinzu.
- **Informationsarchitektur/Tab-Struktur.** Bereits Gegenstand von Spec 7
  (`ui-ux-hub-rework.md`), abgeschlossen — diese Spec bleibt unterhalb der Tab-Ebene.
- **Backend-/API-Änderungen.** Reine Frontend-Spec; keine der betroffenen Aktionen braucht laut
  Audit eine neue Route oder ein geändertes Response-Format.

## Offene Fragen (entschieden, 2026-09-07)

- **Sync/Aktualisieren-Gruppe:** **Entschieden: Option (c).** Die Sidebar wird auch auf Mobile
  sichtbar/erreichbar gemacht (statt `hidden md:flex`, `components/layout/Sidebar.tsx`), was die
  im Code selbst dokumentierte Ursache der MetaPage-Dopplung direkt beseitigt
  (`MetaPage.tsx:555-558`: "the meta page carries its own copy" — nur weil die Sidebar mobil
  fehlt). Damit entfällt der MetaPage-eigene "Live-Meta synchronisieren"-Button ersatzlos, sobald
  die Sidebar-Variante auf jedem Viewport erreichbar ist. Wie genau die Sidebar auf schmalen
  Viewports dargestellt wird (z. B. als Drawer/Overlay statt fixer Seitenleiste, Verhältnis zur
  bestehenden `BottomNav`/FAB) ist eine Umsetzungsfrage für den `planner`, keine Spec-Entscheidung
  — bindend ist nur: die Sync-/Aktualisieren-Aktionen aus der Sidebar müssen auf jedem Viewport
  erreichbar sein, ohne dass MetaPage sie noch einmal separat vorhalten muss.
  Für die verbleibenden vier sektionsspezifischen Buttons ("Daten neu laden" in der
  Matchup-Matrix, "Laden" bei Turnieren, "Aktualisieren" beim Deck-Vergleich, sowie die globale
  "Daten aktualisieren" in der Sidebar) gilt zusätzlich die Scope-Präfix-Entscheidung unten —
  Umbenennung statt Entfernung, da sie unterschiedliche, nicht redundante Wirkungsradien haben.
- **"Match loggen":** **Empfehlung übernommen — von vier auf drei Einstiegspunkte.** Bleiben:
  globaler FAB (mobil, `BottomNav.tsx:40-46`) und der DeckPage-Header-Button (Desktop-Äquivalent,
  `DeckPage.tsx:234-241`) für viewport-übergreifende Erreichbarkeit, sowie der Empty-State-Button
  in `OpponentLog.tsx:81-84` (Standard-Pattern: eine leere Liste bekommt eine inline-CTA genau
  dort, wo die Leere sichtbar wird — und er ist nie gleichzeitig mit dem Footer-Button sichtbar,
  erzeugt also für sich genommen keine Redundanz). Entfernt wird der Footer-Button
  `OpponentLog.tsx:196-202` — der ist der einzige der vier, der **gleichzeitig** mit dem
  DeckPage-Header-Button auf demselben Screen sichtbar ist (sobald Logs existieren, Header immer)
  und macht exakt dasselbe. Begründung für "drei statt zwei": der Empty-State-CTA hat einen
  eigenen, nicht redundanten Zweck (Leerlauf-Führung); "drei statt vier" behebt die einzige
  Stelle mit echter Gleichzeitigkeits-Redundanz.
- **Scope-Präfixe vs. Tooltips vs. Umbenennung:** **Empfehlung übernommen — sichtbarer
  Label-Text, nicht nur Tooltip.** Die App ist durchgehend mobil-first mitgedacht (eigene
  `BottomNav`/`MobileAccountSheet`-Komponenten, FAB) — Hover-Tooltips funktionieren auf
  Touch-Oberflächen nicht zuverlässig (kein Hover-Konzept), ein rein per Tooltip vermitteltes
  Scope-Signal würde also für einen Teil der Nutzer gar nicht ankommen. Umsetzung: sichtbare
  Labels bekommen einen Scope-Hinweis (z. B. "Matchup-Daten neu laden" statt "Daten neu laden",
  "Turnierliste laden" statt "Laden"), über die bestehenden `apps/web/src/locales/*/*.json`-
  Namespaces wie in den Akzeptanzkriterien gefordert. Höhere i18n-Änderungsfläche wird bewusst in
  Kauf genommen, weil sie näher am eigentlichen Ziel ("Verständlichkeit ohne Quellcode") liegt.
- **"Vergleich"/"Vergleichen":** **Empfehlung übernommen — umbenennen, nicht Verhalten
  angleichen.** Der BottomNav-Shortcut (`layout.json:6`, reine Navigation) bekommt ein klar
  navigations-typisches Label (z. B. "Zum Vergleich" statt "Vergleich"); der
  DeckComparisonPanel-Button (`recommendations.json:68`, löst `runDeckComparison` aus) behält
  "Vergleichen". Begründung: eine Verhaltensangleichung würde den BottomNav-Shortcut von reiner
  Navigation zu einem versteckten, API-auslösenden Seiteneffekt machen — das widerspricht dem
  Akzeptanzkriterium "kein Verhaltensverlust"/keine überraschenden Nebenwirkungen und hätte ein
  größeres Risiko-/Testflächen-Profil als eine reine Label-Änderung.
