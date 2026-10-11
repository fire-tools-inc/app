import { loadEnv } from './env.js';
import { initDb } from './db.js';
import { buildApp } from './app.js';
import type { AdminState } from './routes/admin.js';
import { logger } from './logger.js';

const env = loadEnv();

const { db, migrationsResult, dbPath } = initDb(env);
const applied = migrationsResult.migrationsApplied;
if (applied.length > 0) {
  logger.systemEvent(
    'db',
    'migrations-applied',
    `applied ${applied.length} migration(s) at ${dbPath}: ${applied.join(', ')}`,
  );
} else {
  logger.systemEvent(
    'db',
    'migrations-noop',
    `no pending migrations (${migrationsResult.totalMigrations} total) at ${dbPath}`,
  );
}

let encryptedFlag = Boolean(env.passphrase);
const adminState: AdminState = {
  isEncrypted: () => encryptedFlag,
  setEncrypted: (v: boolean) => {
    encryptedFlag = v;
  },
};

const app = buildApp({ db, env, dbPath, adminState });

const server = app.listen(env.port, env.host, () => {
  logger.systemEvent(
    'server',
    'listen',
    `fire-tools backend listening on http://${env.host}:${env.port}`,
  );
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.systemEvent('server', 'shutdown', `received ${signal}, shutting down`);
  try {
    await app.closeReceiptUploads();
  } catch (error) {
    logger.error('server', 'receipt-shutdown-failed', 'Receipt resources could not close.', { pii: { error: String(error) } });
    process.exitCode = 1;
  }
  server.close(() => {
    try {
      db.close();
    } catch (error) {
      logger.error('server', 'db-shutdown-failed', 'The database could not close.', { pii: { error: String(error) } });
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  });
};

process.on('SIGTERM', () => { void shutdown('SIGTERM').catch(error => logger.error('server', 'shutdown-failed', String(error))); });
process.on('SIGINT', () => { void shutdown('SIGINT').catch(error => logger.error('server', 'shutdown-failed', String(error))); });
