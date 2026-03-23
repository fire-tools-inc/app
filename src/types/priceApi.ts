/**
 * Price API Types
 * 
 * Types for the multi-provider price API that fetches monthly closing prices
 * for assets and exchange rates.
 */

/**
 * Supported price data providers
 */
export type PriceProvider = 'yahoo' | 'alphavantage' | 'financialdata';

/**
 * Configuration for a price provider including API key if required
 */
export interface ProviderConfig {
  provider: PriceProvider;
  apiKey?: string;
  enabled: boolean;
}

/**
 * Monthly closing price for a single asset on a specific date
 */
export interface MonthlyClosingPrice {
  ticker: string;
  date: string; // ISO date string (YYYY-MM-DD)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/**
 * Result of a price fetch operation for a single ticker
 */
export interface PriceFetchResult {
  ticker: string;
  prices: MonthlyClosingPrice[];
  provider: PriceProvider;
  fetchedAt: string; // ISO timestamp
  isDelayed: boolean; // True if data is delayed (e.g., financialdata.net has 2-day delay)
  error?: string;
}

/**
 * Exchange rate data point
 */
export interface ExchangeRateData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string; // ISO date string
  provider: PriceProvider;
}

/**
 * Result of an exchange rate fetch operation
 */
export interface ExchangeRateFetchResult {
  rates: ExchangeRateData[];
  fetchedAt: string; // ISO timestamp
  provider: PriceProvider;
  error?: string;
}

/**
 * Cache entry for price data
 */
export interface PriceCacheEntry {
  result: PriceFetchResult;
  expiresAt: string; // ISO timestamp
}

/**
 * Cache entry for exchange rate data
 */
export interface ExchangeRateCacheEntry {
  result: ExchangeRateFetchResult;
  expiresAt: string; // ISO timestamp
}

/**
 * Rate limit tracking per provider
 */
export interface RateLimitInfo {
  provider: PriceProvider;
  requestsToday: number;
  dailyLimit: number;
  lastRequestAt: string | null; // ISO timestamp
  resetDate: string; // ISO date string (YYYY-MM-DD)
}

/**
 * API key storage structure for user-provided keys
 */
export interface ApiKeyConfig {
  alphaVantageKey?: string;
  financialDataKey?: string;
  lastUpdated: string | null; // ISO timestamp
}

/**
 * Daily rate limits per provider
 */
export const PROVIDER_DAILY_LIMITS: Record<PriceProvider, number> = {
  yahoo: 500,          // Yahoo Finance public API (generous but unofficial)
  alphavantage: 20,    // Free tier: 25/day, but we limit to 20 for safety
  financialdata: 300,  // financialdata.net: 300 requests/day
};

/**
 * Default provider priority order (fallback chain)
 */
export const DEFAULT_PROVIDER_ORDER: PriceProvider[] = [
  'yahoo',
  'financialdata',
  'alphavantage',
];

/**
 * Default API key configuration
 */
export const DEFAULT_API_KEY_CONFIG: ApiKeyConfig = {
  alphaVantageKey: undefined,
  financialDataKey: undefined,
  lastUpdated: null,
};
