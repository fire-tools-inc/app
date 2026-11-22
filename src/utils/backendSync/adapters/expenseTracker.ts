import type {
  CategoryBudget,
  CategoryOverride,
  CustomCategory,
  ExpenseEntry,
  ExpenseTrackerData,
  IncomeEntry,
  MonthData,
  YearData,
} from '../../../types/expenseTracker';
import type { ExpensePlanningData } from '../../../types/expensePlanning';
import type { SupportedCurrency } from '../../../types/currency';
import { clearExpenseTrackerData, loadExpenseTrackerData, saveExpenseTrackerData } from '../../cookieStorage';
import { isPlainObject } from '../canonical';
import type { DomainAdapter, Entity } from '../types';
import { addById, addByKey, byPosition, currentYearMonth, monthKey, numberField, omit, withoutFalseFlags, yearKey } from './shared';

const LEAF_FIELDS = ['year', 'month', 'position'] as const;

const monthBudgetKey = (year: number, month: number, category: string): string => `${monthKey(year, month)}|${category}`;

interface ExpenseConfig {
  currency: SupportedCurrency;
  currentYear: number;
  currentMonth: number;
}

function planningHasContent(planning: ExpensePlanningData | undefined | null): boolean {
  if (!planning) return false;
  return Boolean(
    planning.schedules?.length
    || planning.skippedOccurrences?.length
    || planning.goals?.length
    || planning.rules?.length
    || planning.forecast,
  );
}

function emptyMonth(year: number, month: number): MonthData {
  return { year, month, incomes: [], expenses: [], budgets: [] };
}

export const expenseTrackerAdapter: DomainAdapter<ExpenseTrackerData> = {
  domain: 'expenseTracker',
  singletons: ['config', 'planning'],
  collections: ['years', 'months', 'expenses', 'incomes', 'monthBudgets', 'globalBudgets', 'customCategories', 'categoryOverrides'],

  readLocal: () => loadExpenseTrackerData(),

  writeLocalCache(doc) {
    if (doc) saveExpenseTrackerData(doc);
    else clearExpenseTrackerData();
  },

  normalize(doc) {
    const collections: Record<string, Record<string, Entity>> = {
      years: {}, months: {}, expenses: {}, incomes: {}, monthBudgets: {}, globalBudgets: {}, customCategories: {}, categoryOverrides: {},
    };
    if (!doc) return { set: { config: null, planning: null }, collections };

    for (const yearData of doc.years ?? []) {
      addByKey(collections.years, 'years', yearKey(yearData.year), withoutFalseFlags({ year: yearData.year, isArchived: yearData.isArchived }));
      for (const monthData of yearData.months ?? []) {
        const { year, month } = { year: yearData.year, month: monthData.month };
        addByKey(collections.months, 'months', monthKey(year, month), withoutFalseFlags({ year, month, isClosed: monthData.isClosed }));
        (monthData.expenses ?? []).forEach((entry, position) => {
          addById(collections.expenses, 'expenses', withoutFalseFlags({ ...(entry as unknown as Entity), year, month, position }));
        });
        (monthData.incomes ?? []).forEach((entry, position) => {
          addById(collections.incomes, 'incomes', withoutFalseFlags({ ...(entry as unknown as Entity), year, month, position }));
        });
        (monthData.budgets ?? []).forEach((budget, position) => {
          addByKey(collections.monthBudgets, 'monthBudgets', monthBudgetKey(year, month, budget.category), {
            ...(budget as unknown as Entity), year, month, position,
          });
        });
      }
    }
    (doc.globalBudgets ?? []).forEach((budget, position) => {
      addByKey(collections.globalBudgets, 'globalBudgets', budget.category, { ...(budget as unknown as Entity), position });
    });
    (doc.customCategories ?? []).forEach((category, position) => {
      addById(collections.customCategories, 'customCategories', { ...(category as unknown as Entity), position });
    });
    (doc.categoryOverrides ?? []).forEach((override, position) => {
      addByKey(collections.categoryOverrides, 'categoryOverrides', override.id, { ...(override as unknown as Entity), position });
    });

    const config: ExpenseConfig = { currency: doc.currency, currentYear: doc.currentYear, currentMonth: doc.currentMonth };
    // The backend omits planning without content, so an empty one is "absent".
    return { set: { config, planning: planningHasContent(doc.planning) ? doc.planning : null }, collections };
  },

  keyOf(collection, entity) {
    switch (collection) {
      case 'years': return yearKey(Number(entity.year));
      case 'months': return monthKey(Number(entity.year), Number(entity.month));
      case 'monthBudgets': return monthBudgetKey(Number(entity.year), Number(entity.month), String(entity.category));
      case 'globalBudgets': return String(entity.category);
      default: return String(entity.id);
    }
  },

  denormalize(maps) {
    const config = isPlainObject(maps.set.config) ? (maps.set.config as unknown as ExpenseConfig) : null;
    const planning = isPlainObject(maps.set.planning) ? (maps.set.planning as unknown as ExpensePlanningData) : null;
    const collection = (name: string) => Object.values(maps.collections[name] ?? {});
    const hasRows = expenseTrackerAdapter.collections.some((name) => collection(name).length > 0);
    if (!config && !planning && !hasRows) return null;

    const years = new Map<number, YearData>();
    const yearFor = (year: number): YearData => {
      let existing = years.get(year);
      if (!existing) {
        existing = { year, months: [] };
        years.set(year, existing);
      }
      return existing;
    };
    const months = new Map<string, MonthData>();
    const monthFor = (year: number, month: number): MonthData => {
      const key = monthKey(year, month);
      let existing = months.get(key);
      if (!existing) {
        existing = emptyMonth(year, month);
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
      const monthData = monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1));
      if (entity.isClosed !== undefined) monthData.isClosed = Boolean(entity.isClosed);
    }
    const leaves = (name: string) => collection(name).sort(byPosition);
    for (const entity of leaves('expenses')) {
      monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1)).expenses.push(omit(entity, LEAF_FIELDS) as unknown as ExpenseEntry);
    }
    for (const entity of leaves('incomes')) {
      monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1)).incomes.push(omit(entity, LEAF_FIELDS) as unknown as IncomeEntry);
    }
    for (const entity of leaves('monthBudgets')) {
      monthFor(numberField(entity, 'year', 0), numberField(entity, 'month', 1)).budgets.push(omit(entity, LEAF_FIELDS) as unknown as CategoryBudget);
    }

    const fallback = currentYearMonth();
    const result: ExpenseTrackerData = {
      years: [...years.values()]
        .sort((a, b) => a.year - b.year)
        .map((yearData) => ({ ...yearData, months: yearData.months.sort((a, b) => a.month - b.month) })),
      currentYear: config?.currentYear ?? fallback.year,
      currentMonth: config?.currentMonth ?? fallback.month,
      currency: config?.currency ?? 'EUR',
      globalBudgets: leaves('globalBudgets').map((entity) => omit(entity, ['position']) as unknown as CategoryBudget),
    };
    const customCategories = leaves('customCategories').map((entity) => omit(entity, ['position']) as unknown as CustomCategory);
    const categoryOverrides = leaves('categoryOverrides').map((entity) => omit(entity, ['position']) as unknown as CategoryOverride);
    if (customCategories.length) result.customCategories = customCategories;
    if (categoryOverrides.length) result.categoryOverrides = categoryOverrides;
    if (planning) result.planning = planning;
    return result;
  },

  isEmpty(doc) {
    if (!doc) return true;
    const monthsHaveContent = (doc.years ?? []).some((yearData) => (yearData.months ?? []).some((monthData) => (
      (monthData.expenses?.length ?? 0) > 0 || (monthData.incomes?.length ?? 0) > 0 || (monthData.budgets?.length ?? 0) > 0
    )));
    return !monthsHaveContent
      && !(doc.globalBudgets?.length)
      && !(doc.customCategories?.length)
      && !(doc.categoryOverrides?.length)
      && !planningHasContent(doc.planning);
  },
};
