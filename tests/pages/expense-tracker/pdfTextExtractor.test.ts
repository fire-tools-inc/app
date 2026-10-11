// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPdfText } from '../../../src/utils/pdfTextExtractor';
import { expectDiagnostic } from '../../shared/diagnostics';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroy: vi.fn(),
  cleanup: vi.fn(),
  getTextContent: vi.fn(),
  getPage: vi.fn(),
  workerOptions: { workerPort: null },
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: mocks.getDocument,
  GlobalWorkerOptions: mocks.workerOptions,
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?worker', () => ({
  default: class SyntheticWorker {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.destroy.mockResolvedValue(undefined);
  mocks.getTextContent.mockResolvedValue({
    items: [{ str: 'Synthetic invoice', transform: [1, 0, 0, 1, 10, 20] }],
  });
  mocks.getPage.mockResolvedValue({
    getTextContent: mocks.getTextContent,
    cleanup: mocks.cleanup,
  });
  mocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage: mocks.getPage }),
    destroy: mocks.destroy,
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('production PDF extraction', () => {
  it('uses bundled standard fonts on the main thread, not a CDN or system fonts', async () => {
    await extractPdfText(new File(['synthetic'], 'synthetic.pdf'));
    const options = mocks.getDocument.mock.calls[0][0];
    expect(options.useWorkerFetch).toBe(false);
    expect(options.useSystemFonts).toBe(false);
    expect(options.BinaryDataFactory).toBeTypeOf('function');

    const fetchFont = vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    vi.stubGlobal('fetch', fetchFont);
    const factory = new options.BinaryDataFactory();
    expect(await factory.fetch({ kind: 'standardFontDataUrl', filename: 'FoxitSerif.pfb' })).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchFont).toHaveBeenCalledWith(expect.stringContaining('FoxitSerif.pfb'));
    expect(fetchFont.mock.calls[0][0]).not.toMatch(/^https?:/);
  });

  it('rejects an unbundled font without an external request', async () => {
    await extractPdfText(new File(['synthetic'], 'synthetic.pdf'));
    const factory = new mocks.getDocument.mock.calls[0][0].BinaryDataFactory();
    const fetchFont = vi.fn();
    vi.stubGlobal('fetch', fetchFont);
    await expect(factory.fetch({ kind: 'standardFontDataUrl', filename: '../unbundled.pfb' })).rejects.toThrow('not bundled');
    expect(fetchFont).not.toHaveBeenCalled();
    expectDiagnostic('error', '[resource-load-failed]: failed to load a bundled PDF resource');
  });

  it('reports an unsuccessful local font response', async () => {
    await extractPdfText(new File(['synthetic'], 'synthetic.pdf'));
    const factory = new mocks.getDocument.mock.calls[0][0].BinaryDataFactory();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(factory.fetch({ kind: 'standardFontDataUrl', filename: 'FoxitSerif.pfb' })).rejects.toThrow('404');
    expectDiagnostic('error', '[resource-load-failed]: failed to load a bundled PDF resource');
  });

  it.each([
    { kind: 'cMapUrl', filename: 'Adobe-Japan1-UCS2.bcmap' },
    { kind: 'wasmUrl', filename: 'openjpeg.wasm' },
  ])('keeps $kind resources local when worker fetching is disabled', async request => {
    await extractPdfText(new File(['synthetic'], 'synthetic.pdf'));
    const factory = new mocks.getDocument.mock.calls[0][0].BinaryDataFactory();
    const fetchResource = vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    vi.stubGlobal('fetch', fetchResource);
    expect(await factory.fetch(request)).toEqual(new Uint8Array([1]));
    expect(fetchResource.mock.calls[0][0]).not.toMatch(/^https?:/);
  });

  it('preserves grouped text and releases the page and loading task', async () => {
    const result = await extractPdfText(new File(['synthetic'], 'synthetic.pdf'));
    expect(result).toEqual({
      fileName: 'synthetic.pdf', fullText: 'Synthetic invoice', pageCount: 1,
      lines: [{ page: 1, y: 20, text: 'Synthetic invoice' }],
    });
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('releases the loading task when the document cannot be opened', async () => {
    mocks.getDocument.mockReturnValueOnce({
      promise: Promise.reject(new Error('Synthetic invalid PDF')),
      destroy: mocks.destroy,
    });
    await expect(extractPdfText(new File(['synthetic'], 'synthetic.pdf'))).rejects.toThrow('Synthetic invalid PDF');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('releases page resources when text extraction fails', async () => {
    mocks.getTextContent.mockRejectedValueOnce(new Error('Synthetic page failure'));
    await expect(extractPdfText(new File(['synthetic'], 'synthetic.pdf'))).rejects.toThrow('Synthetic page failure');
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
