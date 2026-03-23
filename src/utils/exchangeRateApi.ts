/**
 * Exchange Rate API Service
 * 
 * Fetches live exchange rates using Yahoo Finance currency pairs.
 * Falls back to Alpha Vantage or hardcoded default rates.
 * 
 * Exchange rates are relative to EUR (base currency).
 * Example: USD: 0.85 means 1 USD = 0.85 EUR
 */

import {
  PriceProvider,
  ExchangeRateFetchResult,
  ExchangeRateCacheEntry,
} from '../types/priceApi';
import {
  ExchangeRates,
  SupportedCurrency,
  DEFAULT_FALLBACK_RATES,
} from '../types/currency';
import { loadApiKeyConfig } from './apiKeyStorage';
import { hasRateLimitCapacity } from './priceApi';

// --- Cache ---

/** Cache duration for exchange rates (6 hours) */
const EXCHANGE_RATE_CACHE_MS = 6 * 60 * 60 * 1000;

/** In-memory cache for exchange rate data */
let exchangeRateCache: ExchangeRateCacheEntry | null = null;

/**
 * Clear the exchange rate cache
 */
export function clearExchangeRateCache(): void {
  exchangeRateCache = null;
}

// --- Yahoo Finance Exchange Rates ---

const YAHOO_QUOTE_API_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';

/**
 * Currency pairs to fetch from Yahoo Finance.
 * Yahoo uses format: EURUSD=X for EUR to USD
 */
const CURRENCY_PAIRS: Array<{ from: string; to: string; yahooSymbol: string }> = [
  { from: 'EUR', to: 'USD', yahooSymbol: 'EURUSD=X' },
  { from: 'EUR', to: 'GBP', yahooSymbol: 'EURGBP=X' },
  { from: 'EUR', to: 'CHF', yahooSymbol: 'EURCHF=X' },
  { from: 'EUR', to: 'JPY', yahooSymbol: 'EURJPY=X' },
  { from: 'EUR', to: 'AUD', yahooSymbol: 'EURAUD=X' },
  { from: 'EUR', to: 'CAD', yahooSymbol: 'EURCAD=X' },
];

/**
 * Fetch exchange rates from Yahoo Finance
 */
async function fetchExchangeRatesFromYahoo(): Promise<ExchangeRateFetchResult> {
  const result: ExchangeRateFetchResult = {
    rates: [],
    fetchedAt: new Date().toISOString(),
    provider: 'yahoo',
  };

  if (!hasRateLimitCapacity('yahoo')) {
    result.error = 'Yahoo Finance daily rate limit reached';
    return result;
  }

  try {
    const symbols = CURRENCY_PAIRS.map(p => p.yahooSymbol).join(',');
    const url = `${YAHOO_QUOTE_API_URL}?symbols=${symbols}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      result.error = `Yahoo Finance API error: ${response.status} ${response.statusText}`;
      return result;
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result;

    if (!Array.isArray(quotes)) {
      result.error = 'Invalid response from Yahoo Finance';
      return result;
    }

    const now = new Date().toISOString().split('T')[0];

    for (const quote of quotes) {
      const pair = CURRENCY_PAIRS.find(p => p.yahooSymbol === quote.symbol);
      if (!pair) continue;

      const rate = quote.regularMarketPrice || quote.ask || quote.bid;
      if (typeof rate !== 'number' || rate <= 0) continue;

      // Yahoo gives EUR→X rate (e.g., EURUSD=X gives 1.18 meaning 1 EUR = 1.18 USD)
      // We need X→EUR rate (e.g., 1 USD = 1/1.18 EUR ≈ 0.847 EUR)
      const inverseRate = 1 / rate;

      result.rates.push({
        fromCurrency: pair.to,
        toCurrency: 'EUR',
        rate: inverseRate,
        date: now,
        provider: 'yahoo',
      });
    }
  } catch (error) {
    result.error = `Yahoo Finance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

// --- Alpha Vantage Exchange Rates ---

const ALPHA_VANTAGE_API_URL = 'https://www.alphavantage.co/query';

/**
 * Fetch exchange rates from Alpha Vantage
 * Uses CURRENCY_EXCHANGE_RATE function
 */
async function fetchExchangeRatesFromAlphaVantage(): Promise<ExchangeRateFetchResult> {
  const result: ExchangeRateFetchResult = {
    rates: [],
    fetchedAt: new Date().toISOString(),
    provider: 'alphavantage',
  };

  if (!hasRateLimitCapacity('alphavantage')) {
    result.error = 'Alpha Vantage daily rate limit reached';
    return result;
  }

  const apiKeys = loadApiKeyConfig();
  if (!apiKeys.alphaVantageKey) {
    result.error = 'Alpha Vantage API key not configured';
    return result;
  }

  const currencies: SupportedCurrency[] = ['USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD'];
  const now = new Date().toISOString().split('T')[0];

  try {
    // Fetch each currency pair separately (Alpha Vantage limitation)
    for (const currency of currencies) {
      if (!hasRateLimitCapacity('alphavantage')) {
        break; // Stop if we hit rate limit
      }

      const url = `${ALPHA_VANTAGE_API_URL}?function=CURRENCY_EXCHANGE_RATE&from_currency=${currency}&to_currency=EUR&apikey=${encodeURIComponent(apiKeys.alphaVantageKey)}`;

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const rateData = data?.['Realtime Currency Exchange Rate'];

      if (!rateData) continue;

      const rate = parseFloat(rateData['5. Exchange Rate']);
      if (isNaN(rate) || rate <= 0) continue;

      result.rates.push({
        fromCurrency: currency,
        toCurrency: 'EUR',
        rate,
        date: now,
        provider: 'alphavantage',
      });
    }
  } catch (error) {
    result.error = `Alpha Vantage fetch failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return result;
}

// --- Multi-Provider Exchange Rate Fetch ---

/**
 * Fetch live exchange rates using the provider fallback chain.
 * Returns rates relative to EUR (1 X = ? EUR).
 * Falls back to hardcoded default rates if all providers fail.
 * 
 * @returns Exchange rate fetch result
 */
export async function fetchExchangeRates(): Promise<ExchangeRateFetchResult> {
  // Check cache first
  if (exchangeRateCache) {
    const now = Date.now();
    const expiresAt = new Date(exchangeRateCache.expiresAt).getTime();
    if (now < expiresAt) {
      return exchangeRateCache.result;
    }
  }

  // Try Yahoo Finance first
  const yahooResult = await fetchExchangeRatesFromYahoo();
  if (yahooResult.rates.length > 0) {
    exchangeRateCache = {
      result: yahooResult,
      expiresAt: new Date(Date.now() + EXCHANGE_RATE_CACHE_MS).toISOString(),
    };
    return yahooResult;
  }

  // Try Alpha Vantage
  const alphaResult = await fetchExchangeRatesFromAlphaVantage();
  if (alphaResult.rates.length > 0) {
    exchangeRateCache = {
      result: alphaResult,
      expiresAt: new Date(Date.now() + EXCHANGE_RATE_CACHE_MS).toISOString(),
    };
    return alphaResult;
  }

  // All providers failed, return fallback indicator
  const errors = [yahooResult.error, alphaResult.error].filter(Boolean);
  return {
    rates: [],
    fetchedAt: new Date().toISOString(),
    provider: 'yahoo',
    error: errors.length > 0
      ? `All providers failed: ${errors.join('; ')}`
      : 'No exchange rate providers available',
  };
}

/**
 * Convert exchange rate fetch result to ExchangeRates map
 * compatible with the existing currency system.
 * Falls back to default rates for any missing currencies.
 * 
 * @param fetchResult - The exchange rate fetch result (optional, uses fallback if not provided)
 * @returns ExchangeRates map (currency → EUR rate)
 */
export function toExchangeRatesMap(fetchResult?: ExchangeRateFetchResult): ExchangeRates {
  const rates: ExchangeRates = { EUR: 1.0 };

  // Start with defaults
  for (const [currency, rate] of Object.entries(DEFAULT_FALLBACK_RATES)) {
    rates[currency] = rate;
  }

  // Override with fetched rates
  if (fetchResult && fetchResult.rates.length > 0) {
    for (const rateData of fetchResult.rates) {
      rates[rateData.fromCurrency] = rateData.rate;
    }
  }

  return rates;
}

/**
 * Fetch live exchange rates and return as ExchangeRates map.
 * This is a convenience function that combines fetchExchangeRates and toExchangeRatesMap.
 * 
 * @returns Object with exchange rates map and metadata
 */
export async function fetchExchangeRatesAsMap(): Promise<{
  rates: ExchangeRates;
  isUsingFallback: boolean;
  provider: PriceProvider | null;
  lastUpdate: string;
  error?: string;
}> {
  const result = await fetchExchangeRates();
  const rates = toExchangeRatesMap(result);
  const isUsingFallback = result.rates.length === 0;

  return {
    rates,
    isUsingFallback,
    provider: isUsingFallback ? null : result.provider,
    lastUpdate: result.fetchedAt,
    error: result.error,
  };
}
