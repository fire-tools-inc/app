import { fork } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ParseResult } from '@llamaindex/liteparse';
import { apiError } from './http.js';
import { logger } from './logger.js';
import { DOCUMENT_EXTENSIONS, validateDocumentBytes } from './receiptFiles.js';

export type DocumentTextResult = Pick<ParseResult, 'text' | 'pages' | 'totalPages'>;
export interface DocumentWorkerRequest { inputPath: string }
export type DocumentWorkerResponse = { ok: true; result: DocumentTextResult } | {
  ok: false;
  code: 'document_page_limit' | 'parser_unavailable' | 'document_parse_failed';
  error: string;
};

let activeParses = 0;

export async function extractDocumentText(
  bytes: Buffer,
  fileName: string,
  mimeType: string,
  options: { signal?: AbortSignal; timeoutMs?: number; tempRoot?: string } = {},
): Promise<DocumentTextResult> {
  const type = validateDocumentBytes(bytes, fileName, mimeType, true);
  if (options.signal?.aborted) throw apiError(408, 'parse_cancelled', 'Document parsing was cancelled.');
  if (activeParses >= 2) throw apiError(429, 'parser_busy', 'The local parser is busy. Retry shortly; your receipt remains stored.');
  activeParses++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(join(options.tempRoot ?? tmpdir(), 'fire-tools-document-'));
    const inputPath = join(directory, `input.${DOCUMENT_EXTENSIONS[type]}`);
    await writeFile(inputPath, bytes, { mode: 0o600 });
    const child = fork(new URL('./documentWorker.mjs', import.meta.url), [], {
      execArgv: [],
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
        DYLD_LIBRARY_PATH: process.env.DYLD_LIBRARY_PATH,
        ELECTRON_RUN_AS_NODE: '1', TMPDIR: directory, TMP: directory, TEMP: directory,
      },
      cwd: directory,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-4096); });
    const exited = new Promise<void>(resolve => child.once('close', () => resolve()));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await new Promise<DocumentTextResult>((resolve, reject) => {
        let settled = false;
        const fail = (error: ReturnType<typeof apiError>) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        abort = () => fail(apiError(408, 'parse_cancelled', 'Document parsing was cancelled.'));
        options.signal?.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => {
          logger.error('document-parser', 'parse-timeout', 'Document parsing exceeded its deadline.');
          fail(apiError(408, 'parse_timeout', 'Document parsing timed out. Try a smaller document; stored receipts are retained.'));
        }, options.timeoutMs ?? 60_000);
        child.once('error', error => {
          logger.error('document-parser', 'worker-start-failed', 'The local document parser could not start.', { pii: { error: error.message } });
          fail(apiError(503, 'parser_unavailable', 'The local document parser could not start. Check the server logs.'));
        });
        child.once('exit', (code, signal) => {
          if (settled) return;
          logger.error('document-parser', 'worker-exited', 'The document parser exited before returning a result.', { pii: { code, signal, stderr } });
          fail(apiError(422, 'document_parse_failed', 'The document could not be parsed. Its original receipt is retained.'));
        });
        child.once('message', (message: DocumentWorkerResponse) => {
          if (!message.ok) {
            logger.error('document-parser', 'parse-failed', 'The local document parser failed.', { pii: { error: message.error, stderr } });
            if (message.code === 'document_page_limit') {
              fail(apiError(422, 'document_page_limit', 'Documents are limited to 100 pages. Split the document and retry.'));
            } else if (message.code === 'parser_unavailable') {
              fail(apiError(503, 'parser_unavailable', 'The bundled OCR data is unavailable. Rebuild the backend or reinstall the desktop app; originals are retained.'));
            } else {
              fail(apiError(422, 'document_parse_failed', 'The document could not be parsed. Its original receipt is retained.'));
            }
          } else if (message.result.totalPages > 100) {
            fail(apiError(422, 'document_page_limit', 'Documents are limited to 100 pages. Split the document and retry.'));
          } else {
            settled = true;
            resolve(message.result);
          }
        });
        child.send({ inputPath } satisfies DocumentWorkerRequest, error => {
          if (error) fail(apiError(503, 'parser_unavailable', 'The document parser could not receive its input.'));
        });
        if (options.signal?.aborted) abort();
      });
    } finally {
      clearTimeout(timeout);
      if (abort) options.signal?.removeEventListener('abort', abort);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const forceStop = setTimeout(() => child.kill('SIGKILL'), 1000);
      forceStop.unref();
      await exited;
      clearTimeout(forceStop);
    }
  } finally {
    activeParses--;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
