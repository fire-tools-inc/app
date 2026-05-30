/**
 * DCA (Dollar Cost Averaging) Calculator
 * 
 * This module provides functionality to calculate how to invest a lump sum
 * according to the user's asset allocation targets.
 */

import { Asset, AssetClass } from '../types/assetAllocation';
import { yahooFetch } from './yahooProxy';
import { logger } from './logger';

export interface DCAAssetAllocation {
  assetId: string;
  assetName: string;
  ticker: string;
  assetClass: AssetClass;
  allocationPercent: number; // Percentage within the asset's class
  investmentAmount: number; // Dollar amount to invest in this asset
  currentPrice?: number; // Current price per share from API
  shares?: number; // Number of shares to buy (fractional supported)
  priceError?: string; // Error message if price fetch failed
}

export interface DCACalculation {
  totalAmount: number;
  allocations: DCAAssetAllocation[];
  totalAllocated: number; // Should equal totalAmount
  timestamp: Date;
}

/**
 * Calculate DCA allocation based on asset allocation percentages.
 * This distributes the investment amount according to the target allocation.
 * 
 * @param assets - Array of assets with allocation information
 * @param investmentAmount - Total amount to invest
 * @param assetClassTargets - Class-level target configurations
 * @returns DCA calculation result with per-asset breakdown
 */
export function calculateDCAAllocation(
  assets: Asset[],
  investmentAmount: number,
  assetClassTargets: Record<AssetClass, { targetMode: string; targetPercent?: number }>
): DCACalculation {
  const allocations: DCAAssetAllocation[] = [];
  
  // Filter out assets that are OFF or in SET mode (not part of percentage allocation)
  const percentageAssets = assets.filter(a => a.targetMode === 'PERCENTAGE');
  
  // Group assets by class
  const assetsByClass = new Map<AssetClass, Asset[]>();
  percentageAssets.forEach(asset => {
    if (!assetsByClass.has(asset.assetClass)) {
      assetsByClass.set(asset.assetClass, []);
    }
    assetsByClass.get(asset.assetClass)!.push(asset);
  });
  
  // Calculate investment amount per class based on class targets
  assetsByClass.forEach((classAssets, assetClass) => {
    const classTarget = assetClassTargets[assetClass];
    
    // Only process percentage-based classes
    if (classTarget?.targetMode !== 'PERCENTAGE' || !classTarget.targetPercent) {
      return;
    }
    
    // Calculate how much to invest in this class
    const classInvestmentAmount = (classTarget.targetPercent / 100) * investmentAmount;
    
    // Calculate total percentage within this class
    const classTotalPercent = classAssets.reduce((sum, a) => sum + (a.targetPercent || 0), 0);
    
    // Distribute class investment to individual assets based on their target percentage within the class
    classAssets.forEach(asset => {
      const assetPercent = asset.targetPercent || 0;
      
      // Asset's share of the class investment
      const assetInvestmentAmount = classTotalPercent > 0 
        ? (assetPercent / classTotalPercent) * classInvestmentAmount
        : 0;
      
      allocations.push({
        assetId: asset.id,
        assetName: asset.name,
        ticker: asset.ticker,
        assetClass: asset.assetClass,
        allocationPercent: assetPercent,
        investmentAmount: assetInvestmentAmount,
      });
    });
  });
  
  const totalAllocated = allocations.reduce((sum, a) => sum + a.investmentAmount, 0);
  
  return {
    totalAmount: investmentAmount,
    allocations,
    totalAllocated,
    timestamp: new Date(),
  };
}

/**
 * Fetch current asset prices from public API.
 * 
 * For this implementation, we use Yahoo Finance API.
 * Alternative APIs: Alpha Vantage, Finnhub, IEX Cloud
 * 
 * API Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{ticker}
 * 
 * Note: This uses a free public API. For production use, consider:
 * - Rate limiting
 * - Caching prices (they don't change every second)
 * - Fallback to alternative APIs
 * - User-provided prices as fallback
 */

export async function fetchAssetPrices(tickers: string[]): Promise<Record<string, number | null>> {
  const prices: Record<string, number | null> = {};
  
  // Initialize all tickers with null (failed to fetch)
  tickers.forEach(ticker => {
    prices[ticker] = null;
  });
  
  // Skip empty tickers
  const validTickers = tickers.filter(t => t && t.trim().length > 0);
  
  if (validTickers.length === 0) {
    return prices;
  }
  
  // Fetch each ticker via v8 chart endpoint (v7 quote endpoint is rate-limited)
  for (const ticker of validTickers) {
    try {
      const data = await yahooFetch<any>(
        `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      );
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;

      if (typeof price === 'number' && price > 0) {
        prices[ticker] = price;
      }
    } catch (error) {
      logger.error('dca', 'price-fetch-failed', 'failed to fetch price for asset', {
        pii: { ticker, error: (error as Error)?.message },
      });
    }
  }
  
  return prices;
}

/**
 * Calculate number of shares for each asset based on current prices.
 * 
 * @param calculation - DCA calculation with allocations
 * @param prices - Map of ticker to current price
 * @returns Updated DCA calculation with share counts
 */
export function calculateShares(
  calculation: DCACalculation,
  prices: Record<string, number | null>
): DCACalculation {
  const updatedAllocations = calculation.allocations.map(allocation => {
    const price = prices[allocation.ticker];
    
    if (price === null || price === undefined) {
      return {
        ...allocation,
        priceError: 'Price unavailable',
      };
    }
    
    if (price <= 0) {
      return {
        ...allocation,
        priceError: 'Invalid price',
      };
    }
    
    // Calculate shares (fractional supported)
    const shares = allocation.investmentAmount / price;
    
    return {
      ...allocation,
      currentPrice: price,
      shares,
    };
  });
  
  return {
    ...calculation,
    allocations: updatedAllocations,
  };
}

/**
 * Format share count for display (up to 6 decimal places for fractional shares).
 */
export function formatShares(shares: number): string {
  // Show up to 6 decimal places, but remove trailing zeros
  return shares.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Format currency for display using Intl.NumberFormat.
 */
export function formatDCACurrency(amount: number, currency: string = 'EUR'): string {
  // Map currency codes to symbols for backward compatibility
  const currencySymbols: Record<string, string> = {
    'EUR': '€',
    'USD': '$',
    'GBP': '£',
    'JPY': '¥',
  };
  
  const symbol = currencySymbols[currency] || currency;
  
  // Use Intl.NumberFormat for proper locale formatting
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  
  return `${symbol}${formatted}`;
}

/**
 * Investment Deviation Types
 */
export type InvestmentDeviationStatus = 'exact' | 'over' | 'under' | 'unknown';

export interface InvestmentDeviationInput {
  suggestedShares: number;
  actualShares?: number;
  actualAmount?: number;
  suggestedAmount: number;
  currentPrice?: number;
}

export interface InvestmentDeviationResult {
  actualAmount?: number;
  deviationAmount?: number;
  deviationPercent?: number;
  status: InvestmentDeviationStatus;
}

export interface ConfirmedDCAAssetAllocation extends DCAAssetAllocation {
  actualShares?: number;
  actualAmount?: number;
  isConfirmed?: boolean;
  deviation?: InvestmentDeviationResult;
}

// Threshold for considering a deviation as "exact" (0.01% = essentially zero)
const EXACT_DEVIATION_THRESHOLD = 0.01;

/**
 * Calculate the deviation between actual and suggested investment.
 * Supports two input modes:
 * 1. Shares-based: Provide actualShares and currentPrice to calculate actualAmount
 * 2. Amount-based: Provide actualAmount directly (useful when price is unavailable)
 * 
 * @param input - The input containing suggested and actual values
 * @returns The deviation result with amount, percentage, and status
 */
export function calculateInvestmentDeviation(
  input: InvestmentDeviationInput
): InvestmentDeviationResult {
  const { actualShares, actualAmount: providedActualAmount, suggestedAmount, currentPrice } = input;
  
  // Determine actual amount - either from shares*price or directly provided
  let actualAmount: number | undefined;
  
  if (providedActualAmount !== undefined) {
    // Amount was directly provided (amount-based input)
    actualAmount = providedActualAmount;
  } else if (actualShares !== undefined && currentPrice !== undefined) {
    // Calculate from shares and price (shares-based input)
    actualAmount = actualShares * currentPrice;
  } else if (actualShares !== undefined && currentPrice === undefined) {
    // Shares provided but no price - can't calculate deviation
    return {
      status: 'unknown',
    };
  } else {
    // No valid input
    return {
      status: 'unknown',
    };
  }
  
  // Calculate deviation
  const deviationAmount = actualAmount - suggestedAmount;
  
  // Calculate percentage deviation
  let deviationPercent: number;
  if (suggestedAmount === 0) {
    // If nothing was suggested but something was bought, it's a 100% deviation
    deviationPercent = actualAmount > 0 ? 100 : 0;
  } else {
    deviationPercent = (deviationAmount / suggestedAmount) * 100;
  }
  
  // Determine status
  let status: InvestmentDeviationStatus;
  if (Math.abs(deviationPercent) < EXACT_DEVIATION_THRESHOLD) {
    status = 'exact';
  } else if (deviationPercent > 0) {
    status = 'over';
  } else {
    status = 'under';
  }
  
  return {
    actualAmount,
    deviationAmount,
    deviationPercent,
    status,
  };
}

/**
 * Format deviation percentage for display.
 * 
 * @param deviation - The deviation percentage
 * @returns Formatted string with sign and percentage
 */
export function formatDeviation(deviation: number | undefined): string {
  if (deviation === undefined) {
    return 'N/A';
  }
  
  const formatted = Math.abs(deviation).toFixed(2);
  
  if (deviation === 0) {
    return `${formatted}%`;
  } else if (deviation > 0) {
    return `+${formatted}%`;
  } else {
    return `-${formatted}%`;
  }
}

/**
 * Confirm an investment by adding actual shares bought or amount spent.
 * Supports two input modes:
 * 1. Shares-based: Provide actualShares (requires price for deviation calculation)
 * 2. Amount-based: Provide actualAmount (works without price)
 * 
 * @param allocation - The DCA asset allocation
 * @param actualShares - The actual number of shares bought (optional)
 * @param actualAmount - The actual amount spent (optional, used when price unavailable)
 * @returns The confirmed allocation with deviation calculation
 */
export function confirmInvestment(
  allocation: DCAAssetAllocation,
  actualShares?: number,
  actualAmount?: number
): ConfirmedDCAAssetAllocation {
  const deviation = calculateInvestmentDeviation({
    suggestedShares: allocation.shares || 0,
    actualShares,
    actualAmount,
    suggestedAmount: allocation.investmentAmount,
    currentPrice: allocation.currentPrice,
  });
  
  return {
    ...allocation,
    actualShares,
    actualAmount: actualAmount ?? deviation.actualAmount,
    isConfirmed: true,
    deviation,
  };
}
