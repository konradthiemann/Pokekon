---
name: bo1-pipeline-facts
description: Verified facts about Bo1 vs Bo3 format classification relevant to the local tournament meta pipeline
metadata:
  type: project
---

Research date: 2026-08-03
Relevant for: Meta-Analyse-Feature für lokale Bo1 Turniere (League Challenges / League Cups)

## Official local tournament formats (verified)

**League Challenge:**
- Swiss: Bo1, 30-Minuten-Runden
- Top Cut: Bo3 (if top cut exists at all — small events sometimes none)

**League Cup:**
- Swiss: Bo1, 30-Minuten-Runden
- Top Cut: Bo3, 50-Minuten-Limit

Source: https://championships.pokemon.com/en-us/about/league-challenges-and-league-cup (2026-08-03)

## Online Limitless tournaments (verified)

Most common structure for online events on play.limitlesstcg.com:
- Swiss: Bo1 (phases[0].mode = "BO1")
- Top Cut: Bo3 (phases[1].mode = "BO3")

This matches the standard pattern confirmed via tournament detail pages.
Variants exist (full Bo3 Swiss, full Bo1 including top cut) — always check phases[].mode per tournament.

## Bo1 representativeness hypothesis — assessment

**Supported by structure:** Online Bo1 Swiss mirrors local League Challenge/Cup Swiss format exactly (both Bo1, time-pressured).

**Caveat — not confirmed by published study:** No published community analysis comparing Bo1 online meta vs. local Bo1 tournament results found. The representativeness claim is a reasonable structural argument but remains ⚠️ Vermutung (plausible, not data-proven).

**Why Bo3 Regionals differ:**
- Game 2/3 sideboard adaptation is a distinct skill set
- Coin flip / going-first advantage is partially corrected over Bo3
- Players optimize differently for 50-min Bo3 vs. 20-30-min Bo1
These are known TCG community arguments; no quantitative PTCG study found.

**Why:** The project needs to know which Limitless data population to use as training signal for local tournament predictions.
**How to apply:** Use online tournaments with `isOnline=true` and `phases[0].mode="BO1"` as the primary meta signal. Label IRL Regional data (from Labs) separately and do not mix into Bo1 meta tier list without explicit flag.
