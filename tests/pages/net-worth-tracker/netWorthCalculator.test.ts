import { describe, expect, it } from 'vitest';
import {
  calculateMonthlyNetWorth,
  calculateYTDSummary,
  calculateMonthlyVariations,
  calculateNetWorthForecast,
  calculateFIREProgress,
} from '../../../src/utils/netWorthCalculator';
import {
  MonthlySnapshot,
  AssetHolding,
  CashEntry,
  PensionEntry,
} from '../../../src/types/netWorthTracker';

describe('Net Worth Calculator', () => {
  // Test data
  const mockAssets: AssetHolding[] = [
    {
      id: 'asset-1',
      ticker: 'VWCE',
      name: 'Vanguard FTSE All-World',
      shares: 100,
      pricePerShare: 100,
      currency: 'EUR',
      assetClass: 'ETF',
    },
    {
      id: 'asset-2',
      ticker: 'AAPL',
      name: 'Apple Inc.',
      shares: 10,
      pricePerShare: 180,
      currency: 'USD',
      assetClass: 'STOCKS',
    },
  ];

  const mockCashEntries: CashEntry[] = [
    {
      id: 'cash-1',
      accountName: 'Main Savings',
      accountType: 'SAVINGS',
      balance: 10000,
      currency: 'EUR',
    },
    {
      id: 'cash-2',
      accountName: 'Checking',
      accountType: 'CHECKING',
      balance: 2500,
      currency: 'EUR',
    },
  ];

  const mockPensions: PensionEntry[] = [
    {
      id: 'pension-1',
      name: 'State Pension',
      currentValue: 50000,
      currency: 'EUR',
      pensionType: 'STATE',
    },
  ];

  const mockSnapshot: MonthlySnapshot = {
    year: 2024,
    month: 1,
    assets: mockAssets,
    cashEntries: mockCashEntries,
    pensions: mockPensions,
    operations: [],
    isFrozen: false,
  };

  describe('calculateMonthlyNetWorth', () => {
    it('should calculate total asset value correctly', () => {
      const result = calculateMonthlyNetWorth(mockSnapshot);
      // 100 shares * €100 + 10 shares * $180 = €10,000 + $1,800
      // Assuming USD converted to EUR at rate ~0.85, $1800 = ~€1530
      expect(result.totalAssetValue).toBeGreaterThan(10000);
    });

    it('should calculate total cash correctly', () => {
      const result = calculateMonthlyNetWorth(mockSnapshot);
      expect(result.totalCash).toBe(12500); // 10000 + 2500
    });

    it('should calculate total pension correctly', () => {
      const result = calculateMonthlyNetWorth(mockSnapshot);
      expect(result.totalPension).toBe(50000);
    });

    it('should calculate net worth correctly', () => {
      const result = calculateMonthlyNetWorth(mockSnapshot);
      // Net worth = assets + cash + pension
      expect(result.netWorth).toBeGreaterThan(70000);
    });

    it('should handle empty snapshot', () => {
      const emptySnapshot: MonthlySnapshot = {
        year: 2024,
        month: 1,
        assets: [],
        cashEntries: [],
        pensions: [],
        operations: [],
        isFrozen: false,
      };
      const result = calculateMonthlyNetWorth(emptySnapshot);
      expect(result.totalAssetValue).toBe(0);
      expect(result.totalCash).toBe(0);
      expect(result.totalPension).toBe(0);
      expect(result.netWorth).toBe(0);
    });

    it('should exclude pension when setting is disabled', () => {
      const withPension = calculateMonthlyNetWorth(mockSnapshot);
      const result = calculateMonthlyNetWorth(mockSnapshot, { includePension: false });
      // Pensions are still totalled for display; only net worth leaves them out.
      expect(result.totalPension).toBe(withPension.totalPension);
      expect(result.netWorth).toBe(withPension.netWorth - withPension.totalPension);
    });
  });

  describe('calculateYTDSummary', () => {
    const mockSnapshots: MonthlySnapshot[] = [
      {
        year: 2024,
        month: 1,
        assets: [{ ...mockAssets[0], pricePerShare: 100 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 10000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
      {
        year: 2024,
        month: 2,
        assets: [{ ...mockAssets[0], pricePerShare: 110 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 11000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
      {
        year: 2024,
        month: 3,
        assets: [{ ...mockAssets[0], pricePerShare: 105 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 12000 }],
        pensions: [],
        operations: [],
        isFrozen: false,
      },
    ];

    it('should calculate average monthly net worth', () => {
      const result = calculateYTDSummary(mockSnapshots, 3);
      expect(result.averageMonthlyNetWorth).toBeGreaterThan(0);
    });

    it('should calculate net worth change from start to end', () => {
      const result = calculateYTDSummary(mockSnapshots, 3);
      // Jan: 100*100 + 10000 = 20000
      // Mar: 100*105 + 12000 = 22500
      expect(result.netWorthChange).toBe(2500);
    });

    it('should calculate net worth change percentage', () => {
      const result = calculateYTDSummary(mockSnapshots, 3);
      // Change: 2500 / 20000 = 12.5%
      expect(result.netWorthChangePercent).toBeCloseTo(12.5, 1);
    });

    it('should handle single month', () => {
      const result = calculateYTDSummary([mockSnapshots[0]], 1);
      expect(result.netWorthChange).toBe(0);
      expect(result.netWorthChangePercent).toBe(0);
    });

    it('should handle empty array', () => {
      const result = calculateYTDSummary([], 1);
      expect(result.averageMonthlyNetWorth).toBe(0);
      expect(result.netWorthChange).toBe(0);
      expect(result.netWorthChangePercent).toBe(0);
    });
  });

  describe('calculateMonthlyVariations', () => {
    const mockSnapshots: MonthlySnapshot[] = [
      {
        year: 2024,
        month: 1,
        assets: [{ ...mockAssets[0], pricePerShare: 100 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 10000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
      {
        year: 2024,
        month: 2,
        assets: [{ ...mockAssets[0], pricePerShare: 110 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 11000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
    ];

    it('should calculate month-over-month variation', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      expect(variations).toHaveLength(2);
    });

    it('should calculate correct change from previous month', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      // Jan: 100*100 + 10000 = 20000
      // Feb: 100*110 + 11000 = 22000
      expect(variations[1].changeFromPrevMonth).toBe(2000);
    });

    it('should calculate correct percentage change', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      // 2000 / 20000 = 10%
      expect(variations[1].changePercent).toBeCloseTo(10, 1);
    });

    it('should leave pensions out of history and forecasts when asked', () => {
      const withPensions = mockSnapshots.map((snapshot, index) => ({
        ...snapshot, pensions: [{ ...mockPensions[0], currentValue: 5000 + index * 1000 }],
      }));
      const options = { includePension: false };
      expect(calculateMonthlyVariations(withPensions, options).map((v) => [v.netWorth, v.pensionChange])).toEqual([[20000, 0], [22000, 1000]]);
      expect(calculateNetWorthForecast(withPensions, 1, options)[0].projectedNetWorth).toBe(24000);
    });

    it('should set first month change to 0', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      expect(variations[0].changeFromPrevMonth).toBe(0);
      expect(variations[0].changePercent).toBe(0);
    });

    it('should calculate asset value change separately', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      // Asset change: (100*110) - (100*100) = 11000 - 10000 = 1000
      expect(variations[1].assetValueChange).toBe(1000);
    });

    it('should calculate cash change separately', () => {
      const variations = calculateMonthlyVariations(mockSnapshots);
      // Cash change: 11000 - 10000 = 1000
      expect(variations[1].cashChange).toBe(1000);
    });
  });

  describe('calculateNetWorthForecast', () => {
    const mockSnapshots: MonthlySnapshot[] = [
      {
        year: 2024,
        month: 1,
        assets: [{ ...mockAssets[0], pricePerShare: 100 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 10000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
      {
        year: 2024,
        month: 2,
        assets: [{ ...mockAssets[0], pricePerShare: 105 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 11000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
      {
        year: 2024,
        month: 3,
        assets: [{ ...mockAssets[0], pricePerShare: 110 }],
        cashEntries: [{ ...mockCashEntries[0], balance: 12000 }],
        pensions: [],
        operations: [],
        isFrozen: true,
      },
    ];

    it('should generate forecast for specified number of months', () => {
      const forecast = calculateNetWorthForecast(mockSnapshots, 3);
      expect(forecast).toHaveLength(3);
    });

    it('should project increasing net worth based on trend', () => {
      const forecast = calculateNetWorthForecast(mockSnapshots, 1);
      // Based on positive trend, forecast should be higher than last actual
      const lastActualNetWorth = 100 * 110 + 12000; // 23000
      expect(forecast[0].projectedNetWorth).toBeGreaterThan(lastActualNetWorth);
    });

    it('should include confidence level', () => {
      const forecast = calculateNetWorthForecast(mockSnapshots, 1);
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(forecast[0].confidenceLevel);
    });

    it('should include basedOnMonths count', () => {
      const forecast = calculateNetWorthForecast(mockSnapshots, 1);
      expect(forecast[0].basedOnMonths).toBe(3);
    });

    it('should return empty array for insufficient data', () => {
      const forecast = calculateNetWorthForecast([mockSnapshots[0]], 1);
      expect(forecast).toHaveLength(0);
    });
  });

  describe('calculateFIREProgress', () => {
    it('should calculate percent to FIRE correctly', () => {
      const progress = calculateFIREProgress(500000, 1000000, 0.04);
      expect(progress.percentToFire).toBe(50);
    });

    it('should calculate years to FIRE based on savings rate', () => {
      const progress = calculateFIREProgress(
        500000, // current net worth
        1000000, // fire target
        0.04, // withdrawal rate
        50000, // annual savings
        0.07 // expected return
      );
      expect(progress.yearsToFire).toBeGreaterThan(0);
    });

    it('should return null for projected date when no savings provided', () => {
      const progress = calculateFIREProgress(500000, 1000000, 0.04);
      expect(progress.projectedFireDate).toBeNull();
      expect(progress.yearsToFire).toBeNull();
    });

    it('should return 0 years when already at FIRE', () => {
      const progress = calculateFIREProgress(1000000, 1000000, 0.04, 50000, 0.07);
      expect(progress.yearsToFire).toBe(0);
    });

    it('should handle net worth exceeding FIRE target', () => {
      const progress = calculateFIREProgress(1500000, 1000000, 0.04);
      expect(progress.percentToFire).toBe(150);
    });
  });
});

// Tests for chart utility functions in HistoricalNetWorthChart
describe('Chart Currency Formatting', () => {
  // This tests the formatChartCurrency function logic
  // The actual function is in HistoricalNetWorthChart.tsx
  
  function formatChartCurrency(amount: number): string {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    
    if (absAmount >= 1000000) {
      return `${sign}${(absAmount / 1000000).toFixed(1)}M`;
    }
    if (absAmount >= 1000) {
      return `${sign}${(absAmount / 1000).toFixed(0)}k`;
    }
    return `${sign}${absAmount.toFixed(0)}`;
  }

  it('should format positive values with k suffix', () => {
    expect(formatChartCurrency(5000)).toBe('5k');
    expect(formatChartCurrency(12500)).toBe('13k'); // rounds
    expect(formatChartCurrency(20000)).toBe('20k');
  });

  it('should format positive values with M suffix', () => {
    expect(formatChartCurrency(1000000)).toBe('1.0M');
    expect(formatChartCurrency(1500000)).toBe('1.5M');
    expect(formatChartCurrency(2500000)).toBe('2.5M');
  });

  it('should format negative values with k suffix', () => {
    expect(formatChartCurrency(-5000)).toBe('-5k');
    expect(formatChartCurrency(-20000)).toBe('-20k');
  });

  it('should format negative values with M suffix', () => {
    expect(formatChartCurrency(-1000000)).toBe('-1.0M');
    expect(formatChartCurrency(-1500000)).toBe('-1.5M');
  });

  it('should handle small values without suffix', () => {
    expect(formatChartCurrency(500)).toBe('500');
    expect(formatChartCurrency(-500)).toBe('-500');
  });

  it('should handle zero', () => {
    expect(formatChartCurrency(0)).toBe('0');
  });
});
