import Database, { type Database as DB } from 'better-sqlite3';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATION_FILENAME_RE = /^(\d+)_([a-zA-Z0-9_-]+)\.sql$/;

export interface Migration {
  id: string;
  name: string;
  path: string;
}

export interface MigrationStatus {
  id: string;
  name: string;
  applied: boolean;
  appliedAt: string | null;
}

export interface RunMigrationsResult {
  migrationsApplied: string[];
  totalMigrations: number;
  migrationsDir: string;
}

const resolveMigrationsDir = (migrationsPath: string): string => {
  if (migrationsPath.startsWith('/')) return migrationsPath;
  return resolve(__dirname, '..', migrationsPath);
};

export const listMigrations = (migrationsPath: string): Migration[] => {
  const dir = resolveMigrationsDir(migrationsPath);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      `Migrations directory not found at ${dir}. Set MIGRATIONS_PATH env to override.`,
    );
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((file) => {
    const match = MIGRATION_FILENAME_RE.exec(file);
    if (!match) {
      throw new Error(
        `Invalid migration filename: "${file}". Expected: NNNN_name.sql (e.g. 0001_initial.sql).`,
      );
    }
    return { id: match[1]!, name: match[2]!, path: join(dir, file) };
  });
};

const ensureMigrationsTable = (db: DB): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const fetchAppliedIds = (db: DB): Set<string> => {
  const rows = db
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all() as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
};

export const runMigrations = (db: DB, migrationsPath: string): RunMigrationsResult => {
  ensureMigrationsTable(db);
  const migrations = listMigrations(migrationsPath);
  const applied = fetchAppliedIds(db);
  const toApply = migrations.filter((m) => !applied.has(m.id));

  const insertStmt = db.prepare(
    'INSERT INTO schema_migrations (id, name) VALUES (?, ?)',
  );

  for (const migration of toApply) {
    const sql = readFileSync(migration.path, 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(migration.id, migration.name);
    });
    try {
      tx();
    } catch (err) {
      throw new Error(
        `Migration ${migration.id}_${migration.name} failed: ${(err as Error).message}`,
      );
    }
  }

  return {
    migrationsApplied: toApply.map((m) => `${m.id}_${m.name}`),
    totalMigrations: migrations.length,
    migrationsDir: resolveMigrationsDir(migrationsPath),
  };
};

export const getMigrationStatus = (db: DB, migrationsPath: string): MigrationStatus[] => {
  ensureMigrationsTable(db);
  const migrations = listMigrations(migrationsPath);
  const appliedRows = db
    .prepare('SELECT id, applied_at FROM schema_migrations')
    .all() as Array<{ id: string; applied_at: string }>;
  const appliedById = new Map(appliedRows.map((r) => [r.id, r.applied_at]));
  return migrations.map((m) => ({
    id: m.id,
    name: m.name,
    applied: appliedById.has(m.id),
    appliedAt: appliedById.get(m.id) ?? null,
  }));
};

/**
 * Helper exposed so the CLI / tests can open a DB without going through
 * the full server boot (which loads env from process.env).
 */
export const openSqlite = (sqlitePath: string): DB => {
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
};
