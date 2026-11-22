import {
  createEmptyMonthData,
  createEmptyYearData,
  type ExpenseTrackerData,
  type IncomeEntry,
  type IncomeSource,
  type MonthData,
} from '../types/expenseTracker';
import type { MonthlySnapshot, NetWorthTrackerData } from '../types/netWorthTracker';
import type { SupportedCurrency } from '../types/currency';
import { isValidCalendarDate } from './dateValidation';

export const MONTH_LOG_STEPS = ['income', 'expenses', 'investments', 'pension'] as const;
export type MonthLogStepId = typeof MONTH_LOG_STEPS[number];

/**
 * done: logged or updated for the month.
 * todo: nothing logged yet.
 * unchanged: carried over from the previous month with identical values.
 * none: nothing to log (no pensions are tracked).
 */
export type MonthLogStepState = 'done' | 'todo' | 'unchanged' | 'none';

export interface MonthPeriod {
  year: number;
  month: number;
}

export interface MonthCheckInStatus {
  period: MonthPeriod;
  steps: Record<MonthLogStepId, MonthLogStepState>;
  /** Steps that need no further input (anything except `todo`). */
  completedCount: number;
  isComplete: boolean;
  hasStarted: boolean;
  /** First step still to log, else the first one that is unchanged, else null. */
  nextStep: MonthLogStepId | null;
}

export interface MonthLogOverview {
  current: MonthPeriod;
  suggested: MonthPeriod;
  /** Newest first, starting with the current calendar month. */
  months: MonthCheckInStatus[];
}

/** Days into a month during which an incomplete previous month is suggested first. */
export const PREVIOUS_MONTH_GRACE_DAYS = 10;

export function periodOf(date: Date): MonthPeriod {
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function previousPeriod({ year, month }: MonthPeriod): MonthPeriod {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function comparePeriods(a: MonthPeriod, b: MonthPeriod): number {
  return a.year - b.year || a.month - b.month;
}

export function samePeriod(a: MonthPeriod, b: MonthPeriod): boolean {
  return comparePeriods(a, b) === 0;
}

export function periodKey({ year, month }: MonthPeriod): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Parse URL year/month values; invalid or missing values use the fallback. */
export function parsePeriod(year: string | null, month: string | null, fallback: MonthPeriod): MonthPeriod {
  const parsedYear = year !== null && /^\d{4}$/.test(year) ? Number(year) : NaN;
  const parsedMonth = month !== null && /^\d{1,2}$/.test(month) ? Number(month) : NaN;
  if (parsedYear >= 1900 && parsedYear <= 2100 && parsedMonth >= 1 && parsedMonth <= 12) {
    return { year: parsedYear, month: parsedMonth };
  }
  return fallback;
}

export function formatPeriod(period: MonthPeriod, language: string, month: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(language, { month, year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(period.year, period.month - 1, 1)));
}

export function daysInMonth({ year, month }: MonthPeriod): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDate(period: MonthPeriod, day: number): string {
  const clamped = Math.min(Math.max(1, day), daysInMonth(period));
  return `${periodKey(period)}-${String(clamped).padStart(2, '0')}`;
}

export function findNetWorthMonth(data: NetWorthTrackerData, year: number, month: number): MonthlySnapshot | undefined {
  return data.years.find(entry => entry.year === year)?.months.find(entry => entry.month === month);
}

/** The previous calendar month's snapshot, or else the most recent earlier snapshot. */
export function findPreviousNetWorthMonth(data: NetWorthTrackerData, year: number, month: number): MonthlySnapshot | null {
  const previous = previousPeriod({ year, month });
  const immediate = findNetWorthMonth(data, previous.year, previous.month);
  if (immediate) return immediate;

  let latest: MonthlySnapshot | null = null;
  for (const yearData of data.years) {
    for (const snapshot of yearData.months) {
      const isEarlier = yearData.year < year || (yearData.year === year && snapshot.month < month);
      if (!isEarlier) continue;
      if (!latest || yearData.year > latest.year || (yearData.year === latest.year && snapshot.month > latest.month)) {
        latest = snapshot;
      }
    }
  }
  return latest;
}

export function findCashflowMonth(data: ExpenseTrackerData | null, period: MonthPeriod): MonthData | undefined {
  return data?.years.find(entry => entry.year === period.year)?.months.find(entry => entry.month === period.month);
}

function hasNetWorthEntries(snapshot: MonthlySnapshot | undefined | null): boolean {
  return Boolean(snapshot && (snapshot.assets.length > 0 || snapshot.cashEntries.length > 0
    || snapshot.pensions.length > 0 || snapshot.operations.length > 0
    || (snapshot.debts ?? []).length > 0 || (snapshot.taxes ?? []).length > 0));
}

function valueMap<T>(items: T[], key: (item: T) => string, value: (item: T) => string): Map<string, string> {
  return new Map(items.map(item => [key(item).trim().toLowerCase(), value(item)]));
}

function sameValues(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([name, value]) => b.get(name) === value);
}

function holdingValues(snapshot: MonthlySnapshot): Map<string, string> {
  const assets = valueMap(snapshot.assets, asset => `asset:${asset.name}`, asset => `${asset.shares}:${asset.pricePerShare}`);
  const cash = valueMap(snapshot.cashEntries, entry => `cash:${entry.accountName}`, entry => String(entry.balance));
  return new Map([...assets, ...cash]);
}

function pensionValues(snapshot: MonthlySnapshot): Map<string, string> {
  return valueMap(snapshot.pensions, pension => pension.name, pension => String(pension.currentValue));
}

export function investmentsState(netWorth: NetWorthTrackerData | null, period: MonthPeriod): MonthLogStepState {
  const snapshot = netWorth ? findNetWorthMonth(netWorth, period.year, period.month) : undefined;
  if (!snapshot || (snapshot.assets.length === 0 && snapshot.cashEntries.length === 0)) return 'todo';
  const previous = findPreviousNetWorthMonth(netWorth!, period.year, period.month);
  if (previous && (previous.assets.length > 0 || previous.cashEntries.length > 0)
    && sameValues(holdingValues(snapshot), holdingValues(previous))) {
    return 'unchanged';
  }
  return 'done';
}

export function pensionState(netWorth: NetWorthTrackerData | null, period: MonthPeriod): MonthLogStepState {
  if (!netWorth) return 'none';
  const snapshot = findNetWorthMonth(netWorth, period.year, period.month);
  const previous = findPreviousNetWorthMonth(netWorth, period.year, period.month);
  if (!snapshot || snapshot.pensions.length === 0) {
    // A started month without pensions is a deliberate choice; only prompt before the snapshot exists.
    return !hasNetWorthEntries(snapshot) && (previous?.pensions.length ?? 0) > 0 ? 'todo' : 'none';
  }
  if (previous && previous.pensions.length > 0 && sameValues(pensionValues(snapshot), pensionValues(previous))) {
    return 'unchanged';
  }
  return 'done';
}

/** Derive the month's check-in status from saved data; nothing extra is persisted. */
export function deriveMonthCheckIn(
  cashflow: ExpenseTrackerData | null, netWorth: NetWorthTrackerData | null, period: MonthPeriod,
): MonthCheckInStatus {
  const cashflowMonth = findCashflowMonth(cashflow, period);
  const steps: Record<MonthLogStepId, MonthLogStepState> = {
    income: (cashflowMonth?.incomes.length ?? 0) > 0 ? 'done' : 'todo',
    expenses: (cashflowMonth?.expenses.length ?? 0) > 0 ? 'done' : 'todo',
    investments: investmentsState(netWorth, period),
    pension: pensionState(netWorth, period),
  };
  const states = MONTH_LOG_STEPS.map(step => steps[step]);
  const completedCount = states.filter(state => state !== 'todo').length;
  return {
    period,
    steps,
    completedCount,
    isComplete: completedCount === MONTH_LOG_STEPS.length,
    hasStarted: states.some(state => state === 'done' || state === 'unchanged'),
    nextStep: MONTH_LOG_STEPS.find(step => steps[step] === 'todo')
      ?? MONTH_LOG_STEPS.find(step => steps[step] === 'unchanged')
      ?? null,
  };
}

/** Status for the current and previous months, and the month to suggest logging. */
export function buildMonthLogOverview(
  cashflow: ExpenseTrackerData | null, netWorth: NetWorthTrackerData | null, now = new Date(), count = 12,
): MonthLogOverview {
  const current = periodOf(now);
  const months: MonthCheckInStatus[] = [];
  let period = current;
  for (let index = 0; index < count; index += 1) {
    months.push(deriveMonthCheckIn(cashflow, netWorth, period));
    period = previousPeriod(period);
  }
  const previous = months[1];
  const suggested = now.getDate() <= PREVIOUS_MONTH_GRACE_DAYS && previous && !previous.isComplete
    ? previous.period : current;
  return { current, suggested, months };
}

export function monthLogPath(period: MonthPeriod, step?: string): string {
  const params = new URLSearchParams({ year: String(period.year), month: String(period.month) });
  if (step) params.set('step', step);
  return `/log-month?${params.toString()}`;
}

/* Income drafts */

export interface IncomeDraft {
  key: string;
  description: string;
  source: IncomeSource;
  amount: string;
  date: string;
  currency?: SupportedCurrency;
  isRecurring?: boolean;
  /** True when a matching income is already logged in the target month. */
  possibleDuplicate?: boolean;
}

export type IncomeDraftField = 'description' | 'amount' | 'date';
export type IncomeDraftErrors = Partial<Record<IncomeDraftField, 'required' | 'invalid' | 'outsideMonth'>>;

let draftCounter = 0;
export function createIncomeDraft(period: MonthPeriod, today = new Date()): IncomeDraft {
  draftCounter += 1;
  const current = periodOf(today);
  const day = samePeriod(current, period) ? today.getDate() : 1;
  return { key: `income-draft-${draftCounter}`, description: '', source: 'SALARY', amount: '', date: monthDate(period, day) };
}

export function isBlankIncomeDraft(draft: IncomeDraft): boolean {
  return draft.description.trim() === '' && draft.amount.trim() === '';
}

/** Parse a number typed with a dot or comma decimal separator; null when invalid. */
export function parseNumberInput(value: string, { allowNegative = false } = {}): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  const pattern = allowNegative ? /^-?(\d+(\.\d*)?|\.\d+)$/ : /^(\d+(\.\d*)?|\.\d+)$/;
  if (!pattern.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True for partial input such as "-" or "." that may still become a number. */
export function isIncompleteNumberInput(value: string): boolean {
  return /^-?[.,]?$/.test(value.trim());
}

/** Finite, non-negative amounts. */
export function parseAmount(value: string): number | null {
  return parseNumberInput(value);
}

export function validateIncomeDraft(draft: IncomeDraft, period: MonthPeriod): IncomeDraftErrors {
  const errors: IncomeDraftErrors = {};
  if (!draft.description.trim()) errors.description = 'required';
  if (!draft.amount.trim()) errors.amount = 'required';
  else if (parseAmount(draft.amount) === null) errors.amount = 'invalid';
  if (!isValidCalendarDate(draft.date)) errors.date = 'invalid';
  else if (!draft.date.startsWith(`${periodKey(period)}-`)) errors.date = 'outsideMonth';
  return errors;
}

export function incomeFromDraft(draft: IncomeDraft, id: string): IncomeEntry {
  const amount = parseAmount(draft.amount);
  if (amount === null) throw new Error('Income amount must be a finite non-negative number.');
  return {
    id,
    type: 'income',
    date: draft.date,
    amount,
    description: draft.description.trim(),
    source: draft.source,
    ...(draft.currency ? { currency: draft.currency } : {}),
    ...(draft.isRecurring ? { isRecurring: true } : {}),
  };
}

function incomeMatchKey(entry: { description: string; source: string }): string {
  return `${entry.source}:${entry.description.trim().toLowerCase()}`;
}

/** The most recent month before `period` that has income entries. */
export function findPreviousIncomeMonth(data: ExpenseTrackerData | null, period: MonthPeriod): MonthData | null {
  let latest: MonthData | null = null;
  for (const yearData of data?.years ?? []) {
    for (const monthData of yearData.months) {
      if (monthData.incomes.length === 0 || comparePeriods(monthData, period) >= 0) continue;
      if (!latest || comparePeriods(monthData, latest) > 0) latest = monthData;
    }
  }
  return latest;
}

/**
 * Editable drafts from the most recent earlier month's incomes, moved into
 * `period` with the same day (clamped to the month length). Incomes recorded
 * from planning schedules are left out because they belong to their schedule.
 */
export function copyIncomeDraftsFromPreviousMonth(data: ExpenseTrackerData | null, period: MonthPeriod): IncomeDraft[] {
  const source = findPreviousIncomeMonth(data, period);
  if (!source) return [];
  const existing = new Set((findCashflowMonth(data, period)?.incomes ?? []).map(incomeMatchKey));
  return source.incomes
    .filter(income => !income.scheduleId)
    .map(income => {
      draftCounter += 1;
      const day = Number(income.date.slice(8, 10)) || 1;
      return {
        key: `income-draft-${draftCounter}`,
        description: income.description,
        source: income.source,
        amount: String(income.amount),
        date: monthDate(period, day),
        ...(income.currency ? { currency: income.currency } : {}),
        ...(income.isRecurring ? { isRecurring: true } : {}),
        possibleDuplicate: existing.has(incomeMatchKey(income)),
      };
    });
}

/** Append incomes to a month, creating the year and month when needed. */
export function appendIncomesToMonth(
  data: ExpenseTrackerData, period: MonthPeriod, incomes: IncomeEntry[],
): ExpenseTrackerData {
  const next: ExpenseTrackerData = JSON.parse(JSON.stringify(data));
  let yearData = next.years.find(entry => entry.year === period.year);
  if (!yearData) {
    yearData = createEmptyYearData(period.year);
    next.years.push(yearData);
    next.years.sort((a, b) => a.year - b.year);
  }
  let monthData = yearData.months.find(entry => entry.month === period.month);
  if (!monthData) {
    monthData = createEmptyMonthData(period.year, period.month);
    yearData.months.push(monthData);
    yearData.months.sort((a, b) => a.month - b.month);
  }
  monthData.incomes.push(...incomes);
  return next;
}

export function createEmptyCashflowData(currency: SupportedCurrency, now = new Date()): ExpenseTrackerData {
  return {
    years: [],
    currentYear: now.getFullYear(),
    currentMonth: now.getMonth() + 1,
    currency,
    globalBudgets: [],
  };
}
