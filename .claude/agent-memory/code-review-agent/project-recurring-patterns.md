---
name: TCG Dashboard recurring code quality patterns
description: Anti-patterns and issues found repeatedly in the tcg-dashboard codebase
type: project
---

## Recurring patterns to watch for in future reviews

### 1. Missing `localMeta` dependency in `useRecommendations`
`useRecommendations` (hooks/useRecommendations.ts) omits `localMeta` from its `useMemo` dependency array, causing stale closure when localMeta changes. Watch for missing deps in any useMemo/useCallback in this codebase.

### 2. Direct Dexie writes in components (bypassing store)
`DeckPanel.tsx` calls `deleteDeckCard`, `updateDeckCard`, `upsertDeckCard` directly from the component, then manually calls `refresh()`. The store pattern requires going through store actions. This pattern repeats risk of state inconsistency.

### 3. Fire-and-forget `refresh()` calls (no await in event handlers)
Multiple components call `refresh()` without awaiting it (e.g. DeckPanel handlers, OpponentLog). This is intentional for async fire-and-forget but silently swallows errors — no error handling on the refresh path.

### 4. `getLatestMetaSnapshots` full table scan
`queries.ts` loads ALL metaSnapshots with `toArray()` then filters in JS for the latest period. This will degrade with data volume. Should use a compound index query.

### 5. Sequential `upsertMetaSnapshot` in a loop (N writes, no transaction)
`metaFetch.ts` line 227: `for (const snap of snapshots) await upsertMetaSnapshot(snap)` — each call opens a separate IDB transaction. Should be wrapped in `db.transaction('rw', ...)`.

### 6. Hardcoded static matchup data in component file
`MatchupMatrix.tsx` embeds ~200 lines of raw CSV directly in the component file. No update mechanism, date-locked to 2026-04-17. This is a maintenance/staleness risk.

### 7. Mixed-language user-facing strings (German + English)
`useRecommendations.ts` recommendations 9-14 use German strings while the rest of the UI is English. Inconsistent UX, would confuse junior devs about the intended language.

### 8. Win rate formula inconsistency
`OverviewPage.tsx` line 14 uses `(wins / (wins + losses || 1))` which avoids division-by-zero by substituting 1 when there are no decisive games — this gives `wins/1` when wins > 0 and losses = 0, which is mathematically wrong (100% for 1W/0L which is fine, but 0W/0L gives 0 which is also fine). Pattern is inconsistent with other WR calculations that simply check `decisive > 0`.
