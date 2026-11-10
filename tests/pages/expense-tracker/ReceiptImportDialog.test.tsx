import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFImportDialog } from '../../../src/components/PDFImportDialog';
import * as api from '../../../src/utils/documentImportApi';
import type { ExtractedPdf } from '../../../src/utils/pdfTextExtractor';
import type { ReceiptDocument } from '../../../src/types/receiptImport';
import type { ParsedTransactionDraft } from '../../../src/types/pdfImport';
import { expectDiagnostic } from '../../shared/diagnostics';
import { clearSettings, DEFAULT_SETTINGS, saveSettings } from '../../../src/utils/cookieSettings';

vi.mock('../../../src/utils/apiBase', () => ({ getApiBaseUrl: async () => 'http://localhost:8787/api/v1' }));
vi.mock('../../../src/utils/documentImportApi', () => ({
  saveReceipt: vi.fn(), getReceiptFile: vi.fn(), markReceiptReviewed: vi.fn(),
  listReceipts: vi.fn(), deleteReceipt: vi.fn(), downloadReceiptFile: vi.fn(),
  startReceiptPairing: vi.fn(), stopReceiptPairing: vi.fn(), extractDocumentTextWithLiteParse: vi.fn(),
}));

const receipt: ReceiptDocument = {
  id: 42, fileName: 'synthetic.png', mimeType: 'image/png', byteLength: 3, sha256: 'a'.repeat(64),
  status: 'pending', createdAt: '2026-03-15 00:00:00',
};
const photo = () => new File(['abc'], 'synthetic.png', { type: 'image/png' });
const extracted = (name = 'synthetic.png'): ExtractedPdf => ({
  fileName: name, fullText: 'Synthetic cafe\n15/03/2026\nTOTAL EUR 12.50', pageCount: 1,
  lines: ['Synthetic cafe', '15/03/2026', 'TOTAL EUR 12.50'].map((text, y) => ({ page: 1, y, text })),
});

beforeEach(() => {
  localStorage.clear();
  clearSettings();
  for (const value of Object.values(api)) {
    if (vi.isMockFunction(value)) value.mockReset();
  }
  vi.mocked(api.listReceipts).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(api.saveReceipt).mockResolvedValue(receipt);
  vi.mocked(api.getReceiptFile).mockResolvedValue(photo());
  vi.mocked(api.markReceiptReviewed).mockResolvedValue();
  const OriginalUrl = URL;
  vi.stubGlobal('URL', class extends OriginalUrl {
    static createObjectURL = vi.fn().mockReturnValue('blob:synthetic');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('receipt document review', () => {
  it('offers native camera capture and retains the original before local OCR, without importing automatically', async () => {
    const onAddExpense = vi.fn();
    const native = vi.fn().mockResolvedValue(extracted());
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={onAddExpense} defaultCurrency="EUR" liteParseExtractor={native} />);
    const camera = screen.getByLabelText('Take a receipt photo');
    expect(camera.getAttribute('capture')).toBe('environment');
    fireEvent.change(camera, { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    expect(api.saveReceipt).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
    expect(vi.mocked(api.saveReceipt).mock.invocationCallOrder[0]).toBeLessThan(native.mock.invocationCallOrder[0]);
    expect(onAddExpense).not.toHaveBeenCalled();
    expect(api.markReceiptReviewed).not.toHaveBeenCalled();
  });

  it('persists the full reviewed batch before marking the receipt reviewed and closing', async () => {
    const order: string[] = [];
    const commit = vi.fn((_drafts: ParsedTransactionDraft[]) => { order.push('persist'); });
    vi.mocked(api.markReceiptReviewed).mockImplementation(async () => { order.push('review'); });
    render(<PDFImportDialog onClose={() => order.push('close')} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      onCommitDrafts={commit} defaultCurrency="EUR" liteParseExtractor={vi.fn().mockResolvedValue(extracted())} />);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Import (1)' }));
    await waitFor(() => expect(order).toEqual(['persist', 'review', 'close']));
    expect(commit.mock.calls[0][0][0].id).toBe(`receipt-${receipt.sha256}-0`);
  });

  it('retains originals and drafts, and does not close or mark a receipt reviewed after a save failure', async () => {
    const onClose = vi.fn();
    const commit = vi.fn().mockRejectedValue(new Error('Synthetic storage failure'));
    render(<PDFImportDialog onClose={onClose} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      onCommitDrafts={commit} defaultCurrency="EUR" liteParseExtractor={vi.fn().mockResolvedValue(extracted())} />);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Import (1)' }));
    await screen.findByText(/Synthetic storage failure/);
    expect(api.markReceiptReviewed).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('spinbutton', { name: 'Amount 1' })).toBeTruthy();
    expectDiagnostic('error', '[commit-failed]: The reviewed import could not be completed.');
  });

  it('preserves edits while adding another photo and keeps the same receipt draft from being duplicated', async () => {
    vi.mocked(api.saveReceipt).mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, id: 43, sha256: 'b'.repeat(64) });
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      defaultCurrency="EUR" liteParseExtractor={vi.fn().mockResolvedValue(extracted())} />);
    const camera = screen.getByLabelText('Take a receipt photo');
    fireEvent.change(camera, { target: { files: [photo()] } });
    const amount = await screen.findByRole('spinbutton', { name: 'Amount 1' });
    fireEvent.change(amount, { target: { value: '99' } });
    fireEvent.change(camera, { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 2' });
    expect((amount as HTMLInputElement).value).toBe('99');
    fireEvent.change(camera, { target: { files: [photo()] } });
    await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByRole('spinbutton', { name: /^Amount/ })).toHaveLength(2));
  });

  it('aborts local OCR and releases the preview when the dialog unmounts', async () => {
    let finish: ((result: ExtractedPdf) => void) | undefined;
    const native = vi.fn().mockImplementation(() => new Promise<ExtractedPdf>(resolve => { finish = resolve; }));
    const { unmount } = render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      defaultCurrency="EUR" liteParseExtractor={native} />);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    await waitFor(() => expect(native).toHaveBeenCalledOnce());
    const signal = native.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
    await act(async () => { finish?.(extracted()); });
  });

  it('enables opt-in categorization for a configured local model with no API key', async () => {
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()} defaultCurrency="EUR"
      llmConfig={{ baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'local-model' }} />);
    expect((screen.getByLabelText(/Use AI categorization/) as HTMLInputElement).disabled).toBe(false);
    await screen.findByText('No stored receipts in this view.');
  });

  it('keeps receipt storage, OCR and financial imports working while all AI calls are disabled', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false });
    const categorizer = vi.fn();
    const native = vi.fn().mockResolvedValue(extracted());
    const commit = vi.fn();
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()} onCommitDrafts={commit}
      defaultCurrency="EUR" liteParseExtractor={native} categorizer={categorizer}
      llmConfig={{ baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'synthetic' }} />);
    expect((screen.getByLabelText(/Use AI categorization/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    expect(api.saveReceipt).toHaveBeenCalledOnce();
    expect(native).toHaveBeenCalledOnce();
    expect(categorizer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import (1)' }));
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  });

  it('clears live AI consent without aborting OCR, including a disable/re-enable during parsing', async () => {
    let finish: ((result: ExtractedPdf) => void) | undefined;
    const native = vi.fn().mockImplementation(() => new Promise<ExtractedPdf>(resolve => { finish = resolve; }));
    const categorizer = vi.fn();
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      defaultCurrency="EUR" liteParseExtractor={native} categorizer={categorizer}
      llmConfig={{ baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'synthetic' }} />);
    const optIn = screen.getByLabelText(/Use AI categorization/) as HTMLInputElement;
    fireEvent.click(optIn);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    await waitFor(() => expect(native).toHaveBeenCalledOnce());
    const parsingSignal = native.mock.calls[0][1] as AbortSignal;
    act(() => { saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false }); });
    expect(optIn.checked).toBe(false);
    expect(optIn.disabled).toBe(true);
    expect(parsingSignal.aborted).toBe(false);
    act(() => { saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: true }); });
    await act(async () => { finish?.(extracted()); });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    expect(categorizer).not.toHaveBeenCalled();
    expect(optIn.disabled).toBe(false);
    expect(optIn.checked).toBe(false);
  });

  it('retries a failed receipt status update without persisting again or allowing edits to saved entries', async () => {
    const commit = vi.fn();
    const onClose = vi.fn();
    vi.mocked(api.markReceiptReviewed).mockRejectedValueOnce(new Error('Synthetic network failure')).mockResolvedValueOnce();
    render(<PDFImportDialog onClose={onClose} onAddIncome={vi.fn()} onAddExpense={vi.fn()} onCommitDrafts={commit}
      defaultCurrency="EUR" liteParseExtractor={vi.fn().mockResolvedValue(extracted())} />);
    fireEvent.change(screen.getByLabelText('Take a receipt photo'), { target: { files: [photo()] } });
    const amount = await screen.findByRole('spinbutton', { name: 'Amount 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Import (1)' }));
    await screen.findByText(/Entries were saved, but receipt review could not finish/);
    expect((amount as HTMLInputElement).disabled).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish receipt review (1)' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(commit).toHaveBeenCalledOnce();
    expectDiagnostic('error', '[commit-failed]: The reviewed import could not be completed.');
  });

  it('does not confuse distinct originals when a deleted receipt numeric ID is reused', async () => {
    vi.mocked(api.saveReceipt).mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, sha256: 'b'.repeat(64) });
    render(<PDFImportDialog onClose={vi.fn()} onAddIncome={vi.fn()} onAddExpense={vi.fn()}
      defaultCurrency="EUR" liteParseExtractor={vi.fn().mockResolvedValue(extracted())} />);
    const camera = screen.getByLabelText('Take a receipt photo');
    fireEvent.change(camera, { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 1' });
    fireEvent.change(camera, { target: { files: [photo()] } });
    await screen.findByRole('spinbutton', { name: 'Amount 2' });
  });
});
