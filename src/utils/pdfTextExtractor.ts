/**
 * PDF text extraction using pdfjs-dist.
 *
 * Runs fully in the browser, no network calls. Output is line-grouped so that
 * the heuristic parsers can match transaction rows.
 *
 * pdfjs-dist is loaded dynamically so that importing this module does not
 * pull the (browser-only) PDF engine into jsdom / SSR contexts. The worker
 * is instantiated via Vite's `?worker` helper which produces a real Web
 * Worker constructor with the correct `type: 'module'` — required because
 * pdfjs v5 only ships an ESM worker bundle.
 */

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

/**
 * Safari < 17.4 (and a few other older browsers) ship `ReadableStream` but
 * not `ReadableStream.prototype[Symbol.asyncIterator]`. pdfjs v5 uses
 * `for await … of` on internal streams, which crashes with
 * "undefined is not a function (near '...value of readableStream...')".
 * We install a tiny polyfill the first time the extractor is used.
 */
function ensureReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') return;
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  if (proto[Symbol.asyncIterator]) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proto as any)[Symbol.asyncIterator] = async function* asyncIterator(this: ReadableStream<unknown>) {
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
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (proto as any).values = (proto as any)[Symbol.asyncIterator];
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
      // fails on the ESM-only pdfjs v5 worker bundle).
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default;
      pdfjsLib.GlobalWorkerOptions.workerPort = new WorkerCtor();
      workerConfigured = true;
    } catch (error) {
      console.error('Failed to configure pdfjs worker:', error);
      throw new Error('PDF engine could not be initialised. Please reload and try again.');
    }
  }
  return pdfjsLib;
}

/**
 * Group pdfjs text items into visual lines. pdfjs returns items with a
 * transform matrix; we use the y component as the line grouping key.
 */
function groupItemsIntoLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[],
  pageNum: number,
): PdfTextLine[] {
  const lineMap = new Map<number, { y: number; parts: { x: number; str: string }[] }>();

  for (const item of items) {
    if (typeof item.str !== 'string' || item.str.trim() === '') continue;
    const transform = item.transform as number[] | undefined;
    if (!transform || transform.length < 6) continue;
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
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const allLines: PdfTextLine[] = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      allLines.push(...groupItemsIntoLines(textContent.items, pageNum));
      page.cleanup();
    }
  } finally {
    await pdf.cleanup().catch(() => undefined);
    await pdf.destroy().catch(() => undefined);
  }

  const fullText = allLines.map(l => l.text).join('\n');

  return {
    fileName: file.name,
    fullText,
    lines: allLines,
    pageCount: pdf.numPages,
  };
}

