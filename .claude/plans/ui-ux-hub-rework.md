# Plan — Spec 7: Informationsarchitektur auf das Hub-Ziel ausrichten

> **Bindende Grundlage:**
> [`specs/ui-ux-hub-rework.md`](../../specs/ui-ux-hub-rework.md) inkl. des Blocks
> „Offene Fragen (entschieden, 2026-09-03)" (`:78-102`, auf `main` seit `e5d4e1f`).
> Zusätzlich bindend: das vom User freigegebene **Wireframe** (HTML-Skizze, außerhalb
> des Repos) — es legt die Aufteilung der `recommendations`-Inhalte, den Verbleib des
> Overview-Tabs und die Nutzung des freien BottomNav-Slots fest.
> Kontext: Teil 7 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> **Baut auf Spec 4, 5 und 6 auf** (alle auf `main`): Match-Log-Demotion
> (`.claude/plans/personal-data-role-rework.md` §3.8), Karten-Deltas
> (`.claude/plans/recommendation-to-prognosis.md` §3.7), Equilibrium-Sektion
> (`.claude/plans/meta-game-theory-layer.md` §3.8).
> **Branch:** `feat/ui-ux-hub-rework`, abzweigen von `main` (`e5d4e1f`).
> **Vorgehen:** Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.
> **Gelesene Architektur-Voraussetzung** (CLAUDE.md §1): `docs/backend-evolution-plan.md`,
> `docs/architecture.md` §Frontend.

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `e5d4e1f`)

Alles hier stammt aus tatsächlich gelesenen Dateien. Wo etwas nicht belegt werden
konnte, steht **Vermutung** oder **Unbekannt** (CLAUDE.md §2.1).

### 0.1 Der Ist-Zustand der Navigation

- `apps/web/src/store/dashboardStore.ts:84` — `activeTab: 'overview' | 'deck' | 'recommendations' | 'meta'`.
  Default `'overview'` (`:149`), Setter `setActiveTab` (`:98`, `:236`).
- `apps/web/src/App.tsx:44-49` — `PAGE`-Map mit vier Einträgen, `:63` rendert `PAGE[activeTab]`;
  Lazy-Imports `:18-25`.
- `apps/web/src/components/layout/Sidebar.tsx:20-25` — eigenes `NAV_ITEMS`
  (overview · meta · deck · recommendations, Label `nav.recommendations`).
- `apps/web/src/components/layout/BottomNav.tsx:8-14` — **zweites, separates** `NAV_ITEMS`
  mit derselben Reihenfolge, aber Label `nav.tips` statt `nav.recommendations`;
  `:22-24` splittet `slice(0,2)` / `slice(2)` um den zentralen FAB (`:46-55`).
  **Belegte Divergenz:** dieselbe Navigation, zwei Quellen, schon heute mit
  unterschiedlichen Labels für denselben Tab.

> **Korrektur zur Aufgabenbeschreibung (Belegt, wichtig):** `activeTab` wird **nirgends
> persistiert**. `apps/web/src/lib/preferences.ts:3-9` listet alle localStorage-Keys
> (`localMeta`, `localMetaField`, `deckArchSlug`, `activeDeckId`, `bestOfHint`) — kein
> Tab-Key. Der Store nutzt **kein** `zustand/middleware/persist` (grep über
> `apps/web/src`: kein Treffer), und Dexie (`apps/web/src/db/database.ts`) speichert
> Domänendaten, keinen UI-State. `activeTab` ist reiner In-Memory-State mit Default
> `'overview'`.
> **Folge:** ein Migrations-/Fallback-Pfad für persistierte Altwerte wäre toter Code
> und wird in diesem Plan **nicht** gebaut (siehe §5, Punkt 5).

### 0.2 Wo die zu verschiebenden Inhalte heute wirklich liegen

- `apps/web/src/pages/RecommendationsPage.tsx` — die komplette Seite:
  Titel/Untertitel (`:50-66`), Zero-Log-Hinweis aus Spec 4 (`:73-84`), Info-Banner
  „basierend auf N Logs" inkl. Local-Meta-Zeile (`:86-111`), Prioritäts-Summary
  (`:114-127`), `RecommendationsPanel` (`:130`), Separator + `DeckComparisonPanel`
  (`:133-136`).
- `apps/web/src/pages/DeckPage.tsx:272` — **`<LocalMetaPanel />` wird hier gerendert**,
  im Grid neben `DeckSettingsWidget` (`:270-273`), Sektion „Deckliste".
  Das ist die **einzige** Verwendung (grep `LocalMetaPanel`: Definition + dieser Import).
  **Der Spec-Text verortet die Local-Meta-Konfiguration im `recommendations`-Tab
  (`specs/ui-ux-hub-rework.md:19-20`) — das ist gegenüber dem Code veraltet.** Dieser
  Plan nimmt `DeckPage.tsx:272` als Ausgangspunkt der Migration.
- `apps/web/src/components/deck/LocalMetaPanel.tsx:22-24` — liest `localMeta`,
  `setLocalMeta`, `archetypeStats` aus dem Store, i18n-Namensraum **`deck`**
  (`deck:localMeta.*`), Chrome über `SidePanel`.

### 0.3 Der Deck-Bereich nach Spec 4

- `apps/web/src/pages/DeckPage.tsx:172-175` — `SECTIONS` = genau zwei Sektionen
  (`deck` / `analytics`); Kommentar `:167-171` begründet, dass der **Match-Log** kein
  dritter Tab mehr ist.
- `:183` — `const [activeSection, setActiveSection] = useState<DeckSection>('deck')`
  — **lokaler React-State**, von außen nicht ansteuerbar.
- `:290-299` — Match-Log als `CollapsibleSection` mit `defaultOpen={false}` am Ende
  von „Analytics"; `:223-230` der immer sichtbare „Log match"-Button.
- `apps/web/src/components/deck/DeckSwitcher.tsx:11` —
  `export type DeckSection = 'deck' | 'analytics'`. **Wird in `DeckSwitcher.tsx` selbst
  nicht verwendet** (grep: Deklaration hier, Nutzung ausschließlich in
  `DeckPage.tsx:6,183`) — der Typ ist dort ein Waise.

### 0.4 Die Meta-Seite (Reihenfolge bleibt unangetastet)

`apps/web/src/pages/MetaPage.tsx:587-719`, in dieser Reihenfolge: Kopf + Sync-Button
(`:589-617`), Status-Slot (`:622-633`), Window-Control (`:636-656`), dann ein
`space-y-3`-Block mit vier `CollapsibleSection`s — Matchup-Matrix (`:659`, `defaultOpen`),
Turnier-Meta (`:667`, `defaultOpen`), Prediction (`:690`, `defaultOpen`), Equilibrium
(`:703`, **`defaultOpen={false}`**) — und zuletzt `<RecentTournaments />` (`:718`,
**keine** CollapsibleSection).

`apps/web/src/pages/MetaPage.test.tsx:169-189` prüft, dass die drei erstgenannten
Sektionen `defaultOpen` behalten und die experimentelle collapsed bleibt. Jede neue
Sektion in diesem Block würde diesen Vertrag berühren → siehe Entscheidung §3.5.

### 0.5 Die MetaTable-Doppeldeutigkeit (Fund 1)

Zwei verschiedene Komponenten mit identischem Namen:

| Datei | Rendert | i18n | Verwendet von |
|---|---|---|---|
| `apps/web/src/components/meta/MetaTable.tsx:65` | **Konrads eigene** Matchups (`ArchetypeStats[]`) | `meta:myMatchups.*` (`:73,86,121-136`) | `OverviewPage.tsx:5,115` |
| `apps/web/src/pages/MetaPage.tsx:104` (seitenlokal) | **Turnier-Meta** (`FieldAnalysisArchetype[]`) | `meta:metaTable.*` (`:151,191-221`) | `MetaPage.tsx:686` |

`docs/architecture.md:201,224` muss sie schon heute per Alias auseinanderhalten
(`MetaTable (overview)` vs. `MetaTable (meta)`) — genau die Achsen-Vermischung
(eigene Daten vs. öffentliche Meta-Daten), die diese Spec auflöst, eine Ebene tiefer.

### 0.6 Ein Link, der nach dem Umbau ins Leere zeigt (Fund 3, neu)

`apps/web/src/components/recommendations/DeckComparisonPanel.tsx:148-172` — ohne
gesetzten `deckArchSlug` zeigt das Panel „Deck-Vergleich nicht eingerichtet" und
verlinkt per `Trans`-Tag `myDeck` auf **`setActiveTab('deck')`** (`:161`).
Sobald das Panel selbst auf „Mein Deck" lebt, ist das ein **Selbstlink ohne Wirkung**
— der Nutzer landet dort, wo er schon ist, und findet das Slug-Feld trotzdem nicht
(es liegt in `DeckSettingsWidget`, Sektion „Deckliste", `DeckPage.tsx:94-107`).
Der i18n-Text sagt zusätzlich wörtlich „Gehe zu *Mein Deck*"
(`i18n/locales/de/recommendations.json` → `comparison.setupHint`) und wäre nach dem
Umbau schlicht falsch.

### 0.7 Bestehende Tests, die dieser Umbau berührt

- `apps/web/src/pages/DeckPage.test.tsx:74-79` — **„has exactly two section tabs"**.
  Wird durch die dritte Sektion (§3.4) rot. Muss bewusst und offen angepasst werden
  (tdd.md: „nie einen Test stillschweigend anpassen") — die Kernaussage
  „**kein** Tab heißt Match Log" bleibt erhalten.
- `apps/web/src/pages/RecommendationsPage.test.tsx:41-58` — Spec-4-Invarianten
  (Zero-Log-Hinweis mit den drei echten Schwellen, „log 10+ matches"-Hinweis).
  Die Seite verschwindet — **diese Assertions müssen mitwandern**, nicht wegfallen.
- `apps/web/src/pages/MetaPage.test.tsx:153-189` — die `defaultOpen`-Sektionen.
- `apps/web/src/pages/OverviewPage.test.tsx` — rendert `OverviewPage`, referenziert
  `MetaTable` **nicht** namentlich → von der Umbenennung (§3.6) nicht betroffen.
- `apps/api/src/lib/demoSeed.test.ts:21-80` — prüft ausschließlich Seed-**Inhalte**
  (≥3 Matches, ≥2 Niederlagen, fehlende Karten). **Kein Bezug auf Navigation oder
  Tabs** → durch diesen Umbau nicht berührt; das Demo-Risiko liegt nicht im Test,
  sondern in der Erreichbarkeit der Empfehlungen (§5, Punkt 3).
- Für `Sidebar.tsx` und `BottomNav.tsx` existieren **keine** Tests. Slice D/E legt
  sie neu an.

---

## 1. Summary

Die vier gleichrangigen Top-Level-Tabs (`overview | deck | recommendations | meta`)
werden auf **drei** reduziert: `overview` bleibt Landingpage, darunter die zwei
tragenden Achsen `meta` („wie verändert sich die Meta") und `deck` („was heißt das
für mein Deck"). Der `recommendations`-Tab entfällt vollständig; seine Inhalte werden
entlang der fachlichen Achse aufgeteilt: **Local-Meta-Konfiguration → Meta**,
**Empfehlungen + Deck-Comparison inkl. Karten-Deltas → Mein Deck**. Innerhalb von
„Mein Deck" entsteht dafür eine dritte Sektion „Tipps" neben den unveränderten
Sektionen „Deckliste" und „Analytics" (mit dem seit Spec 4 eingeklappten Match-Log).
Beide Navigationen (Desktop-`Sidebar`, mobile `BottomNav`) lesen ihre Einträge künftig
aus **einer** geteilten Konstante; der frei werdende vierte Slot der mobilen Leiste
wird zu einem **Shortcut auf die Deck-Comparison** (kein vierter Tab). Nebenbei wird
die Namenskollision der zwei `MetaTable`-Komponenten aufgelöst. Kein visuelles
Redesign, keine Änderung an Meta-Sync, Field-Score oder Recommendations-Logik.

---

## 2. Betroffene Ebenen (konkrete Dateien)

- [ ] **Datenmodell / Migration / API** — *nicht betroffen.* Reine Frontend-IA;
      keine Schema-, Route- oder Job-Änderung, kein `apps/api`-Diff außer Doku.
- [ ] **Store / UI-State** — `apps/web/src/store/dashboardStore.ts`
      (`activeTab`-Union, neu `deckSection`, `setDeckSection`, `openDeckComparison`;
      Typ-Exporte `DashboardTab`, `DeckSection`).
- [ ] **Shell / Routing** — `apps/web/src/App.tsx` (`PAGE`-Map, Lazy-Import),
      **neu** `apps/web/src/components/layout/navItems.ts`.
- [ ] **Navigation** — `apps/web/src/components/layout/Sidebar.tsx`,
      `apps/web/src/components/layout/BottomNav.tsx`.
- [ ] **Seiten** — `apps/web/src/pages/DeckPage.tsx`,
      `apps/web/src/pages/MetaPage.tsx`,
      `apps/web/src/pages/RecommendationsPage.tsx` (**gelöscht**),
      `apps/web/src/pages/OverviewPage.tsx` (nur Import-Rename).
- [ ] **Komponenten** — **neu** `apps/web/src/components/deck/DeckTipsSection.tsx`;
      `apps/web/src/components/recommendations/DeckComparisonPanel.tsx` (Setup-Link);
      `apps/web/src/components/meta/MetaTable.tsx` → `MyMatchupsTable.tsx` (Rename);
      `apps/web/src/components/deck/DeckSwitcher.tsx` (`DeckSection`-Typ entfällt dort);
      `apps/web/src/components/deck/LocalMetaPanel.tsx` (**unverändert**, nur anderer
      Rendering-Ort).
- [ ] **i18n** — `apps/web/src/i18n/locales/{de,en}/layout.json` (`nav.*`),
      `.../deck.json` (`page.tabs.tips`),
      `.../recommendations.json` (`comparison.setupHint`, `page.localMetaNotice`,
      Löschung von `page.title` / `page.subtitleForDeck` / `page.subtitleGeneric`).
- [ ] **Tests** — **neu** `components/layout/navItems.test.ts`,
      `components/layout/Sidebar.test.tsx`, `components/layout/BottomNav.test.tsx`,
      `components/deck/DeckTipsSection.test.tsx`;
      **geändert** `pages/DeckPage.test.tsx`, `pages/MetaPage.test.tsx`,
      `store/dashboardStore.test.ts`,
      `components/recommendations/DeckComparisonPanel.test.tsx`;
      **gelöscht** `pages/RecommendationsPage.test.tsx` (Assertions wandern nach
      `DeckTipsSection.test.tsx`).
- [ ] **Doku** — `docs/architecture.md` (§Application Shell `:168-176`,
      Mermaid-Baum `:189-226`), `docs/features.md` (Tabelle `:8-20`, §9 `:279`,
      §10 `:314`, `:344`, `:402` „four dashboard tabs"), `docs/data-flow.md`
      (`:64,67,277,468`).

---

## 3. Interfaces & Contracts

Verbindlich für `tester` **und** `implementer`. Beide arbeiten ausschließlich hiergegen.

### 3.1 Tab-Union und Store (`apps/web/src/store/dashboardStore.ts`)

```ts
/** Die drei Top-Level-Achsen der IA (Spec 7). */
export type DashboardTab = 'overview' | 'meta' | 'deck';

/** Sektionen innerhalb von "Mein Deck". */
export type DeckSection = 'deck' | 'analytics' | 'tips';

interface DashboardState {
  // ... unveraendert ...
  activeTab: DashboardTab;                       // Default: 'overview'
  deckSection: DeckSection;                      // Default: 'deck'

  setActiveTab: (tab: DashboardTab) => void;
  setDeckSection: (section: DeckSection) => void;
  /** Springt direkt zur Deck-Comparison: activeTab='deck' UND deckSection='tips',
   *  in einem einzigen Store-Update. */
  openDeckComparison: () => void;
}
```

- `DashboardTab` und `DeckSection` werden **aus dem Store exportiert** (nicht aus einer
  Komponente), damit `navItems.ts` den Typ importieren kann, ohne einen Zyklus zu bauen.
- `export type DeckSection` verschwindet aus `components/deck/DeckSwitcher.tsx:11`
  (dort ungenutzt, §0.3); `DeckPage.tsx:6` importiert den Typ künftig aus dem Store.
- `openDeckComparison()` ist die **einzige** erlaubte Quelle des Sprungs — kein
  Aufrufer setzt `activeTab` und `deckSection` einzeln nacheinander (zwei Renders,
  sichtbarer Zwischenzustand „Mein Deck / Deckliste").

### 3.2 Geteilte Navigations-Konstante (**neu**: `apps/web/src/components/layout/navItems.ts`)

```ts
import type { ComponentType, SVGProps } from 'react';
import type { DashboardTab } from '../../store/dashboardStore';

export interface NavItem {
  id: DashboardTab;
  /** Key im i18n-Namensraum `layout`. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Genau drei Eintraege, in genau dieser Reihenfolge. Einzige Quelle fuer
 *  Sidebar (Desktop) und BottomNav (Mobile). */
export const NAV_ITEMS: readonly NavItem[];
```

Verbindlicher Inhalt:

| Index | `id` | `labelKey` | Icon (lucide-react) |
|---|---|---|---|
| 0 | `overview` | `nav.overview` | `LayoutDashboard` |
| 1 | `meta` | `nav.meta` | `BarChart2` |
| 2 | `deck` | `nav.myDeck` | `Layers` |

`ComponentType<SVGProps<SVGSVGElement>>` ist die im Repo etablierte Icon-Typisierung
(Präzedenz: `DeckComparisonPanel.tsx:16,38`) — kein `any`, kein lucide-interner Typ.

### 3.3 Navigations-Komponenten

**`Sidebar.tsx`**
- Importiert `NAV_ITEMS`, definiert **kein** eigenes Array mehr.
- Rendert genau `NAV_ITEMS.length` Nav-Buttons; `aria-current="page"` ausschließlich
  auf dem Button mit `id === activeTab` (Verhalten wie heute, `:74`).
- Alles unterhalb der Navigation (Sync, Refresh, UserMenu, LanguageSwitcher,
  LegalLinks) bleibt **unverändert**.

**`BottomNav.tsx`**
- Importiert dieselbe `NAV_ITEMS`.
- Layout: `NAV_ITEMS[0..1]` links vom FAB, `NAV_ITEMS[2]` rechts, danach **ein
  Shortcut-Button** im vierten Slot:

```ts
// Kein Tab: springt in die Deck-Comparison, wird nie als "aktuelle Seite" markiert.
interface NavShortcut {
  labelKey: 'nav.comparison';                       // i18n-Namensraum `layout`
  Icon: ComponentType<SVGProps<SVGSVGElement>>;     // GitCompare
  onActivate: () => void;                           // -> store.openDeckComparison()
}
```

- **Verbindlich:** der Shortcut trägt **niemals** `aria-current` — auch nicht, wenn
  `activeTab === 'deck' && deckSection === 'tips'`. Genau ein Element der Leiste
  beantwortet „auf welcher Seite bin ich" (das ist dann „Mein Deck").
- Der FAB („Match loggen", `:46-55`) bleibt inhaltlich und in Position unverändert.

### 3.4 „Mein Deck" bekommt eine dritte Sektion (`DeckPage.tsx`)

```ts
const SECTIONS: ReadonlyArray<{ id: DeckSection; labelKey: string; Icon: IconType }> = [
  { id: 'deck',      labelKey: 'page.tabs.deckList',  Icon: List },
  { id: 'analytics', labelKey: 'page.tabs.analytics', Icon: BarChart2 },
  { id: 'tips',      labelKey: 'page.tabs.tips',      Icon: Lightbulb },
];
```

- Der Sektions-State kommt **aus dem Store** (`deckSection` / `setDeckSection`), nicht
  mehr aus `useState` (`:183`) — nur so kann die BottomNav von außen hineinspringen.
- Sektion `deck` und `analytics`: **inhaltlich unverändert**, mit **einer** Ausnahme —
  `<LocalMetaPanel />` (`:272`) entfällt dort (→ §3.5); der Grid-Container
  (`:270-273`) trägt dann nur noch `DeckSettingsWidget`.
- Sektion `tips` rendert genau eine neue Komponente (§3.4.1).
- Der „Log match"-Button (`:223-230`) bleibt in allen **drei** Sektionen sichtbar.
- Match-Log bleibt, wo Spec 4 ihn hingestellt hat: eingeklappte `CollapsibleSection`
  am Ende von „Analytics" (AC 3).

#### 3.4.1 **Neu**: `apps/web/src/components/deck/DeckTipsSection.tsx`

```ts
/** Der bisherige Inhalt von RecommendationsPage, als Sektion von "Mein Deck".
 *  Props-frei: liest alles aus dem Store (wie die Seite zuvor). */
export function DeckTipsSection(): JSX.Element;
```

Verbindlicher Inhalt (Reihenfolge wie in `RecommendationsPage.tsx:48-137`, damit
kein Verhalten stillschweigend wegfällt):

1. Zero-Log-Zustand (`activeLogs.length === 0`): der Spec-4-Hinweis
   „Meta-Analyse funktioniert auch ohne eigene Daten" mit den **drei echten
   Schwellen** (`recommendations:page.metaWorksWithoutLogs.*`) — **unverändert**
   übernommen, inkl. `page.logMoreHint` im „wenige Logs"-Fall.
2. Sonst das Info-Banner „basierend auf N Logs" (`page.basedOn`), plus — **geändert** —
   die Local-Meta-Zeile: der Text verweist jetzt per Link auf die **Meta-Seite**
   (`setActiveTab('meta')`), weil die Konfiguration dorthin gewandert ist.
3. Prioritäts-Summary (high/medium/low-Zähler).
4. `<RecommendationsPanel recommendations={...} />` — Props-Vertrag unverändert
   (`RecommendationsPanel.tsx:5-7`).
5. Überschrift `comparison.sectionTitle` + `<DeckComparisonPanel />` — unverändert.

Die Berechnung (`activeLogs`-Filter auf `activeDeckId`, `computeDeckPerformanceStats`,
`useRecommendations` mit `cardDeltas: cardStats`) wird **1:1** aus
`RecommendationsPage.tsx:24-42` übernommen. Der Seitentitel (`page.title`,
`page.subtitle*`, `:50-66`) entfällt — die Sektion lebt unter der Deck-Überschrift.

**i18n-Vertrag (Namensraum `recommendations`, beide Sprachen):**

| Key | Änderung |
|---|---|
| `page.localMetaNotice` | Text sinngleich, wird `Trans`-fähig mit Tag `<metaLink>` um den Begriff „Lokales Meta" / „local meta" |
| `page.title`, `page.subtitleForDeck`, `page.subtitleGeneric` | **gelöscht** (kein Aufrufer mehr) |
| alle übrigen `page.*`, `panel.*`, `comparison.*`, `rules.*` | **unverändert** |

**Neu in `deck.json` (beide Sprachen):** `page.tabs.tips` — DE `"Tipps"`, EN `"Tips"`.

### 3.5 Local-Meta-Konfiguration wandert auf die Meta-Seite (`MetaPage.tsx`)

- `<LocalMetaPanel />` wird von `MetaPage` gerendert — **nach** dem `space-y-3`-Block
  mit den vier bestehenden `CollapsibleSection`s und **vor** `<RecentTournaments />`
  (`MetaPage.tsx:716-718`).
- **Nicht** in eine `CollapsibleSection` gewickelt: das Panel bringt über `SidePanel`
  bereits Titel, Icon und Beschreibung mit (`LocalMetaPanel.tsx:40-44`), und der
  `defaultOpen`-Vertrag aus `MetaPage.test.tsx:153-189` bleibt so beweisbar unberührt
  (die Sektionsliste ändert sich nicht).
- **Die Datei `components/deck/LocalMetaPanel.tsx` wird nicht verschoben und ihr
  i18n-Namensraum (`deck:localMeta.*`) nicht geändert.** Begründung: der Umzug ist eine
  Frage der *Screens*, nicht der Ordner; ein Datei-/Key-Umzug erzeugt Diff und
  i18n-Risiko ohne sichtbaren Nutzen. Ein Dateikopf-Kommentar hält fest, dass die
  Komponente seit Spec 7 von `MetaPage` gerendert wird (bewusst akzeptierte
  Rest-Inkonsistenz, §5 Punkt 6).
- Reihenfolge und Verhalten **aller bestehenden** Meta-Sektionen bleiben unverändert
  (Out of Scope der Spec).

### 3.6 MetaTable-Namenskollision auflösen (Fund 1)

| Alt | Neu | Begründung |
|---|---|---|
| `components/meta/MetaTable.tsx`, `export function MetaTable({ stats }: { stats: ArchetypeStats[] })` | Datei `components/meta/MyMatchupsTable.tsx`, `export function MyMatchupsTable({ stats }: { stats: ArchetypeStats[] })` | Zeigt Konrads **eigene** Matchups, i18n bereits `meta:myMatchups.*` |
| `pages/MetaPage.tsx:104`, seitenlokales `function MetaTable({ archetypes, onSelect })` | `function TournamentMetaTable({ archetypes, onSelect })`, bleibt seitenlokal | Zeigt **Turnier-Meta**, i18n `meta:metaTable.*` |

- **Reiner Rename**: keine Prop-, Markup- oder i18n-Key-Änderung. Aufrufer:
  `OverviewPage.tsx:5,115` (Import + JSX), `MetaPage.tsx:686`.
- `ArchetypeSelection` (`MetaPage.tsx:46-49`) bleibt exportiert und unverändert.

### 3.7 Setup-Link der Deck-Comparison reparieren (Fund 3)

`DeckComparisonPanel.tsx:148-172`:

```ts
// vorher: components={{ myDeck: <button onClick={() => setActiveTab('deck')} ... />, ... }}
// nachher:
components={{
  deckSettings: <button onClick={() => setDeckSection('deck')} className="text-brand-700 underline" />,
  slug: <code className="text-brand-700" />,
}}
```

i18n `recommendations:comparison.setupHint`, beide Sprachen, Tag `myDeck` → `deckSettings`:
- DE: „Öffne die <deckSettings>Deckliste</deckSettings> und hinterlege dort deinen
  Archetype-Slug (z. B. <slug>n-zoroark</slug>), um deine Liste mit Turnierergebnissen
  zu vergleichen."
- EN: sinngemäß analog („Open the <deckSettings>Deck List</deckSettings> section ...").

Verhalten: Klick setzt `deckSection` auf `'deck'` (dort sitzt das Slug-Feld im
`DeckSettingsWidget`), **nicht** `activeTab`.

### 3.8 i18n-Vertrag `layout.json` (beide Sprachen)

| Key | Aktion |
|---|---|
| `nav.overview`, `nav.meta`, `nav.myDeck` | unverändert |
| `nav.recommendations` | **entfernt** (kein Aufrufer mehr) |
| `nav.tips` | **entfernt** (war das BottomNav-Label des wegfallenden Tabs) |
| `nav.comparison` | **neu** — DE `"Vergleich"`, EN `"Compare"` |

Alle übrigen `layout`-Keys (`sidebar.*`, `bottomNav.*`, `sync.*`, `compare.*`,
`tournaments.*`) bleiben unangetastet.

### 3.9 `App.tsx`

```ts
const PAGE: Record<DashboardTab, ReactNode> = {
  overview: <OverviewPage />,
  deck: <DeckPage />,
  meta: <MetaPage />,
};
```

Der `RecommendationsPage`-Lazy-Import (`:22-24`) und die Datei
`apps/web/src/pages/RecommendationsPage.tsx` werden **gelöscht**. Die explizite
`Record<DashboardTab, ...>`-Annotation ist Teil des Vertrags: sie macht jeden künftigen
Tab-Zuwachs zu einem Typfehler statt zu einem `undefined`-Render.

---

## 4. Umsetzungsreihenfolge (test-first, Scheibe für Scheibe)

Jede Scheibe: `tester` schreibt zuerst den fehlschlagenden Test und **bestätigt den
Rot-Grund**, dann macht `implementer` ihn grün. Testbefehl:
`npm run test -w @pokekon/web`; volle Gates am Ende (Repo-Root):
`npm run lint && npm run typecheck && npm run test`.
Es gibt **keine** Migrations- oder Codegen-Schritte in diesem Plan.

> **Reihenfolge-Begründung:** die Inhalte bekommen erst ihr neues Zuhause (Slice B/C),
> **danach** verschwindet der alte Tab (Slice D). Zwischen keinen zwei Commits ist eine
> Funktion unerreichbar — wichtig für den Demo-Modus (§5 Punkt 3).

**Slice A — Store-Kontrakt (§3.1)**
1. `tester`: `apps/web/src/store/dashboardStore.test.ts` erweitern —
   (a) Default `deckSection === 'deck'`;
   (b) `setDeckSection('analytics')` setzt nur `deckSection`, `activeTab` bleibt;
   (c) `openDeckComparison()` setzt in **einem** Aufruf `activeTab === 'deck'` **und**
   `deckSection === 'tips'`, ausgehend von `activeTab: 'overview'`.
   → Rot, weil Felder/Aktionen nicht existieren.
2. `implementer`: Felder + Aktionen in `dashboardStore.ts` ergänzen,
   `DashboardTab`/`DeckSection` exportieren, `DeckSection` aus `DeckSwitcher.tsx:11`
   entfernen, Import in `DeckPage.tsx:6,183` umhängen.
   *`activeTab` bleibt in dieser Scheibe noch vierwertig* — der Tab-Wegfall ist Slice D.

**Slice B — „Tipps"-Sektion in „Mein Deck" (§3.4)**
3. `tester`: **neu** `apps/web/src/components/deck/DeckTipsSection.test.tsx` — die
   beiden Spec-4-Assertions aus `RecommendationsPage.test.tsx:41-58` (Zero-Log-Hinweis
   mit den drei Schwellen; kein Hinweis bei ≥1 Log, aber „log 10+ matches") **wörtlich
   übernommen**, plus: die Sektion rendert `comparison.sectionTitle`.
4. `tester`: `apps/web/src/pages/DeckPage.test.tsx` anpassen — **offen dokumentiert**
   (tdd.md): aus „exactly two section tabs" wird „exactly three section tabs
   (Deck List · Analytics · Tips)"; die Assertion „**kein** Tab heißt Match Log"
   bleibt unverändert bestehen. Neu: Klick auf „Tips" rendert die Comparison-Sektion;
   „Log match" bleibt auch dort sichtbar; die Sektion „Deckliste" rendert **kein**
   Local-Meta-Panel mehr (`deck:localMeta.title` nicht im Dokument).
   *Hinweis an den Tester:* der Store-Mock in `DeckPage.test.tsx:34-53` liefert heute
   pro Render ein frisches Objekt mit `vi.fn()`-Stubs; für den nun store-getragenen
   Sektionswechsel braucht es einen **zustandsbehafteten** Mock (Muster:
   `OverviewPage.test.tsx:30-40` mit veränderlichem `storeState`), sonst kann kein
   Tab-Klick sichtbar werden.
5. `implementer`: `DeckTipsSection.tsx` anlegen (Inhalt aus `RecommendationsPage.tsx`,
   ohne Seitentitel, mit Meta-Link in der Local-Meta-Zeile), `DeckPage.tsx` um die
   dritte Sektion erweitern, Sektions-State auf den Store umstellen, `deck.json`
   (de/en) um `page.tabs.tips` ergänzen, `recommendations.json` (de/en) um den
   `<metaLink>`-Tag in `page.localMetaNotice`.
   **`RecommendationsPage.tsx` bleibt in dieser Scheibe noch bestehen** (dieselben
   Panels doppelt sichtbar — aber nur einen Commit lang, siehe §5 Punkt 4).

**Slice C — Local-Meta auf die Meta-Seite (§3.5)**
6. `tester`: `apps/web/src/pages/MetaPage.test.tsx` erweitern — die Seite rendert
   `deck:localMeta.title`; **und** die bestehenden Sektions-Assertions (`:153-189`)
   bleiben unverändert grün (Beweis, dass Sektionsliste/-reihenfolge unangetastet sind).
   *Hinweis:* der Store-Mock (`MetaPage.test.tsx:57-69`) braucht zusätzlich
   `localMeta: []`, `setLocalMeta: vi.fn()`, `archetypeStats: []`.
7. `implementer`: `<LocalMetaPanel />` in `MetaPage.tsx` einhängen (nach dem
   Sektionsblock, vor `<RecentTournaments />`), aus `DeckPage.tsx:272` entfernen,
   Dateikopf-Kommentar in `LocalMetaPanel.tsx` ergänzen.

**Slice D — Navigation schrumpft auf drei Einträge (§3.2, §3.3, §3.9)**
8. `tester`: **neu** `apps/web/src/components/layout/navItems.test.ts` — `NAV_ITEMS`
   hat genau 3 Einträge mit ids `['overview','meta','deck']` in dieser Reihenfolge,
   jeder mit nicht-leerem `labelKey` und einem `Icon`.
9. `tester`: **neu** `Sidebar.test.tsx` + `BottomNav.test.tsx` — beide rendern genau
   die drei Labels aus `NAV_ITEMS` (über `i18n.t('layout:...')` aufgelöst, nicht
   hartkodiert); **kein** Button trägt das alte „Recommendations"/„Tips"-Label;
   `aria-current="page"` genau einmal, auf dem aktiven Tab.
10. `implementer`: `navItems.ts` anlegen, `Sidebar.tsx`/`BottomNav.tsx` darauf
    umstellen, `activeTab`-Union auf `DashboardTab` verengen, `App.tsx`-`PAGE`-Map
    und Lazy-Import bereinigen, `pages/RecommendationsPage.tsx` **und**
    `pages/RecommendationsPage.test.tsx` löschen, `layout.json` (de/en) gemäß §3.8
    aktualisieren.

**Slice E — Deck-Comparison-Shortcut in der BottomNav (§3.3)**
11. `tester`: `BottomNav.test.tsx` erweitern — es gibt einen vierten Button mit
    `layout:nav.comparison`; Klick ruft `openDeckComparison` **einmal** auf; dieser
    Button trägt **nie** `aria-current`, auch nicht bei
    `activeTab='deck', deckSection='tips'`; Reihenfolge
    [overview, meta] · FAB · [deck, comparison].
12. `implementer`: Shortcut-Button in `BottomNav.tsx` ergänzen (Icon `GitCompare`),
    `nav.comparison` in beiden `layout.json`.

**Slice F — Setup-Link der Comparison (§3.7)**
13. `tester`: `DeckComparisonPanel.test.tsx` erweitern — bei leerem `deckArchSlug`
    ruft der Link im Setup-Hinweis `setDeckSection('deck')` auf und **nicht**
    `setActiveTab`.
14. `implementer`: `Trans`-Tag + Handler + beide `recommendations.json` anpassen.

**Slice G — MetaTable-Umbenennung (§3.6, reiner Refactor)**
15. `implementer` (kein neuer Test — keine Verhaltensänderung; tdd.md-Ausnahme,
    abgesichert durch `typecheck` + die bestehenden `OverviewPage`/`MetaPage`-Suites):
    `components/meta/MetaTable.tsx` → `MyMatchupsTable.tsx` inkl. Export-Name,
    Import in `OverviewPage.tsx`, seitenlokale `MetaTable` in `MetaPage.tsx:104` →
    `TournamentMetaTable` (auch am Aufrufer `:686`).

**Slice H — Doku (CLAUDE.md Golden Rule 7)**
16. `docs/architecture.md`: „Application Shell" auf drei Tabs + drei Deck-Sektionen
    umschreiben; Mermaid-Baum (`:189-226`) ohne `RecommendationsPage`, dafür
    `DeckPage --> DeckTipsSection --> RecommendationsPanel/DeckComparisonPanel` und
    `MetaPage --> LocalMetaPanel`; Aliase `MetaTable (overview)`/`MetaTable (meta)`
    durch die echten Namen ersetzen.
17. `docs/features.md`: „Page"-Spalte der Übersichtstabelle (`:8-20`), §9 (`:279`),
    §10 (`:314`), `:344` und `:402` („four dashboard tabs") auf die neue IA ziehen.
18. `docs/data-flow.md`: Sequenzdiagramm-Teilnehmer `RecommendationsPage`
    (`:64,67,277,468`) auf `DeckTipsSection` umbenennen.

---

## 5. Risiken & offene Fragen

1. **Verlust der Spec-4-Invarianten beim Seitenwechsel (Hauptrisiko).**
   `RecommendationsPage.test.tsx` verschwindet mit der Seite. Stehen seine beiden
   Assertions nicht **vor** dem Löschen in `DeckTipsSection.test.tsx`, fällt eine
   bereits abgenommene Spec-4-Zusage (Zero-Log-Sichtbarkeit) still weg.
   → Deshalb ist Slice B **vor** Slice D terminiert und Schritt 3 als „wörtlich
   übernommen" formuliert.

2. **Bewusst geänderter Bestandstest.** `DeckPage.test.tsx:74-79` („exactly two
   section tabs") wird durch die dritte Sektion falsch. Das ist eine **echte, gewollte**
   Verhaltensänderung dieser Spec, kein Test-Weichklopfen — sie gehört so in die
   PR-Beschreibung (tdd.md: offen benennen). Die Aussage, die Spec 4 wirklich schützen
   wollte („Match Log ist **kein** Tab"), bleibt erhalten.

3. **Demo-Modus.** `apps/api/src/lib/demoSeed.test.ts` ist navigationsagnostisch
   (§0.7) und kann durch diesen Umbau nicht brechen. Das reale Risiko ist ein anderes:
   der Demo-Seed existiert, damit Empfehlungen und Karten-Deltas **feuern** — sie
   müssen nach dem Umbau weiterhin in ≤2 Klicks erreichbar sein („Mein Deck" →
   „Tipps", mobil zusätzlich der Shortcut). → manueller Demo-Durchlauf in der DoD.

4. **Zwei sichtbare Kopien für einen Commit.** Nach Slice B rendern sowohl die (noch
   existierende) `RecommendationsPage` als auch die neue Deck-Sektion dieselben Panels.
   Das ist gewollt (kein Loch zwischen den Commits), darf aber nicht als Endzustand
   gemergt werden → Slice D ist **im selben PR** Pflicht.

5. **Kein Fallback für persistierte Alt-Tabs — und warum das richtig ist.**
   `activeTab` ist nicht persistiert (§0.1, belegt). Ein `normalizeTab()`-Fallback auf
   `'deck'` wäre Code ohne erreichbaren Aufrufer. **Frage an Konrad:** falls du
   Tab-Persistenz (localStorage oder URL-Hash/Deep-Links) *möchtest*, ist das ein
   eigenes kleines Feature mit eigener Spec — dann kommt der Fallback dorthin, wo er
   auch etwas tut. Dieser Plan baut ihn bewusst nicht.

6. **Akzeptierte Rest-Inkonsistenz.** `LocalMetaPanel` bleibt physisch unter
   `components/deck/` und im i18n-Namensraum `deck`, obwohl es künftig auf der
   Meta-Seite lebt (§3.5). Alternative wäre Datei- **und** Key-Umzug nach
   `components/meta/` + `meta.json`: größerer Diff, echtes Risiko übersehener Keys
   (stille Roh-Key-Anzeige im UI), null sichtbarer Nutzen. **Entscheidung getroffen
   (kein Umzug); überstimmbar**, falls dir Ordner-Kohärenz hier wichtiger ist.

7. **Platzierung der neuen Panels innerhalb „Mein Deck" — die einzige echte
   Design-Wahl dieses Plans.** Gewählt: **dritte Sektion „Tipps"** neben Deckliste und
   Analytics. Begründung: (a) „Deckliste"/„Analytics" behalten so ein leeres
   Inhalts-Diff; (b) der freigegebene BottomNav-Shortcut braucht ein **adressierbares**
   Sprungziel — eine Sektion ist das, ein Scroll-Anker wäre fragiler; (c) die drei
   Sektionen lesen sich als Kette „Liste → Auswertung → Konsequenz".
   *Verworfene Alternative:* die Panels unten an „Analytics" anhängen — weniger
   Klickwege, aber vermischt persönliche Auswertung mit Prognose (genau die
   Vermischung, die Spec 7 auflöst) und macht den Shortcut zum Scroll-Sprung.
   **Falls das Wireframe hier etwas anderes zeigt, gilt das Wireframe — dann bitte
   kurz melden, es betrifft nur §3.4 und Slice B.**

8. **Performance.** Neutral bis leicht besser: ein Lazy-Chunk weniger
   (`RecommendationsPage`), dieselben Panels, keine zusätzlichen Netzwerk-Requests.
   `DeckTipsSection` läuft nur bei aktiver „Tipps"-Sektion — `useRecommendations`
   (14 Regeln, rein clientseitig) wird dadurch **seltener** ausgewertet als heute.
   `LocalMetaPanel` auf der Meta-Seite liest ausschließlich Store-State, kein Fetch.

9. **Produktionsdaten.** Kein Risiko: keine Migration, kein Schema-Diff, keine
   API-Änderung. Die einzigen persistierten Werte, die dieser Umbau berührt, sind die
   unveränderten localStorage-Preferences (`tcg-local-meta-v1` usw.).

---

## 6. Definition of Done

**Quality-Gates (CLAUDE.md §4)**
- [ ] `npm run lint` grün (0 Errors).
- [ ] `npm run typecheck` grün, keine neuen `any`/ungeprüften Casts.
- [ ] `npm run test` grün — inklusive der angepassten `DeckPage.test.tsx` und der
      migrierten Spec-4-Assertions in `DeckTipsSection.test.tsx`.
- [ ] `npx prettier --check .` sauber.

**Gegen die Akzeptanzkriterien der Spec**
- [ ] AC 1 — Navigation zeigt Overview + die zwei Achsen „Meta"/„Mein Deck";
      `NAV_ITEMS` hat genau drei Einträge, `DashboardTab` genau drei Werte.
- [ ] AC 2 — Deck-Comparison **nur** unter „Mein Deck" (Sektion „Tipps"),
      Local-Meta-Konfiguration **nur** unter „Meta"; keine Funktion ist in beiden
      Achsen sichtbar (per Test abgesichert: „Deckliste" rendert kein Local-Meta-Panel).
- [ ] AC 3 — Match-Log unverändert als eingeklappte Sektion am Ende von „Analytics",
      „Log match" weiterhin in jeder Deck-Sektion erreichbar.
- [ ] AC 4 — Overview bleibt Landingpage (Spec-Entscheidung `:80-87`), Inhalt unverändert.
- [ ] AC 5 — kein visuelles Redesign: keine Änderung an Farben, Dichte, Typo oder
      Panel-Chrome; der Diff enthält keine neuen Style-Systeme.
- [ ] AC 6 — Desktop **und** Mobile bilden dieselbe Struktur ab, beweisbar durch die
      geteilte `NAV_ITEMS`; `Sidebar.test.tsx` und `BottomNav.test.tsx` prüfen beides.
- [ ] AC 7 — Demo-Modus End-to-End manuell (`./scripts/demo-local.sh`): Demo-Login →
      Empfehlungen feuern unter „Mein Deck → Tipps" → Karten-Deltas und vorgebackene
      Analyse sichtbar → `demoSeed.test.ts` grün.

**Edge Cases / Qualität**
- [ ] Cold Start: kein Deck, keine Logs, kein Meta — „Tipps" zeigt den Zero-Log-Hinweis
      statt eines leeren Screens; „Meta" zeigt das Local-Meta-Panel auch ohne
      `archetypeStats`.
- [ ] Kein toter Code: `RecommendationsPage.tsx`, dessen Test, `nav.recommendations`,
      `nav.tips` und die verwaisten `recommendations:page.title/subtitle*`-Keys sind
      entfernt; `DeckSection` existiert nur noch einmal.
- [ ] Kein Link zeigt ins Leere: der Setup-Hinweis der Comparison springt in die
      Deckliste, die Local-Meta-Zeile in den Tipps springt auf „Meta".
- [ ] Auth/Validierung: **kein neuer Endpunkt, kein neues User-Input-Processing** —
      `security-agent` ist für diese Änderung nicht erforderlich (CLAUDE.md §3).
- [ ] Doku aktualisiert: `docs/architecture.md`, `docs/features.md`,
      `docs/data-flow.md` (Slice H).

---

## 7. Commit-Plan (Conventional Commits, ein logischer Schritt je Commit)

```
test(web): add failing tests for the deck section store contract
feat(web): lift the deck section into the store and add a comparison jump
test(web): add failing tests for the deck tips section
feat(web): move recommendations and deck comparison into My Deck
test(web): add a failing test for local meta on the meta page
feat(web): move the local meta configuration to the meta page
test(web): add failing tests for the three-item navigation
refactor(web): drop the recommendations tab and share NAV_ITEMS
test(web): add a failing test for the mobile deck comparison shortcut
feat(web): add a deck comparison shortcut to the bottom nav
test(web): add a failing test for the comparison setup link target
fix(web): point the comparison setup hint at the deck list section
refactor(web): rename the two clashing MetaTable components
docs: describe the two-axis information architecture
```

Body-Muster für jeden nicht-trivialen Commit (`.claude/rules/git-and-commits.md`):

```
Goal: <was erreicht wird>
Why:  <warum noetig - mit Spec-/Plan-Referenz>
How:  <wie umgesetzt>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Die PR-Beschreibung (Deutsch) muss zwei Dinge ausdrücklich nennen:
1. den **bewusst geänderten** Bestandstest `DeckPage.test.tsx` („two" → „three section
   tabs", §5 Punkt 2);
2. die **Korrektur am Spec-Text**: Local Meta lag im Code nie im `recommendations`-Tab,
   sondern in `DeckPage.tsx:272` (§0.2).
