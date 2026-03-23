/**
 * Price API Service
 * 
 * Multi-provider API for fetching monthly closing prices of assets.
 * Supports Yahoo Finance, Alpha Vantage, and financialdata.net with
 * automatic fallback, rate limiting, and caching.
 * 
 * Provider priority (fallback chain):
 * 1. Yahoo Finance (free, no key required)
 * 2. financialdata.net (300 req/day, key required, 2-day delay)
 * 3. Alpha Vantage (20 req/day, key required)
 * 
 * Data is delayed 2 days for financialdata.net. To get the closing price
 * of the last trading day of the previous month, the call should be made
 * 2 days after the first trading day of the new month.
 */

import {
  PriceProvider,
  MonthlyClosingPrice,
  PriceFetchResult,
  PriceCacheEntry,
  RateLimitInfo,
  PROVIDER_DAILY_LIMITS,
  DEFAULT_PROVIDER_ORDER,
} from '../types/priceApi';
import { loadApiKeyConfig } from './apiKeyStorage';

// --- Cache Configuration ---

/** Cache duration in milliseconds (1 hour for current prices, 24h for monthly) */
const CURRENT_PRICE_CACHE_MS = 60 * 60 * 1000; // 1 hour
const MONTHLY_PRICE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

/** In-memory cache for price data */
const priceCache = new Map<string, PriceCacheEntry>();

/** Rate limit tracking per provider */
const rateLimits = new Map<string, RateLimitInfo>();

// --- Rate Limiting ---

/**
 * Get or initialize rate limit info for a provider
 */
function getRateLimitInfo(provider: PriceProvider): RateLimitInfo {
  const today = new Date().toISOString().split('T')[0];
  const existing = rateLimits.get(provider);

  if (existing && existing.resetDate === today) {
    return existing;
  }

  // Reset for new day
  const info: RateLimitInfo = {
    provider,
    requestsToday: 0,
    dailyLimit: PROVIDER_DAILY_LIMITS[provider],
    lastRequestAt: null,
    resetDate: today,
  };
  rateLimits.set(provider, info);
  return info;
}

/**
 * Check if a provider has remaining rate limit capacity
 */
export function hasRateLimitCapacity(provider: PriceProvider): boolean {
  const info = getRateLimitInfo(provider);
  return info.requestsToday < info.dailyLimit;
}

/**
 * Record a request against a provider's rate limit
 */
function recordRequest(provider: PriceProvider): void {
  const info = getRateLimitInfo(provider);
  info.requestsToday++;
  info.lastRequestAt = new Date().toISOString();
  rateLimits.set(provider, info);
}

/**
 * Get current rate limit status for all providers
 */
export function getRateLimitStatus(): RateLimitInfo[] {
  return DEFAULT_PROVIDER_ORDER.map(provider => getRateLimitInfo(provider));
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

// --- Yahoo Finance Provider ---

/** Yahoo Finance chart API endpoint for historical data */
const YAHOO_CHART_API_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetch monthly closing prices from Yahoo Finance
 * Uses the chart API with monthly interval
 */
async function fetchFromYahoo(
  ticker: string,
  months: number = 12
): Promise<PriceFetchResult> {
  const result: PriceFetchResult = {
    ticker,
    prices: [],
    provider: 'yahoo',
    fetchedAt: new Date().toISOString(),
    isDelayed: false,
  };

  if (!hasRateLimitCapacity('yahoo')) {
    result.error = 'Yahoo Finance daily rate limit reached';
    return result;
  }

  try {
    // Calculate date range: go back `months` months from now
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = Math.floor(
      new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).getTime() / 1000
    );

    const url = `${YAHOO_CHART_API_URL}/${encodeURIComponent(ticker)}?interval=1mo&period1=${startDate}&period2=${endDate}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    recordRequest('yahoo');

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
  } catch (error) {
    result.error = `Yahoo Finance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

// --- Alpha Vantage Provider ---

const ALPHA_VANTAGE_API_URL = 'https://www.alphavantage.co/query';

/**
 * Fetch monthly closing prices from Alpha Vantage
 * Uses TIME_SERIES_MONTHLY function
 */
async function fetchFromAlphaVantage(ticker: string): Promise<PriceFetchResult> {
  const result: PriceFetchResult = {
    ticker,
    prices: [],
    provider: 'alphavantage',
    fetchedAt: new Date().toISOString(),
    isDelayed: false,
  };

  if (!hasRateLimitCapacity('alphavantage')) {
    result.error = 'Alpha Vantage daily rate limit reached (20 requests/day)';
    return result;
  }

  const apiKeys = loadApiKeyConfig();
  if (!apiKeys.alphaVantageKey) {
    result.error = 'Alpha Vantage API key not configured';
    return result;
  }

  try {
    const url = `${ALPHA_VANTAGE_API_URL}?function=TIME_SERIES_MONTHLY&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKeys.alphaVantageKey)}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    recordRequest('alphavantage');

    if (!response.ok) {
      result.error = `Alpha Vantage API error: ${response.status} ${response.statusText}`;
      return result;
    }

    const data = await response.json();

    // Check for API error messages
    if (data['Error Message']) {
      result.error = `Alpha Vantage error: ${data['Error Message']}`;
      return result;
    }

    if (data['Note']) {
      result.error = `Alpha Vantage rate limit: ${data['Note']}`;
      return result;
    }

    const timeSeries = data['Monthly Time Series'];
    if (!timeSeries) {
      result.error = 'No monthly time series data from Alpha Vantage';
      return result;
    }

    // Parse monthly data (comes as { "YYYY-MM-DD": { "1. open": "...", ... } })
    for (const [dateStr, values] of Object.entries(timeSeries)) {
      const entry = values as Record<string, string>;
      const close = parseFloat(entry['4. close']);

      if (isNaN(close)) continue;

      result.prices.push({
        ticker,
        date: dateStr,
        open: parseFloat(entry['1. open']) || close,
        high: parseFloat(entry['2. high']) || close,
        low: parseFloat(entry['3. low']) || close,
        close,
        volume: parseFloat(entry['5. volume']) || undefined,
      });
    }

    // Sort by date ascending
    result.prices.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    result.error = `Alpha Vantage fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

// --- financialdata.net Provider ---

const FINANCIAL_DATA_API_URL = 'https://financialdata.net/api/v1/stock-prices';

/**
 * Fetch daily prices from financialdata.net and extract monthly closing prices.
 * Data is delayed by 2 days. To get the closing price for the last trading day
 * of the previous month, call 2 days after the first trading day of the new month.
 */
async function fetchFromFinancialData(ticker: string): Promise<PriceFetchResult> {
  const result: PriceFetchResult = {
    ticker,
    prices: [],
    provider: 'financialdata',
    fetchedAt: new Date().toISOString(),
    isDelayed: true, // financialdata.net has 2-day delay
  };

  if (!hasRateLimitCapacity('financialdata')) {
    result.error = 'financialdata.net daily rate limit reached (300 requests/day)';
    return result;
  }

  const apiKeys = loadApiKeyConfig();
  if (!apiKeys.financialDataKey) {
    result.error = 'financialdata.net API key not configured';
    return result;
  }

  try {
    const url = `${FINANCIAL_DATA_API_URL}?identifier=${encodeURIComponent(ticker)}&key=${encodeURIComponent(apiKeys.financialDataKey)}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    recordRequest('financialdata');

    if (!response.ok) {
      result.error = `financialdata.net API error: ${response.status} ${response.statusText}`;
      return result;
    }

    const data: Array<{
      trading_symbol: string;
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      result.error = 'No data returned from financialdata.net';
      return result;
    }

    // Group daily data by month and get the last trading day of each month
    const monthlyData = extractMonthlyClosingPrices(data, ticker);
    result.prices = monthlyData;
  } catch (error) {
    result.error = `financialdata.net fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

/**
 * Extract monthly closing prices from daily data.
 * For each month, takes the last trading day's closing price.
 */
export function extractMonthlyClosingPrices(
  dailyData: Array<{
    trading_symbol?: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>,
  ticker: string
): MonthlyClosingPrice[] {
  // Group by year-month
  const monthlyMap = new Map<string, typeof dailyData[0]>();

  for (const entry of dailyData) {
    const yearMonth = entry.date.substring(0, 7); // "YYYY-MM"
    const existing = monthlyMap.get(yearMonth);

    // Keep the latest date in each month (last trading day)
    if (!existing || entry.date > existing.date) {
      monthlyMap.set(yearMonth, entry);
    }
  }

  // Convert to MonthlyClosingPrice array, sorted by date
  return Array.from(monthlyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(entry => ({
      ticker,
      date: entry.date,
      open: entry.open,
      high: entry.high,
      low: entry.low,
      close: entry.close,
      volume: entry.volume ?? undefined,
    }));
}

// --- Multi-Provider Fetch with Fallback ---

/**
 * Determine which providers are available based on API keys and rate limits
 */
export function getAvailableProviders(): PriceProvider[] {
  const apiKeys = loadApiKeyConfig();

  return DEFAULT_PROVIDER_ORDER.filter(provider => {
    // Check rate limit
    if (!hasRateLimitCapacity(provider)) return false;

    // Check API key requirements
    if (provider === 'alphavantage' && !apiKeys.alphaVantageKey) return false;
    if (provider === 'financialdata' && !apiKeys.financialDataKey) return false;

    return true;
  });
}

/**
 * Fetch monthly closing prices for a ticker using the fallback chain.
 * Tries each provider in order until one succeeds.
 * 
 * @param ticker - Stock/ETF ticker symbol (e.g., "MSFT", "VTI")
 * @param months - Number of months of history to fetch (default: 12)
 * @returns Price fetch result from the first successful provider
 */
export async function fetchMonthlyClosingPrices(
  ticker: string,
  months: number = 12
): Promise<PriceFetchResult> {
  // Check cache first
  const cached = getCachedPrice(ticker, 'monthly');
  if (cached) return cached;

  const providers = getAvailableProviders();
  const errors: string[] = [];

  for (const provider of providers) {
    let result: PriceFetchResult;

    switch (provider) {
      case 'yahoo':
        result = await fetchFromYahoo(ticker, months);
        break;
      case 'alphavantage':
        result = await fetchFromAlphaVantage(ticker);
        break;
      case 'financialdata':
        result = await fetchFromFinancialData(ticker);
        break;
      default:
        continue;
    }

    // If we got valid price data, cache and return
    if (result.prices.length > 0) {
      setCachedPrice(ticker, 'monthly', result);
      return result;
    }

    // Track the error for logging
    if (result.error) {
      errors.push(`${provider}: ${result.error}`);
    }
  }

  // All providers failed
  return {
    ticker,
    prices: [],
    provider: providers[0] || 'yahoo',
    fetchedAt: new Date().toISOString(),
    isDelayed: false,
    error: errors.length > 0
      ? `All providers failed: ${errors.join('; ')}`
      : 'No providers available (check API keys and rate limits)',
  };
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
): Promise<{ price: number; date: string; provider: PriceProvider; isDelayed: boolean } | null> {
  const result = await fetchMonthlyClosingPrices(ticker, 1);

  if (result.prices.length === 0) return null;

  const latest = result.prices[result.prices.length - 1];
  return {
    price: latest.close,
    date: latest.date,
    provider: result.provider,
    isDelayed: result.isDelayed,
  };
}

/**
 * Check if data may be stale due to 2-day delay (financialdata.net).
 * Returns true if we're within the first 2 trading days of a new month.
 */
export function isWithinDelayWindow(): boolean {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  // If it's the 1st-3rd of the month and not a weekend, data may be stale
  if (dayOfMonth <= 3 && dayOfWeek !== 0 && dayOfWeek !== 6) {
    return true;
  }

  return false;
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
  const message = `Last data from ${latest.date} via ${result.provider}`;

  if (result.isDelayed) {
    return `${message} (prices delayed by ~2 days)`;
  }

  return message;
}
