import { describe, expect, it } from 'vitest';
import {
  appendExpensesToMonth,
  applyAiSuggestions,
  classifyQuickImportRows,
  parseQuickAmount,
  parseQuickExpenseList,
  quickRowsToExpenses,
  toDraft,
} from '../../../src/utils/quickExpenseImport';
import type { ExpenseEntry, ExpenseTrackerData } from '../../../src/types/expenseTracker';

const options = { year: 2026, month: 11, defaultCurrency: 'EUR' as const };
const parse = (text: string) => parseQuickExpenseList(text, options);
const summary = (text: string) => parse(text).map(({ date, amount, description, currency, error, quantity, unitAmount }) => ({
  date, amount, description, currency, ...(error ? { error } : {}), ...(quantity ? { quantity, unitAmount } : {}),
}));

const tracker = (expenses: ExpenseEntry[] = [], extra: Partial<ExpenseTrackerData> = {}): ExpenseTrackerData => ({
  years: [{ year: 2026, months: [{ year: 2026, month: 10, incomes: [], expenses, budgets: [] }] }],
  currentYear: 2026, currentMonth: 11, currency: 'EUR', globalBudgets: [], ...extra,
});

describe('quick expense list parser', () => {
  it('reads amounts before or after the description with dot or comma decimals', () => {
    expect(summary('cinema 12.50\n12,50 cinema\n€ 54.20 groceries\nrent 1.250,00\nlaptop 1,299.99 USD\nbeer 4 £')).toEqual([
      { date: '2026-11-01', amount: 12.5, description: 'cinema', currency: 'EUR' },
      { date: '2026-11-01', amount: 12.5, description: 'cinema', currency: 'EUR' },
      { date: '2026-11-01', amount: 54.2, description: 'groceries', currency: 'EUR' },
      { date: '2026-11-01', amount: 1250, description: 'rent', currency: 'EUR' },
      { date: '2026-11-01', amount: 1299.99, description: 'laptop', currency: 'USD' },
      { date: '2026-11-01', amount: 4, description: 'beer', currency: 'GBP' },
    ]);
  });

  it('reads optional days and dates inside the selected month', () => {
    expect(summary('3 uber 15.30\n03/11 uber 15.30\n2026-11-03 uber 15.30\n11/04 taxi 9')).toEqual([
      { date: '2026-11-03', amount: 15.3, description: 'uber', currency: 'EUR' },
      { date: '2026-11-03', amount: 15.3, description: 'uber', currency: 'EUR' },
      { date: '2026-11-03', amount: 15.3, description: 'uber', currency: 'EUR' },
      { date: '2026-11-04', amount: 9, description: 'taxi', currency: 'EUR' },
    ]);
  });

  it('records an amount paid several times', () => {
    expect(summary('coffee 2x3.50\nsessions 45 x 2')).toEqual([
      { date: '2026-11-01', amount: 7, description: 'coffee', currency: 'EUR', quantity: 2, unitAmount: 3.5 },
      { date: '2026-11-01', amount: 90, description: 'sessions', currency: 'EUR', quantity: 2, unitAmount: 45 },
    ]);
  });

  it('reads spreadsheet rows and skips their header', () => {
    expect(summary('Date\tDescription\tAmount\n2026-11-05\tPharmacy\t8,40\n2026-11-06;Train ticket;23.10\n2026-11-07,Bakery,3.20')).toEqual([
      { date: '2026-11-05', amount: 8.4, description: 'Pharmacy', currency: 'EUR' },
      { date: '2026-11-06', amount: 23.1, description: 'Train ticket', currency: 'EUR' },
      { date: '2026-11-07', amount: 3.2, description: 'Bakery', currency: 'EUR' },
    ]);
  });

  it('keeps invalid lines with an actionable error instead of dropping them', () => {
    const rows = parse('just a note\n12.50\n2026-02-30 rent 900\n2026-10-31 dinner 40\n\n# comment');
    expect(rows.map(row => [row.rawLine, row.error, row.include])).toEqual([
      ['just a note', 'missingAmount', false],
      ['12.50', 'missingDescription', false],
      ['2026-02-30 rent 900', 'invalidDate', false],
      ['2026-10-31 dinner 40', 'outsideMonth', false],
    ]);
  });

  it('treats negative bank export amounts as the spent amount', () => {
    expect(summary('Groceries -23.40')[0]).toMatchObject({ amount: 23.4, description: 'Groceries' });
  });

  it('parses money strings', () => {
    expect(parseQuickAmount('1.234,56')).toBe(1234.56);
    expect(parseQuickAmount('1,234')).toBe(1234);
    expect(parseQuickAmount('0,5')).toBe(0.5);
    expect(parseQuickAmount('abc')).toBeNull();
  });
});

describe('quick expense matching', () => {
  it('applies import rules before local matching and learns from history', () => {
    const data = tracker([
      { id: 'h-1', type: 'expense', date: '2026-10-02', amount: 9, description: 'Corner kiosk', category: 'DINING_OUT', expenseType: 'NEED' },
    ], {
      planning: {
        schemaVersion: 1, schedules: [], skippedOccurrences: [], goals: [],
        rules: [{ id: 'rule-1', name: 'Synthetic rule', kind: 'expense', enabled: true, priority: 0,
          match: { description: 'cinema', operator: 'contains' }, category: 'ENTERTAINMENT', expenseType: 'NEED' }],
      },
    });
    const rows = classifyQuickImportRows(parse('cinema 12\ncorner kiosk 4\nmuseum 15\nzzqx 3'), data);
    expect(rows.map(row => [row.category, row.source, row.expenseType])).toEqual([
      ['ENTERTAINMENT', 'rule', 'NEED'],
      ['DINING_OUT', 'history', 'NEED'],
      ['LIFESTYLE_LEISURE', 'seed', 'WANT'],
      ['NO_CATEGORY', 'none', 'WANT'],
    ]);
    expect(rows[0].confidence).toBe(1);
  });

  it('sends only the description, amount and currency in AI drafts and applies enriched results', () => {
    const [row] = classifyQuickImportRows(parse('2026-11-03 zzqx 3'), tracker());
    const draft = toDraft(row);
    expect(draft).not.toHaveProperty('rawLine');
    const [updated] = applyAiSuggestions([row], [{ ...draft, suggestedCategory: 'OTHER', llmEnriched: true }]);
    expect(updated).toMatchObject({ category: 'OTHER', source: 'ai' });
    expect(applyAiSuggestions([row], [{ ...draft, suggestedCategory: 'OTHER' }])[0]).toBe(row);
  });

  it('creates expenses only for included rows without errors', () => {
    const rows = parse('coffee 2x3.50\nnote without amount\ntaxi 9');
    const expenses = quickRowsToExpenses(rows.map(row => row.description === 'taxi' ? { ...row, include: false } : row));
    expect(expenses).toEqual([expect.objectContaining({
      type: 'expense', date: '2026-11-01', amount: 7, description: 'coffee', unitAmount: 3.5, quantity: 2, currency: 'EUR',
    })]);
  });
});

describe('appendExpensesToMonth', () => {
  const entry = (id: string, date: string): ExpenseEntry => ({
    id, type: 'expense', date, amount: 1, description: id, category: 'OTHER', expenseType: 'WANT',
  });

  it('appends to an existing month without dropping entries or mutating the input', () => {
    const data = tracker([entry('existing', '2026-10-02')]);
    const snapshot = structuredClone(data);
    const next = appendExpensesToMonth(data, 2026, 10, [entry('new', '2026-10-05')]);
    expect(data).toEqual(snapshot);
    expect(next.years[0].months[0].expenses.map(expense => expense.id)).toEqual(['existing', 'new']);
  });

  it('creates the year and month when missing and keeps them sorted', () => {
    const data = tracker([entry('existing', '2026-10-02')]);
    const next = appendExpensesToMonth(data, 2027, 1, [entry('next-year', '2027-01-04')]);
    expect(next.years.map(year => year.year)).toEqual([2026, 2027]);
    expect(next.years[1].months).toEqual([expect.objectContaining({ month: 1, expenses: [entry('next-year', '2027-01-04')] })]);
    const earlier = appendExpensesToMonth(next, 2026, 9, [entry('september', '2026-09-01')]);
    expect(earlier.years[0].months.map(month => month.month)).toEqual([9, 10]);
    expect(earlier.years[0].months[1].expenses).toHaveLength(1);
  });
});
