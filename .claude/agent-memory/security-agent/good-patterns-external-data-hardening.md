---
name: good-patterns-external-data-hardening
description: Positive security patterns already established in this codebase for handling untrusted external (Limitless) data — use as the baseline/reference when auditing new external-data features.
metadata:
  type: project
---

Confirmed while auditing the archetype-drilldown feature (2026-07-08). These
are patterns worth citing approvingly in future reviews, and worth checking
that NEW code reuses rather than reinvents (inconsistently, and usually worse).

**Why:** without a record of "what good already looks like here", each audit
re-derives the bar from zero and either under- or over-flags new code that
partially follows it.
**How to apply:** when reviewing a new feature that ingests external/attacker-
influenced strings, check whether it follows one of these patterns; if it
invents a new, less-strict way to do the same job, that's worth flagging even
if not exploitable, for consistency.

- **Allowlist-copy pruning for untrusted JSON blobs**: `pruneDecklist()`
  (`packages/shared/src/meta.ts:38-68`) takes `unknown` external JSON, iterates
  only a fixed set of known keys, `typeof`-checks every field before trusting
  it, copies into a brand-new object (never spreads/merges the raw input), and
  caps both string lengths and array sizes. No prototype-pollution vector
  because the group keys iterated are hardcoded literals, not attacker-supplied
  property names. This is the reference pattern for any future "ingest a blob
  from Limitless" code.
- **Character-class stripping before URL/path construction**:
  `pokemonToSprite()` (`apps/web/src/components/shared/pokemonSprites.ts:103-106`)
  reduces an arbitrary archetype-name-derived string to `[a-z0-9-]` via
  `.replace(/[^a-z0-9-]/g, '')` *before* it's ever interpolated into an
  `<img src>` template literal. Even a maximally hostile archetype name can't
  produce a path-traversal or absolute-URL/`javascript:` payload this way. Any
  new code that builds a `src`/`href` from an archetype/deck/card name derived
  from Limitless data should follow this, not just trust `encodeURIComponent`
  alone (which is also used correctly elsewhere, see next point, but a strip-
  to-allowlist is stronger when the value ends up unquoted in a template).
- **`encodeURIComponent` + fixed origin/path prefix for external IDs in
  `href`**: `DecklistCard.tsx:67` —
  `` `https://play.limitlesstcg.com/tournament/${encodeURIComponent(entry.tournament.id)}/standings` ``.
  The scheme+host+path-prefix are literal, only a path *segment* is
  attacker-influenced, and it's percent-encoded — can't hijack the scheme or
  escape to a different host.
- **Drizzle `sql` tag with Column-reference interpolation, not string
  concatenation**: `apps/api/src/routes/meta.ts:219` —
  `` sql`${tournamentStandings.placing}::real / GREATEST(${tournaments.players}, 1) ASC NULLS LAST` ``.
  The interpolated values are typed Drizzle `Column` objects (rendered as safe
  identifiers), and the surrounding SQL text is a developer-written literal —
  no request parameter ever touches this template. This is the safe way to do
  a computed `ORDER BY`; flag any future `sql` tag usage that instead
  interpolates a raw string derived from `c.req.query()`/`c.req.param()`.
- **Slug regex at the validation boundary, parameterized query underneath**:
  `archetypeIdParamSchema` (`apps/api/src/validation.ts:94-96`) rejects
  non-slug archetype ids with 400 *before* the value ever reaches a query —
  even though the underlying `eq(tournamentStandings.archetypeId, ...)` would
  already be injection-safe via Drizzle's parameterization regardless. Belt-
  and-suspenders validation like this is the house style for new `:param`
  routes in `apps/api/src/routes/*.ts`.
