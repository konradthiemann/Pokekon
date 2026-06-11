# TCG Dashboard — Implementation Todo

> Grundlage: Codebase-Analyse vom 2026-04-24.
> Jeder Punkt enthält konkrete Dateireferenzen und Implementierungsdetails, damit ein anderer AI-Agent direkt loslegen kann.

---

## Punkt 1 — Matchup Matrix: Auto-Refresh beim Tab-Wechsel

**Status:** `[x]`

### Problem
`MatchupMatrix.tsx` Zeile 1–6 enthält einen Kommentar: "The underlying data is a static CSV export from TrainerHill.com, last updated 2026-04-17." Die CSV ist ein hardcodierter String in der Datei selbst (Zeile 13–205). Kein automatisches Laden.

### Was sich ändern soll
Beim Öffnen des Meta-Tabs soll die Matrix automatisch versuchen, aktuelle Daten von TrainerHill zu laden, oder zumindest ein UI-Hinweis erscheinen mit Datum + "Update"-Button. Da TrainerHill kein öffentliches API hat, ist die pragmatischste Lösung:

**Option A (empfohlen, kein API nötig):** Statt des hartcodierten CSV-Strings wird die CSV-Datei in `public/` abgelegt und beim App-Start via `fetch('/matchup-matrix.csv')` geladen. So kann der User die Datei aktualisieren ohne Code-Deployment.

**Option B (Fallback auf Static):** Ein "Zuletzt aktualisiert: 2026-04-17"-Badge + "Daten aktualisieren"-Button der eine neue CSV importieren lässt (File-Input).

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/meta/MatchupMatrix.tsx` | Umbau | Static CSV → fetch oder state-driven |
| `src/store/dashboardStore.ts` | optional Ergänzung | matchupCsv state + loadMatchupCsv action |
| `public/matchup-matrix.csv` | Neue Datei | CSV aus dem aktuellen `RAW_CSV` String extrahieren |

### Implementierungsschritte
1. Datei `public/matchup-matrix.csv` anlegen — Inhalt ist der aktuelle `RAW_CSV` String aus `MatchupMatrix.tsx` Zeilen 13–205, ohne den JS-Template-Wrapper.
2. In `MatchupMatrix.tsx` den `RAW_CSV` String und `parseCsv()` ersetzen:
   - Neuer lokaler State: `const [csvData, setCsvData] = useState<string | null>(null)`.
   - `useEffect(() => { fetch('/matchup-matrix.csv').then(r => r.text()).then(setCsvData); }, [])`.
   - Solange `csvData === null`: Skeleton/Loading-Indikator anzeigen.
3. Datum "2026-04-17" aus dem Footer (Zeile 431) in die CSV-Datei als Kommentarzeile verschieben oder als eigene State-Variable halten (aus dem `fetch`-Response-Header `Last-Modified`).
4. Im Footer-Bereich (Zeile 431): `Source: TrainerHill.com · {datum} · Cells show W-L-T record` — Datum dynamisch aus State.

### Randfälle
- `fetch` schlägt fehl (offline, CORS): Auf mitgelieferte Static-Fallback-CSV zurückfallen oder Fehlermeldung zeigen.
- `EXCLUDED_SLUGS` (Zeile 208: `gardevoir-ex-sv`, `gholdengo-lunatone`) bleibt in der Komponente hardcodiert; das ist korrekt und muss nicht geändert werden.

### Verifikations-Checkliste
- [ ] Build läuft durch (`npx tsc --noEmit`)
- [ ] Matrix zeigt Daten ohne Seitenneustart
- [ ] Footer zeigt korrektes Datum
- [ ] Fehlerzustand (fetch schlägt fehl) zeigt sinnvolle Meldung

---

## Punkt 2 — Aktives Deck in "My Deck" Section: UI fehlt

**Status:** `[x]`

### Problem
`activeDeckId` existiert bereits im Store (`dashboardStore.ts` Zeile 86) und wird korrekt persistiert via `getActiveDeckId()` / `setActiveDeckId()` aus `src/lib/preferences.ts`. Der `setActiveDeck` Action (Zeile 183) setzt die ID und ruft `refresh()` auf. Die `OverviewPage.tsx` (Zeile 9) filtert bereits `deckLogs` nach `activeDeckId`. **Das aktive Deck ist also technisch schon funktional.**

Das Problem ist nur, dass der User in der `DeckSwitcher`-UI (Zeile 69–88) sieht, welches Deck aktiv ist (highlighted chip), aber es keinen expliziten "Als aktiv markieren für Overview"-Mechanismus gibt, der visuell kommuniziert wird.

### Was sich ändern soll
1. In `DeckSwitcher.tsx`: Ein kleines "Aktiv"-Badge oder ein Stern-Icon neben dem active Chip anzeigen, der explizit sagt: "Dieses Deck wird in der Overview und Recommendations verwendet."
2. Im aktiven Deck-Info-Bereich (Zeile 100–108) ein Hinweis: "Aktiv: wird in Overview + Tips verwendet".
3. Auf der `OverviewPage.tsx`: Anzeigen, für welches Deck die Stats angezeigt werden (Deck-Name + Icon in der Page-Header-Zeile).

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/deck/DeckSwitcher.tsx` | Ergänzung | Visual indicator für aktives Deck |
| `src/pages/OverviewPage.tsx` | Ergänzung | Zeige aktives Deck im Header |

### Implementierungsschritte
1. **DeckSwitcher.tsx Zeile 69–88**: Beim active Chip ein kleines `Star`-Icon (Lucide) hinzufügen:
   ```tsx
   {isActive && <Star className="w-2.5 h-2.5 fill-current text-yellow-400" />}
   ```
2. **DeckSwitcher.tsx Zeile 100–108**: Im aktiven Deck-Info-Block:
   ```tsx
   <span className="text-[10px] text-brand-400">Dashboard-Deck</span>
   ```
3. **OverviewPage.tsx Zeile 22–27**: Im Page-Header:
   ```tsx
   {activeDeckId && activeDeck && (
     <p className="text-gray-500 text-sm flex items-center gap-1.5">
       Aktives Deck: <PokemonIcon archetype={activeDeck.archetype} size="sm" />
       <span className="text-gray-300">{activeDeck.archetypeName}</span>
     </p>
   )}
   ```
   Hinweis: `activeDeck` muss destructured werden — ist bereits im Store (Zeile 7).

### Abhängigkeiten
- Punkt 3 (Hero-Background) baut darauf auf, dass `activeDeck` sauber kommuniziert wird.
- Punkt 8 (Tips nur für aktives Deck) ist die funktionale Konsequenz.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Bei Deck-Wechsel ändern sich Overview-Daten
- [ ] Aktives Deck ist in DeckSwitcher visuell klar erkennbar
- [ ] Cold-Start (kein Deck vorhanden): kein Fehler

---

## Punkt 3 — Großes Archetype-Icon als Hintergrund (Hero-Redesign)

**Status:** `[x]`

### Problem
`DeckSpriteBackground.tsx` (komplett gelesen, 99 Zeilen) zeigt aktuell 80x80px Pokemon-Sprites aus den Deck-Karten über die gesamte App verteilt, mit 7% Opazität, pixelated rendering. Das ist ein "Wallpaper"-Effekt aus allen Pokemon im Deck.

Das neue Konzept: Ein **einzelnes großes Hero-Sprite** des aktiven Decks (primäres Pokemon, ~60% der Screen-Breite), zentriert, im Hintergrund. Dazu passende Energie-Typ-Farben und Energie-Typ-Symbole als Akzente.

### Was sich ändern soll
`DeckSpriteBackground.tsx` wird vollständig neu implementiert:
- Statt aller Pokemon-Sprites: nur das **primary sprite** des aktiven Decks (via `activeDeck.archetype`)
- Sprite-Größe: ca. `min(60vw, 600px)`, zentriert, vertikal leicht nach unten versetzt
- Opazität: 0.04–0.06 (minimalistisch)
- `imageRendering: 'pixelated'`
- Hintergrundfarbe: subtiler Gradient basierend auf Energie-Typ (optional)

### Energie-Typ-Farben für Archetype-Slugs
Eine neue `ARCHETYPE_ENERGY_TYPE` Map muss angelegt werden:
```ts
const ARCHETYPE_ENERGY_COLORS: Record<string, string> = {
  'n-zoroark': '#1a1a2e',          // Dunkel/Psycho — dunkelviolett
  'dragapult-dusknoir': '#1a0a2e', // Psycho — lila
  'dragapult-ex': '#1a0a2e',
  'dragapult-blaziken': '#2e1a0a', // Feuer — dunkelorange
  'ogerpon-meganium': '#0a2e0a',   // Gras — dunkelgrün
  // ... usw.
};
```
Das ist optional — wenn kein Eintrag vorhanden, Standard-Hintergrund `bg-gray-950` beibehalten.

### PokemonIcon-Basis nutzen
Die `resolve()`-Funktion aus `PokemonIcon.tsx` (Zeile 122–127) liefert das primary sprite als `pair[0]`. Die SPRITE_BASE URL ist `https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular`.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/DeckSpriteBackground.tsx` | Vollständiger Umbau | Wallpaper → Hero-Sprite |
| `src/components/shared/PokemonIcon.tsx` | Export-Ergänzung | `resolve()` und `SPRITE_BASE` exportieren |

### Implementierungsschritte
1. In `PokemonIcon.tsx`: `resolve` und `SPRITE_BASE` als named exports hinzufügen (aktuell sind beide nur file-local).
2. `DeckSpriteBackground.tsx` neu schreiben:
   - `activeDeck` aus Store lesen: `useDashboardStore((s) => s.activeDeck)`
   - Primary sprite via `resolve(activeDeck.archetype)?.[0]`
   - Ein einzelnes `<img>` mit `position: fixed`, `left: 50%`, `top: 50%`, `transform: 'translate(-50%, -30%)'`, `width: 'min(60vw, 600px)'`, `opacity: 0.05`, `imageRendering: 'pixelated'`
   - `onError` → null (hide gracefully)
3. Optionaler Gradient: `<div style={{ background: 'radial-gradient(circle at center, colorHere 0%, transparent 70%)' }}>`

### Randfälle
- Kein aktives Deck: Komponente gibt `null` zurück (kein Fehler).
- Archetype unbekannt: `resolve()` gibt `undefined` zurück → graceful null.
- Sprite-URL 404: `onError` → hide.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Sprite erscheint nur einmal, nicht mehrfach
- [ ] Kein aktives Deck → kein visuelles Element
- [ ] Inhalt-Ebene (z-index 10 per App.tsx Zeile 32) bleibt immer oberhalb

---

## Punkt 4 — Bessere Deck-Auswahl UX (DeckSwitcher)

**Status:** `[x]`

### Problem
`DeckSwitcher.tsx` zeigt alle Decks als horizontale Chip-Reihe (Zeile 66–97). Bei mehreren Decks entsteht ein mehrzeiliger Chip-Haufen (`flex-wrap`). Es gibt keinen visuellen Unterschied zwischen verschiedenen Archetypen, nur Text + kleines Icon.

### Empfohlene UX: Dropdown-Liste mit Deck-Preview
Statt Chips: ein sauberes Dropdown (oder Selektor) das bei Klick öffnet und die Decks mit Name, Sprite, Win-Rate und Variante zeigt.

**Alternatives Design: Sidebar-Liste (für Desktop)**
Links eine schlanke Deck-Liste (80–120px breit), scrollbar, jedes Deck als Zeile mit Sprite + Name + WR-Badge. Der aktive Eintrag ist highlighted.

**Empfehlung für TCG-Spieler (alle Altersgruppen):** Ein kompakter Dropdown mit Pokemon-Sprite und Name ist intuitiver als Chips. Vorbild: Die Deck-Auswahl in PTCGL selbst.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/deck/DeckSwitcher.tsx` | Umbau Deck-Selection | Chips → Dropdown |

### Implementierungsschritte
1. Den Chip-Strip (Zeile 66–97) ersetzen durch einen custom Dropdown-Trigger:
   ```tsx
   <button onClick={() => setDropdownOpen(v => !v)} className="flex items-center gap-2 ...">
     <PokemonIcon archetype={activeDeck.archetype} size="sm" />
     <span>{deckLabel(activeDeck)}</span>
     <WrPill ... />
     <ChevronDown />
   </button>
   ```
2. Dropdown-Body (`position: absolute`, `z-index: 50`): Liste aller Decks als `<button>` Zeilen mit Sprite, Name, Variante, WR-Pill.
3. "New Deck"-Button bleibt erhalten, wandert ans Ende der Liste.
4. Close-on-outside-click via `useEffect` + `document.addEventListener('mousedown')` Pattern (bereits in `DeckPanel.tsx` Zeile 62–70 als Referenz vorhanden).
5. Der untere Info-Block (Zeile 100–108) mit Deck-Name bleibt — zeigt weiterhin das aktive Deck an.

### Randfälle
- Nur 1 Deck vorhanden: Dropdown funktioniert, zeigt nur 1 Eintrag + "New Deck".
- 0 Decks: Existing Empty-State (Zeile 49–61) bleibt unverändert.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Dropdown schließt beim Klick außerhalb
- [ ] Deck-Wechsel funktioniert
- [ ] Mobile: Dropdown ist fingertippfreundlich (min 44px Zeilenhöhe)

---

## Punkt 5 — Section-Navigation und Trash-Icon UX verbessern

**Status:** `[x]`

### Problem
In `DeckSwitcher.tsx` Zeile 111–129 sind die Section-Buttons ("Deck List" / "Analytics" / "Match Log") als ein `border border-gray-700` Container mit aneinandergereihten Buttons implementiert. Der Trash-Icon (Zeile 131–155) ist direkt daneben — beides im selben `ml-auto flex` Container.

Der Trash ist visuell zu nah an den Section-Buttons und bei versehentlichem Touch leicht auslösbar.

### Was sich ändern soll
1. **Section-Buttons**: Größere Touch-Targets, klarere visuelle Trennung zwischen aktivem/inaktivem Tab. Eventuell als Tab-Bar-Stil mit Border-Bottom statt Pill-Stil.
2. **Trash-Icon**: Größerer Abstand, visuell separiert (eigene Gruppe/Position), oder in ein Kontextmenü (drei Punkte) verlagert.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/deck/DeckSwitcher.tsx` | Refactoring | Section-Buttons + Trash UX |

### Implementierungsschritte
1. **Section-Buttons (Zeile 111–129)**: Tab-Bar-Stil als Border-Bottom-Variante:
   ```tsx
   <div className="flex border-b border-gray-800 -mb-px">
     {sections.map(({ id, label, Icon }) => (
       <button className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5
         ${activeSection === id
           ? 'border-brand-500 text-white'
           : 'border-transparent text-gray-500 hover:text-gray-300'
         }`}>
         <Icon className="w-3.5 h-3.5" />
         {label}
       </button>
     ))}
   </div>
   ```
2. **Trash-Icon**: In die rechte Seite des Deck-Infobalkens verschieben, aber mit `mr-3` Abstand zu den Section-Buttons. Alternativ: in Deck-Settings-Bereich (`SidePanel`) integrieren, wo ohnehin destructive Aktionen sind.
3. Confirm-Delete Mechanismus (Zeile 132–155) bleibt erhalten — nur Positionierung ändert sich.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Delete-Confirm erscheint bei Trash-Klick
- [ ] Section-Switch funktioniert
- [ ] Mobile: alle Elemente sind mit Finger bedienbar (≥44px Zielgröße)

---

## Punkt 6 — "Total"-Kachel aus Deck-Statistiken entfernen

**Status:** `[x]`

### Problem
In `DeckPage.tsx` Zeile 200–213 gibt es 4 Kacheln: Total, Pokemon, Trainers, Energy. Die "Total"-Kachel zeigt `{totalCards}/60` — dieselbe Information ist bereits als Fortschrittsbalken im `DeckPanel.tsx` (Zeile 318–330) sichtbar.

### Was sich ändern soll
1. Die "Total"-Kachel (Zeile 202: `{ label: 'Total', value: \`${totalCards}/60\`, ... }`) entfernen.
2. Stattdessen: Wenn `totalCards !== 60`, einen kleinen Hinweis-Banner über dem DeckPanel anzeigen:
   - `totalCards < 60`: `"Deck unvollständig: ${totalCards}/60 Karten"` (gelb)
   - `totalCards > 60`: `"Deck überfüllt: ${totalCards}/60 Karten"` (rot)
   - `totalCards === 60`: Kein Banner.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/pages/DeckPage.tsx` | Änderung Zeile 201–213 | Total-Kachel entfernen + Banner einfügen |

### Implementierungsschritte
1. **DeckPage.tsx Zeile 201–213**: Das Array von 4 auf 3 Kacheln reduzieren — `{ label: 'Total', ... }` entfernen. Grid von `grid-cols-4` auf `grid-cols-3` ändern.
2. Zwischen `</div>` (Ende Kacheln) und `<DeckPanel ...>` einen bedingten Banner einfügen:
   ```tsx
   {activeDeck && totalCards !== 60 && (
     <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
       ${totalCards > 60
         ? 'bg-red-900/30 border border-red-800/40 text-red-300'
         : 'bg-yellow-900/30 border border-yellow-800/40 text-yellow-300'}`}>
       <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
       {totalCards > 60
         ? `Deck hat ${totalCards} Karten — ${totalCards - 60} zu viele`
         : `Deck hat nur ${totalCards}/60 Karten`}
     </div>
   )}
   ```
3. Import: `AlertTriangle` ist bereits in `DeckPage.tsx` nicht importiert — aus `lucide-react` hinzufügen.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Grid-Layout bricht bei 3 Kacheln nicht (grid-cols-3)
- [ ] Banner erscheint nur wenn Karten ≠ 60
- [ ] Banner verschwindet sobald Deck genau 60 Karten hat

---

## Punkt 7 — Match-Log Detail-Ansicht verbessern (Scroll + Snapshot)

**Status:** `[x]`

### Problem
`MatchDetailModal.tsx` (404 Zeilen) hat drei Tabs: Kampfprotokoll, Statistiken, KI-Analyse. Der scrollbare Body-Bereich (Zeile 298: `flex-1 overflow-y-auto px-5 py-4`) enthält im "Kampfprotokoll"-Tab eine 14-Zeilen-Textarea (Zeile 311). Das führt zu viel Scroll im Modal.

Zusätzlich fehlt: Die Deckliste zum Zeitpunkt des Matches (Snapshot) — `OpponentLog.deckSnapshotId` ist optional und verlinkt auf `DeckSnapshot`. Die Detail-Ansicht zeigt diesen Snapshot derzeit nirgends an.

### Was sich ändern soll
1. **Weniger Scroll**: Die Textarea auf `rows={8}` reduzieren oder ein `max-h` setzen, statt unlimitierter Höhe. Das Modal selbst ist bereits auf `max-h-[92vh]` begrenzt, aber der scrollbare Body-Bereich muss sicherstellen, dass der Save-Button ohne Scroll sichtbar bleibt.
2. **Deck-Snapshot anzeigen**: Einen vierten Tab "Deckliste" (oder Abschnitt unter dem Header) hinzufügen, der die Karten des verlinkten Snapshots anzeigt.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/opponent/MatchDetailModal.tsx` | Ergänzung | Snapshot-Tab + Scroll-Fix |
| `src/db/queries.ts` | keine Änderung | `getDeckSnapshotById` und `parseDeckSnapshot` bereits vorhanden (Zeile 115–121) |

### Implementierungsschritte
1. **Scroll-Fix (Textarea)**:
   - Zeile 311: `rows={14}` → `rows={8}`
   - `className` auf `resize-none` ändern (statt `resize-y`) um unkontrollierte Höhenänderung zu vermeiden.
2. **Neuer Tab "Deckliste"** (wenn `log.deckSnapshotId` vorhanden):
   - Tab-Button hinzufügen (Zeile 260–295 — nach dem Analysis-Tab):
     ```tsx
     {log.deckSnapshotId != null && (
       <button onClick={() => setActiveTab('snapshot')} ...>
         <Layers className="w-3.5 h-3.5" />
         Deckliste
       </button>
     )}
     ```
   - Tab-Body: `useEffect` der beim Öffnen `getDeckSnapshotById(log.deckSnapshotId)` aufruft und `parseDeckSnapshot()` darauf anwendet.
   - Anzeige: eine einfache Liste, gruppiert nach Type (Pokemon / Trainer / Energy), ähnlich wie `DeckPanel` aber read-only. Zeile-Format: `{count}x {name}`.
   - State: `const [snapshot, setSnapshot] = useState<DeckCard[] | null>(null)`.
3. **Import** hinzufügen: `getDeckSnapshotById`, `parseDeckSnapshot` aus `../../db/queries`; `Layers` aus `lucide-react` (bereits importiert Zeile 2).

### Randfälle
- `log.deckSnapshotId` ist `undefined`/`null`: Snapshot-Tab wird nicht gerendert.
- `getDeckSnapshotById` gibt `undefined` zurück (gelöscht): Fehlermeldung im Tab.
- Snapshot enthält keine Karten: "Keine Kartendata vorhanden".

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Ohne deckSnapshotId: kein Snapshot-Tab, kein Fehler
- [ ] Mit deckSnapshotId: Karten werden korrekt angezeigt
- [ ] Textarea ist ohne Scroll bedienbar

---

## Punkt 8 — Tips (Recommendations) nur für aktives Deck

**Status:** `[x]`

### Abhängigkeit
**Voraussetzung:** Punkt 2 muss sicherstellen, dass `activeDeckId` korrekt kommuniziert wird. Technisch ist es aber bereits funktional — `activeDeckId` ist im Store.

### Problem
`RecommendationsPage.tsx` Zeile 10: `const { deckCards, archetypeStats, opponentLogs, deckSnapshots, localMeta } = useDashboardStore()`.

- `deckCards` ist korrekt — bereits gefiltert nach `activeDeckId` in `refresh()` (Store Zeile 155–156).
- `opponentLogs` ist **alle** Logs (`getOpponentLogs()` ohne Filter — Store Zeile 158). Das ist das Problem.
- `archetypeStats` aggregiert alle Decks.
- `deckSnapshots` ist korrekt — gefiltert nach `activeDeckId` (Store Zeile 156).

### Was sich ändern soll
`RecommendationsPage.tsx` soll `opponentLogs` und `archetypeStats` für das aktive Deck filtern.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/pages/RecommendationsPage.tsx` | Ergänzung Zeile 10–12 | Logs/Stats auf aktiveDeck filtern |

### Implementierungsschritte
1. **RecommendationsPage.tsx Zeile 10**: `activeDeckId` aus Store hinzufügen:
   ```ts
   const { deckCards, archetypeStats, opponentLogs, deckSnapshots, localMeta, activeDeckId } = useDashboardStore();
   ```
2. **Zeile 12**: Logs filtern:
   ```ts
   const activeLogs = useMemo(
     () => activeDeckId != null ? opponentLogs.filter((l) => l.deckId === activeDeckId) : opponentLogs,
     [opponentLogs, activeDeckId]
   );
   ```
3. **Zeile 13**: `useRecommendations` bekommt `activeLogs` statt `opponentLogs`:
   ```ts
   const recommendations = useRecommendations({ archetypeStats, deckCards, opponentLogs: activeLogs, deckSnapshots, localMeta, deckStats });
   ```
4. **Zeile 12 (deckStats)**: `computeDeckPerformanceStats(opponentLogs, ...)` → `computeDeckPerformanceStats(activeLogs, ...)`.
5. **Info-Banner (Zeile 30–48)**: `opponentLogs.length` → `activeLogs.length` für korrekte Zählanzeige.
6. Optionaler Hinweis: Im Info-Banner anzeigen, für welches Deck die Tips berechnet werden:
   ```tsx
   <span>Für: <strong className="text-white">{activeDeck?.archetypeName ?? 'Alle Decks'}</strong></span>
   ```

### Randfälle
- Kein aktives Deck: Fallback auf alle Logs (Status quo).
- Deck ohne Logs: Empfehlungen zeigen nur Deck-List-basierte Vorschläge (Boss's Orders, Balls etc.).

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Deck wechseln → Recommendations ändern sich
- [ ] archetypeStats für `useRecommendations` berechnet sich korrekt mit gefilterten Logs

**Hinweis zu archetypeStats**: `archetypeStats` im Store ist `getArchetypeStats()` aus queries.ts — das aggregiert alle Decks. Wenn Punkt 8 vollständig sauber sein soll, müsste `getArchetypeStats` einen `deckId`-Parameter bekommen. Das ist ein optionaler Vertiefungsschritt. Für die meisten Empfehlungen (Tech-Vorschläge, Version-Comparisons) ist es wichtiger, dass `opponentLogs` gefiltert ist.

---

## Punkt 9 — "Result"-Spalte aus Match-Log entfernen

**Status:** `[x]`

### Problem
`OpponentLog.tsx` Zeile 82–155 zeigt eine Tabelle mit den Spalten: Opponent | My Deck | Event | Date | Rd | **Result** | Notes | Actions.

Die "Result"-Spalte (Zeile 136–140) zeigt `Win`/`Loss`/`Tie` als Badge. Das gleiche Signal ist bereits durch den farbigen linken Border und Background-Tint jeder Zeile erkennbar (`RESULT_ROW` Zeilen 18–22). Die Spalte ist redundant und verursacht horizontalen Scroll auf kleinen Screens.

### Was sich ändern soll
1. Die "Result"-Spalte (`<th>` Zeile 93, `<td>` Zeile 133–140) aus der Tabelle entfernen.
2. Das `badge-win`/`badge-loss`/`badge-tie` Badge in den Opponent-Header integrieren (inline nach dem Archetype-Namen) oder komplett weglassen (da Farbe schon reicht).
3. Der linke Border-Farbcode bleibt erhalten — er ist das primäre Signal.

### Betroffene Dateien
| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/components/opponent/OpponentLog.tsx` | Änderung Zeile 93, 133–140 | Result-Spalte entfernen |

### Implementierungsschritte
1. **Zeile 93**: `<th className="text-left px-4 py-2.5 text-gray-400 font-medium text-xs">Result</th>` löschen.
2. **Zeile 133–140**: Den gesamten `<td>` Block mit dem Result-Badge löschen.
3. **Optional**: Das Ergebnis im Opponent-Name-Block (Zeile 105–116) als kleine farbige Punkt-Indicator hinzufügen:
   ```tsx
   <span className={`w-2 h-2 rounded-full shrink-0 ${
     log.result === 'W' ? 'bg-emerald-500' : log.result === 'L' ? 'bg-red-500' : 'bg-yellow-500'
   }`} />
   ```
   Das ist minimal und ersetzt das Badge ohne Platzverschwendung.
4. `RESULT_ROW` (Zeile 18–22) bleibt — wichtig für Farb-Highlighting.

### Verifikations-Checkliste
- [ ] Build läuft durch
- [ ] Kein horizontaler Scroll auf 375px (iPhone SE)
- [ ] Ergebnis ist weiterhin visuell erkennbar durch Zeilenfarbe
- [ ] MatchDetailModal (Zeile 231–235) bleibt unverändert — zeigt Result im Modal-Header

---

## Altbestand — Bestehende Todo-Punkte

**Status:** `[x]`

```
[ ] Gründliches Codereview machen. Inlinedokumentation pflegen für junior software entwickler. Für Lernzwecke.
[ ] Höchstgradig professionelle Dokumentationen erstellen (im .md Format). Einen Dokumentationsordner anlegen, Funktionsweisen als Ablaufdiagramm erstellen und erklären. Datenstrukturen erklären. README.md auf den aktuellen Stand bringen. Vor allem die Vorgehensweise mit der Benutzung von Agents.
[ ] UI/UX optimieren. Zielgruppe — TCG-Spieler im Alter von 8–50 Jahren. Schnelle Benutzung — einfaches Eintragen von Matchdaten — Mobile-First-Ansatz. Funktionsweise bleibt dabei bestehen. Es geht um das Erscheinungsbild der App und die Bedienbarkeit und Anordnung der Komponenten. Was kann verbessert werden. Ich möchte die kleinen Pokemon Icons wie auf limitlesstcg.com für eine einfachere visuelle Sichtbarkeit. Win/Lose Highlighting. Überarbeite die App so, dass sie auch von Kindern ab 6 Jahren bedient werden kann.
[ ] Analyse der Datenerhebung, Berechnungen und Analysen. Was kann verbessert werden.
```

---

## Implementierungs-Reihenfolge (Empfehlung)

Punkte die voneinander abhängen:
- **Punkt 2** (Active Deck UI) → **Punkt 8** (Tips filter) → **Punkt 3** (Hero-Background)
- **Punkt 9** (Result-Spalte) ist vollständig unabhängig — schnellster Punkt
- **Punkt 6** (Total-Kachel) ist vollständig unabhängig
- **Punkt 4** + **Punkt 5** (DeckSwitcher UX) können gemeinsam angegangen werden
- **Punkt 1** (Matrix Auto-Refresh) ist unabhängig
- **Punkt 7** (Match Detail) ist unabhängig

Vorgeschlagene Reihenfolge für einen Agent: **9 → 6 → 2 → 8 → 5 → 4 → 3 → 7 → 1**
