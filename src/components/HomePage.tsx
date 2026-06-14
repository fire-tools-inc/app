import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import './HomePage.css';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="homepage" id="main-content">
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
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="paid" size="large" /></div>
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

        <Link to="/investment-growth" className="feature-card" aria-labelledby="investment-growth-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="trending_up" size="large" /></div>
          <h3 id="investment-growth-title" className="feature-card-title">{t('home.cards.investmentGrowth.title')}</h3>
          <p>
            {t('home.cards.investmentGrowth.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="show_chart" size="small" /> {t('home.cards.investmentGrowth.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="autorenew" size="small" /> {t('home.cards.investmentGrowth.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="savings" size="small" /> {t('home.cards.investmentGrowth.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.investmentGrowth.cta')}</span>
        </Link>

        <Link to="/portfolio-backtest" className="feature-card" aria-labelledby="portfolio-backtest-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="analytics" size="large" /></div>
          <h3 id="portfolio-backtest-title" className="feature-card-title">{t('home.cards.portfolioBacktest.title')}</h3>
          <p>
            {t('home.cards.portfolioBacktest.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="show_chart" size="small" /> {t('home.cards.portfolioBacktest.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="ssid_chart" size="small" /> {t('home.cards.portfolioBacktest.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="table_chart" size="small" /> {t('home.cards.portfolioBacktest.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.portfolioBacktest.cta')}</span>
        </Link>

        <Link to="/withdrawal-rate" className="feature-card" aria-labelledby="withdrawal-rate-title">
          <div className="feature-icon" aria-hidden="true"><MaterialIcon name="trending_down" size="large" /></div>
          <h3 id="withdrawal-rate-title" className="feature-card-title">{t('home.cards.withdrawalRate.title')}</h3>
          <p>
            {t('home.cards.withdrawalRate.body')}
          </p>
          <div className="feature-highlights">
            <span className="highlight-item"><MaterialIcon name="menu_book" size="small" /> {t('home.cards.withdrawalRate.h1')}</span>
            <span className="highlight-item"><MaterialIcon name="tune" size="small" /> {t('home.cards.withdrawalRate.h2')}</span>
            <span className="highlight-item"><MaterialIcon name="verified" size="small" /> {t('home.cards.withdrawalRate.h3')}</span>
          </div>
          <span className="cta-link" aria-hidden="true">{t('home.cards.withdrawalRate.cta')}</span>
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
