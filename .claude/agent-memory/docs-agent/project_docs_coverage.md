---
name: docs coverage — tcg-dashboard
description: Documentation coverage status for the Pokemon TCG Meta Dashboard project, last updated 2026-08-04
type: project
---

Comprehensive /docs/ directory created at /Users/konrad.thiemann/tcg/docs/ on 2026-04-23.

Files created on 2026-04-23:
- docs/README.md — index with table of contents
- docs/architecture.md — layer diagram, component tree, tech stack table, state management and persistence overview
- docs/database.md — all 6 tables with column-level docs, ER diagram, migration history (v1→v2→v3), key query patterns
- docs/data-types.md — all interfaces from src/types/index.ts explained in plain language
- docs/data-flow.md — 7 sequence diagrams (startup, log match, meta sync, deck import, comparison, AI analysis, recommendations, snapshots)
- docs/agents.md — all 11 agents with roles, trigger conditions, standard delegation flows, memory system explanation
- docs/features.md — all 16 features with process steps, limitations, and config details (see update log below)
- docs/getting-started.md — install, scripts, deploy options, first-use guide, troubleshooting, project structure

tcg-dashboard/README.md updated to comprehensive version with features list, tech stack table, architecture overview, and links to /docs/.

**Updates 2026-08-04:**
- docs/features.md §16 (Local-Meta Prediction): field table now collapsible; weights use QuantityStepper; deck-perspective picker replaces old count-ordered ranking; best-positioned headline added; per-list ListFieldPerformance drill-down documented.
- docs/features.md §2 (Live Meta Sync): per-pilot match results derived from pairings and stored in tournament_standings.match_results (migration 0009); downstream consumer (archetype-lists endpoint + prediction drill-down) documented.
- docs/features.md §15 (Archetype Drilldown): meta window control updated — free numeric QuantityStepper (1–180 days) plus preset buttons (7/14/30/60).
- docs/design-system.md: Nunito font removed; system-font stack documented; btn-primary is flat solid (no gradient); .card is rounded-md p-3; table rows denser (py-1.5); tabular-nums / .stat-value noted.

**Why:** Features added in 2026-08 session — prediction panel restructure, match_results per-pilot data pipeline, QuantityStepper for day/weight inputs, analytical font/button/card shift.

**How to apply:** On future runs, read existing docs before writing. Check for staleness against: schema changes (schema.ts + drizzle/*.sql), new lib files, new agents in .claude/agents/, new pages or components.

**Known gaps as of 2026-08-04:**
- docs/database.md still references the old migration history (v1→v2→v3 / Dexie); needs update for Postgres/Drizzle migrations 0000–0009 — tournament_standings.match_results (0009) not yet reflected there.
- No per-component .md files (component-level docs)
- No JSDoc audit of src/lib/ and src/db/queries.ts has been performed yet
- No directory README.md files inside src/ subdirectories
- OpponentsPage is documented in features.md but is not a primary tab (embedded in DeckPage) — worth clarifying if the page becomes standalone
