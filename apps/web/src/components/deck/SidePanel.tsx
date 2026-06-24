import type { ReactNode } from 'react';

interface SidePanelProps {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Unified side-panel wrapper used for Deck Settings, Local Meta, and Versions.
 * Ensures consistent header, padding, description line, and internal spacing.
 */
export function SidePanel({ icon, title, description, children }: SidePanelProps) {
  return (
    <div className="card p-0 flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-brand-700 shrink-0">{icon}</span>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <p className="text-xs text-slate-500 leading-snug font-semibold">{description}</p>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}
