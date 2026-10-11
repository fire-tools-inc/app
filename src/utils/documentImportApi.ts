import { z } from 'zod';
import type { ReceiptDocument, ReceiptPairing } from '../types/receiptImport';
import { getApiBaseUrl } from './apiBase';
import { loadSettings } from './cookieSettings';
import { IS_DEMO_MODE } from './demoMode';
import { liteParseResultSchema, liteParseResultToExtractedPdf } from './liteParseResult';
import { logger } from './logger';
import type { ExtractedPdf } from './pdfTextExtractor';

const maxDocumentBytes = 10 * 1024 * 1024;
const receiptSchema: z.ZodType<ReceiptDocument> = z.object({
  id: z.number().int().positive(), fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteLength: z.number().int().positive().max(maxDocumentBytes),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(['pending', 'reviewed']), createdAt: z.string().min(1),
});
const pairingSchema: z.ZodType<ReceiptPairing> = z.object({
  id: z.string().uuid(), port: z.number().int().positive().max(65535), expiresAt: z.string().datetime(),
  urls: z.array(z.string().url()).min(1),
});
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

async function request<T>(
  path: string,
  read: (response: Response) => Promise<T>,
  init: RequestInit = {},
  allowMissing = false,
): Promise<T> {
  if (IS_DEMO_MODE) throw new Error('Document imports and receipt uploads are disabled in the read-only demo.');
  if (init.signal?.aborted) throw init.signal.reason ?? new Error('Document request was cancelled.');
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) throw new Error('LiteParse and receipt photos require the desktop app or a configured local backend.');
  if (init.signal?.aborted) throw init.signal.reason ?? new Error('Document request was cancelled.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  const timer = setTimeout(abort, 90_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    if (!response.ok && !(allowMissing && response.status === 404)) {
      let message = `The local server request failed (HTTP ${response.status}).`;
      const result = errorSchema.safeParse(await response.json().catch(() => null));
      if (result.success) message = result.data.error.message;
      throw new Error(message);
    }
    return await read(response);
  } catch (error) {
    if (!init.signal?.aborted) {
      logger.error('document-import', 'request-failed', 'A local document request failed.', { pii: { error: error instanceof Error ? error.message : String(error) } });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}

function documentType(file: File): string {
  const extensions: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const type = file.type || extensions[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!Object.values(extensions).includes(type)) throw new Error('Use a PDF, JPEG, PNG or WebP file.');
  if (!file.size || file.size > maxDocumentBytes) throw new Error('Choose a non-empty document no larger than 10 MB.');
  return type;
}

export async function extractDocumentTextWithLiteParse(file: File, signal?: AbortSignal): Promise<ExtractedPdf> {
  return request(`/document-text?fileName=${encodeURIComponent(file.name)}`, async response =>
    liteParseResultToExtractedPdf(liteParseResultSchema.parse(await response.json()), file.name), {
    method: 'POST', headers: { 'Content-Type': documentType(file) }, body: file, signal,
  });
}

export async function saveReceipt(file: File, signal?: AbortSignal): Promise<ReceiptDocument> {
  const type = documentType(file);
  if (type === 'application/pdf') throw new Error('Receipt storage accepts JPEG, PNG or WebP images.');
  return request(`/receipts?fileName=${encodeURIComponent(file.name)}`, async response => receiptSchema.parse(await response.json()), {
    method: 'POST', headers: { 'Content-Type': type }, body: file, signal,
  });
}

export async function listReceipts(status?: ReceiptDocument['status'], cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  return request(`/receipts?${params}`, async response =>
    z.object({ items: z.array(receiptSchema), nextCursor: z.string().nullable() }).parse(await response.json()), { signal });
}

export async function getReceiptFile(receipt: ReceiptDocument, signal?: AbortSignal): Promise<File> {
  return request(`/receipts/${receipt.id}/content`, async response => {
    const type = response.headers.get('Content-Type')?.split(';')[0];
    const blob = await response.blob();
    if (type !== receipt.mimeType || blob.size !== receipt.byteLength) throw new Error('The original receipt download is incomplete or has the wrong file type. Retry; the stored receipt is unchanged.');
    return new File([blob], receipt.fileName, { type: receipt.mimeType });
  }, { signal });
}

export async function markReceiptReviewed(id: number, signal?: AbortSignal): Promise<void> {
  await request(`/receipts/${id}`, async response => { receiptSchema.parse(await response.json()); }, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'reviewed' }), signal,
  });
}

export async function deleteReceipt(id: number, signal?: AbortSignal): Promise<void> {
  await request(`/receipts/${id}`, async () => {}, { method: 'DELETE', signal });
}

export async function clearReceiptOriginals(): Promise<void> {
  if (IS_DEMO_MODE) throw new Error('Receipt reset is disabled in the read-only demo.');
  if (!await getApiBaseUrl()) {
    if (window.fireTools || loadSettings().backend.mode === 'custom') {
      throw new Error('The receipt backend is unavailable. Reconnect before resetting saved data.');
    }
    return;
  }
  await request('/receipts', async () => {}, { method: 'DELETE' });
}

export async function startReceiptPairing(
  options: { port: number; publicUrl?: string; language: string },
): Promise<ReceiptPairing> {
  return request('/receipt-pairings', async response => pairingSchema.parse(await response.json()), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
  });
}

export async function stopReceiptPairing(id: string): Promise<void> {
  await request(`/receipt-pairings/${encodeURIComponent(id)}`, async () => {}, { method: 'DELETE' }, true);
}

export function downloadReceiptFile(file: File): void {
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
