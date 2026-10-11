import {
  createEmptyMonthData, createEmptyYearData, INCOME_SOURCES, NO_CATEGORY_ID,
  type ExpenseEntry, type ExpenseTrackerData, type IncomeEntry,
} from '../types/expenseTracker';
import type { ParsedTransactionDraft } from '../types/pdfImport';
import { isValidCalendarDate } from './dateValidation';

export function mergeImportedTransactions(data: ExpenseTrackerData, drafts: ParsedTransactionDraft[]): ExpenseTrackerData {
  const included = drafts.filter(draft => draft.include);
  if (included.some(draft => !draft.id || !isValidCalendarDate(draft.date)
    || !Number.isFinite(draft.amount) || draft.amount <= 0 || !['expense', 'income'].includes(draft.kind))) {
    throw new Error('Every included transaction needs a valid date and a finite amount greater than zero.');
  }
  const next = structuredClone(data);
  const ids = new Set(next.years.flatMap(year => year.months.flatMap(month => [...month.expenses, ...month.incomes].map(entry => entry.id))));
  for (const draft of included) {
    if (ids.has(draft.id)) continue;
    const [year, month] = draft.date.split('-').map(Number);
    let targetYear = next.years.find(entry => entry.year === year);
    if (!targetYear) {
      targetYear = createEmptyYearData(year);
      next.years.push(targetYear);
    }
    let targetMonth = targetYear.months.find(entry => entry.month === month);
    if (!targetMonth) {
      targetMonth = createEmptyMonthData(year, month);
      targetYear.months.push(targetMonth);
      targetYear.months.sort((a, b) => a.month - b.month);
    }
    const transaction = {
      id: draft.id, date: draft.date, amount: draft.amount,
      currency: draft.currency ?? data.currency, description: draft.description,
    };
    if (draft.kind === 'expense') {
      const expense: ExpenseEntry = {
        ...transaction, type: 'expense', category: draft.suggestedCategory ?? NO_CATEGORY_ID,
        expenseType: draft.suggestedExpenseType ?? 'WANT',
      };
      targetMonth.expenses.push(expense);
    } else {
      const source = INCOME_SOURCES.find(source => source.id === draft.suggestedIncomeSource);
      const income: IncomeEntry = { ...transaction, type: 'income', source: source?.id ?? 'OTHER' };
      targetMonth.incomes.push(income);
    }
    ids.add(draft.id);
  }
  next.years.sort((a, b) => b.year - a.year);
  return next;
}
