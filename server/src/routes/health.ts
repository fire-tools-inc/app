import { Router, type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';

export const buildHealthRouter = (db: Database, dbPath: string): Router => {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    try {
      const row = db.prepare('SELECT 1 AS ok').get() as { ok: number };
      res.json({
        status: row.ok === 1 ? 'ok' : 'degraded',
        database: { driver: 'sqlite', path: dbPath, ok: row.ok === 1 },
        version: process.env.npm_package_version ?? '0.0.0',
      });
    } catch (err) {
      res.status(503).json({
        status: 'down',
        error: { code: 'database_unavailable', message: (err as Error).message },
      });
    }
  });

  return router;
};
