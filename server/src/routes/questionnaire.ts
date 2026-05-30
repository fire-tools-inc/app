import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, nowIso } from '../http.js';

interface QRow {
  id: number;
  persona: string;
  persona_explanation: string;
  safe_withdrawal_rate: number;
  suggested_savings_rate: number;
  risk_tolerance: string;
  asset_allocation_stocks: number;
  asset_allocation_bonds: number;
  asset_allocation_cash: number;
  asset_allocation_crypto: number | null;
  asset_allocation_real_estate: number | null;
  suitable_assets_json: string;
  responses_json: string;
  completed_at: string;
}

const REQUIRED = [
  'persona',
  'personaExplanation',
  'safeWithdrawalRate',
  'suggestedSavingsRate',
  'assetAllocation',
  'suitableAssets',
  'riskTolerance',
  'responses',
];
const VALID_PERSONAS = new Set(['LEAN_FIRE', 'REGULAR_FIRE', 'FAT_FIRE', 'COAST_FIRE', 'BARISTA_FIRE']);
const VALID_RISK = new Set(['conservative', 'moderate', 'aggressive']);

const mapResult = (row: QRow) => ({
  id: row.id,
  persona: row.persona,
  personaExplanation: row.persona_explanation,
  safeWithdrawalRate: row.safe_withdrawal_rate,
  suggestedSavingsRate: row.suggested_savings_rate,
  assetAllocation: {
    stocks: row.asset_allocation_stocks,
    bonds: row.asset_allocation_bonds,
    cash: row.asset_allocation_cash,
    ...(row.asset_allocation_crypto != null ? { crypto: row.asset_allocation_crypto } : {}),
    ...(row.asset_allocation_real_estate != null ? { realEstate: row.asset_allocation_real_estate } : {}),
  },
  suitableAssets: JSON.parse(row.suitable_assets_json) as string[],
  riskTolerance: row.risk_tolerance,
  responses: JSON.parse(row.responses_json) as unknown[],
  completedAt: row.completed_at,
});

export const buildQuestionnaireRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/questionnaire/results',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const rows = db
        .prepare(
          'SELECT * FROM questionnaire_results WHERE user_id = ? ORDER BY completed_at DESC, id DESC',
        )
        .all(userId) as QRow[];
      res.json(rows.map(mapResult));
    }),
  );

  router.get(
    '/questionnaire/results/latest',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const row = db
        .prepare(
          'SELECT * FROM questionnaire_results WHERE user_id = ? ORDER BY completed_at DESC, id DESC LIMIT 1',
        )
        .get(userId) as QRow | undefined;
      if (!row) throw apiError(404, 'not_found', 'No questionnaire results yet');
      res.json(mapResult(row));
    }),
  );

  router.post(
    '/questionnaire/results',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of REQUIRED) {
        if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
      }
      const persona = String(body.persona);
      if (!VALID_PERSONAS.has(persona)) throw apiError(400, 'invalid_body', `Invalid persona: ${persona}`);
      const risk = String(body.riskTolerance);
      if (!VALID_RISK.has(risk)) throw apiError(400, 'invalid_body', `Invalid riskTolerance: ${risk}`);
      const alloc = body.assetAllocation as Record<string, unknown>;
      if (
        typeof alloc?.stocks !== 'number' ||
        typeof alloc?.bonds !== 'number' ||
        typeof alloc?.cash !== 'number'
      ) {
        throw apiError(400, 'invalid_body', 'assetAllocation.stocks/bonds/cash are required numbers');
      }
      const info = db
        .prepare(
          `INSERT INTO questionnaire_results
             (user_id, persona, persona_explanation, safe_withdrawal_rate, suggested_savings_rate,
              risk_tolerance, asset_allocation_stocks, asset_allocation_bonds, asset_allocation_cash,
              asset_allocation_crypto, asset_allocation_real_estate, suitable_assets_json,
              responses_json, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          persona,
          String(body.personaExplanation),
          Number(body.safeWithdrawalRate),
          Number(body.suggestedSavingsRate),
          risk,
          Number(alloc.stocks),
          Number(alloc.bonds),
          Number(alloc.cash),
          alloc.crypto != null ? Number(alloc.crypto) : null,
          alloc.realEstate != null ? Number(alloc.realEstate) : null,
          JSON.stringify(body.suitableAssets ?? []),
          JSON.stringify(body.responses ?? []),
          typeof body.completedAt === 'string' ? body.completedAt : nowIso(),
        );
      const row = db.prepare('SELECT * FROM questionnaire_results WHERE id = ?').get(info.lastInsertRowid) as QRow;
      res.status(201).json(mapResult(row));
    }),
  );

  return router;
};
