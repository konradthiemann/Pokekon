---
name: Archetype List Duplication Bug
description: KNOWN_ARCHETYPES defined twice with divergent content — 47 objects in CreateDeckModal vs. 21 strings in AddLogModal. Fix: shared src/constants/archetypes.ts
type: project
---

Two separate `KNOWN_ARCHETYPES` constants exist with divergent content and different shapes:
- `src/components/deck/CreateDeckModal.tsx` lines 7–56: 47 entries, `{ slug: string, name: string }` shape
- `src/components/opponent/AddLogModal.tsx` lines 16–24: 21 entries, plain `string[]`

The lists are not subsets of each other — archetypes available at deck-creation time are not available as log tiles, forcing users into the "Other…" custom path which produces unmatched archetype strings that break stats correlation.

**Why:** This was likely an oversight — AddLogModal was written earlier with a smaller meta, CreateDeckModal added more archetypes later without updating AddLogModal.

**How to apply:** Any time either modal is touched, check the other. The fix is a shared `src/constants/archetypes.ts` module. Refactor plan at: `/Users/konrad.thiemann/tcg/tcg-dashboard/docs/refactor-plans/deck-and-log-flow-overhaul.md` (P2-1).
