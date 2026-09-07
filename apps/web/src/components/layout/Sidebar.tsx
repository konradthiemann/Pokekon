import { useTranslation } from 'react-i18next';
import { useDashboardStore } from '../../store/dashboardStore';
import { NAV_ITEMS } from './navItems';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LegalLinks } from './LegalLinks';
import { SyncControls } from './SyncControls';
import { UserMenu } from '../auth/UserMenu';
import { PokeballMark } from '../shared/PokeballMark';

export function Sidebar() {
  const { t } = useTranslation('layout');
  const { activeTab, setActiveTab } = useDashboardStore();

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 flex-col bg-white/80 backdrop-blur-md border-r border-slate-200 min-h-screen relative z-10 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-slate-200">
        <PokeballMark className="w-7 h-7 drop-shadow-sm" />
        <span className="font-extrabold text-slate-900 text-sm tracking-wide">TCG Meta</span>
        <span className="ml-auto text-[10px] text-slate-400 tracking-widest uppercase font-bold">
          {t('sidebar.dashboard')}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 mt-2">
        {NAV_ITEMS.map(({ id, labelKey, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all ${
                active
                  ? 'bg-brand-100 text-brand-800 border border-brand-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      {/* Bottom controls */}
      <div className="p-4 border-t border-slate-200 space-y-2">
        <SyncControls />

        <div className="pt-1 border-t border-slate-200">
          <UserMenu />
        </div>

        <div className="flex justify-center pt-1">
          <LanguageSwitcher />
        </div>

        <LegalLinks className="pt-1" />
      </div>
    </aside>
  );
}
