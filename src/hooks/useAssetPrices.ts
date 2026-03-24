/**
 * useAssetPrices Hook
 * 
 * Fetches current prices from Yahoo Finance for all assets with tickers.
 * Updates asset pricePerShare and currentValue based on live prices.
 */

import { useState, useCallback } from 'react';
import { Asset } from '../types/assetAllocation';
import { fetchAssetPrices } from '../utils/dcaCalculator';

export interface PriceRefreshResult {
  updatedCount: number;
  failedTickers: string[];
  timestamp: string;
}

export interface UseAssetPricesReturn {
  refreshPrices: (assets: Asset[]) => Promise<{ updatedAssets: Asset[]; result: PriceRefreshResult }>;
  isLoading: boolean;
  lastRefresh: PriceRefreshResult | null;
  error: string | null;
}

/**
 * Hook to fetch and apply live asset prices from Yahoo Finance.
 * Returns updated assets with refreshed pricePerShare and currentValue.
 */
export function useAssetPrices(): UseAssetPricesReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<PriceRefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPrices = useCallback(async (assets: Asset[]) => {
    setIsLoading(true);
    setError(null);

    // Collect unique tickers from assets that have them
    const tickerAssets = assets.filter(a => a.ticker && a.ticker.trim().length > 0);
    const uniqueTickers = [...new Set(tickerAssets.map(a => a.ticker.trim().toUpperCase()))];

    if (uniqueTickers.length === 0) {
      const result: PriceRefreshResult = {
        updatedCount: 0,
        failedTickers: [],
        timestamp: new Date().toISOString(),
      };
      setLastRefresh(result);
      setIsLoading(false);
      return { updatedAssets: assets, result };
    }

    try {
      const prices = await fetchAssetPrices(uniqueTickers);

      const failedTickers: string[] = [];
      let updatedCount = 0;

      const updatedAssets = assets.map(asset => {
        if (!asset.ticker || asset.ticker.trim().length === 0) {
          return asset;
        }

        const ticker = asset.ticker.trim().toUpperCase();
        const newPrice = prices[ticker];

        if (newPrice === null || newPrice === undefined) {
          failedTickers.push(ticker);
          return asset;
        }

        // Update marketPrice and recalculate currentValue if shares are tracked
        // Preserve acquisitionPrice — if not set, default to the original pricePerShare
        const shares = asset.shares ?? 1;
        const newValue = shares * newPrice;

        updatedCount++;
        return {
          ...asset,
          marketPrice: newPrice,
          currentValue: newValue,
          acquisitionPrice: asset.acquisitionPrice ?? asset.pricePerShare,
        };
      });

      const result: PriceRefreshResult = {
        updatedCount,
        failedTickers: [...new Set(failedTickers)],
        timestamp: new Date().toISOString(),
      };

      setLastRefresh(result);
      setIsLoading(false);
      return { updatedAssets, result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch prices';
      setError(errorMsg);
      setIsLoading(false);

      const result: PriceRefreshResult = {
        updatedCount: 0,
        failedTickers: uniqueTickers,
        timestamp: new Date().toISOString(),
      };
      setLastRefresh(result);
      return { updatedAssets: assets, result };
    }
  }, []);

  return { refreshPrices, isLoading, lastRefresh, error };
}
