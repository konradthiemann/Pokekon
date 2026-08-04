# Design System — Poké-Light (analytical edition)

> The app's visual language: a **light, analytical, WCAG-AA** theme for Pokémon
> TCG players who want data at a glance. White surfaces (echoing real TCG cards)
> on a soft, deck-tinted **playmat**; Pokémon's blue/yellow are the accents;
> energy-type colours code archetypes. The UI leans analytical/finance — sharp
> corners, flat colours, tabular metrics — while keeping the palette and
> accessibility guarantees of the 2026-06 Poké-Light redesign.

This replaced the previous near-black glassmorphism theme (2026-06) and was
further refined toward an analytical aesthetic (2026-08). When adding or changing
UI, follow the tokens below — **do not reintroduce dark utilities** (`bg-gray-950`,
`text-white/50`, `bg-white/[0.06]`, …) and **do not reintroduce the Nunito font**.

## Where the tokens live

| File | Owns |
|------|------|
| [`apps/web/src/index.css`](../apps/web/src/index.css) | `:root` raw tokens, component classes (`.card`, `.btn*`, `.badge*`, `.input`), global focus ring, `prefers-reduced-motion` |
| [`apps/web/tailwind.config.js`](../apps/web/tailwind.config.js) | system font stack (`sans` + `mono`), `brand` blue, `energy` yellow, `shadow-card` |
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

- `.card` — white, `slate-200` border, `rounded-md` (was `rounded-2xl`, then `rounded-lg`), `p-3`, flat neutral `shadow-card`.
- `.btn` / `.btn-primary` (solid `bg-brand-600`, white text, no gradient) / `.btn-ghost` — ≥44px tall, flat, `rounded-md`.
- `.badge-win` / `.badge-loss` / `.badge-tie` / `.badge-lc` / `.badge-lcup` — squared pills (`rounded-md`), dark text, `py-0.5`.
- `.input` — white field, `slate-300` border, brand focus ring.
- `.stat-value` — applies `tabular-nums` so metric columns stay aligned on rerender.

## Analytical style shift (2026-08)

The UI moved to a data-panel / finance aesthetic while keeping the Poké-Light palette and all WCAG-AA guarantees. The rounded Nunito font (`@fontsource-variable/nunito`, previously imported in `main.tsx`) was **removed**; the app now uses a neutral system-font stack (SF Pro / Segoe UI / system-ui) with zero web-font dependency.

| Element | Before (2026-06) | After (2026-08) | Effect |
|---------|-----------------|-----------------|--------|
| Font | Nunito Variable (web font) | System sans (`ui-sans-serif`, `system-ui`, …) | No CDN load, crisper at small sizes |
| Card radius | `rounded-2xl` → `rounded-lg` | `rounded-md` | Squarer corners read "analytics app" |
| Card padding | `p-4` | `p-3` | Denser information density |
| `shadow-card` | blue-tinted bloom | flat slate tint — `0 1px 2px rgba(15,23,42,0.06), 0 4px 12px -6px rgba(15,23,42,0.10)` | Crisper, less glossy lift |
| Primary button | blue gradient + bounce | solid `bg-brand-600`, no gradient | Flat, professional |
| Badges | `rounded-full` pills | `rounded-md` | More compact, angular |
| Table row padding | `py-2` | `py-1.5` | Denser tables |
| Metric numbers | default kerning | `tabular-nums` (via `.stat-value`) | Digits lock to a fixed grid; columns stay aligned on rerender |

No dark utilities were reintroduced. WCAG-AA contrast ratios remain unchanged.

## Accessibility baseline (WCAG 2.2 AA)

- **Contrast** — text ≥ 4.5:1 (large ≥ 3:1); UI/borders/chart marks ≥ 3:1 (1.4.3 / 1.4.11). Never use a slate lighter than `slate-500` for real text on white.
- **Focus** — global 3px `brand-600` focus ring with offset on every interactive element (2.4.7 / 2.4.11).
- **Target size** — primary controls and nav rows are ≥ 44×44px (2.5.5).
- **Not colour alone** — win/loss/tie always carry a dot **and** a letter/word (1.4.1).
- **Motion** — hover lifts, spinners and the background fade respect `prefers-reduced-motion` (2.3.3).

## Typography

**System font stack** — no web-font dependency. `sans` resolves to `ui-sans-serif` → `system-ui` → `-apple-system` (SF Pro on macOS/iOS) → `BlinkMacSystemFont` → `Segoe UI` → `Roboto` → `Helvetica Neue` → `Arial`. `mono` resolves to `ui-monospace` → `SFMono-Regular` → `Menlo` → `Consolas`. Both stacks are defined in `tailwind.config.js`; the previous `@fontsource-variable/nunito` import has been removed.

Numeric metrics use `tabular-nums` (applied via Tailwind utility or `.stat-value`) so columns stay grid-aligned when values change.
