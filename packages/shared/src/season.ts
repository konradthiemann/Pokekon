// Competitive-season boundaries + ISO-week labelling, shared by web and api so the
// rotation cutoff and period format are defined once (meta data must never mix
// pre- and post-rotation results — see the note below).

/** First day of the post-rotation Standard format (inclusive), YYYY-MM-DD. */
export const ROTATION_DATE = '2026-03-26';

/**
 * ISO-week label of the rotation week, matching the `period` format used by meta
 * snapshots ("2026-W13"). Snapshots from this week onward are in-season.
 * Lexicographic comparison is safe because the format is fixed-width.
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

/**
 * Returns an ISO 8601 week label like "2026-W15" for the given date. Shifts to the
 * nearest Thursday (`+4 - weekday`, with Sunday remapped to 7) because ISO 8601
 * defines week 1 as the week containing the year's first Thursday.
 */
export function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}
