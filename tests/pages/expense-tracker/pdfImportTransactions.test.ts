import { describe, expect, it } from 'vitest';
import type { ExpenseTrackerData } from '../../../src/types/expenseTracker';
import type { ParsedTransactionDraft } from '../../../src/types/pdfImport';
import { mergeImportedTransactions } from '../../../src/utils/pdfImportTransactions';

const data: ExpenseTrackerData = {
  currency: 'EUR', currentYear: 2026, currentMonth: 3,
  globalBudgets: [{ category: 'OTHER', monthlyBudget: 100 }],
  years: [{ year: 2020, isArchived: true, months: [{ year: 2020, month: 1, expenses: [], incomes: [], budgets: [], isClosed: true }] }],
};
const draft: ParsedTransactionDraft = {
  id: 'receipt-42-0', kind: 'expense', date: '2024-02-29', amount: 12.5,
  description: 'Synthetic receipt', docType: 'receipt', sourceFile: 'synthetic.png', include: true, confidence: 0.9,
};

describe('mergeImportedTransactions', () => {
  it('adds a reviewed batch without losing unrelated histories, closed months or budgets', () => {
    const next = mergeImportedTransactions(data, [draft]);
    expect(data.years).toHaveLength(1);
    expect(next.years.find(year => year.year === 2020)).toEqual(data.years[0]);
    expect(next.globalBudgets).toEqual(data.globalBudgets);
    expect(next.years.find(year => year.year === 2024)?.months[0].expenses[0]).toMatchObject({
      id: draft.id, amount: 12.5, date: '2024-02-29',
    });
  });

  it('is idempotent when a receipt confirmation is retried after a network failure', () => {
    const once = mergeImportedTransactions(data, [draft]);
    expect(mergeImportedTransactions(once, [draft])).toEqual(once);
  });

  it('validates the whole included batch before replacing any saved state', () => {
    expect(() => mergeImportedTransactions(data, [draft, { ...draft, id: 'bad', date: '2026-02-30' }])).toThrow();
    expect(() => mergeImportedTransactions(data, [{ ...draft, amount: Infinity }])).toThrow();
    expect(data.years).toHaveLength(1);
    expect(mergeImportedTransactions(data, [{ ...draft, include: false }])).toEqual(data);
  });
});
