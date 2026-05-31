import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import it from './locales/it.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { logger } from '../utils/logger';

export const SUPPORTED_LANGUAGES = ['en', 'it', 'fr', 'de', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

function resolveInitialLanguage(): SupportedLanguage {
  try {
    const stored = loadSettings().language;
    if (isSupportedLanguage(stored)) return stored;
  } catch (error) {
    logger.error('i18n', 'load-language-failed', 'failed to read language from settings cookie', { pii: { error: (error as Error)?.message } });
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
    fr: { translation: fr },
    de: { translation: de },
    es: { translation: es },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  load: 'languageOnly',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/**
 * Change the active UI language and persist it to the encrypted cookie.
 * Language is independent from currency and other display preferences.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  if (!isSupportedLanguage(lang)) {
    logger.error('i18n', 'unsupported-language', 'unsupported language requested', { pii: { language: lang as string } });
    return;
  }
  try {
    const current = loadSettings();
    if (current.language !== lang) {
      saveSettings({ ...current, language: lang });
    }
  } catch (error) {
    logger.error('i18n', 'save-language-failed', 'failed to persist language preference', { pii: { error: (error as Error)?.message } });
  }
  await i18n.changeLanguage(lang);
}

export default i18n;
