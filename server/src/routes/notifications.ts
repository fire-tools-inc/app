import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, bool01, fromBool01, nowIso, parsePagination, nextCursor } from '../http.js';

interface NotifRow {
  id: number;
  external_id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  action_url: string | null;
  action_label: string | null;
  is_read: number;
  timestamp: string;
  expires_at: string | null;
}

const VALID_TYPES = new Set([
  'NEW_MONTH',
  'NEW_QUARTER',
  'TAX_REMINDER',
  'INCOME_LOGGED',
  'EXPENSE_LOGGED',
  'NET_WORTH_UPDATE',
  'DCA_REMINDER',
  'FIRE_MILESTONE',
  'PORTFOLIO_REBALANCE',
  'SYSTEM',
  'WELCOME',
]);
const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH']);

const mapNotif = (row: NotifRow) => ({
  id: row.id,
  externalId: row.external_id,
  type: row.type,
  title: row.title,
  message: row.message,
  priority: row.priority,
  actionUrl: row.action_url,
  actionLabel: row.action_label,
  read: fromBool01(row.is_read),
  timestamp: row.timestamp,
  expiresAt: row.expires_at,
});

const randomExternalId = (): string =>
  `notif-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const buildNotificationsRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/notifications',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const { limit, offset } = parsePagination(req);
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
      const filter = unreadOnly ? 'AND is_read = 0' : '';
      const rows = db
        .prepare(
          `SELECT * FROM notifications WHERE user_id = ? ${filter}
           ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(userId, limit, offset) as NotifRow[];
      res.json({ items: rows.map(mapNotif), nextCursor: nextCursor(offset, rows.length, limit) });
    }),
  );

  router.post(
    '/notifications',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      const type = String(body.type ?? '');
      const title = String(body.title ?? '');
      const message = String(body.message ?? '');
      if (!type || !title || !message) {
        throw apiError(400, 'invalid_body', 'type, title, message are required');
      }
      if (!VALID_TYPES.has(type)) throw apiError(400, 'invalid_body', `Invalid type: ${type}`);
      const priority = body.priority ? String(body.priority) : 'MEDIUM';
      if (!VALID_PRIORITIES.has(priority)) {
        throw apiError(400, 'invalid_body', `Invalid priority: ${priority}`);
      }
      const externalId = typeof body.externalId === 'string' ? body.externalId : randomExternalId();
      try {
        const info = db
          .prepare(
            `INSERT INTO notifications
               (user_id, external_id, type, title, message, priority, action_url, action_label, is_read, timestamp, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .run(
            userId,
            externalId,
            type,
            title,
            message,
            priority,
            (body.actionUrl as string | null) ?? null,
            (body.actionLabel as string | null) ?? null,
            nowIso(),
            (body.expiresAt as string | null) ?? null,
          );
        const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid) as NotifRow;
        res.status(201).json(mapNotif(row));
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw apiError(409, 'conflict', `Notification with externalId "${externalId}" already exists`);
        }
        throw err;
      }
    }),
  );

  router.post(
    '/notifications/mark-all-read',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const info = db
        .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
        .run(userId);
      res.json({ updated: info.changes });
    }),
  );

  router.get(
    '/notifications/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const row = db
        .prepare('SELECT * FROM notifications WHERE user_id = ? AND external_id = ?')
        .get(userId, req.params.externalId) as NotifRow | undefined;
      if (!row) throw apiError(404, 'not_found', 'Notification not found');
      res.json(mapNotif(row));
    }),
  );

  router.patch(
    '/notifications/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.read !== 'boolean') {
        throw apiError(400, 'invalid_body', 'Field "read" must be a boolean');
      }
      const info = db
        .prepare('UPDATE notifications SET is_read = ? WHERE user_id = ? AND external_id = ?')
        .run(bool01(body.read), userId, req.params.externalId);
      if (info.changes === 0) throw apiError(404, 'not_found', 'Notification not found');
      const row = db
        .prepare('SELECT * FROM notifications WHERE user_id = ? AND external_id = ?')
        .get(userId, req.params.externalId) as NotifRow;
      res.json(mapNotif(row));
    }),
  );

  router.delete(
    '/notifications/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const info = db
        .prepare('DELETE FROM notifications WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      if (info.changes === 0) throw apiError(404, 'not_found', 'Notification not found');
      res.status(204).end();
    }),
  );

  return router;
};
