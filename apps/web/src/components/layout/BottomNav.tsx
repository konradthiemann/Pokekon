import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Layers, Lightbulb, BarChart2, Plus } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { AddLogModal } from '../opponent/AddLogModal';

// Labels are i18n keys in the `layout` namespace, resolved at render time.
const NAV_ITEMS = [
  { id: 'overview', labelKey: 'nav.overview', Icon: LayoutDashboard },
  { id: 'meta', labelKey: 'nav.meta', Icon: BarChart2 },
  // center slot is the FAB
  { id: 'deck', labelKey: 'nav.myDeck', Icon: Layers },
  { id: 'recommendations', labelKey: 'nav.tips', Icon: Lightbulb },
] as const;

export function BottomNav() {
  const { t } = useTranslation('layout');
  const { activeTab, setActiveTab, refresh } = useDashboardStore();
  const [showLogModal, setShowLogModal] = useState(false);

  // Split nav into left half and right half around the FAB
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.15)] flex items-stretch">
        {/* Left items */}
        {left.map(({ id, labelKey, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-bold min-h-[56px] transition-colors ${
                active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {t(labelKey)}
            </button>
          );
        })}

        {/* Center FAB */}
        <div className="flex-shrink-0 flex items-center justify-center px-2">
          <button
            onClick={() => setShowLogModal(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 active:scale-95 flex items-center justify-center shadow-pop transition-all -translate-y-3 border-4 border-white"
            aria-label={t('bottomNav.logMatch')}
          >
            <Plus className="w-6 h-6 text-white" aria-hidden="true" />
          </button>
        </div>

        {/* Right items */}
        {right.map(({ id, labelKey, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-bold min-h-[56px] transition-colors ${
                active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      {showLogModal && (
        <AddLogModal
          onClose={() => {
            setShowLogModal(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
