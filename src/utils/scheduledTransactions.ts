import type { CashflowSchedule, ScheduledOccurrenceReference } from '../types/expensePlanning';
import {
  createEmptyMonthData, createEmptyYearData, generateTransactionId, getAllCategories,
  type ExpenseTrackerData,
} from '../types/expenseTracker';
import { scheduleDates } from './cashflowSchedules';
import {
  cashflowTransactions, createEmptyExpensePlanning, ExpensePlanningError, occurrenceKey,
  validateExpenseTrackerPlanning,
} from './expensePlanning';
import { isValidCalendarDate } from './dateValidation';

const referenceValues = (reference: ScheduledOccurrenceReference): ScheduledOccurrenceReference => ({
  scheduleId: reference.scheduleId, scheduledDate: reference.scheduledDate,
});

function pendingSchedule(data: ExpenseTrackerData, reference: ScheduledOccurrenceReference): CashflowSchedule {
  validateExpenseTrackerPlanning(data);
  const schedule = data.planning?.schedules.find(item => item.id === reference.scheduleId);
  if (!schedule || !isValidCalendarDate(reference.scheduledDate)
    || !scheduleDates(schedule, reference.scheduledDate, reference.scheduledDate).length
    || (schedule.kind === 'expense' && !getAllCategories(data.customCategories, data.categoryOverrides)
      .some(category => category.id === schedule.category))) {
    throw new ExpensePlanningError('invalidOccurrence', 'This scheduled occurrence is no longer available.');
  }
  if (cashflowTransactions(data).some(transaction =>
    transaction.scheduleId === reference.scheduleId && transaction.scheduledDate === reference.scheduledDate)) {
    throw new ExpensePlanningError('alreadyRecorded', 'This scheduled occurrence is already recorded.');
  }
  return schedule;
}

export function recordScheduledOccurrence(
  data: ExpenseTrackerData, reference: ScheduledOccurrenceReference, actual: { date: string; amount: number },
): ExpenseTrackerData {
  const schedule = pendingSchedule(data, reference);
  if (!isValidCalendarDate(actual.date) || !Number.isFinite(actual.amount) || actual.amount < 0) {
    throw new ExpensePlanningError('invalidInput', 'A valid payment date and non-negative amount are required.');
  }
  const next = structuredClone(data);
  const [year, month] = actual.date.split('-').map(Number);
  let targetYear = next.years.find(item => item.year === year);
  if (!targetYear) {
    targetYear = createEmptyYearData(year);
    next.years.push(targetYear);
    next.years.sort((a, b) => b.year - a.year);
  }
  let targetMonth = targetYear.months.find(item => item.month === month);
  if (!targetMonth) {
    targetMonth = createEmptyMonthData(year, month);
    targetYear.months.push(targetMonth);
    targetYear.months.sort((a, b) => a.month - b.month);
  }
  const transaction = {
    id: generateTransactionId(), date: actual.date, amount: actual.amount, ...referenceValues(reference),
    description: schedule.name, currency: schedule.currency, isRecurring: false,
  };
  if (schedule.kind === 'expense') targetMonth.expenses.push({
    ...transaction, type: 'expense', category: schedule.category, expenseType: schedule.expenseType,
  });
  else targetMonth.incomes.push({ ...transaction, type: 'income', source: schedule.source });
  next.planning ??= createEmptyExpensePlanning();
  next.planning.skippedOccurrences = next.planning.skippedOccurrences
    .filter(item => occurrenceKey(item) !== occurrenceKey(reference));
  validateExpenseTrackerPlanning(next);
  return next;
}

export function linkScheduledOccurrence(
  data: ExpenseTrackerData, reference: ScheduledOccurrenceReference, transactionId: string,
): ExpenseTrackerData {
  const schedule = pendingSchedule(data, reference);
  const next = structuredClone(data);
  const transaction = cashflowTransactions(next).find(item => item.id === transactionId);
  if (!transaction || transaction.type !== schedule.kind
    || (transaction.currency ?? data.currency) !== schedule.currency || transaction.scheduleId || transaction.scheduledDate) {
    throw new ExpensePlanningError('invalidOccurrence', 'Choose an unlinked transaction of the same kind and currency.');
  }
  Object.assign(transaction, referenceValues(reference), { isRecurring: false });
  next.planning ??= createEmptyExpensePlanning();
  next.planning.skippedOccurrences = next.planning.skippedOccurrences
    .filter(item => occurrenceKey(item) !== occurrenceKey(reference));
  validateExpenseTrackerPlanning(next);
  return next;
}

export function skipScheduledOccurrence(
  data: ExpenseTrackerData, reference: ScheduledOccurrenceReference, skipped: boolean,
): ExpenseTrackerData {
  pendingSchedule(data, reference);
  const next = structuredClone(data);
  next.planning ??= createEmptyExpensePlanning();
  next.planning.skippedOccurrences = next.planning.skippedOccurrences
    .filter(item => occurrenceKey(item) !== occurrenceKey(reference));
  if (skipped) next.planning.skippedOccurrences.push(referenceValues(reference));
  return next;
}
