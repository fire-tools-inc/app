import { loadEnv } from './env.js';
import { initDb } from './db.js';
import { buildApp } from './app.js';
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

const app = buildApp({ db, env, dbPath });

const server = app.listen(env.port, env.host, () => {
  logger.systemEvent(
    'server',
    'listen',
    `fire-tools backend listening on http://${env.host}:${env.port}`,
  );
});

const shutdown = (signal: string) => {
  logger.systemEvent('server', 'shutdown', `received ${signal}, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
