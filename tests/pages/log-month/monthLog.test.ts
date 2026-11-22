import { describe, expect, it } from 'vitest';
import { createEmptyMonthData, type ExpenseTrackerData, type IncomeEntry } from '../../../src/types/expenseTracker';
import { createEmptyMonthlySnapshot, type MonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import {
  appendIncomesToMonth,
  buildMonthLogOverview,
  copyIncomeDraftsFromPreviousMonth,
  createIncomeDraft,
  deriveMonthCheckIn,
  monthLogPath,
  parseNumberInput,
  parsePeriod,
  validateIncomeDraft,
} from '../../../src/utils/monthLog';

const MARCH = { year: 2026, month: 3 };

function income(id: string, date: string, amount: number, extra: Partial<IncomeEntry> = {}): IncomeEntry {
  return { id, type: 'income', date, amount, description: 'Synthetic salary', source: 'SALARY', ...extra };
}

function cashflow(months: Array<{ year: number; month: number; incomes?: IncomeEntry[]; expenseCount?: number }>): ExpenseTrackerData {
  const years = [...new Set(months.map(month => month.year))].map(year => ({
    year,
    months: months.filter(month => month.year === year).map(month => ({
      ...createEmptyMonthData(month.year, month.month),
      incomes: month.incomes ?? [],
      expenses: Array.from({ length: month.expenseCount ?? 0 }, (_, index) => ({
        id: `e-${month.month}-${index}`, type: 'expense' as const, date: `${month.year}-${String(month.month).padStart(2, '0')}-02`,
        amount: 10, description: 'Synthetic expense', category: 'GROCERIES', expenseType: 'NEED' as const,
      })),
    })),
  }));
  return { years, currentYear: 2026, currentMonth: 3, currency: 'EUR', globalBudgets: [] };
}

function snapshot(year: number, month: number, values: { asset?: number; cash?: number; pension?: number } = {}): MonthlySnapshot {
  return {
    ...createEmptyMonthlySnapshot(year, month),
    assets: values.asset === undefined ? [] : [{
      id: `a-${month}`, ticker: 'SYN', name: 'Synthetic fund', shares: 10, pricePerShare: values.asset,
      currency: 'EUR', assetClass: 'ETF',
    }],
    cashEntries: values.cash === undefined ? [] : [{
      id: `c-${month}`, accountName: 'Synthetic bank', accountType: 'CHECKING', balance: values.cash, currency: 'EUR',
    }],
    pensions: values.pension === undefined ? [] : [{
      id: `p-${month}`, name: 'Synthetic pension', pensionType: 'PRIVATE', currentValue: values.pension, currency: 'EUR',
    }],
  };
}

function netWorth(...snapshots: MonthlySnapshot[]): NetWorthTrackerData {
  const years = [...new Set(snapshots.map(item => item.year))].map(year => ({
    year, months: snapshots.filter(item => item.year === year),
  }));
  return {
    years, currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
  };
}

describe('month check-in status', () => {
  it('reports every step as missing without saved data, and pensions as optional', () => {
    const status = deriveMonthCheckIn(null, null, MARCH);
    expect(status.steps).toEqual({ income: 'todo', expenses: 'todo', investments: 'todo', pension: 'none' });
    expect(status).toMatchObject({ completedCount: 1, isComplete: false, hasStarted: false, nextStep: 'income' });
  });

  it('derives logged cash flow and changed snapshot values from saved data', () => {
    const status = deriveMonthCheckIn(
      cashflow([{ ...MARCH, incomes: [income('i', '2026-03-25', 3000)], expenseCount: 2 }]),
      netWorth(snapshot(2026, 2, { asset: 100, cash: 500, pension: 9000 }), snapshot(2026, 3, { asset: 104, cash: 500, pension: 9150 })),
      MARCH,
    );
    expect(status.steps).toEqual({ income: 'done', expenses: 'done', investments: 'done', pension: 'done' });
    expect(status).toMatchObject({ completedCount: 4, isComplete: true, nextStep: null });
  });

  it('flags snapshots copied from the previous month without changes', () => {
    const copied = netWorth(snapshot(2026, 2, { asset: 100, cash: 500, pension: 9000 }), snapshot(2026, 3, { asset: 100, cash: 500, pension: 9000 }));
    const status = deriveMonthCheckIn(null, copied, MARCH);
    expect(status.steps.investments).toBe('unchanged');
    expect(status.steps.pension).toBe('unchanged');
    expect(status.nextStep).toBe('income');

    const cashflowLogged = cashflow([{ ...MARCH, incomes: [income('i', '2026-03-01', 1)], expenseCount: 1 }]);
    expect(deriveMonthCheckIn(cashflowLogged, copied, MARCH)).toMatchObject({ isComplete: true, nextStep: 'investments' });
  });

  it('asks for pensions only before the month snapshot exists', () => {
    expect(deriveMonthCheckIn(null, netWorth(snapshot(2026, 1, { pension: 100 })), MARCH).steps.pension).toBe('todo');
    expect(deriveMonthCheckIn(null, netWorth(snapshot(2026, 2, { pension: 100 }), snapshot(2026, 3, { cash: 1 })), MARCH).steps.pension)
      .toBe('none');
  });

  it('suggests the previous month early in a month only while it is incomplete', () => {
    const early = new Date(2026, 2, 5, 12);
    expect(buildMonthLogOverview(null, null, early).suggested).toEqual({ year: 2026, month: 2 });
    expect(buildMonthLogOverview(null, null, new Date(2026, 2, 11, 12)).suggested).toEqual(MARCH);
    expect(buildMonthLogOverview(null, null, new Date(2026, 0, 3, 12)).suggested).toEqual({ year: 2025, month: 12 });

    const completeFebruary = buildMonthLogOverview(
      cashflow([{ year: 2026, month: 2, incomes: [income('i', '2026-02-25', 1)], expenseCount: 1 }]),
      netWorth(snapshot(2026, 2, { cash: 10 })),
      early,
    );
    expect(completeFebruary.suggested).toEqual(MARCH);
    expect(completeFebruary.months).toHaveLength(12);
    expect(completeFebruary.months[0].period).toEqual(MARCH);
  });

  it('builds deep links and rejects invalid URL periods', () => {
    expect(monthLogPath(MARCH, 'pension')).toBe('/log-month?year=2026&month=3&step=pension');
    expect(parsePeriod('2026', '13', MARCH)).toEqual(MARCH);
    expect(parsePeriod('20x6', '2', MARCH)).toEqual(MARCH);
    expect(parsePeriod('2025', '12', MARCH)).toEqual({ year: 2025, month: 12 });
  });
});

describe('income drafts', () => {
  it('copies the latest earlier income month as editable drafts within the target month', () => {
    const data = cashflow([
      { year: 2026, month: 1, incomes: [
        income('salary', '2026-01-31', 3000, { isRecurring: true }),
        income('planned', '2026-01-15', 200, { description: 'Synthetic plan', scheduleId: 'schedule-1', scheduledDate: '2026-01-15' }),
      ] },
      { year: 2026, month: 2 },
      { ...MARCH, incomes: [income('existing', '2026-03-01', 3000)] },
    ]);
    const drafts = copyIncomeDraftsFromPreviousMonth(data, { year: 2026, month: 2 });
    expect(drafts).toEqual([expect.objectContaining({
      description: 'Synthetic salary', amount: '3000', date: '2026-02-28', source: 'SALARY', isRecurring: true, possibleDuplicate: false,
    })]);
    expect(copyIncomeDraftsFromPreviousMonth(data, { year: 2026, month: 4 })).toEqual([
      expect.objectContaining({ date: '2026-04-01', amount: '3000' }),
    ]);
    expect(copyIncomeDraftsFromPreviousMonth(data, { year: 2026, month: 1 })).toEqual([]);
  });

  it('marks copied rows that look already logged in the target month', () => {
    const data = cashflow([
      { year: 2026, month: 2, incomes: [income('salary', '2026-02-27', 3000)] },
      { ...MARCH, incomes: [income('existing', '2026-03-27', 3100)] },
    ]);
    expect(copyIncomeDraftsFromPreviousMonth(data, MARCH)).toEqual([
      expect.objectContaining({ date: '2026-03-27', possibleDuplicate: true }),
    ]);
  });

  it('reads thousands and decimals with the saved decimal separator', () => {
    expect(parseNumberInput('3,200', { decimalSeparator: '.' })).toBe(3200);
    expect(parseNumberInput('1,234.56', { decimalSeparator: '.' })).toBe(1234.56);
    expect(parseNumberInput('23.921', { decimalSeparator: '.' })).toBe(23.921);
    expect(parseNumberInput('3,2', { decimalSeparator: '.' })).toBeNull();
    expect(parseNumberInput('3,2', { decimalSeparator: ',' })).toBe(3.2);
    expect(parseNumberInput('1.234,56', { decimalSeparator: ',' })).toBe(1234.56);
    expect(parseNumberInput('12\u00a0500', { decimalSeparator: ',' })).toBe(12500);
    expect(parseNumberInput('-4.5', { decimalSeparator: '.', allowNegative: true })).toBe(-4.5);
    expect(parseNumberInput('-4.5', { decimalSeparator: '.' })).toBeNull();
  });

  it('accepts only finite non-negative amounts and calendar dates inside the month', () => {
    const draft = { ...createIncomeDraft(MARCH), description: 'Synthetic', amount: '12.50', date: '2026-03-31' };
    expect(validateIncomeDraft(draft, MARCH)).toEqual({});
    expect(validateIncomeDraft({ ...draft, amount: '-1' }, MARCH)).toEqual({ amount: 'invalid' });
    expect(validateIncomeDraft({ ...draft, amount: 'Infinity' }, MARCH)).toEqual({ amount: 'invalid' });
    expect(validateIncomeDraft({ ...draft, amount: '1e3' }, MARCH)).toEqual({ amount: 'invalid' });
    expect(validateIncomeDraft({ ...draft, amount: '12.' }, MARCH)).toEqual({});
    expect(validateIncomeDraft({ ...draft, amount: '' }, MARCH)).toEqual({ amount: 'required' });
    expect(validateIncomeDraft({ ...draft, date: '2026-02-30' }, MARCH)).toEqual({ date: 'invalid' });
    expect(validateIncomeDraft({ ...draft, date: '2026-04-01' }, MARCH)).toEqual({ date: 'outsideMonth' });
    expect(validateIncomeDraft({ ...draft, description: ' ' }, MARCH)).toEqual({ description: 'required' });
  });

  it('appends incomes to a new month without changing the original data', () => {
    const data = cashflow([{ year: 2025, month: 12, incomes: [income('old', '2025-12-01', 1)] }]);
    const before = structuredClone(data);
    const next = appendIncomesToMonth(data, MARCH, [income('new', '2026-03-02', 50)]);
    expect(data).toEqual(before);
    expect(next.years.map(year => year.year)).toEqual([2025, 2026]);
    expect(next.years[1].months[0]).toMatchObject({ month: 3, incomes: [expect.objectContaining({ id: 'new', amount: 50 })] });
  });
});
