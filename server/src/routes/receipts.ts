import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Database } from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { apiError, asyncHandler, handler, nextCursor, nowIso, parseBody, parseIntParam, parsePagination, resolveUserId, sendError } from '../http.js';
import { extractDocumentText } from '../documentParser.js';
import { documentBody, documentFromRequest, type DocumentMimeType } from '../receiptFiles.js';
import { logger } from '../logger.js';

interface ReceiptRow {
  id: number; user_id: number; file_name: string; mime_type: string;
  byte_length: number; sha256: string; status: string; created_at: string;
}
const receiptColumns = 'id, user_id, file_name, mime_type, length(content) AS byte_length, sha256, status, created_at';
const metadata = (row: ReceiptRow) => ({
  id: row.id, fileName: row.file_name, mimeType: row.mime_type, byteLength: row.byte_length,
  sha256: row.sha256, status: row.status, createdAt: row.created_at,
});
const statuses = z.enum(['pending', 'reviewed']);
const pairingBody = z.object({
  port: z.number().int().min(0).max(65535).refine(port => port === 0 || port >= 1024).default(8790),
  publicUrl: z.string().optional(),
  language: z.enum(['en', 'it', 'fr', 'de', 'es']).default('en'),
});
const phoneAssets = fileURLToPath(new URL('../../public/', import.meta.url));
const pairingLifetime = 30 * 60 * 1000;

function isPrivateAddress(address: string): boolean {
  return isIP(address) === 4 && (address.startsWith('192.168.') || address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(address));
}

function privateAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => (entries ?? [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal && isPrivateAddress(entry.address)).map(entry => entry.address));
}

export function buildReceiptsRouter(db: Database, extractor = extractDocumentText) {
  const router = Router();
  const uploadLimiter = rateLimit({
    windowMs: 60_000, limit: 60, validate: { xForwardedForHeader: false },
    message: { error: { code: 'rate_limited', message: 'Too many receipt requests. Retry shortly.' } },
  });
  let pairing: {
    id: string; userId: number; server: Server; timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let pairingStarting = false;
  let closed = false;
  const parsing = new Set<AbortController>();

  const closePairing = async () => {
    const active = pairing;
    pairing = null;
    if (!active) return;
    clearTimeout(active.timer);
    await new Promise<void>((resolve, reject) => {
      active.server.close(error => error ? reject(error) : resolve());
      active.server.closeAllConnections();
    });
  };
  const close = async () => {
    closed = true;
    for (const controller of parsing) controller.abort();
    await closePairing();
  };

  const store = (userId: number, document: { bytes: Buffer; fileName: string; mimeType: DocumentMimeType }) => {
    const digest = createHash('sha256').update(document.bytes).digest('hex');
    return db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO receipts (user_id, file_name, mime_type, content, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, sha256) DO NOTHING`,
      ).run(userId, document.fileName, document.mimeType, document.bytes, digest, nowIso());
      const row = db.prepare(`SELECT ${receiptColumns} FROM receipts WHERE user_id = ? AND sha256 = ?`).get(userId, digest) as ReceiptRow;
      return { created: result.changes > 0, receipt: metadata(row) };
    })();
  };

  router.post('/document-text', ...documentBody, asyncHandler(async (req, res) => {
    if (closed) throw apiError(503, 'server_closing', 'The document service is shutting down.');
    const document = documentFromRequest(req, true);
    const controller = new AbortController();
    parsing.add(controller);
    const abort = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', abort);
    if (res.destroyed || req.aborted) controller.abort();
    try {
      res.json(await extractor(document.bytes, document.fileName, document.mimeType, { signal: controller.signal }));
    } finally {
      res.removeListener('close', abort);
      parsing.delete(controller);
    }
  }));

  router.post('/receipts', ...documentBody, handler((req, res) => {
    const result = store(resolveUserId(req), documentFromRequest(req));
    res.status(result.created ? 201 : 200).json(result.receipt);
  }));

  router.get('/receipts', handler((req, res) => {
    const userId = resolveUserId(req);
    const { limit, offset } = parsePagination(req);
    const status = req.query.status === undefined ? undefined : parseBody(statuses, req.query.status);
    const rows = db.prepare(
      `SELECT ${receiptColumns} FROM receipts WHERE user_id = ? ${status ? 'AND status = ?' : ''}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    ).all(...(status ? [userId, status, limit, offset] : [userId, limit, offset])) as ReceiptRow[];
    res.json({ items: rows.map(metadata), nextCursor: nextCursor(offset, rows.length, limit) });
  }));

  router.delete('/receipts', asyncHandler(async (req, res) => {
    const userId = resolveUserId(req);
    if (pairing?.userId === userId) await closePairing();
    db.prepare('DELETE FROM receipts WHERE user_id = ?').run(userId);
    res.status(204).send();
  }));

  router.get('/receipts/:id/content', handler((req, res) => {
    const row = db.prepare('SELECT file_name, mime_type, content FROM receipts WHERE user_id = ? AND id = ?')
      .get(resolveUserId(req), parseIntParam(req.params.id, 'id')) as { file_name: string; mime_type: string; content: Buffer } | undefined;
    if (!row) throw apiError(404, 'not_found', 'Receipt not found.');
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).attachment(row.file_name).type(row.mime_type).send(row.content);
  }));

  router.patch('/receipts/:id', handler((req, res) => {
    const userId = resolveUserId(req);
    const id = parseIntParam(req.params.id, 'id');
    const { status } = parseBody(z.object({ status: statuses }), req.body);
    const updated = db.prepare('UPDATE receipts SET status = ? WHERE user_id = ? AND id = ?').run(status, userId, id);
    if (!updated.changes) throw apiError(404, 'not_found', 'Receipt not found.');
    res.json(metadata(db.prepare(`SELECT ${receiptColumns} FROM receipts WHERE user_id = ? AND id = ?`).get(userId, id) as ReceiptRow));
  }));

  router.delete('/receipts/:id', handler((req, res) => {
    const result = db.prepare('DELETE FROM receipts WHERE user_id = ? AND id = ?').run(resolveUserId(req), parseIntParam(req.params.id, 'id'));
    if (!result.changes) throw apiError(404, 'not_found', 'Receipt not found.');
    res.status(204).send();
  }));

  router.post('/receipt-pairings', asyncHandler(async (req, res) => {
    if (closed) throw apiError(503, 'server_closing', 'The receipt service is shutting down.');
    const body = parseBody(pairingBody, req.body ?? {});
    const userId = resolveUserId(req);
    let tunnelOrigin: string | undefined;
    if (body.publicUrl) {
      try {
        const url = new URL(body.publicUrl);
        if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isPrivateAddress(url.hostname)))
          || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid origin');
        tunnelOrigin = url.origin;
      } catch {
        throw apiError(400, 'invalid_body', 'Use an HTTPS tunnel origin or a private IPv4 HTTP upload origin, without credentials, paths, queries or fragments.');
      }
    }
    if (pairing || pairingStarting) throw apiError(409, 'pairing_active', 'Stop the current receipt pairing before starting another.');
    pairingStarting = true;
    try {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest();
      const id = randomUUID();
      const expiresAt = Date.now() + pairingLifetime;
      const receiver = express();
      receiver.disable('x-powered-by');
      receiver.use((_req, response, next) => {
        response.set({
          'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src blob: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
        });
        next();
      });
      receiver.use(uploadLimiter);
      for (const [route, file] of [
        ['/receipt-upload', 'receipt-upload.html'],
        ['/receipt-upload.js', 'receipt-upload.js'],
        ['/receipt-upload.css', 'receipt-upload.css'],
      ]) receiver.get(route, (_req, response) => response.sendFile(file, { root: phoneAssets }));
      receiver.post('/receipts', (request: Request, response: Response, next: NextFunction) => {
        const authorization = request.get('authorization') ?? '';
        const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
        const hash = createHash('sha256').update(supplied).digest();
        if (!pairing || pairing.id !== id || Date.now() >= expiresAt || !supplied || !timingSafeEqual(hash, tokenHash)) {
          sendError(response, apiError(401, 'pairing_expired', 'Pairing is invalid or expired. Re-pair; photos queued on your phone are retained.'));
          return;
        }
        next();
      }, ...documentBody, handler((request, response) => {
        if (!pairing || pairing.id !== id || Date.now() >= expiresAt) throw apiError(401, 'pairing_expired', 'Pairing is invalid or expired. Re-pair; queued photos are retained.');
        const result = store(userId, documentFromRequest(request));
        response.status(result.created ? 201 : 200).json(result.receipt);
      }));
      receiver.use((_req, response) => sendError(response, apiError(404, 'not_found', 'This listener accepts receipt uploads only.')));
      receiver.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
        logger.error('receipt-upload', 'request-failed', 'A receipt upload failed.', { pii: { error: error.message } });
        sendError(response, apiError(500, 'internal_error', 'Receipt could not be saved. The phone queue is retained.'));
      });
      const server = await new Promise<Server>((resolve, reject) => {
        const listener = receiver.listen(body.port, '0.0.0.0', () => resolve(listener));
        listener.once('error', reject);
      });
      const address = server.address();
      if (closed) {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        throw apiError(503, 'server_closing', 'The receipt service is shutting down.');
      }
      if (!address || typeof address === 'string') {
        server.close();
        throw apiError(500, 'pairing_start_failed', 'The receipt upload listener has no TCP address.');
      }
      server.requestTimeout = 30_000;
      const timer = setTimeout(() => {
        void closePairing().catch(error => logger.error('receipt-upload', 'close-failed', 'The receipt listener could not close.', { pii: { error: String(error) } }));
      }, pairingLifetime);
      timer.unref();
      pairing = { id, userId, server, timer };
      const origins = [`http://127.0.0.1:${address.port}`, ...privateAddresses().map(ip => `http://${ip}:${address.port}`)];
      if (tunnelOrigin) origins.push(tunnelOrigin);
      const fragment = new URLSearchParams({ token, lang: body.language, expiresAt: new Date(expiresAt).toISOString() });
      res.status(201).json({ id, port: address.port, expiresAt: new Date(expiresAt).toISOString(), urls: origins.map(origin => `${origin}/receipt-upload#${fragment}`) });
    } catch (error) {
      logger.error('receipt-upload', 'pairing-start-failed', 'Receipt pairing could not start.', { pii: { error: String(error) } });
      if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
        throw apiError(409, 'upload_port_in_use', 'The receipt upload port is already in use. Choose a free port and retry.');
      }
      throw error;
    } finally {
      pairingStarting = false;
    }
  }));

  router.delete('/receipt-pairings/:id', asyncHandler(async (req, res) => {
    if (!pairing || pairing.id !== req.params.id || pairing.userId !== resolveUserId(req)) {
      throw apiError(404, 'not_found', 'Receipt pairing not found.');
    }
    await closePairing();
    res.status(204).send();
  }));

  return { router, close };
}
