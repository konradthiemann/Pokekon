import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { PokeballMark } from '../components/shared/PokeballMark';
import { LEGAL_ROUTES, type LegalDoc } from '../lib/legalRoutes';

/** One titled block of legal text — shape of an entry in the `legal` namespace. */
interface LegalSection {
  heading: string;
  body: string[];
}

/**
 * Standalone Impressum / Datenschutz page. Rendered by App.tsx before the login
 * gate, so it is reachable without a session (a legal requirement). The body is
 * driven entirely by the `legal` i18n namespace, so switching DE/EN reflows the
 * whole document; the German version stays the authoritative one (see the note).
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation('legal');
  // returnObjects yields the section array; the TFunction return type is string
  // by default, hence the explicit cast to the known shape.
  const sections = t(`${doc}.sections`, { returnObjects: true }) as unknown as LegalSection[];

  const TABS: { target: LegalDoc; labelKey: 'tabImpressum' | 'tabDatenschutz' }[] = [
    { target: 'impressum', labelKey: 'tabImpressum' },
    { target: 'datenschutz', labelKey: 'tabDatenschutz' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('back')}
          </a>
          <nav className="ml-auto flex items-center gap-1" aria-label={t('tabDatenschutz')}>
            {TABS.map(({ target, labelKey }) => {
              const active = target === doc;
              return (
                <a
                  key={target}
                  href={LEGAL_ROUTES[target]}
                  aria-current={active ? 'page' : undefined}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    active ? 'bg-brand-100 text-brand-800' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t(labelKey)}
                </a>
              );
            })}
          </nav>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="card">
          <div className="mb-5 flex items-center gap-2.5 border-b border-slate-200 pb-4">
            <PokeballMark className="h-7 w-7 drop-shadow-sm" />
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                {t(`${doc}.title`)}
              </h1>
              <p className="text-xs font-semibold text-slate-500">{t(`${doc}.updated`)}</p>
            </div>
          </div>

          <div className="space-y-6">
            {sections.map((section, i) => (
              <section key={i}>
                <h2 className="mb-1.5 text-base font-bold text-slate-900">{section.heading}</h2>
                <div className="space-y-2">
                  {section.body.map((paragraph, j) => (
                    <p
                      key={j}
                      className="whitespace-pre-line text-sm leading-relaxed text-slate-700"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-6 border-t border-slate-200 pt-4 text-xs italic text-slate-500">
            {t('authoritativeNote')}
          </p>
        </div>
      </main>
    </div>
  );
}
