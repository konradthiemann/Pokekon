# Deck & Match Log Flow Overhaul — Implementation Plan

**Generated:** 2026-04-27
**Scope:** CreateDeckModal, ImportDeckModal, AddLogModal + supporting lib/db files
**Mandate:** Fix UX friction and code correctness issues identified in full audit.

---

## Severity Legend

- CRITICAL — data loss or silent corruption; fix before any release
- HIGH — broken UX flow; blocks or misleads users regularly
- MEDIUM — meaningful friction; hurts power users and data quality
- LOW — polish; worth doing but not blocking

---

## Phase 1 — Critical & Safety Fixes (Quick Wins, ~2–3h total)

### P1-1: Guard clearDeck against undefined deckId in importCards

**Files:** `src/lib/deckImport.ts:141–146`, `src/db/queries.ts:81–86`
**Severity:** CRITICAL

The `importCards` function passes `deckId` straight to `clearDeck`. When `deckId` is `undefined`, `clearDeck` calls `db.deckCards.clear()` — wiping every card in every deck for every user. The Replace checkbox defaults to `true`, making this trivially triggerable.

**Fix:**
1. In `importCards`, add an early guard:
   ```ts
   if (replaceExisting && deckId === undefined) {
     throw new Error('Cannot replace deck: no active deck selected.');
   }
   ```
2. In `ImportDeckModal`, disable the Import button and show an inline error if `activeDeckId` is null.
3. Optional hardening: add a JSDoc `@param deckId` note to `clearDeck` clarifying that `undefined` clears ALL decks, and consider renaming the undefined-branch to `clearAllDecks()` to make call sites intentional.

**Estimated effort:** 30 min

---

### P1-2: Default Replace toggle to false

**File:** `src/components/deck/ImportDeckModal.tsx:29`
**Severity:** HIGH → quick fix

Change `useState(true)` to `useState(false)`. Add a yellow warning text under the checkbox when it is checked: "This will delete all existing cards in the current deck." No other changes needed.

**Estimated effort:** 15 min

---

### P1-3: Surface save error in AddLogModal

**File:** `src/components/opponent/AddLogModal.tsx:99–120`
**Severity:** HIGH

Add `const [saveError, setSaveError] = useState<string | null>(null)`. In the catch block: `setSaveError(err instanceof Error ? err.message : 'Failed to save match')`. Render the error above the footer buttons the same way `ImportDeckModal` renders `importError` (lines 166–170 of that file for reference).

**Estimated effort:** 20 min

---

### P1-4: Wrap importCards in a Dexie transaction

**File:** `src/lib/deckImport.ts:141–146`
**Severity:** HIGH (data integrity on partial failure)

```ts
export async function importCards(cards: ParsedCard[], replaceExisting: boolean, deckId?: number): Promise<void> {
  if (replaceExisting && deckId === undefined) {
    throw new Error('Cannot replace deck: no active deck selected.');
  }
  await db.transaction('rw', db.deckCards, async () => {
    if (replaceExisting) await clearDeck(deckId);
    for (const c of cards) {
      await upsertDeckCard({ name: c.name, count: c.count, type: c.type, role: c.role, cardId: 0 }, deckId);
    }
  });
}
```

This also improves import performance (~10x fewer round-trips vs. the current sequential loop).

**Estimated effort:** 20 min

---

## Phase 2 — Shared Archetype Constant (High Impact, ~1.5h)

### P2-1: Extract canonical archetype list to a shared module

**Files:** `src/constants/archetypes.ts` (new), `CreateDeckModal.tsx:7–56`, `AddLogModal.tsx:16–24`
**Severity:** HIGH (data consistency; affects stats correlation)

The two `KNOWN_ARCHETYPES` constants are out of sync: 47 entries with `{ slug, name }` shape in CreateDeckModal vs. 21 plain strings in AddLogModal. Archetypes created via the 47-entry list (e.g. "Mega Dragonite", "Hydreigon") are not tappable in AddLogModal, forcing the "Other…" path and producing unmatched archetype strings in stats.

**Fix:**
1. Create `src/constants/archetypes.ts`:
   ```ts
   export interface KnownArchetype {
     slug: string;
     name: string;
   }
   export const KNOWN_ARCHETYPES: KnownArchetype[] = [
     // canonical 47-entry list (from CreateDeckModal — this is already the more complete list)
     { slug: 'dragapult-ex', name: 'Dragapult ex' },
     // ... all 47 entries
   ];
   ```
2. Replace local constant in `CreateDeckModal.tsx` with import from the new module.
3. Replace local constant in `AddLogModal.tsx` with import, and use `.map(a => a.name)` or use the full object (enables PokemonIcon dual sprite on tiles without extra lookup).
4. Extend the AddLogModal tile grid to show all 47 archetypes (same grid with `max-h-64` to give more space). Remove the 21-entry limitation — the shorter list was not an intentional UX decision, just an oversight.

**Decision required from user:** Should the archetype list be populated dynamically from `metaSnapshots` in the DB instead of hardcoded? If yes, new archetypes added via meta sync would automatically appear in both modals. This is the ideal long-term solution but requires a store selector and a loading state. See Question 1 in the report.

**Estimated effort:** 60–90 min

---

## Phase 3 — AddLogModal UX Improvements (Medium, ~2h)

### P3-1: Remove double-scroll trap on mobile

**File:** `src/components/opponent/AddLogModal.tsx:157`
**Severity:** MEDIUM

Remove `max-h-52 overflow-y-auto` from the archetype grid wrapper. Instead, use a CSS grid with `grid-cols-2` that simply expands to fit all tiles. The outer modal scroll (`max-h-[92vh] overflow-y-auto` on line 124) handles overflow. On mobile this means the user scrolls the modal, not a nested sub-container — standard mobile UX pattern.

**Estimated effort:** 15 min

---

### P3-2: Remove result pre-selection (or add "none" as default)

**File:** `src/components/opponent/AddLogModal.tsx:67`
**Severity:** MEDIUM (data quality)

Change `useState<MatchResult>('W')` to `useState<MatchResult | null>(null)`. Update the disabled condition on the save button to also require `result !== null`. This prevents accidental win-logging and produces cleaner stats over time. If the user wants a pre-selection, "Win" is the least representative default — consider no default.

**Estimated effort:** 30 min

---

### P3-3: Promote "Round" field out of the details collapse

**File:** `src/components/opponent/AddLogModal.tsx:250–266`
**Severity:** MEDIUM

Move the Round input to the main visible section (below Event Type / Date). Keep Notes, Deck Version, and Battle Log in the collapse. Round is competitive metadata that should be primary, not hidden. Event type + date + round form a natural trio.

**Estimated effort:** 20 min

---

### P3-4: Fix deckSnapshotId initialization

**File:** `src/components/opponent/AddLogModal.tsx:70–72`
**Severity:** MEDIUM

Replace the lazy initializer with `''` (empty):
```ts
const [deckSnapshotId, setDeckSnapshotId] = useState<number | ''>('');
```
Remove the dependency on `deckSnapshots[0]?.id` at init time. The dropdown already starts with "— Untagged —" as the first option, so defaulting to untagged is the correct UX default. The current behavior pre-selects the first snapshot, which users likely do not intend.

**Estimated effort:** 10 min

---

## Phase 4 — Create Deck Flow Improvements (Medium, ~1.5h)

### P4-1: Success state + prompt to import cards

**File:** `src/components/deck/CreateDeckModal.tsx:110–120`
**Severity:** MEDIUM

After `createNewDeck` resolves, instead of calling `onClose()` immediately, show an inline success state:
- "Deck created! Import a card list now?" with two buttons: "Import Cards" (opens ImportDeckModal) and "Done".
- This bridges the two-step create-then-import flow which is currently invisible to new users.

**Estimated effort:** 45 min

---

### P4-2: Fix slug generation for custom archetype names

**File:** `src/components/deck/CreateDeckModal.tsx:114`
**Severity:** MEDIUM

The current fallback slug generation:
```ts
archetypeName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
```
Strips apostrophes silently: "N's Zoroark" → `"ns-zoroark"` instead of the canonical `"n-zoroark"`. This breaks the PokemonIcon sprite lookup.

Fix: apply the apostrophe strip BEFORE other replacements, or use `replace(/'/g, '')` before the final `[^a-z0-9-]` strip, and add a note in the UI that the archetype icon may not be available for custom names.

**Estimated effort:** 15 min

---

### P4-3: Add Enter-key support to archetype combobox

**File:** `src/components/deck/CreateDeckModal.tsx:150–159`
**Severity:** LOW

Add `onKeyDown` handler to the search input:
```ts
onKeyDown={(e) => {
  if (e.key === 'Enter' && filtered.length > 0) {
    handleSelect(filtered[0].slug, filtered[0].name);
  }
}}
```

**Estimated effort:** 20 min

---

## Phase 5 — Accessibility & Visual Consistency (Low, ~1h)

### P5-1: Add aria-label to all close buttons

**Files:** All three modals, close button elements
**Severity:** LOW

Add `aria-label="Close"` to every `<button onClick={onClose}>` that contains only an icon. Screen readers currently announce "button" with no context.

**Estimated effort:** 10 min

---

### P5-2: Unify modal header border token

**Files:** CreateDeckModal.tsx:127, ImportDeckModal.tsx:68, AddLogModal.tsx
**Severity:** LOW

Use a single token `border-white/[0.07]` (or create a shared `modal-header-border` class in Tailwind config) across all three modal headers.

**Estimated effort:** 10 min

---

### P5-3: Fix bilingual placeholder in ImportDeckModal

**File:** `src/components/deck/ImportDeckModal.tsx:93`
**Severity:** LOW

Change `"Energie: 1"` in the placeholder to `"Energy: 1"`. The parser already accepts both spellings.

**Estimated effort:** 5 min

---

### P5-4: Add step indicator to ImportDeckModal

**File:** `src/components/deck/ImportDeckModal.tsx`
**Severity:** LOW

Add a simple `Step 1 of 2` / `Step 2 of 2` label below the modal header (the "done" screen is a terminal state, not really a navigable step). A dot-progress or numbered label is sufficient.

**Estimated effort:** 20 min

---

## Summary: Effort vs. Impact Matrix

| Phase | Items | Effort | Impact |
|-------|-------|--------|--------|
| P1 — Safety fixes | P1-1 through P1-4 | ~1.5h | CRITICAL/HIGH |
| P2 — Shared archetype list | P2-1 | ~1.5h | HIGH |
| P3 — AddLogModal UX | P3-1 through P3-4 | ~1.25h | MEDIUM |
| P4 — CreateDeckModal flow | P4-1 through P4-3 | ~1.5h | MEDIUM |
| P5 — A11y + polish | P5-1 through P5-4 | ~45min | LOW |

**Total estimate:** ~6.5h of implementation work.

---

## Open Questions for User

**Q1 — Dynamic vs. hardcoded archetype list?**
Should `KNOWN_ARCHETYPES` be populated from the `metaSnapshots` table in Dexie (populated when the user syncs meta data) rather than hardcoded? This would mean the tile grid in AddLogModal and the combobox in CreateDeckModal automatically reflect the current meta without code changes. Requires a store selector and a loading state.

**Q2 — Should AddLogModal close on successful save, or show a "Log another match" affordance?**
Currently it closes immediately. For tournament logging (multiple rounds), a "Log another match" or "Log another round" button could significantly reduce friction. Does Konrad log matches one-at-a-time or in bulk after an event?
