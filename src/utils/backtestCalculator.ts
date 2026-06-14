import {
  AnnualReturnsByYear,
  BacktestAssetInput,
  BacktestAssetCoverage,
  BacktestAssumptionProfiles,
  BacktestYearPoint,
  PortfolioBacktestRequest,
  PortfolioBacktestResult,
} from '../types/backtest';
import { MonthlyClosingPrice } from '../types/priceApi';
import { AssetClass } from '../types/assetAllocation';

/**
 * Assumptions source:
 * - Long-run broad market ranges inspired by public annual return studies
 *   (Damodaran historical asset class estimates, Credit Suisse Yearbook, and
 *   broad ETF history behavior).
 * - Values are intentionally conservative and easy to update in one place.
 */
export const BACKTEST_ASSUMPTION_SOURCE =
  'Long-run historical ranges (Damodaran/Credit Suisse-style assumptions), deterministic fallback.';

export const BACKTEST_ASSUMPTION_PROFILES: BacktestAssumptionProfiles = {
  STOCKS: { expectedAnnualReturn: 0.09, annualVolatility: 0.16 },
  BONDS: { expectedAnnualReturn: 0.04, annualVolatility: 0.06 },
  CASH: { expectedAnnualReturn: 0.015, annualVolatility: 0.01 },
  CRYPTO: { expectedAnnualReturn: 0.2, annualVolatility: 0.55 },
  REAL_ESTATE: { expectedAnnualReturn: 0.07, annualVolatility: 0.14 },
  COMMODITIES: { expectedAnnualReturn: 0.045, annualVolatility: 0.18 },
  VEHICLE: { expectedAnnualReturn: -0.1, annualVolatility: 0.08 },
  COLLECTIBLE: { expectedAnnualReturn: 0.05, annualVolatility: 0.2 },
  ART: { expectedAnnualReturn: 0.06, annualVolatility: 0.18 },
};

const DETERMINISTIC_SHOCK_SEQUENCE = [
  -1.6, -0.9, -0.2, 0.3, 1.1, -0.4, 0.6, -1.2, 1.8, 0.2,
  -0.7, 0.9, 0.4, -1.0, 1.3, -0.3, 0.7, -0.5, 1.5, -1.4,
];

const ASSET_CLASS_PHASE_OFFSET: Record<AssetClass, number> = {
  STOCKS: 0,
  BONDS: 3,
  CASH: 5,
  CRYPTO: 7,
  REAL_ESTATE: 11,
  COMMODITIES: 13,
  VEHICLE: 17,
  COLLECTIBLE: 19,
  ART: 23,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getFallbackAnnualReturn(assetClass: AssetClass, year: number): number {
  const profile = BACKTEST_ASSUMPTION_PROFILES[assetClass];
  const offset = ASSET_CLASS_PHASE_OFFSET[assetClass];
  const idx =
    ((year + offset) % DETERMINISTIC_SHOCK_SEQUENCE.length + DETERMINISTIC_SHOCK_SEQUENCE.length) %
    DETERMINISTIC_SHOCK_SEQUENCE.length;
  const shock = DETERMINISTIC_SHOCK_SEQUENCE[idx];
  return clamp(
    profile.expectedAnnualReturn + profile.annualVolatility * shock,
    -0.95,
    3,
  );
}

function toAnnualReturn(currentValue: number, previousValue: number): number | null {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue <= 0) {
    return null;
  }
  return currentValue / previousValue - 1;
}

function sortByDateAsc(prices: MonthlyClosingPrice[]): MonthlyClosingPrice[] {
  return [...prices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function deriveAnnualReturnsFromMonthlyPrices(prices: MonthlyClosingPrice[]): AnnualReturnsByYear {
  const sortedPrices = sortByDateAsc(
    prices.filter(price => Number.isFinite(price.close) && Number.isFinite(new Date(price.date).getTime())),
  );
  const yearEndClose = new Map<number, number>();

  for (const price of sortedPrices) {
    const year = new Date(price.date).getFullYear();
    yearEndClose.set(year, price.close);
  }

  const years = [...yearEndClose.keys()].sort((a, b) => a - b);
  const annualReturns: AnnualReturnsByYear = {};

  for (let i = 1; i < years.length; i++) {
    const previousClose = yearEndClose.get(years[i - 1]);
    const currentClose = yearEndClose.get(years[i]);
    if (previousClose === undefined || currentClose === undefined) {
      continue;
    }
    const yearlyReturn = toAnnualReturn(currentClose, previousClose);
    if (yearlyReturn === null) {
      continue;
    }
    annualReturns[years[i]] = yearlyReturn;
  }

  return annualReturns;
}

function sampleStd(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function normalizeAssets(assets: BacktestAssetInput[]): BacktestAssetInput[] {
  const positiveWeightAssets = assets.filter(asset => Number.isFinite(asset.weight) && asset.weight > 0);
  const totalWeight = positiveWeightAssets.reduce((sum, asset) => sum + asset.weight, 0);
  if (totalWeight <= 0) {
    return [];
  }
  return positiveWeightAssets.map(asset => ({
    ...asset,
    weight: asset.weight / totalWeight,
  }));
}

function validateRequest(request: PortfolioBacktestRequest): string | null {
  if (!Number.isFinite(request.initialInvestment) || request.initialInvestment <= 0) {
    return 'Initial investment must be greater than 0.';
  }
  if (!Number.isInteger(request.lookbackYears) || request.lookbackYears < 1 || request.lookbackYears > 50) {
    return 'Lookback years must be an integer between 1 and 50.';
  }
  if (!request.assets || request.assets.length === 0) {
    return 'At least one asset is required for backtesting.';
  }
  return null;
}

function createCoverageMap(assets: BacktestAssetInput[]): Map<string, BacktestAssetCoverage> {
  const coverageMap = new Map<string, BacktestAssetCoverage>();
  for (const asset of assets) {
    coverageMap.set(asset.id, {
      assetId: asset.id,
      assetName: asset.name,
      ticker: asset.ticker,
      marketYears: 0,
      assumptionYears: 0,
    });
  }
  return coverageMap;
}

export function runPortfolioBacktest(request: PortfolioBacktestRequest): PortfolioBacktestResult {
  const validationError = validateRequest(request);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const normalizedAssets = normalizeAssets(request.assets);
  if (normalizedAssets.length === 0) {
    return { ok: false, error: 'No assets with positive weights were provided.' };
  }

  const endYear = request.endYear ?? new Date().getFullYear() - 1;
  const startYear = endYear - request.lookbackYears + 1;
  if (startYear > endYear) {
    return { ok: false, error: 'Invalid backtest year range.' };
  }

  const coverageMap = createCoverageMap(normalizedAssets);
  const years: BacktestYearPoint[] = [];
  let portfolioValue = request.initialInvestment;
  let peakValue = request.initialInvestment;

  for (let year = startYear; year <= endYear; year++) {
    let annualReturn = 0;
    let marketWeight = 0;
    let assumptionWeight = 0;

    for (const asset of normalizedAssets) {
      const marketReturn = asset.annualReturnsByYear?.[year];
      const hasMarketReturn = typeof marketReturn === 'number' && Number.isFinite(marketReturn);
      const assetReturn = hasMarketReturn
        ? marketReturn
        : getFallbackAnnualReturn(asset.assetClass, year);

      annualReturn += asset.weight * assetReturn;
      const coverage = coverageMap.get(asset.id);
      if (!coverage) {
        continue;
      }

      if (hasMarketReturn) {
        marketWeight += asset.weight;
        coverage.marketYears += 1;
      } else {
        assumptionWeight += asset.weight;
        coverage.assumptionYears += 1;
      }
    }

    portfolioValue *= 1 + annualReturn;
    if (!Number.isFinite(portfolioValue)) {
      return { ok: false, error: 'Backtest produced non-finite portfolio values.' };
    }

    peakValue = Math.max(peakValue, portfolioValue);
    const drawdown = peakValue > 0 ? (portfolioValue - peakValue) / peakValue : 0;

    years.push({
      year,
      annualReturn,
      portfolioValue,
      drawdown,
      marketWeight,
      assumptionWeight,
    });
  }

  if (years.length === 0) {
    return { ok: false, error: 'No yearly backtest data could be generated.' };
  }

  const annualReturns = years.map(point => point.annualReturn);
  const totalReturn = request.initialInvestment > 0 ? portfolioValue / request.initialInvestment - 1 : 0;
  const cagr = Math.pow(portfolioValue / request.initialInvestment, 1 / years.length) - 1;
  const annualizedVolatility = sampleStd(annualReturns);
  const maxDrawdown = years.reduce((minValue, point) => Math.min(minValue, point.drawdown), 0);
  const bestPoint = years.reduce((best, point) =>
    point.annualReturn > best.annualReturn ? point : best,
  );
  const worstPoint = years.reduce((worst, point) =>
    point.annualReturn < worst.annualReturn ? point : worst,
  );

  const coverage = [...coverageMap.values()];
  const assumptionsUsed = coverage.some(item => item.assumptionYears > 0);

  return {
    ok: true,
    years,
    metrics: {
      cagr,
      totalReturn,
      annualizedVolatility,
      maxDrawdown,
      bestYear: {
        year: bestPoint.year,
        return: bestPoint.annualReturn,
      },
      worstYear: {
        year: worstPoint.year,
        return: worstPoint.annualReturn,
      },
      finalValue: portfolioValue,
    },
    coverage,
    assumptionsUsed,
    assumptionSource: BACKTEST_ASSUMPTION_SOURCE,
  };
}
