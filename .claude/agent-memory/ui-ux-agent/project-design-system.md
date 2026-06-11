---
name: project-design-system
description: Confirmed design system for TCG Meta Dashboard — colors, component classes, chart standards
type: project
---

## Brand Colors (tailwind.config.js confirmed)
- brand-purple: brand-400 = #e879f9, brand-500 = #d946ef, brand-600 = #c026d3
- Background: gray-950 (body), gray-900 (cards/sidebar), gray-800 (inputs)
- Win: emerald-400 / emerald-900/50 (bg) / emerald-800 (border)
- Loss: red-400 / red-900/50 (bg) / red-800 (border)
- Tie: yellow-400 / yellow-900/50 (bg) / yellow-800 (border)
- Chart Win: #22c55e (green-500), Chart Loss: #ef4444 (red-500), Chart Tie: #eab308 (yellow-500)

## Component Classes (index.css confirmed)
- .card = bg-gray-900 border border-gray-800 rounded-xl p-4
- .card-header = text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3
- .stat-value = text-2xl font-bold text-white
- .badge-win = emerald bg/text/border
- .badge-loss = red bg/text/border
- .badge-tie = yellow bg/text/border
- .badge-lc = blue bg/text/border
- .badge-lcup = purple bg/text/border
- .btn-primary = bg-brand-600 hover:bg-brand-500 text-white
- .btn-ghost = bg-gray-800 hover:bg-gray-700 text-gray-300

## Layout
- Sidebar: hidden md:flex w-56 (desktop only)
- BottomNav: md:hidden fixed bottom-0 (mobile only) with FAB (+) in center
- Main: flex-1 overflow-y-auto pb-16 md:pb-0
- Page container: max-w-screen-2xl mx-auto p-3 md:p-4

## Form Inputs (confirmed pattern)
- bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500
