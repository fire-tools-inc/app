import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PDFImportDialog } from '../../src/components/PDFImportDialog';
import type { ExtractedPdf } from '../../src/utils/pdfTextExtractor';

function makeExtracted(name: string, lines: string[]): ExtractedPdf {
  return {
    fileName: name,
    fullText: lines.join('\n'),
    lines: lines.map((text, i) => ({ page: 1, y: 1000 - i, text })),
    pageCount: 1,
  };
}

function makeFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

describe('PDFImportDialog', () => {
  it('renders empty state and disables AI categorization when LLM not configured', () => {
    const onClose = vi.fn();
    const onAddIncome = vi.fn();
    const onAddExpense = vi.fn();
    render(
      <PDFImportDialog
        onClose={onClose}
        onAddIncome={onAddIncome}
        onAddExpense={onAddExpense}
        defaultCurrency="EUR"
      />,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    const aiCheckbox = screen.getByLabelText(/Use AI categorization/i) as HTMLInputElement;
    expect(aiCheckbox.disabled).toBe(true);
  });

  it('parses uploaded PDF, lets the user exclude rows, and commits the rest', async () => {
    const onClose = vi.fn();
    const onAddIncome = vi.fn();
    const onAddExpense = vi.fn();

    const extractor = vi.fn().mockResolvedValue(makeExtracted('statement.pdf', [
      'Account statement 2024',
      '01/03/2024 Stipendio acme 2.500,00',
      '03/03/2024 Esselunga -45,30',
      '10/03/2024 Netflix -12,99',
    ]));

    render(
      <PDFImportDialog
        onClose={onClose}
        onAddIncome={onAddIncome}
        onAddExpense={onAddExpense}
        defaultCurrency="EUR"
        extractor={extractor}
      />,
    );

    // Choose bank_statement so the dispatcher uses the row parser.
    fireEvent.change(screen.getByLabelText(/Document type/i), { target: { value: 'bank_statement' } });

    fireEvent.change(screen.getByLabelText(/PDF files/i), {
      target: { files: [makeFile('statement.pdf')] },
    });

    await waitFor(() => expect(extractor).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Detected 3 transactions/i)).toBeTruthy());

    // Exclude the second row (Esselunga) by unchecking it.
    const checkboxes = screen.getAllByRole('checkbox').filter(c => (c as HTMLInputElement).type === 'checkbox' && (c.getAttribute('aria-label') || '').toLowerCase().includes('include'));
    // Find the Esselunga row checkbox.
    const esselungaCheckbox = checkboxes.find(c => (c.getAttribute('aria-label') || '').toLowerCase().includes('esselunga'));
    expect(esselungaCheckbox).toBeTruthy();
    fireEvent.click(esselungaCheckbox!);

    fireEvent.click(screen.getByRole('button', { name: /Import \(2\)/ }));

    expect(onAddIncome).toHaveBeenCalledTimes(1);
    expect(onAddExpense).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls the LLM categorizer when AI categorization is enabled', async () => {
    const onClose = vi.fn();
    const onAddIncome = vi.fn();
    const onAddExpense = vi.fn();

    const extractor = vi.fn().mockResolvedValue(makeExtracted('receipt.pdf', [
      'Cafe Roma',
      '15/03/2024',
      'TOTAL €6,50',
    ]));
    const categorizer = vi.fn().mockImplementation(async (drafts) => drafts);

    render(
      <PDFImportDialog
        onClose={onClose}
        onAddIncome={onAddIncome}
        onAddExpense={onAddExpense}
        defaultCurrency="EUR"
        extractor={extractor}
        categorizer={categorizer}
        llmConfig={{ baseUrl: 'http://localhost:11434/v1', apiKey: 'x', model: 'llama3' }}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Use AI categorization/i));
    fireEvent.change(screen.getByLabelText(/PDF files/i), {
      target: { files: [makeFile('receipt.pdf')] },
    });

    await waitFor(() => expect(categorizer).toHaveBeenCalledTimes(1));
  });

  it('skips files that fail to extract but keeps going', async () => {
    const onClose = vi.fn();
    const onAddIncome = vi.fn();
    const onAddExpense = vi.fn();

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const extractor = vi.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(makeExtracted('ok.pdf', [
        'Cafe Roma', '15/03/2024', 'TOTAL €6,50',
      ]));

    render(
      <PDFImportDialog
        onClose={onClose}
        onAddIncome={onAddIncome}
        onAddExpense={onAddExpense}
        defaultCurrency="EUR"
        extractor={extractor}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Document type/i), { target: { value: 'receipt' } });
    fireEvent.change(screen.getByLabelText(/PDF files/i), {
      target: { files: [makeFile('bad.pdf'), makeFile('ok.pdf')] },
    });

    await waitFor(() => expect(extractor).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/Failed to read "bad.pdf"/i)).toBeTruthy());
    consoleSpy.mockRestore();
  });
});
