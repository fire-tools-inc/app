import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExpenseTrackerPage } from '../../../src/components/ExpenseTrackerPage';
import { loadExpenseTrackerData, saveExpenseTrackerData } from '../../../src/utils/cookieStorage';
import { cashflowFixture } from './planningFixtures';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const savedExpenses = () => loadExpenseTrackerData()?.years.find((year) => year.year === 2024)?.months.find((month) => month.month === 1)?.expenses ?? [];

describe('expense paid several times', () => {
  it('saves the price and times, shows them in the list and clears them when switched off', async () => {
    saveExpenseTrackerData(cashflowFixture());
    render(<MemoryRouter initialEntries={['/expense-tracker?year=2024&month=1']}><ExpenseTrackerPage /></MemoryRouter>);

    fireEvent.click((await screen.findAllByRole('button', { name: /add expense/i }))[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /same amount several times/i }));
    fireEvent.change(within(dialog).getByLabelText(/amount each/i), { target: { value: '45' } });
    fireEvent.change(within(dialog).getByLabelText('Times'), { target: { value: '2' } });
    expect(within(dialog).getByText(/Total:/).textContent).toMatch(/90/);
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'Synthetic sessions' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /add expense/i }));

    await waitFor(() => expect(savedExpenses()[0]).toMatchObject({ amount: 90, unitAmount: 45, quantity: 2 }));
    expect(screen.getByText(/× 2/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /edit transaction/i }));
    const editDialog = screen.getByRole('dialog');
    fireEvent.click(within(editDialog).getByRole('checkbox', { name: /same amount several times/i }));
    expect((within(editDialog).getByLabelText(/^amount/i) as HTMLInputElement).value).toBe('90');
    fireEvent.click(within(editDialog).getByRole('button', { name: /update expense/i }));
    await waitFor(() => expect(savedExpenses()[0]).not.toHaveProperty('unitAmount'));
    expect(savedExpenses()[0]).toMatchObject({ amount: 90 });
    expect(savedExpenses()[0]).not.toHaveProperty('quantity');
  });
});
