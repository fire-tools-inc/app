import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { onTestFinished } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { buildApp } from '../src/app.js';
import type { ServerEnv } from '../src/env.js';
import type { AdminState } from '../src/routes/admin.js';

export const testEnv = (): ServerEnv => ({
  port: 0,
  host: '127.0.0.1',
  databaseUrl: 'file::memory:',
  schemaPath: '../docs/database/schema.sql',
  migrationsPath: 'migrations',
  corsOrigins: ['http://localhost:5173'],
  corsAllowAll: true,
  rateLimit: { windowMs: 60_000, max: 10_000 },
  nodeEnv: 'test',
});

const makeTestApp = async (dbPath: string, env: ServerEnv, dir?: string, adminState?: AdminState) => {
  const app = createServer();
  let db: InstanceType<typeof Database> | undefined;
  let application: ReturnType<typeof buildApp> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => cleanupPromise ??= (async () => {
    try {
      await application?.closeReceiptUploads();
      if (app.listening) {
        await new Promise<void>((resolve, reject) => {
          app.close(error => error ? reject(error) : resolve());
          app.closeAllConnections();
        });
      }
    } finally {
      try {
        if (db?.open) db.close();
      } finally {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  })();
  onTestFinished(cleanup);

  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db, env.migrationsPath);
    application = buildApp({ db, env, dbPath, disableRateLimit: true, adminState });
    app.on('request', application);
    await new Promise<void>((resolve, reject) => {
      app.once('error', reject);
      app.listen(0, '127.0.0.1', () => {
        app.off('error', reject);
        resolve();
      });
    });
    return { app, db, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
};

export const makeApp = (env: ServerEnv = testEnv()) => makeTestApp(':memory:', env);

/**
 * Builds an app backed by a real on-disk SQLite file in a temp directory.
 * Required for any test that exercises rekey / PRAGMA key — wxSQLite3 does
 * not support encryption on `:memory:` databases.
 */
export const makeFileApp = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-tools-api-'));
  const dbPath = path.join(dir, 'fire.db');
  let encrypted = false;
  const adminState: AdminState = {
    isEncrypted: () => encrypted,
    setEncrypted: (v: boolean) => {
      encrypted = v;
    },
  };
  const fixture = await makeTestApp(dbPath, testEnv(), dir, adminState);
  return { ...fixture, dbPath, dir };
};

/**
 * Build an app backed by a real on-disk SQLite database in a fresh tmpdir.
 * Use this when tests need to exercise the settings.json sidecar.
 *
 * Automatically releases the listener, database and tmpdir after the test.
 */
export const makeAppWithTmpDb = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-tools-test-'));
  const dbPath = path.join(dir, 'firetools.db');
  const fixture = await makeTestApp(dbPath, testEnv(), dir);
  const settingsPath = path.join(dir, 'settings.json');
  return { ...fixture, dir, dbPath, settingsPath };
};
