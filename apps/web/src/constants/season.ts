// Competitive-season boundaries now live in @pokekon/shared so the web and the
// API share one rotation cutoff and ISO-week format. Re-exported here to keep the
// existing `../constants/season` import path stable.
export {
  ROTATION_DATE,
  ROTATION_PERIOD,
  isPostRotation,
  isPostRotationPeriod,
  isoWeekLabel,
} from '@pokekon/shared';
