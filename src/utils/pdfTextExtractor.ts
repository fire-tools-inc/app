/**
 * PDF text extraction using pdfjs-dist.
 *
 * Runs fully in the browser with only bundled app resources. Output is line-grouped so that
 * the heuristic parsers can match transaction rows.
 *
 * pdfjs-dist is loaded dynamically so that importing this module does not
 * pull the (browser-only) PDF engine into jsdom / SSR contexts. The worker
 * is instantiated via Vite's `?worker` helper which produces a real Web
 * Worker constructor with the correct `type: 'module'` — required because
 * pdfjs ships an ESM worker bundle.
 */

import { logger } from './logger';

export interface PdfTextLine {
  /** Page number (1-indexed). */
  page: number;
  /** Approximate Y position used to group items into lines. */
  y: number;
  /** Concatenated text content of the line. */
  text: string;
}

export interface ExtractedPdf {
  fileName: string;
  /** Plain text — useful for keyword detection (e.g. "Net pay"). */
  fullText: string;
  /** Line-grouped text — used by transactional parsers. */
  lines: PdfTextLine[];
  /** Detected page count. */
  pageCount: number;
}

let workerConfigured = false;

const binaryDataUrls = import.meta.glob<string>(
  '/node_modules/pdfjs-dist/{standard_fonts,cmaps,wasm}/*',
  { eager: true, query: '?url', import: 'default' },
);

const binaryDataDirectories = {
  standardFontDataUrl: 'standard_fonts',
  cMapUrl: 'cmaps',
  wasmUrl: 'wasm',
};

class BundledPdfDataFactory {
  async fetch({ kind, filename }: { kind: keyof typeof binaryDataDirectories; filename: string }): Promise<Uint8Array> {
    try {
      const directory = binaryDataDirectories[kind];
      const url = binaryDataUrls[`/node_modules/pdfjs-dist/${directory}/${filename}`];
      if (!url) throw new Error(`PDF resource is not bundled: ${filename}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`PDF resource could not be loaded (${response.status}): ${filename}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      logger.error('pdf-text-extractor', 'resource-load-failed', 'failed to load a bundled PDF resource', {
        pii: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}

/**
 * Safari < 17.4 (and a few other older browsers) ship `ReadableStream` but
 * not `ReadableStream.prototype[Symbol.asyncIterator]`. pdfjs uses
 * `for await … of` on internal streams, which crashes with
 * "undefined is not a function (near '...value of readableStream...')".
 * We install a tiny polyfill the first time the extractor is used.
 */
function ensureReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype;
  if (Symbol.asyncIterator in proto) return;
  async function* asyncIterator(this: ReadableStream<unknown>) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  Object.defineProperty(proto, Symbol.asyncIterator, { value: asyncIterator, writable: true, configurable: true });
  Object.defineProperty(proto, 'values', { value: asyncIterator, writable: true, configurable: true });
}

async function loadPdfJs() {
  ensureReadableStreamAsyncIterator();
  // Dynamic import so jsdom-based tests (which don't have DOMMatrix) only pay
  // for pdfjs when they actually need it.
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    try {
      // Vite's `?worker` returns a Worker constructor with the correct
      // module type. Handing pdfjs a workerPort skips its internal
      // `new Worker(workerSrc)` call (which loads a classic worker and
      // fails on the ESM-only worker bundle).
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default;
      pdfjsLib.GlobalWorkerOptions.workerPort = new WorkerCtor();
      workerConfigured = true;
    } catch (error) {
      logger.error('pdf-text-extractor', 'worker-config-failed', 'failed to configure pdfjs worker', { pii: { error: (error as Error)?.message } });
      throw new Error('PDF engine could not be initialised. Please reload and try again.');
    }
  }
  return pdfjsLib;
}

/**
 * Group pdfjs text items into visual lines. pdfjs returns items with a
 * transform matrix; we use the y component as the line grouping key.
 *
 * Exported so alternative extraction back-ends (and benchmarks) can reuse the
 * exact same grouping logic the production extractor relies on.
 */
export function groupItemsIntoLines(
  items: readonly unknown[],
  pageNum: number,
): PdfTextLine[] {
  const lineMap = new Map<number, { y: number; parts: { x: number; str: string }[] }>();

  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)
      || typeof item.str !== 'string' || item.str.trim() === '' || !('transform' in item)) continue;
    const transform = item.transform;
    if (!Array.isArray(transform) || transform.length < 6
      || !Number.isFinite(transform[4]) || !Number.isFinite(transform[5])) continue;
    // Round y so that items on the same line group together even with sub-px noise.
    const y = Math.round(transform[5]);
    const x = transform[4];
    const existing = lineMap.get(y);
    if (existing) {
      existing.parts.push({ x, str: item.str });
    } else {
      lineMap.set(y, { y, parts: [{ x, str: item.str }] });
    }
  }

  const lines: PdfTextLine[] = [];
  // Sort top→bottom (higher y is higher on the page in PDF coordinates).
  const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
  for (const y of sortedYs) {
    const entry = lineMap.get(y)!;
    entry.parts.sort((a, b) => a.x - b.x);
    const text = entry.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      lines.push({ page: pageNum, y, text });
    }
  }

  return lines;
}

/**
 * Extract text and line layout from a PDF File. Throws if the file is not a
 * valid PDF or cannot be parsed. If the PDF has no text layer (e.g. a
 * scan), an empty result is returned so callers can show a helpful message.
 */
export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    BinaryDataFactory: BundledPdfDataFactory,
    useWorkerFetch: false,
    useSystemFonts: false,
  });
  try {
    const pdf = await loadingTask.promise;
    const allLines: PdfTextLine[] = [];
    const pageCount = pdf.numPages;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        const textContent = await page.getTextContent();
        allLines.push(...groupItemsIntoLines(textContent.items, pageNum));
      } finally {
        page.cleanup();
      }
    }
    return {
      fileName: file.name,
      fullText: allLines.map(line => line.text).join('\n'),
      lines: allLines,
      pageCount,
    };
  } finally {
    await loadingTask.destroy();
  }
}
