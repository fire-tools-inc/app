import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseTrackerPage } from '../../../src/components/ExpenseTrackerPage';
import { loadExpenseTrackerData, saveExpenseTrackerData } from '../../../src/utils/cookieStorage';
import { cashflowFixture, planningFixture } from './planningFixtures';
import { encryptData } from '../../../src/utils/cookieEncryption';
import { expectDiagnostic } from '../../shared/diagnostics';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('cashflow planning workspace', () => {
  it('opens Planning directly without creating or copying ledger entries', async () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    saveExpenseTrackerData(data);
    const before = localStorage.getItem('fire-tools-expense-tracker');
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Planning' }).getAttribute('aria-selected')).toBe('true'));
    expect(localStorage.getItem('fire-tools-expense-tracker')).toBe(before);
    expect(loadExpenseTrackerData()?.years).toEqual(data.years);
  });

  it('adds a manually funded goal without changing actual transactions', async () => {
    const data = { ...cashflowFixture(), planning: planningFixture({ goals: [] }) };
    saveExpenseTrackerData(data);
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add goal' }));
    fireEvent.change(screen.getByLabelText('Goal name'), { target: { value: 'Synthetic target' } });
    fireEvent.change(screen.getByLabelText('Target amount'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Earmarked balance'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    await waitFor(() => expect(loadExpenseTrackerData()?.planning?.goals[0].savedAmount).toBe(50));
    expect(loadExpenseTrackerData()?.years).toEqual(data.years);
  });

  it('keeps corrupt planning bytes intact and blocks edits rather than seeding defaults', async () => {
    const data = { ...cashflowFixture(), planning: planningFixture() };
    data.planning.goals[0].savedAmount = -1;
    const original = encryptData(JSON.stringify(data));
    localStorage.setItem('fire-tools-expense-tracker', original);
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    await screen.findByRole('alert');
    expectDiagnostic('error', '[invalid-planning]: saved cashflow planning data could not be read');
    expect(localStorage.getItem('fire-tools-expense-tracker')).toBe(original);
    expect(screen.queryByRole('button', { name: 'Add goal' })).toBeNull();
  });

  it('keeps the prior goal and ledger after a quota failure and shows the failure', async () => {
    saveExpenseTrackerData({ ...cashflowFixture(), planning: planningFixture({ goals: [] }) });
    const original = localStorage.getItem('fire-tools-expense-tracker');
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add goal' }));
    fireEvent.change(screen.getByLabelText('Goal name'), { target: { value: 'Synthetic target' } });
    fireEvent.change(screen.getByLabelText('Target amount'), { target: { value: '500' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Synthetic quota failure'); });
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }));
    await screen.findByRole('alert');
    expectDiagnostic('error', '[save-failed]: failed to save expense tracker data');
    expectDiagnostic('error', '[update-failed]: cashflow changes could not be saved');
    expect(localStorage.getItem('fire-tools-expense-tracker')).toBe(original);
    expect(screen.getByLabelText('Goal name')).toBeDefined();
  });

  it('operates tabs with arrow keys and keeps the correct panel association', async () => {
    saveExpenseTrackerData({ ...cashflowFixture(), planning: planningFixture() });
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    const planning = await screen.findByRole('tab', { name: 'Planning' });
    planning.focus();
    fireEvent.keyDown(planning, { key: 'ArrowRight' });
    const rules = screen.getByRole('tab', { name: 'Rules' });
    expect(rules.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(rules);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(rules.id);
  });

  it('does not expose a saved opening balance in an always-visible input while privacy is enabled', async () => {
    saveExpenseTrackerData({ ...cashflowFixture(), planning: planningFixture({
      forecast: { openingBalance: 4321, startDate: '2024-01-31', horizon: 30, currency: 'EUR' },
    }) });
    render(<MemoryRouter initialEntries={['/expense-tracker?tab=planning']}><ExpenseTrackerPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Hide values', exact: true }));
    expect(screen.queryByLabelText('Opening cash balance')).toBeNull();
  });
});
