# Spec 7: UI/UX-Umbau „Archetyp zuerst"

> **Status:** Freigegeben 2026-09-24. **Scheibe 1 umgesetzt** (PRs #103, #104 und PR (c), hinter `archetypeCoachUi`); Scheibe 2 offen. **Wireframe:** Design-Canvas
> „Pokekon – Archetyp-Coach Wireframe" (außerhalb des Repos, wie bei der Hub-Spec).
> Kontext: Teil 7 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Ersetzt Teile von** [`specs/ui-ux-hub-rework.md`](./ui-ux-hub-rework.md), siehe §2.
> **Vorgehen:** Gerüst ab sofort parallel zu Spec 2–4 möglich. Neue Inhalte docken an, sobald
> Spec 5, 6 und 8 fertig sind (§9).

## 1. Problem

Die App ist heute um das **ganze Meta** gebaut:

- Drei Tabs `overview | meta | deck` (`apps/web/src/store/dashboardStore.ts:64`,
  `apps/web/src/components/layout/navItems.ts:17-21`). `activeTab` ist nur In-Memory-State
  (`ui-ux-hub-rework`-Plan §0.1).
- Die Meta-Seite ist mit 727 Zeilen die größte Seite (`apps/web/src/pages/MetaPage.tsx`). Sie
  zeigt alle Archetypen, Turniere, die Matrix und das Equilibrium. Das können Limitless und
  Trainer Hub besser.
- Der eigene Archetyp ist eine Eigenschaft des Decks (`decks.archetype`, `schema.ts:165-178`)
  und ein localStorage-Wert (`deckArchSlug`, `apps/web/src/lib/preferences.ts:11`), aber
  kein Ankerpunkt der App.
- Der Kern-Loop (Liste → spielen → Log → lernen) ist über drei Seiten und mehrere Modals
  verteilt.

## 2. Verhältnis zur Hub-Spec (`ui-ux-hub-rework.md`)

| Entscheidung dort (2026-09-03) | Hier |
|---|---|
| Drei Einträge: Overview + Meta + Mein Deck | **Ersetzt** durch die Navigation in §4 |
| Overview bleibt als Einstieg, weil er ohne eigene Daten etwas zeigt | **Übernommen als Prinzip**: Das Cockpit zeigt ohne eigene Daten die Meta-Liste und das Feld des Archetyps |
| Wireframe vor der Planung | **Übernommen** |
| Verständliche Top-Level-Namen (Zielgruppe ab 8 Jahren), Fachbegriffe nur innerhalb der Seiten | **Übernommen**, siehe Namen in §4 |
| Equilibrium bekommt einen echten Platz unter „Meta" | **Geändert**: Das Equilibrium wandert nach *Werkzeuge* |

Die Hub-Spec bekommt beim Merge einen Hinweis „teilweise ersetzt durch
`archetype-first-ui.md`".

## User Stories

- Als Spieler will ich die App **um meinen Archetyp herum** erleben, nicht um das ganze Meta.
- Als Spieler will ich den Kreislauf **Liste kopieren → spielen → Log einfügen → lernen** ohne
  Umwege auf dem Handy durchlaufen.
- Als neuer Nutzer will ich auch **ohne eigene Daten** sofort etwas Nützliches sehen.

## 3. Leitidee

**Jeder Screen beantwortet eine Frage aus dem Kern-Loop:**

| Frage | Screen |
|---|---|
| Wie stehe ich gerade da, und was sollte ich als Nächstes tun? | **Start** (Cockpit) |
| Was spiele ich, und was sollte ich spielen? | **Deck** |
| Wie lief mein letztes Spiel, und was mache ich immer wieder falsch? | **Coaching** |
| Gegen wen muss ich bestehen? | **Gegner** (Matchups) |
| Ich will tiefer in die Daten | **Werkzeuge** |

## 4. Navigation

- **Mobil (BottomNav):** `Start · Deck · [＋ Log] · Coaching · Gegner`
  - Der zentrale Knopf bleibt (heute öffnet er `AddLogModal`, `BottomNav.tsx`), wird aber zu
    **„Log einfügen"** mit Spec-8-Ablauf. Der manuelle Match-Log ist dort ein zweiter Weg.
  - *Werkzeuge* und Konto liegen im Header-Menü (neben dem Archetyp-Wechsler).
- **Desktop (Sidebar):** alle fünf Bereiche plus Einstellungen, eine Quelle in `navItems.ts`.
- **Header auf jedem Screen:** Archetyp-Wechsler (Icon + Name, bestehend:
  `apps/web/src/components/shared/ArchetypePicker.tsx`) und ein Chip mit der **aktiven Liste**
  (Name + Version), der zum Export führt.
- `DashboardTab` wird zu `'start' | 'deck' | 'coaching' | 'opponents' | 'tools'`.
- **Deep-Links (offen):** Bisher gibt es kein URL-Routing, nur Tab-State. Für geteilte Listen
  und Experimente wären URLs sinnvoll. **Empfehlung:** leichtes Routing über den Hash
  (`#/lists/meta`), eigene kleine Spec.

## 5. Screens

### 5.1 Onboarding (erster Start und „Archetyp wechseln")
1. **Archetyp wählen:** Suche plus die 10 häufigsten Archetypen im Feld mit Meta-Anteil. Kein
   Zwang zu einem eigenen Deck.
2. **Liste festlegen:** „Meta-Liste übernehmen" (Standard) · „Eigene Liste einfügen" (Import) ·
   „Später".
3. **TCG-Live-Name** (für das Log-Parsing, Spec 8). Überspringbar.
4. Weiter zum Start mit einem Hinweis: „Spiel eine Runde und füge das Log ein."

Der gewählte Archetyp wird **serverseitig** gespeichert (neue Nutzereinstellung
`active_archetype_id`). `deckArchSlug` im localStorage wird einmalig migriert und entfällt
(CLAUDE.md §2.4, eine Quelle der Wahrheit). Pro Archetyp merkt sich die App die zuletzt aktive
Liste.

### 5.2 Start (Cockpit)
Von oben nach unten:
1. **Aktive Liste:** Name, Version, Validator-Status, Knopf „Für TCG Live kopieren".
2. **Nächster Schritt:** genau **eine** Empfehlung, priorisiert: laufendes Experiment
   („noch 8 Spiele bis zu einem Urteil") → neue Änderung der Meta-Liste („Neu: 1 Judge") →
   häufigste Baustelle aus Coaching → „Log einfügen".
3. **Deine Form:** Bilanz der letzten 7 Tage, WR mit Band (bestehend: `StatCard`).
4. **Feld diese Woche:** Top-5-Gegner mit Anteil, Trend und eigener WR. Tipp → *Gegner*.
5. **Letzte Spiele:** 3 Einträge mit Ergebnis. Tipp → Coaching-Detail.

### 5.3 Deck
Drei Segmente oben: **Meta-Liste · Meine Listen · Lab**
- **Meta-Liste** (Spec 5): Karten gruppiert nach Pokémon/Trainer/Energie, Flex-Karten
  markiert. Tipp auf eine Flex-Karte → Begründung und Band. Oben „Was hat sich geändert" und
  der Vergleich zur eigenen aktiven Liste. Aktionen: „Als meine Liste übernehmen", „Im Lab
  weiterentwickeln", „Kopieren".
- **Meine Listen:** Versionen als Zeitstrahl mit Diff, WR pro Version, aktive Version setzen,
  Import, Export. Übernimmt Inhalte von `DeckPanel`, `DeckSwitcher`, `DeckSettingsWidget` und
  dem Versionsvergleich aus `DeckAnalyticsPanel`.
- **Lab** (Spec 6): Projekte → Projekt: Liste mit Schloss-Icons, „Vorschläge holen" mit
  Beweisstufe A/B/C, laufendes Experiment mit Fortschritt.

### 5.4 Coaching
- Großes Einfügefeld „TCG-Live-Log einfügen" (auch über den ＋-Knopf erreichbar).
- **Ergebnis-Karte** nach dem Einfügen (Spec 8 §3), bei mehrdeutigem Gegner die Auswahl.
- **Deine Top-3-Baustellen** (Spec 8 §5) mit Trend.
- **Verlauf:** Liste aller Spiele, filterbar nach Gegner und Version. Detail = bestehendes
  `MatchDetailModal` mit `MatchStatsTab` und `DeckTurnQualityPanel`.

### 5.5 Gegner (Matchups)
- **Mein Feld:** globales Feld oder eigenes lokales Feld (bestehend: `LocalMetaPanel`).
- **Tabelle:** pro Gegner Anteil, Meta-WR mit Band, eigene WR, geblendete Einschätzung
  (bestehend: `MyMatchupsTable`, `FieldScorePanel`, `ThreatsPanel`).
- **Gegner-Detail:** typische Karten des Gegners, eigene Spiele gegen ihn, Karten der
  Meta-Liste, die dieses Matchup verbessern (aus Spec 5 §5), häufigste Coaching-Baustelle in
  diesem Matchup.

### 5.6 Werkzeuge (alle auf den Archetyp gefiltert)
- **Turnierlisten:** Cluster-Ranking, Turnier-Bestliste, Decklisten
  (`ArchetypeRecommendationPanel`, `TournamentBestListPanel`, `DecklistCard`)
- **Kartenstatistik:** Spielraten und Performance-Deltas (`archetype_card_stats`)
- **Matchup-Matrix:** die Zeile des eigenen Archetyps, die volle Matrix aufklappbar
  (`MatchupMatrix`)
- **Spieltheorie:** `EquilibriumPanel`, inhaltlich unverändert
- **Zeitfenster** (`MetaWindowControl`) gilt global für Werkzeuge und Meta-Liste
- **Allgemeines Meta:** Link-Karten zu Limitless und Trainer Hub

## 6. Umzugsplan der Komponenten

| Heute (Ort) | Neu | Aktion |
|---|---|---|
| `OverviewPage` + `StatCard` | Start §5.2 | umbauen |
| `DeckSwitcher`, `DeckPanel`, `DeckSettingsWidget` (`DeckPage.tsx:209`, `:289`, `:292`) | Deck › Meine Listen | umziehen |
| `ImportDeckModal`, `CreateDeckModal` | Deck › Meine Listen, Onboarding | umziehen |
| `DeckAnalyticsPanel` (+ `VariantComparison`, `DeckTurnQualityPanel`) (`DeckPage.tsx:299`) | Versionsvergleich → Meine Listen; Zugqualität → Coaching | aufteilen |
| `DeckTipsSection` (`DeckSynthesisPanel`, `DeckComparisonPanel`, `RecommendationsPanel`) | Deck › Meta-Liste (Vergleich + Begründungen) | aufgehen lassen; die 14 statischen Regeln prüfen, ob sie neben Spec 5 noch nötig sind |
| `MyMatchupsTable` (`DeckPage.tsx:217`) | Gegner | umziehen |
| `OpponentLog`, `MatchDetailModal`, `MatchStatsTab`, `AddLogModal` | Coaching (Verlauf, ＋-Knopf) | umziehen |
| `MetaPage`: `ArchetypeSelection`, `TournamentMetaTable`, `RecentTournaments`, `TournamentCard`, `ShareBar` | Onboarding-Auswahl (nur Top-Liste) bzw. entfällt | größtenteils entfernen |
| `MatchupMatrix`, `EquilibriumPanel` | Werkzeuge | umziehen |
| `LocalMetaPanel`, `PredictionPanel`, `FieldScorePanel`, `ThreatsPanel` | Gegner | umziehen |
| `ArchetypeDetail` (Container) | aufgelöst: Teile nach Werkzeuge und Gegner | auflösen |
| `MetaWindowControl` | Werkzeuge + Meta-Liste | umziehen |
| `SyncControls` (Sidebar, MobileAccountSheet) | Einstellungen (nur Admin) | umziehen |
| `DeckPerformancePanel`, `WinRateChart`, `MetaShareChart` | **kein Render-Ort gefunden** (grep nach `<Name`) | prüfen, ob toter Code; ggf. löschen |

## 7. Leere Zustände und Kaltstart

| Situation | Anzeige |
|---|---|
| Kein Archetyp gewählt | Onboarding §5.1, keine leeren Seiten |
| Archetyp ohne eigene Liste | Start zeigt die Meta-Liste als Vorschlag mit „Übernehmen" |
| Archetyp mit wenig Turnierdaten (`n_eff < 20`) | Meta-Liste zeigt den Medoid des besten Clusters (Spec 1) mit dem Hinweis „wenig Daten". Bei 0 Listen: Erklärung plus Lab als Einstieg |
| Keine eigenen Spiele | Coaching: Anleitung „So kopierst du ein Log aus TCG Live" (mit Bildern). Start: Nächster Schritt = „Log einfügen" |
| Kein LLM-Key | Coaching zeigt Zugstatistik; Hinweis auf die Einstellungen, einmalig und wegklickbar |
| Katalog-Sync noch nie gelaufen | Validator-Warnung statt Fehler (Spec 2 §5), Export deaktiviert mit Hinweis |
| Meta-Sync veraltet (> 3 Tage) | dezenter Hinweis mit Datenstand |

## 8. Demo-Modus

`POST /api/demo/seed` (`apps/api/src/routes/demo.ts:17`, Seed in
`apps/api/src/lib/demoSeed.ts`, 1177 Zeilen) muss den neuen Aufbau zeigen:
- gewählter Archetyp (N's Zoroark ex), aktive Liste und zwei Versionen,
- eine berechnete Meta-Liste (oder ein fester Seed-Snapshot davon),
- ein Lab-Projekt mit gesperrten Karten und einem laufenden Experiment,
- 20 Spiele mit Logs und Analysen inklusive `category`, damit die Top-3-Baustellen gefüllt sind.

## 9. Umsetzung in Scheiben

1. **Navigation und Rahmen:** neue Tabs, Header mit Archetyp-Wechsler, serverseitiger aktiver
   Archetyp, Onboarding. Bestehende Komponenten nach Tabelle §6 umziehen, noch ohne neue
   Inhalte.
2. **Meta-Seite zurückbauen**, Werkzeuge filtern.
3. **Export-Knopf**: ✅ **vorgezogen und umgesetzt** (Patch `feat: copy decks in Pokémon TCG
   Live format`, siehe Spec 2 §6). Mit Spec 7 wandert er nur an seinen neuen Ort.
4. **Meta-Liste** einhängen (Spec 5).
5. **Lab** einhängen (Spec 6).
6. **Coaching-Ablauf** und ＋-Knopf (Spec 8).
7. **Demo-Seed** nachziehen, bei jeder Scheibe mitgedacht.

Farbschema und Hintergrund (§9a) gehören in Scheibe 1, weil sie jeden Screen betreffen.

Scheibe 1–2 kommen hinter ein Feature-Flag (`archetypeCoachUi`), bis sie vollständig sind.
Dann wird umgeschaltet und die alte Navigation gelöscht.

## 9a. Visuelles Design (Konrad, 2026-09-24)

### Hintergrund: Pixel-Sprite des Archetyps
- **Bleibt wie in der heutigen App:** `DeckSpriteBackground`
  (`apps/web/src/components/DeckSpriteBackground.tsx`, eingebunden in `App.tsx:51`): gekacheltes
  Pixel-Sprite (72 px, `opacity: 0.11`), Typ-Farbschleier je Archetyp (`ARCHETYPE_TINT`,
  Zoroark `rgba(167,139,250,0.40)`), gelbe Ecke, heller Rand.
- **Änderung:** Die Komponente liest heute `activeDeck.archetype` (`:52-56`). Neu steuert der
  **aktive Archetyp** (§5.1) den Hintergrund, damit er auch ohne eigenes Deck stimmt
  (Onboarding, Meta-Liste ohne übernommene Liste).
- **Beobachtung:** Der Hintergrund nutzt nur die pokesprite-Quelle (`SPRITE_BASE`, `:4-5`),
  während `pokemonSprites.ts` (`SPRITE_BASES`, `:10-13`) zuerst Limitless' Icon-CDN versucht, weil
  dort neuere Formen (z. B. Mega-Formen) liegen. Bei Archetypen, die nur dort ein Sprite haben,
  bleibt der Hintergrund leer. Fix: dieselbe Kaskade verwenden.
- Karten sind leicht transparent (`rgba(255,255,255,0.94)`), damit der Hintergrund am Rand
  durchscheint, der Text aber voll lesbar bleibt.
- Das Wireframe zeigt an dieser Stelle ein neutrales Pixel-Muster als Platzhalter.

### Farbschema: Rot, Weiß, Blau, Gelb (Rot nur als Markenfarbe)
| Rolle | Farbe | Einsatz |
|---|---|---|
| Marke | Rot `#D62828` | **nur Markenflächen:** Header-Band, Onboarding-Streifen. Keine Buttons |
| Fläche | Weiß / `#F5F7FB` | Karten, Navigation, Spielmatte |
| Aktion | Blau `#1F5AA6` (≈ bestehendes `brand-700`) | alle Buttons, ＋-Knopf, aktiver Tab, Links, Auswahl, Fortschritt, positive Win-Rate |
| Akzent | Gelb `#FFCB05` (bestehendes `energy-500`) | Header-Kante, Ring um ＋, „Nächster Schritt", Flex-Markierung, „Experiment aktiv" |
| Negativ | Orange `#C2410C` | negative Win-Rate, Niederlage |

**Warum keine roten Buttons (Konrad, 2026-09-24):** Rot wird in Oberflächen als Warnung,
Fehler oder „Löschen" gelesen. Wären die Hauptaktionen rot, sähe „Log einfügen" gefährlich aus,
und echte destruktive Aktionen wären nicht mehr unterscheidbar. Deshalb trägt Rot nur die Marke,
und handeln heißt immer Blau.

- **Destruktive Aktionen** (Deck, Version oder Experiment löschen): Rot nur als Text- bzw.
  Umriss-Button mit eindeutigem Label und Bestätigungsdialog, nie als gefüllter Hauptknopf.
- Umsetzung: `btn-primary` bleibt Blau (`brand`, `apps/web/tailwind.config.js`). Neu ist nur
  eine kleine Palette `poke` (Rot) für die Markenflächen und den Destruktiv-Stil.
- **Kontraste geprüft:** Weiß auf Blau 6,8:1, Weiß auf Rot 5,0:1 (Header-Text), Orange auf Weiß
  5,2:1 (alle ≥ 4,5:1, AA). Gelb nie als Textfarbe auf Weiß, nur als Fläche oder Rand (Regel
  steht schon in der Tailwind-Konfiguration).
- Win-Rate-Farben immer zusammen mit der Zahl (bestehend: `winRateColor.ts`).
- Dunkelmodus ist nicht Teil dieser Spec.

## 10. i18n und Barrierefreiheit

- Neue Namespaces: `start`, `deck`, `lab`, `coaching`, `opponents`, `tools`, `onboarding`.
  Alte (`overview`, `recommendations`) entfallen, sobald sie leer sind
  (`apps/web/src/i18n/locales/de`, `en`).
- Jeder neue Text in **DE und EN** im selben PR.
- Touch-Ziele mindestens 44 px, echte `<button>`/`<a>`. Farbcodierung der Win-Rate immer mit
  Zahl, nie nur Farbe (bestehend: `winRateColor.ts`).

## 11. Akzeptanzkriterien

1. Nach dem Login ohne Archetyp erscheint das Onboarding. Mit Archetyp erscheint der Start.
2. Der Kern-Loop geht mobil ohne Umweg: Start → „Kopieren" → (spielen) → ＋ → Log einfügen →
   Ergebnis-Karte. Das sind höchstens drei Taps bis zum Einfügefeld.
3. Der aktive Archetyp ist nach Login auf einem zweiten Gerät derselbe.
4. Kein Screen zeigt Daten anderer Archetypen, außer Gegner-Daten und die Werkzeuge-Matrix.
5. Alle Zustände aus §7 sind umgesetzt und getestet.
6. Jede Komponente aus §6 hat genau einen neuen Ort oder ist gelöscht.
7. Der Demo-Modus zeigt alle fünf Bereiche mit Inhalt.
8. DE/EN vollständig, Gates grün, Doku (`docs/features.md`, `docs/architecture.md`
   §Frontend) aktualisiert.
9. Der Hintergrund zeigt das Sprite des aktiven Archetyps, auch ohne eigenes Deck, und nutzt
   dieselbe Sprite-Kaskade wie `pokemonSprites.ts` (§9a).
10. Kein gefüllter roter Button: Aktionen sind blau, Rot erscheint nur auf Markenflächen und als
    Umriss bei destruktiven Aktionen; Akzente gelb, negative Werte orange; alle Textkontraste
    ≥ 4,5:1 (§9a).

## 12. Entscheidungen (2026-09-23)

1. ~~Navigationsnamen~~ **Entschieden 2026-09-23 nach kritischer Prüfung:**
   `Start · Deck · Coaching · Gegner` (+ *Werkzeuge* im Menü). Änderung gegenüber dem Entwurf:
   **„Deck" statt „Listen"**. Begründung:
   - Die Hub-Spec hat „Mein Deck" bewusst gewählt, weil es ohne Vorwissen verständlich ist
     (Zielgruppe ab 8 Jahren). „Listen" ist Szene-Sprache und mehrdeutig (Liste von was?).
   - Der Tab enthält *ein* Thema, das eigene Deck in drei Sichten (Meta-Liste, Versionen, Lab).
     Innerhalb der Seite bleibt „Liste" als Fachbegriff erlaubt.
   - „Gegner" statt „Matchups": deutsch, kurz, ohne Vorwissen verständlich.
   - „Coaching" bleibt, weil es im Deutschen gebräuchlich ist und das Versprechen des Screens
     genau trifft.
   - Alle Labels passen bei 11 px in die BottomNav (längstes: „Coaching", 8 Zeichen).
2. *Werkzeuge* im Header-Menü (mobil) statt als eigener Tab: **ja**, weil die
   allgemeine Meta-Analyse ausdrücklich nur noch ein Werkzeug sein soll.
3. **Hash-Routing:** nicht in dieser Spec. Der Tab-State bleibt, Deep-Links kommen als eigene
   kleine Spec, sobald geteilte Listen oder Experimente das brauchen.
4. **Die 14 statischen Empfehlungsregeln** (`RecommendationsPanel`): in Scheibe 1 unverändert
   mitnehmen (unter *Deck › Meta-Liste*). Ob sie neben Spec 5 noch nötig sind, wird nach Spec 5
   entschieden. So blockiert die Frage nichts.
