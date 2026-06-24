import { useTranslation } from 'react-i18next';
import { LEGAL_ROUTES } from '../../lib/legalRoutes';

/**
 * Tiny "Impressum · Datenschutz" link pair shown in the app's footers (welcome
 * screen, sidebar, mobile account sheet). Plain anchors to the standalone legal
 * routes — these must stay reachable both signed-out and signed-in.
 */
export function LegalLinks({ className = '' }: { className?: string }) {
  const { t } = useTranslation('legal');
  return (
    <nav
      aria-label={t('tabImpressum')}
      className={`flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400 ${className}`}
    >
      <a href={LEGAL_ROUTES.impressum} className="hover:text-slate-700 hover:underline">
        {t('tabImpressum')}
      </a>
      <span aria-hidden="true">·</span>
      <a href={LEGAL_ROUTES.datenschutz} className="hover:text-slate-700 hover:underline">
        {t('tabDatenschutz')}
      </a>
    </nav>
  );
}
