import { z } from 'zod';
import type { ExpensePlanningData, ScheduledOccurrenceReference } from '../types/expensePlanning';
import {
  INCOME_SOURCES, type IncomeSource, type ExpenseTrackerData, type IncomeEntry, type ExpenseEntry,
} from '../types/expenseTracker';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types/currency';
import { isValidCalendarDate } from './dateValidation';

const date = z.string().refine(isValidCalendarDate, 'Invalid calendar date.');
const id = z.string().min(1).refine(value => value.trim() === value, 'Invalid identifier.');
const name = z.string().refine(value => value.trim().length > 0, 'A name is required.');
const amount = z.number().finite().nonnegative();
const currency = z.custom<SupportedCurrency>(value =>
  typeof value === 'string' && SUPPORTED_CURRENCIES.some(item => item.code === value),
  'Unsupported currency.');
const source = z.custom<IncomeSource>(value =>
  typeof value === 'string' && INCOME_SOURCES.some(item => item.id === value),
  'Invalid income source.');
const expenseType = z.enum(['NEED', 'WANT']);
const occurrenceReference = z.object({ scheduleId: id, scheduledDate: date });
const scheduleBase = {
  id, name, amount, currency, startDate: date, endDate: date.optional(),
  recurrence: z.object({
    unit: z.enum(['once', 'day', 'week', 'month', 'year']),
    interval: z.number().int().positive(),
  }).strict(),
  enabled: z.boolean(), archived: z.boolean(),
};
const schedule = z.discriminatedUnion('kind', [
  z.object({ ...scheduleBase, kind: z.literal('expense'), category: id, expenseType }).strict(),
  z.object({ ...scheduleBase, kind: z.literal('income'), source }).strict(),
]).refine(value => !value.endDate || value.endDate >= value.startDate, {
  message: 'End date must not precede start date.', path: ['endDate'],
});

const match = z.object({
  description: name, operator: z.enum(['equals', 'contains']), currency: currency.optional(),
  minAmount: amount.optional(), maxAmount: amount.optional(),
}).strict().superRefine((value, context) => {
  if ((value.minAmount !== undefined || value.maxAmount !== undefined) && !value.currency) {
    context.addIssue({ code: 'custom', path: ['currency'], message: 'Amount matching requires a currency.' });
  }
  if (value.minAmount !== undefined && value.maxAmount !== undefined && value.minAmount > value.maxAmount) {
    context.addIssue({ code: 'custom', path: ['maxAmount'], message: 'Maximum must not be less than minimum.' });
  }
});
const ruleBase = { id, name, enabled: z.boolean(), priority: z.number().int().nonnegative(), match };
const rule = z.discriminatedUnion('kind', [
  z.object({ ...ruleBase, kind: z.literal('expense'), category: id, expenseType }).strict(),
  z.object({ ...ruleBase, kind: z.literal('income'), source }).strict(),
]);

export const expensePlanningSchema: z.ZodType<ExpensePlanningData> = z.object({
  schemaVersion: z.literal(1),
  schedules: z.array(schedule),
  skippedOccurrences: z.array(z.object({ scheduleId: id, scheduledDate: date }).strict()),
  goals: z.array(z.object({
    id, name, currency, targetAmount: amount.positive(), savedAmount: amount,
    targetDate: date.optional(), archived: z.boolean(),
  }).strict()),
  rules: z.array(rule),
  forecast: z.object({
    openingBalance: z.number().finite(), startDate: date, currency,
    horizon: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  for (const key of ['schedules', 'goals', 'rules'] as const) {
    const ids = new Set<string>();
    value[key].forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({
        code: 'custom', path: [key, index, 'id'], message: 'Duplicate identifier.',
      });
      ids.add(item.id);
    });
  }
  const schedules = new Set(value.schedules.map(item => item.id));
  const occurrences = new Set<string>();
  value.skippedOccurrences.forEach((item, index) => {
    const key = `${item.scheduleId}:${item.scheduledDate}`;
    if (!schedules.has(item.scheduleId) || occurrences.has(key)) context.addIssue({
      code: 'custom', path: ['skippedOccurrences', index], message: 'Invalid or duplicate skipped occurrence.',
    });
    occurrences.add(key);
  });
});

export function createEmptyExpensePlanning(): ExpensePlanningData {
  return { schemaVersion: 1, schedules: [], skippedOccurrences: [], goals: [], rules: [] };
}

export function parseExpensePlanning(value: unknown): ExpensePlanningData {
  return value === undefined ? createEmptyExpensePlanning() : expensePlanningSchema.parse(value);
}

export function occurrenceKey(reference: ScheduledOccurrenceReference): string {
  return `${reference.scheduleId}:${reference.scheduledDate}`;
}

export function cashflowTransactions(data: ExpenseTrackerData): (IncomeEntry | ExpenseEntry)[] {
  return data.years.flatMap(year => year.months.flatMap(month => [...month.incomes, ...month.expenses]));
}

export function validateExpenseTrackerPlanning(data: ExpenseTrackerData): void {
  if (data.planning !== undefined) parseExpensePlanning(data.planning);
  const occurrences = new Set<string>();
  for (const transaction of cashflowTransactions(data)) {
    if (transaction.scheduleId === undefined && transaction.scheduledDate === undefined) continue;
    const reference = occurrenceReference.parse(transaction);
    if (transaction.isRecurring || !isValidCalendarDate(transaction.date)
      || !Number.isFinite(transaction.amount) || transaction.amount < 0) {
      throw new Error('Invalid scheduled transaction.');
    }
    const key = occurrenceKey(reference);
    if (occurrences.has(key)) throw new Error('This scheduled occurrence is already recorded.');
    occurrences.add(key);
  }
}

export class ExpensePlanningError extends Error {
  constructor(readonly code: 'alreadyRecorded' | 'invalidOccurrence' | 'invalidInput', message: string) {
    super(message);
    this.name = 'ExpensePlanningError';
  }
}
