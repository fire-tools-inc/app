import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchExchangeRates,
  fetchExchangeRatesAsMap,
  toExchangeRatesMap,
  clearExchangeRateCache,
} from '../../../src/utils/exchangeRateApi';
import { DEFAULT_FALLBACK_RATES } from '../../../src/types/currency';
import { ExchangeRateFetchResult } from '../../../src/types/priceApi';
import { expectDiagnostic } from '../../shared/diagnostics';

// Mock yahooProxy rate limit and fetch
vi.mock('../../../src/utils/yahooProxy', () => ({
  hasRateLimitCapacity: vi.fn(() => true),
  yahooFetch: vi.fn(),
  YahooRateLimitError: class YahooRateLimitError extends Error {
    constructor(message: string) { super(message); this.name = 'YahooRateLimitError'; }
  },
}));

import { yahooFetch } from '../../../src/utils/yahooProxy';
const mockYahooFetch = yahooFetch as ReturnType<typeof vi.fn>;

describe('Exchange Rate API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExchangeRateCache();
    mockYahooFetch.mockReset();
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
        error: 'API failed',
      };

      const rates = toExchangeRatesMap(fetchResult);

      expect(rates.EUR).toBe(1.0);
      expect(rates.USD).toBe(DEFAULT_FALLBACK_RATES.USD);
    });

    it('should override defaults with fetched rates', () => {
      const fetchResult: ExchangeRateFetchResult = {
        rates: [
          { fromCurrency: 'USD', toCurrency: 'EUR', rate: 0.92, date: '2024-01-15' },
          { fromCurrency: 'GBP', toCurrency: 'EUR', rate: 1.17, date: '2024-01-15' },
        ],
        fetchedAt: new Date().toISOString(),
      };

      const rates = toExchangeRatesMap(fetchResult);

      expect(rates.EUR).toBe(1.0);
      expect(rates.USD).toBe(0.92); // Overridden
      expect(rates.GBP).toBe(1.17); // Overridden
      expect(rates.CHF).toBe(DEFAULT_FALLBACK_RATES.CHF); // Default (not fetched)
    });
  });

  describe('fetchExchangeRates', () => {
    // Helper: build a v8 chart response for a currency pair
    const chartResponse = (symbol: string, price: number) => ({
      chart: { result: [{ meta: { symbol, regularMarketPrice: price } }] },
    });

    it('should fetch rates from Yahoo Finance', async () => {
      // Each currency pair is fetched individually via v8
      mockYahooFetch
        .mockResolvedValueOnce(chartResponse('EURUSD=X', 1.08))
        .mockResolvedValueOnce(chartResponse('EURGBP=X', 0.86))
        .mockResolvedValueOnce(chartResponse('EURCHF=X', 0.95))
        .mockResolvedValueOnce(chartResponse('EURJPY=X', 163.5))
        .mockResolvedValueOnce(chartResponse('EURAUD=X', 1.65))
        .mockResolvedValueOnce(chartResponse('EURCAD=X', 1.48));

      const result = await fetchExchangeRates();

      expect(result.rates.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();

      // Check that rates are inverse (EUR→X rate → X→EUR rate)
      const usdRate = result.rates.find(r => r.fromCurrency === 'USD');
      expect(usdRate).toBeDefined();
      expect(usdRate!.rate).toBeCloseTo(1 / 1.08, 4);
    });

    it('should cache successful results', async () => {
      mockYahooFetch.mockResolvedValue(chartResponse('EURUSD=X', 1.08));

      const result1 = await fetchExchangeRates();
      expect(result1.rates.length).toBeGreaterThan(0);
      const callCount = mockYahooFetch.mock.calls.length;

      // Second call should use cache
      const result2 = await fetchExchangeRates();
      expect(result2.rates.length).toBeGreaterThan(0);
      expect(mockYahooFetch).toHaveBeenCalledTimes(callCount); // No additional fetches
    });

    it('should handle network errors gracefully', async () => {
      mockYahooFetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchExchangeRates();
      expect(result.rates).toHaveLength(0);
      expectDiagnostic('error', '[pair-fetch-failed]: failed to fetch currency pair', 6);
    });

    it('should handle invalid response format', async () => {
      mockYahooFetch.mockResolvedValue({
        chart: { result: [] },
      });

      const result = await fetchExchangeRates();
      expect(result.rates).toHaveLength(0);
    });
  });

  describe('fetchExchangeRatesAsMap', () => {
    const chartResponse = (symbol: string, price: number) => ({
      chart: { result: [{ meta: { symbol, regularMarketPrice: price } }] },
    });

    it('should return fallback rates when Yahoo Finance fails', async () => {
      mockYahooFetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchExchangeRatesAsMap();

      expect(result.isUsingFallback).toBe(true);
      expect(result.rates.EUR).toBe(1.0);
      expect(result.rates.USD).toBe(DEFAULT_FALLBACK_RATES.USD);
      expectDiagnostic('error', '[pair-fetch-failed]: failed to fetch currency pair', 6);
    });

    it('should return live rates when Yahoo succeeds', async () => {
      mockYahooFetch.mockResolvedValue(chartResponse('EURUSD=X', 1.08));

      const result = await fetchExchangeRatesAsMap();

      expect(result.isUsingFallback).toBe(false);
      expect(result.rates.EUR).toBe(1.0);
      // USD rate should be the inverse of EURUSD rate
      expect(result.rates.USD).toBeCloseTo(1 / 1.08, 4);
    });

    it('should include lastUpdate timestamp', async () => {
      mockYahooFetch.mockRejectedValue(new Error('Network error'));

      const result = await fetchExchangeRatesAsMap();

      expect(result.lastUpdate).toBeTruthy();
      // Should be a valid ISO date string
      expect(new Date(result.lastUpdate).toISOString()).toBeTruthy();
      expectDiagnostic('error', '[pair-fetch-failed]: failed to fetch currency pair', 6);
    });
  });
});
