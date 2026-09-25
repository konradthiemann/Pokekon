import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { AddLogModal } from '../opponent/AddLogModal';
import { COACH_NAV_ITEMS, type CoachNavItem } from './coachNav';

/** Mobile navigation of the archetype-first UI (Spec 7 §4):
 *  [Start, Deck] · ＋ (paste a log) · [Coaching, Opponents]. Blue acts, the
 *  yellow ring marks the core-loop action; red is never a button (§9a). */
export function CoachBottomNav() {
  const { t } = useTranslation('layout');
  const { coachTab, setCoachTab, activeDeckId, refresh } = useDashboardStore();
  const [showAddLog, setShowAddLog] = useState(false);

  const tab = ({ id, labelKey, Icon }: CoachNavItem) => {
    const active = coachTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setCoachTab(id)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-3 text-[11px] font-bold transition-colors ${
          active ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {t(labelKey)}
      </button>
    );
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-slate-200 bg-white/95 shadow-[0_-4px_20px_-8px_rgba(15,23,42,0.15)] backdrop-blur md:hidden">
        {COACH_NAV_ITEMS.slice(0, 2).map(tab)}
        <div className="flex flex-shrink-0 items-center justify-center px-2">
          <button
            type="button"
            onClick={() => setShowAddLog(true)}
            aria-label={t('coach.pasteLog')}
            className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-brand-600 shadow-pop ring-4 ring-energy-500 transition-all hover:bg-brand-700 active:scale-95"
          >
            <Plus className="h-6 w-6 text-white" aria-hidden="true" />
          </button>
        </div>
        {COACH_NAV_ITEMS.slice(2).map(tab)}
      </nav>

      {showAddLog && (
        <AddLogModal
          preselectedDeckId={activeDeckId ?? undefined}
          onClose={() => {
            setShowAddLog(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}
