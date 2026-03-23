/**
 * Price API Service
 * 
 * Fetches monthly closing prices of assets using Yahoo Finance.
 * Includes rate limiting and in-memory caching.
 * 
 * Yahoo Finance is used as the sole data source — free, no API key required.
 */

import {
  PriceFetchResult,
  PriceCacheEntry,
  RateLimitInfo,
  YAHOO_DAILY_LIMIT,
} from '../types/priceApi';

// --- Cache Configuration ---

/** Cache duration in milliseconds (1 hour for current prices, 24h for monthly) */
const CURRENT_PRICE_CACHE_MS = 60 * 60 * 1000; // 1 hour
const MONTHLY_PRICE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** In-memory cache for price data */
const priceCache = new Map<string, PriceCacheEntry>();

/** Rate limit tracking */
let rateLimitInfo: RateLimitInfo | null = null;

// --- Rate Limiting ---

/**
 * Get or initialize rate limit info
 */
function getRateLimitInfo(): RateLimitInfo {
  const today = new Date().toISOString().split('T')[0];

  if (rateLimitInfo && rateLimitInfo.resetDate === today) {
    return rateLimitInfo;
  }

  // Reset for new day
  rateLimitInfo = {
    requestsToday: 0,
    dailyLimit: YAHOO_DAILY_LIMIT,
    lastRequestAt: null,
    resetDate: today,
  };
  return rateLimitInfo;
}

/**
 * Check if Yahoo Finance has remaining rate limit capacity
 */
export function hasRateLimitCapacity(): boolean {
  const info = getRateLimitInfo();
  return info.requestsToday < info.dailyLimit;
}

/**
 * Record a request against the rate limit
 */
function recordRequest(): void {
  const info = getRateLimitInfo();
  info.requestsToday++;
  info.lastRequestAt = new Date().toISOString();
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): RateLimitInfo {
  return getRateLimitInfo();
}

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

/** Yahoo Finance chart API endpoint for historical data */
const YAHOO_CHART_API_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

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

    const url = `${YAHOO_CHART_API_URL}/${encodeURIComponent(ticker)}?interval=1mo&period1=${startDate}&period2=${endDate}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    recordRequest();

    if (!response.ok) {
      result.error = `Yahoo Finance API error: ${response.status} ${response.statusText}`;
      return result;
    }

    const data = await response.json();
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
    result.error = `Yahoo Finance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
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
