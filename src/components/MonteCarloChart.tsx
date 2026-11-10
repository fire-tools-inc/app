import { useTranslation } from 'react-i18next';
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
  const maxCount = Math.max(1, ...distributionData.bins.map(bin => bin.count));

  return (
    <div className="monte-carlo-charts">
      {!distributionData.stats && <p className="monte-carlo-chart-placeholder">{t('monteCarlo.chart.noData')}</p>}
      {distributionData.stats && (
      <section className="chart-section" aria-labelledby="years-distribution-heading">
        <h4 id="years-distribution-heading">{t('monteCarlo.chart.yearsDistribution')}</h4>
        <figure className="simulation-histogram" aria-label={t('monteCarlo.chart.yearsDistributionAria')}>
          <div className="histogram-scroll" role="region" tabIndex={0} aria-label={t('monteCarlo.chart.yearsDistributionAria')}>
                <div className="histogram-columns" role="list" aria-label={t('monteCarlo.chart.simulationsAxisLabel')}>
                  {distributionData.bins.map(bin => (
                    <div
                      key={bin.range}
                      className={`histogram-bin${bin.isMedian ? ' histogram-bin--median' : ''}`}
                      role="listitem"
                      title={`${t('monteCarlo.chart.tooltipYears', { label: bin.range })}: ${t('monteCarlo.chart.tooltipSimulations', { value: bin.count })}`}
                    >
                      <span className="histogram-count">{bin.count}</span>
                      <span className="histogram-bar" style={{ height: `${bin.count / maxCount * 180}px` }} aria-hidden="true" />
                      <span className="histogram-range">{bin.range}</span>
                    </div>
                  ))}
                </div>
          </div>
          <figcaption className="histogram-caption">
            <span>{t('monteCarlo.chart.yearsAxisLabel')}</span>
            <span className="histogram-median-key">{t('monteCarlo.chart.median')}</span>
          </figcaption>
        </figure>

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
