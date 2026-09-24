import type { LucideIcon } from 'lucide-react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  Icon: LucideIcon;
}

/**
 * Segmented tab bar — one panel visible at a time instead of several full
 * cards stacked vertically. Extracted from `DeckPage.tsx`'s inline
 * deck/analytics/tips switcher (same visual design) so the archetype
 * drilldown can use the identical, already-proven pattern instead of
 * inventing a second one (UI/UX redesign, see `docs/features.md`).
 */
export function SegmentedTabs<T extends string>({
  items,
  active,
  onChange,
}: {
  items: SegmentedTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-1 rounded-2xl overflow-hidden backdrop-blur-md border border-slate-200 bg-white"
    >
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
          className={[
            'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all',
            active === id
              ? 'text-brand-800 bg-brand-50 shadow-[inset_0_-2px_0_0_rgba(96,165,250,0.6)]'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50',
          ].join(' ')}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
