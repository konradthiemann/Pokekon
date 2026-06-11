import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
] as const;

/**
 * Compact DE/EN toggle. The selected language is persisted to localStorage
 * by i18next-browser-languagedetector (key: `pokekon-lang`).
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label={t('language')}
      title={t('language')}
    >
      <Languages className="w-3.5 h-3.5 text-white/30" aria-hidden="true" />
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => void i18n.changeLanguage(code)}
          aria-pressed={current === code}
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider transition-colors ${
            current === code
              ? 'bg-brand-500/30 text-brand-300'
              : 'text-white/40 hover:text-white/70'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
