import { useDashboardStore } from '../store/dashboardStore';
import { resolveArchetypeSprites } from './shared/pokemonSprites';

const SPRITE_BASE =
  'https://raw.githubusercontent.com/bradley-erickson/pokesprite/master/pokemon/regular';

// Base background per archetype — noticeably tinted, not pitch-black
const ARCHETYPE_BG: Record<string, string> = {
  // Existing
  'n-zoroark': '#1c0838',
  'dragapult-dusknoir': '#130848',
  'dragapult-ex': '#130848',
  'dragapult-blaziken': '#3a0e04',
  'ogerpon-meganium': '#042b12',
  'raging-bolt-ogerpon': '#231c00',
  'starmie-froslass': '#001e38',
  'grimmsnarl-froslass': '#1c0440',
  'lucario-hariyama': '#060c36',
  'mega-absol-box': '#300506',
  'rocket-mewtwo-ex': '#1e0438',
  'alakazam-dudunsparce': '#1e0438',
  // New 2026 meta
  'cynthias-garchomp': '#041830', // dragon — deep teal-blue
  'okidogi-barbaracle': '#1a0830', // poison — deep purple
  'festival-lead': '#032d12', // grass — deep green
  'rockets-honchkrow': '#0e0820', // dark/flying — near black-purple
  greninja: '#031520', // water/dark — deep blue
  'mega-venusaur': '#062010', // grass/poison — deep green
  'stevens-metagross': '#0c1428', // steel/psychic — steel blue
  'mega-lucario': '#040b2e', // fighting/steel — deep navy
  ceruledge: '#250808', // fire/ghost — deep red
  'mega-starmie': '#001828', // water/psychic — deep blue-purple
  decidueye: '#072012', // grass/ghost — deep green
  hydreigon: '#0c0820', // dark/dragon — deep purple
  'mega-charizard-x': '#2a0a04', // fire/dragon — deep red
  archaludon: '#0c1830', // steel/dragon — steel blue
  'hops-zacian': '#1c0830', // fairy/steel — deep rose-purple
  'ethanss-typhlosion': '#2e0a00', // fire — deep amber-red
  'tera-box': '#101218', // normal — near neutral dark
  'marnie-grimmsnarl': '#16052a', // dark/fairy — deep violet
};

// Radial accent bloom per archetype
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

const DEFAULT_BG = '#0a0d18';
const DEFAULT_TINT = 'rgba(96,165,250,0.20)';

export function DeckSpriteBackground() {
  const activeDeck = useDashboardStore((s) => s.activeDeck);

  const pair = activeDeck ? resolveArchetypeSprites(activeDeck.archetype) : undefined;
  const primarySlug = pair?.[0];
  const archetype = activeDeck?.archetype ?? '';

  const spriteUrl = primarySlug ? `${SPRITE_BASE}/${primarySlug}.png` : null;
  const bgColor = ARCHETYPE_BG[archetype] ?? DEFAULT_BG;
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
        backgroundColor: bgColor,
        transition: 'background-color 0.5s ease',
      }}
    >
      {/* Tiled sprite wallpaper — sprite is 40×40px, tiled at 72px steps */}
      {spriteUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${spriteUrl})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '72px 72px',
            imageRendering: 'pixelated',
            opacity: 0.3,
          }}
        />
      )}
      {/* Type-colour radial bloom */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 70% 55% at 50% 38%, ${tintColor} 0%, transparent 100%)`,
          transition: 'background 0.5s ease',
        }}
      />
      {/* Edge vignette — keeps glass cards readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 35%, rgba(0,0,0,0.70) 100%)',
        }}
      />
    </div>
  );
}
