import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbookImportDialog } from '../../../src/components/WorkbookImportDialog';
import { loadExpenseTrackerData, loadNetWorthTrackerData } from '../../../src/utils/cookieStorage';
import { writeXlsxWorkbook } from '../../../src/utils/xlsxWriter';
import { expectDiagnostic } from '../../shared/diagnostics';

// Fictional template-style workbook.
function workbookFile(): File {
  const bytes = writeXlsxWorkbook([{
    name: '2025',
    rows: [
      ['Category', 'Name', 'Ticker', 'Currency', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      ['Savings', 'Example savings', null, 'EUR', 1000, 1200],
      ['Income', 'Salary', null, 'EUR', 2500, 2500],
    ],
  }]);
  return new File([new Uint8Array(bytes)], 'history.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input missing');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('WorkbookImportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('previews a workbook and saves the selected stores', async () => {
    const onImported = vi.fn();
    render(<WorkbookImportDialog isOpen onClose={vi.fn()} onImported={onImported} />);
    expect(screen.getByRole('dialog', { name: /import spreadsheet/i })).toBeTruthy();

    chooseFile(workbookFile());
    expect(await screen.findByText('Months with a full breakdown: 2')).toBeTruthy();
    expect(screen.getByText('Income entries: 2 · Spending entries: 0')).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /net worth history/i }).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('Import complete')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Close');

    const saved = loadNetWorthTrackerData();
    const months = saved?.years.find((year) => year.year === 2025)?.months ?? [];
    expect(months.map((month) => month.cashEntries[0]?.balance)).toEqual([1000, 1200]);
    expect(loadExpenseTrackerData()?.years[0].months[0].incomes[0]).toMatchObject({ description: 'Salary', amount: 2500 });
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ monthsAdded: 2, latestMonth: { year: 2025, month: 2 } }));
  });

  it('explains files that are not xlsx workbooks and saves nothing', async () => {
    render(<WorkbookImportDialog isOpen onClose={vi.fn()} />);
    chooseFile(new File(['Month,Net worth'], 'history.csv', { type: 'text/csv' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This file is not an .xlsx workbook');
    expectDiagnostic('warn', 'workbook could not be read (notXlsx)');
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Import' }).disabled).toBe(true));
    expect(loadNetWorthTrackerData()).toBeNull();
  });

  it('closes on Escape even when focus has left the dialog', () => {
    const onClose = vi.fn();
    render(<WorkbookImportDialog isOpen onClose={onClose} />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
