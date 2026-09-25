import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../store/dashboardStore';
import { AccountPanel } from '../auth/AccountPanel';
import { AiSettingsModal } from '../settings/AiSettingsModal';
import { PokeballMark } from '../shared/PokeballMark';
import { COACH_NAV_ITEMS, COACH_TOOLS_ITEM } from './coachNav';

/** Desktop navigation of the archetype-first UI (Spec 7 §4): the four areas
 *  plus Tools, and the account area (settings stay available to everyone, E16). */
export function CoachSidebar() {
  const { t } = useTranslation('layout');
  const { coachTab, setCoachTab } = useDashboardStore();
  const [showAiSettings, setShowAiSettings] = useState(false);

  return (
    <aside className="relative z-10 hidden min-h-screen w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white/90 backdrop-blur-md md:flex">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-5">
        <PokeballMark className="h-7 w-7" />
        <span className="text-sm font-extrabold tracking-wide text-slate-900">Pokekon</span>
      </div>

      <nav className="mt-2 flex-1 space-y-1 p-2">
        {[...COACH_NAV_ITEMS, COACH_TOOLS_ITEM].map(({ id, labelKey, Icon }) => {
          const active = coachTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCoachTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all ${
                active
                  ? 'border-brand-200 bg-brand-100 text-brand-800'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <AccountPanel onOpenAiSettings={() => setShowAiSettings(true)} />
      </div>

      {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}
    </aside>
  );
}
