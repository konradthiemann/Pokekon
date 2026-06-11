# Plan: UI Redesign — Deck Simplification + Active Deck Background Identity

## Kontext

Two parallel changes:
1. **Deck simplification**: Remove the "variant" concept from the UX. The `variant` field stays in the DB schema to avoid a migration, but the UI stops surfacing it as a hierarchy. Every deck is just a deck — named freely, activated independently. The archetype grouping + variant row in `DeckSwitcher` is replaced with a flat deck list.
2. **Active deck visual identity**: The app background subtly displays PokeAPI sprites of all Pokemon in the active deck. Every content section gains glassmorphism (backdrop-blur + semi-transparent bg + subtle border) so sprites show through without obscuring content.

---

## Betroffene Dateien

| Datei | Änderungstyp | Grund |
|-------|-------------|-------|
| `src/types/index.ts` | Ergänzung | New `activeDeckPokemon` helper type; `Deck.variant` stays (no removal) |
| `src/db/database.ts` | No change | ✅ `variant` field already present, no schema migration needed |
| `src/db/queries.ts` | Ergänzung | New `getPokemonNamesForDeck(deckId)` query |
| `src/store/dashboardStore.ts` | Ergänzung | New `activeDeckPokemon: string[]` state; populated in `refresh()` |
| `src/index.css` | Modifikation | `.card` glassmorphism replacement; new `.glass` utility; background-sprite CSS variables |
| `src/App.tsx` | Modifikation | Add `<DeckSpriteBackground>` as sibling to `<Sidebar>` inside root div |
| `src/components/DeckSpriteBackground.tsx` | Neu | Renders sprite `<img>` tags absolutely, reads from store |
| `src/components/deck/DeckSwitcher.tsx` | Modifikation | Remove archetype-grouping + variant row; flat deck list instead |
| `src/components/deck/CreateDeckModal.tsx` | Modifikation | Remove variant name field from form; `createNewDeck` called with empty string or derived value |
| `src/pages/DeckPage.tsx` | Modifikation | Remove `DeckSettingsWidget`'s variant label input; rename section header |

---

## Antworten auf die 5 Kernfragen

### 1. What is the "variant" system?

✅ Belegt — `Deck` type (`src/types/index.ts` line 27):
```ts
variant: string;  // e.g. "Fezandipiti Build", "Standard"
```
`variant` is a plain string field on the `Deck` record — **not a separate table**. It is a secondary label within the same archetype. Multiple decks can share the same `archetype` slug (e.g. `"n-zoroark"`) but differ by `variant` label. The `DeckSwitcher` groups decks by `archetype` in a tab strip (lines 41–48), then shows a second "Variant" chip-row when multiple decks share that archetype (lines 53–55).

The variant row is purely cosmetic grouping logic in the component — there is no foreign-key relationship or variant table in the DB.

### 2. Data model changes needed

**No DB schema migration is required.** The `variant` column stays. Strategy: stop requiring it in UX, keep accepting/storing it so existing data is preserved.

Changes:
- `createNewDeck` in the store (line 77) currently requires a `variant` argument — callers should pass `''` or auto-derive a name. The store function signature should become `(archetype, archetypeName, deckName)` where `deckName` is stored in `variant` for backward compat. This way "deck name" = what was `variant`, archetypeName is still the archetype display name.
- `DeckSettingsWidget` in `DeckPage.tsx`: keep the `variant` input but relabel it "Deck Name" (not variant). Remove the "New variant of this deck" section entirely (the `duplicateDeckAsVariant` action + `Copy` section, lines 128–159).
- `DeckSwitcher`: replace archetype-grouped tabs + variant chip row with a simple flat list of all decks, each clickable to activate. This is the primary visual simplification.

### 3. Background sprite display — technical approach

**Where in the component tree**: `App.tsx`. Add `<DeckSpriteBackground />` as a fixed-position child of the root `<div className="flex min-h-screen bg-gray-950">`, rendered before `<Sidebar>`. It must be `position: fixed`, `inset-0`, `z-0`, `pointer-events-none` so it underlies everything.

**How to get the Pokemon list**: New store state `activeDeckPokemon: string[]` populated in `refresh()` by calling a new query `getPokemonNamesForDeck(activeDeckId)`. That query filters `deckCards` where `type === 'Pokemon'` and returns the `name` array. Already available: `deckCards` is loaded in `refresh()` (line 155) — so `activeDeckPokemon` can be derived right there without an extra DB call:
```ts
const pokemon = deckCards
  .filter(c => c.type === 'Pokemon')
  .map(c => c.name);
```
No new query function is strictly needed — it can be derived from the already-loaded `deckCards` in the store's `refresh()`.

**Sprite URL**: PokeAPI sprite CDN is free:
`https://img.pokemondb.net/sprites/sword-shield/icon/{name-slug}.png`
OR the canonical free option:
`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{dex-number}.png`

The safest, free, no-auth approach: use `https://img.pokemondb.net/sprites/sword-shield/icon/{slug}.png` where slug is lowercased, spaces-to-hyphens name. Icon sprites are 40×30px. Fallback: silently hide broken images with `onError`.

Alternatively use the PokeAPI GET to resolve name→dex-id for the larger front sprite. But that adds network calls. For a background effect, icon sprites (40×30) at low opacity are sufficient and require no API calls.

**Quantity**: Display up to ~20–25 sprite instances. With a 60-card deck there are at most ~20 distinct Pokemon lines. Repeat/tile them across the background area. Use `useMemo` to deduplicate by name. If a deck has fewer than 5 Pokemon, fill remaining slots with repeats to cover the background.

**Size and opacity**: Each sprite rendered at `width: 80px` (2x icon) or `width: 120px` for a more prominent presence. Opacity: `0.06–0.10` for subtle. Use `image-rendering: pixelated` to keep the pixel art crisp at 2x.

**Layout**: Absolute-positioned sprites scattered across the background using deterministic pseudo-random positions computed from the sprite index (seeded by name hash so positions don't jump on re-render). A simple approach: divide the viewport into a grid of cells, place one sprite per cell with a small offset.

### 4. CSS glassmorphism approach

✅ Belegt — current `.card` in `src/index.css` (line 21):
```css
.card {
  @apply bg-gray-900 border border-gray-800 rounded-xl p-4;
}
```

**Replace `.card` with glassmorphism**:
```css
.card {
  @apply rounded-xl p-4
         border border-white/8
         bg-gray-900/75
         backdrop-blur-md;
}
```

Key values:
- `bg-gray-900/75` — 75% opaque dark, background sprites visible through 25% transparent gap
- `backdrop-blur-md` — 12px blur for frosted glass effect (Tailwind `md` = 12px)
- `border border-white/8` — very subtle light border gives depth, replaces the current `border-gray-800`

For the Sidebar (currently `bg-gray-900 border-r border-gray-800` in `Sidebar.tsx` line 34), add `backdrop-blur-md bg-gray-900/80` so it also participates in the glass effect.

**No new `.glass` utility class needed** — modifying `.card` is sufficient. The sidebar and modals can get the same treatment inline.

**Tailwind config**: Add `backdropBlur` is already part of core Tailwind — no plugin needed. The `/75` opacity modifier works without config changes.

**Important**: The root `<div className="flex min-h-screen bg-gray-950">` in `App.tsx` becomes `bg-transparent` once the sprite layer is behind it — but since sprites are `position: fixed` and the main layout is normal flow, `bg-gray-950` on `body` (already set in `index.css` line 11) provides the fallback dark fill. The root div's `bg-gray-950` should be removed or kept as the actual "canvas" behind the sprites — keep it on `body`, remove from the flex div.

### 5. Migration for existing Dexie data

**No schema migration needed.** The `variant` field stays in the DB unchanged (it will just be used as "deck name" going forward). No `version(4)` is required.

The only consideration: existing records created with `variant: 'Default'` or `variant: 'Standard'` will still display correctly since the UI will now show `variant` as the deck name. If `variant` is empty string, the UI should fall back to `archetypeName`.

---

## Implementierungsschritte

### Step 1 — Store: add `activeDeckPokemon` state

**File**: `src/store/dashboardStore.ts`

Add to `DashboardState` interface:
```ts
activeDeckPokemon: string[];  // deduplicated Pokemon names from active deck
```

Add to initial state:
```ts
activeDeckPokemon: [],
```

In `refresh()`, after `deckCards` is loaded (after line 161), derive and set:
```ts
const activeDeckPokemon = [...new Set(
  deckCards.filter(c => c.type === 'Pokemon').map(c => c.name)
)];
```
Include `activeDeckPokemon` in the `set({...})` call.

### Step 2 — New component: `DeckSpriteBackground`

**File**: `src/components/DeckSpriteBackground.tsx` (new file)

- Reads `activeDeckPokemon` from store
- Computes a list of sprite entries: dedup names, then tile to fill ~24 slots
- Converts each name to a pokemondb.net icon slug (lowercase, spaces→hyphens, strip special chars like `ex`, `V`, `VMAX` — keep base species name for sprite lookup)
- Renders `<img>` tags positioned via inline style using a deterministic grid layout
- Props: none (reads from store directly)
- Must be `position: fixed`, `inset: 0`, `z-index: 0`, `pointer-events: none`, `overflow: hidden`

Name-to-slug conversion logic (important — handles TCG naming conventions):
```ts
function toSpriteSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(ex|v|vmax|vstar|gx|ex)\s*$/i, '')  // strip TCG suffixes
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')  // strip apostrophes, dots
    .replace(/^-+|-+$/g, '');
}
```

Sprite URL: `https://img.pokemondb.net/sprites/sword-shield/icon/${slug}.png`

Grid layout: divide into a 6×4 grid (24 cells), each cell is `(100/6)vw` × `(100/4)vh`. Place sprite at cell center + small seeded offset.

### Step 3 — index.css: glassmorphism `.card` + root background

**File**: `src/index.css`

Replace `.card` definition:
```css
.card {
  @apply rounded-xl p-4
         border border-white/[0.08]
         bg-gray-900/75
         backdrop-blur-md;
}
```

Remove `bg-gray-950` from `body` — keep it, but add it as the fixed background color. The sprite layer renders over it.

### Step 4 — App.tsx: integrate sprite background + fix root div

**File**: `src/App.tsx`

- Import `DeckSpriteBackground`
- Remove `bg-gray-950` from the root flex div (body already provides it)
- Add `<DeckSpriteBackground />` as first child of the root div (before `<Sidebar>`)
- Ensure main content and sidebar sit at `z-index: 1` or above — add `relative z-10` to the sidebar and main wrapper divs

```tsx
<div className="flex min-h-screen">
  <DeckSpriteBackground />
  <Sidebar />
  <main className="relative z-10 flex-1 overflow-y-auto pb-16 md:pb-0">
    ...
  </main>
  <BottomNav />
</div>
```

### Step 5 — DeckSwitcher: flatten deck list, remove variant row

**File**: `src/components/deck/DeckSwitcher.tsx`

Remove:
- `archetypeGroups` memo (lines 41–48) — no more archetype grouping
- `activeGroup`, `variants`, `showVariantRow` variables (lines 52–54)
- The entire variant chip row JSX (lines 132–176)
- The `selectArchetype` function (lines 56–63)

Replace archetype tab strip with a flat horizontal list of all decks:
- Each deck is a pill/chip button showing `deck.variant || deck.archetypeName` as its label
- Active deck gets highlight style
- Win rate pill shown on each
- The "New" button stays
- Delete button stays (targets active deck)

New layout for the content strip: since there's no longer a two-row (tab + variant) structure, collapse to a single `<div>` with:
- Left: scrollable flat deck chips
- Right: section switcher + delete (as before)

The `card rounded-tl-none border-t-0` connected-to-tab styling is no longer needed — replace with just `card` (or a simpler container).

### Step 6 — CreateDeckModal: remove variant field

**File**: `src/components/deck/CreateDeckModal.tsx`

- Remove the "Variant Name" `<div>` block (lines 103–116)
- The `variant` state variable: repurpose as `deckName` — what the user types becomes both the variant (stored in DB) and the display name
- Actually: simplest approach is to keep `variant` state, rename the label to "Deck Name (optional)", remove the explanatory text about variants. The modal becomes: Archetype picker + optional deck name field.
- The `createNewDeck` call stays identical — just the label changes

### Step 7 — DeckPage / DeckSettingsWidget: simplify settings panel

**File**: `src/pages/DeckPage.tsx`

In `DeckSettingsWidget`:
- Keep: Archetype name input, Limitless slug (advanced), Save button
- Remove: `variant` input field entirely (lines 79–90 in the widget)
- Remove: "New variant of this deck" section (lines 128–159) — the entire `<Copy>` block, `newVariantName` state, `copying` state, `handleCreateVariant` function
- Remove imports: `Copy`, `duplicateDeckAsVariant` from store destructuring
- Rename section description: "Rename this deck or update its archetype link."

Page header text update:
- Line 185: `<h1>` stays "My Decks" — fine
- Line 186: update subtitle to "Switch between your decks or manage the active one."

### Step 8 — Sidebar glassmorphism

**File**: `src/components/layout/Sidebar.tsx`

Line 34: change `bg-gray-900` to `bg-gray-900/80 backdrop-blur-md` on the `<aside>` element. Keep `border-r border-gray-800`.

---

## Schnittstellen

### New store state
```ts
// Added to DashboardState interface
activeDeckPokemon: string[];  // deduplicated Pokemon names from active deck cards
```

### DeckSpriteBackground component
```tsx
// src/components/DeckSpriteBackground.tsx
// No props — reads activeDeckPokemon from useDashboardStore
export function DeckSpriteBackground(): JSX.Element | null
```

### Simplified createNewDeck signature (no change to actual signature)
```ts
// store action — signature unchanged, callers just pass '' or a name for variant
createNewDeck: (archetype: string, archetypeName: string, deckName: string) => Promise<number>
```

---

## Risiken & Randfälle

1. **Sprite 404s**: TCG card names like "N's Zoroark ex" have no direct sprite. The slug conversion strips `ex`, `V`, `VMAX`, but names with possessives (N's), accents, or special chars may still fail. `onError` must hide the image silently (`display: none`). Result: some background cells empty — acceptable.

2. **`backdrop-blur` performance**: On low-end hardware, `backdrop-blur-md` on every `.card` can cause GPU jank. Consider adding `will-change: transform` to the root container, and test with 20+ visible cards. If perf is unacceptable, a single large blurred overlay div (covering everything) is a lighter alternative to per-card blur.

3. **`border-white/[0.08]` Tailwind v3 syntax**: The arbitrary opacity modifier `[0.08]` requires Tailwind v3.1+. ✅ Confirmed — `brand` color with slash opacity is already used in the codebase (e.g. `bg-brand-700/30` in `DeckPage.tsx` line 152), so the project is on a compatible Tailwind version.

4. **Variant data for existing decks**: Existing decks have `variant: 'Default'` or `variant: 'Standard'` (from `database.ts` line 59 and store line 131). After the UI change, these will display as the deck name. Users whose deck is named "Standard" will see that as the deck chip label — expected, acceptable.

5. **`DeckVariantStats` type in `types/index.ts`**: This type (lines 192–212) and the `getDeckVariantStats` query function still reference `variant` and group by archetype. They are used by `DeckAnalyticsPanel`. That panel should still work without changes (it receives `decks` prop and groups them). However the "variant comparison" UI within `DeckAnalyticsPanel` may look odd if all decks are flat — check that component before marking Step 5 complete. ⚠️ Vermutung — DeckAnalyticsPanel not read in this planning session.

6. **DeckSwitcher `card rounded-tl-none border-t-0` connected styling**: These classes create the visual "content panel below the tab" effect. Once the tab strip is replaced with a flat chip list, those special rounding overrides must be removed or the card will have a flat top-left corner for no reason.

7. **BottomNav glassmorphism**: `BottomNav.tsx` not read. It likely has a solid background for mobile. Should also receive `bg-gray-900/80 backdrop-blur-md` treatment. ⚠️ Vermutung — implementer should check.

8. **`activeDeckPokemon` on initial load with no decks**: `deckCards` is `[]` when no deck exists. The filter/map produces `[]`. `DeckSpriteBackground` renders nothing. Safe.

---

## Verifikations-Checkliste

- [ ] `npx tsc --noEmit` passes — no type errors from new store state
- [ ] Cold start (empty DB): no sprite background, no deck chips, no crash
- [ ] Existing deck with Pokemon cards: sprites visible in background at correct opacity
- [ ] Existing deck with 0 Pokemon cards (all Trainers): background shows nothing, no broken images
- [ ] Switching active deck: background sprites update to new deck's Pokemon
- [ ] `.card` glassmorphism: content readable against sprite background
- [ ] Mobile view: `BottomNav` does not occlude sprites in a jarring way
- [ ] Create new deck via modal: no variant field visible, deck appears in flat list
- [ ] Delete deck: if last deck deleted, background clears, no crash
- [ ] Deck settings: variant label input gone, archetype name + slug still editable
- [ ] `DeckAnalyticsPanel` still renders without errors (uses `decks` prop, not UI-level variant grouping)
