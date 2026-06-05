/**
 * Experimental PDF text extraction using LiteParse (run-llama/liteparse).
 *
 * LiteParse is a fast, local document parser backed by the native PDFium
 * library (via napi-rs). Unlike {@link extractPdfText} (which uses the
 * browser-only pdfjs engine), this adapter is **Node-only** — it relies on a
 * native binding and therefore cannot run in the browser bundle. It is wired
 * up so the existing heuristic parsers in `pdfHeuristics.ts` can consume its
 * output unchanged: it returns the same {@link ExtractedPdf} shape.
 *
 * The `@llamaindex/liteparse` package is imported dynamically so that simply
 * importing this module never pulls the native engine into a browser/SSR
 * context, and so environments without the native binary degrade gracefully.
 */

import type { ExtractedPdf, PdfTextLine } from './pdfTextExtractor';

/** A single positioned text segment returned by LiteParse. */
export interface LiteParseTextItem {
  text: string;
  /** X position (left edge), top-left origin. */
  x: number;
  /** Y position (top edge), top-left origin (increases downwards). */
  y: number;
  width?: number;
  height?: number;
  fontName?: string;
  fontSize?: number;
  confidence?: number;
}

/** A single parsed page returned by LiteParse. */
export interface LiteParsePage {
  pageNum?: number;
  textItems: LiteParseTextItem[];
}

/** The result object returned by `LiteParse.parse`. */
export interface LiteParseResult {
  text: string;
  pages: LiteParsePage[];
}

/** Bytes accepted by the LiteParse engine. (A Node `Buffer` is a `Uint8Array`.) */
export type LiteParseInput = Uint8Array | ArrayBuffer;

/**
 * Convert a {@link LiteParseResult} into the {@link ExtractedPdf} structure the
 * heuristic parsers expect. Pure and synchronous so it can be unit-tested
 * without the native engine.
 *
 * LiteParse uses a top-left origin (y grows downwards), the opposite of pdfjs.
 * We group items by their rounded y, emit lines top→bottom, and order segments
 * within a line left→right — matching `groupItemsIntoLines` in
 * {@link pdfTextExtractor}.
 */
export function liteParseResultToExtractedPdf(
  result: LiteParseResult,
  fileName: string,
): ExtractedPdf {
  const allLines: PdfTextLine[] = [];
  const pages = result.pages ?? [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = page.pageNum ?? i + 1;
    const lineMap = new Map<number, { y: number; parts: { x: number; str: string }[] }>();

    for (const item of page.textItems ?? []) {
      if (typeof item.text !== 'string' || item.text.trim() === '') continue;
      const y = Math.round(item.y);
      const existing = lineMap.get(y);
      if (existing) {
        existing.parts.push({ x: item.x, str: item.text });
      } else {
        lineMap.set(y, { y, parts: [{ x: item.x, str: item.text }] });
      }
    }

    // Top-left origin: smaller y is higher on the page, so sort ascending.
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => a - b);
    for (const y of sortedYs) {
      const entry = lineMap.get(y)!;
      entry.parts.sort((a, b) => a.x - b.x);
      const text = entry.parts.map(p => p.str).join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        allLines.push({ page: pageNum, y, text });
      }
    }
  }

  return {
    fileName,
    fullText: allLines.map(l => l.text).join('\n'),
    lines: allLines,
    pageCount: pages.length,
  };
}

function toBytes(input: LiteParseInput): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

/** Options forwarded to the LiteParse engine. OCR is disabled by default. */
export interface LiteParseExtractOptions {
  /** Enable Tesseract OCR for scanned pages. Default: false (fast, text-only). */
  ocrEnabled?: boolean;
  /** Suppress LiteParse progress output. Default: true. */
  quiet?: boolean;
}

/**
 * Extract text and line layout from PDF bytes using LiteParse.
 *
 * Node-only: throws if the native `@llamaindex/liteparse` binding is not
 * available on the current platform.
 */
export async function extractPdfTextWithLiteParse(
  input: LiteParseInput,
  fileName: string,
  options: LiteParseExtractOptions = {},
): Promise<ExtractedPdf> {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const parser = new LiteParse({
    ocrEnabled: options.ocrEnabled ?? false,
    quiet: options.quiet ?? true,
  });
  const result = (await parser.parse(toBytes(input))) as unknown as LiteParseResult;
  return liteParseResultToExtractedPdf(result, fileName);
}
