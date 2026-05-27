import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  describe('fetchAssetMetadata (search endpoint)', () => {
    it('parses sector / industry / exchange / longName for an EQUITY', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'AAPL',
            shortname: 'Apple Inc.',
            longname: 'Apple Inc.',
            quoteType: 'EQUITY',
            exchange: 'NMS',
            exchDisp: 'NASDAQ',
            sector: 'Technology',
            sectorDisp: 'Technology',
            industry: 'Consumer Electronics',
            industryDisp: 'Consumer Electronics',
          },
        ],
      });

      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.error).toBeUndefined();
      expect(meta.ticker).toBe('AAPL');
      expect(meta.quoteType).toBe('EQUITY');
      expect(meta.sector).toBe('Technology');
      expect(meta.industry).toBe('Consumer Electronics');
      expect(meta.exchange).toBe('NASDAQ');
      expect(meta.longName).toBe('Apple Inc.');
      expect(meta.country).toBeUndefined();
    });

    it('derives country code from ISIN for stocks', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'AAPL',
            quoteType: 'EQUITY',
            sector: 'Technology',
            exchDisp: 'NASDAQ',
          },
        ],
      });

      const meta = await fetchAssetMetadata('AAPL', { isin: 'US0378331005' });
      expect(meta.country).toBe('US');
    });

    it('applies ETF heuristics for an ETF', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'VWCE.DE',
            shortname: 'Vanguard FTSE All-World U.ETF R',
            longname: 'Vanguard FTSE All-World UCITS ETF USD Accumulation',
            quoteType: 'ETF',
            exchange: 'GER',
            exchDisp: 'XETRA',
          },
        ],
      });

      const meta = await fetchAssetMetadata('VWCE.DE');
      expect(meta.quoteType).toBe('ETF');
      expect(meta.fundFamily).toBe('Vanguard');
      expect(meta.exchange).toBe('XETRA');
      expect(meta.country).toBe('Global');
      expect(meta.sector).toBe('Global Equity');
      expect(meta.regionWeightings?.[0]).toEqual({ region: 'Global', weight: 1 });
    });

    it('caches successful results and reuses on second call', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'AAPL',
            quoteType: 'EQUITY',
            sector: 'Technology',
            exchDisp: 'NASDAQ',
          },
        ],
      });

      const first = await fetchAssetMetadata('AAPL');
      const second = await fetchAssetMetadata('aapl');
      expect(first.sector).toBe('Technology');
      expect(second.sector).toBe('Technology');
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('layers ISIN-derived country onto cached entries that lacked one', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          { symbol: 'AAPL', quoteType: 'EQUITY', sector: 'Technology' },
        ],
      });

      const first = await fetchAssetMetadata('AAPL');
      expect(first.country).toBeUndefined();

      const second = await fetchAssetMetadata('AAPL', { isin: 'US0378331005' });
      expect(second.country).toBe('US');
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });

    it('prefers exact-symbol match in quotes array', async () => {
      mockedFetch.mockResolvedValueOnce({
        quotes: [
          { symbol: 'AAPL.MX', quoteType: 'EQUITY', sector: 'Wrong' },
          { symbol: 'AAPL', quoteType: 'EQUITY', sector: 'Technology' },
        ],
      });
      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.sector).toBe('Technology');
    });

    it('returns an error when no quotes returned', async () => {
      mockedFetch.mockResolvedValueOnce({ quotes: [] });
      const meta = await fetchAssetMetadata('ZZZZ');
      expect(meta.error).toMatch(/No data/i);
    });

    it('returns an error when rate limited', async () => {
      mockedCapacity.mockReturnValue(false);
      const meta = await fetchAssetMetadata('AAPL');
      expect(meta.error).toMatch(/rate limit/i);
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('returns an error when fetch throws', async () => {
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
    it('passes per-ticker ISIN through for country derivation', async () => {
      mockedFetch.mockResolvedValue({
        quotes: [
          { symbol: 'AAPL', quoteType: 'EQUITY', sector: 'Technology' },
        ],
      });
      const out = await fetchAssetMetadataBatch(
        ['AAPL', 'MSFT'],
        { AAPL: 'US0378331005', MSFT: 'US5949181045' },
      );
      expect(out.AAPL.country).toBe('US');
      expect(out.MSFT.country).toBe('US');
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates tickers', async () => {
      mockedFetch.mockResolvedValue({
        quotes: [{ symbol: 'AAPL', quoteType: 'EQUITY', sector: 'Technology' }],
      });
      const out = await fetchAssetMetadataBatch(['aapl', 'AAPL', '']);
      expect(Object.keys(out)).toEqual(['AAPL']);
    });
  });
});
