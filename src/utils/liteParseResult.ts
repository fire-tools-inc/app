import { z } from 'zod';
import type { ExtractedPdf, PdfTextLine } from './pdfTextExtractor';

export interface LiteParseTextItem {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontName?: string;
  fontSize?: number;
  confidence?: number;
}

export interface LiteParsePage {
  pageNum?: number;
  text?: string;
  textItems: LiteParseTextItem[];
}

export interface LiteParseResult {
  text: string;
  totalPages?: number;
  pages: LiteParsePage[];
}

export const liteParseResultSchema = z.object({
  text: z.string(),
  totalPages: z.number().int().min(1).max(100),
  pages: z.array(z.object({
    pageNum: z.number().int().min(1),
    text: z.string().optional(),
    textItems: z.array(z.object({ text: z.string(), x: z.number().finite(), y: z.number().finite() })),
  })).min(1).max(100),
});

export function liteParseResultToExtractedPdf(result: LiteParseResult, fileName: string): ExtractedPdf {
  const lines: PdfTextLine[] = [];
  for (const [index, page] of result.pages.entries()) {
    const pageNum = page.pageNum ?? index + 1;
    const grouped = new Map<number, { x: number; text: string }[]>();
    for (const item of page.textItems) {
      if (!item.text.trim() || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const y = Math.round(item.y);
      const parts = grouped.get(y) ?? [];
      parts.push({ x: item.x, text: item.text });
      grouped.set(y, parts);
    }
    // LiteParse's top-left origin is the reverse of PDF.js's PDF coordinates.
    for (const y of [...grouped.keys()].sort((a, b) => a - b)) {
      const text = grouped.get(y)!.sort((a, b) => a.x - b.x).map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ page: pageNum, y, text });
    }
    if (!grouped.size && page.text) {
      page.text.split('\n').forEach((text, y) => {
        if (text.trim()) lines.push({ page: pageNum, y, text: text.trim() });
      });
    }
  }
  return { fileName, fullText: lines.map(line => line.text).join('\n'), lines, pageCount: result.totalPages ?? result.pages.length };
}
