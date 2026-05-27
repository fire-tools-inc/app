/**
 * PDF text extraction using pdfjs-dist.
 *
 * Runs fully in the browser, no network calls. Output is line-grouped so that
 * the heuristic parsers can match transaction rows.
 *
 * pdfjs-dist is loaded dynamically so that importing this module does not
 * pull the (browser-only) PDF engine into jsdom / SSR contexts.
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

async function loadPdfJs() {
  // Dynamic import so jsdom-based tests (which don't have DOMMatrix) only pay
  // for pdfjs when they actually need it.
  const pdfjsLib = await import('pdfjs-dist');
  if (!workerConfigured) {
    try {
      const workerUrlModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrlModule.default;
      workerConfigured = true;
    } catch (error) {
      console.error('Failed to configure pdfjs worker:', error);
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
 * valid PDF or cannot be parsed.
 */
export async function extractPdfText(file: File): Promise<ExtractedPdf> {
  const pdfjsLib = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allLines: PdfTextLine[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    allLines.push(...groupItemsIntoLines(textContent.items, pageNum));
  }

  const fullText = allLines.map(l => l.text).join('\n');

  return {
    fileName: file.name,
    fullText,
    lines: allLines,
    pageCount: pdf.numPages,
  };
}

