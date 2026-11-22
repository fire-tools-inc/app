import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogMonthPage } from '../../../src/components/LogMonthPage';
import type { QuickExpenseImportProps } from '../../../src/components/QuickExpenseImport';
import { createEmptyMonthData, type ExpenseTrackerData, type IncomeEntry } from '../../../src/types/expenseTracker';
import { createEmptyMonthlySnapshot, type MonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import { expectDiagnostic } from '../../shared/diagnostics';

const storage = vi.hoisted(() => ({
  loadExpenseTrackerData: vi.fn(),
  saveExpenseTrackerData: vi.fn(),
  hasStoredExpenseTrackerData: vi.fn(),
  loadNetWorthTrackerData: vi.fn(),
  saveNetWorthTrackerData: vi.fn(),
  hasStoredNetWorthTrackerData: vi.fn(),
  loadAssetAllocation: vi.fn(),
  saveAssetAllocation: vi.fn(),
}));
vi.mock('../../../src/utils/cookieStorage', () => storage);
const settings = vi.hoisted(() => ({ saveSettings: vi.fn() }));
vi.mock('../../../src/utils/cookieSettings', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/utils/cookieSettings')>(),
  saveSettings: settings.saveSettings,
}));
vi.mock('../../../src/components/QuickExpenseImport', async () => {
  const { useState } = await import('react');
  // Mirrors the component contract: a thrown commit keeps the rows and reports failure.
  function MockQuickExpenseImport({ year, month, onCommit }: QuickExpenseImportProps) {
    const [result, setResult] = useState('');
    const commit = () => {
      try {
        onCommit([{
          id: 'quick-1', type: 'expense', date: `${year}-${String(month).padStart(2, '0')}-04`, amount: 42.5,
          description: 'Synthetic groceries', category: 'GROCERIES', expenseType: 'NEED',
        }]);
        setResult('Mock committed');
      } catch {
        setResult('Mock kept rows');
      }
    };
    return <><button type="button" onClick={commit}>Mock quick import</button><p>{result}</p></>;
  }
  return { QuickExpenseImport: MockQuickExpenseImport };
});

let savedCashflow: ExpenseTrackerData | null;
let savedNetWorth: NetWorthTrackerData | null;

function salary(date: string, amount: number, extra: Partial<IncomeEntry> = {}): IncomeEntry {
  return { id: `salary-${date}`, type: 'income', date, amount, description: 'Synthetic salary', source: 'SALARY', ...extra };
}

function cashflowWith(months: Array<{ month: number; incomes?: IncomeEntry[] }>): ExpenseTrackerData {
  return {
    years: [{ year: 2026, months: months.map(item => ({ ...createEmptyMonthData(2026, item.month), incomes: item.incomes ?? [] })) }],
    currentYear: 2026, currentMonth: 3, currency: 'EUR', globalBudgets: [],
  };
}

function snapshot(month: number, values: { shares?: number; cash?: number; pension?: number }): MonthlySnapshot {
  return {
    ...createEmptyMonthlySnapshot(2026, month),
    assets: values.shares === undefined ? [] : [{
      id: `asset-${month}`, ticker: '', name: 'Synthetic fund', shares: values.shares, pricePerShare: 100, currency: 'EUR', assetClass: 'ETF',
    }],
    cashEntries: values.cash === undefined ? [] : [{
      id: `cash-${month}`, accountName: 'Synthetic bank', accountType: 'CHECKING', balance: values.cash, currency: 'EUR',
    }],
    pensions: values.pension === undefined ? [] : [{
      id: `pension-${month}`, name: 'Synthetic pension', pensionType: 'PRIVATE', currentValue: values.pension, currency: 'EUR',
    }],
  };
}

function netWorthWith(months: MonthlySnapshot[], sync = false): NetWorthTrackerData {
  return {
    years: [{ year: 2026, months }], currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true, syncWithAssetAllocation: sync },
  };
}

function savedMonth(month: number) {
  return storage.saveNetWorthTrackerData.mock.lastCall?.[0].years[0].months.find((item: MonthlySnapshot) => item.month === month);
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function mount(path = '/log-month?year=2026&month=3') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/log-month" element={<LogMonthPage />} />
        <Route path="/" element={<h1>Dashboard home</h1>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

const location = () => screen.getByTestId('location').textContent ?? '';
const stepper = () => within(screen.getByRole('navigation', { name: 'Month log steps' }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 15, 12));
  vi.clearAllMocks();
  savedCashflow = null;
  savedNetWorth = null;
  storage.loadExpenseTrackerData.mockImplementation(() => structuredClone(savedCashflow));
  storage.saveExpenseTrackerData.mockImplementation((data: ExpenseTrackerData) => { savedCashflow = structuredClone(data); });
  storage.loadNetWorthTrackerData.mockImplementation(() => structuredClone(savedNetWorth));
  storage.saveNetWorthTrackerData.mockImplementation((data: NetWorthTrackerData) => { savedNetWorth = structuredClone(data); });
  storage.hasStoredExpenseTrackerData.mockReturnValue(false);
  storage.hasStoredNetWorthTrackerData.mockReturnValue(false);
  storage.loadAssetAllocation.mockReturnValue({ assets: [], assetClassTargets: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('log month stepper', () => {
  it('keeps the month and step in the URL and moves between steps', () => {
    mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Log March 2026' })).toBeDefined();
    expect(screen.getByRole('heading', { level: 2, name: 'Income for March 2026' })).toBeDefined();
    expect(stepper().getByRole('link', { name: /^Income, Not logged/ }).getAttribute('aria-current')).toBe('step');
    expect(stepper().getByText('Step 1 of 5')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(location()).toBe('/log-month?year=2026&month=3&step=expenses');
    const expensesHeading = screen.getByRole('heading', { level: 2, name: 'Expenses for March 2026' });
    expect(document.activeElement).toBe(expensesHeading);
    expect(stepper().getByRole('link', { name: /^Expenses/ }).getAttribute('aria-current')).toBe('step');

    fireEvent.click(stepper().getByRole('link', { name: /^Pension/ }));
    expect(location()).toContain('step=pension');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(location()).toContain('step=investments');

    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-02' } });
    expect(location()).toBe('/log-month?year=2026&month=2&step=investments');
    expect(screen.getByRole('heading', { level: 2, name: 'Investments for February 2026' })).toBeDefined();

    fireEvent.click(stepper().getByRole('link', { name: /^Review/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Review February 2026' })).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: 'Finish' }));
    expect(screen.getByRole('heading', { name: 'Dashboard home' })).toBeDefined();
    expect(storage.saveExpenseTrackerData).not.toHaveBeenCalled();
    expect(storage.saveNetWorthTrackerData).not.toHaveBeenCalled();
  });

  it('falls back to the current month and first step for invalid URL values', () => {
    mount('/log-month?year=99&month=0&step=unknown');
    expect(screen.getByRole('heading', { level: 2, name: 'Income for March 2026' })).toBeDefined();
  });
});

describe('income step', () => {
  it('copies last month as editable drafts and saves only after confirmation', () => {
    savedCashflow = cashflowWith([{ month: 2, incomes: [salary('2026-02-27', 3000)] }]);
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Copy from February 2026' }));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Synthetic salary');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-03-27');
    expect(storage.saveExpenseTrackerData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '3100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 income' }));

    const march = savedCashflow!.years[0].months.find(month => month.month === 3)!;
    expect(march.incomes).toEqual([expect.objectContaining({
      amount: 3100, date: '2026-03-27', description: 'Synthetic salary', source: 'SALARY', type: 'income',
    })]);
    expect(savedCashflow!.years[0].months.find(month => month.month === 2)!.incomes).toHaveLength(1);
    expect(screen.getByText('Saved 1 income.')).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Income for March 2026' })).getByText('Logged')).toBeDefined();
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('');
  });

  it('rejects invalid amounts and keeps typed input when saving fails', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Synthetic bonus' } });
    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 income' }));
    expect(screen.getByText('Enter a number of 0 or more')).toBeDefined();
    expect(storage.saveExpenseTrackerData).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '250' } });
    storage.saveExpenseTrackerData.mockImplementationOnce(() => { throw new Error('Synthetic storage failure'); });
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 income' }));
    expect(screen.getByRole('alert').textContent).toContain('Could not save to Cashflow');
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Synthetic bonus');
    expect((screen.getByLabelText('Amount (EUR)') as HTMLInputElement).value).toBe('250');
    expect(screen.queryByText('Saved 1 income.')).toBeNull();
    expectDiagnostic('error', '[cashflow-save-failed]: month log cash flow changes could not be saved');

    fireEvent.click(screen.getByRole('button', { name: 'Save 1 income' }));
    expect(savedCashflow!.years[0].months[0].incomes).toEqual([expect.objectContaining({ amount: 250 })]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('blocks writes when saved cash flow data cannot be read', () => {
    storage.hasStoredExpenseTrackerData.mockReturnValue(true);
    mount();
    expect(screen.getByRole('alert').textContent).toContain('Saved Cashflow data could not be read');
    expect((screen.getByRole('button', { name: 'Save 1 income' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('expenses step', () => {
  it('appends quick-imported expenses to the month and summarizes them', () => {
    savedCashflow = cashflowWith([{ month: 3, incomes: [salary('2026-03-27', 3000)] }]);
    mount('/log-month?year=2026&month=3&step=expenses');
    expect(screen.getByText('No expenses logged for March 2026 yet.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Mock quick import' }));
    expect(savedCashflow!.years[0].months[0].expenses).toEqual([expect.objectContaining({ id: 'quick-1', amount: 42.5 })]);
    expect(savedCashflow!.years[0].months[0].incomes).toHaveLength(1);
    expect(screen.getByText('Mock committed')).toBeDefined();
    expect(screen.getByText('1 expense')).toBeDefined();

    fireEvent.click(stepper().getByRole('link', { name: /^Review/ }));
    const review = within(screen.getByRole('region', { name: 'Review March 2026' }));
    expect(review.getByText('€3,000')).toBeDefined();
    expect(review.getByText('€42.50')).toBeDefined();
  });

  it('tells the quick import when saving failed so it keeps the rows', () => {
    mount('/log-month?year=2026&month=3&step=expenses');
    storage.saveExpenseTrackerData.mockImplementationOnce(() => { throw new Error('Synthetic storage failure'); });
    fireEvent.click(screen.getByRole('button', { name: 'Mock quick import' }));
    expect(screen.getByText('Mock kept rows')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Could not save to Cashflow');
    expect(savedCashflow).toBeNull();
    expectDiagnostic('error', '[cashflow-save-failed]: month log cash flow changes could not be saved');
  });
});

describe('net worth steps', () => {
  it('starts from the previous snapshot and persists every valid holding edit', () => {
    savedNetWorth = netWorthWith([snapshot(2, { shares: 10, cash: 500, pension: 9000 })], true);
    mount('/log-month?year=2026&month=3&step=investments');
    fireEvent.click(screen.getByRole('button', { name: 'Start from February 2026' }));
    expect(savedMonth(3)).toMatchObject({
      assets: [expect.objectContaining({ name: 'Synthetic fund', shares: 10 })],
      cashEntries: [expect.objectContaining({ balance: 500 })],
      pensions: [expect.objectContaining({ currentValue: 9000 })],
    });
    expect(storage.saveAssetAllocation).toHaveBeenCalled();
    expect(within(screen.getByRole('region', { name: 'Investments for March 2026' })).getByText('Same as last month')).toBeDefined();

    const shares = screen.getByLabelText('Shares of Synthetic fund');
    fireEvent.change(shares, { target: { value: '12' } });
    expect(savedMonth(3).assets[0].shares).toBe(12);
    expect(screen.getAllByText('+€200.00')).toHaveLength(2);
    fireEvent.change(shares, { target: { value: '12x' } });
    expect(screen.getByText('Enter a number of 0 or more')).toBeDefined();
    expect(savedMonth(3).assets[0].shares).toBe(12);

    const balance = screen.getByLabelText('Balance of Synthetic bank');
    fireEvent.change(balance, { target: { value: '-' } });
    expect(screen.queryByText('Enter a number')).toBeNull();
    fireEvent.blur(balance);
    expect(screen.getByText('Enter a number')).toBeDefined();
    expect(savedMonth(3).cashEntries[0].balance).toBe(500);
    fireEvent.change(balance, { target: { value: '-20' } });
    expect(screen.queryByText('Enter a number')).toBeNull();
    expect(savedMonth(3).cashEntries[0].balance).toBe(-20);
    expect(savedMonth(2).cashEntries[0].balance).toBe(500);
  });

  it('keeps edits on screen when saving fails and saves them on retry', () => {
    savedNetWorth = netWorthWith([snapshot(2, { pension: 8800 }), snapshot(3, { pension: 9000 })]);
    mount('/log-month?year=2026&month=3&step=pension');
    storage.saveNetWorthTrackerData.mockImplementationOnce(() => { throw new Error('Synthetic storage failure'); });
    const value = screen.getByLabelText('Current value of Synthetic pension') as HTMLInputElement;
    fireEvent.change(value, { target: { value: '9300' } });
    expect(screen.getByRole('alert').textContent).toContain('Could not save your Net Worth changes');
    expect(value.value).toBe('9300');
    expect(savedNetWorth!.years[0].months[1].pensions[0].currentValue).toBe(9000);
    expectDiagnostic('error', '[net-worth-save-failed]: month log net worth changes could not be saved');

    fireEvent.click(screen.getByRole('button', { name: 'Try saving again' }));
    expect(savedNetWorth!.years[0].months[1].pensions[0].currentValue).toBe(9300);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByText('+€500.00')).toHaveLength(2);
  });

  it('adds pensions with validation and compares values with the previous month', () => {
    savedNetWorth = netWorthWith([snapshot(2, { pension: 8800 }), snapshot(3, { pension: 9000 })]);
    mount('/log-month?year=2026&month=3&step=pension');
    expect(screen.getByText('€8,800')).toBeDefined();
    expect(screen.getAllByText('+€200.00')).toHaveLength(2);

    const form = within(screen.getByRole('region', { name: 'Add a pension' }));
    fireEvent.change(form.getByLabelText('Pension'), { target: { value: 'synthetic PENSION' } });
    fireEvent.change(form.getByLabelText('Current value'), { target: { value: '100' } });
    fireEvent.click(form.getByRole('button', { name: 'Add pension' }));
    expect(form.getByText('A pension with this name already exists')).toBeDefined();
    expect(storage.saveNetWorthTrackerData).not.toHaveBeenCalled();

    fireEvent.change(form.getByLabelText('Pension'), { target: { value: 'Synthetic state pension' } });
    fireEvent.change(form.getByLabelText('Type'), { target: { value: 'STATE' } });
    fireEvent.click(form.getByRole('button', { name: 'Add pension' }));
    expect(savedMonth(3).pensions).toEqual([
      expect.objectContaining({ name: 'Synthetic pension' }),
      expect.objectContaining({ name: 'Synthetic state pension', pensionType: 'STATE', currentValue: 100, currency: 'EUR' }),
    ]);
    expect(screen.getByText('Added Synthetic state pension.')).toBeDefined();
  });

  it('hides saved values and editing controls in privacy mode', () => {
    savedNetWorth = netWorthWith([snapshot(2, { shares: 10 }), snapshot(3, { shares: 11, cash: 500 })]);
    const { container } = mount('/log-month?year=2026&month=3&step=investments');
    expect(screen.getByLabelText('Shares of Synthetic fund')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Hide values' }));
    expect(settings.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ privacyMode: true }));
    expect(screen.getByText('Values are hidden. Show values to view or edit them.')).toBeDefined();
    expect(screen.queryByLabelText('Shares of Synthetic fund')).toBeNull();
    expect(container.querySelectorAll('.log-month-table .privacy-blur').length).toBeGreaterThan(0);
  });

  it('points pension updates to the investments step before a snapshot exists', async () => {
    mount('/log-month?year=2026&month=3&step=pension');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Go to Investments' }));
    });
    expect(location()).toContain('step=investments');
    expect(screen.getByRole('button', { name: 'Start an empty snapshot' })).toBeDefined();
  });
});
