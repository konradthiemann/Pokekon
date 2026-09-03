import type { ComponentType, SVGProps } from 'react';
import { LayoutDashboard, BarChart2, Layers } from 'lucide-react';
import type { DashboardTab } from '../../store/dashboardStore';

export interface NavItem {
  id: DashboardTab;
  /** Key in the `layout` i18n namespace. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * The three top-level dashboard tabs (plan ui-ux-hub-rework.md §3.2) — the
 * single source shared by the desktop `Sidebar` and the mobile `BottomNav`,
 * replacing the two divergent local arrays they used before (plan §0.1).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'overview', labelKey: 'nav.overview', Icon: LayoutDashboard },
  { id: 'meta', labelKey: 'nav.meta', Icon: BarChart2 },
  { id: 'deck', labelKey: 'nav.myDeck', Icon: Layers },
];
