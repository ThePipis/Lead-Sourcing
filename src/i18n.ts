import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import commonES from './locales/es/common.json';
import canvasES from './locales/es/canvas.json';
import prospectingES from './locales/es/prospecting.json';
import curationES from './locales/es/curation.json';
import exportES from './locales/es/export.json';

import commonEN from './locales/en/common.json';
import canvasEN from './locales/en/canvas.json';
import prospectingEN from './locales/en/prospecting.json';
import curationEN from './locales/en/curation.json';
import exportEN from './locales/en/export.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: commonES,
        canvas: canvasES,
        prospecting: prospectingES,
        curation: curationES,
        export: exportES,
      },
      en: {
        common: commonEN,
        canvas: canvasEN,
        prospecting: prospectingEN,
        curation: curationEN,
        export: exportEN,
      },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    defaultNS: 'common',
    ns: ['common', 'canvas', 'prospecting', 'curation', 'export'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
