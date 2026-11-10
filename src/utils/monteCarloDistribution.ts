import type { MonteCarloResult } from '../types/calculator';

export function getYearsDistribution(result: MonteCarloResult) {
  const years = result.simulations.flatMap(simulation => simulation.yearsToFIRE === null ? [] : [simulation.yearsToFIRE])
    .sort((a, b) => a - b);
  if (years.length === 0) return { bins: [], stats: null };

  const min = years[0];
  const max = years[years.length - 1];
  const span = max - min + 1;
  const binCount = Math.min(span, Math.min(Math.max(Math.ceil(span / 2), 5), 20));
  const binSize = Math.max(1, Math.ceil(span / binCount));
  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = min + index * binSize;
    return {
      range: binSize === 1 ? `${start}` : `${start}-${start + binSize - 1}`,
      count: 0,
      isMedian: result.medianYearsToFIRE >= start && result.medianYearsToFIRE < start + binSize,
    };
  });
  for (const year of years) bins[Math.floor((year - min) / binSize)].count++;

  return {
    bins,
    stats: {
      min,
      max,
      median: result.medianYearsToFIRE,
      percentile10: years[Math.floor(years.length * 0.1)],
      percentile25: years[Math.floor(years.length * 0.25)],
      percentile75: years[Math.floor(years.length * 0.75)],
      percentile90: years[Math.floor(years.length * 0.9)],
      mean: years.reduce((sum, year) => sum + year, 0) / years.length,
    },
  };
}

export function getPortfolioDistribution(result: MonteCarloResult) {
  const portfolios = result.simulations.map(simulation => simulation.finalPortfolio).sort((a, b) => a - b);
  if (portfolios.length === 0) return null;
  const mid = Math.floor(portfolios.length / 2);
  return {
    min: portfolios[0],
    max: portfolios[portfolios.length - 1],
    median: portfolios.length % 2 === 0 ? (portfolios[mid - 1] + portfolios[mid]) / 2 : portfolios[mid],
    percentile10: portfolios[Math.floor(portfolios.length * 0.1)],
    percentile90: portfolios[Math.floor(portfolios.length * 0.9)],
  };
}
