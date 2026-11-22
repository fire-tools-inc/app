import { beforeEach, describe, expect, it } from 'vitest';
import { getCategoryInfo, type ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { loadExpenseTrackerData } from '../../../src/utils/cookieStorage';
import { encryptData, decryptData } from '../../../src/utils/cookieEncryption';
import { exportExpenseTrackerToCSV, importExpenseTrackerFromCSV } from '../../../src/utils/expenseCsv';
import { normalizeExpenseTrackerCategories } from '../../../src/utils/expenseCategoryAliases';
import { getExpenseCategoryColor } from '../../../src/utils/expenseChartColors';
import { getChartColor } from '../../../src/utils/chartColors';
import { parseExpensePlanning, prepareExpenseTrackerRestore } from '../../../src/utils/expensePlanning';
import { importAllDataFromJSON } from '../../../src/utils/dataExportImport';
import { expectDiagnostic } from '../../shared/diagnostics';

const STORAGE_KEY = 'fire-tools-expense-tracker';

function legacyTracker(): ExpenseTrackerData {
  return {
    currentYear: 2025, currentMonth: 4, currency: 'EUR',
    globalBudgets: [
      { category: 'FEES', monthlyBudget: 5 },
      { category: 'BUSINESS', monthlyBudget: 20 },
      { category: 'HOLIDAYS', monthlyBudget: 100 },
    ],
    categoryOverrides: [
      { id: 'FEES' as never, name: 'Synthetic fees', color: '#111111' },
      { id: 'BUSINESS', name: 'Synthetic work' },
    ],
    years: [{ year: 2025, months: [{
      year: 2025, month: 4, incomes: [],
      expenses: [
        { id: 'e-1', type: 'expense', date: '2025-04-02', amount: 3, description: 'Synthetic account charge', category: 'FEES', expenseType: 'NEED' },
        { id: 'e-2', type: 'expense', date: '2025-04-03', amount: 300, description: 'Synthetic trip', category: 'HOLIDAYS', expenseType: 'WANT' },
        { id: 'e-3', type: 'expense', date: '2025-04-04', amount: 9, description: 'Synthetic lunch', category: 'DINING_OUT', expenseType: 'WANT' },
      ],
      budgets: [
        { category: 'HOLIDAYS', monthlyBudget: 50 },
        { category: 'TRAVEL', monthlyBudget: 70 },
        { category: 'FEES', monthlyBudget: 8, currency: 'USD' },
        { category: 'BUSINESS', monthlyBudget: 30, currency: 'EUR' },
      ],
    }] }],
    planning: {
      schemaVersion: 1, schedules: [{
        id: 's-1', name: 'Synthetic flight', kind: 'expense', amount: 200, currency: 'EUR', startDate: '2025-05-01',
        recurrence: { unit: 'once', interval: 1 }, category: 'HOLIDAYS', expenseType: 'WANT', enabled: true, archived: false,
      }],
      skippedOccurrences: [], goals: [],
      rules: [{
        id: 'r-1', name: 'Synthetic fee rule', kind: 'expense', enabled: true, priority: 0,
        match: { description: 'charge', operator: 'contains' }, category: 'FEES', expenseType: 'NEED',
      }],
    },
  };
}

beforeEach(() => localStorage.clear());

describe('retired expense categories', () => {
  it('maps expenses, budgets, overrides, schedules and rules to the merged categories', () => {
    const migrated = normalizeExpenseTrackerCategories(legacyTracker());
    const month = migrated.years[0].months[0];
    expect(month.expenses.map(expense => expense.category)).toEqual(['BUSINESS', 'TRAVEL', 'DINING_OUT']);
    expect(month.budgets).toEqual([
      { category: 'TRAVEL', monthlyBudget: 120 },
      { category: 'BUSINESS', monthlyBudget: 30, currency: 'EUR' },
    ]);
    expect(migrated.globalBudgets).toEqual([
      { category: 'BUSINESS', monthlyBudget: 25 },
      { category: 'TRAVEL', monthlyBudget: 100 },
    ]);
    expect(migrated.categoryOverrides).toEqual([{ id: 'BUSINESS', name: 'Synthetic work' }]);
    expect(migrated.planning?.schedules[0]).toMatchObject({ category: 'TRAVEL' });
    expect(migrated.planning?.rules[0]).toMatchObject({ category: 'BUSINESS' });
    expectDiagnostic('warn', '[budget-currency-mismatch]: a retired category budget uses a different currency and was not added to the merged category budget');
  });

  it('returns the same object when nothing needs migrating', () => {
    const current = normalizeExpenseTrackerCategories(legacyTracker());
    expectDiagnostic('warn', '[budget-currency-mismatch]: a retired category budget uses a different currency and was not added to the merged category budget');
    expect(normalizeExpenseTrackerCategories(current)).toBe(current);
  });

  it('migrates saved data on load and persists the merged categories', () => {
    const legacy = legacyTracker();
    legacy.years[0].months[0].budgets = legacy.years[0].months[0].budgets.filter(budget => budget.currency !== 'USD');
    localStorage.setItem(STORAGE_KEY, encryptData(JSON.stringify(legacy)));
    const loaded = loadExpenseTrackerData();
    expect(loaded?.years[0].months[0].expenses[0].category).toBe('BUSINESS');
    const stored = JSON.parse(decryptData(localStorage.getItem(STORAGE_KEY) ?? '') ?? '{}') as ExpenseTrackerData;
    expect(JSON.stringify(stored)).not.toMatch(/"(?:FEES|HOLIDAYS)"/);
    expect(stored.years[0].months[0].expenses).toHaveLength(3);
  });

  it('migrates CSV restores, JSON backups and planning documents', () => {
    const legacy = legacyTracker();
    legacy.years[0].months[0].budgets = [];
    const csv = exportExpenseTrackerToCSV(legacy);
    const imported = importExpenseTrackerFromCSV(csv);
    expect(JSON.stringify(imported)).not.toMatch(/"(?:FEES|HOLIDAYS)"/);
    expect(imported.categoryOverrides).toEqual([{ id: 'BUSINESS', name: 'Synthetic work' }]);
    const restored = prepareExpenseTrackerRestore(legacy, null);
    expect(restored.years[0].months[0].expenses[1].category).toBe('TRAVEL');
    const backup = JSON.stringify({
      exportVersion: '1', exportDate: '2025-04-30T00:00:00.000Z', exportType: 'FireToolsAllData', originalCurrency: 'EUR',
      fireCalculator: null, assetAllocation: { assets: [], assetClassTargets: {} }, expenseTracker: legacy, netWorthTracker: null,
    });
    expect(JSON.stringify(importAllDataFromJSON(backup, 'EUR').expenseTracker)).not.toMatch(/"(?:FEES|HOLIDAYS)"/);
    expect(parseExpensePlanning(legacy.planning).rules[0]).toMatchObject({ category: 'BUSINESS' });
  });

  it('shows retired ids as their merged category and keeps chart colors stable', () => {
    expect(getCategoryInfo('FEES')).toMatchObject({ id: 'BUSINESS', name: 'Business & Fees' });
    expect(getCategoryInfo('HOLIDAYS', [], [{ id: 'TRAVEL', name: 'Synthetic trips' }])).toMatchObject({ id: 'TRAVEL', name: 'Synthetic trips' });
    expect(getExpenseCategoryColor('GROCERIES')).toBe(getChartColor(4));
    expect(getExpenseCategoryColor('TRAVEL')).toBe(getChartColor(18));
    expect(getExpenseCategoryColor('HOLIDAYS')).toBe(getExpenseCategoryColor('TRAVEL'));
    expect(getExpenseCategoryColor('CLOTHING')).not.toBe(getExpenseCategoryColor('ELECTRONICS'));
  });
});
