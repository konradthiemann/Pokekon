---
name: docs coverage — tcg-dashboard
description: Documentation coverage status for the Pokemon TCG Meta Dashboard project as of 2026-04-23
type: project
---

Comprehensive /docs/ directory created at /Users/konrad.thiemann/tcg/docs/ on 2026-04-23.

Files created:
- docs/README.md — index with table of contents
- docs/architecture.md — layer diagram, component tree, tech stack table, state management and persistence overview
- docs/database.md — all 6 tables with column-level docs, ER diagram, migration history (v1→v2→v3), key query patterns
- docs/data-types.md — all interfaces from src/types/index.ts explained in plain language
- docs/data-flow.md — 7 sequence diagrams (startup, log match, meta sync, deck import, comparison, AI analysis, recommendations, snapshots)
- docs/agents.md — all 11 agents with roles, trigger conditions, standard delegation flows, memory system explanation
- docs/features.md — all 13 features with process steps, limitations, and config details
- docs/getting-started.md — install, scripts, deploy options, first-use guide, troubleshooting, project structure

tcg-dashboard/README.md updated to comprehensive version with features list, tech stack table, architecture overview, and links to /docs/.

**Why:** First comprehensive documentation run — project had only a minimal 47-line README before.

**How to apply:** On future runs, read existing docs before writing. Check for staleness against: schema changes (database.ts), new lib files, new agents in .claude/agents/, new pages or components.

**Known gaps as of 2026-04-23:**
- No per-component .md files (component-level docs)
- No JSDoc audit of src/lib/ and src/db/queries.ts has been performed yet
- No directory README.md files inside src/ subdirectories
- OpponentsPage is documented in features.md but is not a primary tab (embedded in DeckPage) — worth clarifying if the page becomes standalone
