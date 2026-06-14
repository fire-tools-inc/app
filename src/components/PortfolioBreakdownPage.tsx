/**
 * Portfolio Breakdown Page
 *
 * Renders multiple breakdowns of the *current* portfolio:
 * currency, holding, sector, continent, region, market (exchange), ETF provider.
 *
 * Data flow:
 *   - Loads the saved asset allocation (current portfolio only)
 *   - Fetches per-ticker metadata from Yahoo Finance via `useAssetMetadata`
 *   - Computes breakdowns with `computeAllBreakdowns`
 *   - Renders a donut + table per dimension via `BreakdownChart`
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Asset } from '../types/assetAllocation';
import { BreakdownDimension } from '../types/portfolioBreakdown';
import { loadAssetAllocation } from '../utils/cookieStorage';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import { computeAllBreakdowns, selectActiveAssets } from '../utils/portfolioBreakdownCalculator';
import { formatCurrency } from '../utils/allocationCalculator';
import { useAssetMetadata } from '../hooks/useAssetMetadata';
import { MaterialIcon } from './MaterialIcon';
import { BreakdownChart } from './BreakdownChart';
import { PrivacyBlur } from './PrivacyBlur';
import { ScrollToTopButton } from './ScrollToTopButton';
import './PortfolioBreakdownPage.css';

interface DimensionConfig {
  dimension: BreakdownDimension;
  titleKey: string;
  descriptionKey: string;
  /** Whether this dimension needs Yahoo metadata to be meaningful. */
  needsMetadata: boolean;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    dimension: 'currency',
    titleKey: 'portfolioBreakdown.dimensions.currency.title',
    descriptionKey: 'portfolioBreakdown.dimensions.currency.description',
    needsMetadata: false,
  },
  {
    dimension: 'holding',
    titleKey: 'portfolioBreakdown.dimensions.holding.title',
    descriptionKey: 'portfolioBreakdown.dimensions.holding.description',
    needsMetadata: false,
  },
  {
    dimension: 'sector',
    titleKey: 'portfolioBreakdown.dimensions.sector.title',
    descriptionKey: 'portfolioBreakdown.dimensions.sector.description',
    needsMetadata: true,
  },
  {
    dimension: 'continent',
    titleKey: 'portfolioBreakdown.dimensions.continent.title',
    descriptionKey: 'portfolioBreakdown.dimensions.continent.description',
    needsMetadata: true,
  },
  {
    dimension: 'region',
    titleKey: 'portfolioBreakdown.dimensions.region.title',
    descriptionKey: 'portfolioBreakdown.dimensions.region.description',
    needsMetadata: true,
  },
  {
    dimension: 'market',
    titleKey: 'portfolioBreakdown.dimensions.market.title',
    descriptionKey: 'portfolioBreakdown.dimensions.market.description',
    needsMetadata: true,
  },
  {
    dimension: 'etfProvider',
    titleKey: 'portfolioBreakdown.dimensions.etfProvider.title',
    descriptionKey: 'portfolioBreakdown.dimensions.etfProvider.description',
    needsMetadata: true,
  },
];

export const PortfolioBreakdownPage: React.FC = () => {
  const { t } = useTranslation();
  // Load assets synchronously so the metadata hook sees them on first mount.
  // Loading them later (via useEffect) would mean the metadata fetch fires
  // with an empty array and never retries when the real assets arrive.
  const [assets] = useState<Asset[]>(() => loadAssetAllocation().assets || []);
  const [currency] = useState<string>(() => loadSettings().currencySettings.defaultCurrency);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => loadSettings().privacyMode);

  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };

  const { metadata, isLoading, lastRefresh, error, refresh } = useAssetMetadata(assets);

  const activeAssets = useMemo(() => selectActiveAssets(assets), [assets]);
  const totalValue = useMemo(
    () => activeAssets.reduce((s, a) => s + a.currentValue, 0),
    [activeAssets],
  );
  const tickerAssetCount = useMemo(
    () => activeAssets.filter(a => a.ticker && a.ticker.trim().length > 0).length,
    [activeAssets],
  );

  const breakdowns = useMemo(
    () => computeAllBreakdowns(assets, metadata),
    [assets, metadata],
  );

  const hasNoData = activeAssets.length === 0;
  const hasNoTickers = tickerAssetCount === 0;

  return (
    <div className="portfolio-breakdown-page">
      <header className="page-header">
        <div className="page-header-top">
          <h1>
            <MaterialIcon name="donut_large" className="page-header-icon" /> {t('portfolioBreakdown.title')}
          </h1>
        </div>
        <p>
          {t('portfolioBreakdown.subtitle')}
        </p>
        <p className="page-header-link">
          <Link to="/asset-allocation" className="action-btn breakdown-page-link">
            <MaterialIcon name="pie_chart" size="small" /> {t('portfolioBreakdown.backToAssetAllocation')}
          </Link>
        </p>
      </header>

      <main className="portfolio-breakdown-content" id="main-content">
        <section className="portfolio-value-section" aria-labelledby="portfolio-value-heading">
          <div className="portfolio-value-label">
            <strong id="portfolio-value-heading">{t('portfolioBreakdown.portfolioValue')}</strong>
            <span className="portfolio-value">
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                {formatCurrency(totalValue, currency)}
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

          <div className="breakdown-refresh-row">
            <button
              className="action-btn"
              onClick={() => void refresh()}
              disabled={isLoading || hasNoTickers}
              aria-label={t('portfolioBreakdown.refreshMetadataAria')}
              title={t('portfolioBreakdown.refreshMetadataTitle')}
            >
              <MaterialIcon name={isLoading ? 'hourglass_empty' : 'refresh'} />
              {isLoading ? t('portfolioBreakdown.refreshingMetadata') : t('portfolioBreakdown.refreshMetadata')}
            </button>
            {lastRefresh && lastRefresh.fetchedCount > 0 && (
              <span className="price-refresh-status" role="status">
                {t('portfolioBreakdown.metadataFetched', { count: lastRefresh.fetchedCount })}
                {lastRefresh.failedTickers.length > 0 && (
                  <> {t('portfolioBreakdown.failedTickers', { tickers: lastRefresh.failedTickers.join(', ') })}</>
                )}
              </span>
            )}
            {error && (
              <span className="price-refresh-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </section>

        {hasNoData && (
          <div className="empty-portfolio-banner" role="status">
            <MaterialIcon name="info" /> {t('portfolioBreakdown.emptyPrefix')}{' '}
            <Link to="/asset-allocation" className="inline-link">
              {t('home.cards.assetAllocation.title')}
            </Link>{' '}
            {t('portfolioBreakdown.emptySuffix')}
          </div>
        )}

        {!hasNoData && hasNoTickers && (
          <div className="breakdown-info-banner" role="status">
            <MaterialIcon name="info" /> {t('portfolioBreakdown.noTickers')}
          </div>
        )}

        <section className="breakdowns-grid" aria-label={t('portfolioBreakdown.breakdownsAria')}>
          {DIMENSIONS.map(d => {
            if (hasNoData) return null;
            if (d.needsMetadata && hasNoTickers) return null;
            return (
              <BreakdownChart
                key={d.dimension}
                title={t(d.titleKey)}
                description={t(d.descriptionKey)}
                result={breakdowns[d.dimension]}
                currency={currency}
                isPrivacyMode={isPrivacyMode}
              />
            );
          })}
        </section>
      </main>

      <ScrollToTopButton />
    </div>
  );
};
