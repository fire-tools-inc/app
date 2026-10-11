// @ts-check
import { LiteParse } from '@llamaindex/liteparse';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

process.once('message', async (/** @type {import('./documentParser.js').DocumentWorkerRequest} */ message) => {
  /** @type {LiteParse | undefined} */
  let parser;
  /** @type {import('./documentParser.js').DocumentWorkerResponse} */
  let response;
  /** @type {'document_page_limit' | 'parser_unavailable' | 'document_parse_failed'} */
  let failureCode = 'parser_unavailable';
  try {
    // Native Tesseract cannot read virtual ASAR paths; its model is unpacked.
    const tessdataPath = fileURLToPath(new URL('../tessdata/', import.meta.url))
      .replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
    await access(join(tessdataPath, 'eng.traineddata'), constants.R_OK);
    failureCode = 'document_parse_failed';
    if (message.inputPath.endsWith('.pdf')) {
      const probe = new LiteParse({ ocrEnabled: false, quiet: true, maxPages: 1 });
      try {
        if ((await probe.parse(message.inputPath)).totalPages > 100) {
          failureCode = 'document_page_limit';
          throw new Error('The document exceeds 100 pages.');
        }
      } finally {
        probe.close();
      }
    }
    parser = new LiteParse({ ocrEnabled: true, tessdataPath, quiet: true, maxPages: 100, numWorkers: 1 });
    const result = await parser.parse(message.inputPath);
    response = { ok: true, result: { text: result.text, pages: result.pages, totalPages: result.totalPages } };
  } catch (error) {
    response = { ok: false, code: failureCode, error: error instanceof Error ? error.message : String(error) };
  } finally {
    parser?.close();
  }
  process.send?.(response, () => process.disconnect());
});
