/**
 * Props for the StatCard component.
 *
 * The `color` prop controls both the value text colour and a left-border
 * accent, allowing cards to be grouped visually by meaning (e.g. green for
 * wins, red for losses) without requiring separate card variants.
 */
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  color?: 'default' | 'green' | 'red' | 'purple' | 'blue' | 'yellow';
}

/**
 * Maps the `color` prop to the Tailwind text class applied to the value.
 */
const COLOR_MAP: Record<NonNullable<StatCardProps['color']>, string> = {
  default: 'text-white',
  green: 'text-emerald-400',
  red: 'text-red-400',
  purple: 'text-brand-400',
  blue: 'text-blue-400',
  yellow: 'text-yellow-400',
};

/**
 * Maps the `color` prop to a left-border accent class.
 *
 * The left border provides a secondary colour cue beyond the value text,
 * making it easier to scan a row of stat cards at a glance. `default` has no
 * border so neutral cards don't carry unnecessary visual weight.
 */
const BORDER_MAP: Record<NonNullable<StatCardProps['color']>, string> = {
  default: '',
  green: 'border-l-4 border-l-emerald-600',
  red: 'border-l-4 border-l-red-600',
  purple: 'border-l-4 border-l-brand-600',
  blue: 'border-l-4 border-l-blue-600',
  yellow: 'border-l-4 border-l-yellow-600',
};

/**
 * A compact summary card displaying a labelled metric value.
 *
 * Used throughout the dashboard to surface key numbers (win rate, record,
 * total matches, etc.) in a consistent visual container. The optional `color`
 * prop applies both a text tint to the value and a left-border accent to the
 * card, giving each metric a semantic colour identity.
 *
 * React Concept: This is a pure presentational component — it receives all
 * data as props and has no internal state, making it trivial to test and
 * reuse anywhere in the component tree.
 *
 * @param props.label - Short descriptor shown above the value (e.g. "Wins").
 * @param props.value - The metric to display prominently.
 * @param props.sub   - Optional secondary line shown below the value.
 * @param props.color - Visual colour theme for the value text and left border.
 */
export function StatCard({ label, value, sub, color = 'default' }: StatCardProps) {
  return (
    <div className={`card ${BORDER_MAP[color]}`}>
      <div className="card-header">{label}</div>
      <div className={`stat-value ${COLOR_MAP[color]}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
