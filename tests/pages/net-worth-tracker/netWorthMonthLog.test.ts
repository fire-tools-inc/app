import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyMonthlySnapshot, type MonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import { DEFAULT_ASSET_CLASS_TARGETS } from '../../../src/utils/dataSync';
import {
  applyNetWorthMonthPrices,
  fetchNetWorthMonthPrices,
  persistNetWorthData,
  startNetWorthMonth,
} from '../../../src/utils/netWorthMonthLog';

const mocks = vi.hoisted(() => ({
  saveNetWorthTrackerData: vi.fn(),
  loadAssetAllocation: vi.fn(),
  saveAssetAllocation: vi.fn(),
  fetchAssetPrices: vi.fn(),
  fetchMultipleClosingPricesForMonth: vi.fn(),
}));

vi.mock('../../../src/utils/cookieStorage', () => ({
  saveNetWorthTrackerData: mocks.saveNetWorthTrackerData,
  loadAssetAllocation: mocks.loadAssetAllocation,
  saveAssetAllocation: mocks.saveAssetAllocation,
}));
vi.mock('../../../src/utils/dcaCalculator', () => ({ fetchAssetPrices: mocks.fetchAssetPrices }));
vi.mock('../../../src/utils/priceApi', () => ({
  fetchMultipleClosingPricesForMonth: mocks.fetchMultipleClosingPricesForMonth,
}));

function february(): MonthlySnapshot {
  return {
    ...createEmptyMonthlySnapshot(2026, 2),
    assets: [
      { id: 'a1', ticker: ' syn ', name: 'Synthetic fund', shares: 10, pricePerShare: 100, currency: 'EUR', assetClass: 'ETF' },
      { id: 'a2', ticker: 'SYN', name: 'Synthetic fund copy', shares: 1, pricePerShare: 100, acquisitionPrice: 80, currency: 'EUR', assetClass: 'ETF' },
      { id: 'a3', ticker: '', name: 'Synthetic property', shares: 1, pricePerShare: 200000, currency: 'EUR', assetClass: 'REAL_ESTATE' },
    ],
    cashEntries: [{ id: 'c1', accountName: 'Synthetic bank', accountType: 'CHECKING', balance: 500, currency: 'EUR' }],
    pensions: [{ id: 'p1', name: 'Synthetic pension', pensionType: 'PRIVATE', currentValue: 9000, currency: 'EUR' }],
    operations: [{ id: 'o1', date: '2026-02-03', type: 'DIVIDEND', description: 'Synthetic dividend', amount: 5, currency: 'EUR' }],
    debts: [{ id: 'd1', name: 'Synthetic loan', debtType: 'PERSONAL_LOAN', currentBalance: 100, currency: 'EUR' }],
  };
}

function tracker(months: MonthlySnapshot[], sync = false): NetWorthTrackerData {
  const years = [...new Set(months.map(month => month.year))].map(year => ({ year, months: months.filter(month => month.year === year) }));
  return {
    years, currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true, syncWithAssetAllocation: sync },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAssetAllocation.mockReturnValue({ assets: [], assetClassTargets: null });
});

describe('starting a net worth month', () => {
  it('inherits holdings, cash and pensions with new ids, but not month-specific entries', () => {
    const data = tracker([february()]);
    const before = structuredClone(data);
    const { data: next, tickersToFetch, inheritedFrom } = startNetWorthMonth(data, 2026, 3);
    const march = next.years[0].months.find(month => month.month === 3)!;

    expect(data).toEqual(before);
    expect(inheritedFrom).toEqual({ year: 2026, month: 2 });
    expect(march.assets.map(asset => asset.name)).toEqual(['Synthetic fund', 'Synthetic fund copy', 'Synthetic property']);
    expect(march.assets.map(asset => asset.acquisitionPrice)).toEqual([100, 80, 200000]);
    expect(march.assets.every(asset => !['a1', 'a2', 'a3'].includes(asset.id))).toBe(true);
    expect(march.cashEntries).toEqual([expect.objectContaining({ accountName: 'Synthetic bank', balance: 500 })]);
    expect(march.pensions).toEqual([expect.objectContaining({ name: 'Synthetic pension', currentValue: 9000 })]);
    expect(march.operations).toEqual([]);
    expect(march.debts).toEqual([]);
    expect(tickersToFetch).toEqual(['SYN']);
  });

  it('keeps entries already in the month and uses the latest earlier snapshot across gaps', () => {
    const existing: MonthlySnapshot = {
      ...createEmptyMonthlySnapshot(2026, 4),
      cashEntries: [{ id: 'mine', accountName: 'SYNTHETIC BANK', accountType: 'SAVINGS', balance: 42, currency: 'EUR' }],
    };
    const { data: next, inheritedFrom } = startNetWorthMonth(tracker([february(), existing]), 2026, 4);
    const april = next.years[0].months.find(month => month.month === 4)!;
    expect(inheritedFrom).toEqual({ year: 2026, month: 2 });
    expect(april.cashEntries).toEqual([existing.cashEntries[0]]);
    expect(april.assets).toHaveLength(3);
    expect(next.years[0].months.map(month => month.month)).toEqual([2, 4]);
  });

  it('creates an empty month in a new year when there is nothing to inherit', () => {
    const { data: next, tickersToFetch, inheritedFrom } = startNetWorthMonth(tracker([february()]), 2025, 6);
    expect(inheritedFrom).toBeNull();
    expect(tickersToFetch).toEqual([]);
    expect(next.years.map(year => year.year)).toEqual([2025, 2026]);
    expect(next.years[0].months).toEqual([createEmptyMonthlySnapshot(2025, 6)]);
  });
});

describe('month prices', () => {
  it('uses latest prices for the current month and closing prices for past months', async () => {
    const now = new Date(2026, 2, 15, 12);
    mocks.fetchAssetPrices.mockResolvedValue({ SYN: 110, NONE: null });
    await expect(fetchNetWorthMonthPrices(['syn', 'NONE', 'SYN'], 2026, 3, now)).resolves.toEqual({ SYN: 110 });
    expect(mocks.fetchAssetPrices).toHaveBeenCalledWith(['SYN', 'NONE']);

    mocks.fetchMultipleClosingPricesForMonth.mockResolvedValue({ SYN: { price: 95, date: '2026-02-27' }, NONE: null });
    await expect(fetchNetWorthMonthPrices(['SYN', 'NONE'], 2026, 2, now)).resolves.toEqual({ SYN: 95 });
    expect(mocks.fetchMultipleClosingPricesForMonth).toHaveBeenCalledWith(['SYN', 'NONE'], 2026, 2);
    await expect(fetchNetWorthMonthPrices([' '], 2026, 2, now)).resolves.toEqual({});
  });

  it('applies prices to matching tickers in one month only', () => {
    const data = startNetWorthMonth(tracker([february()]), 2026, 3).data;
    const next = applyNetWorthMonthPrices(data, 2026, 3, { SYN: 120 });
    const [feb, march] = next.years[0].months;
    expect(march.assets.map(asset => asset.pricePerShare)).toEqual([120, 120, 200000]);
    expect(feb.assets.map(asset => asset.pricePerShare)).toEqual([100, 100, 200000]);
  });
});

describe('persisting net worth data', () => {
  const now = new Date(2026, 2, 15, 12);

  it('saves and mirrors only the current calendar month when synchronization is enabled', () => {
    const data = startNetWorthMonth(tracker([february()], true), 2026, 3).data;
    expect(persistNetWorthData(data, 2026, 3, now)).toEqual({ syncedToAssetAllocation: true });
    expect(mocks.saveNetWorthTrackerData).toHaveBeenCalledWith(data);
    expect(mocks.saveAssetAllocation).toHaveBeenCalledWith(expect.any(Array), DEFAULT_ASSET_CLASS_TARGETS);

    vi.clearAllMocks();
    expect(persistNetWorthData(data, 2026, 2, now)).toEqual({ syncedToAssetAllocation: false });
    expect(mocks.saveNetWorthTrackerData).toHaveBeenCalledTimes(1);
    expect(mocks.saveAssetAllocation).not.toHaveBeenCalled();

    expect(persistNetWorthData(tracker([february()], false), 2026, 3, now)).toEqual({ syncedToAssetAllocation: false });
    expect(mocks.saveAssetAllocation).not.toHaveBeenCalled();
  });

  it('throws storage failures to the caller without synchronizing', () => {
    mocks.saveNetWorthTrackerData.mockImplementationOnce(() => { throw new Error('Synthetic storage failure'); });
    const data = startNetWorthMonth(tracker([february()], true), 2026, 3).data;
    expect(() => persistNetWorthData(data, 2026, 3, now)).toThrow('Synthetic storage failure');
    expect(mocks.saveAssetAllocation).not.toHaveBeenCalled();
  });
});
