import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Asset } from '../types/assetAllocation';
import { loadAssetAllocation } from '../utils/cookieStorage';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { DEFAULT_ASSETS } from '../utils/defaultAssets';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { MaterialIcon } from './MaterialIcon';
import { BacktestSection } from './BacktestSection';
import { PrivacyBlur } from './PrivacyBlur';
import './AssetAllocationManager.css';

const calculateActivePortfolioValue = (assets: Asset[]): number =>
  assets
    .filter(asset => asset.targetMode !== 'OFF' && asset.currentValue > 0)
    .reduce((sum, asset) => sum + asset.currentValue, 0);

export const PortfolioBacktestPage: React.FC = () => {
  const { t } = useTranslation();
  const [assets] = useState<Asset[]>(() => loadAssetAllocation().assets || DEFAULT_ASSETS);
  const [currency] = useState<string>(() => loadSettings().currencySettings.defaultCurrency);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => loadSettings().privacyMode);

  const activePortfolioValue = useMemo(() => calculateActivePortfolioValue(assets), [assets]);

  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };

  return (
    <div className="asset-allocation-page">
      <header className="page-header">
        <div className="page-header-top">
          <h1><MaterialIcon name="analytics" className="page-header-icon" /> {t('backtest.pageTitle')}</h1>
        </div>
        <p>{t('backtest.pageDescription')}</p>
      </header>

      <main className="asset-allocation-manager" id="main-content">
        <section className="portfolio-value-section" aria-labelledby="backtest-source-heading">
          <div className="portfolio-value-label">
            <strong id="backtest-source-heading">{t('backtest.source.currentAllocationValue')}</strong>
            <span className="portfolio-value">
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                {formatDisplayCurrency(activePortfolioValue, currency)}
              </PrivacyBlur>
            </span>
            <button
              className="privacy-eye-btn"
              onClick={togglePrivacyMode}
              title={isPrivacyMode ? t('common.showValues') : t('common.hideValues')}
              aria-pressed={isPrivacyMode}
            >
              <MaterialIcon name={isPrivacyMode ? 'visibility_off' : 'visibility'} size="small" />
            </button>
          </div>
          <div className="portfolio-value-info">
            {t('backtest.source.usesAssetAllocation')}
          </div>
          <div className="backtest-source-actions">
            <Link to="/asset-allocation" className="action-btn breakdown-page-link">
              <MaterialIcon name="pie_chart" /> {t('backtest.source.editAllocation')}
            </Link>
          </div>
        </section>

        <BacktestSection
          assets={assets}
          currency={currency}
          isPrivacyMode={isPrivacyMode}
          defaultInitialInvestment={activePortfolioValue}
        />
      </main>
    </div>
  );
};
