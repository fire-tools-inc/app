import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseStatistics } from '../../../src/components/ExpenseStatistics';
import type { ExpenseTrackerData } from '../../../src/types/expenseTracker';

vi.mock('../../../src/components/ExpenseStatisticsChart', () => ({
  ExpenseStatisticsChart: () => <div>Statistics chart</div>,
}));

const data: ExpenseTrackerData = {
  currentYear: 2026, currentMonth: 3, currency: 'EUR', globalBudgets: [],
  years: [
    { year: 2024, months: [{ year: 2024, month: 1, incomes: [], budgets: [], expenses: [
      { id: 'old', type: 'expense', date: '2024-01-10', amount: 120, description: 'Synthetic rent', category: 'HOUSING', expenseType: 'NEED' },
    ] }] },
    { year: 2026, months: [{ year: 2026, month: 3, incomes: [], budgets: [], expenses: [
      { id: 'current', type: 'expense', date: '2026-03-15', amount: 150, description: 'Synthetic groceries', category: 'GROCERIES', expenseType: 'NEED' },
      { id: 'future', type: 'expense', date: '2026-03-25', amount: 900, description: 'Synthetic future expense', category: 'OTHER', expenseType: 'WANT' },
    ] }] },
  ],
};

describe('ExpenseStatistics', () => {
  it('shows actual YTD total, elapsed-month average, historical average and accessible chart data', async () => {
    render(<ExpenseStatistics data={data} isPrivacyMode={false} now={new Date(2026, 2, 15)} />);
    expect(screen.getByLabelText('Expense statistics view')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Total expenses' })).getByText(/150/)).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Monthly average' })).getByText(/50/)).toBeTruthy();
    expect(screen.getByText('Historical monthly average')).toBeTruthy();
    expect(screen.getByText('Selected period: 01/01/2026 to 15/03/2026 (inclusive).')).toBeTruthy();
    fireEvent.click(screen.getByText('View statistics data'));
    expect(screen.getByRole('table', { name: 'Expense statistics data' })).toBeTruthy();
    await screen.findByText('Statistics chart');
  });

  it('shows totals per year and a yearly average, then supports an exact custom range', async () => {
    render(<ExpenseStatistics data={data} isPrivacyMode={false} now={new Date(2026, 2, 15)} />);
    fireEvent.change(screen.getByLabelText('Expense statistics view'), { target: { value: 'yearly' } });
    expect(screen.getByRole('group', { name: 'Yearly average' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Expense statistics view'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2024-01-10' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2024-01-10' } });
    expect(within(screen.getByRole('group', { name: 'Total expenses' })).getByText(/120/)).toBeTruthy();
    await screen.findByText('Statistics chart');
  });

  it('announces an invalid custom range instead of showing stale totals', () => {
    render(<ExpenseStatistics data={data} isPrivacyMode={false} now={new Date(2026, 2, 15)} />);
    fireEvent.change(screen.getByLabelText('Expense statistics view'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-03-01' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Total expenses' })).toBeNull();
  });
});
