import { describe, it, expect } from 'vitest';
import {
  calculateTotalValue,
  groupAssetsByClass,
  calculateAssetClassSummaries,
  determineAction,
  calculateAllocationDeltas,
  validateAllocation,
  calculatePortfolioAllocation,
  prepareAssetClassChartData,
  prepareAssetChartData,
  formatCurrency,
  formatPercent,
  exportToCSV,
  importFromCSV,
  formatAssetName,
} from '../../../src/utils/allocationCalculator';
import {
  Asset,
  AssetClass,
  AllocationMode,
  AssetClassSummary,
} from '../../../src/types/assetAllocation';
import { CHART_PALETTE } from '../../../src/utils/chartColors';

// Helper to create test assets
function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'test-asset-1',
    name: 'Test Asset',
    ticker: 'TEST',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 10000,
    targetMode: 'PERCENTAGE',
    targetPercent: 100,
    ...overrides,
  };
}

describe('allocationCalculator', () => {
  describe('calculateTotalValue', () => {
    it('should return 0 for empty array', () => {
      const result = calculateTotalValue([]);
      expect(result).toBe(0);
    });

    it('should calculate total value of assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 10000 }),
        createAsset({ id: '2', currentValue: 5000 }),
        createAsset({ id: '3', currentValue: 3000 }),
      ];
      const result = calculateTotalValue(assets);
      expect(result).toBe(18000);
    });

    it('should exclude assets with OFF target mode', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 10000, targetMode: 'PERCENTAGE' }),
        createAsset({ id: '2', currentValue: 5000, targetMode: 'OFF' }),
        createAsset({ id: '3', currentValue: 3000, targetMode: 'SET', targetValue: 3000 }),
      ];
      const result = calculateTotalValue(assets);
      expect(result).toBe(13000);
    });

    it('should handle single asset', () => {
      const assets: Asset[] = [createAsset({ currentValue: 25000 })];
      const result = calculateTotalValue(assets);
      expect(result).toBe(25000);
    });

    it('should handle zero values', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 0 }),
        createAsset({ id: '2', currentValue: 0 }),
      ];
      const result = calculateTotalValue(assets);
      expect(result).toBe(0);
    });
  });

  describe('groupAssetsByClass', () => {
    it('should return empty map for empty array', () => {
      const result = groupAssetsByClass([]);
      expect(result.size).toBe(0);
    });

    it('should group assets by their asset class', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS' }),
        createAsset({ id: '2', assetClass: 'BONDS' }),
        createAsset({ id: '3', assetClass: 'STOCKS' }),
        createAsset({ id: '4', assetClass: 'CASH' }),
      ];
      const result = groupAssetsByClass(assets);

      expect(result.size).toBe(3);
      expect(result.get('STOCKS')?.length).toBe(2);
      expect(result.get('BONDS')?.length).toBe(1);
      expect(result.get('CASH')?.length).toBe(1);
    });

    it('should handle single asset class', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS' }),
        createAsset({ id: '2', assetClass: 'STOCKS' }),
      ];
      const result = groupAssetsByClass(assets);

      expect(result.size).toBe(1);
      expect(result.get('STOCKS')?.length).toBe(2);
    });

    it('should handle all asset classes', () => {
      const assetClasses: AssetClass[] = ['STOCKS', 'BONDS', 'CASH', 'CRYPTO', 'REAL_ESTATE'];
      const assets: Asset[] = assetClasses.map((ac, i) =>
        createAsset({ id: String(i), assetClass: ac })
      );
      const result = groupAssetsByClass(assets);

      expect(result.size).toBe(5);
      assetClasses.forEach(ac => {
        expect(result.get(ac)?.length).toBe(1);
      });
    });
  });

  describe('determineAction', () => {
    it('should return EXCLUDED for OFF target mode', () => {
      const result = determineAction('STOCKS', 1000, 'OFF');
      expect(result).toBe('EXCLUDED');
    });

    it('should return HOLD for delta below threshold', () => {
      const result = determineAction('STOCKS', 50, 'PERCENTAGE');
      expect(result).toBe('HOLD');
    });

    it('should return HOLD for negative delta below threshold', () => {
      const result = determineAction('STOCKS', -50, 'PERCENTAGE');
      expect(result).toBe('HOLD');
    });

    it('should return BUY for positive delta above threshold for non-cash', () => {
      const result = determineAction('STOCKS', 500, 'PERCENTAGE');
      expect(result).toBe('BUY');
    });

    it('should return SELL for negative delta above threshold for non-cash', () => {
      const result = determineAction('BONDS', -500, 'PERCENTAGE');
      expect(result).toBe('SELL');
    });

    it('should return SAVE for positive delta above threshold for cash', () => {
      const result = determineAction('CASH', 500, 'SET');
      expect(result).toBe('SAVE');
    });

    it('should return INVEST for negative delta above threshold for cash', () => {
      const result = determineAction('CASH', -500, 'SET');
      expect(result).toBe('INVEST');
    });

    it('should use ACTION_THRESHOLD (100) as threshold for triggering actions', () => {
      // ACTION_THRESHOLD is defined as 100 in allocationCalculator.ts
      // Values below the threshold (Math.abs(delta) < 100) should result in HOLD
      expect(determineAction('STOCKS', 99, 'PERCENTAGE')).toBe('HOLD');
      expect(determineAction('STOCKS', -99, 'PERCENTAGE')).toBe('HOLD');
      
      // Values at or above the threshold should trigger BUY/SELL actions
      expect(determineAction('STOCKS', 101, 'PERCENTAGE')).toBe('BUY');
      expect(determineAction('STOCKS', -101, 'PERCENTAGE')).toBe('SELL');
    });
  });

  describe('calculateAssetClassSummaries', () => {
    it('should calculate summaries for single asset class', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 10000, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const result = calculateAssetClassSummaries(assets, 10000);

      expect(result.length).toBe(1);
      expect(result[0].assetClass).toBe('STOCKS');
      expect(result[0].currentTotal).toBe(10000);
      expect(result[0].currentPercent).toBe(100);
    });

    it('should handle multiple asset classes', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
        createAsset({ id: '2', currentValue: 4000, assetClass: 'BONDS', targetPercent: 100 }),
      ];
      const result = calculateAssetClassSummaries(assets, 10000);

      expect(result.length).toBe(2);
      
      const stocks = result.find(r => r.assetClass === 'STOCKS');
      const bonds = result.find(r => r.assetClass === 'BONDS');
      
      expect(stocks?.currentTotal).toBe(6000);
      expect(stocks?.currentPercent).toBe(60);
      expect(bonds?.currentTotal).toBe(4000);
      expect(bonds?.currentPercent).toBe(40);
    });

    it('should exclude OFF assets from totals', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 10000, assetClass: 'STOCKS', targetMode: 'PERCENTAGE', targetPercent: 100 }),
        createAsset({ id: '2', currentValue: 5000, assetClass: 'STOCKS', targetMode: 'OFF' }),
      ];
      const result = calculateAssetClassSummaries(assets, 10000);

      expect(result.length).toBe(1);
      expect(result[0].currentTotal).toBe(10000);
    });

    it('should handle SET mode targets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 5000, assetClass: 'CASH', targetMode: 'SET', targetValue: 5000 }),
      ];
      const result = calculateAssetClassSummaries(assets, 5000);

      expect(result[0].targetMode).toBe('SET');
      expect(result[0].targetTotal).toBe(5000);
    });

    it('should use assetClassTargets when provided', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
        createAsset({ id: '2', currentValue: 4000, assetClass: 'BONDS', targetPercent: 100 }),
      ];
      const assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
        STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 70 },
        BONDS: { targetMode: 'PERCENTAGE', targetPercent: 30 },
        CASH: { targetMode: 'SET' },
        CRYPTO: { targetMode: 'OFF' },
        REAL_ESTATE: { targetMode: 'OFF' },
      };
      const result = calculateAssetClassSummaries(assets, 10000, undefined, assetClassTargets);

      const stocks = result.find(r => r.assetClass === 'STOCKS');
      expect(stocks?.targetPercent).toBe(70);
      expect(stocks?.targetTotal).toBe(7000);
    });

    it('should handle zero total value', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 0, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const result = calculateAssetClassSummaries(assets, 0);

      expect(result.length).toBe(1);
      expect(result[0].currentPercent).toBe(0);
    });

    it('should mark all OFF class as OFF', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 1000, assetClass: 'CRYPTO', targetMode: 'OFF' }),
        createAsset({ id: '2', currentValue: 500, assetClass: 'CRYPTO', targetMode: 'OFF' }),
      ];
      const result = calculateAssetClassSummaries(assets, 1500);

      expect(result[0].targetMode).toBe('OFF');
      expect(result[0].action).toBe('EXCLUDED');
    });
  });

  describe('calculateAllocationDeltas', () => {
    it('should calculate deltas for assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
        STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 100 },
        BONDS: { targetMode: 'OFF' },
        CASH: { targetMode: 'OFF' },
        CRYPTO: { targetMode: 'OFF' },
        REAL_ESTATE: { targetMode: 'OFF' },
      };
      const result = calculateAllocationDeltas(assets, 10000, assetClassTargets);

      expect(result.length).toBe(1);
      expect(result[0].assetId).toBe('1');
      expect(result[0].currentValue).toBe(6000);
    });

    it('should handle OFF mode assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 5000, targetMode: 'OFF' }),
      ];
      const result = calculateAllocationDeltas(assets, 10000);

      expect(result.length).toBe(1);
      expect(result[0].action).toBe('EXCLUDED');
      expect(result[0].delta).toBe(0);
      expect(result[0].targetValue).toBe(0);
    });

    it('should handle SET mode assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 3000, assetClass: 'CASH', targetMode: 'SET', targetValue: 5000 }),
      ];
      const result = calculateAllocationDeltas(assets, 10000);

      expect(result.length).toBe(1);
      expect(result[0].targetValue).toBe(5000);
      expect(result[0].delta).toBe(2000);
    });

    it('should calculate percentage within class correctly', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 60 }),
        createAsset({ id: '2', currentValue: 4000, assetClass: 'STOCKS', targetPercent: 40 }),
      ];
      const assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
        STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 100 },
        BONDS: { targetMode: 'OFF' },
        CASH: { targetMode: 'OFF' },
        CRYPTO: { targetMode: 'OFF' },
        REAL_ESTATE: { targetMode: 'OFF' },
      };
      const result = calculateAllocationDeltas(assets, 10000, assetClassTargets);

      const asset1Delta = result.find(r => r.assetId === '1');
      const asset2Delta = result.find(r => r.assetId === '2');

      expect(asset1Delta?.currentPercentInClass).toBe(60);
      expect(asset2Delta?.currentPercentInClass).toBe(40);
    });

    it('should handle cash delta adjustment', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 5000, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
        STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 100 },
        BONDS: { targetMode: 'OFF' },
        CASH: { targetMode: 'SET' },
        CRYPTO: { targetMode: 'OFF' },
        REAL_ESTATE: { targetMode: 'OFF' },
      };
      // Negative cash delta means INVEST, add to other classes
      const result = calculateAllocationDeltas(assets, 10000, assetClassTargets, -1000, 10000);

      // The target value should be adjusted
      expect(result.length).toBe(1);
    });
  });

  describe('validateAllocation', () => {
    it('should return valid for empty array', () => {
      const result = validateAllocation([]);
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should return valid when percentages sum to 100 per class', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS', targetPercent: 60, currentValue: 6000 }),
        createAsset({ id: '2', assetClass: 'STOCKS', targetPercent: 40, currentValue: 4000 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(true);
    });

    it('should return error when percentages do not sum to 100', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS', targetPercent: 60, currentValue: 6000 }),
        createAsset({ id: '2', assetClass: 'STOCKS', targetPercent: 30, currentValue: 3000 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('STOCKS');
      expect(result.errors[0]).toContain('100%');
    });

    it('should detect negative current value', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: -1000, targetPercent: 100 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('negative value'))).toBe(true);
    });

    it('should detect negative target percentage', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 1000, targetPercent: -10 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('negative target percentage'))).toBe(true);
    });

    it('should detect negative target value in SET mode', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 1000, targetMode: 'SET', targetValue: -500 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('negative target value'))).toBe(true);
    });

    it('should allow small floating point tolerance (0.1% deviation from 100%)', () => {
      // validateAllocation allows tolerance of 0.1% for floating point errors
      // Math.abs(totalPercent - 100) > 0.1 triggers an error
      // 99.95 is within the 0.1% tolerance (100 - 99.95 = 0.05, which is < 0.1)
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS', targetPercent: 99.95, currentValue: 10000 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(true);
    });

    it('should validate multiple asset classes independently', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', assetClass: 'STOCKS', targetPercent: 100, currentValue: 5000 }),
        createAsset({ id: '2', assetClass: 'BONDS', targetPercent: 100, currentValue: 5000 }),
      ];
      const result = validateAllocation(assets);
      expect(result.isValid).toBe(true);
    });
  });

  describe('calculatePortfolioAllocation', () => {
    it('should calculate complete portfolio allocation', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
        createAsset({ id: '2', currentValue: 4000, assetClass: 'BONDS', targetPercent: 100 }),
      ];
      const result = calculatePortfolioAllocation(assets);

      expect(result.totalValue).toBe(10000);
      expect(result.totalHoldings).toBe(10000);
      expect(result.assets.length).toBe(2);
      expect(result.assetClasses.length).toBe(2);
      expect(result.deltas.length).toBe(2);
      expect(result.isValid).toBe(true);
    });

    it('should use provided portfolio value', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const result = calculatePortfolioAllocation(assets, undefined, 10000);

      expect(result.totalValue).toBe(10000);
    });

    it('should include validation errors', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: -1000, targetPercent: 100 }),
      ];
      const result = calculatePortfolioAllocation(assets);

      expect(result.isValid).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should handle assetClassTargets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
      ];
      const assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }> = {
        STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 60 },
        BONDS: { targetMode: 'PERCENTAGE', targetPercent: 40 },
        CASH: { targetMode: 'SET' },
        CRYPTO: { targetMode: 'OFF' },
        REAL_ESTATE: { targetMode: 'OFF' },
      };
      const result = calculatePortfolioAllocation(assets, assetClassTargets, 10000);

      const stocksSummary = result.assetClasses.find(ac => ac.assetClass === 'STOCKS');
      expect(stocksSummary?.targetPercent).toBe(60);
    });
  });

  describe('prepareAssetClassChartData', () => {
    it('should return empty array for empty input', () => {
      const result = prepareAssetClassChartData([]);
      expect(result).toEqual([]);
    });

    it('should prepare chart data for asset classes', () => {
      const summaries: AssetClassSummary[] = [
        {
          assetClass: 'STOCKS',
          assets: [],
          currentTotal: 6000,
          currentPercent: 60,
          targetMode: 'PERCENTAGE',
          targetPercent: 60,
          targetTotal: 6000,
          delta: 0,
          action: 'HOLD',
        },
        {
          assetClass: 'BONDS',
          assets: [],
          currentTotal: 4000,
          currentPercent: 40,
          targetMode: 'PERCENTAGE',
          targetPercent: 40,
          targetTotal: 4000,
          delta: 0,
          action: 'HOLD',
        },
      ];
      const result = prepareAssetClassChartData(summaries);

      expect(result.length).toBe(2);
      expect(result[0].name).toBe('STOCKS');
      expect(result[0].value).toBe(6000);
      expect(result[0].percentage).toBe(60);
      expect(result[0].color).toBeDefined();
    });

    it('should exclude OFF assets', () => {
      const summaries: AssetClassSummary[] = [
        {
          assetClass: 'STOCKS',
          assets: [],
          currentTotal: 6000,
          currentPercent: 60,
          targetMode: 'OFF',
          delta: 0,
          action: 'EXCLUDED',
        },
      ];
      const result = prepareAssetClassChartData(summaries);
      expect(result.length).toBe(0);
    });

    it('should exclude zero value assets', () => {
      const summaries: AssetClassSummary[] = [
        {
          assetClass: 'STOCKS',
          assets: [],
          currentTotal: 0,
          currentPercent: 0,
          targetMode: 'PERCENTAGE',
          targetPercent: 60,
          targetTotal: 6000,
          delta: 6000,
          action: 'BUY',
        },
      ];
      const result = prepareAssetClassChartData(summaries);
      expect(result.length).toBe(0);
    });

    it('should assign correct colors to asset classes', () => {
      const summaries: AssetClassSummary[] = [
        {
          assetClass: 'STOCKS',
          assets: [],
          currentTotal: 1000,
          currentPercent: 20,
          targetMode: 'PERCENTAGE',
          delta: 0,
          action: 'HOLD',
        },
        {
          assetClass: 'BONDS',
          assets: [],
          currentTotal: 1000,
          currentPercent: 20,
          targetMode: 'PERCENTAGE',
          delta: 0,
          action: 'HOLD',
        },
        {
          assetClass: 'CASH',
          assets: [],
          currentTotal: 1000,
          currentPercent: 20,
          targetMode: 'SET',
          delta: 0,
          action: 'HOLD',
        },
        {
          assetClass: 'CRYPTO',
          assets: [],
          currentTotal: 1000,
          currentPercent: 20,
          targetMode: 'PERCENTAGE',
          delta: 0,
          action: 'HOLD',
        },
        {
          assetClass: 'REAL_ESTATE',
          assets: [],
          currentTotal: 1000,
          currentPercent: 20,
          targetMode: 'PERCENTAGE',
          delta: 0,
          action: 'HOLD',
        },
      ];
      const result = prepareAssetClassChartData(summaries);

      expect(result.length).toBe(5);
      // Each class should have a unique color
      const colors = result.map(r => r.color);
      expect(new Set(colors).size).toBe(5);
    });
  });

  describe('prepareAssetChartData', () => {
    it('should return empty array for empty input', () => {
      const result = prepareAssetChartData([], 10000);
      expect(result).toEqual([]);
    });

    it('should prepare chart data for assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', name: 'VTI', ticker: 'VTI', currentValue: 6000 }),
        createAsset({ id: '2', name: 'VOO', ticker: 'VOO', currentValue: 4000 }),
      ];
      const result = prepareAssetChartData(assets, 10000);

      expect(result.length).toBe(2);
      expect(result[0].name).toBe('VTI');
      expect(result[0].value).toBe(6000);
      expect(result[0].percentage).toBe(60);
      expect(result[0].ticker).toBe('VTI');
    });

    it('should exclude OFF assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 6000, targetMode: 'PERCENTAGE' }),
        createAsset({ id: '2', currentValue: 4000, targetMode: 'OFF' }),
      ];
      const result = prepareAssetChartData(assets, 10000);
      expect(result.length).toBe(1);
    });

    it('should exclude zero value assets', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 0 }),
      ];
      const result = prepareAssetChartData(assets, 10000);
      expect(result.length).toBe(0);
    });

    it('should handle zero class total', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', currentValue: 0 }),
      ];
      const result = prepareAssetChartData(assets, 0);
      expect(result.length).toBe(0);
    });

    it('should use the shared readable palette for asset colors', () => {
      const assets: Asset[] = [
        createAsset({ id: '1', name: 'Asset1', currentValue: 1000 }),
        createAsset({ id: '2', name: 'Asset2', currentValue: 1000 }),
        createAsset({ id: '3', name: 'Asset3', currentValue: 1000 }),
      ];
      const result = prepareAssetChartData(assets, 3000);

      expect(result.length).toBe(3);
      result.forEach((r, index) => {
        expect(r.color).toBe(CHART_PALETTE[index]);
      });
      // Colors should be different
      const colors = result.map(r => r.color);
      expect(new Set(colors).size).toBe(3);
    });
  });

  describe('formatCurrency', () => {
    it('should format currency values', () => {
      const result = formatCurrency(1234.56);
      // Should return a formatted string (exact format depends on implementation)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle zero', () => {
      const result = formatCurrency(0);
      expect(typeof result).toBe('string');
    });

    it('should handle negative values', () => {
      const result = formatCurrency(-1000);
      expect(typeof result).toBe('string');
    });

    it('should accept currency parameter', () => {
      const result = formatCurrency(1000, 'USD');
      expect(typeof result).toBe('string');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage values', () => {
      const result = formatPercent(50);
      expect(typeof result).toBe('string');
      expect(result).toContain('50');
    });

    it('should handle zero', () => {
      const result = formatPercent(0);
      expect(typeof result).toBe('string');
    });

    it('should handle negative values', () => {
      const result = formatPercent(-10);
      expect(typeof result).toBe('string');
    });

    it('should handle decimal values', () => {
      const result = formatPercent(33.33);
      expect(typeof result).toBe('string');
    });
  });

  describe('exportToCSV', () => {
    it('should export portfolio to CSV format', () => {
      const allocation = calculatePortfolioAllocation([
        createAsset({ id: '1', name: 'VTI', ticker: 'VTI', currentValue: 6000, assetClass: 'STOCKS', targetPercent: 100 }),
      ]);
      const csv = exportToCSV(allocation);

      expect(typeof csv).toBe('string');
      expect(csv).toContain('Asset / Index');
      expect(csv).toContain('VTI');
      expect(csv).toContain('STOCKS');
    });

    it('should include all required headers', () => {
      const allocation = calculatePortfolioAllocation([
        createAsset({ id: '1', currentValue: 1000 }),
      ]);
      const csv = exportToCSV(allocation);
      const headers = csv.split('\n')[0];

      expect(headers).toContain('Asset / Index');
      expect(headers).toContain('Ticker(s)');
      expect(headers).toContain('Asset Class');
      expect(headers).toContain('% Target');
      expect(headers).toContain('% Current');
      expect(headers).toContain('Absolute Current');
      expect(headers).toContain('Absolute Target');
      expect(headers).toContain('Delta');
      expect(headers).toContain('Action');
      expect(headers).toContain('Notes');
    });

    it('should handle SET mode targets', () => {
      const allocation = calculatePortfolioAllocation([
        createAsset({ id: '1', name: 'Cash', currentValue: 5000, targetMode: 'SET', targetValue: 5000 }),
      ]);
      const csv = exportToCSV(allocation);
      expect(csv).toContain('SET');
    });

    it('should handle OFF mode targets', () => {
      const allocation = calculatePortfolioAllocation([
        createAsset({ id: '1', name: 'Excluded', currentValue: 1000, targetMode: 'OFF' }),
      ]);
      const csv = exportToCSV(allocation);
      expect(csv).toContain('OFF');
    });
  });

  describe('importFromCSV', () => {
    it('should import assets from valid CSV', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class,% Target,% Current,Absolute Current,Absolute Target,Delta,Action,Notes
VTI,VTI,STOCKS,60%,60%,6000,6000,0,HOLD,
BND,BND,BONDS,40%,40%,4000,4000,0,HOLD,`;

      const result = importFromCSV(csv);

      expect(result.length).toBe(2);
      expect(result[0].name).toBe('VTI');
      expect(result[0].ticker).toBe('VTI');
      expect(result[0].assetClass).toBe('STOCKS');
      expect(result[0].targetPercent).toBe(60);
      expect(result[0].currentValue).toBe(6000);
    });

    it('should return empty array for header only', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class,% Target,% Current,Absolute Current`;
      const result = importFromCSV(csv);
      expect(result.length).toBe(0);
    });

    it('should return empty array for empty CSV', () => {
      const csv = '';
      const result = importFromCSV(csv);
      expect(result.length).toBe(0);
    });

    it('should handle SET mode', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class,% Target,% Current,Absolute Current,Absolute Target,Delta,Action,Notes
Cash,CASH,CASH,SET,100%,5000,5000,0,HOLD,`;

      const result = importFromCSV(csv);

      expect(result[0].targetMode).toBe('SET');
      expect(result[0].targetValue).toBe(5000);
    });

    it('should handle OFF mode', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class,% Target,% Current,Absolute Current,Absolute Target,Delta,Action,Notes
Excluded,EXCL,STOCKS,OFF,0%,1000,0,0,EXCLUDED,`;

      const result = importFromCSV(csv);

      expect(result[0].targetMode).toBe('OFF');
    });

    it('should throw error for invalid CSV format', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class
Invalid,Row`;

      expect(() => importFromCSV(csv)).toThrow('Invalid CSV format');
    });

    it('should generate unique IDs for imported assets', () => {
      const csv = `Asset / Index,Ticker(s),Asset Class,% Target,% Current,Absolute Current,Absolute Target,Delta,Action,Notes
VTI,VTI,STOCKS,50%,50%,5000,5000,0,HOLD,
VOO,VOO,STOCKS,50%,50%,5000,5000,0,HOLD,`;

      const result = importFromCSV(csv);

      expect(result[0].id).not.toBe(result[1].id);
    });
  });

  describe('formatAssetName', () => {
    it('should format single word name', () => {
      expect(formatAssetName('STOCKS')).toBe('Stocks');
    });

    it('should format multi-word name with underscores', () => {
      expect(formatAssetName('REAL_ESTATE')).toBe('Real Estate');
    });

    it('should keep ETF in uppercase', () => {
      expect(formatAssetName('ETF')).toBe('ETF');
    });

    it('should handle ETF in multi-word names', () => {
      expect(formatAssetName('MONEY_ETF')).toBe('Money ETF');
    });

    it('should handle lowercase input', () => {
      expect(formatAssetName('savings_account')).toBe('Savings Account');
    });

    it('should handle mixed case input', () => {
      expect(formatAssetName('Single_Stock')).toBe('Single Stock');
    });

    it('should handle single character', () => {
      expect(formatAssetName('A')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(formatAssetName('')).toBe('');
    });
  });
});
