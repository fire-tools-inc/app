import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiteParse } from '@llamaindex/liteparse';
import request from 'supertest';
import { extractDocumentText } from '../src/documentParser.js';
import { makeApp } from './helpers.js';
import { liteParseResultToExtractedPdf } from '../../src/utils/liteParseResult.js';
import { parsePdf } from '../../src/utils/pdfHeuristics.js';
import { expectDiagnostic } from '../../tests/shared/diagnostics.js';

const fixture = new URL('../../tests/pages/expense-tracker/fixtures/sample-invoice.pdf', import.meta.url);
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('local LiteParse runtime', () => {
  it('rejects 101-page PDFs before expensive OCR work', async () => {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Count 101 /Kids [${Array.from({ length: 101 }, (_, index) => `${index + 3} 0 R`).join(' ')}] >>`,
      ...Array.from({ length: 101 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << >> >>'),
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
      const offset = Buffer.byteLength(pdf);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
      return offset;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await expect(extractDocumentText(Buffer.from(pdf), 'synthetic-101-pages.pdf', 'application/pdf'))
      .rejects.toMatchObject({ status: 422, code: 'document_page_limit' });
    expectDiagnostic('error', '[parse-failed]: The local document parser failed.');
  });

  it('parses a real PDF through the public API without creating financial entries', async () => {
    const { app, db, cleanup } = await makeApp();
    try {
      const response = await request(app).post('/api/v1/document-text?fileName=synthetic-invoice.pdf')
        .set('Content-Type', 'application/pdf').send(await readFile(fixture));
      expect(response.status).toBe(200);
      expect(response.body.totalPages).toBe(1);
      expect(response.body.text).toMatch(/2[.,]158|2158/i);
      expect(db.prepare('SELECT count(*) AS count FROM expense_entries').get()).toEqual({ count: 0 });
    } finally {
      await cleanup();
    }
  }, 20_000);

  it('OCRs an image receipt locally rather than requiring a vision-provider API', async () => {
    const parser = new LiteParse({ quiet: true, ocrEnabled: false, dpi: 180 });
    try {
      const screenshots = await parser.screenshot(await readFile(fixture), [1]);
      const result = await extractDocumentText(Buffer.from(screenshots[0].imageBuffer), 'synthetic-receipt.png', 'image/png');
      expect(result.pages).toHaveLength(1);
      expect(result.text).toMatch(/2[.,]158|2158/i);
      expect(result.text).toMatch(/total/i);
      const parsed = parsePdf(liteParseResultToExtractedPdf(result, 'synthetic-receipt.png'), 'invoice', 'EUR');
      expect(parsed.drafts).toHaveLength(1);
      expect(parsed.drafts[0].amount).toBeCloseTo(2158.8, 2);
    } finally {
      parser.close();
    }
  }, 20_000);

  it('terminates timed-out work and removes its private temporary input directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fire-tools-parser-test-'));
    directories.push(root);
    await expect(extractDocumentText(await readFile(fixture), 'synthetic-invoice.pdf', 'application/pdf', {
      timeoutMs: 1, tempRoot: root,
    })).rejects.toMatchObject({ status: 408, code: 'parse_timeout' });
    expect(await readdir(root)).toEqual([]);
    expectDiagnostic('error', '[parse-timeout]: Document parsing exceeded its deadline.');
  });

  it('does not create a worker or a temporary file for already-cancelled work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fire-tools-parser-test-'));
    directories.push(root);
    const controller = new AbortController();
    controller.abort();
    await expect(extractDocumentText(await readFile(fixture), 'synthetic-invoice.pdf', 'application/pdf', {
      signal: controller.signal, tempRoot: root,
    })).rejects.toMatchObject({ status: 408, code: 'parse_cancelled' });
    expect(await readdir(root)).toEqual([]);
  });
});
