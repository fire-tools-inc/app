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

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  title: string;
  description: string;
  /** Whether this dimension needs Yahoo metadata to be meaningful. */
  needsMetadata: boolean;
}

const DIMENSIONS: DimensionConfig[] = [
  {
    dimension: 'currency',
    title: 'By Currency',
    description: 'Distribution of holdings by the currency they were originally entered in.',
    needsMetadata: false,
  },
  {
    dimension: 'holding',
    title: 'By Holding',
    description: 'Each individual asset as a share of the portfolio.',
    needsMetadata: false,
  },
  {
    dimension: 'sector',
    title: 'By Sector',
    description:
      'For ETFs and funds, sector exposure is expanded using Yahoo Finance sector weightings. Individual stocks use their listed sector.',
    needsMetadata: true,
  },
  {
    dimension: 'continent',
    title: 'By Continent',
    description: 'Derived from each stock’s country of incorporation. ETFs fall back to their asset class.',
    needsMetadata: true,
  },
  {
    dimension: 'region',
    title: 'By Region',
    description: 'Finer-grained region (e.g., Western Europe, East Asia) derived from country of incorporation.',
    needsMetadata: true,
  },
  {
    dimension: 'market',
    title: 'By Market',
    description: 'The listing exchange for each holding (e.g., NASDAQ, LSE, Xetra).',
    needsMetadata: true,
  },
  {
    dimension: 'etfProvider',
    title: 'By ETF Provider',
    description:
      'The fund family / issuer (e.g., Vanguard, iShares). Direct stock holdings are grouped under “Direct holding”.',
    needsMetadata: true,
  },
];

export const PortfolioBreakdownPage: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [currency] = useState<string>(() => loadSettings().currencySettings.defaultCurrency);
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => loadSettings().privacyMode);

  useEffect(() => {
    const saved = loadAssetAllocation();
    setAssets(saved.assets || []);
  }, []);

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
            <MaterialIcon name="donut_large" className="page-header-icon" /> Portfolio Breakdown
          </h1>
        </div>
        <p>
          Slice your current portfolio across multiple dimensions to understand concentration risk,
          diversification, and exposure. Data is read from your saved Asset Allocation; for ETFs and
          individual stocks, additional metadata is fetched from Yahoo Finance.
        </p>
        <p className="page-header-link">
          <Link to="/asset-allocation" className="inline-link">
            <MaterialIcon name="pie_chart" size="small" /> Back to Asset Allocation
          </Link>
        </p>
      </header>

      <main className="portfolio-breakdown-content" id="main-content">
        <section className="portfolio-value-section" aria-labelledby="portfolio-value-heading">
          <div className="portfolio-value-label">
            <strong id="portfolio-value-heading">Portfolio Value:</strong>
            <span className="portfolio-value">
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                {formatCurrency(totalValue, currency)}
              </PrivacyBlur>
            </span>
            <button
              className="privacy-eye-btn"
              onClick={togglePrivacyMode}
              title={isPrivacyMode ? 'Show values' : 'Hide values'}
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
              aria-label="Refresh asset metadata from Yahoo Finance"
              title="Re-fetch sector, country, and fund family from Yahoo Finance"
            >
              <MaterialIcon name={isLoading ? 'hourglass_empty' : 'refresh'} />
              {isLoading ? ' Refreshing…' : ' Refresh Metadata'}
            </button>
            {lastRefresh && lastRefresh.fetchedCount > 0 && (
              <span className="price-refresh-status" role="status">
                Metadata for {lastRefresh.fetchedCount} ticker
                {lastRefresh.fetchedCount !== 1 ? 's' : ''}
                {lastRefresh.failedTickers.length > 0 && (
                  <> · Failed: {lastRefresh.failedTickers.join(', ')}</>
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
            <MaterialIcon name="info" /> Your portfolio is empty. Add assets in the{' '}
            <Link to="/asset-allocation" className="inline-link">
              Asset Allocation Manager
            </Link>{' '}
            to see breakdowns here.
          </div>
        )}

        {!hasNoData && hasNoTickers && (
          <div className="breakdown-info-banner" role="status">
            <MaterialIcon name="info" /> None of your assets have a ticker symbol, so only the
            Currency and Holding breakdowns are available. Add tickers in the Asset Allocation
            Manager to unlock sector, region, market, and provider breakdowns.
          </div>
        )}

        <section className="breakdowns-grid" aria-label="Portfolio breakdowns">
          {DIMENSIONS.map(d => {
            if (hasNoData) return null;
            if (d.needsMetadata && hasNoTickers) return null;
            return (
              <BreakdownChart
                key={d.dimension}
                title={d.title}
                description={d.description}
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
