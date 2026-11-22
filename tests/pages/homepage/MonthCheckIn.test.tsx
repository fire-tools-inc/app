import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { LogMonthLink, MonthCheckIn } from '../../../src/components/MonthCheckIn';
import { createEmptyMonthData, type ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { createEmptyMonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import { buildMonthLogOverview } from '../../../src/utils/monthLog';

afterEach(cleanup);

const cashflow: ExpenseTrackerData = {
  years: [{ year: 2026, months: [{
    ...createEmptyMonthData(2026, 3),
    incomes: [{ id: 'i', type: 'income', date: '2026-03-01', amount: 3000, description: 'Synthetic salary', source: 'SALARY' }],
  }] }],
  currentYear: 2026, currentMonth: 3, currency: 'EUR', globalBudgets: [],
};

const netWorth: NetWorthTrackerData = {
  years: [{ year: 2026, months: [
    { ...createEmptyMonthlySnapshot(2026, 2),
      cashEntries: [{ id: 'c2', accountName: 'Synthetic bank', accountType: 'CHECKING', balance: 500, currency: 'EUR' }],
      pensions: [{ id: 'p2', name: 'Synthetic pension', pensionType: 'PRIVATE', currentValue: 9000, currency: 'EUR' }] },
    { ...createEmptyMonthlySnapshot(2026, 3),
      cashEntries: [{ id: 'c3', accountName: 'Synthetic bank', accountType: 'CHECKING', balance: 500, currency: 'EUR' }],
      pensions: [{ id: 'p3', name: 'Synthetic pension', pensionType: 'PRIVATE', currentValue: 9100, currency: 'EUR' }] },
  ] }],
  currentYear: 2026, currentMonth: 3, defaultCurrency: 'EUR',
  settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
};

function mount(now: Date) {
  const overview = buildMonthLogOverview(cashflow, netWorth, now);
  return render(<MemoryRouter><LogMonthLink overview={overview} /><MonthCheckIn overview={overview} /></MemoryRouter>);
}

describe('monthly check-in card', () => {
  it('shows derived step status and continues at the first step still to log', () => {
    mount(new Date(2026, 2, 20, 12));
    const card = within(screen.getByRole('region', { name: 'Monthly check-in' }));
    const steps = within(card.getByRole('list', { name: 'Check-in steps for March 2026' })).getAllByRole('link');
    expect(steps.map(step => step.textContent)).toEqual([
      '1IncomeLogged', '2ExpensesNot logged', '3InvestmentsSame as last month', '4PensionLogged',
    ]);
    expect(steps[1].getAttribute('href')).toBe('/log-month?year=2026&month=3&step=expenses');
    expect(card.getByText('3 of 4 steps logged')).toBeDefined();
    expect(card.getByRole('link', { name: 'Continue March 2026' }).getAttribute('href'))
      .toBe('/log-month?year=2026&month=3&step=expenses');
    expect(screen.getByRole('link', { name: 'Log March 2026' }).getAttribute('href')).toBe('/log-month?year=2026&month=3');
  });

  it('suggests the incomplete previous month early in the month and lets the user pick another', () => {
    mount(new Date(2026, 2, 4, 12));
    expect(screen.getByRole('link', { name: 'Log February 2026' }).getAttribute('href')).toBe('/log-month?year=2026&month=2');
    const card = within(screen.getByRole('region', { name: 'Monthly check-in' }));
    expect(card.getByText(/February 2026 is not complete yet/)).toBeDefined();
    expect(card.getByRole('link', { name: 'Continue February 2026' }).getAttribute('href'))
      .toBe('/log-month?year=2026&month=2&step=income');

    fireEvent.change(card.getByLabelText('Month'), { target: { value: '2026-03' } });
    expect(card.queryByText(/is not complete yet/)).toBeNull();
    expect(card.getByRole('link', { name: 'Continue March 2026' })).toBeDefined();
  });
});
