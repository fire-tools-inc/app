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
import { loadSettings } from '../utils/cookieSettings';
import { getCurrencySymbol } from '../utils/currencyConverter';
import { AbbreviatedValue } from './AbbreviatedValue';
import { PrivacyBlur } from './PrivacyBlur';
import type { MonteCarloDisplayResult } from '../utils/simulationWorker';

interface MonteCarloChartProps {
  yearsDistribution: MonteCarloDisplayResult['yearsDistribution'];
  portfolioDistribution: MonteCarloDisplayResult['portfolioDistribution'];
  isPrivacyMode?: boolean;
}

export const MonteCarloChart: React.FC<MonteCarloChartProps> = ({ yearsDistribution: distributionData, portfolioDistribution, isPrivacyMode = false }) => {
  const { t } = useTranslation();

  // Get currency symbol from settings - recalculated on each render to pick up changes
  const settings = loadSettings();
  const currencySymbol = getCurrencySymbol(settings.currencySettings.defaultCurrency);

  return (
    <div className="monte-carlo-charts">
      {!distributionData.stats && <p className="monte-carlo-chart-placeholder">{t('monteCarlo.chart.noData')}</p>}
      {distributionData.stats && (
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
              fill="var(--accent-primary)"
              isAnimationActive={false}
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
      )}

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
