---
name: project_schema
description: Dexie database schema, table definitions, and key design decisions for the TCG Dashboard
type: project
---

## Database: TCGDatabase (Dexie v4, IndexedDB)

### Tables

| Table | PK | Key Indexes | Notes |
|---|---|---|---|
| cards | ++id | name, set, type | Lookup table, not yet populated in v1 |
| deckCards | ++id | cardId, name, type, role | Denormalized name for fast display |
| opponentLogs | ++id | archetype, eventType, eventDate, result | Core matchup tracking |
| metaSnapshots | ++id | archetype, period | Frequency + WR per weekly period |

### Seed guard
`localStorage.getItem('tcg-dashboard-seeded-v1')` — set after first seed, prevents re-seeding on reload.

### MetaSnapshot periods
Format: `YYYY-WNN` (e.g. `2026-W15`). `getLatestMetaSnapshots()` returns only the highest period alphabetically.

### Derived: ArchetypeStats
Computed in `queries.getArchetypeStats()` — cross-joins opponentLogs with metaSnapshots. Includes archetypes present in meta but never encountered (with 0 encounter counts).

## Why:
Compound index `[archetype+period]` on metaSnapshots was considered but Dexie v4 syntax differs; current upsert falls back to `.add()` if compound lookup fails — safe for v1.

## How to apply:
When adding new tables, add to `TCGDatabase` class version, bump schema version number.
