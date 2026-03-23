import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hasRateLimitCapacity,
  getRateLimitStatus,
  clearPriceCache,
  fetchMonthlyClosingPrices,
  fetchMultipleMonthlyPrices,
  getDataFreshnessMessage,
} from '../../src/utils/priceApi';
import { PriceFetchResult, YAHOO_DAILY_LIMIT } from '../../src/types/priceApi';

// Mock global fetch
const mockFetch = vi.fn();

describe('Price API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPriceCache();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    clearPriceCache();
    vi.unstubAllGlobals();
  });

  describe('hasRateLimitCapacity', () => {
    it('should return true when no requests have been made', () => {
      expect(hasRateLimitCapacity()).toBe(true);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit info', () => {
      const status = getRateLimitStatus();

      expect(status.dailyLimit).toBe(YAHOO_DAILY_LIMIT);
      expect(status.requestsToday).toBeGreaterThanOrEqual(0);
      expect(status.resetDate).toBeTruthy();
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

    it('should handle no chart result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [],
          },
        }),
      });

      const result = await fetchMonthlyClosingPrices('AAPL', 1);
      expect(result.prices).toHaveLength(0);
      expect(result.error).toBeTruthy();
    });

    it('should handle missing quote data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [{
              timestamp: [1704067200],
              indicators: {},
            }],
          },
        }),
      });

      const result = await fetchMonthlyClosingPrices('AAPL', 1);
      expect(result.prices).toHaveLength(0);
      expect(result.error).toBeTruthy();
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

  describe('getDataFreshnessMessage', () => {
    it('should return error message for failed fetch', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [],
        fetchedAt: new Date().toISOString(),
        error: 'API error',
      };

      expect(getDataFreshnessMessage(result)).toContain('Failed to fetch');
    });

    it('should return no data message for empty prices', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [],
        fetchedAt: new Date().toISOString(),
      };

      expect(getDataFreshnessMessage(result)).toBe('No price data available');
    });

    it('should include date and Yahoo Finance info for successful fetch', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [{
          ticker: 'AAPL',
          date: '2024-01-31',
          open: 150, high: 155, low: 148, close: 152,
        }],
        fetchedAt: new Date().toISOString(),
      };

      const message = getDataFreshnessMessage(result);
      expect(message).toContain('2024-01-31');
      expect(message).toContain('Yahoo Finance');
    });
  });
});
