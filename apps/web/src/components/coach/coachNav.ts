import type { ComponentType, SVGProps } from 'react';
import { GraduationCap, Home, Layers, Swords, Wrench } from 'lucide-react';
import type { CoachTab } from '../../store/dashboardStore';

export interface CoachNavItem {
  id: CoachTab;
  /** Key in the `layout` i18n namespace. */
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/** Bottom navigation of the archetype-first UI (Spec 7 §4); shared with the
 *  desktop sidebar. Tools live in the header menu (mobile) / sidebar. */
export const COACH_NAV_ITEMS: readonly CoachNavItem[] = [
  { id: 'start', labelKey: 'coachNav.start', Icon: Home },
  { id: 'deck', labelKey: 'coachNav.deck', Icon: Layers },
  { id: 'coaching', labelKey: 'coachNav.coaching', Icon: GraduationCap },
  { id: 'opponents', labelKey: 'coachNav.opponents', Icon: Swords },
];

export const COACH_TOOLS_ITEM: CoachNavItem = {
  id: 'tools',
  labelKey: 'coachNav.tools',
  Icon: Wrench,
};
