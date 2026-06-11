---
name: feedback-user-preferences
description: User requirements for target audience and UX priorities for this dashboard
type: feedback
---

Target audience: TCG players aged 8-50, including children from age 6.

**Why:** App is used at real TCG tournaments by a broad age range including young children.
**How to apply:** Buttons must be large enough for children, color coding must be immediately
obvious (no relying on text alone), font sizes should be generous on mobile.

Match logging must take < 10 seconds on mobile.

**Why:** Fast data entry between tournament rounds.
**How to apply:** AddLogModal is the most critical flow. Archetype selection should be
visual/tapable, not a small <select> dropdown. Result (W/L/T) should be large tap buttons
not a dropdown. Secondary fields (round, notes, battle log) should be collapsed/optional.

Mobile-first design.

**Why:** Used primarily on phones at events.
**How to apply:** Touch targets >= 44x44px always. Test every layout at 390px width first.
FAB in BottomNav is the right pattern — keep it prominent.

Pokemon sprites/icons next to archetype names for visual identification.

**Why:** Children and visual learners identify Pokemon by appearance, not just name text.
**How to apply:** Use PokemonIcon component everywhere archetypes appear:
AddLogModal archetype grid, OpponentLog table, MetaTable, TournamentCard.

Keep all existing functionality — only improve appearance and usability.

**Why:** User explicitly stated this.
**How to apply:** Never remove features. Only restructure UI and improve visual treatment.
