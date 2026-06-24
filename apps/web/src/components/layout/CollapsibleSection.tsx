import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: ReactNode;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  rightSlot,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-200 hover:bg-slate-100 transition-colors text-left"
      >
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden="true"
        />
        {icon}
        <h3 className="text-sm font-bold text-slate-900 flex-1">{title}</h3>
        {rightSlot && <div onClick={(e) => e.stopPropagation()}>{rightSlot}</div>}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}
