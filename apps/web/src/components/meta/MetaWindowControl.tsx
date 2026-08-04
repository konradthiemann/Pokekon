import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { MetaWindow } from '../../lib/api';
import { QuantityStepper } from '../shared/QuantityStepper';
import { DAY_PRESETS } from './metaWindow';

/**
 * Shared meta window control: a day-range preset picker plus the "online Bo1
 * only" toggle. Governs both the overview field analysis and the archetype
 * drilldown, so the whole Meta tab reflects one consistent window.
 *
 * The `online` and `bo1` API flags are driven by a single toggle here — the
 * whole point is the local-Bo1 proxy, so they move together (on = online
 * Bo1-Swiss only; off = every persisted event, for comparison).
 */
export function MetaWindowControl({
  window,
  onDaysChange,
  onOnlineBo1Change,
}: {
  window: MetaWindow;
  onDaysChange: (days: number) => void;
  onOnlineBo1Change: (onlineBo1: boolean) => void;
}) {
  const { t } = useTranslation('meta');
  const onlineBo1 = window.online && window.bo1;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{t('window.lastDays')}</span>
        {/* Free numeric input (a11y stepper) so the window is fully dynamic… */}
        <QuantityStepper
          value={window.days}
          onChange={onDaysChange}
          min={1}
          max={180}
          ariaLabel={t('window.daysAria')}
          suffix={t('window.daysSuffix')}
        />
        {/* …plus quick-jump presets. */}
        <div className="flex gap-1">
          {DAY_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDaysChange(d)}
              aria-pressed={window.days === d}
              className={`rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${
                window.days === d
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={onlineBo1}
          onChange={(e) => onOnlineBo1Change(e.target.checked)}
          className="rounded accent-brand-500"
        />
        <span className="text-xs font-medium text-slate-600">{t('window.onlineBo1')}</span>
        <span title={t('window.onlineBo1Hint')} className="text-slate-400">
          <Info className="w-3 h-3" aria-hidden="true" />
        </span>
      </label>
    </div>
  );
}
