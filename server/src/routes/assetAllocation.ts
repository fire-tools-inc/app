import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, bool01, fromBool01, nowIso } from '../http.js';

interface CfgRow {
  user_id: number;
  currency: string;
  allow_negative_cash: number;
  target_allocation_tolerance: number;
  updated_at: string;
}

interface AssetRow {
  id: number;
  user_id: number;
  external_id: string;
  name: string;
  ticker: string;
  isin: string | null;
  asset_class: string;
  sub_asset_type: string;
  current_value: number;
  shares: number | null;
  price_per_share: number | null;
  acquisition_price: number | null;
  original_currency: string | null;
  original_value: number | null;
  target_mode: string;
  target_value: number | null;
  target_percent: number | null;
  institution_code: string | null;
  institution_name: string | null;
  is_primary_residence: number;
  market_price: number | null;
  mortgage_principal_amount: number | null;
  mortgage_current_balance: number | null;
  mortgage_interest_rate: number | null;
  mortgage_term_years: number | null;
  mortgage_remaining_years: number | null;
  mortgage_monthly_payment: number | null;
  mortgage_start_date: string | null;
  mortgage_property_value: number | null;
  mortgage_lender: string | null;
}

const ASSET_CLASSES = new Set([
  'STOCKS', 'BONDS', 'CASH', 'CRYPTO', 'REAL_ESTATE',
  'COMMODITIES', 'VEHICLE', 'COLLECTIBLE', 'ART',
]);
const SUB_ASSET_TYPES = new Set([
  'ETF', 'SINGLE_STOCK', 'SINGLE_BOND',
  'SAVINGS_ACCOUNT', 'CHECKING_ACCOUNT', 'BROKERAGE_ACCOUNT',
  'MONEY_ETF', 'COIN', 'PROPERTY', 'REIT', 'PRIVATE_EQUITY',
  'PHYSICAL_GOLD', 'GOLD_ETC', 'SILVER_ETC', 'OIL_ETC',
  'NATURAL_GAS_ETC', 'COPPER_ETC', 'PLATINUM_ETC',
  'PALLADIUM_ETC', 'AGRICULTURAL_ETC', 'COMMODITY_ETF',
  'CAR', 'MOTORCYCLE', 'BOAT', 'OTHER_VEHICLE',
  'WATCH', 'WINE', 'JEWELRY', 'SPORTS_MEMORABILIA', 'OTHER_COLLECTIBLE',
  'PAINTING', 'SCULPTURE', 'DIGITAL_ART', 'OTHER_ART', 'NONE',
]);
const TARGET_MODES = new Set(['PERCENTAGE', 'OFF', 'SET']);
const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);

const mapConfig = (row: CfgRow) => ({
  currency: row.currency,
  allowNegativeCash: fromBool01(row.allow_negative_cash),
  targetAllocationTolerance: row.target_allocation_tolerance,
});

const ensureConfig = (db: Database, userId: number): CfgRow => {
  const existing = db.prepare('SELECT * FROM asset_allocation_config WHERE user_id = ?').get(userId) as CfgRow | undefined;
  if (existing) return existing;
  db.prepare(
    `INSERT INTO asset_allocation_config (user_id, currency, allow_negative_cash, target_allocation_tolerance, updated_at)
     VALUES (?, 'EUR', 0, 2, ?)`,
  ).run(userId, nowIso());
  return db.prepare('SELECT * FROM asset_allocation_config WHERE user_id = ?').get(userId) as CfgRow;
};

const mapAsset = (row: AssetRow) => {
  const hasMortgage =
    row.mortgage_principal_amount != null ||
    row.mortgage_current_balance != null ||
    row.mortgage_lender != null;
  const out: Record<string, unknown> = {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    ticker: row.ticker,
    isin: row.isin,
    assetClass: row.asset_class,
    subAssetType: row.sub_asset_type,
    currentValue: row.current_value,
    shares: row.shares,
    pricePerShare: row.price_per_share,
    acquisitionPrice: row.acquisition_price,
    originalCurrency: row.original_currency,
    originalValue: row.original_value,
    targetMode: row.target_mode,
    targetValue: row.target_value,
    targetPercent: row.target_percent,
    institutionCode: row.institution_code,
    institutionName: row.institution_name,
    isPrimaryResidence: fromBool01(row.is_primary_residence),
    marketPrice: row.market_price,
  };
  if (hasMortgage) {
    out.mortgageData = {
      principalAmount: row.mortgage_principal_amount,
      currentBalance: row.mortgage_current_balance,
      interestRate: row.mortgage_interest_rate,
      termYears: row.mortgage_term_years,
      remainingYears: row.mortgage_remaining_years,
      monthlyPayment: row.mortgage_monthly_payment,
      startDate: row.mortgage_start_date,
      propertyValue: row.mortgage_property_value,
      lender: row.mortgage_lender,
    };
  }
  return out;
};

const validateAsset = (body: Record<string, unknown>): void => {
  const required = ['externalId', 'name', 'ticker', 'assetClass', 'subAssetType', 'currentValue', 'targetMode'];
  for (const k of required) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
  if (!ASSET_CLASSES.has(String(body.assetClass))) {
    throw apiError(400, 'invalid_body', `Invalid assetClass: ${body.assetClass}`);
  }
  if (!SUB_ASSET_TYPES.has(String(body.subAssetType))) {
    throw apiError(400, 'invalid_body', `Invalid subAssetType: ${body.subAssetType}`);
  }
  if (!TARGET_MODES.has(String(body.targetMode))) {
    throw apiError(400, 'invalid_body', `Invalid targetMode: ${body.targetMode}`);
  }
  if (body.originalCurrency != null && !CURRENCIES.has(String(body.originalCurrency))) {
    throw apiError(400, 'invalid_body', `Invalid originalCurrency: ${body.originalCurrency}`);
  }
};

const assetParams = (userId: number, body: Record<string, unknown>) => {
  const m = (body.mortgageData ?? null) as Record<string, unknown> | null;
  return [
    userId,
    String(body.externalId),
    String(body.name),
    String(body.ticker ?? ''),
    body.isin != null ? String(body.isin) : null,
    String(body.assetClass),
    String(body.subAssetType ?? 'NONE'),
    Number(body.currentValue),
    body.shares != null ? Number(body.shares) : null,
    body.pricePerShare != null ? Number(body.pricePerShare) : null,
    body.acquisitionPrice != null ? Number(body.acquisitionPrice) : null,
    body.originalCurrency != null ? String(body.originalCurrency) : null,
    body.originalValue != null ? Number(body.originalValue) : null,
    String(body.targetMode),
    body.targetValue != null ? Number(body.targetValue) : null,
    body.targetPercent != null ? Number(body.targetPercent) : null,
    body.institutionCode != null ? String(body.institutionCode) : null,
    body.institutionName != null ? String(body.institutionName) : null,
    bool01(body.isPrimaryResidence),
    body.marketPrice != null ? Number(body.marketPrice) : null,
    m?.principalAmount != null ? Number(m.principalAmount) : null,
    m?.currentBalance != null ? Number(m.currentBalance) : null,
    m?.interestRate != null ? Number(m.interestRate) : null,
    m?.termYears != null ? Number(m.termYears) : null,
    m?.remainingYears != null ? Number(m.remainingYears) : null,
    m?.monthlyPayment != null ? Number(m.monthlyPayment) : null,
    m?.startDate != null ? String(m.startDate) : null,
    m?.propertyValue != null ? Number(m.propertyValue) : null,
    m?.lender != null ? String(m.lender) : null,
  ];
};

const ASSET_COLUMNS = `user_id, external_id, name, ticker, isin, asset_class, sub_asset_type,
  current_value, shares, price_per_share, acquisition_price, original_currency, original_value,
  target_mode, target_value, target_percent, institution_code, institution_name, is_primary_residence,
  market_price, mortgage_principal_amount, mortgage_current_balance, mortgage_interest_rate,
  mortgage_term_years, mortgage_remaining_years, mortgage_monthly_payment, mortgage_start_date,
  mortgage_property_value, mortgage_lender`;
const ASSET_PLACEHOLDERS = ASSET_COLUMNS.split(',').map(() => '?').join(', ');

export const buildAssetAllocationRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/asset-allocation/config',
    handler((req, res) => {
      const userId = resolveUserId(req);
      res.json(mapConfig(ensureConfig(db, userId)));
    }),
  );

  router.put(
    '/asset-allocation/config',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of ['currency', 'allowNegativeCash', 'targetAllocationTolerance']) {
        if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
      }
      ensureConfig(db, userId);
      db.prepare(
        `UPDATE asset_allocation_config
            SET currency = ?, allow_negative_cash = ?, target_allocation_tolerance = ?, updated_at = ?
          WHERE user_id = ?`,
      ).run(
        String(body.currency),
        bool01(body.allowNegativeCash),
        Number(body.targetAllocationTolerance),
        nowIso(),
        userId,
      );
      const row = db.prepare('SELECT * FROM asset_allocation_config WHERE user_id = ?').get(userId) as CfgRow;
      res.json(mapConfig(row));
    }),
  );

  router.get(
    '/asset-allocation/assets',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const assetClass = req.query.assetClass;
      let sql = 'SELECT * FROM assets WHERE user_id = ?';
      const params: unknown[] = [userId];
      if (typeof assetClass === 'string' && assetClass !== '') {
        if (!ASSET_CLASSES.has(assetClass)) {
          throw apiError(400, 'invalid_param', `Invalid assetClass: ${assetClass}`);
        }
        sql += ' AND asset_class = ?';
        params.push(assetClass);
      }
      sql += ' ORDER BY id ASC';
      const rows = db.prepare(sql).all(...params) as AssetRow[];
      res.json(rows.map(mapAsset));
    }),
  );

  router.post(
    '/asset-allocation/assets',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      validateAsset(body);
      const existing = db
        .prepare('SELECT id FROM assets WHERE user_id = ? AND external_id = ?')
        .get(userId, String(body.externalId));
      if (existing) {
        throw apiError(409, 'conflict', `Asset with externalId ${body.externalId} already exists`);
      }
      const info = db
        .prepare(`INSERT INTO assets (${ASSET_COLUMNS}) VALUES (${ASSET_PLACEHOLDERS})`)
        .run(...assetParams(userId, body));
      const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(info.lastInsertRowid) as AssetRow;
      res.status(201).json(mapAsset(row));
    }),
  );

  router.get(
    '/asset-allocation/assets/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const row = db
        .prepare('SELECT * FROM assets WHERE user_id = ? AND external_id = ?')
        .get(userId, req.params.externalId) as AssetRow | undefined;
      if (!row) throw apiError(404, 'not_found', `Asset ${req.params.externalId} not found`);
      res.json(mapAsset(row));
    }),
  );

  router.put(
    '/asset-allocation/assets/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      body.externalId = req.params.externalId;
      validateAsset(body);
      const existing = db
        .prepare('SELECT id FROM assets WHERE user_id = ? AND external_id = ?')
        .get(userId, req.params.externalId);
      if (existing) {
        db.prepare('DELETE FROM assets WHERE user_id = ? AND external_id = ?').run(userId, req.params.externalId);
      }
      db.prepare(`INSERT INTO assets (${ASSET_COLUMNS}) VALUES (${ASSET_PLACEHOLDERS})`).run(...assetParams(userId, body));
      const row = db
        .prepare('SELECT * FROM assets WHERE user_id = ? AND external_id = ?')
        .get(userId, req.params.externalId) as AssetRow;
      res.json(mapAsset(row));
    }),
  );

  router.delete(
    '/asset-allocation/assets/:externalId',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const info = db
        .prepare('DELETE FROM assets WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      if (info.changes === 0) throw apiError(404, 'not_found', `Asset ${req.params.externalId} not found`);
      res.status(204).send();
    }),
  );

  return router;
};
