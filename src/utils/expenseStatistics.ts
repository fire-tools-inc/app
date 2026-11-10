import type { SupportedCurrency } from '../types/currency';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { isValidCalendarDate } from './dateValidation';

export interface ExpenseStatisticsPoint {
  period: string;
  total: number;
}

export interface ExpenseStatisticsResult {
  total: number;
  monthlyAverage: number;
  yearlyAverage: number;
  monthCount: number;
  yearCount: number;
  transactionCount: number;
  monthly: ExpenseStatisticsPoint[];
  yearly: ExpenseStatisticsPoint[];
  historyMonthlyAverage: number | null;
  historyMonthCount: number;
  historyStartDate: string | null;
  historyEndDate: string | null;
  invalidTransactionCount: number;
}

function monthIndex(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return year * 12 + month - 1;
}

function monthKey(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
}

export function calculateExpenseStatistics(
  data: ExpenseTrackerData,
  startDate: string,
  endDate: string,
  currency: SupportedCurrency = data.currency,
): ExpenseStatisticsResult {
  if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate) || startDate > endDate) {
    throw new Error('Choose valid calendar dates with the start on or before the end.');
  }

  const monthlyTotals = new Map<string, number>();
  const yearlyTotals = new Map<string, number>();
  let total = 0;
  let transactionCount = 0;
  let historyTotal = 0;
  let historyStartDate: string | null = null;
  let historyEndDate: string | null = null;
  let invalidTransactionCount = 0;

  for (const year of data.years) {
    for (const month of year.months) {
      for (const expense of month.expenses) {
        if (!isValidCalendarDate(expense.date) || !Number.isFinite(expense.amount) || expense.amount < 0) {
          invalidTransactionCount++;
          continue;
        }
        if ((expense.currency ?? data.currency) !== currency) continue;
        historyTotal += expense.amount;
        if (historyStartDate === null || expense.date < historyStartDate) historyStartDate = expense.date;
        if (historyEndDate === null || expense.date > historyEndDate) historyEndDate = expense.date;
        if (expense.date < startDate || expense.date > endDate) continue;
        total += expense.amount;
        transactionCount++;
        const monthKey = expense.date.slice(0, 7);
        const yearKey = expense.date.slice(0, 4);
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) ?? 0) + expense.amount);
        yearlyTotals.set(yearKey, (yearlyTotals.get(yearKey) ?? 0) + expense.amount);
      }
    }
  }

  const firstMonth = monthIndex(startDate);
  const monthCount = monthIndex(endDate) - firstMonth + 1;
  const firstYear = Number(startDate.slice(0, 4));
  const yearCount = Number(endDate.slice(0, 4)) - firstYear + 1;
  const historyMonthCount = historyStartDate && historyEndDate
    ? monthIndex(historyEndDate) - monthIndex(historyStartDate) + 1 : 0;

  return {
    total,
    monthlyAverage: total / monthCount,
    yearlyAverage: total / yearCount,
    monthCount,
    yearCount,
    transactionCount,
    monthly: Array.from({ length: monthCount }, (_, offset) => {
      const period = monthKey(firstMonth + offset);
      return { period, total: monthlyTotals.get(period) ?? 0 };
    }),
    yearly: Array.from({ length: yearCount }, (_, offset) => {
      const period = String(firstYear + offset);
      return { period, total: yearlyTotals.get(period) ?? 0 };
    }),
    historyMonthlyAverage: historyMonthCount ? historyTotal / historyMonthCount : null,
    historyMonthCount,
    historyStartDate,
    historyEndDate,
    invalidTransactionCount,
  };
}
