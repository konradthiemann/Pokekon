/**
 * Glass-style loading skeleton shown while a lazy-loaded page chunk is fetched
 * or while the dashboard store is hydrating from IndexedDB.
 *
 * Mirrors the typical page layout (stat row + two content cards) so the
 * transition to real content feels stable instead of jumping.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-live="polite">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-24 rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card h-72 rounded-2xl bg-white/[0.04]" />
        <div className="card h-72 rounded-2xl bg-white/[0.04]" />
      </div>
      <div className="card h-96 rounded-2xl bg-white/[0.04]" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
