import { useDashboardStore } from '../store/dashboardStore';
import { resolveArchetypeSprites } from './shared/pokemonSprites';

const SPRITE_BASE =
  'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular';

// The light "playmat" surface every deck sits on. The per-archetype colour
// comes through as a soft bloom on top (ARCHETYPE_TINT) rather than tinting
// the whole ground, so white cards always stay legible against it.
const PLAYMAT = '#eef3fb';

// Radial accent bloom per archetype — the type colour, kept as a gentle pastel
// wash over the light playmat.
const ARCHETYPE_TINT: Record<string, string> = {
  // Existing
  'n-zoroark': 'rgba(167,139,250,0.40)',
  'dragapult-dusknoir': 'rgba(129,70,255,0.38)',
  'dragapult-ex': 'rgba(129,70,255,0.38)',
  'dragapult-blaziken': 'rgba(251,107,29,0.38)',
  'ogerpon-meganium': 'rgba(52,211,153,0.32)',
  'raging-bolt-ogerpon': 'rgba(253,224,71,0.35)',
  'starmie-froslass': 'rgba(56,189,248,0.35)',
  'grimmsnarl-froslass': 'rgba(192,132,252,0.35)',
  'lucario-hariyama': 'rgba(96,165,250,0.38)',
  'mega-absol-box': 'rgba(248,113,113,0.35)',
  'rocket-mewtwo-ex': 'rgba(192,132,252,0.40)',
  'alakazam-dudunsparce': 'rgba(192,132,252,0.35)',
  // New 2026 meta
  'cynthias-garchomp': 'rgba(110,231,183,0.30)',
  'okidogi-barbaracle': 'rgba(192,132,252,0.32)',
  'festival-lead': 'rgba(52,211,153,0.30)',
  'rockets-honchkrow': 'rgba(139,92,246,0.30)',
  greninja: 'rgba(56,189,248,0.32)',
  'mega-venusaur': 'rgba(74,222,128,0.30)',
  'stevens-metagross': 'rgba(148,163,184,0.28)',
  'mega-lucario': 'rgba(96,165,250,0.38)',
  ceruledge: 'rgba(239,68,68,0.32)',
  'mega-starmie': 'rgba(139,92,246,0.32)',
  decidueye: 'rgba(52,211,153,0.28)',
  hydreigon: 'rgba(129,70,255,0.34)',
  'mega-charizard-x': 'rgba(239,68,68,0.34)',
  archaludon: 'rgba(148,163,184,0.25)',
  'hops-zacian': 'rgba(244,114,182,0.30)',
  'ethanss-typhlosion': 'rgba(251,146,60,0.34)',
  'tera-box': 'rgba(148,163,184,0.22)',
  'marnie-grimmsnarl': 'rgba(167,139,250,0.34)',
};

const DEFAULT_TINT = 'rgba(96,165,250,0.22)';

export function DeckSpriteBackground() {
  const activeDeck = useDashboardStore((s) => s.activeDeck);

  const pair = activeDeck ? resolveArchetypeSprites(activeDeck.archetype) : undefined;
  const primarySlug = pair?.[0];
  const archetype = activeDeck?.archetype ?? '';

  const spriteUrl = primarySlug ? `${SPRITE_BASE}/${primarySlug}.png` : null;
  const tintColor = ARCHETYPE_TINT[archetype] ?? DEFAULT_TINT;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: PLAYMAT,
      }}
    >
      {/* Tiled sprite wallpaper — dark pixel sprites show as a faint pattern on
          the light playmat. Sprite is 40×40px, tiled at 72px steps. */}
      {spriteUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${spriteUrl})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '72px 72px',
            imageRendering: 'pixelated',
            opacity: 0.11,
          }}
        />
      )}
      {/* Type-colour blooms — punchier washes top and bottom in the active
          deck's type colour, plus a corner of Pokémon energy-yellow for warmth.
          Vivid, but the light edge-wash below keeps white cards crisp. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 95% 60% at 50% -5%, ${tintColor} 0%, transparent 72%),
            radial-gradient(ellipse 70% 45% at 12% 108%, ${tintColor} 0%, transparent 70%),
            radial-gradient(ellipse 45% 45% at 94% 6%, rgba(255,203,5,0.16) 0%, transparent 70%)`,
          transition: 'background 0.5s ease',
        }}
      />
      {/* Soft light wash at the edges — keeps the playmat airy and white cards
          crisp, the bright counterpart to the old dark vignette. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 120% 120% at 50% 45%, transparent 40%, rgba(238,243,251,0.85) 100%)',
        }}
      />
    </div>
  );
}
