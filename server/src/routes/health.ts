import { Router, type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { getBuildInfo } from '../buildInfo.js';

export const buildHealthRouter = (db: Database, dbPath: string): Router => {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    try {
      const row = db.prepare('SELECT 1 AS ok').get() as { ok: number };
      const info = getBuildInfo();
      res.json({
        status: row.ok === 1 ? 'ok' : 'degraded',
        database: { driver: 'sqlite', path: dbPath, ok: row.ok === 1 },
        version: info.version,
        commit: info.commit,
        buildTime: info.buildTime,
        dependencies: info.dependencies,
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
