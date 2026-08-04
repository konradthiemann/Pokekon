---
name: findings-bo1-online-prediction-2026-08
description: Security audit of feat/meta-online-bo1-prediction — two Low findings, no Critical/High/Medium; all previous findings confirmed fixed.
metadata:
  type: project
---

Audit date: 2026-08-03.

## Low

- No DB-level CHECK constraint on swiss_mode. apps/api/drizzle/0006_lean_magus.sql:2.
  Drizzle text+enum is TypeScript-only. Application layer (normalizeSwissMode) already
  constrains values, so realistic attack surface is nil. Fix: Drizzle check() helper +
  new migration.

- phases array and p.type have no size/length cap before toUpperCase().includes().
  packages/shared/src/meta.ts:175-182. Background-job only, not a request handler.
  Fix: slice(0,20) before filter; p.type.length < 100 guard in the filter condition.

## Confirmed safe

- metaWindowQuerySchema days 1..180 bounded.
- maxProbes=40 sync cap.
- classifyTournamentDetails: only sanitized values reach DB.
- getLocalMetaField validates shape + isFinite weight.
- setWeight NaN/Infinity → 0 guard.
- totalWeight <= 0 division-by-zero guard.
- No dangerouslySetInnerHTML anywhere in new components.
- All archetype names JSX text nodes.
- No new dependencies.
- windowConditions: Drizzle eq() with Column refs + literal 'BO1', fully parameterized.
- queryBool: Boolean("false")===true trap avoided.
