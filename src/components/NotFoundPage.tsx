import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { NAVBAR_LABELS } from '../constants/navbarLabels';
import './NotFoundPage.css';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="not-found-page" id="main-content">
      <div className="not-found-container">
        <div className="not-found-icon" aria-hidden="true"><MaterialIcon name="search" size="large" /></div>
        <h1 className="not-found-title">{t('notFound.title')}</h1>
        <p className="not-found-message">
          {t('notFound.message')}
        </p>
        <div className="not-found-actions">
          <Link to="/" className="btn-home">
            <MaterialIcon name="home" /> {t('notFound.backHome')}
          </Link>
          <Link to="/fire-calculator" className="btn-calculator">
            {/* Navbar label — English only by design (#233). */}
            <MaterialIcon name="local_fire_department" /> {NAVBAR_LABELS.fireCalculator}
          </Link>
        </div>
        <div className="helpful-links">
          <h2>{t('notFound.popularPages')}</h2>
          <nav aria-label={t('notFound.popularPagesNavigation')}>
            <ul>
              <li>
                <Link to="/asset-allocation">
                  <MaterialIcon name="pie_chart" /> {t('home.cards.assetAllocation.title')}
                </Link>
              </li>
              <li>
                <Link to="/expense-tracker">
                  <MaterialIcon name="account_balance_wallet" /> {t('home.cards.cashflow.title')}
                </Link>
              </li>
              <li>
                <Link to="/monte-carlo">
                  <MaterialIcon name="casino" /> {t('home.cards.monteCarlo.title')}
                </Link>
              </li>
              <li>
                <Link to="/settings">
                  <MaterialIcon name="settings" /> {t('settings.title')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
