/**
 * Embed the HTTP server in-process (used by the Electron desktop app).
 *
 * Unlike the standalone `index.ts` entrypoint, this does NOT read from
 * `process.env`, does NOT install signal handlers, and does NOT call
 * `process.exit`. The caller (Electron main) is responsible for lifecycle.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initDb } from './db.js';
import { buildApp } from './app.js';
import type { ServerEnv } from './env.js';
import { logger } from './logger.js';

export interface EmbedOptions {
  /** Absolute path to the SQLite file (e.g. `${userData}/firetools.db`). */
  dbPath: string;
  /** Absolute path to the directory containing `*.up.sql` migrations. */
  migrationsPath: string;
  /** Host to bind. Defaults to `127.0.0.1` (loopback only). */
  host?: string;
  /** Port to bind. Defaults to `0` (random free port). */
  port?: number;
  /** Allow any origin (recommended when the renderer uses `file://`). */
  corsAllowAll?: boolean;
}

export interface EmbeddedServer {
  url: string;
  port: number;
  host: string;
  dbPath: string;
  /** Close the HTTP listener and the SQLite handle. Idempotent. */
  close: () => Promise<void>;
}

export const startEmbeddedServer = async (
  opts: EmbedOptions,
): Promise<EmbeddedServer> => {
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? 0;
  const env: ServerEnv = {
    port,
    host,
    databaseUrl: `file:${opts.dbPath}`,
    schemaPath: '../docs/database/schema.sql',
    migrationsPath: opts.migrationsPath,
    corsOrigins: [],
    corsAllowAll: opts.corsAllowAll ?? true,
    rateLimit: { windowMs: 15 * 60 * 1000, max: 1000 },
    nodeEnv: 'production',
  };

  const { db, dbPath } = initDb(env);
  const app = buildApp({ db, env, dbPath, disableRateLimit: true });

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);
  });

  const addr = server.address() as AddressInfo | null;
  const actualPort = addr?.port ?? port;
  const url = `http://${host}:${actualPort}`;

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      db.close();
    } catch (err) {
      logger.error('embed', 'db-close-failed', (err as Error).message, {
        pii: { stack: (err as Error).stack },
      });
    }
  };

  return { url, port: actualPort, host, dbPath, close };
};
