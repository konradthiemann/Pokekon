/** Start of the `weeks`-week analysis window: today UTC midnight − weeks·7 days.
 *  The single definition behind every 1/2/3/4-week query (plan §5.4). */
export function windowStart(weeks: number): Date {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  return cutoff;
}

/** The same cutoff as a YYYY-MM-DD string, for `date`-typed columns. */
export function windowCutoff(weeks: number): string {
  return windowStart(weeks).toISOString().slice(0, 10);
}
