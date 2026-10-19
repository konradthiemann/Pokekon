# Plan: Spec 7 „Archetyp zuerst" – Scheibe 2 (Meta-Seite zurückbauen, Werkzeuge filtern, Umschalten, Aufräumen)

> **Spec:** [`specs/archetype-first-ui.md`](../../specs/archetype-first-ui.md) (Spec 7) §9 Punkt 2 und
> letzter Absatz („Dann wird umgeschaltet und die alte Navigation gelöscht"), Rahmen
> [`specs/archetype-coach-vision.md`](../../specs/archetype-coach-vision.md) §7.4, §9.
> **Vorgänger:** [`archetype-first-ui.md`](./archetype-first-ui.md) (Scheibe 1, PRs #103–#105, gemergt).
> Alles, was Scheibe 1 bewusst verschoben hat (dort §1 Punkte 1–3, E10, E12, E13, E18, Risiko 7),
> gehört hierher.
> **Code-Stand der Belege:** `main` = `047ebd9` (= ausgecheckter Branch `feat/archetype-first-ui-slice2`).
> **Kennzeichnung:** ✅ Belegt (Datei gelesen) · ⚠️ Vermutung / Abweichung · ❌ Unbekannt.
> **Status:** Freigegeben 2026-09-29 mit allen Defaults aus §8 (F20: Link trainerhill.com bleibt). Umsetzung PR (a) auf `feat/archetype-first-ui-slice2`.

---

## Kontext

Scheibe 1 hat das Coach-Layout hinter `archetypeCoachUi` gebaut: Start, Deck, Coaching, Gegner,
Werkzeuge, Header, Onboarding, serverseitiger aktiver Archetyp. Drei Dinge sind offen:

1. **Inhaltlich unvollständig.** *Werkzeuge* bettet `ArchetypeDetail` als Ganzes ein und ist nicht
   auf den Archetyp gefiltert; Kartenstatistik fehlt; Feldwert/Threats erscheinen doppelt (Gegner
   und Werkzeuge). Mehrere Screens zeigen Daten **anderer eigener Archetypen** (siehe §0.2) – AC 4
   ist verletzt. AC 6 („jede §6-Komponente genau ein Ort") ist nicht erfüllt.
2. **Nicht umgeschaltet.** Alle Nutzer ohne `?ff=archetypeCoachUi` sehen das alte Layout.
3. **Alter Code lebt.** `MetaPage`, `OverviewPage`, `DeckPage`, `Sidebar`, `BottomNav`, `navItems`,
   `MobileAccountSheet`, `UserMenu`, drei tote Komponenten, doppelte Store-Slices, Flag-Weichen.

Reihenfolge (Auftrag): **erst das Coach-Layout vollständig machen (Flag noch per Browser), dann
für alle umschalten (mit Rückweg), dann Altes löschen, dann Dateien umziehen.** Jeder Schritt ist
für sich deploybar.

---

## 0. Belegprüfung (Stand `047ebd9`)

### 0.1 Angaben aus Spec 7 und dem Scheibe-1-Plan

| Angabe | Ergebnis | Befund |
|---|---|---|
| `dashboardStore.ts:64` Tabs `overview \| meta \| deck` | ⚠️ verschoben | jetzt `dashboardStore.ts:69`; `CoachTab` `:77`, `DeckView` `:80`, `activeTab` Default `:247`, `coachTab` `:249` |
| `navItems.ts:17-21` | ✅ | unverändert, drei Einträge |
| `MetaPage.tsx` 727 Zeilen | ⚠️ | jetzt **677** Zeilen (PR #102 hat den Drilldown ausgelagert); lokale Funktionen `ShareBar` `:47`, `TournamentMetaTable` `:100`, `TournamentCard` `:316`, `RecentTournaments` `:383`, `MetaPage` `:481`; exportierter Typ `ArchetypeSelection` `:41` (kein anderer Importeur) |
| `decks.archetype`, `schema.ts:165-178` | ⚠️ | `decks` jetzt `apps/api/src/db/schema.ts:168`; `archetype` serverseitig nur `z.string().min(1)` (`validation.ts:19`) – **kein Slug-Zwang** |
| `deckArchSlug`, `preferences.ts:11` | ⚠️ | Key jetzt `preferences.ts:12`; nur noch Lese-/Lösch-Helfer für die Migration (`:103`, `:111`) |
| `DeckPage.tsx:209/:289/:292/:299/:217` | ⚠️ verschoben | `DeckPage.tsx` hat nur noch 182 Zeilen: `DeckSwitcher` `:59`, `MyMatchupsTable` `:67`, `DeckPanel` `:127`, `DeckSettingsWidget` `:130` (extrahiert nach `components/deck/DeckSettingsWidget.tsx`), `DeckAnalyticsPanel` `:137` |
| `BottomNav.tsx` ＋ öffnet `AddLogModal` | ✅ | `BottomNav.tsx:40-46`, `:77-84` |
| `DeckSpriteBackground` in `App.tsx:51` | ⚠️ | jetzt `App.tsx:64` (altes Layout) und `CoachLayout.tsx:103` |
| `POST /api/demo/seed` `demo.ts:17` | ✅ | `routes.post('/seed', …)` `:17`; `demoSeed.ts` jetzt **1296** Zeilen (Spec: 1177), Dragapult-Deck `:1136` |
| `ArchetypeDetail` (Container) → „aufgelöst: Teile nach Werkzeuge und Gegner" | ✅ offen | `ArchetypeDetail.tsx` (507 Z.) mit KPI-Kopf `:300-360`, `TrendChips` `:47`, Tabs `matchups` (`FieldScorePanel`/`ThreatsPanel`/`MatchupTable`, `:393-435`), `recommendation` (`ArchetypeRecommendationPanel`, `:437`), `tournament` (`TournamentBestListPanel`, `:448`), `decklists` (`DecklistCard` + „mehr laden", `:452-502`). Gerendert in `MetaPage.tsx:521` und `pages/coach/ToolsPage.tsx:49` |
| `MetaWindowControl` „gilt global für Werkzeuge und Meta-Liste" | ⚠️ | Store-Slice `metaWindow` existiert (`dashboardStore.ts:147`); Control gerendert in `OpponentsPage.tsx:25` **und** in `ArchetypeDetail.tsx:256` (also auch in Werkzeuge) und `MetaPage.tsx:577` (lokaler State) |
| `SyncControls` → „Einstellungen (nur Admin)" | ✅ E16 | liegt in `AccountPanel.tsx:69` (für alle), kein Admin-Begriff |
| `DeckPerformancePanel`, `WinRateChart`, `MetaShareChart` ohne Render-Ort | ✅ tot | grep nach dem Namen außerhalb der eigenen Datei: **0 Treffer** (auch keine Tests). Ihre i18n-Gruppen (`deck.performance`, `meta.metaShareChart`, `meta.winRateChart`) werden nur von ihnen gelesen. `recharts` bleibt nötig (`MatchStatsTab.tsx`) |
| `StatCard` → Start „umbauen" | ⚠️ | `StartPage` nutzt `StatCard` **nicht**; einziger Nutzer ist `OverviewPage` → wird mit ihr tot |
| `archetype_card_stats` (Kartenstatistik) | ✅ | Route `GET /api/meta/archetypes/:archetypeId/card-stats?days` (`apps/api/src/routes/meta.ts:622`), Fenster auf `CARD_STATS_WINDOWS = [7,14,21,28]` gerastert (`validation.ts:222`, `:250`), immer Online-Bo1; Client `fetchArchetypeCardStats` (`lib/api.ts:737`), Typ `ArchetypeCardStat` (`packages/shared/src/cardPerformance.ts:228`). **Keine** eigene UI – nur als Delta-Spalte in `DeckComparisonPanel` (`CardDelta`, lokal `:72`) |
| Hub-Spec-Hinweis „teilweise ersetzt" | ✅ | bereits vorhanden |
| Scheibe-1-Plan Risiko 5: `coach-ui` zusätzlich auf `document.body` | ❌ nicht umgesetzt | `coach-ui` nur am Layout-Root (`CoachLayout.tsx:96`). Portale (`HeaderMenuSheet`, alle Modals) zeigen die **alten** Win-Rate-Farben. Löst sich in C6 (Scope global) |
| Scheibe-1-Plan: Namespaces `start`/`coaching`/`tools` | ⚠️ | umgesetzt als ein Namespace `coach` (`i18n/index.ts:15`), wie im Status-Block vermerkt |
| DE/EN-Parität | ✅ | `i18n/actionLabels.test.ts` A5, erwartet **11** Namespaces |

### 0.2 Zusätzliche Befunde (für AC 4 „keine fremden Archetyp-Daten")

- ✅ **`archetypeStats` ist über alle eigenen Decks aggregiert** (`db/queries.ts:247-330`,
  Kommentar `DeckPage.tsx:61-66`). Im Coach-Layout lesen es: *Start* „Feld diese Woche" (eigene WR,
  `StartPage.tsx:55`), *Gegner* `MyMatchupsTable` (`OpponentsPage.tsx:51`), *Werkzeuge*
  `ArchetypeRecommendationPanel` „Mein Spielstil" (über `ToolsPage.tsx:61`), *Deck › Meta-Liste*
  `DeckTipsSection` → `useRecommendations` (`DeckTipsSection.tsx:43-51`). Wer zwei Archetypen spielt,
  sieht überall die Mischung → **AC 4 verletzt**.
- ✅ **`DeckAnalyticsPanel` zeigt `VariantComparison` für jede Archetyp-Gruppe mit ≥ 2 Decks**
  (`DeckAnalyticsPanel.tsx:709-714`); `DeckHubPage.tsx:80-86` übergibt ungefilterte `decks` und
  `allLogs` → Varianten fremder Archetypen erscheinen unter *Meine Listen*.
- ✅ **`PredictionPanel` wählt die Perspektive selbst** (`PredictionPanel.tsx:154`: gewählt oder
  `scores[0]` = bestpositioniertes Deck), zeigt „Bestpositioniert: {deck}" und „Beste Listen für
  {deck}" – also Feldwert und Turnierlisten **fremder** Archetypen. `computeFieldScores` bewertet nur
  Archetypen, die selbst im Feld stehen (`packages/shared/src/fieldWinRate.ts:119`, `shares.map`).
  Ist der eigene Archetyp nicht im lokalen Feld, gibt es für ihn keinen Wert.
- ✅ **`EquilibriumPanel` ist meta-weit** (`EquilibriumPanel.tsx:133`, eine Zeile je Archetyp). Spec
  §5.6 sagt „inhaltlich unverändert", AC 4 erlaubt als Ausnahme aber nur Gegner-Daten und die
  Werkzeuge-**Matrix** → Spec-interner Widerspruch (E-F9).
- ✅ **`MatchupMatrix` hat keine Fokus-Zeile** (Props nur `window`, `iconsById`, `MatchupMatrix.tsx:43-49`).
- ✅ **Freie Slug-Eingabe:** `DeckSettingsWidget.tsx:89-110` erlaubt beliebigen Text als
  `archetype`; `pickMigrationArchetype` (`lib/coach/activeDeck.ts:43-50`) prüft **nur das aktive
  Deck**. Konten, deren aktives Deck einen ungültigen Slug hat, landen im Onboarding, obwohl andere
  Decks gültig wären.
- ✅ **Decks anderer Archetypen sind im Coach-Layout unsichtbar** (`DeckSwitcher` gefiltert,
  `DeckSwitcher.tsx:46`); das Onboarding (Schritt 1) bietet nur Feld + `KNOWN_ARCHETYPES`, nicht die
  Archetypen der eigenen Decks. Beim Umschalten für alle wirkt das wie „Decks weg".
- ✅ **Rückverweise des alten Layouts in geteilten Komponenten:** `DeckTipsSection.tsx:29,103`
  (`setActiveTab('meta')` als Fallback), `DeckComparisonPanel.tsx:145,161` (`setDeckSection('deck')`
  im „nicht eingerichtet"-Zweig, der im Coach-Layout unerreichbar ist, weil `deckArchSlug =
  activeArchetypeId ?? ''` und die Seite nur mit Archetyp rendert).
- ✅ **Store-Reste nur fürs alte Layout:** `activeTab`/`setActiveTab`, `deckSection`/`setDeckSection`,
  `openDeckComparison`, `recentTournaments`/`loadRecentTournaments`/`isFetchingTournaments`/
  `tournamentsError` (`dashboardStore.ts:93,142-143,156-178,359-363,461-473`),
  `lib/metaFetch.ts#fetchRecentTournaments` (einziger Aufrufer: Store), `types/index.ts:149`
  `RecentTournament`. `deckArchSlug` ist nur noch abgeleitet (`:102`, `:523`, `:533`, `:547`).
- ✅ **`UserMenu` wird nur von `Sidebar` gerendert** → stirbt mit ihr. `AuthModal` bleibt
  (`WelcomeScreen`, `DemoBanner`).
- ✅ **Sync-Verhalten ist nur in alten Tests abgesichert:** `Sidebar.test.tsx` E1/E2 und
  `MobileAccountSheet.test.tsx` D2–D6 (Sync-/Refresh-Knopf, Busy-State). `AccountPanel.test.tsx:61`
  prüft nur die Anwesenheit. Ohne Ersatz geht beim Löschen Abdeckung verloren.
- ✅ **`actionLabels.test.ts` bindet Texte des alten Layouts:** A1 `layout:nav.comparison`,
  `meta:tournaments.load`; A2 fünf Reload-Labels inkl. `meta:tournaments.load`; A3 `nav.comparison`;
  A4 `meta:tournaments.emptyHint`; A5 erwartet 11 Namespaces.
- ✅ **Docs-Gate bei Löschen/Verschieben:** Der Hook markiert bei `rm`/`mv`/`git rm`/`git mv` die
  **alten** Pfade (`docs-gate.sh:318-336`, `git status --porcelain`, `D`/`R`). Gelöschte oder
  verschobene Dateien unter `components/{meta,deck,opponent,recommendations,layout,auth,shared}/`
  lösen also Doku-Pflichten aus, `pages/`, `store/`, `lib/`, `hooks/` nicht. Die Mapping-Tabelle
  (`docs-gate.sh:199-235`) kennt nur die heutigen Ordner → nach E18 greift nur noch der generische
  Fall `apps/web/src/components/*` (nur `architecture.md`).
- ✅ **Kein Service Worker / PWA** (kein `registerSW`, kein Plugin) → keine veralteten Bundles über
  Reloads hinweg; offene Tabs laden nach einem Deploy aber evtl. gelöschte Lazy-Chunks nach (R4).
- ✅ **Kein URL-Routing:** `activeTab`, `deckSection`, `coachTab` sind In-Memory-State; persistiert
  sind nur `activeDeckId` (localStorage), `pokekon-ff-archetypeCoachUi`, `tcg-deck-arch-slug-v1`
  (migriert), `tcg-player-name`, `pokekon-lang`. Pfade gibt es nur für `/reset-password` und die
  Rechtsseiten (`App.tsx:98-108`).
- ❌ **Railway-Variable `VITE_FF_ARCHETYPE_COACH_UI`:** ob sie in Produktion gesetzt ist (und mit
  welchem Wert), ist im Repo nicht sichtbar. Vor PR (b) lesend prüfen (R5).
- ❌ **Anzahl echter Konten ohne Decks / mit ungültigem Slug:** nur per Produktions-DB feststellbar;
  nicht abgefragt (bewusst, keine Direkt-DB-Zugriffe). Relevant für R1–R3.

---

## 1. Zuschnitt, PRs und Reihenfolge

| PR | Branch | Inhalt | Flag-Zustand danach | Browser-Prüfung |
|---|---|---|---|---|
| **(a)** | `feat/archetype-first-ui-slice2` (dieser) | A1–A9: Coach-Layout inhaltlich vollständig – Gegner/Werkzeuge aufgeteilt, gefiltert, Kartenstatistik, AC-4-Lücken, Umschalt-Vorbereitung | unverändert (aus, per `?ff=` an) | **ja**, mit `?ff=archetypeCoachUi` mobil + Desktop (A9) |
| **(b)** | `feat/archetype-first-ui-switch` | B1–B2: Flag für alle **an**, persistenter Opt-out pro Browser als Rückweg | an für alle, `?ff=-archetypeCoachUi` schaltet pro Browser zurück | **ja**, in Produktion nach dem Deploy |
| **(c)** | `chore/archetype-first-ui-cleanup` | C1–C7: Flag-Code, alte Navigation/Seiten, tote Komponenten, Store-Reste, `.coach-ui`-Scope löschen; `CoachTab` → `DashboardTab` | es gibt nur noch ein Layout | **ja**, kurzer Rauchtest in Produktion |
| **(d)** | `chore/archetype-first-ui-structure` | D1–D3: Datei-Umzüge in Bereichs-Ordner (E18), Umbenennung `Coach*`, Neugliederung `docs/features.md` (E12) | – | nein (rein mechanisch; Gates + Rauchtest genügen) |

**Warum vier und nicht drei:** (b) ist absichtlich winzig, damit „Umschalten" allein deploybar und
per Revert zurücknehmbar ist. (c) löscht, (d) verschiebt – getrennt bleiben die Diffs lesbar (Löschen
= rote Blöcke, Umzug = Renames). Wer lieber drei PRs will, legt (c) und (d) zusammen (E-F1).

**Zeit zwischen (b) und (c):** (c) startet erst, wenn Konrad (b) in Produktion auf dem Handy
abgenommen hat und mindestens zwei Tage kein Rückweg nötig war (E-F4). Bis dahin ist
`?ff=-archetypeCoachUi` der Kill-Switch pro Browser.

### ACs, die Scheibe 2 abdeckt

| AC (Spec §11) | nach Scheibe 1 | nach Scheibe 2 | Unter-Scheibe |
|---|---|---|---|
| 1 Onboarding ohne Archetyp, sonst Start | voll (hinter Flag) | voll **für alle** | A8, B1 |
| 2 Kern-Loop ≤ 3 Taps | Teil (Ergebnis-Karte = Spec 8) | unverändert Teil | – |
| 3 Archetyp auf zweitem Gerät gleich | voll | voll | – |
| 4 keine fremden Archetyp-Daten | Teil | **voll**, mit den Ausnahmen Gegner, Matrix und (E-F9) Spieltheorie | A2, A3, A4, A5, A7 |
| 5 Zustände §7 | Teil | Teil: „Meta-Sync > 3 Tage" bleibt offen (E-F16); neu: Kartenstatistik-Kaltstart, Archetyp nicht im Fenster | A4, A6 |
| 6 jede §6-Komponente genau ein Ort | Teil | **voll** (Tabelle §6.1 unten) | A3, A4, C2–C5 |
| 7 Demo zeigt alle Bereiche | Teil | Teil (Coaching-Inhalt = Scheibe 7, E9) | A9 Abnahme |
| 8 DE/EN, Gates, Doku | voll für Scheibe 1 | voll, inkl. `features.md`-Neugliederung | alle, D2 |
| 9 Hintergrund | voll | voll | – |
| 10 kein roter Button, Farben | voll im Coach-Layout (Portale ausgenommen, §0.1) | voll für Rollen `wr-*` global (C6); hart codierte Altfarben siehe E-F19 | C6 |

### 6.1 Zielbild „genau ein Ort" (AC 6)

| §6-Zeile | Ort nach Scheibe 2 | Unter-Scheibe |
|---|---|---|
| `OverviewPage` + `StatCard` | gelöscht (Start ersetzt sie) | C3 |
| `DeckSwitcher`, `DeckPanel`, `DeckSettingsWidget` | Deck › Meine Listen | A7, C5 |
| `ImportDeckModal`, `CreateDeckModal` | Deck › Meine Listen (+ Onboarding über `ListSetup`) | – |
| `DeckAnalyticsPanel` (+ `VariantComparison`) | Deck › Meine Listen, nur Archetyp | A7 |
| `DeckTurnQualityPanel` | Coaching (aus `DeckAnalyticsPanel` entfernt) | C5 |
| `DeckTipsSection` (Synthesis, Comparison, Recommendations) | Deck › Meta-Liste | – |
| `MyMatchupsTable` | Gegner (auf Archetyp gefiltert) | A2 |
| `OpponentLog`, `MatchDetailModal`, `MatchStatsTab`, `AddLogModal` | Coaching (＋ in der BottomNav) | – |
| `MetaPage` + lokale Funktionen | gelöscht | C3 |
| `MatchupMatrix` | Werkzeuge (eigene Zeile, voll aufklappbar) | A5 |
| `EquilibriumPanel` | Werkzeuge (eigene Zeile hervorgehoben) | A5 |
| `LocalMetaPanel`, `PredictionPanel`, `FieldScorePanel`, `ThreatsPanel` | Gegner | A3 |
| `ArchetypeDetail` | aufgelöst: Matchups → Gegner (`GlobalFieldPanel`), KPI/Trend + Empfehlung/Turnier/Decklisten → Werkzeuge; Datei gelöscht | A3, A4, C3 |
| `MetaWindowControl` | global: Werkzeuge + Gegner (Meta-Liste mit Spec 5) – E-F10 | A3, A4 |
| `SyncControls` | Konto-Bereich (`AccountPanel`) | – |
| `DeckPerformancePanel`, `WinRateChart`, `MetaShareChart` | gelöscht | C4 |

---

## Betroffene Dateien

| Datei | Änderungstyp | Grund | Unter-Scheibe |
|---|---|---|---|
| `apps/web/src/hooks/useArchetypeAnalysis.ts` (+ Test) | neu | Analyse-Fetch aus `ArchetypeDetail` teilen (Gegner + Werkzeuge) | A1 |
| `apps/web/src/hooks/useArchetypeLists.ts` (+ Test) | neu | Decklisten mit „mehr laden" | A1 |
| `apps/web/src/hooks/useArchetypeTournaments.ts` (+ Test) | neu | Turnier-Picker (eigene Fehlerdomäne) | A1 |
| `apps/web/src/lib/archetypeStats.ts` (+ Test) | neu (aus `db/queries.ts` extrahiert) | reine Aggregation `computeArchetypeStats` | A2 |
| `apps/web/src/db/queries.ts` | Änderung | `getArchetypeStats` delegiert an die reine Funktion | A2 |
| `apps/web/src/store/dashboardStore.ts` (+ Test) | Änderung | archetyp-gefilterte `archetypeStats`; `reassignDeckArchetype`; später Aufräumen, `DashboardTab` | A2, A7, C1, C3, C5 |
| `apps/web/src/components/opponents/GlobalFieldPanel.tsx` (+ Test) | neu | Matchups-Tab aus `ArchetypeDetail` | A3 |
| `apps/web/src/components/meta/PredictionPanel.tsx` (+ Test) | Ergänzung | `perspectiveArchetypeId` | A3 |
| `apps/web/src/lib/coach/opponents.ts` (+ Test) | neu | `ownFieldScore` (eigener Archetyp gegen lokales Feld) | A3 |
| `apps/web/src/pages/coach/OpponentsPage.tsx` (+ Test) | Änderung | Segment „Globales Feld · Mein Feld" | A3 |
| `apps/web/src/components/tools/ArchetypeMetaSummary.tsx` (+ Test) | neu | KPI-Kopf + Trend aus `ArchetypeDetail` | A4 |
| `apps/web/src/components/tools/TournamentListsPanel.tsx` (+ Test) | neu | Empfehlung · Turnier · Decklisten aus `ArchetypeDetail` | A4 |
| `apps/web/src/pages/coach/ToolsPage.tsx` (+ Test) | Änderung | Neuaufbau ohne `ArchetypeDetail` | A4, A5, A6 |
| `apps/web/src/components/meta/MatchupMatrix.tsx` (+ Test) | Ergänzung | `focusArchetypeId` | A5 |
| `apps/web/src/components/meta/EquilibriumPanel.tsx` (+ Test) | Ergänzung | `highlightArchetypeId` | A5 |
| `apps/web/src/hooks/useArchetypeCardStats.ts` (+ Test) | neu | Kartenstatistik-Fetch | A6 |
| `apps/web/src/components/tools/CardStatsPanel.tsx` (+ Test) | neu | Kartenstatistik-Werkzeug | A6 |
| `apps/web/src/components/shared/CardDelta.tsx` | neu (aus `DeckComparisonPanel.tsx:34-102` verschoben) | Delta-Anzeige teilen | A6 |
| `apps/web/src/components/recommendations/DeckComparisonPanel.tsx` | Änderung | importiert `CardDelta`; später toter Zweig raus | A6, C5 |
| `apps/web/src/pages/coach/DeckHubPage.tsx` (+ Test) | Änderung | Analytics auf Archetyp filtern, Hinweis andere Archetypen, gesperrter Slug | A7 |
| `apps/web/src/components/deck/DeckSettingsWidget.tsx` (+ neuer Test) | Ergänzung → Vereinfachung | `lockArchetype` (E13); in C5 einziges Verhalten | A7, C5 |
| `apps/web/src/components/deck/OtherArchetypeDecks.tsx` (+ Test) | neu | Decks anderer Archetypen sichtbar machen | A7 |
| `apps/web/src/lib/coach/otherDecks.ts` (+ Test) | neu | reine Gruppierung | A7 |
| `apps/web/src/lib/coach/activeDeck.ts` (+ Test) | Änderung | Migrations-Fallback über alle Decks | A8 |
| `apps/web/src/lib/coach/onboarding.ts` (+ Test), `components/coach/onboarding/OnboardingFlow.tsx` (+ Test) | Ergänzung | „Deine Archetypen" in Schritt 1 | A8 |
| `apps/web/src/lib/featureFlags.ts` (+ Test), `apps/web/.env.example` | Änderung (B1) → gelöscht (C1) | Umschalten, dann entfernen | B1, C1 |
| `apps/web/src/vite-env.d.ts` | Änderung | `VITE_FF_ARCHETYPE_COACH_UI` entfernen | C1 |
| `apps/web/src/App.tsx`, `App.test.tsx` | Änderung | nur noch Coach-Layout | C1 |
| `apps/web/src/components/layout/SyncControls.test.tsx` | neu (Regressionsnetz) | Sync-Tests aus den alten Shell-Tests übernehmen | C2 |
| `components/layout/{Sidebar,BottomNav,navItems}.tsx`, `components/auth/{MobileAccountSheet,UserMenu}.tsx` + Tests | gelöscht | alte Navigation | C2 |
| `pages/{OverviewPage,DeckPage,MetaPage}.tsx`, `components/meta/ArchetypeDetail.tsx`, `components/layout/StatCard.tsx` + Tests | gelöscht | alte Seiten | C3 |
| `apps/web/src/lib/metaFetch.ts` (+ Test), `types/index.ts` | Änderung | `fetchRecentTournaments`, `RecentTournament` entfernen | C3 |
| `components/meta/{MetaShareChart,WinRateChart}.tsx`, `components/deck/DeckPerformancePanel.tsx` | gelöscht | tot | C4 |
| `apps/web/src/components/deck/{DeckTipsSection,DeckAnalyticsPanel}.tsx` (+ Tests) | Änderung | Rückverweise/Optionen des alten Layouts raus | C5 |
| `apps/web/src/index.css`, `components/meta/winRateColor.ts`, `theme/noFilledRed.test.ts` | Änderung | `.coach-ui`-Scope global, Test-Scope global | C6 |
| `apps/web/src/i18n/index.ts`, `locales/{de,en}/*.json`, `i18n/actionLabels.test.ts` | Ergänzung/Löschung | neue Keys; tote Keys, Namespace `overview` raus | A3–A8, C2–C5 |
| diverse `git mv` (Tabelle in D1) | Umzug | E18 | D1 |
| `.claude/hooks/docs-gate.sh`, `docs-gate.test.sh` | Änderung | Mapping auf neue Ordner (E-F15) | D1 |
| `docs/features.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/demo-mode.md`, `docs/data-flow.md`, `docs/README.md`, `apps/web/README.md` | Änderung | Golden Rule 7 / Docs-Gate | jede |
| `specs/archetype-first-ui.md` | Änderung | Status, Klarstellungen (E-F9, E-F10) | B2, C7 |

---

## Wiederverwendbare Utilities

| Utility | Ort | Nutzung |
|---|---|---|
| Request-Key-Muster (`loaded.key === requestKey`) | `hooks/useFieldAnalysis.ts:11-40`, `hooks/useMetaEquilibrium.ts`, `ArchetypeDetail.tsx:143-218` | alle neuen Hooks (A1, A6) |
| `getArchetypeAnalysis`, `getArchetypeLists`, `getArchetypeTournaments`, `fetchArchetypeCardStats` | `lib/api.ts` (`:737` für Card-Stats) | A1, A6 – keine neuen Client-Funktionen nötig |
| `FieldScorePanel`, `ThreatsPanel`, `MatchupTable` | `components/meta/` | `GlobalFieldPanel` (A3) |
| `ArchetypeRecommendationPanel`, `TournamentBestListPanel`, `DecklistCard` | `components/meta/` | `TournamentListsPanel` (A4) |
| `TrendChips`, KPI-Markup | `ArchetypeDetail.tsx:47-71`, `:300-360` | nach `ArchetypeMetaSummary` verschieben (A4) |
| `SegmentedTabs` | `components/shared/SegmentedTabs.tsx` | Gegner-Segment (A3), Werkzeuge-Tabs (A4) |
| `CollapsibleSection` | `components/layout/CollapsibleSection.tsx` | Werkzeuge (A4–A6) |
| `computeFieldScores` | `packages/shared/src/fieldWinRate.ts:107` | `ownFieldScore` (A3) |
| `logsOfArchetype` | `lib/coach/start.ts` | A2, A7 |
| `CardDelta`, `TIER_*` | `DeckComparisonPanel.tsx:34-102` | Kartenstatistik (A6) |
| `confidenceTier`, `formatWithInterval` | `components/meta/confidence.ts` | A6 |
| `ARCHETYPE_SLUG_PATTERN` | `packages/shared/src/meta.ts:124` | A7, A8 |
| `archetypeDisplayName` | `lib/coach/archetypeName.ts` | A7, A8 |
| `updateDeck` | `db/queries.ts` | `reassignDeckArchetype` (A7) |
| `resolveFeatureFlag` | `lib/featureFlags.ts:41` | B1 |

**Datenfluss:** Die neuen Hooks rufen `lib/api.ts` direkt, wie die bestehenden `useFieldAnalysis`/
`useMetaEquilibrium`. Das weicht vom Muster api → queries → Store → Komponente ab, ist aber das in
Scheibe 1 etablierte Muster für **seitenlokale, fensterabhängige Meta-Lesezugriffe** (kein geteilter
State, keine Schreibzugriffe). Schreibende Aktionen (A7 `reassignDeckArchetype`) gehen über
`queries.ts` → Store.

---

## Implementierungsschritte (Unter-Scheiben)

Jede Unter-Scheibe ist ein eigener Commit und für sich grün (`npm run typecheck`, `npm run lint`,
`npm run test` im Root). Tests zuerst (tester), dann Implementierung (implementer). Es gibt **keine
Server-Änderung** (keine Schema-, Routen- oder Shared-Änderung) – alle Unter-Scheiben sind Web.

**Docs-Gate-Faustregel (verifiziert an `docs-gate.sh`):** triggert bei **neuen** Dateien unter
`apps/web/src/components/*` und bei `rm`/`mv`/`git rm`/`git mv` von Dateien unter
`components/*` (alter Pfad zählt). Bearbeitete, getrackte Komponenten, `pages/`, `hooks/`, `lib/`,
`store/`, `i18n/`, `index.css` triggern **nicht** – dort zieht Golden Rule 7 die Doku von Hand nach.
**Security:** Scheibe 2 bringt **keine neue Route, keinen neuen User-Input an den Server** und keine
neuen externen Hosts. Einziger Schreibpfad ist A7 (`PATCH /api/decks/:id` über das bestehende
`updateDeck`, gleiche Validierung wie heute). Kein security-agent-Durchlauf zwingend; der
code-review-agent prüft A7.

---

### PR (a) – Coach-Layout vollständig (Flag weiter per Browser)

#### A1 – Daten-Hooks aus `ArchetypeDetail` (keine sichtbare Änderung)

**ACs:** Vorbereitung für 4, 6.

**Rote Tests:**
- `hooks/useArchetypeAnalysis.test.ts` (`lib/api` gemockt, Muster `useMetaEquilibrium.test.ts`):
  - `it('loads the analysis for archetype + window')` → `getArchetypeAnalysis('dragapult-ex', { days: 30, online: true, bo1: true })`, `data` gesetzt, `isLoading false`.
  - `it('reports notInWindow on a 404 ApiError, not a generic error')` → `{ notInWindow: true, error: null }`.
  - `it('reports a generic error message for other failures')`.
  - `it('drops the answer of a superseded archetype or window')` (zwei Aufrufe, der erste löst zuletzt auf → Daten des zweiten bleiben).
  - `it('does not fetch without an archetype')` → `archetypeId: null` → kein Aufruf, `data null`, `isLoading false`.
- `hooks/useArchetypeLists.test.ts`: erste Seite mit `limit 4, offset 0`; `loadMore()` hängt an
  (`offset = lists.length`); `loadMoreFailed` bei Fehler, bestehende Listen bleiben; Fensterwechsel
  setzt zurück.
- `hooks/useArchetypeTournaments.test.ts`: lädt; Fehler → `tournaments: []` ohne Throw (eigene
  Fehlerdomäne wie `ArchetypeDetail.tsx:186-207`).

**Schnittstellen:**
```ts
// hooks/useArchetypeAnalysis.ts
export function useArchetypeAnalysis(archetypeId: string | null, window: MetaWindow): {
  data: ArchetypeAnalysis | null; isLoading: boolean; notInWindow: boolean; error: string | null;
};
// hooks/useArchetypeLists.ts
export function useArchetypeLists(archetypeId: string | null, window: MetaWindow, pageSize?: number): {
  lists: ArchetypeListEntry[]; total: number; isLoading: boolean;
  loadMore: () => void; isLoadingMore: boolean; loadMoreFailed: boolean;
};
// hooks/useArchetypeTournaments.ts
export function useArchetypeTournaments(archetypeId: string | null, window: MetaWindow): {
  id: string; name: string; date: string; players: number;
}[];
```
`ArchetypeDetail` bleibt **unverändert** (nur noch vom alten `MetaPage` genutzt, gelöscht in C3) –
bewusst keine Umstellung, um das alte Layout nicht anzufassen.

**Docs:** keine Gate-Pflicht (`hooks/`); `docs/architecture.md` §Archetype-first UI: Hooks in der
Bausteinliste ergänzen (Golden Rule 7). **Security:** nein.

---

#### A2 – Eigene Bilanz nur für den aktiven Archetyp (AC 4)

**ACs:** 4.

**Reine Logik:** `computeArchetypeStats(logs, metaSnaps)` wird 1:1 aus `db/queries.ts:247-330`
nach `lib/archetypeStats.ts` extrahiert; `getArchetypeStats()` ruft sie auf (Verhalten gleich,
`db/queries.test.ts` bleibt unverändert grün als Regressionsnetz).

**Store (`refresh`):** Nach dem `Promise.all` gilt im Coach-Layout (`isArchetypeCoachUiEnabled() &&
activeArchetypeId !== null`):
`archetypeStats = computeArchetypeStats(logsOfArchetype(opponentLogs, decks, activeArchetypeId), metaSnapshots)`.
Mit Flag aus oder ohne Archetyp bleibt der bisherige Wert (alle Decks). Damit sind Start,
Gegner (`MyMatchupsTable`), Werkzeuge („Mein Spielstil") und Deck › Meta-Liste (`useRecommendations`)
auf einen Schlag gefiltert, ohne jede Seite einzeln anzufassen (E-F18).

**Rote Tests:**
- `lib/archetypeStats.test.ts`: Tie-Gewichtung (6W/4L/2T → 56), Meta-Archetypen ohne Logs mit
  `encounters: 0`, Bo1-Äquivalent – Fälle aus `db/queries.test.ts:35-90` als reine Funktion.
- `store/dashboardStore.test.ts`, neuer Block `describe('archetype-scoped archetypeStats (Spec 7 AC 4)')`:
  - `it('with the flag on, archetypeStats only count logs of decks of the active archetype')` → Decks `dragapult-ex` (id 1) und `n-zoroark` (id 2), je ein Log gegen „Gardevoir ex" (W bzw. L) → `encounters 1, wins 1`.
  - `it('with the flag off, archetypeStats keep counting all decks')`.
  - `it('without an active archetype (onboarding), archetypeStats keep counting all decks')`.
  - `it('setActiveArchetype re-scopes archetypeStats')`.

**Docs:** `docs/architecture.md` §State Management (Satz zur Filterung); `docs/features.md` §21
(Start/Gegner: „eigene Bilanz nur dieses Archetyps"). Gate triggert nicht. **Security:** nein.

---

#### A3 – Gegner: globales Feld und mein Feld, feste Perspektive (§5.5)

**ACs:** 4, 6.

**Umbau:** *Gegner* bekommt oben das Segment **„Globales Feld · Mein Feld"** (`SegmentedTabs`,
lokaler State, Default `global`, E-F11). Darunter immer `MyMatchupsTable` (eigene Spiele, A2).
- *Globales Feld* = neuer `GlobalFieldPanel` (Inhalt des `matchups`-Tabs aus `ArchetypeDetail.tsx:393-435`:
  `FieldScorePanel` + `ThreatsPanel` + aufklappbare `MatchupTable`), Daten aus `useArchetypeAnalysis(activeArchetypeId, metaWindow)`.
- *Mein Feld* = `LocalMetaPanel` + `PredictionPanel` mit **fester Perspektive** `perspectiveArchetypeId = activeArchetypeId`:
  Perspektiv-`<select>` und „Bestpositioniert"-Zeile entfallen, Feldwert/Threats und „Beste Listen"
  beziehen sich immer auf den eigenen Archetyp. Ist er nicht im lokalen Feld, wird er mit Anteil 0
  als Subjekt bewertet (`ownFieldScore`).
- `MetaWindowControl` bleibt oben (global über `metaWindow`, E-F10).

**Reine Logik** – `lib/coach/opponents.ts`:
```ts
/** Field score of `archetypeId` against `field` (local shares). The subject joins with share 0
 *  when it is not part of the field, so it is scored without changing the field. */
export function ownFieldScore(
  archetypeId: string, archetypeName: string,
  field: readonly ArchetypeShare[], matchups: readonly MatchupRow[],
): FieldScore | null;
```
⚠️ Vermutung: Ein Subjekt mit `sharePct: 0` verändert die Werte der übrigen nicht und erzeugt kein
`NaN` (`fieldWinRate.ts:117` summiert Anteile, `:125` iteriert Gegner). Der erste Test belegt oder
widerlegt das; bei Widerlegung wird der Subjekt-Eintrag nur für die eigene Berechnung ergänzt und
die Gegnerschleife filtert Anteil 0.

**Rote Tests:**
- `lib/coach/opponents.test.ts`:
  - `it('scores the own archetype when it is part of the field')` → gleich `computeFieldScores(...)` für diesen Eintrag.
  - `it('scores the own archetype with share 0 when it is not in the field, without NaN')`.
  - `it('returns null when no matchup covers any opponent')`.
- `components/opponents/GlobalFieldPanel.test.tsx` (`useArchetypeAnalysis` gemockt):
  `FieldScorePanel` und `ThreatsPanel` bekommen `analysis.fieldScore`; `MatchupTable` erst nach Klick
  auf „alle N anzeigen"; Ladezustand; `notInWindow` → Hinweistext `opponents.page.notInWindow`;
  Fehler → `role="alert"`.
- `components/meta/PredictionPanel.test.tsx`, neuer Block `describe('fixed perspective (Spec 7 §5.5, AC 4)')`:
  - `it('hides the perspective picker and the best-positioned line with perspectiveArchetypeId')`.
  - `it('shows field score and lists of the given archetype, even if another deck scores higher')` → `getArchetypeLists` mit `'dragapult-ex'`.
  - `it('scores the own archetype when it is not in the local field')`.
  - `it('keeps the old behaviour without perspectiveArchetypeId')` (alte Tests bleiben unverändert).
- `pages/coach/OpponentsPage.test.tsx` (bestehende Fälle bleiben, angepasst nur wo das Segment
  dazwischenliegt – offen benannt):
  - `it('shows the global field of the active archetype by default')`.
  - `it('switches to my field: LocalMetaPanel and PredictionPanel with the active archetype as perspective')`.
  - `it('always shows MyMatchupsTable')`.
  - `it('does not render ArchetypeDetail, the perspective picker or lists of other archetypes')`.

**Schnittstellen:**
```ts
export function GlobalFieldPanel(p: { archetypeId: string; window: MetaWindow }): JSX.Element;
// PredictionPanel props += perspectiveArchetypeId?: string
```
Neue Keys `opponents.page.{globalField, myField, notInWindow}` (DE/EN).

**Docs (Gate):** neue Datei `components/opponents/GlobalFieldPanel.tsx` → `docs/architecture.md`
§Frontend; von Hand `docs/features.md` §21 Gegner und §16 („Perspektive fest im Coach-Layout").
**Browser:** ja (Segment, Threats-Liste mobil 375 px). **Security:** nein.

---

#### A4 – Werkzeuge: `ArchetypeDetail` auflösen, auf den Archetyp filtern (§5.6)

**ACs:** 4, 5 (Archetyp nicht im Fenster), 6.

**Neuer Aufbau von `ToolsPage`** (von oben):
1. Kopf mit `MetaWindowControl` (global).
2. **„Dein Archetyp im Meta"** = `ArchetypeMetaSummary` (KPI-Zeile Anteil/WR+Band/Spieler/Feldwert+Rang
   und `TrendChips`, aus `ArchetypeDetail.tsx:47-71, :263-362`), Daten `useArchetypeAnalysis` (E-F12).
3. **Turnierlisten** = `TournamentListsPanel` mit Tabs *Empfehlung* (`ArchetypeRecommendationPanel`),
   *Turnier* (`TournamentBestListPanel`, nur wenn `useArchetypeTournaments` Einträge liefert),
   *Decklisten* (`DecklistCard` + „mehr laden", `useArchetypeLists`). Der Matchups-Tab entfällt hier
   (lebt in Gegner, A3).
4. **Kartenstatistik** (A6), eingeklappt.
5. **Matchup-Matrix** (A5), eingeklappt.
6. **Spieltheorie** (A5), eingeklappt.
7. **Allgemeines Meta**: Link-Karten (unverändert).

**Rote Tests:**
- `components/tools/ArchetypeMetaSummary.test.tsx`: vier KPIs mit Werten; Band als „a–b %";
  `TrendChips` erst ab zwei Punkten; `notInWindow` → Hinweis statt KPIs.
- `components/tools/TournamentListsPanel.test.tsx`: drei bzw. zwei Tabs (Turnier nur mit Turnieren);
  Default *Empfehlung*; *Decklisten* zeigt „x von y" und „mehr laden" ruft `loadMore`;
  `loadMoreFailed` → Fehlerzeile; kein `FieldScorePanel`/`MatchupTable` im Panel.
- `pages/coach/ToolsPage.test.tsx` – der Fall `'embeds ArchetypeDetail for the active archetype
  without a back button'` wird **offen ersetzt** (Scheibe 1 hat das Einbetten als Zwischenstand
  festgeschrieben, Scheibe 2 löst es laut Spec §6 auf):
  - `it('renders summary, tournament lists, card stats, matrix and game theory in this order')`.
  - `it('never renders ArchetypeDetail')` (Modul-Mock, der bei Render wirft).
  - `it('passes the active archetype and the store window to every section')`.
  - bestehend: Links sicher, keine Turnier-Tabellen der alten Meta-Seite.

**Schnittstellen:**
```ts
export function ArchetypeMetaSummary(p: { archetypeId: string; archetypeName: string; window: MetaWindow }): JSX.Element;
export function TournamentListsPanel(p: {
  archetypeId: string; archetypeName: string; window: MetaWindow;
  archetypeStats: ArchetypeStats[]; archetypes: FieldAnalysisArchetype[]; localMeta: string[];
}): JSX.Element;
```
Neue Keys `coach.tools.{summary, cardStats}` (DE/EN); Texte der verschobenen Teile bleiben im
Namespace `meta` (`archetypeDetail.*`), keine Umbenennung (E-F14).

**Docs (Gate):** neue Dateien `components/tools/*` → `docs/architecture.md` §Frontend; von Hand
`docs/features.md` §21 Werkzeuge und §15 (Drilldown „im Coach-Layout aufgeteilt").
**Browser:** ja. **Security:** nein.

---

#### A5 – Matrix mit eigener Zeile, Spieltheorie mit Hervorhebung

**ACs:** 4 (Ausnahme Matrix; Spieltheorie per E-F9), 6.

**Rote Tests:**
- `components/meta/MatchupMatrix.test.tsx`, neuer Block `describe('focus row (Spec 7 §5.6)')`:
  - `it('with focusArchetypeId renders only that row, all columns')` → genau eine `<tbody><tr>`.
  - `it('"show full matrix" reveals all rows and can collapse again')` (Knopf mit `aria-expanded`).
  - `it('without focusArchetypeId renders the full matrix (unchanged)')`.
  - `it('shows a hint when the focused archetype has no row in the window')`.
- `components/meta/EquilibriumPanel.test.tsx`, neuer Block:
  - `it('marks the highlighted archetype row (aria-current and a visible label)')` → `data-testid="equilibrium-archetype-dragapult-ex"` hat `aria-current="true"` und Text „Dein Archetyp".
  - `it('shows a one-line summary for the highlighted archetype above the table')` (Gleichgewichts-Gewicht, Payoff).
  - `it('renders unchanged without highlightArchetypeId')`.
- `pages/coach/ToolsPage.test.tsx`: Matrix bekommt `focusArchetypeId = activeArchetypeId`,
  Equilibrium `highlightArchetypeId = activeArchetypeId`.

**Schnittstellen:** `MatchupMatrix` Props `+ focusArchetypeId?: string`;
`EquilibriumPanel` Props `+ highlightArchetypeId?: string`. Keys `meta.matchupMatrix.{showFull, hideFull, focusMissing}`,
`meta.equilibrium.{yourArchetype, yourSummary}`.

**Docs:** `docs/features.md` §13 und §18 (Fokus/Hervorhebung im Coach-Layout). Gate triggert nicht
(getrackte Dateien). **Browser:** ja (Matrix-Zeile mobil horizontal scrollbar). **Security:** nein.

---

#### A6 – Werkzeug „Kartenstatistik" (§5.6)

**ACs:** 4, 5 (Kaltstart), 8.

**Inhalt:** Tabelle aller Karten des aktiven Archetyps aus `archetype_card_stats`: Name, Typ,
Spielrate (`inclusionPct`), Ø-Anzahl (`avgCount`), Performance-Delta mit Band und Signal-Stufe
(`CardDelta`). Gruppiert nach Pokémon/Trainer/Energie, innerhalb nach Spielrate (Server-Reihenfolge).
Filter-Chips nach Stufe (alle · bestätigt · Geheimtipp · Paradox · abgeraten). Kopfzeile mit
Datenstand (`computedAt`), Listenanzahl und dem tatsächlich genutzten Fenster (`windowDays`, weil
der Server auf 7/14/21/28 rastert) plus Hinweis „immer Online-Bo1". Der Pflicht-Hinweis
„Korrelation, nicht Ursache" aus `CardDelta` bleibt.

**Rote Tests:**
- `hooks/useArchetypeCardStats.test.ts`: ruft `fetchArchetypeCardStats(id, days)`; Request-Key-Muster;
  Fehler → `error: true`; ohne Archetyp kein Aufruf.
- `components/tools/CardStatsPanel.test.tsx`:
  - `it('groups cards by type and keeps the server order within a group')`.
  - `it('shows inclusion rate, average count and the delta with its band')`.
  - `it('filters by signal tier via chips (real buttons, aria-pressed)')`.
  - `it('shows the snapped window and "online Bo1" in the header')` → `metaWindow.days = 30`, Antwort `windowDays: 28` → „28 Tage".
  - `it('cold start: computedAt null → explains that stats are not computed yet')`.
  - `it('keeps the correlation-not-causation note')`.
- `components/recommendations/DeckComparisonPanel.test.tsx`: bleibt **unverändert** grün
  (Regressionsnetz für den `CardDelta`-Umzug).

**Schnittstellen:**
```ts
export function useArchetypeCardStats(archetypeId: string | null, days: number): {
  data: ArchetypeCardStatsResponse | null; isLoading: boolean; error: boolean;
};
export function CardStatsPanel(p: { archetypeId: string; days: number }): JSX.Element;
// components/shared/CardDelta.tsx (moved, unchanged behaviour)
export function CardDelta(p: { delta: CardPerformanceDelta | undefined; tier: CardSignalTier }): JSX.Element;
```
Keys unter `coach.tools.cardStats.*` (DE/EN); Stufen-Texte weiter aus `recommendations.comparison.delta.*`.

**Docs (Gate):** neue Dateien `components/tools/CardStatsPanel.tsx` → `architecture.md`,
`components/shared/CardDelta.tsx` → `docs/design-system.md` §Component classes; von Hand
`docs/features.md` §17 („sichtbar als Werkzeug Kartenstatistik"). **Browser:** ja (Tabelle mobil).
**Security:** nein (bestehende, sessionpflichtige Leseroute).

---

#### A7 – Deck: nur der aktive Archetyp, Slug gekoppelt (E13), andere Archetypen sichtbar

**ACs:** 4, 6; Umschalt-Risiko R2.

1. **Analytics gefiltert:** `DeckHubPage` übergibt `DeckAnalyticsPanel` nur Decks und Logs des
   aktiven Archetyps → `VariantComparison` fremder Archetypen verschwindet.
2. **E13:** `DeckSettingsWidget({ lockArchetype })` – im Coach-Layout `lockArchetype`: Archetyp und
   Anzeigename sind **nur Anzeige** (aus dem aktiven Archetyp, `archetypeDisplayName`), das
   Slug-Feld („Erweitert") entfällt, Speichern schickt nur `{ variant }`. „Neue Variante" bleibt.
   Im alten Layout ohne Prop unverändert (E-F7).
3. **Decks anderer Archetypen:** Unter dem Deck-Wechsler zeigt `OtherArchetypeDecks` eine kompakte
   Karte „Du hast auch Listen für: …" (gruppiert nach Archetyp, Anzahl). Gültiger Slug →
   „Zu diesem Archetyp wechseln" (`setActiveArchetype`). Ungültiger Slug (Altlast der freien
   Eingabe) → „Diesem Archetyp zuordnen" → neue Store-Aktion `reassignDeckArchetype(deckId)` setzt
   `archetype`/`archetypeName` auf den aktiven Archetyp (E-F6). Ohne fremde Decks: nichts.

**Reine Logik** – `lib/coach/otherDecks.ts`:
```ts
export interface OtherArchetypeGroup {
  archetype: string; name: string; deckIds: number[]; switchable: boolean; // valid slug
}
export function otherArchetypeGroups(decks: readonly Deck[], activeArchetypeId: string): OtherArchetypeGroup[];
```

**Rote Tests:**
- `lib/coach/otherDecks.test.ts`: aktiver Archetyp ausgeschlossen · Gruppierung und Anzahl ·
  `switchable` nach `ARCHETYPE_SLUG_PATTERN` · sortiert nach Anzahl absteigend, dann Name.
- `components/deck/OtherArchetypeDecks.test.tsx`: nichts ohne fremde Decks · „wechseln" ruft
  `setActiveArchetype('n-zoroark')` · „zuordnen" nur bei ungültigem Slug und ruft
  `reassignDeckArchetype(id)` · Knöpfe ≥ 44 px, echte `<button>`.
- `components/deck/DeckSettingsWidget.test.tsx` (neu):
  - `it('lockArchetype hides the slug and archetype-name inputs and shows the archetype as text')`.
  - `it('lockArchetype saves only the variant')` → `updateCurrentDeck({ variant: 'Budew' })`.
  - `it('without lockArchetype keeps all three fields (legacy)')`.
- `store/dashboardStore.test.ts`:
  - `it('reassignDeckArchetype moves a deck to the active archetype and refreshes')` → `updateDeck(7, { archetype: 'dragapult-ex', archetypeName: 'Dragapult ex' })`.
  - `it('reassignDeckArchetype does nothing without an active archetype')`.
- `pages/coach/DeckHubPage.test.tsx`:
  - `it('passes only decks and logs of the active archetype to DeckAnalyticsPanel')`.
  - `it('renders DeckSettingsWidget with lockArchetype')`.
  - `it('shows OtherArchetypeDecks below the switcher')`.

**Schnittstellen:** `reassignDeckArchetype: (deckId: number) => Promise<void>` im Store;
`DeckSettingsWidget(p?: { lockArchetype?: boolean })`; `OtherArchetypeDecks(): JSX.Element | null`.
Keys `deck.hub.{otherArchetypes, switchTo, assignHere}`, `deck.settings.archetypeLocked`.

**Docs (Gate):** neue Datei `components/deck/OtherArchetypeDecks.tsx` → `docs/features.md` §3 +
`docs/architecture.md` §Frontend. **Browser:** ja. **Security:** code-review-agent prüft den
Schreibpfad (bestehende Route `PATCH /api/decks/:id`, nur eigene Decks, keine neue Eingabe).

---

#### A8 – Umschalt-Vorbereitung: Migration und Onboarding

**ACs:** 1; Risiken R1, R3.

1. `pickMigrationArchetype({ legacySlug, activeDeck, decks })`: Reihenfolge gültiger Legacy-Slug →
   gültiger Slug des aktiven Decks → **neu:** gültiger Slug des neuesten Decks → `null`.
2. Onboarding Schritt 1 zeigt oberhalb der Top-10 einen Block **„Deine Archetypen"** (Archetypen
   der eigenen Decks mit gültigem Slug, je einmal, mit Anzahl Listen) – in beiden Modi. Wer nach dem
   Umschalten einen zweiten Archetyp sucht, findet ihn ohne Suche.

**Rote Tests:**
- `lib/coach/activeDeck.test.ts`: `it('falls back to the newest deck with a valid slug when the active deck has none')`,
  `it('prefers the active deck over the newest valid deck')`, bestehende Fälle unverändert.
- `lib/coach/onboarding.test.ts`: `ownDeckArchetypes(decks)` → eindeutig, nur gültige Slugs,
  Anzahl je Archetyp, sortiert nach Anzahl.
- `components/coach/onboarding/OnboardingFlow.test.tsx`:
  `it('step 1 lists own deck archetypes above the most played ones')`,
  `it('choosing an own archetype skips the list step (a deck exists)')`,
  `it('hides the block without own decks')`.
- `store/dashboardStore.test.ts`: `it('loadPreferences migrates from another deck when the active deck has an invalid slug')`.

**Schnittstellen:** `ownDeckArchetypes(decks: readonly Deck[]): { slug: string; count: number }[]`;
`pickMigrationArchetype` Input `+ decks: readonly Deck[]`. Keys `onboarding.archetype.yours`.

**Docs:** `docs/architecture.md` §Archetype-first UI (Onboarding Schritt 1, Migrationsreihenfolge),
`docs/features.md` §21 (Migration). Gate triggert nicht. **Security:** nein.

---

#### A9 – Abschluss PR (a): Doku, Abnahme, Gates

- `docs/features.md` §21: Scheibe-2-Stand (Gegner-Segment, Werkzeuge-Aufbau, Kartenstatistik,
  Filterung, andere Archetypen).
- `specs/archetype-first-ui.md` Status-Zeile: „Scheibe 2 (a) umgesetzt".
- **Browser-Abnahme** (mit `?ff=archetypeCoachUi`, mobil 375 px und Desktop), Demo und eigenes Konto:
  - Gegner: Segment wechselt, Threats/Freewins des eigenen Archetyps, mein Feld ohne fremde Perspektive.
  - Werkzeuge: Reihenfolge, keine Daten fremder Archetypen außer Matrix (ausgeklappt) und Spieltheorie.
  - Kartenstatistik mit Filter; Matrix-Zeile scrollt horizontal.
  - Deck: nur Listen des Archetyps, Hinweis auf andere Archetypen, Slug-Feld weg.
  - Konto mit zwei Archetypen: Start/Gegner zeigen nur die Bilanz des aktiven.
  - Flag aus: altes Layout unverändert.
- Gates grün (Root).

**PR-Beschreibung (a):** AC-Tabelle §1, Liste der offen geänderten Tests (ToolsPage-Fall aus A4,
OpponentsPage-Anpassungen aus A3).

---

### PR (b) – Umschalten für alle, mit Rückweg

#### B1 – Flag standardmäßig an, persistenter Opt-out pro Browser

**ACs:** 1 für alle Nutzer; Spec §9 „Dann wird umgeschaltet".

**Neue Auflösung** (`resolveFeatureFlag`):
`?ff=` > localStorage (`'1'` an, **neu** `'0'` aus) > Build-Env (**nur** exakt `'true'`/`'false'`) >
**Code-Default `true`** für `archetypeCoachUi`. `?ff=-archetypeCoachUi` schreibt jetzt `'0'`
(statt den Key zu löschen), damit der Rückweg über Reloads hält; `?ff=archetypeCoachUi` schreibt `'1'`.

**Rote Tests** – `lib/featureFlags.test.ts`. Der Fall `'is off by default (no env, no storage, no
query)'` wird **offen umgestellt** (Spec §9 schaltet das Default bewusst um):
- `it('is on by default since the switch (no env, no storage, no query)')`.
- `it('?ff=-archetypeCoachUi turns it off and remembers "0" across loads')`.
- `it('storage "0" beats env "true"')`, `it('env "false" turns it off without storage')`.
- `it('env values other than "true"/"false" fall back to the default (on)')`.
- bestehend: unbekannte Flags, werfender Storage, `?ff=` gewinnt.

**Implementierung:** nur `lib/featureFlags.ts` (Default-Tabelle `DEFAULTS: Record<FeatureFlag, boolean>`),
`.env.example`-Kommentar. **Keine** Railway-Variable nötig (E-F2). Vorher lesend prüfen, ob
`VITE_FF_ARCHETYPE_COACH_UI` in Railway gesetzt ist (R5); wenn `"false"`, vor dem Deploy entfernen.

**Docs:** `docs/architecture.md` §Feature flags (neue Reihenfolge, Default an, Opt-out);
`docs/features.md` §21 („für alle; zurück pro Browser mit `?ff=-archetypeCoachUi`"),
`docs/demo-mode.md` (Demo landet ohne `?ff=` im neuen Layout). Gate triggert nicht (`lib/`).
**Security:** nein.

#### B2 – Abschluss PR (b)

- `specs/archetype-first-ui.md` Status: „umgeschaltet am …".
- **Browser-Abnahme in Produktion nach dem Deploy** (Konrad, Handy): ohne `?ff=` neues Layout; neues
  Konto → Onboarding; Bestandskonto → kein Onboarding, richtiger Archetyp; Demo → Dragapult ex ohne
  Onboarding-Aufblitzen; `?ff=-archetypeCoachUi` → altes Layout, bleibt nach Reload; `?ff=archetypeCoachUi` → wieder neu.
- **Rückweg:** Revert von PR (b) stellt den alten Default wieder her (ein Commit, keine Datenmigration
  rückgängig zu machen – `user_preferences` ist schon seit Scheibe 1 für alle befüllt).

---

### PR (c) – Altes Layout und Flag löschen

Reihenfolge so, dass nach jedem Commit alles kompiliert und grün ist: erst die Weiche weg (alter
Code wird unerreichbar), dann Regressionsnetz, dann löschen, dann Store/Typen, dann CSS.

#### C1 – Flag entfernen

- `App.tsx`: rendert immer `CoachLayout` (+ `ImportLocalDataModal`); Lazy-Imports der alten Seiten weg.
- `dashboardStore.ts`: `isArchetypeCoachUiEnabled()`-Zweige in `refresh` (`:282`), `hydrate` (`:351`)
  und A2 werden unbedingt (Coach-Regel gilt immer; ohne Archetyp = Legacy-Regel in
  `resolveActiveDeckId`, wie heute).
- `lib/featureFlags.ts` + Test, `vite-env.d.ts:7`, `.env.example`-Block löschen (E-F3).
- **Tests offen angepasst:** `App.test.tsx` (nur noch „renders the coach layout"); in
  `dashboardStore.test.ts` entfallen die Fälle „flag off" (`:812`, `:821`, `:865`, A2 „flag off"),
  die Fälle „flag on" verlieren den Mock.
- **Docs:** `docs/architecture.md` §Feature flags entfernen, §Application Shell auf ein Layout;
  `docs/features.md` §21 „Try it" raus. Gate triggert nicht.

#### C2 – Alte Shell löschen (Regressionsnetz zuerst)

- **Zuerst (grün von Anfang an, kein TDD-Rot):** `components/layout/SyncControls.test.tsx` übernimmt
  die Verhaltensfälle aus `Sidebar.test.tsx` E1/E2 und `MobileAccountSheet.test.tsx` D2–D6: beide
  Knöpfe da, Sync ruft `syncMeta` genau einmal, Refresh ruft `refresh` genau einmal, Busy-State
  deaktiviert und zeigt „Synchronisiere…".
- Dann `git rm`: `components/layout/{Sidebar,BottomNav,navItems}.tsx` (+ `.test`), 
  `components/auth/{MobileAccountSheet,UserMenu}.tsx` (+ `.test`).
- i18n: `layout.nav.*`, `layout.bottomNav.*`, `layout.sidebar.dashboard` löschen (DE/EN).
  `layout.sidebar.{syncLiveMeta,syncing,synced,syncedAt,refreshData}` bleiben (von `SyncControls` gelesen).
- **`actionLabels.test.ts` offen angepasst:** A1 ohne `layout:nav.comparison`; A3 entfällt (der
  Vergleichs-Shortcut existiert nicht mehr).
- **Docs (Gate, `git rm` unter `components/layout/*` und `components/auth/*`):**
  `docs/architecture.md` §Application Shell/§Responsive Layout (kein Avatar-Chip, keine alte Sidebar),
  `docs/design-system.md` §Component classes (alte Nav-Klassen), `docs/demo-mode.md` §How it works.

#### C3 – Alte Seiten löschen

- `git rm`: `pages/{OverviewPage,DeckPage,MetaPage}.tsx` (+ Tests), `components/meta/ArchetypeDetail.tsx`
  (+ `ArchetypeDetail.back.test.tsx`), `components/layout/StatCard.tsx`.
- `lib/metaFetch.ts`: `fetchRecentTournaments` (+ Testblock „Spec 10 Slice G") löschen; `summarizeStandings`,
  `isLikelyOnline` bleiben, falls weiter genutzt (⚠️ im tester-Schritt per grep bestätigen, sonst Datei ganz weg).
- Store: `recentTournaments`, `isFetchingTournaments`, `tournamentsError`, `loadRecentTournaments`;
  `types/index.ts:149` `RecentTournament`.
- i18n: Namespace **`overview`** ganz weg (`i18n/index.ts`, beide JSON); `meta.page`, `meta.metaTable`,
  `meta.tournaments`, `layout.tournaments` löschen (DE/EN).
- **`actionLabels.test.ts` offen angepasst:** A1 ohne `meta:tournaments.load`; A2 prüft die
  verbleibenden **vier** Reload-Labels (`sidebar.syncLiveMeta`, `sidebar.refreshData`,
  `matchupMatrix.reload`, `comparison.refresh`) auf Paarweise-Verschiedenheit; A4 entfällt; A5
  erwartet **10** Namespaces.
- Was aus `MetaPage.test.tsx` fachlich weiterlebt, ist schon anderswo abgesichert:
  Equilibrium-Fehler/-Veralten in `hooks/useMetaEquilibrium.test.ts` (3 Fälle), Matrix eingeklappt
  in `ToolsPage.test.tsx`; die übrigen Fälle betreffen gelöschte UI.
- **Docs (Gate, `git rm` `components/meta/ArchetypeDetail.tsx`, `components/layout/StatCard.tsx`):**
  `docs/features.md` §1 (Meta Overview), §12 (Recent Tournaments) entfernen bzw. auf Werkzeuge
  umschreiben, §15 auf die aufgeteilten Teile; `docs/architecture.md` Komponentenbaum (alter Baum weg);
  `docs/data-flow.md:620` (`MetaPage.tsx` als Teilnehmer → `ToolsPage`/Hooks).

#### C4 – Tote Komponenten löschen

- `git rm`: `components/meta/{MetaShareChart,WinRateChart}.tsx`, `components/deck/DeckPerformancePanel.tsx`.
- i18n: `meta.metaShareChart`, `meta.winRateChart`, `deck.performance` (DE/EN).
- ⚠️ `lib/deckPerformanceStats.ts` bleibt (genutzt von `DeckTipsSection.tsx:8`).
- **Docs (Gate):** `docs/features.md` §1 (Charts), `docs/architecture.md:313` (Hinweis „exist as files") löschen.

#### C5 – Store und Typen auf ein Layout

- `export type DashboardTab = 'start' | 'deck' | 'coaching' | 'opponents' | 'tools'` (vorher `CoachTab`);
  State `coachTab`/`setCoachTab` → `activeTab`/`setActiveTab` (Spec §4; ~19 Dateien, mechanisch, E-F14).
- Löschen: `DeckSection`, `deckSection`, `setDeckSection`, `openDeckComparison`; `deckArchSlug`
  (Nutzer: `DeckComparisonPanel` liest dann `activeArchetypeId`, `runDeckComparison` `:547`).
- `DeckTipsSection`: Prop `onOpenLocalMeta` entfällt, der Link ruft `setActiveTab('opponents')`.
- `DeckComparisonPanel`: „nicht eingerichtet"-Zweig (`:147-170`) entfällt (unerreichbar), Keys
  `recommendations.comparison.{notSetUp,setupHint}` weg.
- `DeckAnalyticsPanel`: `omitTurnQuality` und der `DeckTurnQualityPanel`-Aufruf (`:615`) entfallen
  (Zugqualität lebt nur noch in Coaching → AC 6 exakt ein Ort).
- `DeckSettingsWidget`: `lockArchetype`-Verhalten wird das einzige, Prop entfällt.
- **Tests offen angepasst:** `dashboardStore.test.ts` Block „deckSection contract" (`:159-183`) entfällt;
  `DeckComparisonPanel.test.tsx` „setup link target" (`:203-223`) entfällt; `DeckTipsSection.test.tsx`
  erwartet `setActiveTab('opponents')`; `DeckAnalyticsPanel.turnQuality.test.tsx` erwartet **kein**
  `DeckTurnQualityPanel` mehr; `DeckSettingsWidget.test.tsx` Legacy-Fall entfällt; überall
  `coachTab` → `activeTab` in Store-Mocks.
- **Docs:** `docs/architecture.md` §State Management; `docs/features.md` §9/§10. Gate triggert nicht.

#### C6 – Farbrollen global, Test-Scope global

- `index.css`: `.wr-pos/.wr-mid/.wr-neg` direkt mit Blau/Slate/Orange; `.coach-ui .card` →
  `.card` mit `rgb(255 255 255 / 0.94)`; `.coach-ui`-Selektoren entfallen. `CoachLayout` behält die
  Klasse nicht mehr (Test `'root element carries the coach-ui class'` **offen entfernt**). Damit
  haben auch Portale/Modals die neuen Farben (behebt §0.1 Risiko 5).
- `winRateColor.ts`-Kommentar; `winRateColor.test.ts` bleibt (Klassen unverändert).
- `theme/noFilledRed.test.ts`: „no filled red background in the coach UI" prüft **alle** `.tsx`
  außer Allowlist (nicht mehr nur `components/coach/`, `pages/coach/`). ⚠️ Vorher per grep prüfen,
  ob Altdateien `bg-red-5xx+` als Fläche nutzen; Treffer werden als Befund gemeldet (E-F19), nicht
  stillschweigend in die Allowlist geschoben.
- **Docs:** `docs/design-system.md` §Palette/§Component classes (Rollen gelten überall). Gate triggert nicht.

#### C7 – Abschluss PR (c)

- `specs/archetype-first-ui.md`: Status „Scheibe 2 umgesetzt"; §5.6/§11 AC 4 um die Ausnahme
  Spieltheorie ergänzen (E-F9), §6 `MetaWindowControl` „Werkzeuge + Gegner (+ Meta-Liste mit Spec 5)" (E-F10).
- `apps/web/README.md:77` Seitenliste korrigieren.
- **Browser-Rauchtest in Produktion:** alle fünf Bereiche, ＋, Header-Menü, Modals (neue WR-Farben),
  Rechtsseiten, Passwort-Reset-Seite, Demo.
- Gates grün.

---

### PR (d) – Struktur: Bereichs-Ordner (E18) und `features.md` (E12)

#### D1 – Datei-Umzüge (`git mv`, nur Pfade und Importe)

| Von | Nach |
|---|---|
| `components/coach/{CoachLayout,CoachHeader,CoachSidebar,CoachBottomNav,HeaderMenuSheet,coachNav,ActiveListChip,ArchetypeSwitcherButton}` | `components/layout/{AppLayout,AppHeader,Sidebar,BottomNav,HeaderMenuSheet,navItems,ActiveListChip,ArchetypeSwitcherButton}` (Umbenennung auf die in C2 frei gewordenen Namen, E-F14) |
| `components/coach/onboarding/*` | `components/onboarding/*` |
| `pages/coach/{StartPage,DeckHubPage,CoachingPage,OpponentsPage,ToolsPage}` | `pages/{StartPage,DeckPage,CoachingPage,OpponentsPage,ToolsPage}` |
| `components/opponent/*` + `components/deck/DeckTurnQualityPanel` | `components/coaching/` |
| `components/meta/{FieldScorePanel,ThreatsPanel,MatchupTable,MyMatchupsTable,PredictionPanel,ListFieldPerformance,localFieldWeight}` + `components/deck/LocalMetaPanel` | `components/opponents/` |
| `components/meta/{MatchupMatrix,matchupCellStyle,EquilibriumPanel,equilibriumFraming,ArchetypeRecommendationPanel,TournamentBestListPanel,DecklistCard,MetaWindowControl,metaWindow}` | `components/tools/` |
| `components/meta/{WinRateBadge,winRateColor,confidence}` | `components/shared/` |
| `components/recommendations/*` | `components/deck/` |

Tests ziehen mit. `theme/noFilledRed.test.ts`-Allowlist auf die neuen Pfade. `lib/coach/` bleibt
(„coach" ist der Produktbegriff). i18n-Namespaces bleiben (E-F14).
**`.claude/hooks/docs-gate.sh`** (+ `docs-gate.test.sh`): Mapping-Arme für `components/{coaching,opponents,tools,onboarding}/*`
ergänzen, `components/{meta,opponent,recommendations,coach}/*` entfernen (E-F15).
**Docs (Gate, jeder `git mv` markiert den alten Pfad):** `docs/architecture.md` Komponentenbaum und
Ordnerliste (Monorepo Layout), `docs/features.md` Dateiverweise, `docs/design-system.md`
(`WinRateBadge`, `CardDelta` in `shared/`), `docs/demo-mode.md` falls Pfade genannt.
**Test:** reine Umzüge, keine neuen Tests; alle bestehenden grün. **Security:** nein.

#### D2 – `docs/features.md` nach dem Kern-Loop (E12, Vision §7.4)

Neue Gliederung (Inhalte der heutigen §1–§21 werden verschoben, nicht neu erfunden):
1. Überblick und Kern-Loop (Liste → spielen → Log → lernen), aktiver Archetyp, Onboarding
2. **Start** (Cockpit)
3. **Deck** – Meta-Liste (Tipps, Vergleich §9, Empfehlungen §10, Synthese §19), Meine Listen
   (Verwaltung §3, Versionen §4, Varianten §5, Import/Export)
4. **Coaching** – Log einfügen, Match-Log §6, Parser §7, KI-Analyse §8, Zugqualität
5. **Gegner** – globales Feld, mein Feld + Prediction §11/§16, eigene Bilanz
6. **Werkzeuge** – Archetyp im Meta, Turnierlisten/Empfehlung §15/§20, Kartenstatistik §17,
   Matrix §13, Spieltheorie §18, allgemeines Meta
7. Konto und Betrieb – Meta-Sync §2, KI-Einstellungen, Rechtsseiten §14, Demo
Alte Abschnittsnummern werden nicht beibehalten; die Docs-Gate-Hinweise (`docs-gate.sh`, „§6 Match Log"
usw.) werden in D1/D2 auf die neuen Überschriften gezogen.
**Docs:** `docs/README.md` Index-Zeile zu `features.md`.

#### D3 – Abschluss PR (d)

`docs/architecture.md` Komponentenbaum als **ein** Mermaid-Diagramm (Coach-Layout), Gates grün,
kurzer lokaler Rauchtest (App startet, fünf Bereiche laden).

---

## Schnittstellen (Übersicht)

```ts
// Hooks (apps/web/src/hooks)
useArchetypeAnalysis(archetypeId: string | null, window: MetaWindow)
  → { data: ArchetypeAnalysis | null; isLoading; notInWindow; error: string | null }
useArchetypeLists(archetypeId: string | null, window: MetaWindow, pageSize = 4)
  → { lists; total; isLoading; loadMore(); isLoadingMore; loadMoreFailed }
useArchetypeTournaments(archetypeId: string | null, window: MetaWindow) → Tournament[]
useArchetypeCardStats(archetypeId: string | null, days: number)
  → { data: ArchetypeCardStatsResponse | null; isLoading; error }

// Pure (apps/web/src/lib)
computeArchetypeStats(logs: OpponentLog[], metaSnaps: MetaSnapshot[]): ArchetypeStats[]
ownFieldScore(archetypeId, archetypeName, field: ArchetypeShare[], matchups: MatchupRow[]): FieldScore | null
otherArchetypeGroups(decks, activeArchetypeId): OtherArchetypeGroup[]
ownDeckArchetypes(decks): { slug: string; count: number }[]
pickMigrationArchetype({ legacySlug, activeDeck, decks }): string | null

// Components (new)
GlobalFieldPanel({ archetypeId, window })
ArchetypeMetaSummary({ archetypeId, archetypeName, window })
TournamentListsPanel({ archetypeId, archetypeName, window, archetypeStats, archetypes, localMeta })
CardStatsPanel({ archetypeId, days })
CardDelta({ delta, tier })                      // moved from DeckComparisonPanel
OtherArchetypeDecks()

// Component props (extended)
PredictionPanel      + perspectiveArchetypeId?: string
MatchupMatrix        + focusArchetypeId?: string
EquilibriumPanel     + highlightArchetypeId?: string
DeckSettingsWidget   + lockArchetype?: boolean  // C5: only behaviour, prop removed

// Store
reassignDeckArchetype(deckId: number): Promise<void>          // A7
archetypeStats: scoped to activeArchetypeId when set          // A2
type DashboardTab = 'start' | 'deck' | 'coaching' | 'opponents' | 'tools'   // C5 (was CoachTab)
activeTab / setActiveTab                                      // C5 (was coachTab / setCoachTab)
// removed in C3/C5: deckSection, setDeckSection, openDeckComparison, deckArchSlug,
//   recentTournaments, isFetchingTournaments, tournamentsError, loadRecentTournaments

// Flag (B1 → removed in C1)
resolveFeatureFlag: ?ff= > storage ('1'|'0') > env ('true'|'false') > default (archetypeCoachUi: true)
```

---

## Risiken & Randfälle (mit Fokus Umschalten)

1. **R1 – Konten ohne Archetyp nach dem Umschalten.** Konten ohne Decks (und ohne Legacy-Slug)
   sehen beim nächsten Login das Onboarding ohne Abbrechen – so will es AC 1 („keine leeren Seiten").
   Anzahl solcher echten Konten ❌ unbekannt. Onboarding ist in drei Schritten überspringbar bis auf
   die Archetyp-Wahl.
2. **R2 – „Meine Decks sind weg".** Wer Decks mehrerer Archetypen hat, sieht nur die des migrierten
   Archetyps. Abhilfe A7 (Hinweiskarte mit Wechseln/Zuordnen) und A8 („Deine Archetypen" im Wechsler).
3. **R3 – Ungültige Slugs.** Decks mit frei eingegebenem `archetype` (nur `min(1)` validiert) werden
   nie automatisch gewählt; A8 fällt auf das neueste gültige Deck zurück; A7 bietet „Diesem Archetyp
   zuordnen". Ein **gültiges, aber unbekanntes** Slug (z. B. `mein-deck`) wird migriert; Werkzeuge/Gegner
   zeigen dann „nicht im Fenster" statt Daten – kein Fehler, aber leer (Hinweistexte in A3/A4).
4. **R4 – Offene Tabs nach Deploys.** Ohne Service Worker lädt ein vor dem Deploy geöffneter Tab
   gelöschte Lazy-Chunks nach („Failed to fetch dynamically imported module"), besonders nach (c).
   Besteht heute bei jedem Deploy; ein Reload behebt es. Kein Code in Scheibe 2 (optional später:
   `vite:preloadError` → Reload).
5. **R5 – Railway-Variable.** Ist `VITE_FF_ARCHETYPE_COACH_UI` in Railway auf `"false"` gesetzt,
   schaltet B1 nicht um (Env schlägt Default). ❌ Wert unbekannt – vor PR (b) lesend prüfen.
6. **R6 – Kein Kill-Switch nach (c).** Ab C1 gibt es nur ein Layout; Rückweg = Revert von (c) **und**
   (b). Deshalb die Wartezeit E-F4.
7. **R7 – Preferences-Fehler.** Scheitert `GET /api/preferences`, zeigt das Layout die Seiten mit
   Retry-Hinweis (bestehend, `CoachLayout.tsx:116-132`); ohne Archetyp sind Deck/Gegner/Werkzeuge
   leer. Unverändert, nach dem Umschalten aber für alle relevant.
8. **R8 – Doppelte Analyse-Fetches.** Gegner und Werkzeuge laden `getArchetypeAnalysis` je selbst
   (nur eine Seite ist gemountet; Wechsel = neuer Fetch). Bewusst ohne Cache; bei Bedarf später im Store.
9. **R9 – Offen geänderte Tests.** `ToolsPage` (A4), `OpponentsPage` (A3), `featureFlags` (B1),
   `App` + Store-Flagfälle (C1), `actionLabels` A1–A5 (C2/C3), Store-`deckSection`, `DeckComparisonPanel`
   Setup-Link, `DeckTipsSection`, `DeckAnalyticsPanel.turnQuality`, `CoachLayout` `coach-ui` (C5/C6).
   Jede Änderung wird in der PR-Beschreibung mit Grund genannt (TDD-Regel „nie stillschweigend").
10. **R10 – Verlorene Abdeckung beim Löschen.** Sync-Verhalten → C2 `SyncControls.test.tsx` zuerst;
    Equilibrium-Fehler/-Veralten → `useMetaEquilibrium.test.ts` (bestehend). Tie-Gewichtung der alten
    Übersicht → `lib/coach/start.test.ts` (bestehend) und A2.
11. **R11 – Hart codierte Altfarben.** Nach C6 gelten `wr-*` global, aber z. B. `DeckAnalyticsPanel`
    (14 Stellen `text-emerald/red-*`), `ThreatsPanel`-Balken, `MyMatchupsTable` färben Win-Rates
    weiter grün/rot → AC 10 („negativ orange") nur teilweise. E-F19.
12. **R12 – Docs-Gate-Last in (c)/(d).** Jeder `git rm`/`git mv` unter `components/*` markiert Doku;
    die Doku-Commits gehören in denselben Commit (sonst blockiert `git commit`).
13. **R13 – Mapping des Docs-Gates veraltet nach D1.** Ohne E-F15 würden Änderungen in den neuen
    Ordnern nur noch `architecture.md` verlangen.
14. **R14 – `ownFieldScore` mit Anteil 0** (⚠️, A3) – durch den ersten Test abgesichert.

---

## 8. Entscheidungsbedarf (neue Punkte, jeweils mit Default)

| # | Frage | Default-Vorschlag |
|---|---|---|
| F1 | PR-Zuschnitt | **Vier PRs** (a) vollständig · (b) umschalten · (c) löschen · (d) Struktur. Alternative: (c)+(d) zusammen |
| F2 | Mechanik des Umschaltens | Code-Default `true` in `featureFlags.ts` (reviewbar, per Revert zurück), **keine** Railway-Variable; `?ff=-archetypeCoachUi` wird dauerhaft pro Browser |
| F3 | Flag-Code nach dem Umschalten | in (c) **komplett entfernen** (einziges Flag, nichts mehr zu schalten). Kein Dauer-Kill-Switch; ein künftiges Flag holt den Mechanismus aus der Git-Historie |
| F4 | Wartezeit (b) → (c) | bis Konrads Handy-Abnahme in Produktion **und** mindestens zwei Tage ohne Rückweg |
| F5 | Nutzer ohne Archetyp beim Umschalten | Onboarding-Zwang bleibt (AC 1). Bestandskonten mit Decks werden migriert; Reihenfolge erweitert um „neuestes Deck mit gültigem Slug" (A8) |
| F6 | Decks anderer Archetypen | Hinweiskarte in *Meine Listen*: gültiger Slug → „wechseln", ungültiger Slug → „diesem Archetyp zuordnen" (A7) |
| F7 | E13 konkret | Im Coach-Layout sind Archetyp und Anzeigename nur Anzeige (vom aktiven Archetyp), Slug-Feld entfällt, nur die Variante ist editierbar; ab C5 einziges Verhalten |
| F8 | Deep-Links, gespeicherte Tabs, Flag-Key | **Nichts zu migrieren:** es gibt kein URL-Routing, Tabs sind In-Memory. `?ff=`-Bookmarks bleiben harmlos (Query wird ignoriert). Der verwaiste localStorage-Key `pokekon-ff-archetypeCoachUi` wird nicht aufgeräumt (ein Byte, kein Effekt). Start ist nach jedem Laden der Einstieg. Hash-Routing bleibt eigene Spec (§12.3) |
| F9 | Spieltheorie vs. AC 4 | Equilibrium bleibt meta-weit („inhaltlich unverändert", §5.6), eigene Zeile hervorgehoben + Einzeiler oben; AC 4 bekommt die Ausnahme „Spieltheorie" (Spec-Update in C7) |
| F10 | Ort von `MetaWindowControl` | Werkzeuge **und** Gegner (beide lesen `metaWindow`), Meta-Liste mit Spec 5. AC 6 „genau ein Ort" gilt nicht für dieses globale Steuerelement (Spec-Update in C7) |
| F11 | Gegner-Aufbau | Segment „Globales Feld · Mein Feld", Default global; Prediction mit fester Perspektive, ohne Picker und „Bestpositioniert"; eigene Listen gegen das lokale Feld bleiben (`DecklistCard` ist Blattkomponente, keine §6-Zeile) |
| F12 | KPI-Kopf und Trend aus `ArchetypeDetail` | nach Werkzeuge oben („Dein Archetyp im Meta") |
| F13 | Kartenstatistik | Fenster = globales `metaWindow.days`, vom Server auf 7/14/21/28 gerastert und so angezeigt; Online-Bo1 fest; Stufen-Filter; `CardDelta` nach `components/shared/` |
| F14 | Namen nach dem Umzug | `Coach*`-Dateien bekommen die frei gewordenen Namen (`AppLayout`, `AppHeader`, `Sidebar`, `BottomNav`, `navItems`, `DeckPage`); Store `coachTab` → `activeTab`. i18n-Namespaces werden **nicht** umbenannt (`meta` für Gegner/Werkzeuge-Texte, `opponents` für Coaching-Texte bleiben – nur tote Keys fliegen raus) |
| F15 | Docs-Gate-Mapping | in D1 an die neuen Ordner anpassen (Datei unter `.claude/hooks/`, braucht Konrads OK) |
| F16 | Hinweis „Meta-Sync > 3 Tage" (§7) | bleibt offen, bis die API einen Datenstand liefert (voraussichtlich Spec 5 / Scheibe 4); AC 5 bleibt dort Teil. Die Kartenstatistik zeigt ihr `computedAt` schon jetzt |
| F17 | Legacy-Migration `deckArchSlug` | Lese-/Lösch-Helfer und Migrationspfad bleiben bis Ende 2026 im Code (Geräte, die erst später laden), dann eigener Chore |
| F18 | Wie AC 4 für die eigene Bilanz | store-weit: `archetypeStats` wird auf den aktiven Archetyp gefiltert (A2), statt jede Seite einzeln |
| F19 | Hart codierte Win-Rate-Farben in Altkomponenten | **nicht** Teil von Scheibe 2; eigener kleiner Chore nach (c) (auf `winRateColorClass` umstellen, Test pro Komponente). AC 10 bis dahin manuell „teilweise" |
| F20 | „Trainer Hub"-Link (offen aus Scheibe 1) | bleibt `trainerhill.com`, Konrad bestätigt |
| F21 | Hinweis „Meta funktioniert ohne Logs" der alten Übersicht | entfällt mit `OverviewPage`; Start hat eigene Leerzustände, `DeckTipsSection` behält ihren |

---

## Verifikations-Checkliste

- [ ] Nach **jeder** Unter-Scheibe: `npm run typecheck`, `npm run lint`, `npm run test` (Root) grün
- [ ] (a) Flag aus: altes Layout unverändert; alte Tests unverändert grün
- [ ] (a) Flag an: kein Screen zeigt Daten anderer **eigener** Archetypen (Start-Form/Feld-WR, Gegner-Bilanz, „Mein Spielstil", Deck-Analytics, Prediction)
- [ ] (a) Werkzeuge: `ArchetypeDetail` nirgends gerendert; Matrix zeigt standardmäßig nur die eigene Zeile
- [ ] (a) Kartenstatistik: Kaltstart-Text, gerastertes Fenster sichtbar, Korrelations-Hinweis
- [ ] (a) Konto mit Decks zweier Archetypen + ein Deck mit ungültigem Slug: Hinweiskarte, Wechseln und Zuordnen funktionieren
- [ ] (b) Produktion ohne `?ff=`: neues Layout; Opt-out hält über Reload; Revert-Probe lokal
- [ ] (b) Neues Konto → Onboarding; Bestandskonto → kein Onboarding; Demo → Dragapult ex ohne Aufblitzen
- [ ] (c) Kein Import von gelöschten Dateien (typecheck), keine verwaisten i18n-Keys der gelöschten Gruppen, A5 = 10 Namespaces
- [ ] (c) Modals/Portale zeigen blaue/orange Win-Rates
- [ ] (d) Keine Datei mehr unter `components/{coach,meta,opponent,recommendations}/`, `pages/coach/`; Docs-Gate-Mapping getestet (`docs-gate.test.sh`)
- [ ] Kaltstart: kein Meta, keine Decks, keine Logs – keine leere oder kaputte Seite
- [ ] DE/EN vollständig (A5), Touch-Ziele ≥ 44 px bei allen neuen Knöpfen
- [ ] Docs-Gate grün; `features.md` nach Kern-Loop gegliedert; `architecture.md`, `design-system.md`, `demo-mode.md`, `data-flow.md`, `README`s aktuell
