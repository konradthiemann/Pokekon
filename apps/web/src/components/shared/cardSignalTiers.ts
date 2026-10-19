import type { CardSignalTier } from '@pokekon/shared';

/** i18n keys (namespace `recommendations`) of the card signal tiers — shared by
 *  CardDelta and the coach card-statistics filter chips. */
export const TIER_LABEL_KEYS: Record<CardSignalTier, string> = {
  insufficient: 'comparison.delta.insufficient',
  confirmed: 'comparison.delta.confirmed',
  hiddenGem: 'comparison.delta.hiddenGem',
  popularityParadox: 'comparison.delta.paradox',
  discouraged: 'comparison.delta.discouraged',
  neutral: 'comparison.delta.neutral',
};
