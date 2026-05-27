import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock yahooProxy BEFORE importing the module under test so the mock is
// used during evaluation.
vi.mock('../../src/utils/yahooProxy', () => {
  return {
    yahooFetch: vi.fn(),
    hasRateLimitCapacity: vi.fn(() => true),
    YahooRateLimitError: class extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'YahooRateLimitError';
      }
    },
  };
});

import {
  fetchAssetMetadata,
  fetchAssetMetadataBatch,
  clearAssetMetadataCache,
  _internal,
} from '../../src/utils/yahooMetadata';
import { yahooFetch, hasRateLimitCapacity } from '../../src/utils/yahooProxy';

const mockedFetch = vi.mocked(yahooFetch);
const mockedCapacity = vi.mocked(hasRateLimitCapacity);

describe('yahooMetadata', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedCapacity.mockReturnValue(true);
    clearAssetMetadataCache();
  });

  describe('parseSectorWeightings', () => {
    it('normalizes Yahoo sector keys', () => {
      expect(_internal.normalizeSectorName('realestate')).toBe('Real Estate');
      expect(_internal.normalizeSectorName('consumer_cyclical')).toBe('Consumer Cyclical');
      expect(_internal.normalizeSectorName('technology')).toBe('Technology');
    });

    it('parses the array-of-objects shape with raw values', () => {
      const result = _internal.parseSectorWeightings({
        quoteSummary: {
          result: [
            {
              topHoldings: {
                sectorWeightings: [
                  { technology: { raw: 0.3 } },
                  { healthcare: { raw: 0.2 } },
                  { financial_services: { raw: 0.5 } },
                ],
              },
            },
          ],
        },
      });
      expect(result).toHaveLength(3);
      expect(result?.find(s => s.sector === 'Technology')?.weight).toBeCloseTo(0.3);
    });

    it('returns undefined when no weightings are present', () => {
      expect(_internal.parseSectorWeightings({})).toBeUndefined();
    });
  });

  describe('fetchAssetMetadata', () => {
    it('returns parsed metadata on success and caches it', async () => {
      mockedFetch.mockResolvedValueOnce({
        quoteSummary: {
          result: [
            {
              summaryProfile: {
                sector: 'Technology',
                industry: 'Consumer Electronics',
                country: 'United States',
              },
              fundProfile: { family: 'Apple Inc' },
              topHoldings: { sectorWeightings: [] },
              quoteType: {
                quoteType: 'EQUITY',
                longName: 'Apple Inc.',
                exchange: 'NMS',
                currency: 'USD',
              },
            },
          ],
        },
      });

      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.error).toBeUndefined();
      expect(meta.ticker).toBe('AAPL');
      expect(meta.sector).toBe('Technology');
      expect(meta.country).toBe('United States');
      expect(meta.exchange).toBe('NMS');
      expect(meta.fundFamily).toBe('Apple Inc');

      // Second call should hit the cache and not call yahooFetch again
      const meta2 = await fetchAssetMetadata('aapl');
      expect(meta2.sector).toBe('Technology');
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('returns an error object when rate limited', async () => {
      mockedCapacity.mockReturnValue(false);
      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.error).toMatch(/rate limit/i);
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns an error object when Yahoo returns an error description', async () => {
      mockedFetch.mockResolvedValueOnce({
        quoteSummary: { error: { description: 'Quote not found' } },
      });
      const meta = await fetchAssetMetadata('NOPE');
      expect(meta.error).toMatch(/Quote not found/);
    });

    it('returns an error object when fetch throws', async () => {
      mockedFetch.mockRejectedValueOnce(new Error('network kaboom'));
      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.error).toBe('network kaboom');
    });

    it('handles empty ticker without calling fetch', async () => {
      const meta = await fetchAssetMetadata('   ');
      expect(meta.error).toBe('Empty ticker');
      expect(mockedFetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchAssetMetadataBatch', () => {
    it('fetches unique tickers and returns a keyed map', async () => {
      mockedFetch.mockResolvedValue({
        quoteSummary: {
          result: [
            {
              summaryProfile: { sector: 'Technology' },
              quoteType: { quoteType: 'EQUITY' },
            },
          ],
        },
      });

      const out = await fetchAssetMetadataBatch(['aapl', 'AAPL', '', 'msft']);
      expect(Object.keys(out).sort()).toEqual(['AAPL', 'MSFT']);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });
  });
});
