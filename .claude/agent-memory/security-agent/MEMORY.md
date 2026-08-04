# Memory Index

- [Open findings: archetype drilldown audit 2026-07](open-findings-archetype-drilldown-2026-07.md) — High/Medium/Low findings from the Meta-Tab drilldown feature audit; check fix status before re-reporting.
- [API architecture security baseline](api-architecture-security-baseline.md) — trivial anonymous auth, no rate limiting, SameSite=Lax cookie, no body-limit middleware, public (non-user-scoped) meta data.
- [Good external-data-hardening patterns](good-patterns-external-data-hardening.md) — pruneDecklist allowlist pruning, sprite-name char-stripping, encodeURIComponent href pattern, safe Drizzle `sql` tag usage — reference bar for new features.
- [Audit: feat/meta-online-bo1-prediction 2026-08](findings-bo1-online-prediction-2026-08.md) — Two Low findings (no DB CHECK constraint on swiss_mode, uncapped phases array iteration). All previous High/Medium findings confirmed fixed.
- [Audit: pairings+matchups+ArchetypePicker 2026-08-04](findings-bo1-online-prediction-2026-08.md) — Two Low findings (t.id raw in fetch URL; no CHECK on tournament_matchups.deck_a/b). All other surface confirmed safe: pruneIcons, computeMatchupsFromPairings, metaWindowQuerySchema, ArchetypePicker, useRecommendations, PokemonIcon icon path.
