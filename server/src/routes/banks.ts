import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, apiError, fromBool01 } from '../http.js';

interface BankRow {
  code: string;
  name: string;
  country_code: string;
  supports_open_banking: number;
  bic: string | null;
  institution_type: string | null;
  logo_url: string | null;
}

const mapBank = (row: BankRow) => ({
  code: row.code,
  name: row.name,
  countryCode: row.country_code,
  supportsOpenBanking: fromBool01(row.supports_open_banking),
  bic: row.bic,
  institutionType: row.institution_type,
  logoUrl: row.logo_url,
});

export const buildBanksRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/banks',
    handler((req, res) => {
      const filters: string[] = [];
      const params: unknown[] = [];
      const country = req.query.countryCode;
      if (typeof country === 'string' && country) {
        filters.push('country_code = ?');
        params.push(country);
      }
      const sob = req.query.supportsOpenBanking;
      if (sob === 'true' || sob === 'false') {
        filters.push('supports_open_banking = ?');
        params.push(sob === 'true' ? 1 : 0);
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const rows = db
        .prepare(`SELECT * FROM banks ${where} ORDER BY name LIMIT 500`)
        .all(...params) as BankRow[];
      res.json(rows.map(mapBank));
    }),
  );

  router.get(
    '/banks/:code',
    handler((req, res) => {
      const row = db.prepare('SELECT * FROM banks WHERE code = ?').get(req.params.code) as BankRow | undefined;
      if (!row) throw apiError(404, 'not_found', 'Bank not found');
      res.json(mapBank(row));
    }),
  );

  return router;
};
