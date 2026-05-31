import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from '../i18n';
import { logger } from '../utils/logger';

const LABEL_KEYS: Record<SupportedLanguage, string> = {
  en: 'common.english',
  it: 'common.italian',
  fr: 'common.french',
  de: 'common.german',
  es: 'common.spanish',
};

export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const current = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? (i18n.language as SupportedLanguage)
    : 'en';

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as SupportedLanguage;
    try {
      await setLanguage(next);
    } catch (error) {
      logger.error('language-selector', 'set-language-failed', 'failed to change language', { pii: { error: (error as Error)?.message } });
    }
  };

  return (
    <div className="setting-item">
      <label htmlFor="languageSelector">{t('settings.language')}</label>
      <select
        id="languageSelector"
        value={current}
        onChange={handleChange}
        className="language-selector"
        aria-label={t('settings.language')}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(LABEL_KEYS[lang])}
          </option>
        ))}
      </select>
      <span className="setting-help">{t('settings.languageHelp')}</span>
    </div>
  );
}
