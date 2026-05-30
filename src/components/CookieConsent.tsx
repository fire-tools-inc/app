import { useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { useTranslation } from 'react-i18next';
import { usePolicyModal } from '../App';
import './CookieConsent.css';

const CONSENT_COOKIE = 'fire-tools-cookie-consent';
const CONSENT_VERSION = '1';

interface ConsentData {
  version: string;
  acknowledged: boolean;
  timestamp: string;
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const { openPolicy } = usePolicyModal();

  useEffect(() => {
    // Check if user has already acknowledged the cookie notice
    const stored = Cookies.get(CONSENT_COOKIE);
    if (!stored) {
      setVisible(true);
    } else {
      try {
        const parsed: ConsentData = JSON.parse(stored);
        // Show banner again if version has changed
        if (parsed.version !== CONSENT_VERSION) {
          setVisible(true);
        }
      } catch {
        // If parsing fails, show the banner
        setVisible(true);
      }
    }
  }, []);

  const handleAcknowledge = () => {
    const consentData: ConsentData = {
      version: CONSENT_VERSION,
      acknowledged: true,
      timestamp: new Date().toISOString(),
    };
    
    Cookies.set(CONSENT_COOKIE, JSON.stringify(consentData), {
      expires: 365,
      sameSite: 'strict',
      secure: window.location.protocol === 'https:',
      path: '/',
    });
    
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="cookie-banner"
      role="dialog"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
      aria-modal="false"
    >
      <div className="cookie-banner-content">
        <div className="cookie-banner-text">
          <h2 id="cookie-title" className="cookie-banner-title">
            🍪 {t('cookieConsent.title')}
          </h2>
          <p id="cookie-description" className="cookie-banner-description">
            {t('cookieConsent.descriptionStart')}<strong>{t('cookieConsent.strictlyNecessary')}</strong>{t('cookieConsent.descriptionMiddle')}
            <strong>{t('cookieConsent.noTracking')}</strong>{t('cookieConsent.descriptionEnd')}
          </p>
          <p className="cookie-banner-links">
            {t('cookieConsent.learnMore')}:{' '}
            <button type="button" className="cookie-policy-link" onClick={() => openPolicy('privacy')}>
              {t('legal.privacyPolicy')}
            </button>
            {' · '}
            <button type="button" className="cookie-policy-link" onClick={() => openPolicy('cookie')}>
              {t('legal.cookiePolicy')}
            </button>
          </p>
        </div>
        <div className="cookie-banner-actions">
          <button
            onClick={handleAcknowledge}
            className="cookie-btn-acknowledge"
            aria-label={t('cookieConsent.acknowledgeAria')}
          >
            {t('cookieConsent.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
