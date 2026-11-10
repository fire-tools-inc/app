import { describe, expect, it } from 'vitest';
import type { ExpenseEntry, ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { calculateExpenseStatistics } from '../../../src/utils/expenseStatistics';
import { calculateMonthlyComparison, calculateYearToDateBreakdown } from '../../../src/utils/expenseCalculator';

function expense(date: string, amount: number, currency: ExpenseEntry['currency'] = 'EUR'): ExpenseEntry {
  return { id: date, type: 'expense', date, amount, currency, description: 'Synthetic expense', category: 'OTHER', expenseType: 'WANT' };
}

function tracker(expenses: ExpenseEntry[]): ExpenseTrackerData {
  return {
    years: [{ year: 2026, isArchived: true, months: [{ year: 2026, month: 1, expenses, incomes: [], budgets: [] }] }],
    currency: 'EUR', currentYear: 2026, currentMonth: 3, globalBudgets: [],
  };
}

describe('calculateExpenseStatistics', () => {
  it('keeps the existing monthly comparison average consistent with elapsed YTD months', () => {
    const result = calculateMonthlyComparison([
      { year: 2026, month: 1, incomes: [], budgets: [], expenses: [expense('2026-01-01', 100)] },
      { year: 2026, month: 3, incomes: [], budgets: [], expenses: [expense('2026-03-01', 50)] },
    ], 3);
    expect(result.every(point => point.average === 50)).toBe(true);
  });

  it('keeps the existing category YTD view consistent with elapsed-month averages', () => {
    const result = calculateYearToDateBreakdown([
      { year: 2026, month: 1, incomes: [], budgets: [], expenses: [expense('2026-01-01', 100)] },
      { year: 2026, month: 3, incomes: [], budgets: [], expenses: [expense('2026-03-01', 50)] },
    ], 3);
    expect(result.average[0].totalAmount).toBe(50);
  });
  it('uses transaction dates, includes boundaries and divides YTD by elapsed months including empty ones', () => {
    const data = tracker([
      expense('2026-01-01', 100), expense('2026-03-15', 50),
      expense('2026-03-16', 900), expense('2025-12-31', 25),
    ]);
    const result = calculateExpenseStatistics(data, '2026-01-01', '2026-03-15');
    expect(result.total).toBe(150);
    expect(result.monthCount).toBe(3);
    expect(result.monthlyAverage).toBe(50);
    expect(result.transactionCount).toBe(2);
    expect(result.monthly).toEqual([
      { period: '2026-01', total: 100 }, { period: '2026-02', total: 0 }, { period: '2026-03', total: 50 },
    ]);
  });

  it('includes archived history, zero-spend years and an all-history calendar-month average', () => {
    const data = tracker([expense('2024-01-05', 120), expense('2026-03-02', 150)]);
    const result = calculateExpenseStatistics(data, '2024-01-01', '2026-12-31');
    expect(result.total).toBe(270);
    expect(result.yearCount).toBe(3);
    expect(result.yearlyAverage).toBe(90);
    expect(result.yearly).toEqual([
      { period: '2024', total: 120 }, { period: '2025', total: 0 }, { period: '2026', total: 150 },
    ]);
    expect(result.historyMonthlyAverage).toBe(10);
    expect(result.historyMonthCount).toBe(27);
  });

  it('filters an inclusive custom range and counts partial calendar months explicitly', () => {
    const result = calculateExpenseStatistics(tracker([
      expense('2024-02-28', 30), expense('2024-02-29', 80), expense('2024-03-01', 20), expense('2024-03-02', 70),
    ]), '2024-02-29', '2024-03-01');
    expect(result.total).toBe(100);
    expect(result.monthCount).toBe(2);
    expect(result.monthlyAverage).toBe(50);
  });

  it('never adds different currencies together and treats legacy missing currency as the tracker currency', () => {
    const legacy = expense('2026-01-01', 10);
    delete legacy.currency;
    const data = tracker([legacy, expense('2026-01-02', 20), expense('2026-01-03', 1000, 'USD')]);
    expect(calculateExpenseStatistics(data, '2026-01-01', '2026-12-31').total).toBe(30);
    expect(calculateExpenseStatistics(data, '2026-01-01', '2026-12-31', 'USD').total).toBe(1000);
  });

  it('excludes invalid legacy records and reports them instead of poisoning totals', () => {
    const result = calculateExpenseStatistics(tracker([
      expense('2026-02-30', 100), expense('2026-01-01', Infinity),
      expense('2026-01-02', -5), expense('2026-01-03', 0), expense('2026-01-04', 12),
    ]), '2026-01-01', '2026-12-31');
    expect(result.total).toBe(12);
    expect(result.transactionCount).toBe(2);
    expect(result.invalidTransactionCount).toBe(3);
  });

  it('returns real zeros and no invented historical average for an empty ledger', () => {
    const result = calculateExpenseStatistics(tracker([]), '2026-01-01', '2026-03-31');
    expect(result.total).toBe(0);
    expect(result.monthlyAverage).toBe(0);
    expect(result.historyMonthlyAverage).toBeNull();
    expect(result.monthly).toHaveLength(3);
  });

  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-03-01', '2026-01-01'],
    ['', '2026-03-01'],
  ])('rejects an invalid range %s to %s', (start, end) => {
    expect(() => calculateExpenseStatistics(tracker([]), start, end)).toThrow();
  });
});
