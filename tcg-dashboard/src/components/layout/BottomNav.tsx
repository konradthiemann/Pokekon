import { useState } from 'react';
import { LayoutDashboard, Layers, Lightbulb, BarChart2, Plus } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { AddLogModal } from '../opponent/AddLogModal';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'meta',     label: 'Meta',     Icon: BarChart2 },
  // center slot is the FAB
  { id: 'deck',     label: 'My Deck',  Icon: Layers },
  { id: 'recommendations', label: 'Tips', Icon: Lightbulb },
] as const;

export function BottomNav() {
  const { activeTab, setActiveTab, refresh } = useDashboardStore();
  const [showLogModal, setShowLogModal] = useState(false);

  // Split nav into left half and right half around the FAB
  const left  = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-gray-900 border-t border-gray-800 flex items-stretch">
        {/* Left items */}
        {left.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-semibold min-h-[56px] transition-colors ${
                active ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-brand-400' : ''}`} />
              {label}
            </button>
          );
        })}

        {/* Center FAB */}
        <div className="flex-shrink-0 flex items-center justify-center px-2">
          <button
            onClick={() => setShowLogModal(true)}
            className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-500 active:scale-95 flex items-center justify-center shadow-lg shadow-brand-900/50 transition-all -translate-y-3 border-4 border-gray-900"
            aria-label="Log Match"
          >
            <Plus className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Right items */}
        {right.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-semibold min-h-[56px] transition-colors ${
                active ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-brand-400' : ''}`} />
              {label}
            </button>
          );
        })}
      </nav>

      {showLogModal && (
        <AddLogModal
          onClose={() => { setShowLogModal(false); refresh(); }}
        />
      )}
    </>
  );
}
