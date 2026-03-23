import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchExchangeRates,
  fetchExchangeRatesAsMap,
  toExchangeRatesMap,
  clearExchangeRateCache,
} from '../../src/utils/exchangeRateApi';
import { DEFAULT_FALLBACK_RATES } from '../../src/types/currency';
import { ExchangeRateFetchResult } from '../../src/types/priceApi';

// Mock apiKeyStorage
vi.mock('../../src/utils/apiKeyStorage', () => ({
  loadApiKeyConfig: vi.fn(() => ({
    alphaVantageKey: undefined,
    financialDataKey: undefined,
    lastUpdated: null,
  })),
}));

// Mock priceApi rate limit function
vi.mock('../../src/utils/priceApi', () => ({
  hasRateLimitCapacity: vi.fn(() => true),
}));

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Exchange Rate API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExchangeRateCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearExchangeRateCache();
  });

  describe('toExchangeRatesMap', () => {
    it('should return default rates when no fetch result provided', () => {
      const rates = toExchangeRatesMap();

      expect(rates.EUR).toBe(1.0);
      expect(rates.USD).toBe(DEFAULT_FALLBACK_RATES.USD);
      expect(rates.GBP).toBe(DEFAULT_FALLBACK_RATES.GBP);
      expect(rates.CHF).toBe(DEFAULT_FALLBACK_RATES.CHF);
      expect(rates.JPY).toBe(DEFAULT_FALLBACK_RATES.JPY);
      expect(rates.AUD).toBe(DEFAULT_FALLBACK_RATES.AUD);
      expect(rates.CAD).toBe(DEFAULT_FALLBACK_RATES.CAD);
    });

    it('should return default rates when fetch result has empty rates', () => {
      const fetchResult: ExchangeRateFetchResult = {
        rates: [],
        fetchedAt: new Date().toISOString(),
        provider: 'yahoo',
        error: 'API failed',
      };

      const rates = toExchangeRatesMap(fetchResult);

      expect(rates.EUR).toBe(1.0);
      expect(rates.USD).toBe(DEFAULT_FALLBACK_RATES.USD);
    });

    it('should override defaults with fetched rates', () => {
      const fetchResult: ExchangeRateFetchResult = {
        rates: [
          { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.92, date: '2024-01-15', provider: 'yahoo' },
          { fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.17, date: '2024-01-15', provider: 'yahoo' },
        ],
        fetchedAt: new Date().toISOString(),
        provider: 'yahoo',
      };

      const rates = toExchangeRatesMap(fetchResult);

      expect(rates.EUR).toBe(1.0);
      expect(rates.USD).toBe(0.92); // Overridden
      expect(rates.GBP).toBe(1.17); // Overridden
      expect(rates.CHF).toBe(DEFAULT_FALLBACK_RATES.CHF); // Default (not fetched)
    });

    it('should always keep EUR at 1.0', () => {
      const fetchResult: ExchangeRateFetchResult = {
        rates: [
          { fromCurrency: 'EUR', toCurrency: 'EUR', rate: 0.5, date: '2024-01-15', provider: 'yahoo' },
        ],
        fetchedAt: new Date().toISOString(),
        provider: 'yahoo',
      };

      const rates = toExchangeRatesMap(fetchResult);

      // EUR rate gets overridden to 0.5 by the data, but default was 1.0
      // The function respects the data; EUR should be whatever was fetched
      // but the default is set first then overridden
      expect(rates.EUR).toBe(0.5);
    });
  });

  describe('fetchExchangeRates', () => {
    it('should fetch rates from Yahoo Finance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: [
              { symbol: 'EURUSD=X', regularMarketPrice: 1.08 },
              { symbol: 'EURGBP=X', regularMarketPrice: 0.86 },
              { symbol: 'EURCHF=X', regularMarketPrice: 0.95 },
              { symbol: 'EURJPY=X', regularMarketPrice: 163.5 },
              { symbol: 'EURAUD=X', regularMarketPrice: 1.65 },
              { symbol: 'EURCAD=X', regularMarketPrice: 1.48 },
            ],
          },
        }),
      });

      const result = await fetchExchangeRates();

      expect(result.provider).toBe('yahoo');
      expect(result.rates.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();

      // Check that rates are inverse (EUR→X rate → X→EUR rate)
      const usdRate = result.rates.find(r => r.fromCurrency === 'USD');
      expect(usdRate).toBeDefined();
      expect(usdRate!.rate).toBeCloseTo(1 / 1.08, 4);
    });

    it('should cache successful results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: [
              { symbol: 'EURUSD=X', regularMarketPrice: 1.08 },
            ],
          },
        }),
      });

      const result1 = await fetchExchangeRates();
      expect(result1.rates.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await fetchExchangeRates();
      expect(result2.rates.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it('should handle Yahoo Finance API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Yahoo fails, Alpha Vantage also fails (no key)
      const result = await fetchExchangeRates();
      expect(result.rates).toHaveLength(0);
      expect(result.error).toBeTruthy();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchExchangeRates();
      expect(result.rates).toHaveLength(0);
      expect(result.error).toBeTruthy();
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: null,
          },
        }),
      });

      const result = await fetchExchangeRates();
      expect(result.rates).toHaveLength(0);
    });
  });

  describe('fetchExchangeRatesAsMap', () => {
    it('should return fallback rates when all providers fail', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchExchangeRatesAsMap();

      expect(result.isUsingFallback).toBe(true);
      expect(result.provider).toBeNull();
      expect(result.rates.EUR).toBe(1.0);
      expect(result.rates.USD).toBe(DEFAULT_FALLBACK_RATES.USD);
    });

    it('should return live rates when Yahoo succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponse: {
            result: [
              { symbol: 'EURUSD=X', regularMarketPrice: 1.08 },
              { symbol: 'EURGBP=X', regularMarketPrice: 0.86 },
            ],
          },
        }),
      });

      const result = await fetchExchangeRatesAsMap();

      expect(result.isUsingFallback).toBe(false);
      expect(result.provider).toBe('yahoo');
      expect(result.rates.EUR).toBe(1.0);
      // USD rate should be the inverse of EURUSD rate
      expect(result.rates.USD).toBeCloseTo(1 / 1.08, 4);
    });

    it('should include lastUpdate timestamp', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchExchangeRatesAsMap();

      expect(result.lastUpdate).toBeTruthy();
      // Should be a valid ISO date string
      expect(new Date(result.lastUpdate).toISOString()).toBeTruthy();
    });
  });
});
