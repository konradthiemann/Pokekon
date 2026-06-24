import { useId } from 'react';

interface PokeballMarkProps {
  /** Tailwind size/utility classes (e.g. "w-12 h-12"). */
  className?: string;
  /** Optional title for assistive tech; omit to keep it decorative (aria-hidden). */
  title?: string;
}

/**
 * A crisp, self-drawn Poké Ball — the app's playful brand mark.
 *
 * Hand-authored SVG (no external image, no bundled artwork) so it stays sharp
 * at any size and ships zero extra bytes beyond the markup. The red/white split
 * and centre button read instantly as "Pokémon" without leaning on copyrighted
 * sprite art. The clip-path id is per-instance (useId) so multiple balls on one
 * page never collide.
 */
export function PokeballMark({ className, title }: PokeballMarkProps) {
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y="0" width="100" height="50" fill="#e3350d" />
        <rect x="0" y="50" width="100" height="50" fill="#f8fafc" />
        <rect x="0" y="45" width="100" height="10" fill="#0f172a" />
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#0f172a" strokeWidth="5" />
      <circle cx="50" cy="50" r="14" fill="#0f172a" />
      <circle cx="50" cy="50" r="9.5" fill="#f8fafc" />
      <circle cx="50" cy="50" r="5" fill="#cbd5e1" />
    </svg>
  );
}
