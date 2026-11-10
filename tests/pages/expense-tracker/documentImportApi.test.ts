import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReceiptOriginals, extractDocumentTextWithLiteParse, getReceiptFile, saveReceipt, startReceiptPairing } from '../../../src/utils/documentImportApi';
import { getApiBaseUrl } from '../../../src/utils/apiBase';
import { expectDiagnostic } from '../../shared/diagnostics';

vi.mock('../../../src/utils/apiBase', () => ({ getApiBaseUrl: vi.fn() }));
const receipt = {
  id: 1, fileName: 'synthetic.png', mimeType: 'image/png', byteLength: 3,
  sha256: 'a'.repeat(64), status: 'pending', createdAt: '2026-01-01 00:00:00',
};
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.mocked(getApiBaseUrl).mockResolvedValue('http://localhost:8787/api/v1'));

describe('documentImportApi', () => {
  it('fails explicitly instead of claiming an unavailable desktop backend was reset', async () => {
    const previous = window.fireTools;
    window.fireTools = { platform: 'synthetic' };
    vi.mocked(getApiBaseUrl).mockResolvedValue(null);
    try {
      await expect(clearReceiptOriginals()).rejects.toThrow('backend is unavailable');
    } finally {
      window.fireTools = previous;
    }
  });

  it('propagates a failed reset instead of allowing a success notification', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Synthetic receipt reset failure' },
    }), { status: 500 })));
    await expect(clearReceiptOriginals()).rejects.toThrow('Synthetic receipt reset failure');
    expectDiagnostic('error', '[request-failed]: A local document request failed.');
  });

  it('sends a document to the configured local parser and adapts spatial text for the existing heuristics', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      totalPages: 1, text: 'Total 12.50', pages: [{ pageNum: 1, textItems: [
        { text: '12.50', x: 100, y: 20 }, { text: 'Total', x: 10, y: 20 },
      ] }],
    })));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
    const extracted = await extractDocumentTextWithLiteParse(file);
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8787/api/v1/document-text?fileName=synthetic.pdf');
    expect(fetch.mock.calls[0][1].body).toBe(file);
    expect(extracted.lines[0].text).toBe('Total 12.50');
  });

  it('saves original photos and validates receipt metadata before using it', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    const file = new File(['abc'], 'synthetic.png', { type: 'image/png' });
    expect(await saveReceipt(file)).toEqual(receipt);
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('image/png');
  });

  it('rejects invalid server responses and surfaces failed uploads instead of pretending the file was saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: null }), { status: 201 })));
    const file = new File(['abc'], 'synthetic.png', { type: 'image/png' });
    await expect(saveReceipt(file)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'internal_error', message: 'Receipt could not be saved.' },
    }), { status: 500 })));
    await expect(saveReceipt(file)).rejects.toThrow('Receipt could not be saved');
    expectDiagnostic('error', '[request-failed]: A local document request failed.', 2);
  });

  it('detects truncated original-image downloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ab', { headers: { 'Content-Type': 'image/png' } })));
    await expect(getReceiptFile(receipt)).rejects.toThrow();
    expectDiagnostic('error', '[request-failed]: A local document request failed.');
  });

  it('passes the optional user-configured tunnel origin to pairing without contacting a tunnel provider', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: '0f5a0b27-8841-4032-a8ec-6c08985a6462', port: 8790, expiresAt: '2026-01-01T00:30:00Z',
      urls: ['https://receipts.example.test/receipt-upload#token=synthetic'],
    })));
    vi.stubGlobal('fetch', fetch);
    await startReceiptPairing({ port: 8790, publicUrl: 'https://receipts.example.test', language: 'en' });
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(fetch.mock.calls[0][1].body).publicUrl).toBe('https://receipts.example.test');
  });
});
