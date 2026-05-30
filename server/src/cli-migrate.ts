#!/usr/bin/env node
import { loadEnv } from './env.js';
import { initDb } from './db.js';
import { getMigrationStatus } from './migrate.js';

const env = loadEnv();
const arg = process.argv[2] ?? 'up';

const { db, migrationsResult, dbPath } = initDb(env);

if (arg === 'up') {
  if (migrationsResult.migrationsApplied.length === 0) {
    console.error(`[migrate] no pending migrations (${migrationsResult.totalMigrations} total) at ${dbPath}`);
  } else {
    console.error(
      `[migrate] applied ${migrationsResult.migrationsApplied.length} migration(s) at ${dbPath}:`,
    );
    for (const id of migrationsResult.migrationsApplied) {
      console.error(`  - ${id}`);
    }
  }
} else if (arg === 'status') {
  const status = getMigrationStatus(db, env.migrationsPath);
  console.error(`[migrate] status (${dbPath}):`);
  for (const m of status) {
    const mark = m.applied ? '✓' : '·';
    const when = m.appliedAt ? ` @ ${m.appliedAt}` : '';
    console.error(`  ${mark} ${m.id}_${m.name}${when}`);
  }
} else {
  console.error(`Unknown command "${arg}". Usage: migrate [up|status]`);
  db.close();
  process.exit(1);
}

db.close();
