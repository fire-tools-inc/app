import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

export const makeApp = () => {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const env = testEnv();
  runMigrations(db, env.migrationsPath);
  const app = buildApp({ db, env, dbPath: ':memory:', disableRateLimit: true });
  return { app, db };
};

/**
 * Builds an app backed by a real on-disk SQLite file in a temp directory.
 * Required for any test that exercises rekey / PRAGMA key — wxSQLite3 does
 * not support encryption on `:memory:` databases.
 */
export const makeFileApp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-tools-api-'));
  const dbPath = path.join(dir, 'fire.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const env = testEnv();
  runMigrations(db, env.migrationsPath);

  let encrypted = false;
  const adminState: AdminState = {
    isEncrypted: () => encrypted,
    setEncrypted: (v: boolean) => {
      encrypted = v;
    },
  };
  const app = buildApp({ db, env, dbPath, disableRateLimit: true, adminState });
  return { app, db, dbPath, dir };
};

/**
 * Build an app backed by a real on-disk SQLite database in a fresh tmpdir.
 * Use this when tests need to exercise the settings.json sidecar.
 *
 * Returns a `cleanup()` that removes the tmpdir.
 */
export const makeAppWithTmpDb = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-tools-test-'));
  const dbPath = path.join(dir, 'firetools.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const env = testEnv();
  runMigrations(db, env.migrationsPath);
  const app = buildApp({ db, env, dbPath, disableRateLimit: true });
  const settingsPath = path.join(dir, 'settings.json');
  const cleanup = (): void => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { app, db, dir, dbPath, settingsPath, cleanup };
};
