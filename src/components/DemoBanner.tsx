import { useTranslation } from 'react-i18next';
import { IS_DEMO_MODE } from '../utils/demoMode';
import './DemoBanner.css';

const RELEASES_URL = 'https://github.com/fire-tools-inc/app/releases/latest';

export function DemoBanner() {
  const { t } = useTranslation();

  if (!IS_DEMO_MODE) {
    return null;
  }

  return (
    <div className="demo-banner" role="status" aria-live="polite">
      <div className="demo-banner__inner">
        <span className="demo-banner__icon" aria-hidden="true">🧪</span>
        <span className="demo-banner__text">{t('demo.message')}</span>
        <a
          className="demo-banner__cta"
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('demo.cta')}
        </a>
      </div>
    </div>
  );
}
