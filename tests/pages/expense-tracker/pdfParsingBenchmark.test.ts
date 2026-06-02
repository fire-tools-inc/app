/**
 * PDF parsing benchmark: current pdfjs-based extractor vs LiteParse.
 *
 * This test feeds the same paystub and invoice fixtures through two text
 * extraction engines and then through the shared heuristic parsers, comparing:
 *   1. Correctness — does each engine let the heuristics recover the right
 *      document type, amount, currency and transaction kind?
 *   2. Speed — wall-clock extraction time per engine.
 *
 * Runs in the Node environment because both engines are native/Node-only here:
 *   - pdfjs `legacy` build runs on the main thread (no browser Worker), and
 *   - LiteParse uses a native PDFium binding via napi-rs.
 *
 * @vitest-environment node
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { groupItemsIntoLines } from '../../../src/utils/pdfTextExtractor';
import type { ExtractedPdf } from '../../../src/utils/pdfTextExtractor';
import {
  extractPdfTextWithLiteParse,
  liteParseResultToExtractedPdf,
} from '../../../src/utils/liteParseExtractor';
import { parsePdf } from '../../../src/utils/pdfHeuristics';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

interface Expectation {
  file: string;
  docType: 'payslip' | 'invoice';
  kind: 'income' | 'expense';
  amount: number;
  currency: string;
}

const CASES: Expectation[] = [
  { file: 'sample-paystub.pdf', docType: 'payslip', kind: 'income', amount: 3360.75, currency: 'USD' },
  { file: 'sample-invoice.pdf', docType: 'invoice', kind: 'expense', amount: 2158.8, currency: 'EUR' },
];

/** Extract with the production pdfjs pipeline (same grouping as extractPdfText). */
async function extractWithPdfjs(bytes: Uint8Array, fileName: string): Promise<ExtractedPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await task.promise;
  const lines = [];
  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      lines.push(...groupItemsIntoLines(textContent.items, pageNum));
      page.cleanup();
    }
  } finally {
    await pdf.cleanup().catch(() => undefined);
    await task.destroy().catch(() => undefined);
  }
  return {
    fileName,
    fullText: lines.map(l => l.text).join('\n'),
    lines,
    pageCount: pdf.numPages,
  };
}

// Probe LiteParse once so the suite degrades gracefully on platforms where the
// native binding is unavailable (rather than failing the whole test run).
let liteParseAvailable = true;
try {
  await import('@llamaindex/liteparse');
} catch {
  liteParseAvailable = false;
}

interface BenchRow {
  file: string;
  pdfjsMs: number;
  liteMs: number | null;
}
const bench: BenchRow[] = [];

describe('PDF parsing benchmark: pdfjs vs LiteParse', () => {
  for (const tc of CASES) {
    describe(tc.file, () => {
      it('pdfjs extractor + heuristics recover the expected transaction', async () => {
        const bytes = new Uint8Array(await readFile(join(FIXTURES, tc.file)));
        const t0 = performance.now();
        const extracted = await extractWithPdfjs(bytes, tc.file);
        const pdfjsMs = performance.now() - t0;

        const { drafts, resolvedDocType } = parsePdf(extracted, 'auto', 'USD');
        expect(resolvedDocType).toBe(tc.docType);
        expect(drafts).toHaveLength(1);
        expect(drafts[0].kind).toBe(tc.kind);
        expect(drafts[0].amount).toBeCloseTo(tc.amount, 2);
        expect(drafts[0].currency).toBe(tc.currency);

        const row = bench.find(b => b.file === tc.file) ?? { file: tc.file, pdfjsMs: 0, liteMs: null };
        row.pdfjsMs = pdfjsMs;
        if (!bench.includes(row)) bench.push(row);
      });

      it.skipIf(!liteParseAvailable)(
        'LiteParse extractor + heuristics recover the expected transaction',
        async () => {
          const bytes = new Uint8Array(await readFile(join(FIXTURES, tc.file)));
          const t0 = performance.now();
          const extracted = await extractPdfTextWithLiteParse(bytes, tc.file);
          const liteMs = performance.now() - t0;

          const { drafts, resolvedDocType } = parsePdf(extracted, 'auto', 'USD');
          expect(resolvedDocType).toBe(tc.docType);
          expect(drafts).toHaveLength(1);
          expect(drafts[0].kind).toBe(tc.kind);
          expect(drafts[0].amount).toBeCloseTo(tc.amount, 2);
          expect(drafts[0].currency).toBe(tc.currency);

          const row = bench.find(b => b.file === tc.file) ?? { file: tc.file, pdfjsMs: 0, liteMs: null };
          row.liteMs = liteMs;
          if (!bench.includes(row)) bench.push(row);
        },
      );
    });
  }

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('\n=== PDF parsing benchmark (extraction time, lower is better) ===');
    for (const row of bench) {
      const lite = row.liteMs === null ? 'n/a (engine unavailable)' : `${row.liteMs.toFixed(1)}ms`;
      let verdict = '';
      if (row.liteMs !== null) {
        verdict = row.liteMs < row.pdfjsMs ? '→ LiteParse faster' : '→ pdfjs faster';
      }
      // eslint-disable-next-line no-console
      console.log(`${row.file.padEnd(22)} pdfjs=${row.pdfjsMs.toFixed(1)}ms  liteparse=${lite}  ${verdict}`);
    }
    // eslint-disable-next-line no-console
    console.log('Both engines feed the identical heuristic parsers; correctness is asserted above.\n');
  });
});

describe('liteParseResultToExtractedPdf', () => {
  it('groups positioned text items into top-to-bottom, left-to-right lines', () => {
    const extracted = liteParseResultToExtractedPdf(
      {
        text: 'ignored',
        pages: [
          {
            pageNum: 1,
            textItems: [
              { text: 'Amount', x: 200, y: 50 },
              { text: 'Net Pay', x: 72, y: 50 },
              { text: 'Header', x: 72, y: 10 },
              { text: '', x: 72, y: 70 },
            ],
          },
        ],
      },
      'doc.pdf',
    );

    expect(extracted.fileName).toBe('doc.pdf');
    expect(extracted.pageCount).toBe(1);
    // 'Header' (y=10) before 'Net Pay Amount' (y=50); empty item dropped.
    expect(extracted.lines.map(l => l.text)).toEqual(['Header', 'Net Pay Amount']);
    expect(extracted.fullText).toBe('Header\nNet Pay Amount');
  });
});
