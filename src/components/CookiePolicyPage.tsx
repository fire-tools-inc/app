import { useTranslation } from 'react-i18next';
import { CookiePolicyContent } from './PolicyContent';
import './PolicyPages.css';

export function CookiePolicyPage() {
  const { t } = useTranslation();
  return (
    <div className="policy-page">
      <div className="policy-container">
        <h1>{t('legal.cookiePolicy')}</h1>
        <p className="last-updated">
          <strong>{t('legal.lastUpdated')}</strong> {t('policyContent.cookie.lastUpdatedDate')}
        </p>
        <p className="policy-language-note">{t('legal.contentEnglishOnly')}</p>
        <CookiePolicyContent />
      </div>
    </div>
  );
}
