import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpenseWorkbookImportDialog } from '../../../src/components/ExpenseWorkbookImportDialog';
import type { ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { writeXlsxWorkbook } from '../../../src/utils/xlsxWriter';
import { expectDiagnostic } from '../../shared/diagnostics';

// Fictional workbook for a past year so no month is skipped as future.
function expensesFile(): File {
  const bytes = writeXlsxWorkbook([
    { name: 'Jan', rows: [['Expense name', 'Amount', 'Category', 'Type'], ['Rent', 800, 'Housing', 'Need'], ['Cinema', 15, 'Entertainment', 'Want']] },
    { name: 'Feb', rows: [['Expense name', 'Amount', 'Category', 'Type'], ['Rent', 800, 'Housing', 'Need']] },
  ]);
  return new File([new Uint8Array(bytes)], 'Spending 2023.xlsx');
}

describe('ExpenseWorkbookImportDialog', () => {
  afterEach(() => cleanup());

  it('previews a yearly workbook and hands the merged data to the page', async () => {
    const onApply = vi.fn((_next: ExpenseTrackerData) => true);
    const onImported = vi.fn();
    render(<ExpenseWorkbookImportDialog isOpen onClose={vi.fn()} getCurrent={() => null} onApply={onApply} onImported={onImported} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [expensesFile()] } });
    expect(await screen.findByText('Expenses: 3 · Income entries: 0')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Year' }).value).toBe('2023');

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Import complete')).toBeTruthy();
    const saved = onApply.mock.calls[0][0];
    expect(saved.years[0]).toMatchObject({ year: 2023 });
    expect(saved.years[0].months.map((month) => month.expenses.length)).toEqual([2, 1]);
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ expensesImported: 3 }), 2023);
  });

  it('reports a failed save without closing', async () => {
    render(<ExpenseWorkbookImportDialog isOpen onClose={vi.fn()} getCurrent={() => null} onApply={() => false} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [expensesFile()] } });
    await screen.findByText('Expenses: 3 · Income entries: 0');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Import failed and your data was left unchanged');
    expectDiagnostic('error', 'expenses workbook import failed');
  });
});
