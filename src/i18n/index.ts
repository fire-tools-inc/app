import i18n from 'i18next';
import type { Resource, ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { logger } from '../utils/logger';

export const SUPPORTED_LANGUAGES = ['en', 'it', 'fr', 'de', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

const LANGUAGE_LOADERS: Record<SupportedLanguage, () => Promise<ResourceLanguage>> = {
  en: () => import('./locales/en.json').then((module) => module.default),
  it: () => import('./locales/it.json').then((module) => module.default),
  fr: () => import('./locales/fr.json').then((module) => module.default),
  de: () => import('./locales/de.json').then((module) => module.default),
  es: () => import('./locales/es.json').then((module) => module.default),
};

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

async function initializeI18n(): Promise<void> {
  let initialLanguage = resolveInitialLanguage();
  let initialResource: ResourceLanguage;

  try {
    initialResource = await LANGUAGE_LOADERS[initialLanguage]();
  } catch (error) {
    logger.error('i18n', 'initial-language-load-failed', 'failed to load initial language bundle', {
      pii: {
        language: initialLanguage,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    if (initialLanguage === DEFAULT_LANGUAGE) throw error;
    initialLanguage = DEFAULT_LANGUAGE;
    initialResource = await LANGUAGE_LOADERS[DEFAULT_LANGUAGE]();
  }

  const resources: Resource = {
    [initialLanguage]: { translation: initialResource },
  };

  if (initialLanguage !== DEFAULT_LANGUAGE) {
    try {
      resources[DEFAULT_LANGUAGE] = {
        translation: await LANGUAGE_LOADERS[DEFAULT_LANGUAGE](),
      };
    } catch (error) {
      logger.warn('i18n', 'fallback-language-load-failed', 'failed to preload English fallback bundle', {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export const i18nReady = initializeI18n();

/**
 * Change the active UI language and persist it to the encrypted cookie.
 * Language is independent from currency and other display preferences.
 */
export async function setLanguage(lang: SupportedLanguage): Promise<void> {
  if (!isSupportedLanguage(lang)) {
    logger.error('i18n', 'unsupported-language', 'unsupported language requested', { pii: { language: lang as string } });
    return;
  }
  await i18nReady;
  if (!i18n.hasResourceBundle(lang, 'translation')) {
    try {
      const resource = await LANGUAGE_LOADERS[lang]();
      i18n.addResourceBundle(lang, 'translation', resource, true, true);
    } catch (error) {
      logger.error('i18n', 'language-load-failed', 'failed to load requested language bundle', {
        pii: {
          language: lang,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
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
