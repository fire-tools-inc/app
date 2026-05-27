import { describe, it, expect } from 'vitest';
import {
  computeBreakdown,
  computeAllBreakdowns,
  uniqueTickers,
  selectActiveAssets,
  activePortfolioValue,
} from '../../src/utils/portfolioBreakdownCalculator';
import { Asset } from '../../src/types/assetAllocation';
import { AssetMetadata } from '../../src/types/portfolioBreakdown';

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'a-' + Math.random().toString(36).slice(2),
    name: 'Test Asset',
    ticker: 'TEST',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 1000,
    targetMode: 'PERCENTAGE',
    targetPercent: 100,
    ...overrides,
  };
}

function makeMeta(overrides: Partial<AssetMetadata> & { ticker: string }): AssetMetadata {
  return {
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('portfolioBreakdownCalculator', () => {
  describe('selectActiveAssets / activePortfolioValue', () => {
    it('excludes OFF and zero-value assets', () => {
      const assets = [
        makeAsset({ id: '1', currentValue: 1000 }),
        makeAsset({ id: '2', currentValue: 0 }),
        makeAsset({ id: '3', currentValue: 500, targetMode: 'OFF' }),
        makeAsset({ id: '4', currentValue: 2000 }),
      ];
      expect(selectActiveAssets(assets)).toHaveLength(2);
      expect(activePortfolioValue(assets)).toBe(3000);
    });
  });

  describe('uniqueTickers', () => {
    it('returns deduplicated uppercase tickers, ignoring empty', () => {
      const assets = [
        makeAsset({ id: '1', ticker: 'vti' }),
        makeAsset({ id: '2', ticker: 'VTI' }),
        makeAsset({ id: '3', ticker: '' }),
        makeAsset({ id: '4', ticker: 'spy', currentValue: 500 }),
      ];
      expect(uniqueTickers(assets).sort()).toEqual(['SPY', 'VTI']);
    });
  });

  describe('byCurrency', () => {
    it('groups by originalCurrency, defaulting to EUR', () => {
      const assets = [
        makeAsset({ id: '1', currentValue: 1000, originalCurrency: 'USD' }),
        makeAsset({ id: '2', currentValue: 2000, originalCurrency: 'USD' }),
        makeAsset({ id: '3', currentValue: 1500, originalCurrency: 'EUR' }),
        makeAsset({ id: '4', currentValue: 500 }), // missing -> EUR
      ];
      const result = computeBreakdown({ assets, metadataByTicker: {}, dimension: 'currency' });
      const usd = result.entries.find(e => e.label === 'USD');
      const eur = result.entries.find(e => e.label === 'EUR');
      expect(usd?.value).toBe(3000);
      expect(eur?.value).toBe(2000);
      expect(result.totalValue).toBe(5000);
    });
  });

  describe('byHolding', () => {
    it('one entry per asset, sorted by value desc', () => {
      const assets = [
        makeAsset({ id: '1', name: 'Vanguard S&P 500', currentValue: 5000 }),
        makeAsset({ id: '2', name: 'Apple', currentValue: 1000 }),
        makeAsset({ id: '3', name: 'Tesla', currentValue: 3000 }),
      ];
      const result = computeBreakdown({ assets, metadataByTicker: {}, dimension: 'holding' });
      expect(result.entries.map(e => e.label)).toEqual(['Vanguard S&P 500', 'Tesla', 'Apple']);
    });
  });

  describe('bySector', () => {
    it('expands ETF sector weightings proportionally to asset value', () => {
      const assets = [
        makeAsset({ id: '1', ticker: 'VTI', currentValue: 1000 }),
      ];
      const metadata: Record<string, AssetMetadata> = {
        VTI: makeMeta({
          ticker: 'VTI',
          sectorWeightings: [
            { sector: 'Technology', weight: 0.3 },
            { sector: 'Healthcare', weight: 0.2 },
            { sector: 'Financial Services', weight: 0.5 },
          ],
        }),
      };
      const result = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'sector' });
      const tech = result.entries.find(e => e.label === 'Technology');
      const fin = result.entries.find(e => e.label === 'Financial Services');
      expect(tech?.value).toBeCloseTo(300);
      expect(fin?.value).toBeCloseTo(500);
      // Total should equal the source asset value
      expect(result.entries.reduce((s, e) => s + e.value, 0)).toBeCloseTo(1000);
    });

    it('uses stock sector when no sectorWeightings available', () => {
      const assets = [makeAsset({ id: '1', ticker: 'AAPL', currentValue: 500 })];
      const metadata = {
        AAPL: makeMeta({ ticker: 'AAPL', sector: 'Technology' }),
      };
      const result = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'sector' });
      expect(result.entries[0].label).toBe('Technology');
      expect(result.entries[0].value).toBe(500);
    });

    it('falls back to asset class label for non-ticker assets', () => {
      const assets = [
        makeAsset({
          id: '1',
          ticker: '',
          name: 'Apartment',
          assetClass: 'REAL_ESTATE',
          subAssetType: 'PROPERTY',
          currentValue: 250_000,
        }),
        makeAsset({
          id: '2',
          ticker: '',
          name: 'Checking',
          assetClass: 'CASH',
          subAssetType: 'CHECKING_ACCOUNT',
          currentValue: 5_000,
        }),
      ];
      const result = computeBreakdown({ assets, metadataByTicker: {}, dimension: 'sector' });
      const labels = result.entries.map(e => e.label).sort();
      expect(labels).toContain('Cash');
      expect(labels).toContain('Real Estate');
    });
  });

  describe('byContinent / byRegion', () => {
    it('derives continent from metadata.country', () => {
      const assets = [
        makeAsset({ id: '1', ticker: 'AAPL', currentValue: 1000 }),
        makeAsset({ id: '2', ticker: 'TSM', currentValue: 500 }),
        makeAsset({ id: '3', ticker: 'SAP.DE', currentValue: 2000 }),
      ];
      const metadata: Record<string, AssetMetadata> = {
        AAPL: makeMeta({ ticker: 'AAPL', country: 'United States' }),
        TSM: makeMeta({ ticker: 'TSM', country: 'Taiwan' }),
        'SAP.DE': makeMeta({ ticker: 'SAP.DE', country: 'Germany' }),
      };
      const continent = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'continent' });
      const continentLabels = continent.entries.map(e => e.label).sort();
      expect(continentLabels).toEqual(['Asia', 'Europe', 'North America']);

      const region = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'region' });
      const regionLabels = region.entries.map(e => e.label).sort();
      expect(regionLabels).toEqual(['East Asia', 'North America', 'Western Europe']);
    });

    it('falls back to asset class label when country unknown', () => {
      const assets = [makeAsset({ id: '1', ticker: 'XYZ', currentValue: 1000 })];
      const metadata = { XYZ: makeMeta({ ticker: 'XYZ' }) };
      const result = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'continent' });
      expect(result.entries[0].label).toBe('Stocks');
    });
  });

  describe('byMarket', () => {
    it('groups by exchange name', () => {
      const assets = [
        makeAsset({ id: '1', ticker: 'AAPL', currentValue: 1000 }),
        makeAsset({ id: '2', ticker: 'MSFT', currentValue: 500 }),
        makeAsset({ id: '3', ticker: 'VOD.L', currentValue: 800 }),
      ];
      const metadata = {
        AAPL: makeMeta({ ticker: 'AAPL', exchange: 'NASDAQ' }),
        MSFT: makeMeta({ ticker: 'MSFT', exchange: 'NASDAQ' }),
        'VOD.L': makeMeta({ ticker: 'VOD.L', exchange: 'LSE' }),
      };
      const result = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'market' });
      const nasdaq = result.entries.find(e => e.label === 'NASDAQ');
      expect(nasdaq?.value).toBe(1500);
    });
  });

  describe('byEtfProvider', () => {
    it('groups by fundFamily, labels stocks as Direct holding', () => {
      const assets = [
        makeAsset({ id: '1', ticker: 'VTI', currentValue: 1000 }),
        makeAsset({ id: '2', ticker: 'VOO', currentValue: 500 }),
        makeAsset({ id: '3', ticker: 'IVV', currentValue: 700 }),
        makeAsset({ id: '4', ticker: 'AAPL', currentValue: 300 }),
      ];
      const metadata: Record<string, AssetMetadata> = {
        VTI: makeMeta({ ticker: 'VTI', fundFamily: 'Vanguard', quoteType: 'ETF' }),
        VOO: makeMeta({ ticker: 'VOO', fundFamily: 'Vanguard', quoteType: 'ETF' }),
        IVV: makeMeta({ ticker: 'IVV', fundFamily: 'iShares', quoteType: 'ETF' }),
        AAPL: makeMeta({ ticker: 'AAPL', quoteType: 'EQUITY' }),
      };
      const result = computeBreakdown({ assets, metadataByTicker: metadata, dimension: 'etfProvider' });
      const vanguard = result.entries.find(e => e.label === 'Vanguard');
      const ishares = result.entries.find(e => e.label === 'iShares');
      const direct = result.entries.find(e => e.label === 'Direct holding');
      expect(vanguard?.value).toBe(1500);
      expect(ishares?.value).toBe(700);
      expect(direct?.value).toBe(300);
    });
  });

  describe('computeAllBreakdowns', () => {
    it('produces a result for every dimension', () => {
      const assets = [makeAsset({ id: '1', ticker: 'AAPL', currentValue: 1000 })];
      const metadata = { AAPL: makeMeta({ ticker: 'AAPL', sector: 'Technology', country: 'United States', exchange: 'NASDAQ' }) };
      const all = computeAllBreakdowns(assets, metadata);
      expect(Object.keys(all).sort()).toEqual([
        'continent',
        'currency',
        'etfProvider',
        'holding',
        'market',
        'region',
        'sector',
      ]);
    });

    it('handles empty portfolio gracefully', () => {
      const all = computeAllBreakdowns([], {});
      for (const result of Object.values(all)) {
        expect(result.entries).toHaveLength(0);
        expect(result.totalValue).toBe(0);
      }
    });
  });

  describe('color stability', () => {
    it('reuses asset-class palette for etfProvider when label matches an asset class', () => {
      const assets = [
        makeAsset({
          id: '1',
          ticker: '',
          name: 'Apartment',
          assetClass: 'REAL_ESTATE',
          subAssetType: 'PROPERTY',
          currentValue: 100_000,
        }),
      ];
      const result = computeBreakdown({ assets, metadataByTicker: {}, dimension: 'etfProvider' });
      // 'Real Estate' bucket should use the canonical REAL_ESTATE palette color
      expect(result.entries[0].label).toBe('Real Estate');
      expect(result.entries[0].color).toBe('#9C27B0');
    });
  });
});
