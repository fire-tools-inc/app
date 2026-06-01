import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  loadSecurityBannerDismissed,
  saveSecurityBannerDismissed,
} from '../utils/bannerPreferences';
import { useState } from 'react';
import { MaterialIcon } from './MaterialIcon';
import './HomePage.css';

// Check if running on GitHub Pages (computed once on module load)
const isGitHubPages =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'github.io' ||
    window.location.hostname.endsWith('.github.io'));

// Compute initial banner state synchronously to prevent CLS
function getInitialBannerState(): boolean {
  if (!isGitHubPages) {
    return false;
  }
  return !loadSecurityBannerDismissed();
}

export function HomePage() {
  const { t } = useTranslation();
  // Initialize state synchronously to prevent layout shift
  const [showSecurityBanner, setShowSecurityBanner] = useState(getInitialBannerState);

  const handleDismissSecurityBanner = () => {
    saveSecurityBannerDismissed(true);
    setShowSecurityBanner(false);
  };

  return (
    <main className="homepage" id="main-content">
      {isGitHubPages && showSecurityBanner && (
        <div className="security-warning-banner">
          <div className="warning-icon"><MaterialIcon name="lock" /><MaterialIcon name="warning" /></div>
          <div className="warning-content">
            <h2 className="warning-heading">{t('home.securityTitle')}</h2>
            <p>
              <strong>{t('home.securityWarning')}</strong> {t('home.securityWarningBody')}
            </p>
            <p>
              <strong>{t('home.securityRecommend')}</strong> {t('home.securityRecommendBody')}
            </p>
            <div className="warning-actions">
              <a 
                href="https://github.com/mbianchidev/fire-calculator#getting-started" 
                target="_blank" 
                rel="noopener noreferrer"
                className="warning-button"
              >
                <MaterialIcon name="menu_book" /> {t('home.securitySetupLink')}
              </a>
            </div>
          </div>
          <button
            type="button"
            className="warning-close"
            aria-label={t('home.dismissSecurity')}
            onClick={handleDismissSecurityBanner}
          >
            ×
          </button>
        </div>
      )}

      <section className="info-section" aria-labelledby="about-title">
        <h2 id="about-title" className="info-section-title">{t('home.aboutTitle')}</h2>
        <p>
          {t('home.aboutBody')}
        </p>
        <div className="disclaimer" role="note" aria-label={t('home.disclaimerAriaLabel')}>
          <strong><MaterialIcon name="warning" /> {t('home.disclaimer')}</strong> {t('home.disclaimerBody')}
        </div>
      </section>

      <section className="features-grid" aria-label={t('home.toolsLabel')}>
        <Link to="/asset-allocation" className="feature-card" aria-labelledby="asset-allocation-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="pie_chart" size="large" /></div>
          <h3 id="asset-allocation-title" className="feature-card-title">{t('home.cards.assetAllocation.title')}</h3>
          <p>
            {t('home.cards.assetAllocation.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="work" size="small" /> {t('home.cards.assetAllocation.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="balance" size="small" /> {t('home.cards.assetAllocation.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="show_chart" size="small" /> {t('home.cards.assetAllocation.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.assetAllocation.cta')}</span>
        </Link>

        <Link to="/expense-tracker" className="feature-card" aria-labelledby="expense-tracker-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="account_balance_wallet" size="large" /></div>
          <h3 id="expense-tracker-title" className="feature-card-title">{t('home.cards.cashflow.title')}</h3>
          <p>
            {t('home.cards.cashflow.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="receipt_long" size="small" /> {t('home.cards.cashflow.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="savings" size="small" /> {t('home.cards.cashflow.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="analytics" size="small" /> {t('home.cards.cashflow.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.cashflow.cta')}</span>
        </Link>

        <Link to="/net-worth-tracker" className="feature-card" aria-labelledby="net-worth-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="trending_up" size="large" /></div>
          <h3 id="net-worth-title" className="feature-card-title">{t('home.cards.netWorth.title')}</h3>
          <p>
            {t('home.cards.netWorth.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="work" size="small" /> {t('home.cards.netWorth.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="payments" size="small" /> {t('home.cards.netWorth.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="elderly" size="small" /> {t('home.cards.netWorth.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.netWorth.cta')}</span>
        </Link>

        <Link to="/fire-calculator" className="feature-card" aria-labelledby="fire-calc-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="local_fire_department" size="large" /></div>
          <h3 id="fire-calc-title" className="feature-card-title">{t('home.cards.fireCalculator.title')}</h3>
          <p>
            {t('home.cards.fireCalculator.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="bar_chart" size="small" /> {t('home.cards.fireCalculator.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="trending_up" size="small" /> {t('home.cards.fireCalculator.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="account_balance_wallet" size="small" /> {t('home.cards.fireCalculator.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.fireCalculator.cta')}</span>
        </Link>

        <Link to="/monte-carlo" className="feature-card" aria-labelledby="monte-carlo-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="casino" size="large" /></div>
          <h3 id="monte-carlo-title" className="feature-card-title">{t('home.cards.monteCarlo.title')}</h3>
          <p>
            {t('home.cards.monteCarlo.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="gps_fixed" size="small" /> {t('home.cards.monteCarlo.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="ssid_chart" size="small" /> {t('home.cards.monteCarlo.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="bolt" size="small" /> {t('home.cards.monteCarlo.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.monteCarlo.cta')}</span>
        </Link>

        <Link to="/questionnaire" className="feature-card" aria-labelledby="fire-quiz-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="quiz" size="large" /></div>
          <h3 id="fire-quiz-title" className="feature-card-title">{t('home.cards.quiz.title')}</h3>
          <p>
            {t('home.cards.quiz.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="psychology" size="small" /> {t('home.cards.quiz.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="lightbulb" size="small" /> {t('home.cards.quiz.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="trending_up" size="small" /> {t('home.cards.quiz.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.quiz.cta')}</span>
        </Link>

        <Link to="/debt-payoff" className="feature-card" aria-labelledby="debt-payoff-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="credit_score" size="large" /></div>
          <h3 id="debt-payoff-title" className="feature-card-title">{t('home.cards.debtPayoff.title')}</h3>
          <p>
            {t('home.cards.debtPayoff.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="ac_unit" size="small" /> {t('home.cards.debtPayoff.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="schedule" size="small" /> {t('home.cards.debtPayoff.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="show_chart" size="small" /> {t('home.cards.debtPayoff.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.debtPayoff.cta')}</span>
        </Link>
      </section>
    </main>
  );
}
