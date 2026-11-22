import type { SupportedCurrency } from '../types/currency';
import {
  createEmptyMonthlySnapshot,
  createEmptyNetWorthYearData,
  generateNetWorthId,
  type MonthlySnapshot,
  type NetWorthTrackerData,
} from '../types/netWorthTracker';
import { loadAssetAllocation, saveAssetAllocation, saveNetWorthTrackerData } from './cookieStorage';
import { DEFAULT_ASSET_CLASS_TARGETS, syncNetWorthToAssetAllocation } from './dataSync';
import { fetchAssetPrices } from './dcaCalculator';
import { fetchMultipleClosingPricesForMonth } from './priceApi';
import { findNetWorthMonth, findPreviousNetWorthMonth } from './monthLog';

/** Net Worth data used when nothing is saved yet: an empty snapshot for the current month. */
export function createDefaultNetWorthData(defaultCurrency: SupportedCurrency, now = new Date()): NetWorthTrackerData {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return {
    years: [{ year: currentYear, months: [createEmptyMonthlySnapshot(currentYear, currentMonth)], isArchived: false }],
    currentYear,
    currentMonth,
    defaultCurrency,
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
  };
}

export function cloneNetWorthData(data: NetWorthTrackerData): NetWorthTrackerData {
  return JSON.parse(JSON.stringify(data));
}

export { findNetWorthMonth, findPreviousNetWorthMonth };

export interface StartNetWorthMonthResult {
  data: NetWorthTrackerData;
  /** Unique upper-case tickers of inherited holdings whose prices can be refreshed. */
  tickersToFetch: string[];
  inheritedFrom: { year: number; month: number } | null;
}

/**
 * Ensure a month snapshot exists and inherit assets, cash and pensions from the
 * previous period. Names are unique keys, so existing entries are never duplicated.
 * Operations, debts and taxes are month specific and are not inherited.
 */
export function startNetWorthMonth(previous: NetWorthTrackerData, year: number, month: number): StartNetWorthMonthResult {
  const data = cloneNetWorthData(previous);
  let yearData = data.years.find(entry => entry.year === year);
  if (!yearData) {
    yearData = createEmptyNetWorthYearData(year);
    data.years.push(yearData);
    data.years.sort((a, b) => a.year - b.year);
  }
  let monthData = yearData.months.find(entry => entry.month === month);
  if (!monthData) {
    monthData = createEmptyMonthlySnapshot(year, month);
    yearData.months.push(monthData);
    yearData.months.sort((a, b) => a.month - b.month);
  }

  const source = findPreviousNetWorthMonth(previous, year, month);
  const tickers: string[] = [];
  if (source) {
    const assetNames = new Set(monthData.assets.map(asset => asset.name.toLowerCase()));
    const cashNames = new Set(monthData.cashEntries.map(entry => entry.accountName.toLowerCase()));
    const pensionNames = new Set(monthData.pensions.map(pension => pension.name.toLowerCase()));

    // Acquisition prices carry forward; month-end prices may be refreshed afterwards.
    for (const asset of source.assets) {
      if (assetNames.has(asset.name.toLowerCase())) continue;
      monthData.assets.push({
        ...cloneValue(asset),
        id: generateNetWorthId(),
        acquisitionPrice: asset.acquisitionPrice ?? asset.pricePerShare,
      });
      assetNames.add(asset.name.toLowerCase());
      if (asset.ticker && asset.ticker.trim().length > 0) tickers.push(asset.ticker.trim().toUpperCase());
    }
    for (const cash of source.cashEntries) {
      if (cashNames.has(cash.accountName.toLowerCase())) continue;
      monthData.cashEntries.push({ ...cloneValue(cash), id: generateNetWorthId() });
      cashNames.add(cash.accountName.toLowerCase());
    }
    for (const pension of source.pensions) {
      if (pensionNames.has(pension.name.toLowerCase())) continue;
      monthData.pensions.push({ ...cloneValue(pension), id: generateNetWorthId() });
      pensionNames.add(pension.name.toLowerCase());
    }
  }

  return {
    data,
    tickersToFetch: [...new Set(tickers)],
    inheritedFrom: source ? { year: source.year, month: source.month } : null,
  };
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isCalendarMonth(year: number, month: number, now: Date): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1;
}

/**
 * Latest market prices for the current month, otherwise the closing price of
 * that month's last trading day. Tickers without a usable price are omitted.
 */
export async function fetchNetWorthMonthPrices(
  tickers: string[], year: number, month: number, now = new Date(),
): Promise<Record<string, number>> {
  const unique = [...new Set(tickers.map(ticker => ticker.trim().toUpperCase()).filter(Boolean))];
  const prices: Record<string, number> = {};
  if (unique.length === 0) return prices;
  if (isCalendarMonth(year, month, now)) {
    const latest = await fetchAssetPrices(unique);
    for (const [ticker, price] of Object.entries(latest)) {
      if (price != null) prices[ticker] = price;
    }
  } else {
    const closing = await fetchMultipleClosingPricesForMonth(unique, year, month);
    for (const [ticker, result] of Object.entries(closing)) {
      if (result) prices[ticker] = result.price;
    }
  }
  return prices;
}

/** Apply fetched prices to holdings with a matching ticker in one month. */
export function applyNetWorthMonthPrices(
  data: NetWorthTrackerData, year: number, month: number, prices: Record<string, number>,
): NetWorthTrackerData {
  const updated = cloneNetWorthData(data);
  const snapshot = findNetWorthMonth(updated, year, month);
  if (snapshot) {
    for (const asset of snapshot.assets) {
      const ticker = asset.ticker?.trim().toUpperCase();
      if (ticker && prices[ticker] != null) asset.pricePerShare = prices[ticker];
    }
  }
  return updated;
}

/** Clone the data and change one existing month snapshot. */
export function updateNetWorthMonth(
  data: NetWorthTrackerData, year: number, month: number, update: (snapshot: MonthlySnapshot) => void,
): NetWorthTrackerData {
  const updated = cloneNetWorthData(data);
  const snapshot = findNetWorthMonth(updated, year, month);
  if (!snapshot) throw new Error(`No net worth snapshot exists for ${year}-${month}.`);
  update(snapshot);
  return updated;
}

export interface PersistNetWorthResult {
  syncedToAssetAllocation: boolean;
}

/**
 * Save Net Worth data and, when synchronization is enabled and the edited
 * month is the current calendar month, mirror that month to Asset Allocation.
 * Storage failures are thrown to the caller.
 */
export function persistNetWorthData(
  data: NetWorthTrackerData, year: number, month: number, now = new Date(),
): PersistNetWorthResult {
  saveNetWorthTrackerData(data);
  if (!data.settings.syncWithAssetAllocation || !isCalendarMonth(year, month, now)) {
    return { syncedToAssetAllocation: false };
  }
  if (!findNetWorthMonth(data, now.getFullYear(), now.getMonth() + 1)) {
    return { syncedToAssetAllocation: false };
  }
  const syncedAssets = syncNetWorthToAssetAllocation(data);
  const { assetClassTargets } = loadAssetAllocation();
  saveAssetAllocation(syncedAssets, assetClassTargets || DEFAULT_ASSET_CLASS_TARGETS);
  return { syncedToAssetAllocation: true };
}
