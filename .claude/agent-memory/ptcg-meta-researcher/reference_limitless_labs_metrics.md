---
name: limitless-labs-metrics
description: Limitless Labs metric definitions — Share (metashare), Record/Win%, what data they cover and from which tournaments
metadata:
  type: reference
---

Source: https://labs.limitlesstcg.com/decks and https://limitlesstcg.com/tournaments/500/statistics (checked 2026-08-03)

## Confirmed column definitions (from Prague Regional page: labs.limitlesstcg.com/0062/decks)

| Column | Definition |
|--------|-----------|
| **Share** | % of total field — number of decks of that archetype / total decks with submitted lists |
| **Record** | Aggregate W-L-T across all players piloting that archetype (match-level, not game-level) |
| **Win %** | Derived from the Record: W / (W+L), ties excluded or counted as 0.5 — NOT game win rate |

## What Win% is NOT
- NOT game win rate (individual games within a Bo3 set)
- NOT weighted by player skill
- The record format "751-634-248" (W-L-T) confirms match-level counting

## Conversion Rate (seen in URL params, not always shown)
- Appears to track: % of players with X+ round record who made top cut
- Not consistently displayed on all tournament pages

## Coverage
- Labs covers IRL Regional/International/World Championships — NOT online events
- Data comes via rk9.gg and playlatam.net (official TO software), not play.limitlesstcg.com
- For online tournament meta, Labs is NOT the right source — use play.limitlesstcg.com completed tournaments instead

## Important distinction for the project
Labs = IRL Bo3 Regional data
play.limitlesstcg.com completed = Online Bo1 Swiss data
These two populations should NOT be mixed without explicit labeling.
