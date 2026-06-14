import { describe, expect, it } from 'vitest';
import { MonthlyClosingPrice } from '../types/priceApi';
import { BacktestAssetInput } from '../types/backtest';
import { deriveAnnualReturnsFromMonthlyPrices, runPortfolioBacktest } from './backtestCalculator';

describe('deriveAnnualReturnsFromMonthlyPrices', () => {
  it('computes yearly returns from year-end monthly close prices', () => {
    const prices: MonthlyClosingPrice[] = [
      { ticker: 'AAA', date: '2020-01-31', open: 100, high: 100, low: 100, close: 100 },
      { ticker: 'AAA', date: '2020-12-31', open: 110, high: 110, low: 110, close: 110 },
      { ticker: 'AAA', date: '2021-12-31', open: 99, high: 99, low: 99, close: 99 },
      { ticker: 'AAA', date: '2022-12-31', open: 108.9, high: 108.9, low: 108.9, close: 108.9 },
    ];

    const result = deriveAnnualReturnsFromMonthlyPrices(prices);

    expect(result[2021]).toBeCloseTo(-0.1, 8);
    expect(result[2022]).toBeCloseTo(0.1, 8);
  });
});

describe('runPortfolioBacktest', () => {
  it('computes CAGR, drawdown and volatility correctly for deterministic annual returns', () => {
    const assets: BacktestAssetInput[] = [
      {
        id: 'asset-1',
        name: 'Asset 1',
        ticker: 'AAA',
        assetClass: 'STOCKS',
        weight: 1,
        annualReturnsByYear: {
          2021: 0.1,
          2022: -0.2,
          2023: 0.25,
        },
      },
    ];

    const result = runPortfolioBacktest({
      assets,
      initialInvestment: 1000,
      lookbackYears: 3,
      endYear: 2023,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.metrics.finalValue).toBeCloseTo(1100, 8);
    expect(result.metrics.totalReturn).toBeCloseTo(0.1, 8);
    expect(result.metrics.cagr).toBeCloseTo(Math.pow(1.1, 1 / 3) - 1, 8);
    expect(result.metrics.maxDrawdown).toBeCloseTo(-0.2, 8);
    expect(result.metrics.annualizedVolatility).toBeCloseTo(0.22912878, 6);
    expect(result.metrics.bestYear.year).toBe(2023);
    expect(result.metrics.bestYear.return).toBeCloseTo(0.25, 8);
    expect(result.metrics.worstYear.year).toBe(2022);
    expect(result.metrics.worstYear.return).toBeCloseTo(-0.2, 8);
    expect(result.assumptionsUsed).toBe(false);
  });

  it('normalizes weights and uses fallback assumptions when yearly market data is missing', () => {
    const assets: BacktestAssetInput[] = [
      {
        id: 'asset-1',
        name: 'Asset 1',
        ticker: 'AAA',
        assetClass: 'STOCKS',
        weight: 60,
        annualReturnsByYear: {
          2023: 0.1,
        },
      },
      {
        id: 'asset-2',
        name: 'Asset 2',
        assetClass: 'BONDS',
        weight: 60,
      },
    ];

    const result = runPortfolioBacktest({
      assets,
      initialInvestment: 10000,
      lookbackYears: 2,
      endYear: 2023,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }

    expect(result.years).toHaveLength(2);
    expect(result.years[0].marketWeight).toBeCloseTo(0, 8);
    expect(result.years[1].marketWeight).toBeCloseTo(0.5, 8);
    expect(result.years[1].assumptionWeight).toBeCloseTo(0.5, 8);
    expect(result.assumptionsUsed).toBe(true);

    const firstCoverage = result.coverage.find(item => item.assetId === 'asset-1');
    const secondCoverage = result.coverage.find(item => item.assetId === 'asset-2');
    expect(firstCoverage?.marketYears).toBe(1);
    expect(firstCoverage?.assumptionYears).toBe(1);
    expect(secondCoverage?.marketYears).toBe(0);
    expect(secondCoverage?.assumptionYears).toBe(2);
  });

  it('returns an error for invalid initial investment', () => {
    const result = runPortfolioBacktest({
      assets: [
        {
          id: 'asset-1',
          name: 'Asset 1',
          assetClass: 'STOCKS',
          weight: 1,
        },
      ],
      initialInvestment: 0,
      lookbackYears: 10,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Initial investment');
    }
  });
});
