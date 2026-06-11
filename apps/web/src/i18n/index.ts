import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import deCommon from './locales/de/common.json';
import deLayout from './locales/de/layout.json';
import deOverview from './locales/de/overview.json';
import deDeck from './locales/de/deck.json';
import deMeta from './locales/de/meta.json';
import deOpponents from './locales/de/opponents.json';
import deRecommendations from './locales/de/recommendations.json';

import enCommon from './locales/en/common.json';
import enLayout from './locales/en/layout.json';
import enOverview from './locales/en/overview.json';
import enDeck from './locales/en/deck.json';
import enMeta from './locales/en/meta.json';
import enOpponents from './locales/en/opponents.json';
import enRecommendations from './locales/en/recommendations.json';

export const LANGUAGE_STORAGE_KEY = 'pokekon-lang';

export const resources = {
  de: {
    common: deCommon,
    layout: deLayout,
    overview: deOverview,
    deck: deDeck,
    meta: deMeta,
    opponents: deOpponents,
    recommendations: deRecommendations,
  },
  en: {
    common: enCommon,
    layout: enLayout,
    overview: enOverview,
    deck: enDeck,
    meta: enMeta,
    opponents: enOpponents,
    recommendations: enRecommendations,
  },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['de', 'en'],
    defaultNS: 'common',
    interpolation: {
      // React already escapes rendered strings
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
