import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpenseTrackerPage } from '../../../src/components/ExpenseTrackerPage';
import { QuickExpenseImport } from '../../../src/components/QuickExpenseImport';
import { loadExpenseTrackerData, saveExpenseTrackerData } from '../../../src/utils/cookieStorage';
import { cashflowFixture } from './planningFixtures';
import type { ExpenseEntry, ExpenseTrackerData } from '../../../src/types/expenseTracker';
import type { ParsedTransactionDraft } from '../../../src/types/pdfImport';
import { clearSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../../src/utils/cookieSettings';
import { expectDiagnostic } from '../../shared/diagnostics';

const model = { provider: 'local' as const, baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'synthetic-model' };

const tracker = (): ExpenseTrackerData => ({
  years: [{ year: 2026, months: [{ year: 2026, month: 10, incomes: [], budgets: [], expenses: [
    { id: 'h-1', type: 'expense', date: '2026-10-03', amount: 9, description: 'Corner kiosk', category: 'DINING_OUT', expenseType: 'NEED' },
  ] }] }],
  currentYear: 2026, currentMonth: 11, currency: 'EUR', globalBudgets: [],
});

beforeEach(() => {
  localStorage.clear();
  clearSettings();
});

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('Expenses, one per line'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Match expenses' }));
}

describe('QuickExpenseImport', () => {
  it('matches pasted lines, lets the user review them and commits only valid included rows', () => {
    const onCommit = vi.fn<(expenses: ExpenseEntry[]) => void>();
    render(<QuickExpenseImport year={2026} month={11} data={tracker()} onCommit={onCommit} />);
    paste('cinema 12.50\ncorner kiosk 4\n03/11 uber 15.30\nnote without amount');

    expect(screen.getByRole('status').textContent).toMatch('3 of 4 lines are ready');
    expect(screen.getByText(/No amount found/)).toBeTruthy();
    expect((screen.getByLabelText('Add note without amount') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Category for cinema') as HTMLSelectElement).value).toBe('LIFESTYLE_LEISURE');
    expect((screen.getByLabelText('Category for corner kiosk') as HTMLSelectElement).value).toBe('DINING_OUT');
    const kioskType = screen.getByRole('group', { name: 'Need or want for corner kiosk' });
    expect(within(kioskType).getByRole('button', { name: 'Need' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(screen.getByLabelText('Category for cinema'), { target: { value: 'ENTERTAINMENT' } });
    fireEvent.click(within(screen.getByRole('group', { name: 'Need or want for cinema' })).getByRole('button', { name: 'Need' }));
    fireEvent.click(screen.getByLabelText('Add uber'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 expenses' }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toEqual([
      expect.objectContaining({ description: 'cinema', amount: 12.5, category: 'ENTERTAINMENT', expenseType: 'NEED', date: '2026-11-01' }),
      expect.objectContaining({ description: 'corner kiosk', amount: 4, category: 'DINING_OUT', expenseType: 'NEED' }),
    ]);
    expect(screen.getByRole('status').textContent).toMatch('Added 2 expenses');
  });

  it('fixes an invalid row in place and announces commit failures', () => {
    const onCommit = vi.fn(() => { throw new Error('synthetic save failure'); });
    render(<QuickExpenseImport year={2026} month={11} data={tracker()} onCommit={onCommit} />);
    paste('2026-10-30 dinner 40');
    expect(screen.getByText(/This date is outside/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Date for dinner'), { target: { value: '2026-11-02' } });
    expect(screen.queryByText(/This date is outside/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Amount for dinner'), { target: { value: '41,20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 expense' }));
    expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ amount: 41.2, date: '2026-11-02' })]);
    expect(screen.getByRole('alert').textContent).toMatch('could not be saved');
    expect(screen.getByLabelText('Amount for dinner')).toBeTruthy();
    expectDiagnostic('error', '[commit-failed]: quick-add expenses could not be saved');
  });

  it('keeps the rows when the parent reports a failed save by returning false', () => {
    const onCommit = vi.fn(() => false);
    render(<QuickExpenseImport year={2026} month={11} data={tracker()} onCommit={onCommit} />);
    paste('taxi 9');
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 expense' }));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toMatch('could not be saved');
    expect(screen.getByLabelText('Amount for taxi')).toBeTruthy();
  });

  it('hides AI suggestions unless AI features are enabled and a model is configured', () => {
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false, llmCategorization: model });
    render(<QuickExpenseImport year={2026} month={11} data={tracker()} onCommit={vi.fn()} />);
    paste('zzqx 3');
    expect(screen.queryByRole('button', { name: 'Improve with AI' })).toBeNull();
    act(() => { saveSettings({ ...loadSettings(), aiFeaturesEnabled: true, llmCategorization: undefined }); });
    expect(screen.queryByRole('button', { name: 'Improve with AI' })).toBeNull();
    act(() => { saveSettings({ ...loadSettings(), llmCategorization: model }); });
    expect(screen.getByRole('button', { name: 'Improve with AI' })).toBeTruthy();
  });

  it('asks for consent and sends only descriptions, amounts and currencies to the AI categorizer', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: true, llmCategorization: model });
    const categorizer = vi.fn(async (drafts: ParsedTransactionDraft[]) =>
      drafts.map(draft => ({ ...draft, suggestedCategory: 'OTHER', llmEnriched: true })));
    render(<QuickExpenseImport year={2026} month={11} data={tracker()} onCommit={vi.fn()} categorizer={categorizer} />);
    paste('zzqx 3\ncorner kiosk 4');
    fireEvent.click(screen.getByRole('button', { name: 'Improve with AI' }));
    expect(categorizer).not.toHaveBeenCalled();
    expect(screen.getByText(/2 descriptions with their amounts and currencies will be sent to localhost:11434/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send to AI' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch('AI suggestions applied to 2 rows'));
    const sent = categorizer.mock.calls[0][0];
    expect(sent.map(draft => draft.description)).toEqual(['zzqx', 'corner kiosk']);
    expect(sent.every(draft => draft.rawLine === undefined)).toBe(true);
    expect((screen.getByLabelText('Category for zzqx') as HTMLSelectElement).value).toBe('OTHER');
  });

  it('runs as a modal dialog that closes with Escape and keeps commits disabled without rows', () => {
    const onCancel = vi.fn();
    render(<QuickExpenseImport variant="dialog" year={2026} month={11} data={tracker()} onCommit={vi.fn()} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Quick add expenses' });
    expect(document.activeElement).toBe(screen.getByLabelText('Expenses, one per line'));
    expect((within(dialog).getByRole('button', { name: 'Add 0 expenses' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens from the Cashflow page and saves the expenses into the selected month', async () => {
    const fixture = cashflowFixture();
    fixture.years[0].months[0].expenses.push({
      id: 'existing', type: 'expense', date: '2024-01-02', amount: 20, description: 'Existing synthetic expense', category: 'OTHER', expenseType: 'WANT',
    });
    saveExpenseTrackerData(fixture);
    render(<MemoryRouter initialEntries={['/expense-tracker?year=2024&month=1']}><ExpenseTrackerPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Paste expenses' }));
    const dialog = screen.getByRole('dialog', { name: 'Quick add expenses' });
    fireEvent.change(within(dialog).getByLabelText('Expenses, one per line'), { target: { value: '5 cinema 12.50\ncoffee 2x3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Match expenses' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add 2 expenses' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick add expenses' })).toBeNull());
    const saved = loadExpenseTrackerData()?.years[0].months[0].expenses ?? [];
    expect(saved.map(expense => [expense.description, expense.date, expense.amount, expense.category])).toEqual([
      ['Existing synthetic expense', '2024-01-02', 20, 'OTHER'],
      ['cinema', '2024-01-05', 12.5, 'LIFESTYLE_LEISURE'],
      ['coffee', '2024-01-01', 6, 'DINING_OUT'],
    ]);
    expect(saved[2]).toMatchObject({ unitAmount: 3, quantity: 2 });
  });
});
