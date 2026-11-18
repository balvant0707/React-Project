// Copied from COMPASS app/src/i18n/index.ts. Changes: storage key, resources come from the core locale files and
// modules/apps add theirs with addLocale(). German and English are the platform languages (NPM domain modules: English only).
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/de';
import 'dayjs/locale/en';
import deDE from 'antd/es/locale/de_DE';
import enUS from 'antd/es/locale/en_US';
import de from './locales/de.json';
import en from './locales/en.json';

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const ANTD_LOCALES = { de: deDE, en: enUS } as const;

const STORAGE_KEY = 'rbp.language';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: STORAGE_KEY, caches: ['localStorage'] },
  });

/** Adds the texts of a module or an app (deep-merged into the default namespace). */
export function addLocale(language: Language, texts: Record<string, unknown>) {
  i18n.addResourceBundle(language, 'translation', texts, true, true);
}

export function currentLanguage(): Language {
  return (i18n.resolvedLanguage as Language) === 'de' ? 'de' : 'en';
}

let appLanguages: readonly Language[] = LANGUAGES;
/** The languages an app offers (default: all platform languages). With one, the app is fixed to it and the language switch and
 *  the profile's language card disappear (RADAR: English only while its NPM modules are, plan T10). Call before rendering. */
export function setAppLanguages(languages: readonly Language[]) {
  appLanguages = languages.length ? languages : LANGUAGES;
  if (!appLanguages.includes(currentLanguage())) void i18n.changeLanguage(appLanguages[0]);
}
export const getAppLanguages = () => appLanguages;

const syncDayjs = () => dayjs.locale(currentLanguage());
syncDayjs();
i18n.on('languageChanged', () => {
  syncDayjs();
  document.documentElement.lang = currentLanguage();
});

export default i18n;
