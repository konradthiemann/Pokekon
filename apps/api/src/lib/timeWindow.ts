/** Start of a `days`-day analysis window: today UTC midnight − days. The single
 *  definition behind the tournament-meta day-window queries (Increment 2). */
export function windowStartDays(days: number): Date {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return cutoff;
}

/** Start of the `weeks`-week window (personal deck analytics, plan §5.4). */
export function windowStart(weeks: number): Date {
  return windowStartDays(weeks * 7);
}

/** The same cutoff as a YYYY-MM-DD string, for `date`-typed columns. */
export function windowCutoff(weeks: number): string {
  return windowStart(weeks).toISOString().slice(0, 10);
}
