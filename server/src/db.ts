import Database, { type Database as DB } from 'better-sqlite3';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerEnv } from './env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const resolveSqlitePath = (databaseUrl: string): string => {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error(
      `Only file:-style DATABASE_URL is supported by SQLite driver (got "${databaseUrl}"). ` +
        `Use the postgres compose profile to run against PostgreSQL.`,
    );
  }
  return databaseUrl.slice('file:'.length);
};

export interface InitDbResult {
  db: DB;
  schemaApplied: boolean;
  dbPath: string;
}

export const initDb = (env: ServerEnv): InitDbResult => {
  if (env.databaseUrl.startsWith('postgres://') || env.databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      'PostgreSQL driver not yet implemented in this scaffold. ' +
        'Track this in docs/deployment/README.md (Postgres profile is contract-only for now).',
    );
  }

  const dbPath = resolve(resolveSqlitePath(env.databaseUrl));
  mkdirSync(dirname(dbPath), { recursive: true });

  const freshDb = !existsSync(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let schemaApplied = false;
  const schemaPath = resolve(__dirname, '..', env.schemaPath);
  if (freshDb) {
    if (!existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}. Set SCHEMA_PATH env to override.`);
    }
    const ddl = readFileSync(schemaPath, 'utf8');
    db.exec(ddl);
    schemaApplied = true;
  }

  return { db, schemaApplied, dbPath };
};
