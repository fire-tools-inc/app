/**
 * Price API Service
 * 
 * Fetches monthly closing prices of assets using Yahoo Finance.
 * Includes in-memory caching. Rate limiting is handled centrally by yahooProxy.
 * 
 * Yahoo Finance is used as the sole data source — free, no API key required.
 */

import {
  PriceFetchResult,
  PriceCacheEntry,
} from '../types/priceApi';
import { yahooFetch, hasRateLimitCapacity, YahooRateLimitError } from './yahooProxy';

// --- Cache Configuration ---

/** Cache duration in milliseconds (1 hour for current prices, 24h for monthly) */
const CURRENT_PRICE_CACHE_MS = 60 * 60 * 1000; // 1 hour
const MONTHLY_PRICE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** In-memory cache for price data */
const priceCache = new Map<string, PriceCacheEntry>();

// --- Cache Management ---

/**
 * Generate cache key for a ticker
 */
function getCacheKey(ticker: string, type: 'current' | 'monthly'): string {
  return `${type}:${ticker.toUpperCase()}`;
}

/**
 * Get cached price data if available and not expired
 */
function getCachedPrice(ticker: string, type: 'current' | 'monthly'): PriceFetchResult | null {
  const key = getCacheKey(ticker, type);
  const entry = priceCache.get(key);

  if (!entry) return null;

  const now = new Date().getTime();
  const expiresAt = new Date(entry.expiresAt).getTime();

  if (now >= expiresAt) {
    priceCache.delete(key);
    return null;
  }

  return entry.result;
}

/**
 * Store price data in cache
 */
function setCachedPrice(ticker: string, type: 'current' | 'monthly', result: PriceFetchResult): void {
  const key = getCacheKey(ticker, type);
  const cacheDuration = type === 'current' ? CURRENT_PRICE_CACHE_MS : MONTHLY_PRICE_CACHE_MS;
  const expiresAt = new Date(Date.now() + cacheDuration).toISOString();

  priceCache.set(key, { result, expiresAt });
}

/**
 * Clear all cached price data
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

// --- Yahoo Finance ---

/**
 * Fetch monthly closing prices for a ticker from Yahoo Finance.
 * Uses the chart API with monthly interval.
 * 
 * @param ticker - Stock/ETF ticker symbol (e.g., "MSFT", "VTI")
 * @param months - Number of months of history to fetch (default: 12)
 * @returns Price fetch result
 */
export async function fetchMonthlyClosingPrices(
  ticker: string,
  months: number = 12
): Promise<PriceFetchResult> {
  // Check cache first
  const cached = getCachedPrice(ticker, 'monthly');
  if (cached) return cached;

  const result: PriceFetchResult = {
    ticker,
    prices: [],
    fetchedAt: new Date().toISOString(),
  };

  if (!hasRateLimitCapacity()) {
    result.error = 'Yahoo Finance daily rate limit reached';
    return result;
  }

  try {
    // Calculate date range: go back `months` months from now
    const endDate = Math.floor(Date.now() / 1000);
    const startDateObj = new Date();
    startDateObj.setMonth(startDateObj.getMonth() - months);
    const startDate = Math.floor(startDateObj.getTime() / 1000);

    const data = await yahooFetch<any>(
      `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&period1=${startDate}&period2=${endDate}`,
    );
    const chartResult = data?.chart?.result?.[0];

    if (!chartResult) {
      result.error = 'No data returned from Yahoo Finance';
      return result;
    }

    const timestamps: number[] = chartResult.timestamp || [];
    const quotes = chartResult.indicators?.quote?.[0];

    if (!quotes) {
      result.error = 'No quote data in Yahoo Finance response';
      return result;
    }

    // Parse monthly data points
    for (let i = 0; i < timestamps.length; i++) {
      const date = new Date(timestamps[i] * 1000);
      const close = quotes.close?.[i];
      const open = quotes.open?.[i];
      const high = quotes.high?.[i];
      const low = quotes.low?.[i];
      const volume = quotes.volume?.[i];

      // Skip entries with missing close price
      if (close == null || isNaN(close)) continue;

      result.prices.push({
        ticker,
        date: date.toISOString().split('T')[0],
        open: open ?? close,
        high: high ?? close,
        low: low ?? close,
        close,
        volume: volume ?? undefined,
      });
    }

    // Cache successful results
    if (result.prices.length > 0) {
      setCachedPrice(ticker, 'monthly', result);
    }
  } catch (error) {
    if (error instanceof YahooRateLimitError) {
      result.error = error.message;
    } else {
      result.error = `Yahoo Finance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return result;
}

/**
 * Fetch monthly closing prices for multiple tickers.
 * Processes sequentially to respect rate limits.
 * 
 * @param tickers - Array of ticker symbols
 * @param months - Number of months of history (default: 12)
 * @returns Map of ticker to price fetch result
 */
export async function fetchMultipleMonthlyPrices(
  tickers: string[],
  months: number = 12
): Promise<Record<string, PriceFetchResult>> {
  const results: Record<string, PriceFetchResult> = {};

  // Deduplicate and filter empty tickers
  const uniqueTickers = [...new Set(
    tickers.filter(t => t && t.trim().length > 0).map(t => t.trim().toUpperCase())
  )];

  for (const ticker of uniqueTickers) {
    results[ticker] = await fetchMonthlyClosingPrices(ticker, months);
  }

  return results;
}

/**
 * Get the latest closing price for a ticker (most recent monthly data point).
 * Useful for getting an approximate current price from monthly data.
 * 
 * @param ticker - Stock/ETF ticker symbol
 * @returns The latest closing price or null if unavailable
 */
export async function getLatestClosingPrice(
  ticker: string
): Promise<{ price: number; date: string } | null> {
  const result = await fetchMonthlyClosingPrices(ticker, 1);

  if (result.prices.length === 0) return null;

  const latest = result.prices[result.prices.length - 1];
  return {
    price: latest.close,
    date: latest.date,
  };
}

/**
 * Get a user-friendly message about data freshness
 */
export function getDataFreshnessMessage(result: PriceFetchResult): string {
  if (result.error) {
    return `Failed to fetch price data: ${result.error}`;
  }

  if (result.prices.length === 0) {
    return 'No price data available';
  }

  const latest = result.prices[result.prices.length - 1];
  return `Last data from ${latest.date} via Yahoo Finance`;
}

/**
 * Fetch the closing price for a specific month's last trading day.
 * For past months, returns the closing price from the last trading day of that month.
 * For the current month, returns the most recent closing price available.
 *
 * @param ticker - Stock/ETF ticker symbol
 * @param year - Target year
 * @param month - Target month (1-12)
 * @returns The closing price and date, or null if unavailable
 */
export async function fetchClosingPriceForMonth(
  ticker: string,
  year: number,
  month: number
): Promise<{ price: number; date: string } | null> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Calculate how many months back we need to look
  const monthsBack = (currentYear - year) * 12 + (currentMonth - month) + 1;

  // Fetch enough monthly data to cover the target month
  const result = await fetchMonthlyClosingPrices(ticker, Math.max(monthsBack + 1, 2));

  if (result.prices.length === 0) return null;

  // Find the price entry whose date falls within the target month
  // Yahoo Finance monthly data gives the closing price for each month
  const targetPrice = result.prices.find(p => {
    const d = new Date(p.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

  if (targetPrice) {
    return { price: targetPrice.close, date: targetPrice.date };
  }

  // If exact month not found, find the closest earlier date
  const targetEnd = new Date(year, month, 0); // last day of target month
  let closest = null;
  for (const p of result.prices) {
    const d = new Date(p.date);
    if (d <= targetEnd) {
      closest = p;
    }
  }

  if (closest) {
    return { price: closest.close, date: closest.date };
  }

  return null;
}

/**
 * Fetch closing prices for multiple tickers for a specific month.
 * Returns a map of ticker → closing price.
 *
 * @param tickers - Array of ticker symbols
 * @param year - Target year
 * @param month - Target month (1-12)
 * @returns Map of ticker to { price, date } or null if unavailable
 */
export async function fetchMultipleClosingPricesForMonth(
  tickers: string[],
  year: number,
  month: number
): Promise<Record<string, { price: number; date: string } | null>> {
  const results: Record<string, { price: number; date: string } | null> = {};

  const uniqueTickers = [...new Set(
    tickers.filter(t => t && t.trim().length > 0).map(t => t.trim().toUpperCase())
  )];

  for (const ticker of uniqueTickers) {
    results[ticker] = await fetchClosingPriceForMonth(ticker, year, month);
  }

  return results;
}
