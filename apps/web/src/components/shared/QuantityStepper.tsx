import { Minus, Plus } from 'lucide-react';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name for the numeric field + the decrement/increment buttons. */
  ariaLabel: string;
  /** Optional unit shown after the number (e.g. "Tage"). Decorative. */
  suffix?: string;
  className?: string;
}

/**
 * Accessible quantity selector: a decrement button, a numeric spinbutton, and an
 * increment button. The native `<input type="number">` is a spinbutton (arrow
 * keys work, screen readers announce the value/limits); the explicit −/+ buttons
 * give a large, obvious tap target with proper `aria-label`s and disabled states
 * at the bounds. Values are always clamped to [min, max].
 */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  ariaLabel,
  suffix,
  className = '',
}: QuantityStepperProps) {
  const set = (v: number) => {
    if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
  };

  const btn =
    'flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white';

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => set(value - step)}
        disabled={value <= min}
        aria-label={`${ariaLabel} verringern`}
        className={btn}
      >
        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={ariaLabel}
        className="h-7 w-14 rounded-md border border-slate-300 bg-white px-1 text-center text-sm font-semibold tabular-nums text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      {suffix ? <span className="text-xs font-medium text-slate-500">{suffix}</span> : null}
      <button
        type="button"
        onClick={() => set(value + step)}
        disabled={value >= max}
        aria-label={`${ariaLabel} erhöhen`}
        className={btn}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
