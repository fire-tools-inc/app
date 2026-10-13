import type { CashflowSchedule, CashflowForecastInputs, ScheduledOccurrenceReference } from '../types/expensePlanning';
import type { ExpenseTrackerData, ExpenseEntry, IncomeEntry } from '../types/expenseTracker';
import {
  cashflowTransactions, createEmptyExpensePlanning, occurrenceKey, parseExpensePlanning,
  validateExpenseTrackerPlanning,
} from './expensePlanning';
import { isValidCalendarDate } from './dateValidation';
import { SUPPORTED_CURRENCIES } from '../types/currency';

const DAY_MS = 86_400_000;

function dateTime(value: string): number {
  if (!isValidCalendarDate(value)) throw new Error('Invalid calendar date.');
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function calendarDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function addCalendarDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error('Invalid date interval.');
  const result = new Date(dateTime(value) + days * DAY_MS).toISOString().slice(0, 10);
  if (!isValidCalendarDate(result)) throw new Error('Date range exceeds the supported calendar.');
  return result;
}

export function scheduleDates(schedule: CashflowSchedule, from: string, to: string): string[] {
  parseExpensePlanning({ ...createEmptyExpensePlanning(), schedules: [schedule] });
  const fromTime = dateTime(from);
  const toTime = dateTime(to);
  if (fromTime > toTime) throw new Error('End date must not precede start date.');
  if (!schedule.enabled || schedule.archived) return [];
  const start = dateTime(schedule.startDate);
  const end = Math.min(toTime, schedule.endDate ? dateTime(schedule.endDate) : toTime);
  if (schedule.recurrence.unit === 'once') {
    return start >= fromTime && start <= end ? [schedule.startDate] : [];
  }

  const result: string[] = [];
  const { unit, interval } = schedule.recurrence;
  if (unit === 'day' || unit === 'week') {
    const step = interval * (unit === 'week' ? 7 : 1) * DAY_MS;
    const first = Math.max(0, Math.ceil((fromTime - start) / step));
    for (let time = start + first * step; time <= end; time += step) {
      result.push(new Date(time).toISOString().slice(0, 10));
    }
    return result;
  }

  const [year, month, anchorDay] = schedule.startDate.split('-').map(Number);
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const anchor = year * 12 + month - 1;
  const step = interval * (unit === 'year' ? 12 : 1);
  const first = Math.max(0, Math.floor((fromYear * 12 + fromMonth - 1 - anchor) / step));
  // Calculate from the original anchor, not the previous short month's date.
  for (let index = first; ; index++) {
    const monthIndex = anchor + index * step;
    const targetYear = Math.floor(monthIndex / 12);
    if (targetYear > 2100) break;
    const targetMonth = monthIndex % 12;
    const day = Math.min(anchorDay, new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
    const time = Date.UTC(targetYear, targetMonth, day);
    if (time > end) break;
    if (time >= fromTime) result.push(new Date(time).toISOString().slice(0, 10));
  }
  return result;
}

  export interface ScheduleOccurrence extends ScheduledOccurrenceReference {
    schedule: CashflowSchedule;
    status: 'planned' | 'recorded' | 'skipped';
    transaction?: ExpenseEntry | IncomeEntry;
  }

  export function getScheduleOccurrences(data: ExpenseTrackerData, from: string, to: string): ScheduleOccurrence[] {
    validateExpenseTrackerPlanning(data);
    const planning = data.planning ?? createEmptyExpensePlanning();
    const recorded = new Map<string, ExpenseEntry | IncomeEntry>();
    for (const transaction of cashflowTransactions(data)) {
      if (transaction.scheduleId && transaction.scheduledDate) recorded.set(occurrenceKey({
        scheduleId: transaction.scheduleId, scheduledDate: transaction.scheduledDate,
      }), transaction);
    }
    const skipped = new Set(planning.skippedOccurrences.map(occurrenceKey));
    return planning.schedules.flatMap(schedule => scheduleDates(schedule, from, to).map(scheduledDate => {
      const reference = { scheduleId: schedule.id, scheduledDate };
      const transaction = recorded.get(occurrenceKey(reference));
      const status = transaction ? 'recorded' : skipped.has(occurrenceKey(reference)) ? 'skipped' : 'planned';
      return { ...reference, schedule, status, ...(transaction ? { transaction } : {}) } satisfies ScheduleOccurrence;
    })).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.schedule.name.localeCompare(b.schedule.name));
  }

  export interface CashflowForecastPoint {
    date: string;
    recordedIncome: number;
    recordedExpenses: number;
    plannedIncome: number;
    plannedExpenses: number;
    balance: number;
  }

  export interface CashflowForecast {
    inputs: CashflowForecastInputs;
    endDate: string;
    points: CashflowForecastPoint[];
    finalBalance: number;
    lowestBalance: number;
    firstNegativeDate: string | null;
    invalidTransactionCount: number;
  }

  export function buildCashflowForecast(data: ExpenseTrackerData, inputs: CashflowForecastInputs): CashflowForecast {
    validateExpenseTrackerPlanning(data);
    parseExpensePlanning({ ...createEmptyExpensePlanning(), forecast: inputs });
    const endDate = addCalendarDays(inputs.startDate, inputs.horizon - 1);
    const points: CashflowForecastPoint[] = Array.from({ length: inputs.horizon }, (_, index) => ({
      date: addCalendarDays(inputs.startDate, index),
      recordedIncome: 0, recordedExpenses: 0, plannedIncome: 0, plannedExpenses: 0, balance: 0,
    }));
    const days = new Map(points.map(point => [point.date, point]));
    let invalidTransactionCount = 0;
    for (const transaction of cashflowTransactions(data)) {
      const currency = transaction.currency ?? data.currency;
      if (!isValidCalendarDate(transaction.date) || !Number.isFinite(transaction.amount) || transaction.amount < 0
        || !SUPPORTED_CURRENCIES.some(item => item.code === currency)) {
        invalidTransactionCount++;
        continue;
      }
      if (currency !== inputs.currency) continue;
      const point = days.get(transaction.date);
      if (point) point[transaction.type === 'income' ? 'recordedIncome' : 'recordedExpenses'] += transaction.amount;
    }
    for (const occurrence of getScheduleOccurrences(data, inputs.startDate, endDate)) {
      if (occurrence.status !== 'planned' || occurrence.schedule.currency !== inputs.currency) continue;
      const point = days.get(occurrence.scheduledDate);
      if (point) point[occurrence.schedule.kind === 'income' ? 'plannedIncome' : 'plannedExpenses'] += occurrence.schedule.amount;
    }
    const scale = inputs.currency === 'JPY' ? 1 : 100;
    const units = (value: number): number => {
      const scaled = value * scale;
      if (!Number.isFinite(scaled)) throw new Error('Cashflow amounts exceed the supported numeric range.');
      const integer = Math.round(scaled);
      // Snap binary noise near exact minor units, while retaining fractional amounts.
      return Number.isSafeInteger(integer) && Math.abs(scaled - integer) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2
        ? integer : scaled;
    };
    let balance = units(inputs.openingBalance);
    for (const point of points) {
      balance += units(point.recordedIncome) + units(point.plannedIncome)
        - units(point.recordedExpenses) - units(point.plannedExpenses);
      if (!Number.isFinite(balance)) throw new Error('Cashflow amounts exceed the supported numeric range.');
      point.balance = balance / scale;
    }
    return {
      inputs, endDate, points, finalBalance: points[points.length - 1].balance,
      lowestBalance: points.reduce((lowest, point) => Math.min(lowest, point.balance), inputs.openingBalance),
      firstNegativeDate: points.find(point => point.balance < 0)?.date ?? null,
      invalidTransactionCount,
    };
  }
