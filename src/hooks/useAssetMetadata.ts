/**
 * useAssetMetadata Hook
 *
 * Fetches Yahoo Finance metadata for all unique tickers in a list of assets,
 * caching results across renders. Returns the metadata map plus loading state.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Asset } from '../types/assetAllocation';
import { AssetMetadata } from '../types/portfolioBreakdown';
import { fetchAssetMetadataBatch } from '../utils/yahooMetadata';
import { uniqueTickers } from '../utils/portfolioBreakdownCalculator';

export interface MetadataRefreshResult {
  fetchedCount: number;
  failedTickers: string[];
  timestamp: string;
}

export interface UseAssetMetadataReturn {
  metadata: Record<string, AssetMetadata>;
  isLoading: boolean;
  lastRefresh: MetadataRefreshResult | null;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads metadata for all ticker-bearing assets on mount and exposes a
 * `refresh()` action for manual re-fetch.
 */
export function useAssetMetadata(assets: Asset[]): UseAssetMetadataReturn {
  const [metadata, setMetadata] = useState<Record<string, AssetMetadata>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<MetadataRefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const fetchFor = useCallback(async (currentAssets: Asset[]) => {
    const tickers = uniqueTickers(currentAssets);
    if (tickers.length === 0) {
      setMetadata({});
      setLastRefresh({
        fetchedCount: 0,
        failedTickers: [],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build ticker → ISIN map so the fetcher can derive country for stocks
      const isinByTicker: Record<string, string | undefined> = {};
      for (const a of currentAssets) {
        if (a.ticker && a.isin) {
          isinByTicker[a.ticker.trim().toUpperCase()] = a.isin;
        }
      }

      const result = await fetchAssetMetadataBatch(tickers, isinByTicker);
      const failed: string[] = [];
      let fetched = 0;
      for (const [t, meta] of Object.entries(result)) {
        if (meta.error) {
          failed.push(t);
        } else {
          fetched++;
        }
      }
      setMetadata(result);
      setLastRefresh({
        fetchedCount: fetched,
        failedTickers: failed,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch metadata';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchFor(assetsRef.current);
  }, [fetchFor]);

  // Initial fetch
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchFor(assets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { metadata, isLoading, lastRefresh, error, refresh };
}
