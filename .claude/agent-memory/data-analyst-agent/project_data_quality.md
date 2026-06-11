---
name: TCG Dashboard — Data Quality & Schema Observations
description: Structural facts about the dashboard's data model, calculation methods, and known limitations
type: project
---

## Schema (database.ts)

- Three schema versions (v1–v3). v3 adds multi-deck support with `deckId` foreign keys across all tables.
- `metaSnapshots` compound index: `[archetype+period]` — used for upsert deduplication.
- Missing indexes: `opponentLogs` has no composite index on `[deckId+eventDate]`, `[deckId+archetype]`, or `[archetype+result]`. All matchup aggregation does full table scans.
- `opponentLogs.round` is optional and not indexed — round-by-round analysis not possible.

## Win Rate Formula (consistent across codebase)

All win rate calculations use **decisive games only** (W + L), ties excluded from denominator:
`winRate = wins / (wins + losses) * 100`

Locations: `queries.ts:192`, `queries.ts:246`, `deckPerformanceStats.ts:40`, `useRecommendations.ts:29`, `metaFetch.ts:213`.

**Exception (bug):** `OverviewPage.tsx:14` uses `wins / (wins + losses || 1)` — the `|| 1` guard is misplaced and produces wrong results when wins+losses === 0 but ties > 0.

## Sample Size Guards

- `MetaTable.tsx`: shows "No data" only when `encounters === 0`. Win rates with n=1 or n=2 are displayed as real percentages.
- `getDeckVariantStats`: requires `>= 2` games per matchup for meta-weighted score (line 258), but `>= 1` for matchup breakdown display.
- `useRecommendations.ts`: tech suggestions trigger at `encounters >= 2` (line 127). No confidence labeling.
- No confidence intervals anywhere in the codebase.

## Meta Data (metaFetch.ts)

- `syncLiveMeta` aggregates top-6 events by player count (not by recency). No date filter applied — stale events can dominate.
- `clearMetaSnapshots()` is called before saving new data — historical periods are wiped on every sync. Only one period survives at any time.
- `winRatePct` defaults to 50 when no decisive games exist (line 213) — this is an assumption, not a measured value.
- `isLikelyOnline` heuristic uses `players >= 150` as online signal — this is inverted logic (large events are in-person).

## MatchupMatrix

- Data is **hardcoded CSV** in `MatchupMatrix.tsx` (TrainerHill export 2026-04-17). Not dynamic, not persisted to DB, not updatable by user.
- Win rates in the CSV are pre-computed decimals (e.g., 44.5), not re-derived from wins/losses/ties columns — cannot verify consistency.

## metaScore (getDeckVariantStats, queries.ts:258–262)

- Requires `>= 2` decisive games AND `metaFreq > 0` to include a matchup in the weighted score.
- Denominator is sum of metaFreq only for *encountered* archetypes — not the full meta. This inflates metaScore for players who only face favorable matchups.
