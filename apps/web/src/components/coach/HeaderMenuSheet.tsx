import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { AccountPanel } from '../auth/AccountPanel';
import { AiSettingsModal } from '../settings/AiSettingsModal';
import { COACH_TOOLS_ITEM } from './coachNav';

/** Mobile header menu of the archetype-first UI (Spec 7 §4): Tools and the
 *  account area (replaces the floating avatar chip of the old layout). */
export function HeaderMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('layout');
  const { setCoachTab } = useDashboardStore();
  const [showAiSettings, setShowAiSettings] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open && !showAiSettings) return null;
  const { Icon } = COACH_TOOLS_ITEM;

  return (
    <>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 md:hidden"
            onClick={onClose}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="header-menu-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-2xl border border-slate-200 bg-white p-5 shadow-card"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="header-menu-title" className="text-sm font-semibold text-slate-900">
                  {t('header.menu')}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('close', { ns: 'common' })}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-600 hover:text-slate-900"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCoachTab('tools');
                  onClose();
                }}
                className="mb-4 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
              >
                <Icon className="h-4 w-4 text-brand-700" aria-hidden="true" />
                {t(COACH_TOOLS_ITEM.labelKey)}
              </button>

              <AccountPanel onOpenAiSettings={() => setShowAiSettings(true)} />
            </div>
          </div>,
          document.body,
        )}
      {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}
    </>
  );
}
