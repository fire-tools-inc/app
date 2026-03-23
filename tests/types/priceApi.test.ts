import { describe, it, expect } from 'vitest';
import {
  PROVIDER_DAILY_LIMITS,
  DEFAULT_PROVIDER_ORDER,
  DEFAULT_API_KEY_CONFIG,
} from '../../src/types/priceApi';
import type {
  PriceProvider,
  MonthlyClosingPrice,
  PriceFetchResult,
  ExchangeRateData,
  ExchangeRateFetchResult,
  RateLimitInfo,
  ApiKeyConfig,
  ProviderConfig,
} from '../../src/types/priceApi';

describe('Price API Types', () => {
  describe('PROVIDER_DAILY_LIMITS', () => {
    it('should have limits for all providers', () => {
      expect(PROVIDER_DAILY_LIMITS.yahoo).toBeDefined();
      expect(PROVIDER_DAILY_LIMITS.alphavantage).toBeDefined();
      expect(PROVIDER_DAILY_LIMITS.financialdata).toBeDefined();
    });

    it('should have reasonable limits', () => {
      expect(PROVIDER_DAILY_LIMITS.yahoo).toBeGreaterThan(0);
      expect(PROVIDER_DAILY_LIMITS.alphavantage).toBe(20);
      expect(PROVIDER_DAILY_LIMITS.financialdata).toBe(300);
    });
  });

  describe('DEFAULT_PROVIDER_ORDER', () => {
    it('should list Yahoo Finance first', () => {
      expect(DEFAULT_PROVIDER_ORDER[0]).toBe('yahoo');
    });

    it('should include all providers', () => {
      expect(DEFAULT_PROVIDER_ORDER).toContain('yahoo');
      expect(DEFAULT_PROVIDER_ORDER).toContain('alphavantage');
      expect(DEFAULT_PROVIDER_ORDER).toContain('financialdata');
    });

    it('should have exactly 3 providers', () => {
      expect(DEFAULT_PROVIDER_ORDER).toHaveLength(3);
    });
  });

  describe('DEFAULT_API_KEY_CONFIG', () => {
    it('should have no keys configured by default', () => {
      expect(DEFAULT_API_KEY_CONFIG.alphaVantageKey).toBeUndefined();
      expect(DEFAULT_API_KEY_CONFIG.financialDataKey).toBeUndefined();
    });

    it('should have null lastUpdated', () => {
      expect(DEFAULT_API_KEY_CONFIG.lastUpdated).toBeNull();
    });
  });

  describe('Type compatibility', () => {
    it('should allow creating MonthlyClosingPrice objects', () => {
      const price: MonthlyClosingPrice = {
        ticker: 'AAPL',
        date: '2024-01-31',
        open: 150,
        high: 155,
        low: 148,
        close: 152,
        volume: 1000000,
      };

      expect(price.ticker).toBe('AAPL');
      expect(price.close).toBe(152);
    });

    it('should allow MonthlyClosingPrice without volume', () => {
      const price: MonthlyClosingPrice = {
        ticker: 'BND',
        date: '2024-01-31',
        open: 80,
        high: 82,
        low: 79,
        close: 81,
      };

      expect(price.volume).toBeUndefined();
    });

    it('should allow creating PriceFetchResult objects', () => {
      const result: PriceFetchResult = {
        ticker: 'AAPL',
        prices: [],
        provider: 'yahoo',
        fetchedAt: new Date().toISOString(),
        isDelayed: false,
      };

      expect(result.error).toBeUndefined();
    });

    it('should allow creating ExchangeRateData objects', () => {
      const rate: ExchangeRateData = {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: 0.85,
        date: '2024-01-15',
        provider: 'yahoo',
      };

      expect(rate.rate).toBe(0.85);
    });

    it('should allow creating ExchangeRateFetchResult objects', () => {
      const result: ExchangeRateFetchResult = {
        rates: [],
        fetchedAt: new Date().toISOString(),
        provider: 'alphavantage',
      };

      expect(result.error).toBeUndefined();
    });

    it('should allow creating RateLimitInfo objects', () => {
      const info: RateLimitInfo = {
        provider: 'yahoo',
        requestsToday: 5,
        dailyLimit: 500,
        lastRequestAt: new Date().toISOString(),
        resetDate: '2024-01-15',
      };

      expect(info.requestsToday).toBe(5);
    });

    it('should allow creating ProviderConfig objects', () => {
      const config: ProviderConfig = {
        provider: 'alphavantage',
        apiKey: 'test-key',
        enabled: true,
      };

      expect(config.enabled).toBe(true);
    });

    it('should allow creating ApiKeyConfig objects', () => {
      const config: ApiKeyConfig = {
        alphaVantageKey: 'my-key',
        financialDataKey: 'my-other-key',
        lastUpdated: new Date().toISOString(),
      };

      expect(config.alphaVantageKey).toBe('my-key');
    });

    it('should restrict PriceProvider to valid values', () => {
      const providers: PriceProvider[] = ['yahoo', 'alphavantage', 'financialdata'];
      expect(providers).toHaveLength(3);
    });
  });
});
