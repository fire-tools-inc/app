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
import { rekeyDatabase, type RekeyAction, type RekeyResult } from './rekey.js';

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
  /**
   * Optional SQLCipher passphrase. When provided, the database is opened in
   * encrypted mode; the caller (e.g. Electron + safeStorage) owns key storage.
   */
  passphrase?: string;
}

export interface RekeyRequest {
  action: RekeyAction;
  currentPassphrase?: string;
  newPassphrase?: string;
}

export interface EmbeddedServer {
  url: string;
  port: number;
  host: string;
  dbPath: string;
  /** True when the embedded handle was opened with a passphrase. */
  encrypted: boolean;
  /**
   * Set / rotate / remove the database passphrase on the live handle.
   * The Electron wrapper is expected to call this directly (bypassing HTTP)
   * so it can update safeStorage atomically with the rekey result.
   */
  rekey: (req: RekeyRequest) => Promise<RekeyResult>;
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
    passphrase: opts.passphrase,
  };

  const { db, dbPath } = initDb(env);

  // Shared encryption state — mutated by both the embed-level rekey() and the
  // HTTP admin router. Lets the two stay in sync without a process restart.
  const state = { encrypted: Boolean(opts.passphrase) };
  const adminState = {
    isEncrypted: () => state.encrypted,
    setEncrypted: (v: boolean) => {
      state.encrypted = v;
    },
  };

  const app = buildApp({
    db,
    env,
    dbPath,
    disableRateLimit: true,
    adminState,
  });

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
      console.error('[embed] failed to close db', err);
    }
  };

  const rekey = async (req: RekeyRequest): Promise<RekeyResult> => {
    const result = await rekeyDatabase({
      db,
      dbPath,
      currentlyEncrypted: state.encrypted,
      action: req.action,
      currentPassphrase: req.currentPassphrase,
      newPassphrase: req.newPassphrase,
    });
    state.encrypted = result.encrypted;
    return result;
  };

  return {
    url,
    port: actualPort,
    host,
    dbPath,
    get encrypted() {
      return state.encrypted;
    },
    rekey,
    close,
  };
};
