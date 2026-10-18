---
name: limitless-api-schema
description: Limitless TCG API field schema for tournament classification — isOnline, phases.mode (BO1/BO3), platform field
metadata:
  type: reference
---

Base URL: `https://play.limitlesstcg.com/api`

## GET /tournaments/{id}/details — relevant fields

```json
{
  "isOnline": true,          // Boolean — true=online, false=in-person IRL
  "platform": "string",      // Platform abbreviation (e.g. "PTCGL" for Pokemon TCG Live)
  "phases": [
    {
      "phase": 1,
      "type": "SWISS",        // or "SINGLE_BRACKET", "DOUBLE_BRACKET", etc.
      "rounds": 8,
      "mode": "BO1"           // "BO1", "BO3", or "BO5"
    },
    {
      "phase": 2,
      "type": "SINGLE_BRACKET",
      "rounds": null,
      "mode": "BO3"
    }
  ]
}
```

## GET /tournaments (list endpoint)
Basic fields only: `id`, `game`, `format`, `name`, `date`, `players`
isOnline and phases are NOT in the list endpoint — need /details call per tournament.

## Key classification facts (verified 2026-08-03)
- `isOnline: true` is the reliable, programmatic classifier for online vs IRL — no name heuristics needed
- The `phases[].mode` field explicitly encodes BO1/BO3 per phase — Swiss and Top Cut can differ
- Most online Limitless tournaments use BO1 Swiss + BO3 Top Cut structure
- The list endpoint (`/tournaments?game=PTCG`) returns a mix of online and offline events — filter by calling /details and checking `isOnline`

Source: https://docs.limitlesstcg.com/developer/tournaments (checked 2026-08-03)
