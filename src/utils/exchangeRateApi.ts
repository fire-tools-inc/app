/**
 * Exchange Rate API Service
 * 
 * Fetches live exchange rates using Yahoo Finance currency pairs.
 * Falls back to hardcoded default rates if Yahoo Finance is unavailable.
 * 
 * Exchange rates are relative to EUR (base currency).
 * Example: USD: 0.85 means 1 USD = 0.85 EUR
 */

import {
  ExchangeRateFetchResult,
  ExchangeRateCacheEntry,
} from '../types/priceApi';
import { logger } from './logger';
import {
  ExchangeRates,
  DEFAULT_FALLBACK_RATES,
} from '../types/currency';
import { yahooFetch, hasRateLimitCapacity, YahooRateLimitError } from './yahooProxy';

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
 * Fetch live exchange rates from Yahoo Finance.
 * Returns rates relative to EUR (1 X = ? EUR).
 * Falls back to hardcoded default rates if Yahoo Finance is unavailable.
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

  const result: ExchangeRateFetchResult = {
    rates: [],
    fetchedAt: new Date().toISOString(),
  };

  if (!hasRateLimitCapacity()) {
    result.error = 'Yahoo Finance daily rate limit reached';
    return result;
  }

  try {
    const now = new Date().toISOString().split('T')[0];

    // Fetch each currency pair via v8 chart endpoint
    for (const pair of CURRENCY_PAIRS) {
      try {
        const data = await yahooFetch<any>(
          `/v8/finance/chart/${encodeURIComponent(pair.yahooSymbol)}?interval=1d&range=1d`,
        );
        const meta = data?.chart?.result?.[0]?.meta;
        const rate = meta?.regularMarketPrice;

        if (typeof rate !== 'number' || rate <= 0) continue;

        // Yahoo gives EUR→X rate (e.g., EURUSD=X gives 1.18 meaning 1 EUR = 1.18 USD)
        // We need X→EUR rate (e.g., 1 USD = 1/1.18 EUR ≈ 0.847 EUR)
        const inverseRate = 1 / rate;

        result.rates.push({
          fromCurrency: pair.to,
          toCurrency: 'EUR',
          rate: inverseRate,
          date: now,
        });
      } catch (pairError) {
        logger.error('exchange-rate', 'pair-fetch-failed', 'failed to fetch currency pair', {
          pii: { yahooSymbol: pair.yahooSymbol, error: (pairError as Error)?.message },
        });
      }
    }

    // Cache successful results
    if (result.rates.length > 0) {
      exchangeRateCache = {
        result,
        expiresAt: new Date(Date.now() + EXCHANGE_RATE_CACHE_MS).toISOString(),
      };
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
  lastUpdate: string;
  error?: string;
}> {
  const result = await fetchExchangeRates();
  const rates = toExchangeRatesMap(result);
  const isUsingFallback = result.rates.length === 0;

  return {
    rates,
    isUsingFallback,
    lastUpdate: result.fetchedAt,
    error: result.error,
  };
}
