import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogMonthPage } from '../../../src/components/LogMonthPage';
import type { QuickExpenseImportProps } from '../../../src/components/QuickExpenseImport';
import { createEmptyMonthData } from '../../../src/types/expenseTracker';
import { createEmptyMonthlySnapshot } from '../../../src/types/netWorthTracker';

const storage = vi.hoisted(() => ({
  loadExpenseTrackerData: vi.fn(),
  saveExpenseTrackerData: vi.fn(),
  hasStoredExpenseTrackerData: vi.fn(() => false),
  loadNetWorthTrackerData: vi.fn(),
  saveNetWorthTrackerData: vi.fn(),
  hasStoredNetWorthTrackerData: vi.fn(() => false),
  loadAssetAllocation: vi.fn(),
  saveAssetAllocation: vi.fn(),
}));
vi.mock('../../../src/utils/cookieStorage', () => storage);
vi.mock('../../../src/utils/demoMode', () => ({ IS_DEMO_MODE: true }));
vi.mock('../../../src/components/QuickExpenseImport', async () => {
  const { useState } = await import('react');
  function MockQuickExpenseImport({ onCommit }: QuickExpenseImportProps) {
    const [result, setResult] = useState('');
    const commit = () => {
      try {
        onCommit([{
          id: 'quick-1', type: 'expense', date: '2026-03-04', amount: 10,
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

function mount(step: string) {
  return render(<MemoryRouter initialEntries={[`/log-month?year=2026&month=3&step=${step}`]}><LogMonthPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 2, 15, 12));
  vi.clearAllMocks();
  storage.loadExpenseTrackerData.mockReturnValue({
    years: [{ year: 2026, months: [{
      ...createEmptyMonthData(2026, 2),
      incomes: [{ id: 'i', type: 'income', date: '2026-02-27', amount: 3000, description: 'Demo salary', source: 'SALARY' }],
    }] }],
    currentYear: 2026, currentMonth: 3, currency: 'EUR', globalBudgets: [],
  });
  storage.loadNetWorthTrackerData.mockReturnValue({
    years: [{ year: 2026, months: [{
      ...createEmptyMonthlySnapshot(2026, 2),
      pensions: [{ id: 'p', name: 'Demo pension', pensionType: 'STATE', currentValue: 1000, currency: 'EUR' }],
    }] }],
    currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('log month in the read-only demo', () => {
  it('lets every step be explored without saving or claiming success', () => {
    mount('income');
    expect(screen.getByText(/read-only demo/).textContent).toContain('nothing you enter is saved');
    fireEvent.click(screen.getByRole('button', { name: 'Copy from February 2026' }));
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Demo salary');
    expect((screen.getByRole('button', { name: 'Save 1 income' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mock quick import' }));
    expect(screen.getByText('Mock kept rows')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect((screen.getByRole('button', { name: 'Start from February 2026' }) as HTMLButtonElement).disabled).toBe(true);

    expect(storage.saveExpenseTrackerData).not.toHaveBeenCalled();
    expect(storage.saveNetWorthTrackerData).not.toHaveBeenCalled();
    expect(storage.saveAssetAllocation).not.toHaveBeenCalled();
  });
});
