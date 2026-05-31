#!/usr/bin/env node
import { loadEnv } from './env.js';
import { initDb } from './db.js';
import { getMigrationStatus, rollbackMigrations, runMigrations } from './migrate.js';
import { logger } from './logger.js';

const env = loadEnv();
const [cmd = 'up', ...rest] = process.argv.slice(2);

// Migration commands manage migrations explicitly, so skip the default
// auto-up that initDb performs on boot.
const { db, dbPath } = initDb(env, { skipMigrations: true });

const parseSteps = (arg: string | undefined): number | 'all' => {
  if (!arg || arg === '1') return 1;
  if (arg === 'all' || arg === '--all') return 'all';
  const n = Number.parseInt(arg, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Invalid step count "${arg}". Use a positive integer or "all".`);
  }
  return n;
};

try {
  if (cmd === 'up') {
    const result = runMigrations(db, env.migrationsPath);
    if (result.migrationsApplied.length === 0) {
      logger.systemEvent(
        'cli-migrate',
        'no-pending',
        `no pending migrations (${result.totalMigrations} total) at ${dbPath}`,
      );
    } else {
      logger.systemEvent(
        'cli-migrate',
        'applied-migrations',
        `applied ${result.migrationsApplied.length} migration(s) at ${dbPath}`,
      );
      for (const id of result.migrationsApplied) {
        logger.systemEvent('cli-migrate', 'migration-item', `- ${id}`);
      }
    }
  } else if (cmd === 'down') {
    const steps = parseSteps(rest[0]);
    const result = rollbackMigrations(db, env.migrationsPath, steps);
    if (result.migrationsRolledBack.length === 0) {
      logger.systemEvent('cli-migrate', 'nothing-to-rollback', `nothing to roll back at ${dbPath}`);
    } else {
      logger.systemEvent(
        'cli-migrate',
        'rolled-back-migrations',
        `rolled back ${result.migrationsRolledBack.length} migration(s) at ${dbPath}`,
      );
      for (const id of result.migrationsRolledBack) {
        logger.systemEvent('cli-migrate', 'migration-item', `- ${id}`);
      }
    }
  } else if (cmd === 'status') {
    const status = getMigrationStatus(db, env.migrationsPath);
    logger.systemEvent('cli-migrate', 'status', `status (${dbPath})`);
    for (const m of status) {
      const mark = m.applied ? '✓' : '·';
      const when = m.appliedAt ? ` @ ${m.appliedAt}` : '';
      logger.systemEvent('cli-migrate', 'migration-status', `${mark} ${m.id}_${m.name}${when}`);
    }
  } else {
    logger.error('cli-migrate', 'unknown-command', `Unknown command "${cmd}". Usage: migrate [up|down [N|all]|status]`);
    db.close();
    process.exit(1);
  }
} catch (err) {
  logger.error('cli-migrate', 'execution-failed', `${(err as Error).message}`, { pii: { error: (err as Error)?.message } });
  db.close();
  process.exit(1);
}

db.close();
