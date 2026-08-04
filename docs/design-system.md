# Design System — "Poké-Light"

> The app's visual language: a **light, playful, WCAG-AA** theme for an audience
> of Pokémon TCG players aged ~8–50. White "cards" (echoing real TCG cards) float
> on a soft, deck-tinted **playmat**; Pokémon's own blue/yellow are the accents,
> and energy-type colours code archetypes.

This replaced the previous near-black glassmorphism theme (2026-06). When adding
or changing UI, follow the tokens below — **do not reintroduce dark utilities**
(`bg-gray-950`, `text-white/50`, `bg-white/[0.06]`, …).

## Where the tokens live

| File | Owns |
|------|------|
| [`apps/web/src/index.css`](../apps/web/src/index.css) | `:root` raw tokens, component classes (`.card`, `.btn*`, `.badge*`, `.input`), global focus ring, `prefers-reduced-motion` |
| [`apps/web/tailwind.config.js`](../apps/web/tailwind.config.js) | font stack (Nunito), `brand` blue, `energy` yellow, `shadow-card`/`shadow-pop` |
| [`apps/web/src/components/DeckSpriteBackground.tsx`](../apps/web/src/components/DeckSpriteBackground.tsx) | the playmat background + per-archetype colour bloom |

## Palette (all text pairs measured on white)

| Token | Hex | Use | Contrast |
|-------|-----|-----|----------|
| Playmat ground | `#eef3fb` | app background | — |
| Surface | `#ffffff` | cards, modals, nav | — |
| Ink | `slate-900` `#0f172a` | body text, headings | 17.9:1 |
| Ink muted | `slate-600` `#475569` | labels, secondary text | 7.6:1 |
| Ink subtle | `slate-500` `#64748b` | **lightest allowed for real text** | 4.8:1 |
| `slate-400` | `#94a3b8` | **decorative only** ("—", placeholders) | fails — never for real text |
| Line | `slate-200` `#e2e8f0` | hairlines; `slate-300` for control borders | — |
| Accent (brand) | `brand-600` `#2563eb` | primary actions; white text = 5.2:1 | ✓ |
| Energy | `energy-500` `#ffcb05` | logo/highlight accents — **never text on white** | — |
| Win | `emerald-700` text / `emerald-100` badge | wins | ✓ |
| Loss | `red-700` text / `red-100` badge | losses | ✓ |
| Tie | `amber-700` text / `amber-100` badge | ties | ✓ |

Type-colour coding for archetypes: Fire `#ef4444`, Water `#3b82f6`, Grass `#22c55e`,
Electric `#f59e0b`, Psychic `#d946ef` (deepen for chart bars so each clears ~3:1 on white).

## Component classes

- `.card` — white, `slate-200` border, `rounded-lg` (was `rounded-2xl`), `shadow-card`.
- `.btn` / `.btn-primary` (blue gradient, white text) / `.btn-ghost` — ≥44px tall.
- `.badge-win` / `.badge-loss` / `.badge-tie` / `.badge-lc` / `.badge-lcup` — squared pills (`rounded-md`), dark text.
- `.input` — white field, `slate-300` border, brand focus ring.

## Analytical/angular style shift (2026-08)

The UI has moved slightly toward a "data panel" aesthetic while keeping the playful Poké-Light palette and all WCAG-AA guarantees:

| Element | Before | After | Effect |
|---------|--------|--------|--------|
| Card radius | `rounded-2xl` | `rounded-lg` | Squarer corners read more "analytics app" |
| `shadow-card` | subtle blue-tinted bloom | flat slate tint — `0 1px 2px rgba(15,23,42,0.06), 0 4px 12px -6px rgba(15,23,42,0.10)` | Crisper, less glossy lift |
| Badges | `rounded-full` pills | `rounded-md` | More compact, more angular |
| Metric numbers | default kerning | `tabular-nums` (via `.stat-value`) | Digits lock to a fixed grid; columns stay aligned on rerender |

No dark utilities were reintroduced. WCAG-AA contrast ratios remain unchanged.

## Accessibility baseline (WCAG 2.2 AA)

- **Contrast** — text ≥ 4.5:1 (large ≥ 3:1); UI/borders/chart marks ≥ 3:1 (1.4.3 / 1.4.11). Never use a slate lighter than `slate-500` for real text on white.
- **Focus** — global 3px `brand-600` focus ring with offset on every interactive element (2.4.7 / 2.4.11).
- **Target size** — primary controls and nav rows are ≥ 44×44px (2.5.5).
- **Not colour alone** — win/loss/tie always carry a dot **and** a letter/word (1.4.1).
- **Motion** — hover lifts, spinners and the background fade respect `prefers-reduced-motion` (2.3.3).

## Typography

Self-hosted **Nunito Variable** (`@fontsource-variable/nunito`, imported in
`main.tsx`) — rounded, friendly, highly legible; no runtime CDN call. Falls back
to `ui-rounded` / system rounded faces before it loads.
