import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import ptBR from './pt-BR';

export type AppLanguage = 'en' | 'pt-BR';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt-BR', label: 'Português (BR)' },
];

export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';

const resources = {
  en: { translation: en },
  'pt-BR': { translation: ptBR },
};

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: 'pt-BR',
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
});

export function setAppLanguage(language: AppLanguage): void {
  i18n.changeLanguage(language);
}

export function getAppLanguage(): AppLanguage {
  return (i18n.language ?? DEFAULT_LANGUAGE) as AppLanguage;
}

export { i18n };
export default i18n;
