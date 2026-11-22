import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { apiError, handler, resolveUserId, sendError } from '../http.js';
import type { SettingsFileStore } from '../settingsFile.js';
import {
  SYNC_DOMAINS, SyncEntityError, isSyncDomain, withEntity,
  type Changeset, type DomainHandler, type SyncDomain,
} from '../sync/shared.js';
import { assetAllocationDomain, calculatorDomain, settingsDomain } from '../sync/simpleDomains.js';
import { expenseTrackerDomain } from '../sync/expenseTracker.js';
import { netWorthDomain } from '../sync/netWorth.js';

export const DOMAIN_HANDLERS: Record<SyncDomain, DomainHandler> = {
  settings: settingsDomain,
  calculator: calculatorDomain,
  assetAllocation: assetAllocationDomain,
  expenseTracker: expenseTrackerDomain,
  netWorth: netWorthDomain,
};

const changesetSchema = z.object({
  initialize: z.boolean().optional(),
  set: z.record(z.string(), z.unknown()).optional(),
  upsert: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).optional(),
  delete: z.record(z.string(), z.array(z.string())).optional(),
}).strict();

interface DomainRow { revision: number; initialized_at: string | null }

export const getInstanceId = (db: Database): string => {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'instance_id'").get() as { value: string } | undefined;
  if (row) return row.value;
  const value = randomBytes(16).toString('hex');
  db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('instance_id', ?)").run(value);
  return (db.prepare("SELECT value FROM sync_meta WHERE key = 'instance_id'").get() as { value: string }).value;
};

const domainRow = (db: Database, userId: number, domain: SyncDomain): DomainRow =>
  (db.prepare('SELECT revision, initialized_at FROM sync_domains WHERE user_id = ? AND domain = ?')
    .get(userId, domain) as DomainRow | undefined) ?? { revision: 0, initialized_at: null };

const parseDomain = (raw: string): SyncDomain => {
  if (!isSyncDomain(raw)) {
    throw apiError(404, 'not_found', `Unknown domain "${raw}". Use one of: ${SYNC_DOMAINS.join(', ')}.`);
  }
  return raw;
};

const parseChangeset = (body: unknown): Changeset => {
  if (body === undefined) {
    throw new SyncEntityError(400, null, null, 'Send the changeset as a JSON object with Content-Type: application/json.');
  }
  const result = changesetSchema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  const [section, collection, index] = issue.path;
  const location = section === 'set'
    ? { collection: 'set', key: collection === undefined ? null : String(collection) }
    : { collection: collection === undefined ? null : String(collection), key: index === undefined ? null : `#${String(index)}` };
  const message = `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`;
  throw new SyncEntityError(400, location.collection, location.key, message);
};

const checkChangeset = (domain: SyncDomain, handler: DomainHandler, changeset: Changeset): void => {
  for (const key of Object.keys(changeset.set ?? {})) {
    if (!handler.setKeys.includes(key)) {
      throw new SyncEntityError(400, 'set', key,
        `Unknown singleton "${key}" for ${domain}. Use: ${handler.setKeys.join(', ') || 'none'}.`);
    }
  }
  for (const collection of [...Object.keys(changeset.upsert ?? {}), ...Object.keys(changeset.delete ?? {})]) {
    if (!handler.collections.includes(collection)) {
      throw new SyncEntityError(400, collection, null,
        `Unknown collection "${collection}" for ${domain}. Use: ${handler.collections.join(', ') || 'none'}.`);
    }
  }
  for (const [collection, entities] of Object.entries(changeset.upsert ?? {})) {
    const seen = new Set<string>();
    for (const entity of entities) {
      const key = handler.keyOf(collection, entity);
      if (key === null) continue;
      if (seen.has(key)) throw new SyncEntityError(400, collection, key, 'The same key appears more than once in this changeset.');
      seen.add(key);
    }
  }
};

/** Applies deletes (children first), then singletons, then upserts (parents first). */
const applyChangeset = (db: Database, userId: number, handler: DomainHandler, changeset: Changeset): void => {
  for (const collection of [...handler.collections].reverse()) {
    for (const key of changeset.delete?.[collection] ?? []) {
      withEntity(collection, key, () => handler.remove(db, userId, collection, key));
    }
  }
  for (const [key, value] of Object.entries(changeset.set ?? {})) {
    withEntity('set', key, () => handler.applySet(db, userId, key, value));
  }
  for (const collection of handler.collections) {
    const entities = changeset.upsert?.[collection];
    if (entities?.length) withEntity(collection, null, () => handler.upsert(db, userId, collection, entities));
  }
};

export const buildSyncRouter = (db: Database, fileStore?: SettingsFileStore): Router => {
  const router = Router();

  router.get('/sync/status', handler((req, res) => {
    const userId = resolveUserId(req);
    const rows = db.prepare('SELECT domain, revision, initialized_at FROM sync_domains WHERE user_id = ?')
      .all(userId) as Array<DomainRow & { domain: SyncDomain }>;
    const byDomain = new Map(rows.map(row => [row.domain, row]));
    res.json({
      instanceId: getInstanceId(db),
      domains: Object.fromEntries(SYNC_DOMAINS.map(domain => [domain, {
        revision: byDomain.get(domain)?.revision ?? 0,
        initialized: Boolean(byDomain.get(domain)?.initialized_at),
      }])),
    });
  }));

  router.get('/state/:domain', handler((req, res) => {
    const userId = resolveUserId(req);
    const domain = parseDomain(req.params.domain as string);
    const domainHandler = DOMAIN_HANDLERS[domain];
    const instanceId = getInstanceId(db);
    const state = db.transaction(() => {
      const row = domainRow(db, userId, domain);
      return {
        domain,
        instanceId,
        revision: row.revision,
        initialized: row.initialized_at !== null,
        data: domainHandler.hasData(db, userId) ? domainHandler.read(db, userId) : null,
      };
    })();
    res.json(state);
  }));

  const write = (replace: boolean) => handler((req, res) => {
    const userId = resolveUserId(req);
    const domain = parseDomain(req.params.domain as string);
    const domainHandler = DOMAIN_HANDLERS[domain];
    try {
      const changeset = parseChangeset(req.body);
      checkChangeset(domain, domainHandler, changeset);
      const result = db.transaction(() => {
        if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
          throw apiError(404, 'not_found', `User ${userId} does not exist.`);
        }
        const previousRevision = domainRow(db, userId, domain).revision;
        if (replace) domainHandler.clear(db, userId);
        applyChangeset(db, userId, domainHandler, changeset);
        if (changeset.initialize) {
          db.prepare(`INSERT INTO sync_domains (user_id, domain, initialized_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, domain) DO UPDATE
            SET initialized_at = COALESCE(sync_domains.initialized_at, excluded.initialized_at)`).run(userId, domain);
        }
        const row = domainRow(db, userId, domain);
        return { domain, revision: row.revision, previousRevision, initialized: row.initialized_at !== null };
      }).immediate();
      if (domain === 'settings') fileStore?.syncFromDb(db);
      res.json(result);
    } catch (error) {
      if (!(error instanceof SyncEntityError)) throw error;
      const { status, collection, key, message } = error;
      const where = collection ? ` (${collection}${key ? ` ${key}` : ''})` : '';
      sendError(res, apiError(status, status === 409 ? 'conflict' : 'invalid_body',
        `${status === 409 ? 'Conflicting change' : 'Invalid change'}${where}: ${message}`, { collection, key, message }));
    }
  });

  router.patch('/state/:domain', write(false));
  router.put('/state/:domain', write(true));

  return router;
};
