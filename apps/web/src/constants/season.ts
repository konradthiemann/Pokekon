/**
 * Current competitive season boundaries.
 *
 * The 2026 Standard rotation took effect on 2026-03-26. Meta analysis must
 * never mix pre- and post-rotation data: pre-rotation tournament results
 * describe a card pool that no longer exists, so frequencies and win rates
 * from before the cutoff would systematically mislead deck decisions.
 *
 * Personal match logs are NOT filtered by this cutoff — they belong to the
 * user's own history. Only meta data (tournament snapshots, recent
 * tournaments) is restricted to the current season.
 */

/** First day of the post-rotation Standard format (inclusive), YYYY-MM-DD. */
export const ROTATION_DATE = '2026-03-26';

/**
 * ISO-week label of the rotation week, matching the `period` format used by
 * meta snapshots ("2026-W13"). Snapshots from this week onward are in-season.
 * Lexicographic comparison is safe because the format is fixed-width
 * (zero-padded week) and sorts chronologically within and across years.
 */
export const ROTATION_PERIOD = '2026-W13';

/** True when the given date (ISO string or Date) is on/after the rotation. */
export function isPostRotation(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() >= new Date(`${ROTATION_DATE}T00:00:00Z`).getTime();
}

/** True when a snapshot period label ("2026-W15") is in the current season. */
export function isPostRotationPeriod(period: string): boolean {
  return period >= ROTATION_PERIOD;
}
