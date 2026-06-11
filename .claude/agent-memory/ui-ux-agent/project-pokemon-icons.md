---
name: project-pokemon-icons
description: Pokemon sprite URL patterns and archetype slug mapping for the TCG dashboard
type: project
---

## Confirmed Sprite Sources

Primary (Limitless CDN — matches the app's data source):
`https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pokemon/[dex-number].png`
Example: https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/pokemon/384.png (Rayquaza)

Fallback (pokesprite GitHub):
`https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular/[pokemon-name].png`
Example: https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular/dragapult.png

## Archetype-to-First-Pokemon Mapping (for KNOWN_ARCHETYPES in AddLogModal)
The approach: extract the FIRST pokemon name from the archetype string, lowercase it,
strip " ex"/"-ex"/" VSTAR"/"-v" etc., use as sprite lookup key.

Known archetypes and their primary sprite pokemon:
- 'Dragapult ex' -> 'dragapult' (dex: 887)
- 'Dragapult Blaziken' -> 'dragapult' (dex: 887)
- 'Dragapult Dusknoir' -> 'dragapult' (dex: 887)
- "N's Zoroark ex" -> 'zoroark' (dex: 571)
- 'Lucario Hariyama' -> 'lucario' (dex: 448)
- 'Alakazam Dudunsparce' -> 'alakazam' (dex: 65)
- 'Starmie Froslass' -> 'starmie' (dex: 121)
- "Cynthia's Garchomp ex" -> 'garchomp' (dex: 445)
- "Rocket's Mewtwo" -> 'mewtwo' (dex: 150)
- 'Ogerpon Meganium' -> 'ogerpon' (dex: 1017)
- 'Raging Bolt Ogerpon' -> 'raging-bolt' (dex: 1024)
- 'Ceruledge ex' -> 'ceruledge' (dex: 911)
- 'Gardevoir ex' -> 'gardevoir' (dex: 282)
- 'Lugia VSTAR' -> 'lugia' (dex: 249)
- 'Roaring Moon ex' -> 'roaring-moon' (dex: 1005)
- 'Miraidon ex' -> 'miraidon' (dex: 1008)
- 'Raging Bolt ex' -> 'raging-bolt' (dex: 1024)
- 'Chien-Pao ex' -> 'chien-pao' (dex: 1002)
- 'Regidrago VSTAR' -> 'regidrago' (dex: 895)
- 'Iron Thorns ex' -> 'iron-thorns' (dex: 990)
- 'Gholdengo ex' -> 'gholdengo' (dex: 1000)
- 'Snorlax Stall' -> 'snorlax' (dex: 143)
- 'Charizard ex' -> 'charizard' (dex: 6)

## Recommended Component: PokemonIcon
File: src/components/shared/PokemonIcon.tsx
- Props: archetype (string), size ('sm' | 'md'), className
- Derives slug from archetype string using a static map
- Falls back to a generic pokeball SVG if image 404s (onError handler)
- Uses Limitless CDN as primary source with dex number
- Size sm = 20x20px, size md = 32x32px
