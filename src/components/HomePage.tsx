import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import './HomePage.css';

const TOOL_GROUPS = [
  {
    key: 'tracking',
    tools: [
      { key: 'assetAllocation', path: '/asset-allocation', icon: 'pie_chart' },
      { key: 'cashflow', path: '/expense-tracker', icon: 'account_balance_wallet' },
      { key: 'netWorth', path: '/net-worth-tracker', icon: 'paid' },
    ],
  },
  {
    key: 'planning',
    tools: [
      { key: 'fireCalculator', path: '/fire-calculator', icon: 'local_fire_department' },
      { key: 'monteCarlo', path: '/monte-carlo', icon: 'ssid_chart' },
      { key: 'investmentGrowth', path: '/investment-growth', icon: 'trending_up' },
      { key: 'portfolioBacktest', path: '/portfolio-backtest', icon: 'analytics' },
      { key: 'withdrawalRate', path: '/withdrawal-rate', icon: 'trending_down' },
      { key: 'debtPayoff', path: '/debt-payoff', icon: 'credit_score' },
      { key: 'quiz', path: '/questionnaire', icon: 'quiz' },
    ],
  },
];

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="homepage" id="main-content" tabIndex={-1}>
      <header className="home-header">
        <div>
          <p className="home-eyebrow">{t('app.tagline')}</p>
          <h2>{t('home.aboutTitle')}</h2>
          <p className="home-description">{t('home.aboutBody')}</p>
        </div>
        <span className="home-local-status">
          <MaterialIcon name="lock" size="small" />
          {t('home.localFirst')}
        </span>
      </header>

      <div className="home-tools" aria-label={t('home.toolsLabel')}>
        {TOOL_GROUPS.map(group => (
          <section className={`home-tool-group home-tool-group--${group.key}`} key={group.key} aria-labelledby={`${group.key}-title`}>
            <h2 id={`${group.key}-title`} className="home-group-title">{t(`home.${group.key}Title`)}</h2>
            <div className={`features-grid features-grid--${group.key}`}>
              {group.tools.map(tool => (
                <PreloadLink to={tool.path} className="feature-card" key={tool.key} aria-labelledby={`${tool.key}-title`}>
                  <span className="feature-icon"><MaterialIcon name={tool.icon} /></span>
                  <div className="feature-card-copy">
                    <h3 id={`${tool.key}-title`} className="feature-card-title">{t(`home.cards.${tool.key}.title`)}</h3>
                    <p>{t(`home.cards.${tool.key}.body`)}</p>
                    <span className="cta-link" aria-hidden="true">{t(`home.cards.${tool.key}.cta`)}</span>
                  </div>
                </PreloadLink>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="home-disclaimer" role="note" aria-label={t('home.disclaimerAriaLabel')}>
        <MaterialIcon name="info" size="small" />
        <p><strong>{t('home.disclaimer')}</strong> {t('home.disclaimerBody')}</p>
      </aside>
    </main>
  );
}
