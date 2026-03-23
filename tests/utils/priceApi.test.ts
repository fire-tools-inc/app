import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractMonthlyClosingPrices,
  hasRateLimitCapacity,
  getRateLimitStatus,
  getAvailableProviders,
  clearPriceCache,
  fetchMonthlyClosingPrices,
  fetchMultipleMonthlyPrices,
  isWithinDelayWindow,
  getDataFreshnessMessage,
} from '../../src/utils/priceApi';
import { PriceFetchResult, PROVIDER_DAILY_LIMITS } from '../../src/types/priceApi';

// Mock apiKeyStorage
vi.mock('../../src/utils/apiKeyStorage', () => ({
  loadApiKeyConfig: vi.fn(() => ({
    alphaVantageKey: undefined,
    financialDataKey: undefined,
    lastUpdated: null,
  })),
  hasApiKey: vi.fn(() => false),
}));

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('Price API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPriceCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearPriceCache();
  });

  describe('extractMonthlyClosingPrices', () => {
    it('should extract the last trading day of each month from daily data', () => {
      const dailyData = [
        { date: '2024-01-15', open: 100, high: 105, low: 98, close: 102, volume: 1000 },
        { date: '2024-01-31', open: 103, high: 108, low: 101, close: 107, volume: 1200 },
        { date: '2024-01-30', open: 101, high: 104, low: 99, close: 103, volume: 900 },
        { date: '2024-02-14', open: 108, high: 112, low: 106, close: 110, volume: 800 },
        { date: '2024-02-28', open: 111, high: 115, low: 109, close: 113, volume: 1100 },
      ];

      const result = extractMonthlyClosingPrices(dailyData, 'AAPL');

      expect(result).toHaveLength(2);

      // January: last trading day is 2024-01-31
      expect(result[0].date).toBe('2024-01-31');
      expect(result[0].close).toBe(107);
      expect(result[0].ticker).toBe('AAPL');

      // February: last trading day is 2024-02-28
      expect(result[1].date).toBe('2024-02-28');
      expect(result[1].close).toBe(113);
    });

    it('should handle empty daily data', () => {
      const result = extractMonthlyClosingPrices([], 'AAPL');
      expect(result).toHaveLength(0);
    });

    it('should handle single data point', () => {
      const dailyData = [
        { date: '2024-03-15', open: 170, high: 175, low: 168, close: 172 },
      ];

      const result = extractMonthlyClosingPrices(dailyData, 'MSFT');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-03-15');
      expect(result[0].close).toBe(172);
      expect(result[0].volume).toBeUndefined();
    });

    it('should sort results by date ascending', () => {
      const dailyData = [
        { date: '2024-03-31', open: 170, high: 175, low: 168, close: 172, volume: 500 },
        { date: '2024-01-31', open: 150, high: 155, low: 148, close: 152, volume: 600 },
        { date: '2024-02-28', open: 160, high: 165, low: 158, close: 162, volume: 700 },
      ];

      const result = extractMonthlyClosingPrices(dailyData, 'VTI');

      expect(result[0].date).toBe('2024-01-31');
      expect(result[1].date).toBe('2024-02-28');
      expect(result[2].date).toBe('2024-03-31');
    });

    it('should handle multiple entries in the same month', () => {
      const dailyData = [
        { date: '2024-06-03', open: 100, high: 105, low: 98, close: 102, volume: 1000 },
        { date: '2024-06-10', open: 103, high: 108, low: 101, close: 105, volume: 1100 },
        { date: '2024-06-17', open: 106, high: 110, low: 104, close: 108, volume: 1200 },
        { date: '2024-06-24', open: 109, high: 113, low: 107, close: 111, volume: 1300 },
        { date: '2024-06-28', open: 112, high: 116, low: 110, close: 115, volume: 1400 },
      ];

      const result = extractMonthlyClosingPrices(dailyData, 'SPY');

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-06-28');
      expect(result[0].close).toBe(115);
    });
  });

  describe('hasRateLimitCapacity', () => {
    it('should return true for fresh provider with no requests', () => {
      expect(hasRateLimitCapacity('yahoo')).toBe(true);
      expect(hasRateLimitCapacity('alphavantage')).toBe(true);
      expect(hasRateLimitCapacity('financialdata')).toBe(true);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for all providers', () => {
      const status = getRateLimitStatus();

      expect(status).toHaveLength(3);
      expect(status.map(s => s.provider)).toEqual(['yahoo', 'financialdata', 'alphavantage']);

      // Each should have correct daily limits
      const yahooStatus = status.find(s => s.provider === 'yahoo');
      expect(yahooStatus?.dailyLimit).toBe(PROVIDER_DAILY_LIMITS.yahoo);

      const alphaStatus = status.find(s => s.provider === 'alphavantage');
      expect(alphaStatus?.dailyLimit).toBe(PROVIDER_DAILY_LIMITS.alphavantage);

      const fdStatus = status.find(s => s.provider === 'financialdata');
      expect(fdStatus?.dailyLimit).toBe(PROVIDER_DAILY_LIMITS.financialdata);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return Yahoo Finance when no API keys are configured', () => {
      const providers = getAvailableProviders();

      // Yahoo doesn't need a key, so it should always be available
      expect(providers).toContain('yahoo');

      // Alpha Vantage and financialdata.net need keys
      expect(providers).not.toContain('alphavantage');
      expect(providers).not.toContain('financialdata');
    });
  });

  describe('fetchMonthlyClosingPrices', () => {
    it('should return cached data if available', async () => {
      // First call - mock a successful Yahoo response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              timestamp: [1704067200], // 2024-01-01
              indicators: {
                quote: [{
                  open: [150],
                  high: [155],
                  low: [148],
                  close: [152],
                  volume: [1000000],
                }],
              },
            }],
          },
        }),
      });

      const result1 = await fetchMonthlyClosingPrices('AAPL', 1);
      expect(result1.prices).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await fetchMonthlyClosingPrices('AAPL', 1);
      expect(result2.prices).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it('should handle Yahoo Finance API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await fetchMonthlyClosingPrices('INVALID_TICKER', 1);

      expect(result.error).toBeTruthy();
      expect(result.prices).toHaveLength(0);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchMonthlyClosingPrices('AAPL', 1);

      expect(result.error).toBeTruthy();
      expect(result.prices).toHaveLength(0);
    });

    it('should handle empty response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              timestamp: [],
              indicators: {
                quote: [{ open: [], high: [], low: [], close: [], volume: [] }],
              },
            }],
          },
        }),
      });

      const result = await fetchMonthlyClosingPrices('AAPL', 1);
      expect(result.prices).toHaveLength(0);
    });

    it('should skip data points with null close prices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              timestamp: [1704067200, 1706745600], // 2 months
              indicators: {
                quote: [{
                  open: [150, 160],
                  high: [155, 165],
                  low: [148, 158],
                  close: [null, 162], // First month has null close
                  volume: [1000000, 1100000],
                }],
              },
            }],
          },
        }),
      });

      const result = await fetchMonthlyClosingPrices('AAPL', 2);
      expect(result.prices).toHaveLength(1); // Only the second data point
      expect(result.prices[0].close).toBe(162);
    });
  });

  describe('fetchMultipleMonthlyPrices', () => {
    it('should fetch prices for multiple tickers', async () => {
      // Mock responses for two different tickers
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              result: [{
                timestamp: [1704067200],
                indicators: {
                  quote: [{
                    open: [150], high: [155], low: [148], close: [152], volume: [1000000],
                  }],
                },
              }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chart: {
              result: [{
                timestamp: [1704067200],
                indicators: {
                  quote: [{
                    open: [80], high: [82], low: [79], close: [81], volume: [500000],
                  }],
                },
              }],
            },
          }),
        });

      const results = await fetchMultipleMonthlyPrices(['AAPL', 'BND'], 1);

      expect(results['AAPL']).toBeDefined();
      expect(results['BND']).toBeDefined();
      expect(results['AAPL'].prices[0].close).toBe(152);
      expect(results['BND'].prices[0].close).toBe(81);
    });

    it('should deduplicate tickers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              timestamp: [1704067200],
              indicators: {
                quote: [{
                  open: [150], high: [155], low: [148], close: [152], volume: [1000000],
                }],
              },
            }],
          },
        }),
      });

      const results = await fetchMultipleMonthlyPrices(['AAPL', 'aapl', 'AAPL'], 1);

      // Should only fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results['AAPL']).toBeDefined();
    });

    it('should filter out empty tickers', async () => {
      const results = await fetchMultipleMonthlyPrices(['', '  ', ''], 1);
      expect(Object.keys(results)).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('isWithinDelayWindow', () => {
    it('should return a boolean value', () => {
      const result = isWithinDelayWindow();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getDataFreshnessMessage', () => {
    it('should return error message for failed fetch', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [],
        provider: 'yahoo',
        fetchedAt: new Date().toISOString(),
        isDelayed: false,
        error: 'API error',
      };

      expect(getDataFreshnessMessage(result)).toContain('Failed to fetch');
    });

    it('should return no data message for empty prices', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [],
        provider: 'yahoo',
        fetchedAt: new Date().toISOString(),
        isDelayed: false,
      };

      expect(getDataFreshnessMessage(result)).toBe('No price data available');
    });

    it('should include provider and date info for successful fetch', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [{
          ticker: 'AAPL',
          date: '2024-01-31',
          open: 150, high: 155, low: 148, close: 152,
        }],
        provider: 'yahoo',
        fetchedAt: new Date().toISOString(),
        isDelayed: false,
      };

      const message = getDataFreshnessMessage(result);
      expect(message).toContain('2024-01-31');
      expect(message).toContain('yahoo');
    });

    it('should include delay warning for delayed data', () => {
      const result: PriceFetchResult = {
        ticker: 'MSFT',
        prices: [{
          ticker: 'MSFT',
          date: '2024-01-31',
          open: 400, high: 410, low: 395, close: 405,
        }],
        provider: 'financialdata',
        fetchedAt: new Date().toISOString(),
        isDelayed: true,
      };

      const message = getDataFreshnessMessage(result);
      expect(message).toContain('delayed');
    });
  });
});
