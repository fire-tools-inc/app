import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, parseIntParam, parsePagination, nextCursor } from '../http.js';

interface RunRow {
  id: number;
  run_at: string;
  num_simulations: number;
  stock_volatility: number;
  bond_volatility: number;
  black_swan_probability: number;
  black_swan_impact: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  median_years_to_fire: number | null;
  fixed_parameters_json: string;
  logs_json: string | null;
}

const REQUIRED = [
  'numSimulations',
  'stockVolatility',
  'bondVolatility',
  'blackSwanProbability',
  'blackSwanImpact',
  'successCount',
  'failureCount',
  'successRate',
  'fixedParameters',
];

const mapRun = (row: RunRow) => ({
  id: row.id,
  runAt: row.run_at,
  numSimulations: row.num_simulations,
  stockVolatility: row.stock_volatility,
  bondVolatility: row.bond_volatility,
  blackSwanProbability: row.black_swan_probability,
  blackSwanImpact: row.black_swan_impact,
  successCount: row.success_count,
  failureCount: row.failure_count,
  successRate: row.success_rate,
  medianYearsToFIRE: row.median_years_to_fire,
  fixedParameters: JSON.parse(row.fixed_parameters_json) as Record<string, unknown>,
  logs: row.logs_json ? (JSON.parse(row.logs_json) as unknown[]) : undefined,
});

export const buildMonteCarloRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/calculator/monte-carlo/runs',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const { limit, offset } = parsePagination(req);
      const rows = db
        .prepare(
          `SELECT * FROM monte_carlo_runs WHERE user_id = ?
           ORDER BY run_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(userId, limit, offset) as RunRow[];
      res.json({ items: rows.map(mapRun), nextCursor: nextCursor(offset, rows.length, limit) });
    }),
  );

  router.post(
    '/calculator/monte-carlo/runs',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of REQUIRED) {
        if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
      }
      const info = db
        .prepare(
          `INSERT INTO monte_carlo_runs
             (user_id, num_simulations, stock_volatility, bond_volatility,
              black_swan_probability, black_swan_impact, success_count, failure_count,
              success_rate, median_years_to_fire, fixed_parameters_json, logs_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          Number(body.numSimulations),
          Number(body.stockVolatility),
          Number(body.bondVolatility),
          Number(body.blackSwanProbability),
          Number(body.blackSwanImpact),
          Number(body.successCount),
          Number(body.failureCount),
          Number(body.successRate),
          body.medianYearsToFIRE == null ? null : Number(body.medianYearsToFIRE),
          JSON.stringify(body.fixedParameters ?? {}),
          body.logs ? JSON.stringify(body.logs) : null,
        );
      const row = db.prepare('SELECT * FROM monte_carlo_runs WHERE id = ?').get(info.lastInsertRowid) as RunRow;
      res.status(201).json(mapRun(row));
    }),
  );

  router.get(
    '/calculator/monte-carlo/runs/:id',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const id = parseIntParam(req.params.id, 'id');
      const row = db
        .prepare('SELECT * FROM monte_carlo_runs WHERE user_id = ? AND id = ?')
        .get(userId, id) as RunRow | undefined;
      if (!row) throw apiError(404, 'not_found', 'Monte Carlo run not found');
      res.json(mapRun(row));
    }),
  );

  router.delete(
    '/calculator/monte-carlo/runs/:id',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const id = parseIntParam(req.params.id, 'id');
      const info = db
        .prepare('DELETE FROM monte_carlo_runs WHERE user_id = ? AND id = ?')
        .run(userId, id);
      if (info.changes === 0) throw apiError(404, 'not_found', 'Monte Carlo run not found');
      res.status(204).end();
    }),
  );

  return router;
};
