import type { MonthlySnapshot, NetWorthTrackerData, NetWorthYearData } from '../../../types/netWorthTracker';
import type { SupportedCurrency } from '../../../types/currency';
import { clearNetWorthTrackerData, loadNetWorthTrackerData, saveNetWorthTrackerData } from '../../cookieStorage';
import { isPlainObject } from '../canonical';
import type { DomainAdapter, Entity } from '../types';
import { addById, addByKey, byPosition, compact, currentYearMonth, monthKey, numberField, omit, withAcquisitionPrice, withoutFalseFlags, yearKey } from './shared';

const LEAF_FIELDS = ['year', 'month', 'position'] as const;
const LEAF_COLLECTIONS = ['assets', 'cashEntries', 'pensions', 'debts', 'taxes', 'operations'] as const;
type LeafCollection = (typeof LEAF_COLLECTIONS)[number];

interface NetWorthConfig {
  defaultCurrency: SupportedCurrency;
  currentYear: number;
  currentMonth: number;
  settings: NetWorthTrackerData['settings'];
}

function emptySnapshot(year: number, month: number): MonthlySnapshot {
  return { year, month, assets: [], cashEntries: [], pensions: [], operations: [], debts: [], taxes: [], isFrozen: false };
}

export const netWorthAdapter: DomainAdapter<NetWorthTrackerData> = {
  domain: 'netWorth',
  singletons: ['config'],
  collections: ['years', 'months', ...LEAF_COLLECTIONS],

  readLocal: () => loadNetWorthTrackerData(),

  writeLocalCache(doc) {
    if (doc) saveNetWorthTrackerData(doc);
    else clearNetWorthTrackerData();
  },

  normalize(doc) {
    const collections: Record<string, Record<string, Entity>> = { years: {}, months: {} };
    for (const name of LEAF_COLLECTIONS) collections[name] = {};
    if (!doc) return { set: { config: null }, collections };

    for (const yearData of doc.years ?? []) {
      const year = yearData.year;
      addByKey(collections.years, 'years', yearKey(year), withoutFalseFlags({ year, isArchived: yearData.isArchived }));
      for (const snapshot of yearData.months ?? []) {
        const month = snapshot.month;
        // Computed totals are derived at display time and never stored.
        addByKey(collections.months, 'months', monthKey(year, month), compact({
          year,
          month,
          isFrozen: Boolean(snapshot.isFrozen),
          frozenDate: snapshot.frozenDate,
          monthNote: snapshot.monthNote,
        }));
        for (const name of LEAF_COLLECTIONS) {
          const entries = (snapshot[name] ?? []) as unknown as Entity[];
          entries.forEach((entry, position) => {
            const normalized = withoutFalseFlags({ ...entry, year, month, position });
            addById(collections[name], name, name === 'assets' ? withAcquisitionPrice(normalized) : normalized);
          });
        }
      }
    }
    const settings = doc.settings ?? { showPensionInNetWorth: true, includeUnrealizedGains: true };
    const config: NetWorthConfig = {
      defaultCurrency: doc.defaultCurrency,
      currentYear: doc.currentYear,
      currentMonth: doc.currentMonth,
      settings: withoutFalseFlags(compact({
        showPensionInNetWorth: settings.showPensionInNetWorth,
        includeUnrealizedGains: settings.includeUnrealizedGains,
        syncWithAssetAllocation: settings.syncWithAssetAllocation,
      })),
    };
    return { set: { config }, collections };
  },

  keyOf(collection, entity) {
    if (collection === 'years') return yearKey(Number(entity.year));
    if (collection === 'months') return monthKey(Number(entity.year), Number(entity.month));
    return String(entity.id);
  },

  denormalize(maps) {
    const config = isPlainObject(maps.set.config) ? (maps.set.config as unknown as NetWorthConfig) : null;
    const collection = (name: string) => Object.values(maps.collections[name] ?? {});
    const hasRows = netWorthAdapter.collections.some((name) => collection(name).length > 0);
    if (!config && !hasRows) return null;

    const years = new Map<number, NetWorthYearData>();
    const yearFor = (year: number): NetWorthYearData => {
      let existing = years.get(year);
      if (!existing) {
        existing = { year, months: [] };
        years.set(year, existing);
      }
      return existing;
    };
    const months = new Map<string, MonthlySnapshot>();
    const monthFor = (year: number, month: number): MonthlySnapshot => {
      const key = monthKey(year, month);
      let existing = months.get(key);
      if (!existing) {
        existing = emptySnapshot(year, month);
        months.set(key, existing);
        yearFor(year).months.push(existing);
      }
      return existing;
    };

    for (const entity of collection('years')) {
      const yearData = yearFor(numberField(entity, 'year', 0));
      if (entity.isArchived !== undefined) yearData.isArchived = Boolean(entity.isArchived);
    }
    for (const entity of collection('months')) {
      const snapshot = monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1));
      snapshot.isFrozen = Boolean(entity.isFrozen);
      if (typeof entity.frozenDate === 'string') snapshot.frozenDate = entity.frozenDate;
      if (typeof entity.monthNote === 'string') snapshot.monthNote = entity.monthNote;
    }
    for (const name of LEAF_COLLECTIONS) {
      for (const entity of collection(name).sort(byPosition)) {
        const snapshot = monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1));
        (snapshot[name as LeafCollection] as unknown as Entity[]).push(omit(entity, LEAF_FIELDS));
      }
    }

    const fallback = currentYearMonth();
    return {
      years: [...years.values()]
        .sort((a, b) => a.year - b.year)
        .map((yearData) => ({ ...yearData, months: yearData.months.sort((a, b) => a.month - b.month) })),
      currentYear: config?.currentYear ?? fallback.year,
      currentMonth: config?.currentMonth ?? fallback.month,
      defaultCurrency: config?.defaultCurrency ?? 'EUR',
      settings: config?.settings ?? { showPensionInNetWorth: true, includeUnrealizedGains: true },
    };
  },

  isEmpty(doc) {
    if (!doc) return true;
    return !(doc.years ?? []).some((yearData) => (yearData.months ?? []).some((snapshot) => (
      Boolean(snapshot.monthNote) || LEAF_COLLECTIONS.some((name) => ((snapshot[name] as unknown[] | undefined)?.length ?? 0) > 0)
    )));
  },
};
