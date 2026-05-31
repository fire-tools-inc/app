import Database, { type Database as DB } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ServerEnv } from './env.js';
import { runMigrations, type RunMigrationsResult } from './migrate.js';

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
  migrationsResult: RunMigrationsResult;
  dbPath: string;
}

export interface InitDbOptions {
  /**
   * Skip auto-applying pending migrations on boot. Used by the migrate CLI
   * for `down` and `status` so it can manage migrations explicitly without
   * `initDb` racing ahead.
   */
  skipMigrations?: boolean;
}

/** Escapes a SQLCipher passphrase for safe injection into a `PRAGMA key='...'` statement. */
export const escapePassphrase = (passphrase: string): string =>
  passphrase.replace(/'/g, "''");

export class WrongPassphraseError extends Error {
  readonly code = 'wrong_passphrase';
  constructor(message = 'Database is encrypted and the supplied passphrase is incorrect (or the database is corrupt).') {
    super(message);
    this.name = 'WrongPassphraseError';
  }
}

/**
 * Applies `PRAGMA key` to an open handle and verifies the key by performing a
 * trivial read. Throws `WrongPassphraseError` if the key does not match.
 *
 * The verification step is required because SQLCipher defers key validation
 * until the first page is decrypted — opening a handle with the wrong key
 * succeeds silently otherwise.
 */
export const applyPassphrase = (db: DB, passphrase: string): void => {
  db.pragma(`key = '${escapePassphrase(passphrase)}'`);
  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not a database') || msg.includes('file is encrypted')) {
      throw new WrongPassphraseError();
    }
    throw err;
  }
};

export const initDb = (env: ServerEnv, opts: InitDbOptions = {}): InitDbResult => {
  if (env.databaseUrl.startsWith('postgres://') || env.databaseUrl.startsWith('postgresql://')) {
    throw new Error(
      'PostgreSQL driver not yet implemented in this scaffold. ' +
        'Track this in docs/deployment/README.md (Postgres profile is contract-only for now).',
    );
  }

  const dbPath = resolve(resolveSqlitePath(env.databaseUrl));
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // SQLCipher requires `PRAGMA key` to be issued BEFORE any other I/O — including
  // `journal_mode = WAL`, which writes to the database header.
  if (env.passphrase) {
    applyPassphrase(db, env.passphrase);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrationsResult: RunMigrationsResult = opts.skipMigrations
    ? { migrationsApplied: [], totalMigrations: 0, migrationsDir: env.migrationsPath }
    : runMigrations(db, env.migrationsPath);
  return { db, migrationsResult, dbPath };
};
