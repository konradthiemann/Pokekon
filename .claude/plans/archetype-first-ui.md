# Plan: Spec 7 „Archetyp zuerst" – Scheibe 1 (Navigation und Rahmen)

> **Spec:** [`specs/archetype-first-ui.md`](../../specs/archetype-first-ui.md) (Spec 7), Rahmen
> [`specs/archetype-coach-vision.md`](../../specs/archetype-coach-vision.md) §9.
> **Umfang dieses Plans:** nur **Scheibe 1** aus Spec §9 (Navigation und Rahmen, serverseitiger
> aktiver Archetyp, Onboarding, Farbschema und Sprite-Hintergrund aus §9a, Umzug nach Tabelle §6),
> komplett hinter dem Feature-Flag `archetypeCoachUi`. Scheibe 2 (Meta-Seite zurückbauen,
> Werkzeuge filtern) und alles ab Scheibe 3 sind **nicht** Teil dieses Plans.
> **Code-Stand der Belege:** `origin/main` = `a1d0dc8` (Web-Dateien identisch mit dem
> ausgecheckten `feat/archetype-list-foundation`, der nur `packages/shared` + `apps/api` für
> Spec 1 ändert). Die Spec-Belege beziehen sich auf `baebcc5`; jede Angabe ist unten neu geprüft.
> **Status:** Freigegeben 2026-09-24 (Defaults E1–E18, Ausnahme **E9 = Dragapult ex**, siehe §8).
> Overhaul-Branch zuerst (PR #102). Umsetzung in **drei PRs**, alle hinter dem Flag:
> **(a)** S1–S4 Flag + Preferences-API + Demo-Seed + Client-Datenpfad ·
> **(b)** S5–S8 Farben, Hintergrund, Bausteine, Onboarding ·
> **(c)** S9–S15 Seiten, Layout, Abschluss.
> **Kennzeichnung:** ✅ Belegt (Datei gelesen) · ⚠️ Vermutung · ❌ Unbekannt.

---

## Kontext

Die App ist um das ganze Meta gebaut (Tabs `overview | meta | deck`). Spec 7 baut sie zum
**Coach für einen gewählten Archetyp** um. Scheibe 1 liefert das Gerüst dafür:

- neue Navigation `Start · Deck · Coaching · Gegner` (+ *Werkzeuge* im Header-Menü, Desktop
  in der Sidebar),
- ein Header mit Archetyp-Wechsler und Chip der aktiven Liste,
- der aktive Archetyp liegt **serverseitig** (neue Nutzereinstellung `active_archetype_id`),
  `deckArchSlug` im localStorage wird einmalig migriert und entfällt,
- ein Onboarding (Archetyp → Liste → TCG-Live-Name),
- Farbschema Rot/Weiß/Blau/Gelb (Rot nur Marke) und ein Sprite-Hintergrund, der dem aktiven
  Archetyp folgt,
- bestehende Komponenten ziehen nach Tabelle §6 an ihren neuen Ort, **noch ohne neue
  Inhalte** (Spec §9 Punkt 1).

Alles hängt hinter `archetypeCoachUi`. Mit Flag aus sieht die App exakt aus wie heute; die
bestehenden Tests (`navItems.test.ts`, `Sidebar.test.tsx`, `BottomNav.test.tsx`,
`DeckPage.test.tsx`, …) bleiben unverändert grün. Umschalten und Löschen der alten Navigation
passiert erst nach Scheibe 2 (Spec §9, letzter Absatz).

---

## 0. Belegprüfung der Spec-Angaben (Stand `a1d0dc8`)

| Spec-Angabe | Ergebnis | Befund |
|---|---|---|
| `dashboardStore.ts:64` Tabs `overview \| meta \| deck` | ✅ | `export type DashboardTab = 'overview' \| 'meta' \| 'deck';` Zeile 64; `activeTab` nur In-Memory (Default `'overview'`, `:194`) |
| `navItems.ts:17-21` | ✅ | `NAV_ITEMS` Zeilen 17-21, drei Einträge |
| `MetaPage.tsx` 727 Zeilen | ✅ | 727 Zeilen; enthält `ArchetypeSelection` (`:47`), `ShareBar` (`:52`), `TournamentMetaTable` (`:105`), `TournamentCard` (`:321`), `RecentTournaments` (`:388`) als lokale Funktionen |
| `decks.archetype`, `schema.ts:165-178` | ⚠️ verschoben | Tabelle `decks` steht jetzt in `apps/api/src/db/schema.ts:168-181` (+3 Zeilen) |
| `deckArchSlug`, `preferences.ts:11` | ✅ | Key `tcg-deck-arch-slug-v1`, `:11`; Getter/Setter `:97-103` |
| `BottomNav.tsx`: ＋ öffnet `AddLogModal` | ✅ | `BottomNav.tsx:40-46`, `:77-84` |
| Header-Wechsler „bestehend: `ArchetypePicker.tsx`" | ⚠️ weicht ab | `ArchetypePicker` ist ein natives `<select>` **ohne Icon** (`ArchetypePicker.tsx:36-52`). „Icon + Name" muss neu gebaut werden (mit `PokemonIcon`); das `<select>` taugt nur als Fallback-Suche |
| „ein Header auf jedem Screen" | ⚠️ existiert nicht | Heute gibt es keinen Header. Mobil gibt es nur den schwebenden Avatar-Chip von `MobileAccountSheet` (`MobileAccountSheet.tsx:64-70`, `fixed top-3 right-3`) |
| `DeckPage.tsx:209` / `:289` / `:292` / `:299` / `:217` | ✅ | `DeckSwitcher` :209, `DeckPanel` :289, `DeckSettingsWidget` :292 (lokale Funktion `:17-164`, **nicht exportiert**), `DeckAnalyticsPanel` :299, `MyMatchupsTable` :217 |
| `DeckAnalyticsPanel` (+ `VariantComparison`, `DeckTurnQualityPanel`) | ✅ | `VariantComparison` lokal `:185`, gerendert `:705`; `DeckTurnQualityPanel` gerendert `:607` |
| `DeckTipsSection` (Synthesis, Comparison, Recommendations) | ✅ | `DeckTipsSection.tsx:133/136/141` |
| `OpponentLog`, `MatchDetailModal`, `MatchStatsTab`, `AddLogModal` | ✅ | `OpponentLog` → `MatchDetailModal` (`OpponentLog.tsx:203`) → `MatchStatsTab` (`MatchDetailModal.tsx:544`); `AddLogModal` an 3 Stellen |
| `MatchupMatrix`, `EquilibriumPanel` in MetaPage | ✅ | `MetaPage.tsx:658`, `:695` |
| `LocalMetaPanel`, `PredictionPanel`, `FieldScorePanel`, `ThreatsPanel` | ⚠️ ergänzt | `FieldScorePanel`/`ThreatsPanel` werden **zweimal** gerendert: in `ArchetypeDetail.tsx:317/322` **und** in `PredictionPanel.tsx:280/285`. `PredictionPanel` rendert außerdem `DecklistCard` (`:312`) und `ListFieldPerformance` (`:327`) |
| `ArchetypeDetail` (Container) | ✅ | gerendert `MetaPage.tsx:571`; enthält `ArchetypeRecommendationPanel` `:331`, `DecklistCard` `:360`, `TournamentBestListPanel` `:395`, `MatchupTable` `:327` |
| `MetaWindowControl` → Werkzeuge + Meta-Liste, „gilt global" | ⚠️ | Das Fenster ist heute **lokaler State** in `MetaPage.tsx:495-497` und wird per Props an `ArchetypeDetail` gereicht. Es gibt kein globales Fenster |
| `SyncControls` (Sidebar, MobileAccountSheet) → „Einstellungen (nur Admin)" | ⚠️ nicht umsetzbar | `Sidebar.tsx:49`, `MobileAccountSheet.tsx:118` ✅. Es gibt **keinen Admin-Begriff** im Code (grep `admin` in `apps/web/src`, `apps/api/src`: 0 Treffer) und **keine Einstellungsseite** (nur `AiSettingsModal`) |
| `DeckPerformancePanel`, `WinRateChart`, `MetaShareChart` ohne Render-Ort | ✅ | grep nach `<Name`: 0 Treffer außerhalb von Tests. `docs/architecture.md:196-197, :212` zeigt sie trotzdem noch im Komponentenbaum (Doku-Drift) |
| `POST /api/demo/seed`, `demo.ts:17` | ✅ | `apps/api/src/routes/demo.ts:17`; `demoSeed.ts` 1177 Zeilen ✅ |
| `DeckSpriteBackground` in `App.tsx:51` | ✅ | auch in `WelcomeScreen.tsx:55` |
| 72 px, `opacity: 0.11`, `ARCHETYPE_TINT` Zoroark `rgba(167,139,250,0.40)`, gelbe Ecke, heller Rand | ✅ | `DeckSpriteBackground.tsx:82/84`, `:16`, `:97`, `:103-109` |
| liest `activeDeck.archetype` (`:52-56`) | ✅ | `:52-56` |
| `SPRITE_BASE` nur pokesprite (`:4-5`) vs. `SPRITE_BASES` (`pokemonSprites.ts:10-13`) | ✅ | Kaskade Limitless → pokesprite nur in `PokemonIcon.SpriteImg` (`PokemonIcon.tsx:17-31`) |
| `btn-primary` bleibt Blau (`brand`) | ✅ | `index.css:91-93`: `bg-brand-600` (#2563eb) |
| Blau `#1F5AA6` „≈ bestehendes `brand-700`" | ⚠️ | `brand-700` ist `#1d4ed8` (`tailwind.config.js:34`), `btn-primary` nutzt `brand-600`. Kontraste weiß darauf: #1F5AA6 6,84:1; #1d4ed8 6,70:1; #2563eb 5,17:1 – alle AA |
| Gelb `#FFCB05` = `energy-500` | ✅ | `tailwind.config.js:41`; Regel „never text on white" steht im Kommentar `:38` |
| Kontraste Weiß/Blau 6,8, Weiß/Rot 5,0, Orange/Weiß 5,2 | ✅ | nachgerechnet: 6,84 / 5,01 / 5,18. Orange `#C2410C` ist exakt Tailwinds `orange-700` |
| Win-Rate-Farben `winRateColor.ts` | ✅ | `winRateColor.ts:7-9`: emerald/amber/red – **nicht** blau/orange wie §9a |
| i18n: neue Namespaces `start, deck, lab, coaching, opponents, tools, onboarding` | ⚠️ | `deck` und `opponents` **existieren schon** (`i18n/index.ts:8,10`); `opponents` enthält heute Match-Log-Texte |
| Hub-Spec bekommt Hinweis „teilweise ersetzt" | ✅ | steht schon in `specs/ui-ux-hub-rework.md:3-4` |

Zusätzliche Befunde (nicht in der Spec):

- ✅ **`deckArchSlug` wird von keiner UI geschrieben.** `setDeckArchSlug` hat außer dem Store
  keinen Aufrufer (grep), seit dem ersten Commit. `DeckComparisonPanel.tsx:148` blendet den
  Vergleich aus, solange `deckArchSlug` leer ist – für Konten ohne Alt-localStorage ist der
  Deck-Vergleich also dauerhaft „nicht eingerichtet", obwohl `runDeckComparison`
  (`dashboardStore.ts:407`) schon auf `activeDeck.archetype` zurückfällt. Scheibe 1 behebt das
  nebenbei (abgeleiteter Wert, siehe S4).
- ✅ **Kein Feature-Flag-Mechanismus.** Einzige Env-Variablen im Web: `VITE_API_URL`
  (`vite-env.d.ts:5`), `VITE_API_PROXY_TARGET` (`vite.config.ts:15`). Web und API laufen als
  **ein** Railway-Service (`railway.json`: Build baut Web, API liefert `dist` aus,
  `apps/api/src/static.ts`) – ein Build-Zeit-Flag würde für alle Nutzer gleichzeitig gelten.
- ✅ **Keine Nutzereinstellungs-Tabelle** außer `user_ai_settings` (`schema.ts:655-667`) und
  `legacy_import_state` (`:677-681`). Letzte Migration `0017_deck_card_print` (Journal-Index 17).
- ✅ **TCG-Live-Name** liegt nur im localStorage `tcg-player-name` (`lib/demo.ts:11`, gelesen
  in `AddLogModal.tsx:132`, `DeckTipsSection.tsx:29`). Spec 8 S1 macht ihn serverseitig
  (`specs/coaching-loop.md:110-119`).
- ✅ **Demo-Seed:** Deck A `mega-kangaskhan-ex` ist das Standard-Deck mit allen Logs und
  Analysen, Deck B `n-zoroark` hat nur 6 Ergebnis-Matches (`demoSeed.ts:1019-1043`,
  `docs/demo-mode.md:29-34`).
- ✅ **BottomNav hat heute fünf Plätze:** 2 Tabs · FAB · 1 Tab · „Zum Vergleich"
  (`BottomNav.tsx:67-74`). Die neue Navigation hat keinen Vergleichs-Shortcut mehr.
- ✅ **Alle DE/EN-Namespaces sind heute schlüsselgleich** (per Skript geprüft: 9/9 Namespaces,
  0 Abweichungen) – ein globaler Paritätstest ist sofort grün.
- ✅ **Kein Trend** in `GET /api/meta/field-analysis` (`FieldAnalysisArchetype`,
  `lib/api.ts:524-541`). Trend gibt es nur pro Archetyp (`ArchetypeDetail` → `TrendChips`).

---

## 1. Zuschnitt von Scheibe 1 und Abweichungen zur Spec

Spec §9 Punkt 1: „neue Tabs, Header mit Archetyp-Wechsler, serverseitiger aktiver Archetyp,
Onboarding. Bestehende Komponenten nach Tabelle §6 umziehen, noch ohne neue Inhalte."
Plus §9a (Farbschema, Hintergrund) und §9 „Scheibe 1–2 hinter `archetypeCoachUi`".

Konsequenzen für den Zuschnitt (alle als Default, siehe §8 Entscheidungsbedarf):

1. **Werkzeuge in Scheibe 1 ungefiltert.** „Werkzeuge filtern" ist Scheibe 2. In Scheibe 1
   zeigt *Werkzeuge* die bestehenden Meta-Komponenten (Matrix, Equilibrium, Zeitfenster,
   Drilldown des aktiven Archetyps) unverändert. `TournamentMetaTable`/`RecentTournaments`
   werden im neuen UI nicht gerendert; gelöscht werden sie erst in Scheibe 2 zusammen mit
   `MetaPage`.
2. **`ArchetypeDetail` wird in Scheibe 1 nicht aufgelöst**, sondern als Ganzes unter
   *Werkzeuge › Turnierlisten* eingebettet (mit dem aktiven Archetyp). Das Auflösen („Teile
   nach Werkzeuge und Gegner", §6) verschiebt sich nach Scheibe 2. Grund: Konrads
   Overhaul-Branch schreibt `ArchetypeDetail` gerade komplett um (§7). Folge: Feldwert/Threats
   des eigenen Archetyps erscheinen in Scheibe 1 sowohl in *Gegner* (über `PredictionPanel`)
   als auch in *Werkzeuge* (über `ArchetypeDetail`) – AC 6 („genau ein Ort") ist erst nach
   Scheibe 2 voll erfüllt.
3. **Keine Datei-Umzüge (`git mv`) in Scheibe 1.** „Umziehen" heißt: neuer Render-Ort im
   Coach-Layout. Das alte Layout rendert dieselben Komponenten weiter. Verzeichnis-Umbau erst
   beim Umschalten des Flags (sonst doppelte Pfade und Konflikte mit dem Overhaul-Branch).
4. **Separater Tab-Typ statt Umbenennung.** Spec: „`DashboardTab` wird zu `'start' | 'deck' |
   'coaching' | 'opponents' | 'tools'`". Solange beide Layouts leben, bekommt das Coach-Layout
   einen eigenen Typ `CoachTab` + State `coachTab`. Beim Umschalten wird `CoachTab` zu
   `DashboardTab` und der alte Typ gelöscht.
5. **Inhalte aus späteren Specs fehlen bewusst:** Validator-Status (Spec 2),
   Experiment-/Meta-Listen-/Baustellen-Schritte im „Nächsten Schritt" (Spec 5/6/8), Trend in
   „Feld diese Woche" (kein Feld in der API), Filter im Coaching-Verlauf (Spec 8/Scheibe 6),
   Kartenstatistik-Werkzeug (Scheibe 2), Datenstand-Hinweis „Meta-Sync > 3 Tage" (kein
   Freshness-Feld im Client), Ergebnis-Karte nach dem Einfügen (Spec 8). Der ＋-Knopf öffnet
   in Scheibe 1 weiter `AddLogModal` (dort ist das Log-Feld das erste Eingabefeld).
6. **„Meta-Liste übernehmen" vor Spec 5:** Platzhalter ist der Medoid des besten Clusters
   (Spec 1) aus `GET /api/analysis/archetype/:id` (`lib/api.ts:893`), also genau das, was
   Spec §7 für „wenig Turnierdaten" ohnehin vorsieht. Ohne Cluster ist die Option deaktiviert
   mit Hinweis.
7. **Lab-Segment** wird in *Deck* erst mit Spec 6 sichtbar (kein toter Tab).

### ACs, die Scheibe 1 abdeckt

| AC (Spec §11) | in Scheibe 1 | Unter-Scheibe |
|---|---|---|
| 1 Onboarding ohne Archetyp, sonst Start | voll | S4, S8, S14 |
| 2 Kern-Loop ≤ 3 Taps bis Einfügefeld | Teil: Start → ＋ → Log-Feld (1 Tap). Ergebnis-Karte = Spec 8 | S14 |
| 3 Archetyp auf zweitem Gerät gleich | voll | S2, S4 |
| 4 keine fremden Archetyp-Daten | Teil: Start, Deck, Coaching gefiltert; Werkzeuge erst Scheibe 2 | S9–S11 |
| 5 Zustände §7 | Teil: „kein Archetyp", „Archetyp ohne Liste", „keine eigenen Spiele" | S8, S9, S11 |
| 6 jede §6-Komponente genau ein Ort | Teil (siehe Punkt 2 oben) | S9–S13 |
| 7 Demo zeigt alle Bereiche | Teil: aktiver Archetyp gesetzt | S3 |
| 8 DE/EN, Gates, Doku | voll für Scheibe 1 | alle, S15 |
| 9 Hintergrund folgt aktivem Archetyp, gleiche Kaskade | voll | S6 |
| 10 kein gefüllter roter Button, Farben, Kontraste | voll (im Coach-Layout) | S5, S14 |

---

## Betroffene Dateien

| Datei | Änderungstyp | Grund | Unter-Scheibe |
|---|---|---|---|
| `apps/web/src/lib/featureFlags.ts` | neu | Flag `archetypeCoachUi` | S1 |
| `apps/web/src/vite-env.d.ts`, `apps/web/.env.example` | Ergänzung | `VITE_FF_ARCHETYPE_COACH_UI` | S1 |
| `apps/api/src/db/schema.ts` | Ergänzung | Tabelle `user_preferences` | S2 |
| `apps/api/drizzle/0018_user_preferences.sql` + `meta/*` | neu (generiert) | Migration | S2 |
| `apps/api/src/validation.ts` | Ergänzung | `preferencesPatchSchema` | S2 |
| `apps/api/src/routes/preferences.ts` | neu | `GET`/`PATCH /api/preferences` | S2 |
| `apps/api/src/app.ts` | Ergänzung | Route mounten | S2 |
| `apps/api/src/api.test.ts` | Ergänzung | Routentests, Demo-Test | S2, S3 |
| `apps/api/src/lib/demoSeed.ts` | Ergänzung | aktiver Archetyp im Seed | S3 |
| `apps/web/src/lib/api.ts`, `db/queries.ts` | Ergänzung | Client für Preferences | S4 |
| `apps/web/src/lib/preferences.ts` | Änderung | `deckArchSlug` → einmalige Migration | S4 |
| `apps/web/src/lib/coach/activeDeck.ts` | neu | reine Auflöse-/Migrationslogik | S4 |
| `apps/web/src/store/dashboardStore.ts` | Ergänzung | Archetyp-, Coach-Tab-, Fenster-State | S4 |
| `apps/web/src/App.tsx`, `components/auth/WelcomeScreen.tsx` | Änderung | Preferences laden; Layout-Weiche (S14) | S4, S14 |
| `apps/web/tailwind.config.js`, `apps/web/src/index.css` | Ergänzung | Palette `poke`, `.coach-ui`-Scope, `wr-*`, `.btn-destructive` | S5 |
| `apps/web/src/components/meta/winRateColor.ts` (+ Test) | Änderung | semantische Klassen | S5 |
| `apps/web/src/components/shared/pokemonSprites.ts` | Ergänzung | `spriteUrlCandidates` | S6 |
| `apps/web/src/hooks/useFirstLoadableImage.ts` | neu | Bild-Kaskade für CSS-Hintergrund | S6 |
| `apps/web/src/components/DeckSpriteBackground.tsx` | Änderung | aktiver Archetyp + Kaskade | S6 |
| `apps/web/src/components/shared/SegmentedTabs.tsx` | neu (oder aus Overhaul-Branch) | Segment-Leiste | S7 |
| `apps/web/src/components/auth/AccountPanel.tsx` | neu (extrahiert) | Konto-Inhalt teilen | S7 |
| `apps/web/src/components/auth/MobileAccountSheet.tsx` | Änderung | nutzt `AccountPanel` | S7 |
| `apps/web/src/hooks/useFieldAnalysis.ts` | neu | Feldanalyse-Fetch teilen | S7 |
| `apps/web/src/components/coach/*` | neu | Header, Nav, Onboarding, Sektionen | S7, S8, S14 |
| `apps/web/src/pages/coach/*` | neu | Start, Deck, Coaching, Gegner, Werkzeuge | S9–S13 |
| `apps/web/src/components/deck/DeckSettingsWidget.tsx` | neu (aus `DeckPage.tsx` extrahiert) | in *Meine Listen* nutzbar | S10 |
| `apps/web/src/pages/DeckPage.tsx` | Änderung | importiert extrahiertes Widget | S10 |
| `apps/web/src/components/deck/DeckSwitcher.tsx` | Ergänzung | optionaler Archetyp-Filter | S10 |
| `apps/web/src/components/deck/DeckAnalyticsPanel.tsx` | Ergänzung | `omitTurnQuality` | S10 |
| `apps/web/src/components/deck/DeckTipsSection.tsx` | Ergänzung | Ziel des Local-Meta-Links | S10 |
| `apps/web/src/components/meta/ArchetypeDetail.tsx` | Ergänzung | `onBack` optional | S13 |
| `apps/web/src/i18n/index.ts`, `locales/{de,en}/*.json` | Ergänzung | neue Namespaces/Keys | S7–S14 |
| `apps/web/src/i18n/localeParity.test.ts` | neu | DE/EN-Parität | S7 |
| `docs/*.md` | Ergänzung | Docs-Gate + Golden Rule 7 | jede |

---

## Wiederverwendbare Utilities

| Utility | Ort | Nutzung |
|---|---|---|
| `ARCHETYPE_SLUG_PATTERN` | `packages/shared/src/meta.ts:124` | Validierung `activeArchetypeId` (wie `archetypeIdParamSchema`, `validation.ts:180-182`) |
| `archetypeIdParamSchema` | `apps/api/src/validation.ts:180` | direkt im Patch-Schema |
| `readJson`, `userOwnsDeck` | `apps/api/src/routes/shared.ts:14,26` | Body lesen, Deck-Besitz prüfen |
| Upsert-Muster `onConflictDoUpdate` | `apps/api/src/routes/analysis.ts:158-167` (`PUT /settings`) | Vorlage für `PATCH /api/preferences` |
| PGlite-Harness `request()`, `createUser()`, `createDeck()` | `apps/api/src/api.test.ts:88-176` | Routentests |
| `request<T>()`, `ApiError` | `apps/web/src/lib/api.ts:52-88` | neue Client-Funktionen |
| `KNOWN_ARCHETYPES`, `toArchetypeSlug` | `apps/web/src/constants/archetypes.ts:21,92` | Onboarding-Suche, Anzeigename |
| `PokemonIcon`, `resolveArchetypeSprites`, `SPRITE_BASES` | `components/shared/PokemonIcon.tsx`, `pokemonSprites.ts:167-181` | Header-Wechsler, Hintergrund-Kaskade |
| `CopyDeckListButton` | `components/shared/CopyDeckListButton.tsx` | „Für TCG Live kopieren" auf Start |
| `exportCardsFromDecklist`, `exportDeckList` | `packages/shared/src/deckExport.ts:140,165` | Medoid → Text |
| `parseDeckList`, `importCards` | `apps/web/src/lib/deckImport.ts:169,206` | Text → Karten eines neuen Decks („Meta-Liste übernehmen") |
| `getArchetypeSynthesis` (read-only, `clusters[0].representative`) | `apps/web/src/lib/api.ts:893` | Medoid des besten Clusters |
| `getFieldAnalysis` + Request-Key-Muster | `lib/api.ts:626`, `MetaPage.tsx:504-526` | `useFieldAnalysis` |
| `tournamentWinRatePct`, `wilsonInterval` | `@pokekon/shared` | Form der letzten 7 Tage mit Band |
| `StatCard` | `components/layout/StatCard.tsx:62` | „Deine Form" |
| `CollapsibleSection`, `SidePanel` | `components/layout/`, `components/deck/` | Seitengliederung |
| `isAnonymousUser` | `apps/web/src/lib/demo.ts:24` | Demo-Rennen (siehe Risiken) |
| `PLAYER_NAME_KEY` | `apps/web/src/lib/demo.ts:11` | Onboarding Schritt 3 |
| `SegmentedTabs` | Overhaul-Branch `a6a31b7` `components/shared/SegmentedTabs.tsx` | Deck-Segmente (übernehmen statt neu schreiben, §7) |

---

## Implementierungsschritte (Unter-Scheiben)

Reihenfolge Shared → DB → API → Client → Komponenten. Jede Unter-Scheibe ist für sich grün
(`npm run typecheck`, `npm run lint`, `npm run test`) und ein eigener Commit. Tests zuerst
(tester), dann Implementierung (implementer). Es gibt keine neue reine Logik, die auch die API
braucht; die reinen Funktionen dieser Scheibe liegen daher in `apps/web/src/lib/coach/`
(nur Web nutzt sie) statt in `packages/shared`.

**Branch:** `feat/archetype-first-ui` von `main`. Spec 1 (`feat/archetype-list-foundation`)
berührt keine Web-Datei und kann parallel im eigenen Worktree weiterlaufen (Vision §9.2.7).

**Docs-Gate-Hinweis:** Der Hook (`.claude/hooks/docs-gate.sh`) triggert nur bei
`apps/api/src/db/schema.ts`, `apps/api/src/routes/*.ts`, `packages/shared/src/*.ts` und bei
**neuen** Dateien unter `apps/web/src/components/*` (bestehende, getrackte Komponenten zählen
nicht, `docs-gate.sh` „Neuheits-Test"). `pages/`, `store/`, `lib/`, `hooks/`, `index.css`,
`tailwind.config.js` und `apps/api/src/lib/*` triggern **nicht** – dort gilt Golden Rule 7
trotzdem, die Doku wird von Hand mitgezogen. Die Tabelle je Unter-Scheibe nennt beides.

---

### S1 – Feature-Flag `archetypeCoachUi` (Client, keine sichtbare Änderung)

**ACs:** Voraussetzung für alle (Spec §9 „hinter ein Feature-Flag").

**Rote Tests** – `apps/web/src/lib/featureFlags.test.ts`:
- `it('is off by default (no env, no storage, no query)')` → `resolveFeatureFlag('archetypeCoachUi', { env: undefined, search: '', storage: memStorage() })` ist `false`.
- `it('is on when VITE_FF_ARCHETYPE_COACH_UI is "true"')` → `true`; bei `'1'`/`'yes'` `false` (nur exakt `'true'`).
- `it('is on when the storage key is "1"')` → Key `pokekon-ff-archetypeCoachUi`.
- `it('?ff=archetypeCoachUi enables it and persists to storage')` → Ergebnis `true`, `storage.getItem(key) === '1'`.
- `it('?ff=-archetypeCoachUi disables it, removes the storage key and beats env=true')` → `false`, Key entfernt.
- `it('ignores unknown flag names in ?ff=')` → `?ff=foo` ändert nichts.
- `it('survives a throwing storage (private mode)')` → `storage.getItem` wirft → Env-Wert gilt, kein Throw.

**Implementierung:**
```ts
// apps/web/src/lib/featureFlags.ts
export type FeatureFlag = 'archetypeCoachUi';

export interface FlagSources {
  env: string | undefined; // import.meta.env.VITE_FF_ARCHETYPE_COACH_UI
  search: string; // window.location.search
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** Precedence: ?ff= query > localStorage > build env > false. */
export function resolveFeatureFlag(flag: FeatureFlag, sources: FlagSources): boolean;

/** Evaluated once per page load (flags never change mid-session). */
export function isArchetypeCoachUiEnabled(): boolean;
```
`vite-env.d.ts`: `readonly VITE_FF_ARCHETYPE_COACH_UI?: string;`. `.env.example` (Web): auskommentierte
Zeile mit Erklärung. Kein Secret, reine UI-Weiche; die API bleibt die Autorität.

**Docs:** `docs/architecture.md` §Frontend – neuer Absatz „Feature-Flags" (Mechanik, Reihenfolge,
Einschalten per `?ff=archetypeCoachUi`). Gate triggert nicht (lib), Golden Rule 7 verlangt es.
**Security:** nein (keine Server-Eingabe).

---

### S2 – DB + API: `user_preferences` mit aktivem Archetyp 🔒 security-agent Pflicht

**ACs:** 3 (Archetyp auf zweitem Gerät gleich), Spec §5.1 („serverseitig, `active_archetype_id`",
„pro Archetyp die zuletzt aktive Liste").

**Schema** (`apps/api/src/db/schema.ts`, nach `userAiSettings`, gleiches Companion-Muster):
```ts
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  /** Limitless deck slug of the archetype the app coaches (Spec 7 §5.1); null = onboarding. */
  activeArchetypeId: text('active_archetype_id'),
  /** Last active deck per archetype slug (Spec 7 §5.1). Ownership checked on write. */
  activeDeckIdByArchetype: jsonb('active_deck_id_by_archetype')
    .$type<Record<string, number>>().default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
    .$onUpdate(() => new Date()).notNull(),
});
```
Migration: `npm run db:generate -w @pokekon/api -- --name user_preferences` → `0018_user_preferences.sql`
(Spec 8 S1 ergänzt später die Spalte für den TCG-Live-Namen in derselben Tabelle).

**Validierung** (`apps/api/src/validation.ts`):
```ts
export const preferencesPatchSchema = z
  .object({
    activeArchetypeId: archetypeIdParamSchema.nullable().optional(),
    activeDeck: z
      .object({ archetypeId: archetypeIdParamSchema, deckId: z.number().int().positive().nullable() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => b.activeArchetypeId !== undefined || b.activeDeck !== undefined, {
    message: 'Empty patch',
  });
```

**Route** `apps/api/src/routes/preferences.ts`, gemountet in `app.ts` als `api.route('/preferences', createPreferencesRoutes())`:
```ts
export interface PreferencesResponse {
  activeArchetypeId: string | null;
  activeDeckIdByArchetype: Record<string, number>;
}
// GET  /api/preferences  → PreferencesResponse (defaults without a row: null, {})
// PATCH /api/preferences → PreferencesResponse
//   400 invalid body; 404 deckId not owned (indistinguishable from missing, like shared.ts:22-25);
//   400 deck.archetype !== activeDeck.archetypeId; deckId null removes the entry.
```
Upsert in einer Anweisung (`insert … onConflictDoUpdate`), Map-Änderung serverseitig aus dem
gelesenen Stand gebaut. Kein Admin-, kein Fremdnutzer-Pfad.

**Rote Tests** – neuer `describe('user preferences (/api/preferences)')` in `apps/api/src/api.test.ts`
(Konvention: alle Routentests laufen dort gegen PGlite mit den echten Migrationen):
- `authentication`-Block (`:176-189`): `['/api/preferences','GET']` und `['/api/preferences','PATCH']` in die 401-Liste aufnehmen.
- `it('returns null/{} defaults when the user has no row')`.
- `it('stores activeArchetypeId and returns it on a later GET')` → `'n-zoroark'`.
- `it('is user-scoped: USER_B does not see USER_A\'s archetype')`.
- `it('clears the archetype with null')`.
- `it.each(['N Zoroark', '-lead', 'a'.repeat(81), '../x', ''])('rejects invalid slug %s with 400')`.
- `it('rejects an empty patch and unknown keys with 400')` → `{}` und `{ foo: 1 }`.
- `it('remembers the active deck per archetype')` → eigenes Deck `n-zoroark` → Map `{ 'n-zoroark': id }`.
- `it('404s for another user\'s deck and leaves the map unchanged')`.
- `it('400s when the deck belongs to a different archetype')`.
- `it('removes the map entry with deckId null')`.
- `it('applies activeArchetypeId and activeDeck in one request')`.
- `it('cascades on user delete')` (Zeile weg nach Löschen des Users).

**Docs (Gate):** `schema.ts` → `docs/database.md` §Server-side schema (neue Tabelle
`user_preferences`, Migration `0018`), `docs/data-types.md` §Database Entity Types;
neue Route → `docs/features.md` (kurzer Abschnitt „Aktiver Archetyp (serverseitig)") und
`docs/architecture.md` §Backend (Route-Liste) sowie §Data Persistence (Tabelle).
**Security:** **ja** – neue Route mit User-Input (Slug, Deck-ID). Prüfpunkte für den
security-agent: IDOR auf `deckId`, `.strict()`, Slug-Regex, keine Größenexplosion der jsonb-Map
(jeder Eintrag verlangt ein eigenes Deck desselben Archetyps → durch Anzahl eigener Decks
begrenzt), Rate-Limit nicht nötig (idempotent, billig) – bitte bestätigen.

---

### S3 – Demo-Seed: aktiver Archetyp

**ACs:** 7 (Teil). Spec §8: „gewählter Archetyp (N's Zoroark ex), aktive Liste".

**Rote Tests** – im bestehenden `describe('POST /api/demo/seed …')` (`api.test.ts:5669`) ein neuer Fall:
- `it('seeds dragapult-ex as the active archetype and its deck as the remembered active deck')` →
  nach `POST /api/demo/seed` liefert `GET /api/preferences` `activeArchetypeId === 'dragapult-ex'`
  und `activeDeckIdByArchetype['dragapult-ex']` = ID des Decks mit `archetype === 'dragapult-ex'`
  (per `GET /api/decks` ermittelt).
- `it('does not touch preferences on the idempotent second seed call')`.

**Implementierung (E9 = Dragapult ex):** `seedDemoData` legt ein drittes Deck
„Dragapult ex" (`archetype: 'dragapult-ex'`, legale 60-Karten-Liste, einige Ergebnis-Matches)
an und schreibt am Ende ein Insert in `userPreferences` mit
`{ activeArchetypeId: 'dragapult-ex', activeDeckIdByArchetype: { 'dragapult-ex': deckCId } }`.
Das Standard-Deck des alten Layouts (Kangaskhan) bleibt unverändert, damit die bestehenden
Demo-Tests und Heuristiken grün bleiben.

**Docs:** `docs/demo-mode.md` §What gets seeded (Zeile „aktiver Archetyp"; Hinweis, dass die
reichen Demo-Daten bis Scheibe 7 am Kangaskhan-Deck hängen, siehe Entscheidungsbedarf E9).
Gate triggert nicht (`lib/`). **Security:** nein (Route unverändert, nur anonyme Konten).

---

### S4 – Client-Datenpfad: api.ts → queries.ts → Store, Migration von `deckArchSlug`

**ACs:** 1, 3; Spec §5.1 („`deckArchSlug` wird einmalig migriert und entfällt").

**Reine Logik** – `apps/web/src/lib/coach/activeDeck.ts`:
```ts
/** Which deck is active for an archetype: remembered → fallback (if same archetype)
 *  → newest deck of that archetype → null. archetypeId null = legacy rule
 *  (fallback if it exists, else decks[0]). */
export function resolveActiveDeckId(input: {
  decks: Deck[];
  archetypeId: string | null;
  remembered: Record<string, number>;
  fallbackId: number | null;
}): number | null;

/** One-time migration source: valid legacy slug first, else the active deck's archetype. */
export function pickMigrationArchetype(input: {
  legacySlug: string | null;
  activeDeck: Deck | null;
}): string | null;
```
**Rote Tests** – `apps/web/src/lib/coach/activeDeck.test.ts`:
- `resolveActiveDeckId`: remembered gewinnt · remembered auf gelöschtes Deck → nächste Regel ·
  fallback nur, wenn gleicher Archetyp · neuestes Deck nach `createdAt` · kein Deck des
  Archetyps → `null` · `archetypeId: null` → heutiges Verhalten (`dashboardStore.ts:219-225`).
- `pickMigrationArchetype`: gültiger Legacy-Slug gewinnt · ungültiger Legacy-Slug (`'N Zoroark'`)
  → Deck-Archetyp · beides fehlt → `null` · Deck-Archetyp mit ungültigem Slug → `null`.

**preferences.ts** – `getDeckArchSlug`/`setDeckArchSlug` entfallen, neu:
```ts
/** Reads and deletes the legacy key (runs at most once per browser). */
export function takeLegacyDeckArchSlug(): string | null;
```
Test `lib/preferences.test.ts`: `it('returns the legacy slug once and removes the key')`,
`it('returns null when the key is absent')`.

**api.ts / queries.ts:**
```ts
export interface UserPreferences {
  activeArchetypeId: string | null;
  activeDeckIdByArchetype: Record<string, number>;
}
export interface UserPreferencesPatch {
  activeArchetypeId?: string | null;
  activeDeck?: { archetypeId: string; deckId: number | null };
}
export async function getPreferences(): Promise<UserPreferences>;            // GET  /api/preferences
export async function updatePreferences(p: UserPreferencesPatch): Promise<UserPreferences>; // PATCH
// queries.ts: getUserPreferences(), saveUserPreferences(patch) – thin wrappers (data-flow rule)
```
Tests `lib/api.test.ts`: `it('getPreferences GETs /api/preferences')`,
`it('updatePreferences PATCHes a JSON body and returns the parsed response')`,
`it('surfaces a 400 as ApiError')`.

**Store** (`dashboardStore.ts`), neue Felder und Aktionen:
```ts
export type CoachTab = 'start' | 'deck' | 'coaching' | 'opponents' | 'tools';
export type DeckView = 'metaList' | 'myLists'; // 'lab' comes with Spec 6

activeArchetypeId: string | null;
activeDeckIdByArchetype: Record<string, number>;
preferencesStatus: 'idle' | 'loading' | 'ready' | 'error';
coachTab: CoachTab;        // default 'start'
deckView: DeckView;        // default 'myLists'
metaWindow: MetaWindow;    // default { days: META_DEFAULT_DAYS, online: true, bo1: true }

loadPreferences: () => Promise<void>;          // GET; if null → migrate once (PATCH), else keep
setActiveArchetype: (archetypeId: string) => Promise<void>; // PATCH, re-resolve active deck, refresh
setCoachTab: (tab: CoachTab) => void;
setDeckView: (view: DeckView) => void;
setMetaWindow: (w: MetaWindow) => void;
```
- `deckArchSlug` bleibt als **abgeleiteter** Wert (`= activeArchetypeId ?? ''`) für
  `DeckComparisonPanel` im alten Layout; die Aktion `setDeckArchSlug` entfällt (kein Aufrufer).
- `setActiveDeck(id)` schreibt zusätzlich `activeDeck: { archetypeId: deck.archetype, deckId: id }`
  (Fehler nur loggen, nie den Deckwechsel scheitern lassen). localStorage `activeDeckId` bleibt
  für das alte Layout.
- `refresh()` nutzt `resolveActiveDeckId` mit `archetypeId = isArchetypeCoachUiEnabled() ? activeArchetypeId : null`.
- `App.tsx` `Dashboard`-Effekt (`:35-41`): `await refresh(); await loadPreferences();`
  (Migration braucht das aktive Deck). `WelcomeScreen.startDemo` (`:37-51`) ruft nach dem Seed
  zusätzlich `loadPreferences()`.

**Rote Tests** – `store/dashboardStore.test.ts` (Muster: `vi.mock('../db/queries')`, `:40`):
- `it('loadPreferences sets activeArchetypeId from the server')`.
- `it('loadPreferences migrates the legacy slug once when the server has none')` → `saveUserPreferences` mit `{ activeArchetypeId: 'dragapult-ex' }`, Legacy-Key danach weg.
- `it('loadPreferences falls back to the active deck archetype when no legacy slug exists')`.
- `it('loadPreferences leaves activeArchetypeId null (→ onboarding) without any source')`.
- `it('loadPreferences sets preferencesStatus "error" and keeps the UI usable on a failed GET')`.
- `it('setActiveArchetype persists and selects the remembered deck of that archetype')`.
- `it('setActiveDeck persists the deck under its archetype')`.
- `it('derives deckArchSlug from activeArchetypeId')`.
- `it('setMetaWindow replaces the whole window')`, `it('coachTab defaults to "start"')`.
- Bestehender Test `deckArchSlug: ''` (`:141`) bleibt gültig.

**Docs:** `docs/architecture.md` §State Management (neue Slices) und §Data Persistence
(Zeile „Deck archetype slug (localStorage)" ersetzt durch „aktiver Archetyp – PostgreSQL
`user_preferences`"; „Active deck ID" ergänzt um serverseitige Map). Gate triggert nicht.
**Security:** nein (nutzt S2).

---

### S5 – Farbschema und Tokens (§9a), gekapselt unter `.coach-ui`

**ACs:** 10.

**Rote Tests:**
- `apps/web/src/components/meta/winRateColor.test.ts` – der bestehende Fall
  `'is unaffected by the tie-weighting change'` erwartet heute `text-emerald-700`/`amber`/`red`
  (`:21-24`). Er wird **offen** auf den neuen Vertrag umgestellt (Spec §9a ändert die Farben,
  kein Grünfärben): `winRateColorClass(55) === 'wr-pos'`, `(46) === 'wr-mid'`, `(10) === 'wr-neg'`;
  Grenzen 50 und 45 wie heute.
- `apps/web/src/theme/palette.test.ts` (neu) importiert `../../tailwind.config.js` und rechnet
  WCAG-Kontraste: `poke-600` auf Weiß ≥ 4,5 (Header-Text), `orange-700` auf Weiß ≥ 4,5,
  `brand-600`/`brand-700` auf Weiß ≥ 4,5, `energy-500` auf Weiß **< 3** (dokumentiert: nie Text).
- `apps/web/src/theme/noFilledRed.test.ts` (neu, Quelltext-Scan per `import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true })` – Vite 8 kennt `as: 'raw'` nicht mehr zuverlässig, ⚠️ im tester-Schritt verifizieren):
  `bg-poke-*` und `bg-red-6xx/7xx` kommen nur in einer Allowlist vor (Header-Band,
  Onboarding-Streifen); in Klassen-Strings mit `btn-primary`/`<button` nie. Deckt AC 10
  „kein gefüllter roter Button" maschinell ab; der Rest bleibt manuelle Abnahme.

**Implementierung:**
- `tailwind.config.js`: `colors.poke = { 50: '#fdecec', 100: '#f9d4d4', 600: '#d62828', 700: '#b01f1f' }`
  (nur Marke und Destruktiv-Umriss). Orange = Tailwinds `orange-700` (#c2410c), keine neue Palette.
- `index.css` `@layer components`:
  - `.wr-pos`, `.wr-mid`, `.wr-neg` mit den **heutigen** Farben (emerald-700 / amber-700 / red-700),
    damit das alte Layout unverändert aussieht.
  - `.coach-ui .wr-pos { @apply text-brand-700 }`, `.coach-ui .wr-mid { @apply text-slate-700 }`,
    `.coach-ui .wr-neg { @apply text-orange-700 }`.
  - `.coach-ui .card { background-color: rgb(255 255 255 / 0.94); }` (§9a „Karten leicht transparent").
  - `.btn-destructive` = `btn bg-white text-poke-600 border border-poke-600 hover:bg-poke-50`
    (Umriss, nie gefüllt; Bestätigungsdialog bleibt Sache der Aufrufer).
- `winRateColor.ts`: gibt `wr-pos | wr-mid | wr-neg` zurück. Alle Aufrufer
  (`WinRateBadge`, `FieldScorePanel`, `ArchetypeDetail`, `MetaPage`, `equilibriumFraming.ts`,
  `confidence.ts`) bekommen damit automatisch die Coach-Farben innerhalb von `.coach-ui`.

**Docs:** `docs/design-system.md` §Palette (neue Zeilen Marke Rot, Negativ Orange, Aktion Blau,
Gelb-Regel), §Component classes (`.btn-destructive`, `wr-*`, `.coach-ui`-Scope), Begründung „keine
roten Buttons" in zwei Sätzen. Gate triggert nicht (index.css/tailwind) – von Hand.
**Security:** nein.

---

### S6 – Sprite-Hintergrund folgt dem aktiven Archetyp, gleiche Kaskade

**ACs:** 9.

**Rote Tests:**
- `components/shared/pokemonSprites.test.ts` (neu): `spriteUrlCandidates('n-zoroark')` ==
  `['https://r2.limitlesstcg.net/pokemon/gen9/zoroark.png', 'https://raw.githubusercontent.com/…/zoroark.png']`;
  unbekannter Name ohne Auflösung → `[]`; Mega-Form (`'mega-lucario'`) → `lucario-mega` auf beiden Basen.
- `hooks/useFirstLoadableImage.test.ts` (neu, `Image` per `vi.stubGlobal` mit steuerbarem
  `onload`/`onerror`): erste URL lädt → erste; erste scheitert → zweite; alle scheitern → `null`;
  URL-Liste ändert sich → neuer Durchlauf, veraltete Antworten werden verworfen.
- `components/DeckSpriteBackground.test.tsx` (neu, Store gemockt wie in `BottomNav.test.tsx:18-20`):
  `it('uses activeArchetypeId even without an active deck')`,
  `it('falls back to activeDeck.archetype while no archetype is chosen')`,
  `it('applies the archetype tint (n-zoroark → rgba(167,139,250,0.40))')`,
  `it('renders no sprite layer when no candidate loads')`.

**Implementierung:**
```ts
// pokemonSprites.ts
export function spriteUrlCandidates(archetype: string): string[]; // primary slug × SPRITE_BASES
// hooks/useFirstLoadableImage.ts
export function useFirstLoadableImage(urls: readonly string[]): string | null;
```
`DeckSpriteBackground` liest `s.activeArchetypeId ?? s.activeDeck?.archetype ?? ''`; `SPRITE_BASE`
(`:4-5`) entfällt. Das gilt in **beiden** Layouts (harmlos: ohne Archetyp identisch zu heute).
CSS-Mehrfach-Hintergründe (`url(a), url(b)`) sind keine Lösung, weil bei Erfolg beider Quellen
zwei Sprites übereinander liegen – daher die JS-Probe.

**Docs:** `docs/design-system.md` §Where the tokens live (Zeile `DeckSpriteBackground`: Quelle
aktiver Archetyp, Kaskade). Gate triggert nicht (bestehende Komponente, Hook in `hooks/`).
**Security:** nein (bestehende CDN-Quellen, keine neuen Hosts).

---

### S7 – Bausteine: SegmentedTabs, AccountPanel, useFieldAnalysis, Header-Teile, i18n-Parität

**ACs:** Vorbereitung für 1, 2, 8.

**Rote Tests:**
- `components/shared/SegmentedTabs.test.tsx`: `role="tablist"`, genau ein `aria-selected="true"`,
  Klick ruft `onChange(id)`, Buttons ≥ 44 px (`min-h-[44px]` in der Klasse). *(Wenn der
  Overhaul-Branch vorher gemergt ist, existiert die Komponente schon – dann nur den Test ergänzen.)*
- `components/auth/AccountPanel.test.tsx`: zeigt Name/E-Mail, KI-Einstellungen-Knopf öffnet
  `AiSettingsModal`, `SyncControls` vorhanden, Abmelden ruft `authClient.signOut`.
  `MobileAccountSheet` rendert danach `AccountPanel` (bestehendes Verhalten unverändert).
- `hooks/useFieldAnalysis.test.ts`: lädt für ein Fenster, liefert `{ data, isLoading, error }`,
  verwirft Antworten eines alten Fensters (Request-Key wie `MetaPage.tsx:504-526`).
- `components/coach/ArchetypeSwitcherButton.test.tsx`: zeigt `PokemonIcon` + Anzeigename,
  `aria-label` „Archetyp wechseln", Klick ruft `onClick`; ohne Archetyp Text „Archetyp wählen".
- `components/coach/ActiveListChip.test.tsx`: zeigt `deck.variant` bzw. `archetypeName`
  und das Label des neuesten Snapshots als Version (falls vorhanden); ohne Deck „Keine Liste";
  Klick → `setCoachTab('deck')` + `setDeckView('myLists')`.
- `lib/coach/archetypeName.test.ts`: `archetypeDisplayName(slug, { known, field, decks })` –
  Reihenfolge KNOWN_ARCHETYPES → Feldanalyse → eigenes Deck → Slug.
- `i18n/localeParity.test.ts`: für **alle** Namespaces identische Schlüsselmengen DE/EN.
  *Guard-Test, von Anfang an grün (heute 9/9 paritätisch) – kein TDD-Rot, schützt S7–S14.*

**Implementierung (Props):**
```ts
export function SegmentedTabs<T extends string>(p: {
  items: { id: T; label: string; Icon: LucideIcon }[]; active: T; onChange: (id: T) => void;
}): JSX.Element;
export function AccountPanel(p: { onOpenAiSettings: () => void }): JSX.Element | null;
export function useFieldAnalysis(window: MetaWindow): {
  data: FieldAnalysis | null; isLoading: boolean; error: boolean;
};
export function ArchetypeSwitcherButton(p: {
  archetypeId: string | null; displayName: string; onClick: () => void;
}): JSX.Element;
export function ActiveListChip(): JSX.Element; // reads store
export function archetypeDisplayName(slug: string, sources: {
  known: readonly KnownArchetype[]; field: readonly FieldAnalysisArchetype[]; decks: readonly Deck[];
}): string;
```
i18n: neue Keys `layout.header.*` (switchArchetype, chooseArchetype, noList, menu),
`layout.coachNav.*` (start, deck, coaching, opponents, tools, settings).

**Docs (Gate):** neue Dateien unter `components/shared/` → `docs/design-system.md` §Component classes
(SegmentedTabs), unter `components/coach/` → `docs/architecture.md` §Frontend,
`components/auth/AccountPanel.tsx` → `docs/demo-mode.md` §How it works (nur falls inhaltlich
betroffen – sonst Marker bewusst mit Begründung löschen) + `docs/architecture.md`.
**Security:** nein.

---

### S8 – Onboarding (§5.1)

**ACs:** 1, 5 (Zustand „kein Archetyp gewählt").

**Rote Tests** – `components/coach/onboarding/OnboardingFlow.test.tsx` (Store + `useFieldAnalysis` gemockt):
- `it('step 1 lists the 10 most-played field archetypes with their share')` → 12 Feld-Einträge
  rein, genau 10 Buttons, absteigend nach `sharePct`, Anteil sichtbar („12,3 %").
- `it('step 1 search filters KNOWN_ARCHETYPES and field archetypes by name and slug')`.
- `it('choosing an archetype calls setActiveArchetype(slug)')`.
- `it('step 2 offers "take meta list", "paste my own list" and "later"')`.
- `it('"take meta list" creates a deck and imports the best cluster medoid')` → `createNewDeck(slug, name, <Variant>)`
  und `importCards(cards, true, newId)` mit den Karten aus `clusters[0].representative`
  (Roundtrip `exportCardsFromDecklist` → `exportDeckList` → `parseDeckList`).
- `it('disables "take meta list" with a hint when the archetype has no clusters')`.
- `it('"paste my own list" creates an empty deck and opens ImportDeckModal')`.
- `it('"later" skips to step 3 without creating a deck')`.
- `it('skips step 2 when a deck of the archetype already exists (archetype switch)')`.
- `it('step 3 stores the TCG Live name under tcg-player-name and can be skipped')`.
- `it('finishing lands on Start with the "play a round and paste the log" hint')` → `setCoachTab('start')`, Hinweis-Flag gesetzt.
- `it('every step is keyboard reachable and buttons are real <button> elements')`.

Reine Hilfsfunktionen in `lib/coach/onboarding.ts` mit eigenem Test:
```ts
export function topFieldArchetypes(field: readonly FieldAnalysisArchetype[], n = 10): FieldAnalysisArchetype[];
export function medoidToParsedCards(rep: TournamentDecklist): ParsedCard[];
```

**Implementierung:**
```ts
type OnboardingStep = 'archetype' | 'list' | 'playerName';
export function OnboardingFlow(p: {
  mode: 'firstRun' | 'switchArchetype';
  onDone: () => void;
  onCancel?: () => void; // only in 'switchArchetype'
}): JSX.Element;
```
Feldanalyse für Schritt 1: `useFieldAnalysis({ days: 7, online: true, bo1: true })`.
Onboarding-Streifen in Rot (`bg-poke-600`, weißer Text 5,0:1) = Markenfläche aus der Allowlist
in S5. Neuer Namespace `onboarding` (DE/EN).

**Docs (Gate):** neue Komponenten → `docs/architecture.md` §Frontend (Onboarding-Ablauf),
dazu `docs/features.md` Abschnitt „Archetyp-Coach-UI (Feature-Flag)" anlegen (wird in S9–S14
fortgeschrieben). **Security:** nein – nutzt nur bestehende Routen (`POST /api/decks`,
`PUT /api/decks/:id/cards`, `GET /api/analysis/archetype/:id`, `PATCH /api/preferences` aus S2).
Der TCG-Live-Name bleibt im localStorage (E6).

---

### S9 – Start (Cockpit, §5.2) aus `OverviewPage` + `StatCard`

**ACs:** 4 (Teil), 5 (Zustände „Archetyp ohne Liste", „keine eigenen Spiele" → Nächster Schritt = „Log einfügen").

**Reine Logik** – `apps/web/src/lib/coach/start.ts`:
```ts
export function logsOfArchetype(logs: OpponentLog[], decks: Deck[], archetypeId: string): OpponentLog[];
export function recentForm(logs: OpponentLog[], now: Date, days = 7): {
  wins: number; losses: number; ties: number; winRatePct: number | null;
  band: { lowPct: number; highPct: number } | null;
};
export type NextStep = { kind: 'adoptList' } | { kind: 'pasteLog' };
/** Scheibe 1 only knows these two; experiments / meta-list changes / coaching hotspots
 *  join the priority list with Spec 6 / 5 / 8. */
export function nextStep(ctx: { hasActiveDeck: boolean; hasLogs: boolean }): NextStep;
export function fieldThisWeek(field: FieldAnalysisArchetype[], own: ArchetypeStats[], n = 5):
  { archetypeId: string; name: string; sharePct: number; ownWinRatePct: number | null }[];
```
**Rote Tests** – `lib/coach/start.test.ts`: Logs fremder Archetypen werden verworfen ·
7-Tage-Grenze per `eventDate` (inklusive heute, exklusive Tag 8) · Tie-Gewichtung wie
`tournamentWinRatePct` · Band via `wilsonInterval`, `null` ohne Spiele · `nextStep` ohne Deck →
`adoptList`, mit Deck ohne Logs → `pasteLog` · Top 5 nach Anteil, eigene WR per Namensabgleich,
`null` ohne Begegnung.

`pages/coach/StartPage.test.tsx`: Reihenfolge der fünf Blöcke (Aktive Liste, Nächster Schritt,
Deine Form, Feld diese Woche, Letzte Spiele); „Für TCG Live kopieren" ist `CopyDeckListButton`
mit den Deckkarten; ohne Deck zeigt Block 1 „Meta-Liste übernehmen" (öffnet Onboarding Schritt 2);
Tipp auf einen Gegner → `setCoachTab('opponents')`; Tipp auf ein letztes Spiel → `setCoachTab('coaching')`;
genau 3 letzte Spiele; keine Logs → Nächster Schritt „Log einfügen" öffnet `AddLogModal`.

**Implementierung:** neue Seite `pages/coach/StartPage.tsx`; `OverviewPage` bleibt fürs alte
Layout unverändert. Namespace `start` (DE/EN). Negative WR in `StatCard` über `wr-*` (S5).
**Docs:** `docs/features.md` Abschnitt aus S8 fortschreiben (Start). Gate triggert nicht
(`pages/`). **Security:** nein.

---

### S10 – Deck: Segmente „Meta-Liste · Meine Listen" (§5.3)

**ACs:** 4 (Teil), 6 (Teil).

**Umzug laut §6:**
- *Meine Listen*: `DeckSwitcher` (gefiltert auf den aktiven Archetyp), `DeckPanel`,
  `DeckSettingsWidget`, `ImportDeckModal`/`CreateDeckModal` (über `DeckSwitcher`/`DeckPanel`
  wie heute), `DeckAnalyticsPanel` **ohne** Zugqualität (Versionsvergleich bleibt hier).
- *Meta-Liste*: `DeckTipsSection` unverändert (Spec §12 Entscheidung 4: die 14 Regeln wandern
  mit).
- `MyMatchupsTable` wandert **nicht** hierher, sondern nach *Gegner* (S12).

**Rote Tests:**
- `components/deck/DeckSwitcher.test.tsx` (neu): `it('shows only decks of archetypeFilter when set')`,
  `it('shows all decks without archetypeFilter (legacy behaviour)')`.
- `components/deck/DeckAnalyticsPanel.test.tsx` (neu oder ergänzt): `it('omits DeckTurnQualityPanel when omitTurnQuality is set')`, `it('renders it by default')`.
- `components/deck/DeckTipsSection.test.tsx` (`:54-60` Mock ergänzen): `it('calls onOpenLocalMeta instead of setActiveTab("meta") when provided')`.
- `pages/DeckPage.test.tsx`: bleibt unverändert grün (Extraktion des Widgets ändert kein Verhalten).
- `pages/coach/DeckHubPage.test.tsx`: zwei Segmente via `SegmentedTabs`, Default `myLists`,
  kein „Lab"-Tab; *Meine Listen* rendert Switcher mit `archetypeFilter = activeArchetypeId`,
  `DeckPanel`, Settings-Widget, Analytics mit `omitTurnQuality`; *Meta-Liste* rendert
  `DeckTipsSection`; „Log match"-Knopf und `MyMatchupsTable` **nicht** auf dieser Seite;
  Leerzustand „Archetyp ohne Liste" → Karte „Meta-Liste übernehmen / Eigene Liste einfügen".

**Implementierung (Props):**
```ts
// components/deck/DeckSwitcher.tsx
export function DeckSwitcher(p?: { archetypeFilter?: string }): JSX.Element;
// components/deck/DeckAnalyticsPanel.tsx – Props um
omitTurnQuality?: boolean; // default false
// components/deck/DeckTipsSection.tsx
export function DeckTipsSection(p?: { onOpenLocalMeta?: () => void }): JSX.Element;
// components/deck/DeckSettingsWidget.tsx – 1:1 aus DeckPage.tsx:17-164 extrahiert
export function DeckSettingsWidget(): JSX.Element | null;
```
Im Coach-Layout zeigt `onOpenLocalMeta` auf `setCoachTab('opponents')` (dort lebt `LocalMetaPanel`).
Im `DeckSettingsWidget` bleibt das freie Slug-Feld; im Coach-Layout ist der Archetyp über den
Header gesetzt – die Kopplung „Slug-Feld ↔ aktiver Archetyp" ist Scheibe-2-Material (E13).
Neue Keys unter `deck.hub.*` (DE/EN).

**Docs (Gate):** neue Datei `components/deck/DeckSettingsWidget.tsx` → `docs/features.md` §3 +
`docs/architecture.md` §Frontend. **Security:** nein.

---

### S11 – Coaching (§5.4, Scheibe-1-Umfang)

**ACs:** 4 (Teil), 5 („keine eigenen Spiele": Anleitung), 6 (Teil).

**Umzug laut §6:** `OpponentLog` (Verlauf, inkl. `MatchDetailModal`/`MatchStatsTab`), `AddLogModal`
(über Knopf „Log einfügen" und ＋), `DeckTurnQualityPanel` (Zugqualität aus `DeckAnalyticsPanel`).

**Rote Tests** – `pages/coach/CoachingPage.test.tsx`:
- `it('shows a prominent "paste TCG Live log" action that opens AddLogModal preselected to the active deck')`.
- `it('lists only logs of decks of the active archetype')` (nutzt `logsOfArchetype` aus S9).
- `it('renders DeckTurnQualityPanel for the active deck')`, ohne aktives Deck nicht.
- `it('shows the "how to copy a log from TCG Live" guide when there are no logs')` (Text-Anleitung;
  Bilder folgen mit Spec 8).
- `it('shows a one-time dismissible hint to AI settings when no key is configured')` –
  **nur falls** `getAiSettings().hasApiKey` ohne neuen Fetch-Pfad verfügbar ist; sonst nach
  Scheibe 6 verschieben (⚠️ Vermutung: `AiSettingsModal` lädt die Settings selbst; ein
  zusätzlicher Aufruf ist billig, aber neuer Datenfluss → E14).

**Implementierung:** `pages/coach/CoachingPage.tsx`; Namespace `coaching` (DE/EN). Keine Filter
im Verlauf (Scheibe 6). **Docs:** `docs/features.md` (Coaching-Teil des Coach-Abschnitts, Verweis
auf §6 Match Log). **Security:** nein.

---

### S12 – Gegner (§5.5, Scheibe-1-Umfang)

**ACs:** 6 (Teil).

**Umzug laut §6:** `LocalMetaPanel` (Mein Feld), `PredictionPanel` (bringt `FieldScorePanel`,
`ThreatsPanel`, `DecklistCard`, `ListFieldPerformance` mit), `MyMatchupsTable` (eigene WR pro
Gegner, aus `DeckPage.tsx:217`).

**Rote Tests** – `pages/coach/OpponentsPage.test.tsx`:
- `it('renders LocalMetaPanel, PredictionPanel and MyMatchupsTable')`.
- `it('passes the store metaWindow and the field-analysis archetypes to PredictionPanel')`.
- `it('shows a loading state while the field analysis loads and an error card on failure')`.
- `it('renders MetaWindowControl bound to setMetaWindow')`.

**Implementierung:** `pages/coach/OpponentsPage.tsx` mit `useFieldAnalysis(metaWindow)`.
Gegner-Detail (typische Karten, Coaching-Baustelle) ist Spec 5/8. Keys unter `opponents.page.*`
(bestehender Namespace erweitert, E11). **Docs:** `docs/features.md` §11/§16 um den neuen Ort
ergänzen. **Security:** nein.

---

### S13 – Werkzeuge (§5.6, ungefiltert)

**ACs:** 6 (Teil).

**Umzug laut §6:** `MetaWindowControl` (global über `metaWindow`), `MatchupMatrix`,
`EquilibriumPanel`, `ArchetypeDetail` des aktiven Archetyps (enthält `ArchetypeRecommendationPanel`,
`TournamentBestListPanel`, `DecklistCard`, `MatchupTable`), Link-Karten Limitless/Trainer Hub.

**Rote Tests:**
- `components/meta/ArchetypeDetail.test.tsx` (neu oder ergänzt): `it('hides the back button when onBack is omitted')`.
- `pages/coach/ToolsPage.test.tsx`: Abschnitte Turnierlisten (ArchetypeDetail mit
  `archetypeId = activeArchetypeId`), Matchup-Matrix (eingeklappt), Spieltheorie (eingeklappt,
  Equilibrium-Fetch mit `metaWindow.days`), Link-Karten mit `rel="noopener noreferrer"` und
  `target="_blank"`; `TournamentMetaTable`/`RecentTournaments` werden **nicht** gerendert.

**Implementierung:** `pages/coach/ToolsPage.tsx`; in `ArchetypeDetail` wird `onBack` optional
(`ArchetypeDetail.tsx:64`, Button nur mit Callback). Equilibrium-Fetch mit dem Request-Key-Muster
aus `MetaPage.tsx:535-561` (als kleiner Hook `useMetaEquilibrium(days)` extrahieren, `MetaPage`
nutzt ihn mit). Namespace `tools` (DE/EN). **Docs (Gate):** `ArchetypeDetail` ist getrackt →
kein Trigger; `docs/features.md` §13/§15/§18 um „im Coach-Layout unter Werkzeuge" ergänzen.
**Security:** nein (externe Links sind statisch).

---

### S14 – Coach-Layout: Header, Sidebar, BottomNav, Menü, Weiche in `App.tsx`

**ACs:** 1, 2 (Teil), 10.

**Rote Tests:**
- `components/coach/coachNavItems.test.ts`: `COACH_NAV_ITEMS` ids `['start','deck','coaching','opponents']`
  in dieser Reihenfolge; `COACH_TOOLS_ITEM.id === 'tools'`; alle Labels bei 11 px ≤ 8 Zeichen
  (DE: „Start", „Deck", „Coaching", „Gegner").
- `components/coach/CoachBottomNav.test.tsx`: Reihenfolge `[Start, Deck] · ＋ · [Coaching, Gegner]`,
  kein „Zum Vergleich"; genau ein `aria-current="page"`; ＋ öffnet `AddLogModal`; ＋ hat
  `bg-brand-*` und gelben Ring (`ring-energy-500`), **kein** `bg-poke-*`; alle Buttons `min-h-[44px]`.
- `components/coach/CoachSidebar.test.tsx`: fünf Bereiche (inkl. Werkzeuge) + Konto-Bereich
  (`AccountPanel`, `LanguageSwitcher`, `LegalLinks`); aktiver Eintrag markiert.
- `components/coach/CoachHeader.test.tsx`: rotes Markenband (`bg-poke-600`) mit gelber Kante
  (`border-energy-500`), `ArchetypeSwitcherButton` öffnet Onboarding im Modus `switchArchetype`,
  `ActiveListChip` vorhanden, Menü-Knopf öffnet `HeaderMenuSheet`.
- `components/coach/HeaderMenuSheet.test.tsx`: Eintrag „Werkzeuge" → `setCoachTab('tools')` und
  schließt; enthält `AccountPanel`; Escape schließt; `role="dialog"`, `aria-modal`.
- `components/coach/CoachLayout.test.tsx`:
  `it('shows the onboarding when preferences are ready and no archetype is set')`,
  `it('shows Start when an archetype is set')`,
  `it('shows a skeleton, not the onboarding, while preferences load')`,
  `it('shows a skeleton for an anonymous user with zero decks (demo seed in flight)')`,
  `it('root element carries the coach-ui class')`,
  `it('renders the page for each coachTab')`,
  `it('keeps working (Start + retry hint) when loading preferences failed')`.
- `App.test.tsx` (neu): mit Flag aus rendert `Sidebar`/`BottomNav` (alt), mit Flag an `CoachLayout`
  (`featureFlags` gemockt).

**Implementierung (Props):**
```ts
export interface CoachNavItem { id: CoachTab; labelKey: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }
export const COACH_NAV_ITEMS: readonly CoachNavItem[];
export const COACH_TOOLS_ITEM: CoachNavItem;
export function CoachLayout(): JSX.Element;       // .coach-ui root, background, header, nav, pages, onboarding gate
export function CoachHeader(p: { onSwitchArchetype: () => void }): JSX.Element;
export function CoachSidebar(): JSX.Element;
export function CoachBottomNav(): JSX.Element;
export function HeaderMenuSheet(p: { open: boolean; onClose: () => void }): JSX.Element | null;
```
`App.tsx`: `Dashboard` behält Mount-Effekt, `DemoBanner` und `ImportLocalDataModal`, rendert
je nach `isArchetypeCoachUiEnabled()` das alte Gerüst (`Sidebar` + `PAGE[activeTab]` + `BottomNav`
+ `MobileAccountSheet`) oder `CoachLayout`. Seiten im Coach-Layout per `lazy()` wie heute
(`App.tsx:20-24`). Mobil ersetzt der Header den schwebenden Avatar-Chip (im Coach-Layout wird
`MobileAccountSheet` nicht gerendert, das Konto liegt im Header-Menü).

**Docs (Gate):** neue Komponenten → `docs/architecture.md` §Application Shell (zwei Layouts hinter
dem Flag, Komponentenbaum Coach-Layout als zweites Mermaid-Diagramm; die toten Knoten
`MetaShareChart`/`WinRateChart`/`DeckPerformancePanel` im alten Baum bei der Gelegenheit
entfernen), §Responsive Layout (Header statt Avatar-Chip), `docs/design-system.md` (Header-Band,
＋-Ring). **Security:** nein.

---

### S15 – Abschluss: Doku-Durchgang, Demo-Abnahme, Gates

- `docs/features.md`: Abschnitt „Archetyp-Coach-UI (hinter `archetypeCoachUi`)" vollständig –
  Kern-Loop, fünf Bereiche, Onboarding, aktiver Archetyp, Einschalten per `?ff=`. Die neue
  Gliederung der ganzen Datei nach dem Kern-Loop (Vision §7.4) kommt beim Umschalten (E12).
- `docs/README.md`: Index-Eintrag, falls neue Abschnitte verlinkt werden müssen.
- Manuelle Abnahme (Vision §9.2.8, Konrad auf dem Handy): Demo mit `?ff=archetypeCoachUi` –
  Onboarding erscheint nicht, Start zeigt Zoroark; neues Konto – Onboarding; zweites Gerät –
  gleicher Archetyp; Flag aus – App wie vorher.
- `npm run typecheck`, `npm run lint`, `npm run test` grün (Root).

---

## Schnittstellen (Übersicht)

```ts
// API (apps/api/src/routes/preferences.ts)
GET   /api/preferences → { activeArchetypeId: string | null; activeDeckIdByArchetype: Record<string, number> }
PATCH /api/preferences  { activeArchetypeId?: string | null; activeDeck?: { archetypeId: string; deckId: number | null } }

// Web client (apps/web/src/lib/api.ts)
getPreferences(): Promise<UserPreferences>
updatePreferences(patch: UserPreferencesPatch): Promise<UserPreferences>

// Store (apps/web/src/store/dashboardStore.ts)
type CoachTab = 'start' | 'deck' | 'coaching' | 'opponents' | 'tools'
type DeckView = 'metaList' | 'myLists'
activeArchetypeId, activeDeckIdByArchetype, preferencesStatus, coachTab, deckView, metaWindow
loadPreferences(), setActiveArchetype(id), setCoachTab(t), setDeckView(v), setMetaWindow(w)

// Pure (apps/web/src/lib/coach/*)
resolveActiveDeckId, pickMigrationArchetype, archetypeDisplayName,
topFieldArchetypes, medoidToParsedCards, logsOfArchetype, recentForm, nextStep, fieldThisWeek

// Flag (apps/web/src/lib/featureFlags.ts)
resolveFeatureFlag(flag, sources), isArchetypeCoachUiEnabled()
```

---

## Risiken & Randfälle

1. **Demo-Rennen:** `Dashboard` mountet, sobald die anonyme Session da ist – **vor** dem Seed
   (`WelcomeScreen.tsx:41-45`). `loadPreferences` sieht dann noch keinen Archetyp und würde
   das Onboarding zeigen. Abhilfe in S14: anonymer Nutzer ohne Decks → Skeleton statt
   Onboarding; `startDemo` lädt die Preferences nach dem Seed neu (S4).
2. **Migration aus dem aktiven Deck** (E5): Konten mit Decks überspringen das Onboarding. Wer
   bewusst neu wählen will, nutzt den Header-Wechsler.
3. **Veraltete Map-Einträge:** Löscht ein Nutzer ein Deck, bleibt dessen ID in
   `active_deck_id_by_archetype`. `resolveActiveDeckId` ignoriert fehlende IDs; kein
   serverseitiges Aufräumen nötig (⚠️ bewusst einfach gehalten).
4. **Zwei Layouts parallel:** Änderungen an geteilten Komponenten (S10, S13) müssen das alte
   Layout unverändert lassen – die bestehenden Tests (`DeckPage.test.tsx`, `BottomNav.test.tsx`,
   `Sidebar.test.tsx`, `navItems.test.ts`, `DeckTipsSection.test.tsx`) sind dafür das Netz und
   werden **nicht** angepasst (Ausnahme: `winRateColor.test.ts`, offen begründet in S5).
5. **Farb-Scope:** Farben gelten nur unter `.coach-ui`. Komponenten, die in Portalen rendern
   (`createPortal(..., document.body)`, z. B. `MobileAccountSheet.tsx:72-136`, Modals), liegen
   **außerhalb** von `.coach-ui` und zeigen alte Win-Rate-Farben. Abhilfe: Klasse `coach-ui`
   zusätzlich auf `document.body` setzen, solange das Coach-Layout gemountet ist (Effekt in
   `CoachLayout`, Test in S14).
6. **Hintergrund-Probe:** `useFirstLoadableImage` lädt bis zu zwei Bilder vor. Bei Archetypen
   ohne Sprite (Kaskade leer) bleibt der Hintergrund leer wie heute – kein Fehler.
7. **Doppelte Anzeige Feldwert/Threats** in Gegner und Werkzeuge bis Scheibe 2 (siehe §1 Punkt 2).
8. **Kaltstart:** kein Meta (`fieldAnalysis.archetypes = []`) → Onboarding Schritt 1 zeigt nur
   die Suche über `KNOWN_ARCHETYPES`; Start „Feld diese Woche" zeigt „Noch keine Turnierdaten".
9. **Große Seiten weiter lazy:** Werkzeuge/Gegner ziehen Recharts; `lazy()` pro Coach-Seite.
10. **Konflikte mit dem Overhaul-Branch** (§7) – vor allem `DeckPage.tsx`, `ArchetypeDetail.tsx`,
    `ThreatsPanel.tsx`, `meta.json`, `docs/features.md`.

---

## 7. Überschneidung mit `design/frontend-uiux-overhaul` (lokal, ungepusht)

Merge-Base ist `baebcc5` (älter als `main` = `a1d0dc8`).

| Commit | Datei | Scheibe-1-Berührung | Konfliktrisiko |
|---|---|---|---|
| `a6a31b7` | `components/shared/SegmentedTabs.tsx` (neu) | S7/S10 brauchen genau diese Komponente | **Synergie** – übernehmen statt neu schreiben |
| `a6a31b7` | `pages/DeckPage.tsx` (Tabs → `SegmentedTabs`) | S10 extrahiert `DeckSettingsWidget` aus `DeckPage.tsx:17-164` | **hoch** (gleiche Datei, benachbarte Stellen) |
| `a6a31b7` | `pages/DeckPage.test.tsx` | S10 lässt ihn unverändert | mittel |
| `a6a31b7` | `components/meta/ArchetypeDetail.tsx` (7 Abschnitte → 4 Tabs) | S13 bettet ihn in Werkzeuge ein, macht `onBack` optional | **hoch**; zugleich passt die Tab-Struktur (Matchups/Empfehlung/Turnier-Liste/Decklisten) gut zu *Werkzeuge* |
| `a6a31b7` | `components/meta/ThreatsPanel.tsx`, `MatchupTable.tsx` | S12 rendert sie (über `PredictionPanel`) unverändert | niedrig (Scheibe 1 ändert sie nicht) |
| `a6a31b7` | `i18n/locales/{de,en}/meta.json` | S12/S13 fügen evtl. Keys hinzu | mittel (JSON-Konflikte, leicht lösbar) |
| `a6a31b7`, `8f34c16` | `docs/features.md` | S2, S8–S15 schreiben dort | **hoch** |
| `8f34c16` | `components/meta/ArchetypeDetail.tsx` (Turnier-Picker eigener Fetch) | wie oben | hoch |
| `8f34c16` | `lib/api.ts` (`getArchetypeTournaments`) | S4 ergänzt `getPreferences`/`updatePreferences` | niedrig (Anhängen an verschiedenen Stellen) |
| `8f34c16` | `apps/api/src/routes/meta.ts` (neue Route `…/tournaments`), `api.test.ts` | S2 ergänzt `api.test.ts` an anderer Stelle | niedrig; neue Route braucht eigenen security-agent-Durchlauf |

**Empfehlung (E15):** den Overhaul-Branch **vor** Start von Scheibe 1 als eigenen PR auf `main`
bringen (er ist klein, 2 Commits, und hat einen eigenen Security-Punkt für die neue Route).
Danach startet `feat/archetype-first-ui` auf dem neuen `main`, übernimmt `SegmentedTabs` und
bettet das getabbte `ArchetypeDetail` in *Werkzeuge* ein. Alternative: Scheibe 1 zuerst, dann
Overhaul rebasen – teurer, weil `DeckPage.tsx` und `docs/features.md` doppelt aufgelöst werden.

---

## 8. Entscheidungsbedarf (neue Punkte, jeweils mit Default)

| # | Frage | Default-Vorschlag |
|---|---|---|
| E1 | Mechanik des Feature-Flags | Laufzeit-Flag im Client: `?ff=archetypeCoachUi` → localStorage, sonst `VITE_FF_ARCHETYPE_COACH_UI`, sonst aus. So kann Konrad es in Produktion auf dem eigenen Handy einschalten, ohne es für alle zu aktivieren (ein Service, `railway.json`) |
| E2 | Gelten Farben/Karten-Transparenz global oder nur im Coach-Layout? | nur im Coach-Layout (`.coach-ui`-Scope, S5) – entspricht „Scheibe 1 hinter dem Flag" |
| E3 | Farbe des Mittelbands 45–50 % (Spec nennt nur positiv/negativ) | `slate-700` (neutral), positiv `brand-700`, negativ `orange-700` |
| E4 | „Pro Archetyp die zuletzt aktive Liste" – wo gespeichert? | serverseitig in `user_preferences.active_deck_id_by_archetype` (jsonb), Besitz geprüft |
| E5 | Bestandskonten ohne `deckArchSlug` | Archetyp aus dem aktiven Deck übernehmen (kein Onboarding-Zwang). Nur Konten ohne Deck sehen das Onboarding |
| E6 | TCG-Live-Name (Onboarding Schritt 3) | in Scheibe 1 weiter localStorage `tcg-player-name`; serverseitig mit Spec 8 S1 in derselben Tabelle |
| E7 | „Meta-Liste übernehmen" vor Spec 5 | Medoid des besten Clusters (Spec 1) als neues Deck; ohne Cluster deaktiviert mit Hinweis |
| E8 | Lab-Segment in *Deck* | ausgeblendet bis Spec 6 |
| E9 | Demo-Archetyp | **Entschieden (Konrad, 2026-09-24): `dragapult-ex`.** Der Demo-Seed bekommt ein drittes Deck „Dragapult ex" (legale 60-Karten-Liste) mit einigen Ergebnis-Matches; es wird aktiver Archetyp und aktive Liste (S3). Ursprünglicher Default war `n-zoroark`. Battle-Logs/Analysen bleiben bis Scheibe 7 am Kangaskhan-Deck; Coaching im Demo ist bis dahin dünn. |
| E10 | `ArchetypeDetail` in Scheibe 1 | ganz in *Werkzeuge* einbetten, Auflösen in Scheibe 2 |
| E11 | Namespaces `deck`/`opponents` existieren schon | bestehende erweitern (`deck.hub.*`, `opponents.page.*`); neu nur `start`, `coaching`, `tools`, `onboarding`. `lab` mit Spec 6 |
| E12 | Neue Gliederung von `docs/features.md` | beim Umschalten des Flags; in Scheibe 1 nur ein eigener Abschnitt |
| E13 | Freies Slug-Feld im `DeckSettingsWidget` | bleibt in Scheibe 1; Kopplung an den aktiven Archetyp in Scheibe 2 |
| E14 | Hinweis „kein LLM-Key" im Coaching | in Scheibe 6 (Coaching-Ablauf), nicht in Scheibe 1 |
| E15 | Reihenfolge mit dem Overhaul-Branch | Overhaul zuerst als eigener PR, dann Scheibe 1 |
| E16 | `SyncControls` „nur Admin" | es gibt keine Admin-Rolle; bleibt im Konto-Bereich für alle. Admin-Rolle = eigene kleine Spec (serverseitig, security-agent) |
| E17 | Ziel des Listen-Chips im Header („führt zum Export") | wechselt zu *Deck › Meine Listen*, wo „Kopieren" liegt; kein eigenes Popover |
| E18 | Datei-Umzüge in Komponenten-Ordner nach Bereich | erst beim Umschalten des Flags |

---

## Verifikations-Checkliste

- [ ] `npm run typecheck`, `npm run lint`, `npm run test` grün nach **jeder** Unter-Scheibe
- [ ] Flag aus: alte Tests unverändert grün (außer `winRateColor.test.ts`, begründet), App optisch unverändert
- [ ] Flag an, neues Konto ohne Decks: Onboarding → Start mit Hinweis „Spiel eine Runde und füge das Log ein"
- [ ] Flag an, Bestandskonto: kein Onboarding, Archetyp aus altem Slug bzw. aktivem Deck
- [ ] Zweites Gerät/Browser: gleicher Archetyp (AC 3)
- [ ] Demo mit Flag: kein Onboarding-Aufblitzen, Dragapult ex aktiv, Hintergrund Dragapult
- [ ] Hintergrund ohne eigenes Deck zeigt das Sprite des gewählten Archetyps (AC 9)
- [ ] Kein gefüllter roter Button im Coach-Layout, ＋ blau mit gelbem Ring (AC 10)
- [ ] Kaltstart: kein Meta, keine Decks, keine Logs – keine leere oder kaputte Seite
- [ ] DE/EN vollständig (`localeParity.test.ts`), Touch-Ziele ≥ 44 px
- [ ] security-agent für S2 durchlaufen, Befunde behoben
- [ ] Docs-Gate grün; `docs/architecture.md`, `docs/features.md`, `docs/database.md`,
      `docs/data-types.md`, `docs/design-system.md`, `docs/demo-mode.md` aktualisiert
