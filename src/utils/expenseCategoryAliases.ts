/**
 * Forward migration for retired built-in expense categories (see
 * LEGACY_CATEGORY_ALIASES). Applied wherever saved or imported cashflow data
 * enters the app so every screen, chart and export sees the merged ids.
 */
import type { SupportedCurrency } from '../types/currency';
import type { ExpensePlanningData } from '../types/expensePlanning';
import {
  LEGACY_CATEGORY_ALIASES,
  resolveCategoryAlias,
  type CategoryBudget,
  type CategoryOverride,
  type ExpenseTrackerData,
} from '../types/expenseTracker';
import { logger } from './logger';

export function isLegacyCategoryId(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_ALIASES, category);
}

/**
 * Merge budgets whose categories collapse into the same id. Amounts are summed
 * when both budgets use the same currency; otherwise the budget already filed
 * under the surviving category is kept.
 */
export function mergeCategoryBudgets(budgets: CategoryBudget[], trackerCurrency: SupportedCurrency): CategoryBudget[] {
  if (!budgets.some(budget => isLegacyCategoryId(budget.category))) return budgets;
  const merged: CategoryBudget[] = [];
  const byCategory = new Map<string, number>();
  const ordered = [...budgets.filter(budget => !isLegacyCategoryId(budget.category)),
    ...budgets.filter(budget => isLegacyCategoryId(budget.category))];
  for (const budget of ordered) {
    const category = resolveCategoryAlias(budget.category);
    const index = byCategory.get(category);
    if (index === undefined) {
      byCategory.set(category, merged.length);
      merged.push({ ...budget, category });
      continue;
    }
    const existing = merged[index];
    if ((existing.currency ?? trackerCurrency) === (budget.currency ?? trackerCurrency)) {
      merged[index] = { ...existing, monthlyBudget: existing.monthlyBudget + budget.monthlyBudget };
    } else {
      logger.warn('expense-categories', 'budget-currency-mismatch',
        'a retired category budget uses a different currency and was not added to the merged category budget', {
          pii: { category, kept: existing.currency ?? trackerCurrency, dropped: budget.currency ?? trackerCurrency },
        });
    }
  }
  return merged;
}

function normalizeOverrides(overrides: CategoryOverride[] | undefined): CategoryOverride[] | undefined {
  if (!overrides?.some(override => isLegacyCategoryId(override.id))) return overrides;
  return overrides.filter(override => !isLegacyCategoryId(override.id));
}

export function normalizePlanningCategories(planning: ExpensePlanningData): ExpensePlanningData {
  const legacySchedule = planning.schedules.some(item => item.kind === 'expense' && isLegacyCategoryId(item.category));
  const legacyRule = planning.rules.some(item => item.kind === 'expense' && isLegacyCategoryId(item.category));
  if (!legacySchedule && !legacyRule) return planning;
  return {
    ...planning,
    schedules: planning.schedules.map(item => item.kind === 'expense' && isLegacyCategoryId(item.category)
      ? { ...item, category: resolveCategoryAlias(item.category) } : item),
    rules: planning.rules.map(item => item.kind === 'expense' && isLegacyCategoryId(item.category)
      ? { ...item, category: resolveCategoryAlias(item.category) } : item),
  };
}

/**
 * Map retired category ids in expenses, month and global budgets, built-in
 * overrides and planning schedules/rules. Returns the same object when no
 * retired id is present, so callers can tell whether anything changed.
 */
export function normalizeExpenseTrackerCategories(data: ExpenseTrackerData): ExpenseTrackerData {
  let changed = false;
  const years = data.years.map(year => {
    let yearChanged = false;
    const months = year.months.map(month => {
      const legacyExpense = month.expenses.some(expense => isLegacyCategoryId(expense.category));
      const budgets = mergeCategoryBudgets(month.budgets ?? [], data.currency);
      if (!legacyExpense && budgets === (month.budgets ?? [])) return month;
      yearChanged = true;
      return {
        ...month,
        expenses: legacyExpense
          ? month.expenses.map(expense => isLegacyCategoryId(expense.category)
            ? { ...expense, category: resolveCategoryAlias(expense.category) } : expense)
          : month.expenses,
        budgets,
      };
    });
    if (!yearChanged) return year;
    changed = true;
    return { ...year, months };
  });
  const globalBudgets = data.globalBudgets ? mergeCategoryBudgets(data.globalBudgets, data.currency) : data.globalBudgets;
  const categoryOverrides = normalizeOverrides(data.categoryOverrides);
  const planning = data.planning && Array.isArray(data.planning.schedules) && Array.isArray(data.planning.rules)
    ? normalizePlanningCategories(data.planning) : data.planning;
  if (!changed && globalBudgets === data.globalBudgets && categoryOverrides === data.categoryOverrides
    && planning === data.planning) return data;
  return {
    ...data,
    years,
    globalBudgets,
    ...(categoryOverrides === undefined ? {} : { categoryOverrides }),
    ...(planning === undefined ? {} : { planning }),
  };
}
