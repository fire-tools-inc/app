import { describe, expect, it } from 'vitest';
import { getPortfolioDistribution, getYearsDistribution } from '../../../src/utils/monteCarloDistribution';
import type { MonteCarloResult } from '../../../src/types/calculator';

function resultFor(years: number[], portfolios = years): MonteCarloResult {
  return {
    successCount: years.length,
    failureCount: 0,
    successRate: 100,
    medianYearsToFIRE: years[Math.floor(years.length / 2)] ?? 0,
    simulations: years.map((year, index) => ({
      simulationId: index + 1, success: true, yearsToFIRE: year, finalPortfolio: portfolios[index],
    })),
  };
}

describe('Monte Carlo distributions', () => {
  it('counts every run, including the upper histogram boundary', () => {
    const result = resultFor(Array.from({ length: 11 }, (_, index) => index));
    const { bins } = getYearsDistribution(result);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(11);
    expect(bins.find(bin => bin.range === '10-11')?.count).toBe(1);
  });

  it('preserves zero-year percentiles and fractional medians', () => {
    const result = { ...resultFor([0, 0, 1, 2]), medianYearsToFIRE: 0.5 };
    const distribution = getYearsDistribution(result);
    expect(distribution.stats?.percentile10).toBe(0);
    expect(distribution.stats?.percentile25).toBe(0);
    expect(distribution.bins.some(bin => bin.isMedian)).toBe(true);
  });

  it('includes depleted portfolios and averages an even median', () => {
    expect(getPortfolioDistribution(resultFor([1, 2, 3, 4], [0, 0, 100, 200]))).toMatchObject({
      median: 50, percentile10: 0, percentile90: 200,
    });
  });

  it('handles the maximum UI simulation count without losing runs', () => {
    const result = resultFor(Array.from({ length: 100_000 }, (_, index) => index % 51));
    const { bins } = getYearsDistribution(result);
    expect(bins.length).toBeLessThanOrEqual(20);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(100_000);
  });

  it('handles empty results', () => {
    expect(getYearsDistribution(resultFor([]))).toEqual({ bins: [], stats: null });
    expect(getPortfolioDistribution(resultFor([]))).toBeNull();
  });
});
