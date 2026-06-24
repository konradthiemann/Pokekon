// Demo-mode helpers shared across the demo button, banner and AI-token path.
//
// Demo accounts are Better Auth "anonymous" guests: their session user carries
// `isAnonymous: true`. We never store extra demo state of our own beyond the two
// localStorage keys below — demo status is always derived from the live session.

/** In-game player name used in the seeded demo battle logs (see apps/api/src/lib/demoSeed.ts). */
export const DEMO_PLAYER_NAME = 'Gtmap';

/** localStorage key the battle-log analyzer reads to pin "me" when parsing. */
export const PLAYER_NAME_KEY = 'tcg-player-name';

/**
 * localStorage key holding an OPTIONAL, ephemeral BYOK token used only in demo
 * mode. It is sent per-request and never persisted server-side, so a visitor can
 * try live analysis with their own token without it being stored for anyone else.
 */
export const DEMO_AI_TOKEN_KEY = 'pokekon-demo-ai-token';

/** Narrow shape of the session user we care about (Better Auth adds `isAnonymous`). */
type MaybeAnonUser = { isAnonymous?: boolean | null } | null | undefined;

/** True when the session belongs to an anonymous (demo) guest account. */
export function isAnonymousUser(user: MaybeAnonUser): boolean {
  return Boolean(user?.isAnonymous);
}
