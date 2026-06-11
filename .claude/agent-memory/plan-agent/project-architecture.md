---
name: TCG Dashboard architecture overview
description: Core architecture patterns, file locations, and constraints for the Pokemon TCG Meta Dashboard
type: project
---

## Stack
- React + TypeScript + Vite
- Tailwind CSS v3 (brand color = purple/fuchsia scale, custom `brand` token in tailwind.config.js)
- Zustand store at `src/store/dashboardStore.ts` — single store, all state here
- Dexie (IndexedDB) at `src/db/database.ts` — currently on version 3
- Queries layer: `src/db/queries.ts` — all DB access goes through here, never directly from components

## Design tokens
- `.card` in `src/index.css` = `bg-gray-900 border border-gray-800 rounded-xl p-4` (central card class, used everywhere)
- `btn-primary`, `btn-ghost`, `badge-*` utility classes also in `src/index.css`
- Dark theme: `bg-gray-950` body, `bg-gray-900` panels

## Dexie schema history
- v1: cards, deckCards, opponentLogs, metaSnapshots (no deck concept)
- v2: added deckSnapshots
- v3: added decks table, added deckId FK to deckCards/deckSnapshots/opponentLogs

## Deck data model
- `Deck` type has: `archetype` (Limitless slug), `archetypeName` (display), `variant` (sub-label), `createdAt`
- `variant` is a plain string on the Deck record — NOT a separate table
- Multiple decks can share the same `archetype` slug (grouped as "variants" in current UI)
- `activeDeckId` stored in localStorage via `src/lib/preferences.ts`

## State flow
- All mutations go: UI → store action → queries.ts → Dexie → store.refresh() → re-render
- `refresh()` is the single rehydration function — called after every mutation
- No direct Dexie access from components

## Component tree (App.tsx)
```
div.flex.min-h-screen.bg-gray-950
  Sidebar (hidden md:flex, w-56)
  main.flex-1.overflow-y-auto
    div.max-w-screen-2xl (page content)
  BottomNav (mobile only)
```

## Key files
- `src/pages/DeckPage.tsx` — deck management page, contains DeckSettingsWidget inline
- `src/components/deck/DeckSwitcher.tsx` — deck tab strip + variant row
- `src/components/deck/CreateDeckModal.tsx` — new deck form
- `src/components/layout/Sidebar.tsx` — desktop sidebar
- `src/lib/preferences.ts` — localStorage helpers (activeDeckId, localMeta, deckArchSlug)

## PokemonIcon patterns
- `src/components/shared/PokemonIcon.tsx` — resolve(archetype) returns Pair ([primary, secondary?])
- SPRITE_BASE = 'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular'
- resolve() and SPRITE_BASE are file-local — must be exported if used in other components
- SLUG_SPRITES handles Limitless kebab slugs, ARCHETYPE_SPRITES handles display names
- SIZE_PX: sm=24px, md=40px

## DeckSpriteBackground
- Currently renders all Pokemon from deckCards as 80px sprites tiled across viewport (opacity 0.07)
- Plan: Replace with single hero sprite from activeDeck.archetype via resolve()

## MatchupMatrix
- Static CSV hardcoded in MatchupMatrix.tsx — ~200 lines of raw data
- No live-fetch mechanism; all parsing done via parseCsv() local function
- EXCLUDED_SLUGS: gardevoir-ex-sv, gholdengo-lunatone (G-regulation, rotated April 2026)

## activeDeckId flow
- Persisted in localStorage via preferences.ts
- Store initializes from getActiveDeckId() (Zeile 86 in dashboardStore.ts)
- deckCards, deckSnapshots are filtered per activeDeck in refresh()
- opponentLogs are loaded ALL (no deck filter) in refresh() — filtering done in components

## Snapshot mechanism
- getDeckSnapshotById(id) and parseDeckSnapshot(snap) exist in queries.ts (lines 115–121)
- OpponentLog.deckSnapshotId links a match to a deck version
- MatchDetailModal does NOT currently show the linked snapshot's card list
