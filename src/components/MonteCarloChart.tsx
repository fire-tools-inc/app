import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { MonteCarloResult } from '../types/calculator';
import { loadSettings } from '../utils/cookieSettings';
import { getCurrencySymbol } from '../utils/currencyConverter';
import { AbbreviatedValue } from './AbbreviatedValue';
import { PrivacyBlur } from './PrivacyBlur';

interface MonteCarloChartProps {
  result: MonteCarloResult;
  isPrivacyMode?: boolean;
}

interface DistributionBin {
  range: string;
  count: number;
  isMedian: boolean;
}

export const MonteCarloChart: React.FC<MonteCarloChartProps> = ({ result, isPrivacyMode = false }) => {
  const { t } = useTranslation();
  // Calculate distribution data for histogram
  const distributionData = useMemo(() => {
    const successfulYears = result.simulations
      .filter(s => s.yearsToFIRE !== null)
      .map(s => s.yearsToFIRE as number)
      .sort((a, b) => a - b);

    if (successfulYears.length === 0) {
      return { bins: [], stats: null };
    }

    // Use reduce instead of spread to avoid stack overflow with large arrays
    const minYears = successfulYears.reduce((min, y) => y < min ? y : min, successfulYears[0]);
    const maxYears = successfulYears.reduce((max, y) => y > max ? y : max, successfulYears[0]);
    const range = maxYears - minYears;
    
    // Create bins for histogram (aim for about 10-15 bins)
    const binCount = Math.min(Math.max(Math.ceil(range / 2), 5), 20);
    const binSize = Math.ceil(range / binCount) || 1;
    
    const bins: DistributionBin[] = [];
    for (let i = 0; i < binCount; i++) {
      const binStart = minYears + (i * binSize);
      const binEnd = binStart + binSize - 1;
      const count = successfulYears.filter(y => y >= binStart && y <= binEnd).length;
      
      bins.push({
        range: binSize === 1 ? `${binStart}` : `${binStart}-${binEnd}`,
        count,
        isMedian: result.medianYearsToFIRE >= binStart && result.medianYearsToFIRE <= binEnd,
      });
    }

    // Calculate statistics
    const sortedYears = [...successfulYears].sort((a, b) => a - b);
    const percentile10Index = Math.floor(sortedYears.length * 0.1);
    const percentile25Index = Math.floor(sortedYears.length * 0.25);
    const percentile75Index = Math.floor(sortedYears.length * 0.75);
    const percentile90Index = Math.floor(sortedYears.length * 0.9);

    return {
      bins,
      stats: {
        min: minYears,
        max: maxYears,
        median: result.medianYearsToFIRE,
        percentile10: sortedYears[percentile10Index] || minYears,
        percentile25: sortedYears[percentile25Index] || minYears,
        percentile75: sortedYears[percentile75Index] || maxYears,
        percentile90: sortedYears[percentile90Index] || maxYears,
        mean: successfulYears.reduce((a, b) => a + b, 0) / successfulYears.length,
      },
    };
  }, [result]);

  // Calculate final portfolio distribution
  const portfolioDistribution = useMemo(() => {
    const portfolios = result.simulations
      .map(s => s.finalPortfolio)
      .filter(p => p > 0)
      .sort((a, b) => a - b);

    if (portfolios.length === 0) {
      return null;
    }

    // Use reduce instead of spread to avoid stack overflow with large arrays
    const minPortfolio = portfolios.reduce((min, p) => p < min ? p : min, portfolios[0]);
    const maxPortfolio = portfolios.reduce((max, p) => p > max ? p : max, portfolios[0]);
    const medianIndex = Math.floor(portfolios.length / 2);
    const percentile10Index = Math.floor(portfolios.length * 0.1);
    const percentile90Index = Math.floor(portfolios.length * 0.9);

    return {
      min: minPortfolio,
      max: maxPortfolio,
      median: portfolios[medianIndex],
      percentile10: portfolios[percentile10Index],
      percentile90: portfolios[percentile90Index],
    };
  }, [result]);

  // Get currency symbol from settings - recalculated on each render to pick up changes
  const settings = loadSettings();
  const currencySymbol = getCurrencySymbol(settings.currencySettings.defaultCurrency);

  if (!distributionData.stats || distributionData.bins.length === 0) {
    return (
      <div className="monte-carlo-chart-placeholder">
        <p>{t('monteCarlo.chart.noData')}</p>
      </div>
    );
  }

  return (
    <div className="monte-carlo-charts">
      <section className="chart-section" aria-labelledby="years-distribution-heading">
        <h4 id="years-distribution-heading">{t('monteCarlo.chart.yearsDistribution')}</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={distributionData.bins} aria-label={t('monteCarlo.chart.yearsDistributionAria')}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" />
            <XAxis 
              dataKey="range" 
              label={{ value: t('monteCarlo.chart.yearsAxisLabel'), position: 'insideBottom', offset: -5, fill: '#94A3B8' }}
              tick={{ fontSize: 11, fill: '#94A3B8' }}
              stroke="#3A3D46"
            />
            <YAxis 
              label={{ value: t('monteCarlo.chart.simulationsAxisLabel'), angle: -90, position: 'insideLeft', fill: '#94A3B8' }}
              tick={{ fill: '#94A3B8' }}
              stroke="#3A3D46"
            />
            <Tooltip 
              formatter={(value) => [t('monteCarlo.chart.tooltipSimulations', { value }), t('monteCarlo.chart.tooltipCount')]}
              labelFormatter={(label) => t('monteCarlo.chart.tooltipYears', { label })}
              contentStyle={{ background: '#1A1D26', border: '1px solid #2DD4BF', borderRadius: '8px', color: '#F8FAFC' }}
              labelStyle={{ color: '#F8FAFC' }}
              itemStyle={{ color: '#F8FAFC' }}
            />
            <Legend wrapperStyle={{ paddingTop: '12px', color: '#F8FAFC' }} />
            <Bar 
              dataKey="count" 
              fill="#2DD4BF" 
              name={t('monteCarlo.chart.simulationsAxisLabel')}
            />
            {distributionData.stats && (() => {
              const medianBinIndex = distributionData.bins.findIndex(b => b.isMedian);
              return medianBinIndex >= 0 ? (
                <ReferenceLine 
                  x={distributionData.bins[medianBinIndex].range}
                  stroke="#4B5563" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{ value: t('monteCarlo.chart.median'), position: 'top', fill: '#4B5563' }}
                />
              ) : null;
            })()}
          </BarChart>
        </ResponsiveContainer>

        <div className="distribution-stats" role="table" aria-label={t('monteCarlo.chart.statsAria')}>
          <div className="stat-row" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.bestCase10')}</span>
            <span className="stat-value best-case" role="cell">{t('monteCarlo.chart.yearsValue', { value: distributionData.stats.percentile10 })}</span>
          </div>
          <div className="stat-row" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.percentile25')}</span>
            <span className="stat-value" role="cell">{t('monteCarlo.chart.yearsValue', { value: distributionData.stats.percentile25 })}</span>
          </div>
          <div className="stat-row median" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.medianPercentile')}</span>
            <span className="stat-value" role="cell">{t('monteCarlo.chart.yearsValue', { value: distributionData.stats.median })}</span>
          </div>
          <div className="stat-row" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.percentile75')}</span>
            <span className="stat-value" role="cell">{t('monteCarlo.chart.yearsValue', { value: distributionData.stats.percentile75 })}</span>
          </div>
          <div className="stat-row" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.worstCase90')}</span>
            <span className="stat-value worst-case" role="cell">{t('monteCarlo.chart.yearsValue', { value: distributionData.stats.percentile90 })}</span>
          </div>
          <div className="stat-row" role="row">
            <span className="stat-label" role="cell">{t('monteCarlo.chart.mean')}</span>
            <span className="stat-value" role="cell">{t('monteCarlo.chart.meanValue', { value: distributionData.stats.mean.toFixed(1) })}</span>
          </div>
        </div>
      </section>

      {portfolioDistribution && (
        <section className="chart-section" aria-labelledby="portfolio-stats-heading">
          <h4 id="portfolio-stats-heading">{t('monteCarlo.chart.portfolioStats')}</h4>
          <div className="distribution-stats" role="table" aria-label={t('monteCarlo.chart.portfolioStatsAria')}>
            <div className="stat-row" role="row">
              <span className="stat-label" role="cell">{t('monteCarlo.chart.worstCase10')}</span>
              <span className="stat-value worst-case" role="cell"><PrivacyBlur isPrivacyMode={isPrivacyMode}><AbbreviatedValue value={portfolioDistribution.percentile10} currency={currencySymbol} /></PrivacyBlur></span>
            </div>
            <div className="stat-row median" role="row">
              <span className="stat-label" role="cell">{t('monteCarlo.chart.medianPortfolio')}</span>
              <span className="stat-value" role="cell"><PrivacyBlur isPrivacyMode={isPrivacyMode}><AbbreviatedValue value={portfolioDistribution.median} currency={currencySymbol} /></PrivacyBlur></span>
            </div>
            <div className="stat-row" role="row">
              <span className="stat-label" role="cell">{t('monteCarlo.chart.bestCase90')}</span>
              <span className="stat-value best-case" role="cell"><PrivacyBlur isPrivacyMode={isPrivacyMode}><AbbreviatedValue value={portfolioDistribution.percentile90} currency={currencySymbol} /></PrivacyBlur></span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
