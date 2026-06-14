import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Asset } from '../types/assetAllocation';
import { PortfolioBacktestSuccess } from '../types/backtest';
import { fetchMultipleMonthlyPrices } from '../utils/priceApi';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import {
  deriveAnnualReturnsFromMonthlyPrices,
  runPortfolioBacktest,
} from '../utils/backtestCalculator';
import { logger } from '../utils/logger';
import { MaterialIcon } from './MaterialIcon';
import { PrivacyBlur } from './PrivacyBlur';

interface BacktestSectionProps {
  assets: Asset[];
  currency: string;
  isPrivacyMode: boolean;
  defaultInitialInvestment?: number;
}

interface BacktestFetchStatus {
  requestedTickers: number;
  failedTickers: string[];
}

const DEFAULT_INITIAL_INVESTMENT = 10000;
const DEFAULT_LOOKBACK_YEARS = 10;
const LOOKBACK_YEAR_OPTIONS = [5, 10, 15, 20];

export const BacktestSection: React.FC<BacktestSectionProps> = ({
  assets,
  currency,
  isPrivacyMode,
  defaultInitialInvestment,
}) => {
  const { t } = useTranslation();
  const initialDefault =
    defaultInitialInvestment && defaultInitialInvestment > 0
      ? Math.round(defaultInitialInvestment)
      : DEFAULT_INITIAL_INVESTMENT;
  const [initialInvestment, setInitialInvestment] = useState<number>(initialDefault);
  const [lookbackYears, setLookbackYears] = useState<number>(DEFAULT_LOOKBACK_YEARS);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<BacktestFetchStatus | null>(null);
  const [backtestResult, setBacktestResult] = useState<PortfolioBacktestSuccess | null>(null);
  const hasEditedInitialInvestmentRef = useRef(false);

  const eligibleAssets = useMemo(
    () => assets.filter(asset => asset.targetMode !== 'OFF' && asset.currentValue > 0),
    [assets],
  );

  const chartData = useMemo(
    () =>
      backtestResult?.years.map(point => ({
        ...point,
        drawdownPercent: point.drawdown * 100,
      })) ?? [],
    [backtestResult],
  );

  useEffect(() => {
    if (!hasEditedInitialInvestmentRef.current && initialDefault > 0) {
      setInitialInvestment(initialDefault);
    }
  }, [initialDefault]);

  const formatAxisCurrency = (value: number | string): string =>
    formatDisplayCurrency(Number(value), currency);
  const formatAxisPercent = (value: number | string): string =>
    formatDisplayPercent(Number(value));
  const tooltipValueToNumber = (
    value: number | string | readonly (number | string)[] | undefined,
  ): number => {
    if (Array.isArray(value)) {
      return Number(value[0] ?? 0);
    }
    return Number(value ?? 0);
  };
  const growthTooltipFormatter = (
    value: number | string | readonly (number | string)[] | undefined,
  ): [string, string] => [
    formatDisplayCurrency(tooltipValueToNumber(value), currency),
    t('backtest.metrics.finalValue'),
  ];
  const drawdownTooltipFormatter = (
    value: number | string | readonly (number | string)[] | undefined,
  ): [string, string] => [
    formatDisplayPercent(tooltipValueToNumber(value)),
    t('backtest.charts.drawdownLegend'),
  ];

  const runBacktest = async (): Promise<void> => {
    if (eligibleAssets.length === 0) {
      setError(t('backtest.errors.noAssets'));
      setBacktestResult(null);
      setFetchStatus(null);
      return;
    }
    if (!Number.isFinite(initialInvestment) || initialInvestment <= 0) {
      setError(t('backtest.errors.invalidInvestment'));
      setBacktestResult(null);
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const totalValue = eligibleAssets.reduce((sum, asset) => sum + asset.currentValue, 0);
      if (totalValue <= 0) {
        setError(t('backtest.errors.noAssets'));
        setBacktestResult(null);
        setFetchStatus(null);
        return;
      }

      const uniqueTickers = [
        ...new Set(
          eligibleAssets
            .map(asset => asset.ticker.trim().toUpperCase())
            .filter(ticker => ticker.length > 0),
        ),
      ];

      const annualReturnsByTicker: Record<string, Record<number, number>> = {};
      const failedTickers: string[] = [];

      if (uniqueTickers.length > 0) {
        const monthlyResults = await fetchMultipleMonthlyPrices(uniqueTickers, lookbackYears * 12 + 24);
        for (const ticker of uniqueTickers) {
          const tickerResult = monthlyResults[ticker];
          annualReturnsByTicker[ticker] = deriveAnnualReturnsFromMonthlyPrices(tickerResult?.prices ?? []);
          const hasError = Boolean(tickerResult?.error);
          const hasUsableData = Object.keys(annualReturnsByTicker[ticker]).length > 0;
          if (hasError || !hasUsableData) {
            failedTickers.push(ticker);
          }
        }
      }

      const result = runPortfolioBacktest({
        assets: eligibleAssets.map(asset => {
          const ticker = asset.ticker.trim().toUpperCase();
          return {
            id: asset.id,
            name: asset.name,
            ticker: ticker || undefined,
            assetClass: asset.assetClass,
            weight: asset.currentValue / totalValue,
            annualReturnsByYear: ticker ? annualReturnsByTicker[ticker] : undefined,
          };
        }),
        initialInvestment,
        lookbackYears,
        endYear: new Date().getFullYear() - 1,
      });

      if (!result.ok) {
        setError(t('backtest.errors.calculationFailed', { message: result.error }));
        setBacktestResult(null);
      } else {
        setBacktestResult(result);
      }

      setFetchStatus({
        requestedTickers: uniqueTickers.length,
        failedTickers,
      });
    } catch (runError) {
      logger.error('asset-allocation-backtest', 'run-failed', 'portfolio backtest execution failed', {
        pii: { error: runError instanceof Error ? runError.message : String(runError) },
      });
      setError(
        t('backtest.errors.calculationFailed', {
          message:
            runError instanceof Error
              ? runError.message
              : t('common.unknownError'),
        }),
      );
      setBacktestResult(null);
      setFetchStatus(null);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="allocation-section backtest-section" aria-labelledby="backtest-heading">
      <div className="section-header-with-actions backtest-header">
        <h3 id="backtest-heading">{t('backtest.title')}</h3>
      </div>

      <p className="section-description">{t('backtest.description')}</p>
      <p className="backtest-model-note">
        <MaterialIcon name="info" size="small" /> {t('backtest.model.buyAndHold')}
      </p>

      <div className="backtest-controls">
        <label htmlFor="backtest-initial-investment" className="backtest-control">
          <span>{t('backtest.controls.initialInvestment')}</span>
          <input
            id="backtest-initial-investment"
            type="number"
            min={1}
            step={100}
            value={initialInvestment}
            onChange={event => {
              hasEditedInitialInvestmentRef.current = true;
              setInitialInvestment(Number(event.target.value));
            }}
            className="target-input"
          />
          <small className="backtest-control-note">
            {t('backtest.controls.defaultInitialInvestmentNote', {
              amount: formatDisplayCurrency(initialDefault, currency),
            })}
          </small>
        </label>

        <label htmlFor="backtest-lookback-years" className="backtest-control">
          <span>{t('backtest.controls.lookbackYears')}</span>
          <select
            id="backtest-lookback-years"
            value={lookbackYears}
            onChange={event => setLookbackYears(Number(event.target.value))}
            className="class-select"
          >
            {LOOKBACK_YEAR_OPTIONS.map(option => (
              <option key={option} value={option}>
                {t('backtest.controls.lookbackOption', { years: option })}
              </option>
            ))}
          </select>
        </label>

        <button className="action-btn" onClick={runBacktest} disabled={isRunning}>
          <MaterialIcon name={isRunning ? 'hourglass_empty' : 'analytics'} />
          {isRunning ? t('backtest.controls.running') : t('backtest.controls.run')}
        </button>
      </div>

      <p className="backtest-final-value-note">
        <MaterialIcon name="help" size="small" /> {t('backtest.controls.finalValueExplanation')}
      </p>

      {error && (
        <div className="validation-errors" role="alert" aria-live="polite">
          <strong><MaterialIcon name="warning" /> {t('backtest.errors.title')}</strong>
          <p>{error}</p>
        </div>
      )}

      {fetchStatus && fetchStatus.requestedTickers > 0 && (
        <div className="backtest-fetch-status">
          <MaterialIcon name="dns" size="small" />{' '}
          {t('backtest.assumptions.marketCoverage', {
            requested: fetchStatus.requestedTickers,
            failed: fetchStatus.failedTickers.length,
          })}
          {fetchStatus.failedTickers.length > 0 && (
            <span>
              {' '}
              {t('backtest.assumptions.failedTickers', {
                tickers: fetchStatus.failedTickers.join(', '),
              })}
            </span>
          )}
        </div>
      )}

      {backtestResult && (
        <>
          {backtestResult.assumptionsUsed && (
            <div className="backtest-assumptions-note" role="status" aria-live="polite">
              <MaterialIcon name="info" size="small" />{' '}
              {t('backtest.assumptions.usedNotice', {
                count: backtestResult.coverage.filter(item => item.assumptionYears > 0).length,
              })}{' '}
              {t('backtest.assumptions.source', { source: backtestResult.assumptionSource })}
            </div>
          )}

          <div className="backtest-summary">
            <h4>{t('backtest.metrics.title')}</h4>
            <div className="allocation-table-container">
              <table className="asset-class-table backtest-summary-table">
                <tbody>
                  <tr>
                    <th>{t('backtest.metrics.cagr')}</th>
                    <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.cagr * 100)}</PrivacyBlur></td>
                    <th>{t('backtest.metrics.totalReturn')}</th>
                    <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.totalReturn * 100)}</PrivacyBlur></td>
                  </tr>
                  <tr>
                    <th>{t('backtest.metrics.annualizedVolatility')}</th>
                    <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.annualizedVolatility * 100)}</PrivacyBlur></td>
                    <th>{t('backtest.metrics.maxDrawdown')}</th>
                    <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.maxDrawdown * 100)}</PrivacyBlur></td>
                  </tr>
                  <tr>
                    <th>{t('backtest.metrics.bestYear')}</th>
                    <td>
                      {backtestResult.metrics.bestYear.year}{' '}
                      (<PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.bestYear.return * 100)}</PrivacyBlur>)
                    </td>
                    <th>{t('backtest.metrics.worstYear')}</th>
                    <td>
                      {backtestResult.metrics.worstYear.year}{' '}
                      (<PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(backtestResult.metrics.worstYear.return * 100)}</PrivacyBlur>)
                    </td>
                  </tr>
                  <tr>
                    <th>{t('backtest.metrics.finalValue')}</th>
                    <td colSpan={3}>
                      <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                        {formatDisplayCurrency(backtestResult.metrics.finalValue, currency)}
                      </PrivacyBlur>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="charts-row backtest-charts-row">
            <div className="chart-card">
              <h4>{t('backtest.charts.growthTitle')}</h4>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={formatAxisCurrency} width={90} />
                  <Tooltip
                    labelFormatter={label => `${t('backtest.table.year')}: ${label}`}
                    formatter={growthTooltipFormatter}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="portfolioValue"
                    name={t('backtest.charts.growthLegend')}
                    stroke="#5568d4"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <h4>{t('backtest.charts.drawdownTitle')}</h4>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={formatAxisPercent} />
                  <Tooltip
                    labelFormatter={label => `${t('backtest.table.year')}: ${label}`}
                    formatter={drawdownTooltipFormatter}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="drawdownPercent"
                    name={t('backtest.charts.drawdownLegend')}
                    stroke="#e53935"
                    fill="#ef9a9a"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="backtest-series-table allocation-table-container">
            <h4>{t('backtest.table.title')}</h4>
            <table className="allocation-table">
              <thead>
                <tr>
                  <th>{t('backtest.table.year')}</th>
                  <th>{t('backtest.table.annualReturn')}</th>
                  <th>{t('backtest.table.endValue')}</th>
                  <th>{t('backtest.table.drawdown')}</th>
                  <th>{t('backtest.table.dataSource')}</th>
                </tr>
              </thead>
              <tbody>
                {backtestResult.years.map(point => {
                  let dataSourceLabel = t('backtest.table.mixedData');
                  if (point.marketWeight >= 0.999) {
                    dataSourceLabel = t('backtest.table.marketData');
                  } else if (point.marketWeight <= 0.001) {
                    dataSourceLabel = t('backtest.table.assumptionData');
                  }

                  return (
                    <tr key={point.year}>
                      <td>{point.year}</td>
                      <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(point.annualReturn * 100)}</PrivacyBlur></td>
                      <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayCurrency(point.portfolioValue, currency)}</PrivacyBlur></td>
                      <td><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(point.drawdown * 100)}</PrivacyBlur></td>
                      <td>{dataSourceLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};
