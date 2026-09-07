# Plan — Button-/Aktions-Konsolidierung

> **Bindende Grundlage:** [`specs/ui-ux-button-consolidation.md`](../../specs/ui-ux-button-consolidation.md),
> inkl. der vier Entscheidungen aus „Offene Fragen (entschieden, 2026-09-07)" (`:138-181`).
> Kontext: bewusst zurückgestellte Folge-Spec zu Spec 7 (`ui-ux-hub-rework.md`); der
> 9-teilige Rework-Fluss ist mit Spec 9 abgeschlossen (`main` = `a8ab656`).
> **Branch:** `feat/ui-ux-button-consolidation`, abzweigen von `main` (`a8ab656`).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> eine Verhaltens-Scheibe nach der anderen.
> **Reine Frontend-Änderung.** Kein Backend, kein Schema, keine API, keine Store-Action,
> kein Handler wird ausgetauscht — nur Labels, Anzahl/Anordnung bestehender Buttons und
> die Erreichbarkeit der Sidebar-Aktionen auf schmalen Viewports.
>
> **Nachtrag 2026-09-07 (Konrad, bindend):** Der mobile Zugang zu Sync/Refresh wird **Option B** —
> die beiden Aktionen wandern als Menüpunkte in das **bestehende** `MobileAccountSheet`.
> **Kein** zweiter schwebender Chip, **keine** neue `MobileSyncSheet`-Komponente. Begründung:
> ein zweites dauerhaft sichtbares UI-Element auf jeder Mobile-Seite liefe dem Spec-Ziel
> („Anzahl gleichzeitig sichtbarer Aktionen minimieren") zuwider, auch wenn es das
> Erreichbarkeitsproblem technisch löst. Der zusätzliche Tap bis zur Aktion ist akzeptiert.
> Betroffen sind §2, §3.3, §3.5, §3.10, §3.11-D, §4 (Scheibe D/F/G + Commits), §5.1, §5.6, §5.8,
> §5.9 und §6; alles Übrige (Label-Kontrakt, i18n-Test, „Match loggen"-Trimming,
> „Vergleich"/„Vergleichen") bleibt unverändert.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `a8ab656`)

Alles hier ist aus den genannten Dateien gelesen. Wo etwas nicht belegt werden konnte,
steht **Vermutung** oder **Unbekannt** (CLAUDE.md Golden Rule 1). Pfade relativ zum Repo-Root;
Frontend-Pfade zusätzlich relativ zu `apps/web/src`, wo das die Lesbarkeit erhöht.

### 0.1 Die vier bindenden Entscheidungen der Spec

`specs/ui-ux-button-consolidation.md:140-181`:

1. **Sync-Gruppe = Option (c):** Sidebar-Sync-/Aktualisieren-Aktionen müssen **auf jedem
   Viewport erreichbar** sein; danach entfällt die MetaPage-Kopie ersatzlos. Das *Wie*
   (Drawer/Overlay/Verhältnis zu `BottomNav`) war ausdrücklich Planner-Frage (`:146-149`) und
   ist mit dem Nachtrag oben von Konrad entschieden (Option B, §3.5).
   Für die vier verbleibenden, nicht-redundanten Buttons gilt Umbenennung statt Entfernung.
2. **„Match loggen": vier → drei Einstiegspunkte.** Bleiben FAB, DeckPage-Header, Empty-State-CTA;
   **entfernt** wird der Footer-Button in `OpponentLog` (`:154-164`).
3. **Scope-Präfixe als sichtbarer Label-Text, nicht als Tooltip** (`:165-173`) — Begründung:
   Touch-Oberflächen haben kein Hover-Konzept.
4. **„Vergleich"/„Vergleichen": umbenennen, Verhalten unverändert** (`:174-181`) — der
   BottomNav-Shortcut wird navigations-typisch benannt, der Panel-Button behält „Vergleichen".

Zusätzlich bindend aus den Akzeptanzkriterien (`:80-109`): kein Verhaltensverlust, kein
Redesign (Farben/Grundraster/`docs/design-system.md`), i18n intakt (keine hartkodierten
Strings), betroffene Text-Query-Tests aktualisiert statt „zufällig grün".

### 0.2 Layout-Schichten heute (gelesen)

- `App.tsx:49-71` — `Dashboard` rendert in dieser Reihenfolge: `DeckSpriteBackground`,
  `Sidebar` (`:53`), `main` mit `pb-16 md:pb-0` (`:55`), `BottomNav` (`:66`),
  `MobileAccountSheet` (`:67`). Alles nur bei aktiver Session (`App.tsx:107-111`).
- `components/layout/Sidebar.tsx:40` — `<aside className="hidden md:flex …">`, d. h. **unterhalb
  `md` gar nicht im DOM-Fluss sichtbar**. Inhalt: Logo (`:42-48`), Nav aus `NAV_ITEMS` (`:51-70`),
  Bottom-Block (`:73-137`) mit **Sync-Button (`:75-93`)**, Sync-Progress/-Error/-Zeitstempel
  (`:95-110`), **Refresh-Button (`:113-123`)**, `lastRefreshed`-Zeile (`:124-126`), `UserMenu`
  (`:128-130`), `LanguageSwitcher` (`:132-134`), `LegalLinks` (`:136`).
  Lokaler State: `syncDone` (`:26`) + `handleSyncMeta` (`:28-37`, 4 s Erfolgs-Feedback).
- `components/layout/BottomNav.tsx:19` — `<nav className="md:hidden fixed bottom-0 …">`,
  Reihenfolge: 2 Nav-Items (`:21-36`), **FAB „Match loggen" (`:40-46`, nur `aria-label`, kein
  sichtbarer Text)**, restliche Nav-Items (`:50-65`), **Vergleichs-Shortcut (`:68-74`)** mit
  `t('nav.comparison')` und `openDeckComparison` — reine Navigation, kein API-Call.
- `components/auth/MobileAccountSheet.tsx` — **der Ort, an den die mobilen Sync-Aktionen wandern**.
  Struktur im Detail: `useTranslation('auth')` (`:32`), lokaler State `open` (`:34`) und
  `showAiSettings` (`:35`), Escape-Handler nur bei `open` (`:37-44`), Guard `if (!session)
  return null` (`:46`), Avatar-Ableitung (`:49-59`), fixer Chip
  `md:hidden fixed top-3 right-3 z-40 rounded-full shadow-pop ring-1 ring-slate-200 bg-white/95`
  (`:63-69`), `createPortal` (`:71-131`) mit Backdrop `md:hidden fixed inset-0 z-50 flex items-end
  justify-center bg-slate-900/50` (`:73-76`) und Panel
  `bg-white border border-slate-200 rounded-t-2xl p-5 w-full max-w-md shadow-card` (`:77-82`,
  `role="dialog" aria-modal="true" aria-labelledby="mobile-account-sheet-title"`,
  `stopPropagation` `:81`), Kopfzeile mit Schließen-Button `common:close` (`:84-98`),
  Nutzer-Zeile (`:100-106`), **KI-Einstellungen-Button (`:108-114`)**, dann
  **`div.flex.items-center.justify-between.border-t.border-slate-200.pt-4`** mit
  `LanguageSwitcher` + Sign-out (`:116-125`), `LegalLinks` (`:127`), `AiSettingsModal` (`:133`).
  **Das Panel hat keine `max-height` und kein `overflow`** — relevant für §5.9.
  Es importiert bereits Komponenten aus `components/layout/` (`LanguageSwitcher`, `LegalLinks`,
  `:6-7`), eine weitere solche Einbindung folgt also einem etablierten Muster.
- `docs/design-system.md` enthält **keine** Breakpoint-/Layout-Konventionen (Gliederung:
  Tokens, Palette, Component classes, Analytical style shift, Accessibility baseline,
  Typography). Relevante harte Vorgaben: `.btn`/`.btn-primary`/`.btn-ghost` ≥ 44 px (`:46`),
  Zielgröße ≥ 44×44 px (`:72`), **`slate-400` ist „decorative only — never for real text"**,
  `slate-500` ist die hellste erlaubte Textfarbe (`:31-32`).
- `docs/architecture.md:285-292` beschreibt den Ist-Zustand explizit: „The desktop `Sidebar` is
  `hidden md:flex`, so any global action it hosts must also be reachable on mobile. **Sync Live
  Meta** therefore lives both in the sidebar and in the **Meta page** header."

### 0.3 Die sechs „neu laden"-Buttons im aktuellen Code (alle nachverifiziert)

| # | Ort | Label-Key | Handler | Wirkungsradius |
|---|---|---|---|---|
| 1 | `Sidebar.tsx:75-93` | `layout:sidebar.syncLiveMeta` | `syncMeta()` | globaler Server-Sync |
| 2 | `Sidebar.tsx:113-123` | `layout:sidebar.refreshData` | `refresh` | Store-Refresh (alle Domänendaten) |
| 3 | `MetaPage.tsx:598-610` | `layout:sidebar.syncLiveMeta` (`ns: 'layout'`) | `handleSync` → `syncMeta()` | **identisch zu 1** |
| 4 | `MatchupMatrix.tsx:363-372` | `meta:matchupMatrix.reload` | `loadData` | nur Matchup-Matrix |
| 5 | `MetaPage.tsx:444-454` | `meta:tournaments.load` | `handleFetch` → `loadRecentTournaments` | nur Turnierliste |
| 6 | `DeckComparisonPanel.tsx:212-226` | `recommendations:comparison.refresh` (bzw. `.compare`, wenn noch kein Ergebnis) | `runDeckComparison` | nur Listen-Vergleich |

Ergänzende, für den Plan wichtige Details:

- **#3 ist wörtlich als Notlösung dokumentiert** (`MetaPage.tsx:555-558`): „that is hidden on
  mobile (`md:flex`) — so the meta page carries its own copy". Drumherum: `handleSync`
  (`:559-565`), Header-Block mit Button + `syncedAt`-Zeile (`:597-617`), **separater
  `aria-live`-Status-Slot (`:620-634`)** für `syncProgress`/`syncError` — der Status-Slot ist
  **kein Button** und hängt nicht am Button, sondern am Store.
- `MetaPage.tsx:483` destrukturiert `syncMeta, isSyncing, syncProgress, syncError, lastSynced`.
  `lastSynced` ist zusätzlich Teil zweier `requestKey`s (`:503`, `:516`) — **darf nicht
  wegfallen**. `Globe` (`MetaPage.tsx:16`) wird **ausschließlich** vom zu entfernenden Button
  benutzt (`:603`) → Import muss mit weg, sonst `lint` rot.
- **#4 hat heute gar kein sichtbares Label**: Icon-Button mit `title` + `aria-label`
  (`MatchupMatrix.tsx:363-372`) und `className="ml-auto text-slate-400 hover:text-brand-700"`.
  Er sitzt in der Fußzeile der Matrix (`flex flex-wrap items-center gap-…`, siehe Kopfzeilen-
  Analogon `:140`). Ein zweiter, davon unabhängiger `loadData`-Button existiert im Fehlerfall
  (`:126-135`) und trägt `common:retry` — der ist **nicht** Teil der sechs und bleibt unberührt.
- **#5** hat einen Ladezustand über `common:loading` (`MetaPage.tsx:453`); der Hilfetext
  `meta:tournaments.emptyHint` **zitiert das Label wörtlich** („Klicke auf \"Laden\", …").
- **#6** wechselt zwischen `comparison.comparing` / `comparison.refresh` / `comparison.compare`
  (`DeckComparisonPanel.tsx:221-225`), je nachdem ob gerade gerechnet wird bzw. ein Ergebnis
  vorliegt. Der Hilfetext `recommendations:comparison.compareHint` zitiert „Vergleichen".

### 0.4 „Match loggen"-Einstiegspunkte (alle nachverifiziert)

- `BottomNav.tsx:40-46` — FAB, `md:hidden` (über den `<nav>`-Wrapper `:19`), `aria-label`
  `layout:bottomNav.logMatch`, öffnet `AddLogModal` (`:77-84`).
- `DeckPage.tsx:234-241` — Header-Button, `deck:page.logMatch`. **Belegt: keine
  Responsive-Klasse** — er ist auch auf Mobile sichtbar, also nicht nur „Desktop-Äquivalent"
  (siehe §5.4). Kommentar zur bisherigen Absicht: `DeckPage.tsx:212-215`.
- `OpponentLog.tsx:78-85` — Empty-State-CTA `opponents:logList.logFirst`.
- `OpponentLog.tsx:193-204` — **Footer-Button** `opponents:logList.logMatch`, nur wenn
  `filtered.length > 0`. Beide öffnen dasselbe lokale `AddLogModal` (`:206-214`).
- **Belegt: `OpponentLog` wird genau einmal gerendert** — `DeckPage.tsx:300-309`, in einer
  `CollapsibleSection` (`defaultOpen={false}`) im Analytics-Abschnitt, mit `chrome="bare"`.
  Damit stimmt die Spec-Begründung („der einzige der vier, der gleichzeitig mit dem
  DeckPage-Header-Button sichtbar ist") mit dem Code überein; es gibt **keine** zweite Seite,
  die durch das Entfernen ihren letzten Log-Einstieg verlöre.
- `opponents:logList.logMatch` wird **nur** an dieser einen Stelle benutzt (`OpponentLog.tsx:201`).

### 0.5 i18n-Setup (gelesen)

- Genau **zwei Sprachen**: `apps/web/src/i18n/locales/{de,en}/` mit je 9 Namespaces
  (`common, layout, overview, deck, meta, opponents, recommendations, auth, legal`),
  statisch importiert und in `resources` gebündelt (`i18n/index.ts:5-51`),
  `fallbackLng: 'en'`, `supportedLngs: ['de','en']`.
- Betroffene Fundstellen (Zeilen in **beiden** Sprachdateien identisch):
  `layout.json:6` `nav.comparison`, `:10` `sidebar.syncLiveMeta`, `:14` `sidebar.refreshData`,
  `:17` `bottomNav.logMatch`; `meta.json:151` `tournaments.load`, `:152` `tournaments.emptyHint`,
  `:174` `matchupMatrix.reload`; `recommendations.json:68` `comparison.compare`,
  `:69` `comparison.refresh`; `opponents.json:143` `logList.logFirst`, `:154` `logList.logMatch`.
- **Es gibt heute keinen i18n-Test** (kein Key-Paritäts- oder Label-Test unter `src/i18n/`).

### 0.6 Bestehende Tests (gelesen, vollständige Liste der 18 `*.test.tsx` geprüft)

- `components/layout/Sidebar.test.tsx` — zählt Buttons **nur im ersten `<nav>`** (`:72-73`) und
  kommentiert ausdrücklich, dass Sync-/Refresh-/UserMenu-Buttons darunter nicht mitgezählt
  werden. **Eine Extraktion des Sync-Blocks in eine Unterkomponente lässt diesen Test unberührt**,
  solange das gerenderte DOM gleich bleibt.
- `components/layout/BottomNav.test.tsx` — die einzige Testdatei, die einen der betroffenen Keys
  referenziert: `:84-132`, jeweils über `i18n.t('layout:nav.comparison')`, **nicht** über ein
  Literal. Auch die Reihenfolge-Assertion `:125-131` ist key-basiert. **Belegt: eine reine
  Wertänderung an `nav.comparison` macht diesen Test nicht rot** — genau deshalb braucht die
  Umbenennung einen eigenen, neuen Test (§3.11), sonst wäre sie „zufällig grün"
  (Akzeptanzkriterium `specs/…:107-109`).
- `pages/DeckPage.test.tsx:174,177,182,222` — Log-Match-Header über `/log match/i`;
  `:190` Abschnitts-Header `/match.log.*2/i`. Der Empty-State/Footer von `OpponentLog` wird
  **nicht** getestet (die Section ist `defaultOpen={false}`).
- `pages/MetaPage.test.tsx` — Store-Mock mit `syncMeta, isSyncing, syncProgress, syncError,
  lastSynced, recentTournaments, isFetchingTournaments, tournamentsError, loadRecentTournaments,
  localMeta, setLocalMeta, archetypeStats` (`:57-75`); keine Assertion auf den Sync-Button.
- `components/recommendations/DeckComparisonPanel.test.tsx:218` — `screen.getByRole('button')`
  **im Singular** (Zustand „nicht eingerichtet"): dort existiert genau ein Button. Die
  Label-Änderung an `comparison.refresh` fügt keinen Button hinzu → bleibt grün.
- `components/auth/UserMenu.test.tsx:1-45` — **das Muster für Session-abhängige Komponenten**:
  `vi.mock('../../lib/authClient', …)` mit `useSession`, dann `vi.mocked(authClient.useSession)`
  und pro Test `mockReturnValue({ data: { user: {…} }, isPending: false, error: null,
  refetch: vi.fn() } as unknown as ReturnType<typeof authClient.useSession>)`.
  `Sidebar.test.tsx:9-16` mockt denselben Client zusätzlich mit `data: null`.
- **Keine** Testdatei existiert für `OpponentLog`, `MatchupMatrix`, `MobileAccountSheet`.
- Grep über alle `*.test.tsx` nach den Literalen „Sync Live Meta", „Refresh Data", „Log Match",
  „Compare", „Reload", „Vergleich", „synchronis": **null Treffer** — die Suite arbeitet
  durchgehend key-basiert bzw. mit Regex auf `deck:page.logMatch`.
- Test-Setup: `apps/web/vitest.config.ts` → `environment: 'jsdom'`, `globals: true`,
  `setupFiles: ['./src/test/setup.ts']`, Include `src/**/*.test.{ts,tsx}` → `createPortal`-basierte
  Komponenten sind testbar, Tests dürfen auch als `.test.ts` (ohne TSX) angelegt werden.

### 0.7 Doku & Gates (gelesen)

- Fundstellen, die den Ist-Zustand „Sync-Button auch im MetaPage-Header" beschreiben und mit
  diesem PR **falsch** würden: `docs/architecture.md:290-292`, `docs/features.md:8,42,60`,
  `docs/data-flow.md:146`, `docs/getting-started.md:134,204`.
- `.claude/hooks/docs-gate.sh` ist real vorhanden und aktiv. Zuordnung:
  `:226-229` `apps/web/src/components/layout/*` → `docs/architecture.md` §Frontend **und**
  `docs/design-system.md` §Component classes; `:208-211` `components/meta/*` →
  `docs/features.md` + `docs/architecture.md`; `:215-217` `components/opponent/*` →
  `docs/features.md` §6 Match Log; `:218-221` `components/auth/*` → `docs/demo-mode.md` +
  `docs/architecture.md`.
  **Wichtig (`:301-308`):** für Pfade unter `apps/web/src/components/` schlägt das Gate **nur bei
  neuen (ungetrackten) oder gelöschten Dateien** an, nicht beim Ändern bestehender. Dieser Plan
  legt nach dem Nachtrag **genau eine** neue Datei unter `components/layout/` an (§5.6).
- Quality-Gates (CLAUDE.md §4): `npm run typecheck`, `npm run lint`, `npm run test`; CI fährt
  zusätzlich `format:check` und `build`.

### 0.8 Was NICHT verifiziert werden konnte

- **Unbekannt:** wie die neuen/geänderten Labels bei 360 px Viewport tatsächlich umbrechen
  (BottomNav-Zelle, DeckComparisonPanel-Header, Matrix-Fußzeile) und wie hoch das
  `MobileAccountSheet` nach der Erweiterung wird (§5.9). Kein Rendering zur Verfügung —
  deshalb steht die visuelle Prüfung als eigener, manueller Schritt in §4 Scheibe G und in
  der DoD, statt behauptet zu werden.
- **Vermutung:** dass niemand außerhalb des Repos (README, Screenshots, `documents/`) die alten
  Labels zitiert — nur `docs/` wurde geprüft.

---

## 1. Summary

Der Plan räumt drei belegte Redundanz-Muster in der Frontend-Aktionsschicht auf, ohne Optik oder
Verhalten zu ändern: (a) die Sync-/Aktualisieren-Aktionen der Desktop-Sidebar werden in eine
gemeinsame Komponente extrahiert und zusätzlich als Menüpunkte im **bestehenden**
`MobileAccountSheet` angeboten — damit sind sie auf jedem Viewport erreichbar, ohne dass ein
neues dauerhaft sichtbares Bedienelement entsteht, und die wortgleiche MetaPage-Kopie entfällt
ersatzlos; (b) die vier verbleibenden, sachlich unterschiedlichen „neu laden"-Buttons bekommen
sichtbare Scope-Labels („Matchup-Daten neu laden", „Turnierliste laden", „Listen-Vergleich
aktualisieren", „Alle Daten neu laden") in beiden Sprachen; (c) der vierte „Match loggen"-Einstieg
(Footer in `OpponentLog`) fällt weg, und der BottomNav-Shortcut heißt navigations-typisch
„Zum Vergleich", damit er nicht mehr mit dem API-auslösenden „Vergleichen" verwechselt wird.
Nutzer sind Konrad selbst (Dogfooding) und Demo-Gäste, die ohne Vorwissen vor sechs ähnlich
benannten Buttons stehen. Kein Handler, keine Store-Action, keine Route und kein Design-Token
wird angefasst.

---

## 2. Betroffene Schichten

Kein Datenmodell, keine Migration, keine Domänen-Logik, keine API. Betroffen sind ausschließlich
Präsentations-Layer, i18n-Ressourcen, Tests und Doku:

- [ ] **Neu (einzige neue Datei):** `apps/web/src/components/layout/SyncControls.tsx` —
      extrahierter Sync-/Refresh-Block (DOM-identisch zu `Sidebar.tsx:74-126`).
- [ ] **Geändert:** `apps/web/src/components/layout/Sidebar.tsx` — rendert `<SyncControls />`
      statt der inline-Buttons; `hidden md:flex` bleibt (Begründung §3.5).
- [ ] **Geändert:** `apps/web/src/components/auth/MobileAccountSheet.tsx` — rendert
      `<SyncControls />` als zusätzlichen Abschnitt im bereits existierenden Sheet (§3.5).
- [ ] **Nicht geändert:** `apps/web/src/App.tsx` — `MobileAccountSheet` ist dort bereits
      eingehängt (`:67`); durch Option B entfällt die im Vorentwurf geplante App-Änderung.
- [ ] **Geändert:** `apps/web/src/pages/MetaPage.tsx` — Sync-Button + `handleSync` + `Globe`-Import
      entfernt, `syncedAt`-Readout bleibt, `aria-live`-Status-Slot bleibt.
- [ ] **Geändert:** `apps/web/src/components/opponent/OpponentLog.tsx` — Footer-Button entfernt.
- [ ] **Geändert:** `apps/web/src/components/meta/MatchupMatrix.tsx` — Icon-Button bekommt
      sichtbaren Text (und damit `slate-500` statt `slate-400`, §3.9).
- [ ] **Geändert (Labels):** `i18n/locales/{de,en}/layout.json`, `…/meta.json`,
      `…/recommendations.json`, `…/opponents.json`. **Keine neuen Keys** (§3.3).
- [ ] **Nicht geändert, aber betroffen:** `components/layout/BottomNav.tsx` — die Umbenennung des
      Shortcuts passiert **rein in `layout.json`**; die Komponente selbst bleibt zeichengleich.
- [ ] **Tests neu:** `i18n/actionLabels.test.ts`, `components/opponent/OpponentLog.test.tsx`,
      `components/auth/MobileAccountSheet.test.tsx`, `components/meta/MatchupMatrix.test.tsx`.
- [ ] **Tests geändert:** `pages/MetaPage.test.tsx` (Assertion „kein Sync-Button mehr"),
      `components/layout/Sidebar.test.tsx` (Regression: Sync/Refresh weiterhin gerendert).
- [ ] **Doku:** `docs/architecture.md`, `docs/features.md`, `docs/data-flow.md`,
      `docs/getting-started.md`, `docs/design-system.md` (§5.6).

---

## 3. Interfaces & Contracts

Diese Sektion ist der Handoff-Vertrag: `tester` schreibt daraus die roten Tests, `implementer`
macht sie grün — beide ohne Rückfrage aneinander.

### 3.1 Label-Kontrakt (exakte Werte, beide Sprachen) — vom Nachtrag unberührt

Werte sind **zeichengenau** so zu setzen; der Test in §3.11-A vergleicht auf Gleichheit.

| Key | DE alt | **DE neu** | EN alt | **EN neu** |
|---|---|---|---|---|
| `layout:nav.comparison` | Vergleich | **Zum Vergleich** | Compare | **To comparison** |
| `layout:sidebar.refreshData` | Daten aktualisieren | **Alle Daten neu laden** | Refresh Data | **Reload all data** |
| `meta:matchupMatrix.reload` | Daten neu laden | **Matchup-Daten neu laden** | Reload data | **Reload matchup data** |
| `meta:tournaments.load` | Laden | **Turnierliste laden** | Load | **Load tournament list** |
| `recommendations:comparison.refresh` | Aktualisieren | **Listen-Vergleich aktualisieren** | Refresh | **Refresh list comparison** |

**Unverändert** (bewusst, mit Begründung):

| Key | Wert | Warum unverändert |
|---|---|---|
| `layout:sidebar.syncLiveMeta` | „Live-Meta synchronisieren" / „Sync Live Meta" | Die Spec listet die Scope-Präfix-Pflicht ausdrücklich nur für „die verbleibenden vier sektionsspezifischen Buttons … sowie die globale ‚Daten aktualisieren'" (`specs/…:150-153`). Nach Entfernen der MetaPage-Kopie ist dieses Label app-weit eindeutig und benennt seinen Radius bereits („Live-Meta"). |
| `recommendations:comparison.compare` | „Vergleichen" / „Compare" | Entscheidung 4 (`specs/…:176-178`). |
| `deck:page.logMatch`, `layout:bottomNav.logMatch`, `opponents:logList.logFirst` | unverändert | Entscheidung 2 betrifft nur die **Anzahl** der Einstiege, nicht deren Benennung. |

**Folgetexte, die ein geändertes Label wörtlich zitieren** (müssen mitwandern, sonst zeigt die
UI auf einen Button, den es nicht mehr gibt):

- `meta:tournaments.emptyHint`
  DE: `Klicke auf "Turnierliste laden", um aktuelle Turniere von Limitless TCG abzurufen.`
  EN: `Click "Load tournament list" to fetch recent tournaments from Limitless TCG.`
- `recommendations:comparison.compareHint` zitiert „Vergleichen"/„Compare" → **unverändert**
  (dieses Label bleibt).

### 3.2 Entfallende Keys

- `opponents:logList.logMatch` (de + en) — einziger Verwender `OpponentLog.tsx:201` entfällt.
  Keine Dead-Keys stehen lassen.

### 3.3 Neue Keys: **keine** (geändert durch den Nachtrag)

Option B braucht **keinen** neuen i18n-Key. Der Vorentwurf hätte für Chip und Sheet-Überschrift
`layout:mobileSync.open`/`.title` gebraucht; beides entfällt:

- Es gibt keinen neuen Trigger — das Sheet wird über den **bestehenden** Account-Chip geöffnet
  (`MobileAccountSheet.tsx:63-69`), dessen `aria-label` (`auth:userMenu.account`) unverändert bleibt.
- Der Sync-Abschnitt im Sheet bekommt **keine eigene Überschrift**: die beiden Buttons tragen
  bereits sprechende, scope-benennende Labels aus §3.1 („Live-Meta synchronisieren", „Alle Daten
  neu laden"). Eine zusätzliche Überschrift wäre neues Markup ohne Informationsgewinn und liefe
  dem Ziel „weniger, nicht mehr Elemente" zuwider.
- `SyncControls` bringt seine Labels über `useTranslation('layout')` selbst mit; dass das Sheet
  im `auth`-Namespace lebt (`MobileAccountSheet.tsx:32`), ist unerheblich — es bindet mit
  `LanguageSwitcher`/`LegalLinks` (`:6-7`) heute schon Komponenten mit eigenem Namespace ein.

### 3.4 `SyncControls` (neu) — `components/layout/SyncControls.tsx`

```ts
export function SyncControls()
```

- **Keine Props.** Liest selbst aus `useDashboardStore()`:
  `refresh, isLoading, lastRefreshed, syncMeta, isSyncing, syncProgress, lastSynced, syncError`.
- Hält den lokalen State `syncDone` und `handleSyncMeta` **unverändert übernommen** aus
  `Sidebar.tsx:26-37` (inkl. 4000-ms-Timeout und geschlucktem `catch`).
- Gibt ein **Fragment** zurück, dessen Kinder **zeichengleich** zu `Sidebar.tsx:74-126` sind
  (Sync-Button, Progress-Zeile, Error-Zeile, `syncedAt`-Zeile, Refresh-Button,
  `lastRefreshed`-Zeile) — gleiche Klassen, gleiche Icons, gleiche i18n-Keys, gleiche
  `disabled`-Bedingungen. Kein neues Markup, kein Wrapper-Element (der `space-y-2`-Container
  bleibt beim jeweiligen Aufrufer).
- **Damit gelten Busy-/Erfolgs-/Fehlerzustände im Sheet automatisch identisch zur Sidebar**:
  `disabled={isSyncing || isLoading}` bzw. `disabled={isLoading}`, `sidebar.syncing`/
  `sidebar.synced`-Labelwechsel, `animate-pulse`/`animate-spin`, `syncProgress`-Zeile,
  `syncError`-Zeile, `syncedAt`- und `lastRefreshed`-Zeitstempel. Es gibt keine zweite
  Implementierung, die driften könnte — genau der Punkt der Extraktion.
- Kein expliziter Rückgabetyp — die umgebenden Komponenten (`Sidebar`, `BottomNav`,
  `MobileAccountSheet`) deklarieren auch keinen (`.claude/rules/code-style.md`: „Neuer Code liest
  sich wie der umgebende"); die TS-Inferenz deckt es ab, `typecheck` bleibt aussagekräftig.

### 3.5 Mobiler Zugang — Erweiterung von `MobileAccountSheet` (Option B, entschieden)

**Kein neuer Chip, keine neue Komponente, kein `App.tsx`-Eingriff.** Geändert wird ausschließlich
`components/auth/MobileAccountSheet.tsx`:

| Aspekt | Festlegung |
|---|---|
| Import | `import { SyncControls } from '../layout/SyncControls';` (Muster: `LanguageSwitcher`/`LegalLinks`, `:6-7`) |
| Einfügeort | **zwischen** dem KI-Einstellungen-Button (`:108-114`) und dem `border-t`-Block mit `LanguageSwitcher` + Sign-out (`:116-125`) |
| Markup | genau ein Wrapper: `<div className="border-t border-slate-200 pt-4 mb-3 space-y-2"><SyncControls /></div>` — `border-t`/`pt-4` sind exakt die Klassen, die der bestehende Abschnitt darunter benutzt (`:116`), `space-y-2` ist der Abstand aus dem Sidebar-Container (`Sidebar.tsx:73`). **Keine neuen Farben, keine neuen Radien, keine neuen Größen.** |
| Trigger | unverändert der bestehende Account-Chip (`:63-69`) |
| Öffnen/Schließen | unverändert (`open`-State `:34`, Escape `:37-44`, Backdrop `:74`, Schließen-Button `:91-97`) |
| Sichtbarkeit | unverändert `md:hidden` — ab `md` übernimmt die Sidebar |
| Session-Guard | unverändert `if (!session) return null` (`:46`); die Sync-Aktionen sind ohnehin nur mit Session sinnvoll (Store lädt nur mit Session, `App.tsx:26-30`) |
| Zustände | vollständig aus `SyncControls` (§3.4) — identisch zur Sidebar, per Konstruktion |

**Begründung der Entscheidung** (Konrad, siehe Nachtrag; die zuvor vom Planner empfohlene
Chip-Variante ist damit verworfen):

| Option | Bewertung |
|---|---|
| **B (gewählt): Sync-Aktionen im bestehenden `MobileAccountSheet`** | Erfüllt die bindende Spec-Anforderung („Sync-/Aktualisieren-Aktionen auf jedem Viewport erreichbar", `specs/…:146-149`) **ohne ein einziges zusätzliches dauerhaft sichtbares Element**. Das ist die einzige Option, die das übergeordnete Spec-Ziel („Anzahl gleichzeitig sichtbarer Aktionen minimieren") nicht relativiert. Kosten: ein zusätzlicher Tap (Chip → Sheet → Aktion) — akzeptiert. Nebeneffekt: die Kollisionsprüfung „zwei schwebende Chips" entfällt ersatzlos (§4 Scheibe G). |
| A (verworfen): eigener Sync-Chip neben dem Account-Chip | Ein Tap weniger, aber ein zweites permanentes Overlay-Element auf **jeder** Mobile-Seite plus Überlappungsrisiko im rechten oberen Band. |
| C (verworfen): gesamte `Sidebar` als Off-Canvas-Drawer | Würde auf Mobile Nav-Items doppeln (`BottomNav`) und `UserMenu` **zusätzlich zu** `MobileAccountSheet` erreichbar machen — genau deren Nie-gleichzeitig-Sichtbarkeit ist die Begründung, mit der die Spec diese Duplikation aus dem Scope nimmt (`specs/…:129-130`). |

**Semantik-Hinweis (bewusst akzeptiert):** Datenaktionen unter einem „Konto"-Einstieg sind nicht
die naheliegendste Zuordnung. Abgemildert wird das dadurch, dass das Sheet faktisch schon heute
das mobile Gegenstück zum **gesamten** Sidebar-Fuß ist (Sprache, Legal, Sign-out, KI-Einstellungen
— `MobileAccountSheet.tsx:108-127` vs. `Sidebar.tsx:128-136`); Sync/Refresh sind der letzte
fehlende Teil desselben Fußbereichs, nicht ein fachfremder Neuzugang. Dokumentiert wird das in
`docs/architecture.md` (§4 Scheibe F).

### 3.6 `Sidebar` (geändert) — `components/layout/Sidebar.tsx`

- Ersetzt `:74-126` durch `<SyncControls />`; der umschließende
  `div.p-4.border-t.border-slate-200.space-y-2` (`:73`) und alles darunter (`UserMenu`,
  `LanguageSwitcher`, `LegalLinks`, `:128-136`) bleiben unverändert.
- `useState`/`syncDone`/`handleSyncMeta` und die nur dafür genutzten Store-Felder und Icon-Imports
  (`RefreshCw`, `Globe`, `CheckCircle2`, `AlertCircle`) wandern nach `SyncControls`; die
  Destrukturierung in `Sidebar` behält nur `activeTab`/`setActiveTab`.
- `hidden md:flex` (`:40`) **bleibt** (§3.5).
- **Vertragsbedingung:** Das gerenderte DOM der Sidebar bleibt bei gleichem Store-State
  identisch — `Sidebar.test.tsx` muss ohne Anpassung grün bleiben.

### 3.7 `MetaPage` (Entfall) — `pages/MetaPage.tsx`

- **Entfällt:** der `<button>` samt `Globe`-Icon (`:598-610`) und `handleSync` (`:559-565`) sowie
  der erklärende Kommentar (`:555-558`); `Globe` aus dem Icon-Import (`:16`); `syncMeta` aus der
  Destrukturierung (`:483`).
- **Bleibt:** die `syncedAt`-Zeile (`:611-616`) — ein **Readout**, keine Aktion; sie wandert aus
  dem entfallenden `div.flex.flex-col.items-end` (`:597`) in dessen Position im Header-Flexrow
  (rechtsbündig, gleiche Klassen `min-h-[0.9rem] text-[11px] text-slate-500`).
  Begründung: „Kein Verhaltensverlust" schützt Aktionen; ein Informationsverlust („wann wurde
  zuletzt synchronisiert") wäre trotzdem eine unnötige Verschlechterung genau auf der Seite, wo
  die Sync-Daten landen.
- **Bleibt unverändert:** der `aria-live`-Status-Slot (`:620-634`) inkl.
  `isSyncing`/`syncProgress`/`syncError` — er zeigt Fortschritt auch dann, wenn der Sync aus dem
  (inzwischen geschlossenen) Account-Sheet gestartet wurde. Mit Option B ist das der einzige
  globale Fortschrittsanzeiger auf Mobile, siehe §5.8.

### 3.8 `OpponentLog` (Entfall) — `components/opponent/OpponentLog.tsx`

- **Entfällt:** der komplette Footer-Block `:193-204` (Bedingung `filtered.length > 0`, Wrapper-
  `div` und Button) samt Kommentar.
- **Bleibt:** Empty-State-CTA (`:78-85`), `showModal`-State, `AddLogModal` (`:206-214`),
  `MatchDetailModal`, Delete-Buttons, `Plus`-Import (weiterhin vom Empty-State genutzt).
- Props-Signatur (`:25-33`, `:47`) unverändert.

### 3.9 `MatchupMatrix` (sichtbares Label) — `components/meta/MatchupMatrix.tsx:363-372`

Aus dem Icon-only-Button wird ein Icon-plus-Text-Button an derselben Stelle, in derselben
Fußzeile, mit derselben `ml-auto`-Ausrichtung:

- Klassen: `ml-auto flex items-center gap-1 text-slate-500 hover:text-brand-700 transition-colors`.
- Kinder: `<RefreshCw className="w-3 h-3" aria-hidden="true" />` + `<span>{t('matchupMatrix.reload')}</span>`.
- `title` und `aria-label` entfallen — der zugängliche Name kommt jetzt aus dem Textinhalt
  (kein doppelter Name, keine Tooltip-Abhängigkeit; genau der Punkt von Entscheidung 3).
- **Farbwechsel `slate-400` → `slate-500` ist Pflicht, kein Geschmack:** `docs/design-system.md:31-32`
  erlaubt `slate-400` ausdrücklich nur dekorativ und nie für echten Text. Das ist kein Redesign,
  sondern die Einhaltung des bestehenden Design-Systems für neu sichtbaren Text.
- `onClick={loadData}` unverändert. Der Fehlerfall-Button (`:126-135`, `common:retry`) bleibt
  unangetastet.

### 3.10 Was ausdrücklich NICHT geändert wird

- **Kein neues schwebendes Bedienelement, kein zweiter Chip, keine `MobileSyncSheet`-Komponente**
  (Nachtrag/Option B). `App.tsx` bleibt unverändert.
- Keine Store-Action, kein Handler, keine Signatur, kein API-Aufruf, kein Response-Shape.
- Keine Farbtokens, keine `index.css`-Klassen, kein Grundraster, keine neue Komponentenbibliothek.
- `BottomNav.tsx` bleibt zeichengleich (die Umbenennung ist reine JSON-Arbeit).
- Am `MobileAccountSheet` bleiben Trigger, Öffnen/Schließen-Logik, Account-Zeile, KI-Einstellungen,
  Sprache, Sign-out und Legal-Links unangetastet — es kommt genau ein Abschnitt hinzu.
- `AddCardModal.tsx` (toter Code) und die `UserMenu`/`MobileAccountSheet`-Duplikation bleiben
  unangetastet (`specs/…:127-130`).
- Keine neue Aktion, kein neuer Tab, keine Änderung an der Informationsarchitektur.

### 3.11 Test-Kontrakt (das ist die Rot-Liste für `tester`)

**A) `apps/web/src/i18n/actionLabels.test.ts` (neu)** — Quelle: `export const resources` aus
`i18n/index.ts:27`. Rein datenbasiert, kein Rendering.

| # | Fall | Erwartung |
|---|---|---|
| A1 | Für `de` und `en`: jeder Key aus der Tabelle §3.1 | exakter Gleichheitsvergleich mit dem Soll-Wert |
| A2 | Reload-Gruppe je Sprache: `layout:sidebar.syncLiveMeta`, `layout:sidebar.refreshData`, `meta:matchupMatrix.reload`, `meta:tournaments.load`, `recommendations:comparison.refresh` | **paarweise verschieden** (Set-Größe = 5) |
| A3 | `layout:nav.comparison` ≠ `recommendations:comparison.compare` je Sprache | verschieden (heute in `en` **identisch** „Compare" → dieser Fall ist von Anfang an rot) |
| A4 | `meta:tournaments.emptyHint` enthält den Wert von `meta:tournaments.load` | wahr (Zitat-Konsistenz, §3.1) |
| A5 | `de` und `en` haben in allen 9 Namespaces **denselben Key-Baum** (rekursiver Vergleich) | gleich — fängt vergessene Zweitsprachen-Pflege ab, jetzt und künftig |

**B) `components/opponent/OpponentLog.test.tsx` (neu)** — Store-Mock nach dem Muster von
`Sidebar.test.tsx:33-35` (`refresh`, `decks`), `i18n.changeLanguage('en')` in `beforeAll`.

| # | Fall | Erwartung |
|---|---|---|
| B1 | `logs: []` | genau **ein** Button mit Name `opponents:logList.logFirst` |
| B2 | `logs: [zwei Einträge]` | **kein** Button, dessen Name `deck:page.logMatch`/`opponents:logList.logFirst` bzw. das alte „Log Match" trägt; die Delete-Buttons (`common:delete`) bleiben |
| B3 | `logs: []` + Klick auf den CTA | `AddLogModal` erscheint (Dialog/Formular sichtbar) — Beleg, dass der verbleibende Einstieg funktioniert |
| B4 | `logs: [zwei Einträge]` | die Tabelle rendert weiterhin beide Zeilen (kein Kollateralschaden am Footer-Entfall) |

**C) `pages/MetaPage.test.tsx` (ergänzt)**

| # | Fall | Erwartung |
|---|---|---|
| C1 | MetaPage gerendert | **kein** Button mit Name `layout:sidebar.syncLiveMeta` |
| C2 | Store-Mock mit `lastSynced: new Date(...)` | der `syncedAt`-Text ist weiterhin im Dokument |
| C3 | Turnier-Sektion | Button mit Name `meta:tournaments.load` existiert (nach §3.1 also „Load tournament list") |

**D) `components/auth/MobileAccountSheet.test.tsx` (neu)** — geändert durch den Nachtrag: getestet
wird das **erweiterte bestehende Sheet**, nicht mehr eine eigene Komponente.
Mocks: `../../lib/authClient` mit angemeldeter Session nach dem Muster `UserMenu.test.tsx:8-45`
(**zwingend** — ohne Session rendert die Komponente `null`, `MobileAccountSheet.tsx:46`) und
`../../store/dashboardStore` nach dem Muster `Sidebar.test.tsx:33-35` mit
`syncMeta, refresh, isLoading, isSyncing, syncProgress, syncError, lastSynced, lastRefreshed`.

| # | Fall | Erwartung |
|---|---|---|
| D1 | initial (Sheet geschlossen) | Trigger mit `aria-label` = `auth:userMenu.account` vorhanden; **kein** `role="dialog"`; **kein** Button mit Name `layout:sidebar.syncLiveMeta` oder `layout:sidebar.refreshData` |
| D2 | Klick auf den Trigger | `role="dialog"` erscheint und enthält Buttons mit Namen `layout:sidebar.syncLiveMeta` **und** `layout:sidebar.refreshData` |
| D3 | Klick auf Sync im Sheet | `syncMeta` genau einmal aufgerufen |
| D4 | Klick auf Refresh im Sheet | `refresh` genau einmal aufgerufen |
| D5 | `Escape` bei offenem Sheet | Dialog verschwindet |
| D6 | offenes Sheet, Store mit `isSyncing: true` | der Sync-Button ist `disabled` und trägt das Label `layout:sidebar.syncing` — Beleg, dass die Busy-Zustände der Sidebar 1:1 gelten (§3.4) |
| D7 | offenes Sheet (Regression) | Account-Zeile, KI-Einstellungen-Button (`auth:aiSettings.title`) und Sign-out (`auth:userMenu.signOut`) sind weiterhin vorhanden; **kein** Button mit einem `NAV_ITEMS`-Label (Abgrenzung zur `BottomNav`) |

**E) `components/layout/Sidebar.test.tsx` (ergänzt, Regressionsschutz für die Extraktion)**

| # | Fall | Erwartung |
|---|---|---|
| E1 | Sidebar gerendert | Buttons mit Namen `layout:sidebar.syncLiveMeta` und `layout:sidebar.refreshData` vorhanden |
| E2 | Klick auf Sync | `syncMeta` genau einmal aufgerufen (die bestehenden drei Nav-Tests bleiben unverändert und müssen grün bleiben) |

**F) `components/meta/MatchupMatrix.test.tsx` (neu, minimal)** — die Komponente lädt in einem
Effekt über `lib/api` (`getMetaMatchups`); der Test mockt `../../lib/api` nach dem Muster von
`MetaPage.test.tsx:78-84` mit einer leeren, aber gültigen Antwort.

| # | Fall | Erwartung |
|---|---|---|
| F1 | geladener Zustand | ein Button, dessen **sichtbarer Textinhalt** `meta:matchupMatrix.reload` enthält (`toHaveTextContent`) — nicht nur `aria-label`/`title` |
| F2 | Klick darauf | ein erneuter `getMetaMatchups`-Aufruf (Handler unverändert wirksam) |

> Falls sich F beim Schreiben als unverhältnismäßig aufwendig erweist (viele Store-/API-Mocks für
> einen Ein-Zeilen-Kontrakt), ist das **offen zu benennen** (`.claude/rules/tdd.md`, „ehrlich
> berichten") — dann übernimmt A1 den Label-Vertrag und F reduziert sich auf F1. Stillschweigend
> weglassen ist nicht erlaubt.

---

## 4. Umsetzungsreihenfolge (test-first, Scheibe für Scheibe)

Jede Verhaltens-Scheibe ist **erst rot** (`tester`), **dann grün** (`implementer`); der
`implementer` bestätigt vor dem Grün-Machen den gemeldeten Rot-Grund
(`.claude/rules/tdd.md`, Schritt 2). Die Reihenfolge ist so gewählt, dass **kein
Zwischenstand eine Aktion unerreichbar macht** — insbesondere kommt der mobile Zugang
(Scheibe D) **vor** dem Entfernen des MetaPage-Buttons (Scheibe E).

**Schritt 0 — Vorbereitung.**

```bash
git -C /Users/charliekonni/Softwareentwicklung/Pokekon switch -c feat/ui-ux-button-consolidation
npm run test    # Baseline gruen, bevor irgendetwas rot gemacht wird
```

Code-schreibende Subagents laufen laut `.claude/rules/worktrees.md` standardmäßig mit
`isolation: "worktree"`; die Scheiben hier sind sequenziell abhängig (gemeinsame Locale-Dateien),
echte Parallelität ist erst ab Scheibe D/F gegeben (disjunkte Dateien).

**Scheibe A — Label-Kontrakt in beiden Sprachen (Rot: A1–A5).**
1. `tester`: `apps/web/src/i18n/actionLabels.test.ts` mit den Fällen A1–A5 aus §3.11.
   Rot-Grund: alte Werte, und `en` hat „Compare" doppelt (A3).
2. `implementer`: `i18n/locales/{de,en}/{layout,meta,recommendations}.json` nach §3.1 anpassen
   (inkl. `tournaments.emptyHint`). **Keine neuen Keys** (§3.3). Grün.
   Danach `npx prettier --check apps/web/src/i18n/locales` (JSON wird von `format:check` erfasst).
   **Kein `.tsx` wird hier angefasst** — `BottomNav`, `Sidebar`, `MetaPage`,
   `DeckComparisonPanel` übernehmen die neuen Texte allein über ihre bestehenden `t()`-Aufrufe.

**Scheibe B — Matchup-Reload bekommt ein sichtbares Label (Rot: F1–F2).**
3. `tester`: `components/meta/MatchupMatrix.test.tsx` (F1, F2). Rot: Button ist icon-only,
   `toHaveTextContent` schlägt fehl.
4. `implementer`: `MatchupMatrix.tsx:363-372` nach §3.9. Grün.

**Scheibe C — vierter „Match loggen"-Einstieg entfällt (Rot: B1–B4).**
5. `tester`: `components/opponent/OpponentLog.test.tsx` (B1–B4). Rot bei B2 (Footer existiert).
6. `implementer`: `OpponentLog.tsx:193-204` entfernen, `opponents:logList.logMatch` in **beiden**
   Sprachdateien löschen. Grün. `pages/DeckPage.test.tsx` muss unverändert grün bleiben
   (`:174,177,182,190,222`) — sie testen den Header-Button, nicht den Footer.

**Scheibe D — Sync-/Refresh-Aktionen auf jedem Viewport (Rot: D1–D7, E1–E2).**
*(Durch den Nachtrag: Erweiterung des bestehenden Sheets statt neuer Komponente.)*
7. `tester`: `components/auth/MobileAccountSheet.test.tsx` (D1–D7) neu anlegen — mit
   Session-Mock nach `UserMenu.test.tsx:8-45` **und** Store-Mock nach `Sidebar.test.tsx:33-35`;
   dazu die Ergänzung E1–E2 in `components/layout/Sidebar.test.tsx`.
   Rot: D2–D4, D6 (im Sheet existieren die Sync-Buttons noch nicht). **D1, D7, E1, E2 sind von
   Anfang an grün** und dienen ausdrücklich als Regressionsnetz (Extraktion bzw. „Sheet-Inhalt
   bleibt sonst gleich") — das ist im Testkommentar zu vermerken und **nicht** als Rot zu melden.
8. `implementer`: `components/layout/SyncControls.tsx` (§3.4) extrahieren, `Sidebar.tsx` auf
   `<SyncControls />` umstellen (§3.6), `MobileAccountSheet.tsx` nach §3.5 um genau einen
   Abschnitt erweitern (Import + ein `div` zwischen `:114` und `:116`). **`App.tsx` bleibt
   unangetastet.** Grün — inklusive der drei **unveränderten** Sidebar-Nav-Tests
   (`Sidebar.test.tsx:56-96`).

**Scheibe E — MetaPage-Duplikat entfällt (Rot: C1–C3).**
9. `tester`: `pages/MetaPage.test.tsx` um C1–C3 ergänzen. Rot bei C1.
10. `implementer`: `MetaPage.tsx` nach §3.7 (Button + `handleSync` + `Globe`-Import + `syncMeta`
    raus, `syncedAt`-Readout und Status-Slot bleiben). Grün.
    `npm run lint` hier zwingend zwischendurch — ungenutzte Imports/Variablen sind der
    wahrscheinlichste Fehler dieser Scheibe.

**Scheibe F — Doku (Golden Rule 7 + docs-gate, §5.6).**
11. `docs/architecture.md:290-292` neu schreiben: die Sidebar bleibt `hidden md:flex`; ihr
    Fußbereich hat auf Mobile sein Gegenstück im `MobileAccountSheet`, das jetzt auch die
    globalen Datenaktionen (Sync/Refresh) trägt; die MetaPage hält keine eigene Kopie mehr.
    Die gemeinsame Quelle beider Darstellungen (`SyncControls`) hier benennen.
12. `docs/features.md:8,42,60` (Live-Meta-Sync-Trigger + Progress-Feedback) und `:425`
    (Cold-Start-Hinweis) auf den neuen Weg umstellen: „Sidebar (Desktop) / Account-Sheet (Mobile)".
13. `docs/data-flow.md:146` und `docs/getting-started.md:134,204` analog — statt „Meta page
    header on mobile" jetzt „über den Account-Chip oben rechts → Sheet".
14. `docs/design-system.md`: eine ehrliche, inhaltliche Ergänzung — dass neu sichtbarer Text nie
    `slate-400` benutzt (§3.9) und dass geteilte Aktionsblöcke (Beispiel `SyncControls`) für
    Desktop-Sidebar und mobiles Sheet **eine** Quelle haben. **Nur** wenn dort sachlich nichts zu
    sagen wäre, gilt der dokumentierte Override (`rm .git/claude-docs-dirty`) — nicht das
    Anfassen der Datei zum Zähler-Befriedigen (`docs/agents.md`/CLAUDE.md §4).

**Scheibe G — manuelle visuelle Verifikation (nicht automatisierbar, §0.8).**
*(Der Punkt „Kollision zweier schwebender Chips" aus dem Vorentwurf **entfällt ersatzlos** — es
gibt nur den einen, unveränderten Account-Chip. An seine Stelle tritt die Höhenprüfung des
Sheets, §5.9.)*
15. `npm run dev`, Browser auf 360 × 740 (DevTools-Mobile) mit Demo-Account:
    - **Account-Sheet bei laufendem und bei fehlgeschlagenem Sync:** passt der Inhalt (zwei
      zusätzliche Buttons + bis zu drei Statuszeilen) noch auf den Schirm, oder rutschen
      Sign-out/Legal-Links aus dem Viewport? Gegenprobe auf 360 × 640 (§5.9).
    - Sync aus dem Sheet starten: Button wird `disabled`, Label wechselt auf „Syncing…",
      Fortschrittstext erscheint **im Sheet**; Sheet schließen → MetaPage-`aria-live`-Slot
      übernimmt die Anzeige (§5.8).
    - BottomNav: bricht „Zum Vergleich"/„To comparison" um? Bleibt die Leiste bedienbar,
      bleiben alle Ziele ≥ 44 px (`docs/design-system.md:72`)?
    - DeckComparisonPanel-Header mit dem längeren Label: kein Überlauf.
    - Matrix-Fußzeile mit sichtbarem Reload-Text: kein Umbruchchaos.
16. Desktop ≥ 1280 px: Sidebar optisch unverändert (Screenshot-Vergleich gegen `main` genügt).

**Scheibe H — Gates + Review + PR.**

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

17. `code-review-agent` (CLAUDE.md §3) — Fokus: keine hartkodierten Strings, DOM-Gleichheit der
    Sidebar, keine verwaisten i18n-Keys. `security-agent` ist **nicht** nötig: kein neues
    User-Input-Processing, kein neuer externer Call (CLAUDE.md §3).
18. PR auf Deutsch mit Testschritten (inkl. der Mobile-Checkliste aus Scheibe G), Merge nur mit
    grüner CI (`.claude/rules/git-and-commits.md`).

**Commit-Messages (Conventional Commits, ein logischer Schritt pro Commit):**

```
test(i18n): pin scope-prefixed action labels for de and en

Goal: Rot-Zustand fuer den Label-Kontrakt aus Plan §3.1.
Why:  Die bestehende Suite fragt Labels ueber Keys ab — eine Umbenennung waere
      sonst "zufaellig gruen" (Spec-Akzeptanzkriterium :107-109).
How:  apps/web/src/i18n/actionLabels.test.ts mit Soll-Werten, Eindeutigkeits-
      und de/en-Paritaetspruefung.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```
feat(i18n): name the scope of every reload-style action

Goal: Sechs aehnlich benannte Buttons werden an ihrem Wirkungsradius erkennbar.
Why:  Spec ui-ux-button-consolidation §1 — Nutzer koennen den Radius sonst nur
      im Quellcode nachlesen; Tooltips scheiden auf Touch aus (Entscheidung 3).
How:  layout/meta/recommendations.json in de+en: "Alle Daten neu laden",
      "Matchup-Daten neu laden", "Turnierliste laden", "Listen-Vergleich
      aktualisieren", "Zum Vergleich"; emptyHint-Zitat nachgezogen.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```
feat(auth): offer sync and refresh inside the mobile account sheet

Goal: Die globalen Datenaktionen der Sidebar sind auf jedem Viewport erreichbar.
Why:  Spec-Entscheidung 1 (Option c) — die MetaPage-Kopie existiert nur, weil die
      Sidebar mobil fehlt; Konrad hat Option B gewaehlt, damit dafuer KEIN
      zweites dauerhaft sichtbares Element entsteht.
How:  Sync-/Refresh-Block als SyncControls extrahiert (eine Quelle fuer Sidebar
      und Sheet, identische Busy-/Fehlerzustaende) und als eigener Abschnitt im
      bestehenden MobileAccountSheet gerendert.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

```
test(meta): require a visible label on the matchup reload control
feat(meta): give the matchup reload button a visible scope label
test(opponents): pin the match-log entry points in the log list
refactor(opponents): drop the redundant footer "log match" button
test(auth): cover sync and refresh in the mobile account sheet
test(meta): assert the meta page no longer duplicates the sync button
refactor(meta): remove the duplicated live meta sync button
docs(ui): describe the mobile entry point for global data actions
```

(Die acht Kurzformen oben stehen für je einen eigenen Commit mit Goal/Why/How-Body im selben
Muster wie die drei ausgeschriebenen; jeweils mit `Co-Authored-By`-Zeile.)

---

## 5. Risiken & offene Fragen

### 5.1 Entschieden (war offene Frage): mobiler Zugang ohne zweites Dauerelement

**Entscheidung Konrads vom 2026-09-07: Option B** — Sync/Refresh als Menüpunkte im bestehenden
`MobileAccountSheet`; kein zweiter schwebender Chip, keine neue Sheet-Komponente.
Begründung: ein weiteres dauerhaft sichtbares UI-Element auf jeder Mobile-Seite widerspräche dem
Spec-Ziel „Anzahl gleichzeitig sichtbarer Aktionen minimieren", auch wenn es das
Erreichbarkeitsproblem technisch löst. **Bewusst akzeptierte Kosten:** ein zusätzlicher Tap
(Chip → Sheet → Aktion) und die semantisch nicht ideale Zuordnung „Datenaktion unter Konto"
(abgemildert, §3.5).

**Was dadurch wegfällt:** das Überlappungsrisiko im rechten oberen Band (zwei Chips) und damit
der entsprechende Pflicht-Check der Scheibe G; die neue Datei `MobileSyncSheet.tsx`; die
`App.tsx`-Änderung; die beiden Keys `layout:mobileSync.*`.
**Offene Fragen zu diesem Punkt: keine.**

### 5.2 Label-Länge auf schmalen Viewports

- `layout:nav.comparison` → „Zum Vergleich" (13 Zeichen) in einer `text-[11px]`-Zelle von rund
  einem Fünftel der Bildschirmbreite (`BottomNav.tsx:68-74`): sehr wahrscheinlich **zweizeilig**.
  Die Zelle ist `flex-col … min-h-[56px]`, wächst also mit — die Leiste wird um wenige Pixel
  höher, `main` hat `pb-16` (`App.tsx:55`). **Vermutung: unkritisch**, aber genau deshalb ist
  Scheibe G Schritt 15 verpflichtend. Fällt es durch, ist die kleinste Korrektur ein kürzeres
  Label (z. B. DE „Vergleichsseite"), **nicht** eine Klassenänderung am Grundraster.
- `recommendations:comparison.refresh` → „Listen-Vergleich aktualisieren" in einem
  `btn-primary text-xs` im Header-Flexrow (`DeckComparisonPanel.tsx:212-226`): der Header ist
  `flex … justify-between`, der Button `shrink`t nicht explizit — Umbruchprüfung in Scheibe G.

### 5.3 Kein Verhaltensverlust — Nachweis je entfernter Aktion

| Entfernt | Bleibt erreichbar über |
|---|---|
| MetaPage-Sync (`MetaPage.tsx:598-610`) | Desktop: `Sidebar` (`:75-93`). Mobil: Account-Chip → Sheet (§3.5) — **erstmals** ist dort auch `refresh` erreichbar, das mobil bisher gar keinen Einstieg hatte. |
| OpponentLog-Footer (`:193-204`) | DeckPage-Header (`DeckPage.tsx:234-241`, auf **allen** Viewports), FAB (mobil), Empty-State-CTA (bei leerer Liste). Da `OpponentLog` nur in `DeckPage.tsx:300-309` gerendert wird, ist der Header-Button immer auf demselben Screen. |
| `opponents:logList.logMatch` | Key entfällt mit seinem einzigen Verwender — kein anderer Aufruf existiert (§0.4). |

Zusatz zu Zeile 1: mobil kostet Sync jetzt **zwei** Taps statt einem (Chip, dann Button).
Erreichbarkeit im Sinne des Akzeptanzkriteriums bleibt gegeben; die Verlangsamung ist die
bewusst gewählte Gegenleistung für „kein zusätzliches Dauerelement" (§5.1).

### 5.4 Beobachtung (kein Handlungsbedarf, aber offen benannt)

Die Spec begründet den DeckPage-Header-Button als „Desktop-Äquivalent" zum FAB
(`specs/…:155-156`). **Belegt ist etwas anderes:** `DeckPage.tsx:234-241` trägt keine
Responsive-Klasse, ist also auch mobil sichtbar — auf der DeckPage stehen mobil danach weiterhin
FAB **und** Header-Button gleichzeitig. Das ist nach Entscheidung 2 ausdrücklich gewollt (drei
Einstiege bleiben), aber die Prämisse in der Spec-Begründung stimmt nicht ganz. Ich ändere
daran nichts — die Entscheidung ist bindend; der Punkt gehört nur nicht unbemerkt unter den
Tisch. Wenn du mobil nur den FAB willst, ist das ein Ein-Klassen-Zusatz (`hidden md:flex`) und
ein weiterer Slice, kein Umbau.

### 5.5 Extraktion von `SyncControls` — die eigentliche Regressionsgefahr

Die Sidebar-Optik hängt an Klassen, die im Bottom-Block über `space-y-2` des Elterncontainers
wirken (`Sidebar.tsx:73`). Wird beim Extrahieren ein zusätzliches Wrapper-`div` eingezogen,
kippt das Abstandsverhalten (`space-y` wirkt nur auf direkte Kinder) — **optische Änderung
trotz „kein Redesign"**. Vertragsseitig ausgeschlossen (§3.4: Fragment, kein Wrapper); im Sheet
liefert der eigene Wrapper `space-y-2` (§3.5) denselben Rhythmus. Prüfung: `Sidebar.test.tsx`
bleibt unverändert grün **und** Scheibe G Schritt 16 (Desktop-Screenshot).

### 5.6 Docs-Gate — jetzt nur noch eine neue Datei

`.claude/hooks/docs-gate.sh:301-308` markiert Komponenten-Pfade nur bei **neuen/gelöschten**
Dateien. Nach dem Nachtrag ist `SyncControls.tsx` die **einzige** neue Datei; sie liegt unter
`components/layout/` und löst laut `:226-229` Doku-Bedarf in `docs/architecture.md` **und**
`docs/design-system.md` aus. Die Änderung an `MobileAccountSheet.tsx` löst **nichts** aus (die
Datei ist getrackt) — die dort fällige Doku-Arbeit ergibt sich aus Golden Rule 7, nicht aus dem
Gate, und ist in Scheibe F trotzdem eingeplant. Praktische Folge für den `implementer`: Doku
vorziehen oder die Doku-Commits vor dem Feature-Commit setzen — der Marker überlebt
Branch-Wechsel.

### 5.7 Produktionsdaten / Irreversibles

Keine. Kein Schema, keine Migration, kein Backfill, kein Server-Pfad. Die einzige serverwirksame
Aktion (`syncMeta` → globaler Meta-Sync) behält Handler und Auslösebedingung unverändert; sie
wird mobil lediglich über einen anderen Button erreicht. Ein Merge auf `main` löst einen
normalen Railway-Deploy des Web-Bundles aus.

### 5.8 Sync-Feedback auf Mobile bei geschlossenem Sheet

Mit Option B gibt es mobil **kein** dauerhaft sichtbares Busy-Signal mehr (der verworfene Chip
hätte ein `animate-spin` tragen können). Belegte Abfederung: solange das Sheet offen ist, zeigt
`SyncControls` Fortschritt, Fehler und Zeitstempel vollständig (§3.4); schließt der Nutzer das
Sheet, übernimmt auf der MetaPage der bestehende `aria-live`-Status-Slot
(`MetaPage.tsx:620-634`, bleibt erhalten, §3.7). Auf Overview/Deck gibt es während eines
laufenden Syncs mobil keine Anzeige. **Bewusst akzeptiert** — ein globaler Fortschrittsindikator
wäre ein neues UI-Element und damit genau das, was Entscheidung B vermeiden soll. Falls sich das
im Alltag als störend erweist, ist der kleinste Ausweg, das Sheet nach einem Sync-Klick offen zu
lassen (ist bereits so) bzw. später einen einzeiligen Store-getriebenen Statusstreifen zu
diskutieren — **nicht Teil dieser Spec**.

### 5.9 Höhe des erweiterten Account-Sheets (neues Risiko durch Option B)

**Belegt:** Das Sheet-Panel (`MobileAccountSheet.tsx:77-82`) hat `p-5 w-full max-w-md` — **keine
`max-height`, kein `overflow`**. Es wächst durch diesen PR um zwei ≥ 44 px hohe Buttons und im
Sync-Fall um bis zu drei Statuszeilen (Progress **oder** Fehler, `syncedAt`, `lastRefreshed`).
**Unbekannt** (§0.8), ob das auf kleinen Geräten (360 × 640) unten oder oben aus dem Viewport
läuft — das Sheet ist per `items-end` unten verankert, wächst also nach oben.
Prüfung: Scheibe G Schritt 15. **Falls es überläuft**, ist die minimale, design-system-konforme
Korrektur `max-h-[85vh] overflow-y-auto` am Panel — kein Farb-, Radius- oder Rastereingriff,
also kein Redesign im Sinne des Akzeptanzkriteriums. Diese Ergänzung wird **nur bei belegtem
Überlauf** gemacht und dann im PR benannt, nicht vorsorglich.

### 5.10 Performance

Vernachlässigbar. `SyncControls` abonniert im Sheet dieselben Store-Felder wie in der Sidebar;
gerendert wird es nur im geöffneten Sheet (Portal, `MobileAccountSheet.tsx:71`). Keine
zusätzlichen Netzwerk-Calls, keine neuen Effekte, kein neuer Listener (der Escape-Handler
existiert bereits, `:37-44`).

---

## 6. Definition of Done

- [ ] Alle Werte aus §3.1 stehen zeichengenau in **beiden** Sprachdateien; `actionLabels.test.ts`
      (A1–A5) ist grün, inklusive de/en-Key-Parität.
- [ ] Kein hartkodierter Label-String in einer `.tsx` (Grep über die geänderten Dateien);
      **keine neuen i18n-Keys** entstanden (§3.3).
- [ ] `opponents:logList.logMatch` ist in beiden Sprachdateien entfernt und wird nirgends mehr
      referenziert (`grep -r logList.logMatch apps/web/src` = leer).
- [ ] „Match loggen" hat genau drei Einstiegspunkte (FAB, DeckPage-Header, Empty-State-CTA);
      B1–B4 grün.
- [ ] Die MetaPage rendert keinen Sync-Button mehr (C1), zeigt aber weiterhin `syncedAt` (C2)
      und den `aria-live`-Status-Slot; `Globe`-Import und `handleSync` sind entfernt.
- [ ] Sync **und** Refresh sind auf einem 360-px-Viewport über Account-Chip → Sheet erreichbar
      (D1–D7 grün + manuell in Scheibe G gesehen, nicht abgeleitet); Busy-/Fehlerzustände dort
      identisch zur Sidebar (D6).
- [ ] **Kein neues dauerhaft sichtbares UI-Element** ist entstanden: `App.tsx` hat einen leeren
      Diff, es gibt keine `MobileSyncSheet.tsx`, kein zweiter fixer Chip im DOM.
- [ ] Das erweiterte Account-Sheet bleibt auf 360 × 640 vollständig bedienbar (Sign-out und
      Legal-Links erreichbar) — geprüft, nicht angenommen (§5.9).
- [ ] Die Sidebar rendert auf Desktop unverändert (Sidebar-Nav-Tests unangetastet grün,
      E1–E2 grün, Screenshot-Vergleich).
- [ ] Der Matchup-Reload trägt sichtbaren Text (F1) und keine `slate-400`-Textfarbe.
- [ ] Kein Farbtoken, keine `index.css`-Klasse, kein Grundraster geändert; `BottomNav.tsx` hat
      einen leeren Diff.
- [ ] Happy Path **und** ein Fehlerpfad sind getestet: B3/D3/D4 (Aktion löst aus) sowie C1/B2
      (entfernter Einstieg ist wirklich weg) bzw. D5 (Escape schließt).
- [ ] Mobile-Checkliste aus Scheibe G abgearbeitet: kein kaputter Umbruch, Ziele ≥ 44 px,
      Sync-Feedback im Sheet und auf der MetaPage gesehen.
- [ ] `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`,
      `npm run build` grün — ehrlich berichtet, kein übersprungenes Gate.
- [ ] `docs/architecture.md`, `docs/features.md`, `docs/data-flow.md`, `docs/getting-started.md`
      beschreiben den mobilen Weg über das Account-Sheet statt den MetaPage-Button;
      `docs/design-system.md` ist inhaltlich (nicht pro forma) ergänzt; Docs-Gate ohne Override grün.
- [ ] `code-review-agent` gelaufen; PR-Beschreibung auf Deutsch mit Testschritten; Merge nur mit
      grüner CI.
