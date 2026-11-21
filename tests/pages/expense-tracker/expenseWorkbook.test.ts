import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readXlsxWorkbook } from '../../../src/utils/xlsxReader';
import { writeXlsxWorkbook, type XlsxWriteValue } from '../../../src/utils/xlsxWriter';
import {
  buildExpenseWorkbookTemplate,
  getExpenseAgentPrompt,
  mergeExpenseWorkbook,
  parseExpenseWorkbook,
  previewExpenseWorkbook,
  type ExpenseWorkbookPlan,
} from '../../../src/utils/expenseWorkbook';
import { parseNetWorthWorkbook } from '../../../src/utils/workbookImport';
import { applyWorkbookImport } from '../../../src/utils/workbookImportApply';
import { createEmptyMonthData, type ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { DEFAULT_FALLBACK_RATES } from '../../../src/types/currency';

// Fictional data only.
const OPTIONS = { targetCurrency: 'EUR' as const, fallbackRates: DEFAULT_FALLBACK_RATES };
const NOW = new Date(2025, 2, 20); // March 2025: April is a future month.

function monthSheet(name: string, header: string, rows: XlsxWriteValue[][], income?: number) {
  const sheet: XlsxWriteValue[][] = [
    [header, 'Amount', 'Category', 'Type', null, 'Sum'],
    [null, null, null, null, null, { value: 0, formula: 'SUM(B3:B20)' }, 'See notes'],
    ...rows.map((row) => [...row, null, null, null]),
  ];
  if (income !== undefined) {
    while (sheet.length < 6) sheet.push([]);
    sheet[5] = [...(sheet[5] ?? []).slice(0, 6)];
    while (sheet[5].length < 6) sheet[5].push(null);
    sheet[5].push('Monthly income', income);
  }
  return { name, rows: sheet };
}

function expensesWorkbook(): Uint8Array {
  return writeXlsxWorkbook([
    { name: 'Notes', rows: [['Year notes']] },
    { name: 'Summary', rows: [['Category', 'Jan', 'Feb']] },
    monthSheet('Jan', 'Expense name', [
      ['Rent', 900, 'Housing', 'Need'],
      ['Train pass', 45, 'Transport', 'Need'],
      ['Groceries week 1', { value: 61.5, formula: '41.5+20' }, 'Meals', 'Need'],
      ['Concert', 35, 'Meals', 'Want'],
      ['Charity run', 20, 'Charity', 'Want'],
      [null, 0, null, null],
      ['Refund', -10, 'Other', null],
    ], 2600),
    monthSheet('Feb', '  ', [
      ['Rent', 900, 'Housing', 'Need'],
      ['Street food', 18, 'Meals', null],
      ['Bank fee', '2,50', '', null],
    ], 2600),
    monthSheet('Apr', 'Expense name', [['Rent', 900, 'Housing', 'Need']], 2600),
  ]);
}

function parse(): ExpenseWorkbookPlan {
  return parseExpenseWorkbook(readXlsxWorkbook(expensesWorkbook()), 'Spending 2025.xlsx', OPTIONS);
}

describe('expenses workbook parsing', () => {
  it('reads month sheets, skips filler rows and finds the side-panel income', () => {
    const plan = parse();
    expect(plan.detectedYear).toBe(2025);
    expect(plan.monthSheets).toEqual(['Jan', 'Feb', 'Apr']);
    expect(plan.ignoredSheets).toEqual(['Notes', 'Summary']);
    const [jan, feb] = plan.months;
    expect(jan.rows.map((row) => [row.name, row.amount, row.category, row.type])).toEqual([
      ['Rent', 900, 'Housing', 'NEED'],
      ['Train pass', 45, 'Transport', 'NEED'],
      ['Groceries week 1', 61.5, 'Meals', 'NEED'],
      ['Concert', 35, 'Meals', 'WANT'],
      ['Charity run', 20, 'Charity', 'WANT'],
    ]);
    expect(jan.incomeTotal).toEqual({ amount: 2600, label: 'Monthly income' });
    expect(feb.rows.map((row) => row.amount)).toEqual([900, 18, 2.5]);
    expect(plan.warnings).toEqual([{ code: 'negativeAmount', sheet: 'Jan', row: 9, detail: 'Refund' }]);
  });
});

describe('expenses workbook merge', () => {
  it('maps categories, creates custom ones and skips future months', () => {
    const plan = parse();
    expect(previewExpenseWorkbook(plan, null, 2025, NOW)).toMatchObject({
      months: [1, 2], futureMonths: [4], expenses: 8, incomes: 2, conflictingMonths: 0, newCategories: ['Meals'],
    });
    const { data, summary } = mergeExpenseWorkbook(plan, null, { year: 2025, existingMonths: 'keep' }, NOW);
    expect(summary).toMatchObject({ monthsImported: 2, expensesImported: 8, incomesImported: 2, categoriesCreated: 1, futureMonthsSkipped: 1 });
    const jan = data.years[0].months[0];
    expect(jan.expenses.map((entry) => [entry.description, entry.category, entry.expenseType, entry.date])).toEqual([
      ['Rent', 'HOUSING', 'NEED', '2025-01-01'],
      ['Train pass', 'TRANSPORTATION', 'NEED', '2025-01-01'],
      ['Groceries week 1', 'cat-wbe-meals', 'NEED', '2025-01-01'],
      ['Concert', 'cat-wbe-meals', 'WANT', '2025-01-01'],
      ['Charity run', 'GIFTS_DONATIONS', 'WANT', '2025-01-01'],
    ]);
    expect(jan.incomes).toMatchObject([{ amount: 2600, description: 'Monthly income', source: 'OTHER' }]);
    expect(data.customCategories).toMatchObject([{ id: 'cat-wbe-meals', name: 'Meals', defaultExpenseType: 'NEED' }]);
    const feb = data.years[0].months[1];
    expect(feb.expenses.map((entry) => [entry.category, entry.expenseType])).toEqual([
      ['HOUSING', 'NEED'], ['cat-wbe-meals', 'NEED'], ['NO_CATEGORY', 'WANT'],
    ]);

    const again = mergeExpenseWorkbook(plan, data, { year: 2025, existingMonths: 'keep' }, NOW);
    expect(again.data).toEqual(data);
  });

  it('keeps months with your own expenses unless replacing, and leaves existing income alone', () => {
    const plan = parse();
    const current: ExpenseTrackerData = {
      years: [{ year: 2025, months: [{
        ...createEmptyMonthData(2025, 1),
        expenses: [{ id: 'txn-user', type: 'expense', date: '2025-01-03', amount: 12, description: 'Lunch', category: 'DINING_OUT', expenseType: 'WANT' }],
        incomes: [{ id: 'txn-pay', type: 'income', date: '2025-01-25', amount: 2500, description: 'Salary', source: 'SALARY' }],
      }] }],
      currentYear: 2025, currentMonth: 3, currency: 'EUR', globalBudgets: [],
    };
    expect(previewExpenseWorkbook(plan, current, 2025, NOW).conflictingMonths).toBe(1);
    const kept = mergeExpenseWorkbook(plan, current, { year: 2025, existingMonths: 'keep' }, NOW);
    expect(kept.summary).toMatchObject({ monthsKept: 1, incomeMonthsSkipped: 1 });
    expect(kept.data.years[0].months[0]).toEqual(current.years[0].months[0]);

    const replaced = mergeExpenseWorkbook(plan, current, { year: 2025, existingMonths: 'replace' }, NOW);
    expect(replaced.data.years[0].months[0].expenses.map((entry) => entry.description)).not.toContain('Lunch');
    expect(replaced.data.years[0].months[0].incomes).toMatchObject([{ amount: 2600 }]);
  });

  it('replaces monthly totals from the net worth import and keeps its detail on later imports', () => {
    const netWorthBook = writeXlsxWorkbook([{ name: '2025', rows: [
      ['Category', 'Name', 'Ticker', 'Currency', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      ['Cash', 'Demo account', null, 'EUR', 1000, 1100],
      ['Income', 'Salary', null, 'EUR', 2700, 2700],
      ['Expense', 'Monthly spending', null, 'EUR', 1500, 1500],
    ] }]);
    const netWorthPlan = parseNetWorthWorkbook(readXlsxWorkbook(netWorthBook), OPTIONS);
    const selection = { netWorth: false, cashflow: true, allocation: false, fire: false, existingMonths: 'keep' as const };
    const empty = { netWorth: null, expenseTracker: null, assets: null, assetClassTargets: null, fireCalculator: null };
    const afterNetWorth = applyWorkbookImport(netWorthPlan, empty, selection, NOW).expenseTracker ?? null;

    const detailed = mergeExpenseWorkbook(parse(), afterNetWorth, { year: 2025, existingMonths: 'keep' }, NOW);
    const jan = detailed.data.years[0].months[0];
    expect(jan.expenses.some((entry) => entry.description === 'Monthly spending')).toBe(false);
    expect(jan.incomes.map((entry) => entry.description)).toEqual(['Salary']);
    expect(detailed.summary.incomeMonthsSkipped).toBe(2);

    const reimported = applyWorkbookImport(netWorthPlan, { ...empty, expenseTracker: detailed.data }, selection, NOW);
    const janAfter = reimported.expenseTracker?.years[0].months[0];
    expect(janAfter?.expenses.map((entry) => entry.description)).toEqual(jan.expenses.map((entry) => entry.description));
    expect(janAfter?.incomes.map((entry) => entry.description)).toEqual(['Salary']);
  });
});

describe('expenses workbook review regressions', () => {
  it('skips total rows and formulas that add up other rows', () => {
    const bytes = writeXlsxWorkbook([{ name: 'Jan', rows: [
      ['Expense name', 'Amount', 'Category'],
      ['Rent', 900, 'Housing'],
      ['Groceries', 300, 'Groceries'],
      ['Total', { value: 1200, formula: 'SUM(B2:B3)' }],
      ['Month spend', { value: 1200, formula: 'B2+B3' }],
      ['Summer trip', 400, 'Travel'],
    ] }]);
    const plan = parseExpenseWorkbook(readXlsxWorkbook(bytes), 'Spending 2025.xlsx', OPTIONS);
    expect(plan.months[0].rows.map((row) => row.name)).toEqual(['Rent', 'Groceries', 'Summer trip']);
  });

  it('does not create categories for months that are kept', () => {
    const bytes = writeXlsxWorkbook([{ name: 'Jan', rows: [['Expense name', 'Amount', 'Category'], ['Dog food', 40, 'Pets']] }]);
    const plan = parseExpenseWorkbook(readXlsxWorkbook(bytes), 'Spending 2025.xlsx', OPTIONS);
    const current: ExpenseTrackerData = {
      years: [{ year: 2025, months: [{
        ...createEmptyMonthData(2025, 1),
        expenses: [{ id: 'txn-user', type: 'expense', date: '2025-01-03', amount: 12, description: 'Lunch', category: 'DINING_OUT', expenseType: 'WANT' }],
      }] }],
      currentYear: 2025, currentMonth: 3, currency: 'EUR', globalBudgets: [],
    };
    const { data, summary } = mergeExpenseWorkbook(plan, current, { year: 2025, existingMonths: 'keep' }, NOW);
    expect(summary).toMatchObject({ monthsKept: 1, categoriesCreated: 0 });
    expect(data.customCategories).toBeUndefined();
  });

  it('offers template categories without rejecting new names', () => {
    const files = unzipSync(buildExpenseWorkbookTemplate({ year: 2025, currency: 'EUR', categories: ['Housing'] }));
    const january = strFromU8(files['xl/worksheets/sheet3.xml']);
    expect(january).toMatch(/showErrorMessage="0" sqref="C2:C500"/);
    expect(january).toMatch(/showErrorMessage="1" sqref="D2:D500"/);
  });
});

describe('expenses workbook template', () => {
  it('has month sheets and an example that imports as documented', () => {
    const workbook = readXlsxWorkbook(buildExpenseWorkbookTemplate({ year: 2025, currency: 'EUR', categories: ['Housing', 'Groceries'] }));
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'README', 'Example', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]);
    const empty = parseExpenseWorkbook(workbook, 'fire-tools-expenses-2025.xlsx', OPTIONS);
    expect(empty.months.every((month) => month.rows.length === 0)).toBe(true);
    expect(empty.detectedYear).toBe(2025);

    const example = workbook.sheets[1];
    const plan = parseExpenseWorkbook({ ...workbook, sheets: [{ ...example, name: 'Jan' }] }, 'x.xlsx', OPTIONS);
    const { data } = mergeExpenseWorkbook(plan, null, { year: 2025, existingMonths: 'keep' }, NOW);
    const jan = data.years[0].months[0];
    expect(jan.expenses.map((entry) => [entry.category, entry.date])).toEqual([
      ['HOUSING', '2025-01-01'], ['GROCERIES', '2025-01-06'], ['TRANSPORTATION', '2025-01-02'],
      ['ENTERTAINMENT', '2025-01-14'], ['SUBSCRIPTIONS', '2025-01-20'],
    ]);
    expect(jan.expenses[4].amount).toBe(11.04);
    expect(jan.incomes).toMatchObject([{ description: 'Salary', amount: 2800, date: '2025-01-25' }]);
    expect(data.customCategories).toBeUndefined();
    expect(getExpenseAgentPrompt()).toMatch(/^You are helping me build a Fire Tools yearly expenses workbook/);
  });
});
