import { useTranslation } from 'react-i18next';
import { PrivacyPolicyContent } from './PolicyContent';
import './PolicyPages.css';

export function PrivacyPolicyPage() {
  const { t } = useTranslation();
  return (
    <div className="policy-page">
      <div className="policy-container">
        <h1>{t('legal.privacyPolicy')}</h1>
        <p className="last-updated">
          <strong>{t('legal.lastUpdated')}</strong> {t('policyContent.privacy.lastUpdatedDate')}
        </p>
        <p className="policy-language-note">{t('legal.contentEnglishOnly')}</p>
        <PrivacyPolicyContent />
      </div>
    </div>
  );
}
