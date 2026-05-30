import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import {
  handler, resolveUserId, apiError, bool01, fromBool01, nowIso,
  parsePagination, nextCursor, parseYearMonth,
} from '../http.js';

// =============================================================================
// Enums (mirror OpenAPI + 0001_initial.sql CHECK constraints)
// =============================================================================

const CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD']);
const HOLDING_ASSET_CLASSES = new Set([
  'STOCKS', 'BONDS', 'ETF', 'CRYPTO', 'REAL_ESTATE',
  'PRIVATE_EQUITY', 'VEHICLE', 'COLLECTIBLE', 'ART',
  'COMMODITIES', 'OTHER',
]);
const SYNC_ASSET_CLASSES = new Set([
  'STOCKS', 'BONDS', 'CASH', 'CRYPTO', 'REAL_ESTATE',
  'COMMODITIES', 'VEHICLE', 'COLLECTIBLE', 'ART',
]);
const TARGET_MODES = new Set(['PERCENTAGE', 'OFF', 'SET']);
const ACCOUNT_TYPES = new Set(['SAVINGS', 'CHECKING', 'BROKERAGE', 'CREDIT_CARD', 'OTHER']);
const PENSION_TYPES = new Set(['STATE', 'PRIVATE', 'EMPLOYER', 'OTHER']);
const DEBT_TYPES = new Set(['CREDIT_CARD', 'PERSONAL_LOAN', 'STUDENT_LOAN', 'CAR_LOAN', 'MORTGAGE', 'OTHER']);
const TAX_TYPES = new Set(['INCOME_TAX', 'PROPERTY_TAX', 'CAPITAL_GAINS_TAX', 'OTHER']);
const OPERATION_TYPES = new Set([
  'PURCHASE', 'SALE', 'DIVIDEND', 'EXPENSE_REIMBURSEMENT',
  'GIFT_RECEIVED', 'GIFT_GIVEN', 'TAX_PAID', 'CASH_TRANSFER',
  'PENSION_CONTRIBUTION', 'PENSION_ADJUSTMENT', 'PRICE_UPDATE', 'OTHER',
]);
const DEPRECIATION_METHODS = new Set(['STRAIGHT_LINE', 'DECLINING_BALANCE', 'MANUAL']);

// =============================================================================
// Row types
// =============================================================================

interface CfgRow {
  user_id: number;
  default_currency: string;
  current_year: number;
  current_month: number;
  show_pension_in_net_worth: number;
  include_unrealized_gains: number;
  sync_with_asset_allocation: number;
  updated_at: string;
}
interface YearRow { id: number; user_id: number; year: number; is_archived: number }
interface MonthRow {
  id: number; user_id: number; net_worth_year_id: number; month: number;
  is_frozen: number; frozen_date: string | null; month_note: string | null;
}
interface HoldingRow {
  id: number; user_id: number; net_worth_month_id: number;
  external_id: string; ticker: string; name: string;
  shares: number; price_per_share: number; acquisition_price: number | null;
  currency: string; asset_class: string;
  note: string | null; isin: string | null; is_primary_residence: number;
  target_mode: string | null; target_percent: number | null; target_value: number | null;
  sync_asset_class: string | null; sync_sub_asset_type: string | null;
  vehicle_depreciation_method: string | null;
  vehicle_purchase_price: number | null; vehicle_purchase_date: string | null;
  vehicle_salvage_value: number | null; vehicle_useful_life_years: number | null;
  vehicle_current_depreciation: number | null; vehicle_annual_dep_rate: number | null;
  mortgage_principal_amount: number | null; mortgage_current_balance: number | null;
  mortgage_interest_rate: number | null; mortgage_term_years: number | null;
  mortgage_remaining_years: number | null; mortgage_monthly_payment: number | null;
  mortgage_start_date: string | null; mortgage_lender: string | null;
}
interface CashRow {
  id: number; user_id: number; net_worth_month_id: number; external_id: string;
  account_name: string; account_type: string; balance: number; currency: string;
  note: string | null; institution_code: string | null; institution_name: string | null;
  shares: number | null; price_per_share: number | null;
  target_mode: string | null; target_percent: number | null; target_value: number | null;
  sync_sub_asset_type: string | null;
}
interface PensionRow {
  id: number; user_id: number; net_worth_month_id: number; external_id: string;
  name: string; current_value: number; currency: string; pension_type: string;
  note: string | null;
}
interface DebtRow {
  id: number; user_id: number; net_worth_month_id: number; external_id: string;
  name: string; debt_type: string; current_balance: number;
  interest_rate: number | null; monthly_payment: number | null;
  currency: string; note: string | null; creditor: string | null;
}
interface TaxRow {
  id: number; user_id: number; net_worth_month_id: number; external_id: string;
  name: string; tax_type: string; amount: number; due_date: string | null;
  currency: string; note: string | null; is_paid: number;
}
interface OpRow {
  id: number; user_id: number; net_worth_month_id: number; external_id: string;
  date: string; type: string; description: string; amount: number; currency: string;
  related_asset_external_id: string | null; related_account_external_id: string | null;
  note: string | null;
}

// =============================================================================
// Ensure config / year / month (auto-create on demand)
// =============================================================================

const ensureCfg = (db: Database, userId: number): CfgRow => {
  const row = db.prepare('SELECT * FROM net_worth_config WHERE user_id = ?').get(userId) as CfgRow | undefined;
  if (row) return row;
  const now = new Date();
  db.prepare(
    `INSERT INTO net_worth_config (
        user_id, default_currency, current_year, current_month,
        show_pension_in_net_worth, include_unrealized_gains, sync_with_asset_allocation, updated_at)
     VALUES (?, 'EUR', ?, ?, 1, 1, 0, ?)`,
  ).run(userId, now.getUTCFullYear(), now.getUTCMonth() + 1, nowIso());
  return db.prepare('SELECT * FROM net_worth_config WHERE user_id = ?').get(userId) as CfgRow;
};

const ensureNwYear = (db: Database, userId: number, year: number): YearRow => {
  const existing = db
    .prepare('SELECT * FROM net_worth_years WHERE user_id = ? AND year = ?')
    .get(userId, year) as YearRow | undefined;
  if (existing) return existing;
  db.prepare('INSERT INTO net_worth_years (user_id, year) VALUES (?, ?)').run(userId, year);
  return db.prepare('SELECT * FROM net_worth_years WHERE user_id = ? AND year = ?').get(userId, year) as YearRow;
};

const ensureNwMonth = (db: Database, userId: number, year: number, month: number): MonthRow => {
  const y = ensureNwYear(db, userId, year);
  const existing = db
    .prepare('SELECT * FROM net_worth_months WHERE user_id = ? AND net_worth_year_id = ? AND month = ?')
    .get(userId, y.id, month) as MonthRow | undefined;
  if (existing) return existing;
  db.prepare(
    'INSERT INTO net_worth_months (user_id, net_worth_year_id, month) VALUES (?, ?, ?)',
  ).run(userId, y.id, month);
  return db
    .prepare('SELECT * FROM net_worth_months WHERE user_id = ? AND net_worth_year_id = ? AND month = ?')
    .get(userId, y.id, month) as MonthRow;
};

// =============================================================================
// Mappers (snake_case row → camelCase JSON)
// =============================================================================

const mapCfg = (r: CfgRow) => ({
  defaultCurrency: r.default_currency,
  currentYear: r.current_year,
  currentMonth: r.current_month,
  showPensionInNetWorth: fromBool01(r.show_pension_in_net_worth),
  includeUnrealizedGains: fromBool01(r.include_unrealized_gains),
  syncWithAssetAllocation: fromBool01(r.sync_with_asset_allocation),
});

const mapHolding = (r: HoldingRow) => {
  const out: Record<string, unknown> = {
    id: r.id,
    externalId: r.external_id,
    ticker: r.ticker,
    name: r.name,
    shares: r.shares,
    pricePerShare: r.price_per_share,
    acquisitionPrice: r.acquisition_price,
    currency: r.currency,
    assetClass: r.asset_class,
    note: r.note,
    isin: r.isin,
    isPrimaryResidence: fromBool01(r.is_primary_residence),
    targetMode: r.target_mode ?? 'OFF',
    targetPercent: r.target_percent,
    targetValue: r.target_value,
    syncAssetClass: r.sync_asset_class,
    syncSubAssetType: r.sync_sub_asset_type,
  };
  if (
    r.vehicle_depreciation_method != null && r.vehicle_purchase_price != null &&
    r.vehicle_purchase_date != null && r.vehicle_salvage_value != null &&
    r.vehicle_useful_life_years != null
  ) {
    out.vehicleDepreciation = {
      method: r.vehicle_depreciation_method,
      purchasePrice: r.vehicle_purchase_price,
      purchaseDate: r.vehicle_purchase_date,
      salvageValue: r.vehicle_salvage_value,
      usefulLifeYears: r.vehicle_useful_life_years,
      currentDepreciation: r.vehicle_current_depreciation,
      annualDepreciationRate: r.vehicle_annual_dep_rate,
    };
  }
  if (
    r.mortgage_principal_amount != null && r.mortgage_current_balance != null &&
    r.mortgage_interest_rate != null && r.mortgage_term_years != null &&
    r.mortgage_remaining_years != null && r.mortgage_monthly_payment != null &&
    r.mortgage_start_date != null
  ) {
    out.mortgageInfo = {
      principalAmount: r.mortgage_principal_amount,
      currentBalance: r.mortgage_current_balance,
      interestRate: r.mortgage_interest_rate,
      termYears: r.mortgage_term_years,
      remainingYears: r.mortgage_remaining_years,
      monthlyPayment: r.mortgage_monthly_payment,
      startDate: r.mortgage_start_date,
      lender: r.mortgage_lender,
    };
  }
  return out;
};

const mapCash = (r: CashRow) => ({
  id: r.id, externalId: r.external_id,
  accountName: r.account_name, accountType: r.account_type,
  balance: r.balance, currency: r.currency,
  note: r.note,
  institutionCode: r.institution_code, institutionName: r.institution_name,
  shares: r.shares, pricePerShare: r.price_per_share,
  targetMode: r.target_mode ?? 'OFF',
  targetPercent: r.target_percent, targetValue: r.target_value,
  syncSubAssetType: r.sync_sub_asset_type,
});

const mapPension = (r: PensionRow) => ({
  id: r.id, externalId: r.external_id, name: r.name,
  currentValue: r.current_value, currency: r.currency,
  pensionType: r.pension_type, note: r.note,
});

const mapDebt = (r: DebtRow) => ({
  id: r.id, externalId: r.external_id, name: r.name,
  debtType: r.debt_type, currentBalance: r.current_balance,
  interestRate: r.interest_rate, monthlyPayment: r.monthly_payment,
  currency: r.currency, note: r.note, creditor: r.creditor,
});

const mapTax = (r: TaxRow) => ({
  id: r.id, externalId: r.external_id, name: r.name,
  taxType: r.tax_type, amount: r.amount, dueDate: r.due_date,
  currency: r.currency, note: r.note, isPaid: fromBool01(r.is_paid),
});

const mapOp = (r: OpRow) => ({
  id: r.id, externalId: r.external_id, date: r.date,
  type: r.type, description: r.description,
  amount: r.amount, currency: r.currency,
  relatedAssetId: r.related_asset_external_id,
  relatedAccountId: r.related_account_external_id,
  note: r.note,
});

// =============================================================================
// Validators / insert helpers
// =============================================================================

const requireFields = (body: Record<string, unknown>, fields: string[]) => {
  for (const k of fields) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
};

const requireEnum = (val: unknown, name: string, set: Set<string>) => {
  if (!set.has(String(val))) {
    throw apiError(400, 'invalid_body', `Invalid ${name}: ${String(val)}`);
  }
};

const validateHolding = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'ticker', 'name', 'shares', 'pricePerShare', 'currency', 'assetClass']);
  requireEnum(body.currency, 'currency', CURRENCIES);
  requireEnum(body.assetClass, 'assetClass', HOLDING_ASSET_CLASSES);
  if (body.targetMode != null) requireEnum(body.targetMode, 'targetMode', TARGET_MODES);
  if (body.syncAssetClass != null) requireEnum(body.syncAssetClass, 'syncAssetClass', SYNC_ASSET_CLASSES);
  if (body.vehicleDepreciation != null) {
    const vd = body.vehicleDepreciation as Record<string, unknown>;
    requireFields(vd, ['method', 'purchasePrice', 'purchaseDate', 'salvageValue', 'usefulLifeYears']);
    requireEnum(vd.method, 'vehicleDepreciation.method', DEPRECIATION_METHODS);
  }
  if (body.mortgageInfo != null) {
    const m = body.mortgageInfo as Record<string, unknown>;
    requireFields(m, [
      'principalAmount', 'currentBalance', 'interestRate',
      'termYears', 'remainingYears', 'monthlyPayment', 'startDate',
    ]);
  }
};

const validateCash = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'accountName', 'accountType', 'balance', 'currency']);
  requireEnum(body.accountType, 'accountType', ACCOUNT_TYPES);
  requireEnum(body.currency, 'currency', CURRENCIES);
  if (body.targetMode != null) requireEnum(body.targetMode, 'targetMode', TARGET_MODES);
};

const validatePension = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'name', 'currentValue', 'currency', 'pensionType']);
  requireEnum(body.currency, 'currency', CURRENCIES);
  requireEnum(body.pensionType, 'pensionType', PENSION_TYPES);
};

const validateDebt = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'name', 'debtType', 'currentBalance', 'currency']);
  requireEnum(body.debtType, 'debtType', DEBT_TYPES);
  requireEnum(body.currency, 'currency', CURRENCIES);
};

const validateTax = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'name', 'taxType', 'amount', 'currency', 'isPaid']);
  requireEnum(body.taxType, 'taxType', TAX_TYPES);
  requireEnum(body.currency, 'currency', CURRENCIES);
};

const validateOp = (body: Record<string, unknown>) => {
  requireFields(body, ['externalId', 'date', 'type', 'description', 'amount', 'currency']);
  requireEnum(body.type, 'type', OPERATION_TYPES);
  requireEnum(body.currency, 'currency', CURRENCIES);
};

// SQL fragments

const HOLDING_COLS = `user_id, net_worth_month_id, external_id, ticker, name,
  shares, price_per_share, acquisition_price, currency, asset_class,
  note, isin, is_primary_residence,
  target_mode, target_percent, target_value,
  sync_asset_class, sync_sub_asset_type,
  vehicle_depreciation_method, vehicle_purchase_price, vehicle_purchase_date,
  vehicle_salvage_value, vehicle_useful_life_years,
  vehicle_current_depreciation, vehicle_annual_dep_rate,
  mortgage_principal_amount, mortgage_current_balance, mortgage_interest_rate,
  mortgage_term_years, mortgage_remaining_years, mortgage_monthly_payment,
  mortgage_start_date, mortgage_lender`;
const HOLDING_PLACEHOLDERS = HOLDING_COLS.split(',').map(() => '?').join(', ');

const bindHolding = (userId: number, monthId: number, h: Record<string, unknown>): unknown[] => {
  const vd = (h.vehicleDepreciation ?? null) as Record<string, unknown> | null;
  const m = (h.mortgageInfo ?? null) as Record<string, unknown> | null;
  return [
    userId, monthId, String(h.externalId), String(h.ticker), String(h.name),
    Number(h.shares), Number(h.pricePerShare),
    h.acquisitionPrice != null ? Number(h.acquisitionPrice) : null,
    String(h.currency), String(h.assetClass),
    h.note != null ? String(h.note) : null,
    h.isin != null ? String(h.isin) : null,
    bool01(h.isPrimaryResidence),
    h.targetMode != null ? String(h.targetMode) : null,
    h.targetPercent != null ? Number(h.targetPercent) : null,
    h.targetValue != null ? Number(h.targetValue) : null,
    h.syncAssetClass != null ? String(h.syncAssetClass) : null,
    h.syncSubAssetType != null ? String(h.syncSubAssetType) : null,
    vd?.method != null ? String(vd.method) : null,
    vd?.purchasePrice != null ? Number(vd.purchasePrice) : null,
    vd?.purchaseDate != null ? String(vd.purchaseDate) : null,
    vd?.salvageValue != null ? Number(vd.salvageValue) : null,
    vd?.usefulLifeYears != null ? Number(vd.usefulLifeYears) : null,
    vd?.currentDepreciation != null ? Number(vd.currentDepreciation) : null,
    vd?.annualDepreciationRate != null ? Number(vd.annualDepreciationRate) : null,
    m?.principalAmount != null ? Number(m.principalAmount) : null,
    m?.currentBalance != null ? Number(m.currentBalance) : null,
    m?.interestRate != null ? Number(m.interestRate) : null,
    m?.termYears != null ? Number(m.termYears) : null,
    m?.remainingYears != null ? Number(m.remainingYears) : null,
    m?.monthlyPayment != null ? Number(m.monthlyPayment) : null,
    m?.startDate != null ? String(m.startDate) : null,
    m?.lender != null ? String(m.lender) : null,
  ];
};

const insertCash = (db: Database, userId: number, monthId: number, c: Record<string, unknown>) => {
  db.prepare(
    `INSERT INTO cash_entries (user_id, net_worth_month_id, external_id,
        account_name, account_type, balance, currency, note,
        institution_code, institution_name, shares, price_per_share,
        target_mode, target_percent, target_value, sync_sub_asset_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, monthId, String(c.externalId),
    String(c.accountName), String(c.accountType), Number(c.balance), String(c.currency),
    c.note != null ? String(c.note) : null,
    c.institutionCode != null ? String(c.institutionCode) : null,
    c.institutionName != null ? String(c.institutionName) : null,
    c.shares != null ? Number(c.shares) : null,
    c.pricePerShare != null ? Number(c.pricePerShare) : null,
    c.targetMode != null ? String(c.targetMode) : null,
    c.targetPercent != null ? Number(c.targetPercent) : null,
    c.targetValue != null ? Number(c.targetValue) : null,
    c.syncSubAssetType != null ? String(c.syncSubAssetType) : null,
  );
};

const insertPension = (db: Database, userId: number, monthId: number, p: Record<string, unknown>) => {
  db.prepare(
    `INSERT INTO pension_entries (user_id, net_worth_month_id, external_id,
        name, current_value, currency, pension_type, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, monthId, String(p.externalId),
    String(p.name), Number(p.currentValue), String(p.currency), String(p.pensionType),
    p.note != null ? String(p.note) : null,
  );
};

const insertDebt = (db: Database, userId: number, monthId: number, d: Record<string, unknown>) => {
  db.prepare(
    `INSERT INTO debt_entries (user_id, net_worth_month_id, external_id,
        name, debt_type, current_balance, interest_rate, monthly_payment,
        currency, note, creditor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, monthId, String(d.externalId),
    String(d.name), String(d.debtType), Number(d.currentBalance),
    d.interestRate != null ? Number(d.interestRate) : null,
    d.monthlyPayment != null ? Number(d.monthlyPayment) : null,
    String(d.currency), d.note != null ? String(d.note) : null,
    d.creditor != null ? String(d.creditor) : null,
  );
};

const insertTax = (db: Database, userId: number, monthId: number, t: Record<string, unknown>) => {
  db.prepare(
    `INSERT INTO tax_entries (user_id, net_worth_month_id, external_id,
        name, tax_type, amount, due_date, currency, note, is_paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, monthId, String(t.externalId),
    String(t.name), String(t.taxType), Number(t.amount),
    t.dueDate != null ? String(t.dueDate) : null,
    String(t.currency), t.note != null ? String(t.note) : null,
    bool01(t.isPaid),
  );
};

const insertOp = (db: Database, userId: number, monthId: number, o: Record<string, unknown>) => {
  db.prepare(
    `INSERT INTO financial_operations (user_id, net_worth_month_id, external_id,
        date, type, description, amount, currency,
        related_asset_external_id, related_account_external_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    userId, monthId, String(o.externalId),
    String(o.date), String(o.type), String(o.description), Number(o.amount), String(o.currency),
    o.relatedAssetId != null ? String(o.relatedAssetId) : null,
    o.relatedAccountId != null ? String(o.relatedAccountId) : null,
    o.note != null ? String(o.note) : null,
  );
};

// =============================================================================
// Router
// =============================================================================

export const buildNetWorthRouter = (db: Database): Router => {
  const router = Router();

  // --- Config ---
  router.get('/net-worth/config', handler((req, res) => {
    res.json(mapCfg(ensureCfg(db, resolveUserId(req))));
  }));

  router.put('/net-worth/config', handler((req, res) => {
    const userId = resolveUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    requireFields(body, ['defaultCurrency', 'currentYear', 'currentMonth',
      'showPensionInNetWorth', 'includeUnrealizedGains']);
    requireEnum(body.defaultCurrency, 'defaultCurrency', CURRENCIES);
    ensureCfg(db, userId);
    db.prepare(
      `UPDATE net_worth_config
          SET default_currency = ?, current_year = ?, current_month = ?,
              show_pension_in_net_worth = ?, include_unrealized_gains = ?,
              sync_with_asset_allocation = ?, updated_at = ?
        WHERE user_id = ?`,
    ).run(
      String(body.defaultCurrency), Number(body.currentYear), Number(body.currentMonth),
      bool01(body.showPensionInNetWorth), bool01(body.includeUnrealizedGains),
      bool01(body.syncWithAssetAllocation), nowIso(), userId,
    );
    res.json(mapCfg(db.prepare('SELECT * FROM net_worth_config WHERE user_id = ?').get(userId) as CfgRow));
  }));

  // --- Snapshot of a single month ---
  const getMonth = (userId: number, year: number, month: number) => {
    const m = ensureNwMonth(db, userId, year, month);
    const assets = (db.prepare(
      'SELECT * FROM asset_holdings WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as HoldingRow[]).map(mapHolding);
    const cashEntries = (db.prepare(
      'SELECT * FROM cash_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as CashRow[]).map(mapCash);
    const pensions = (db.prepare(
      'SELECT * FROM pension_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as PensionRow[]).map(mapPension);
    const debts = (db.prepare(
      'SELECT * FROM debt_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as DebtRow[]).map(mapDebt);
    const taxes = (db.prepare(
      'SELECT * FROM tax_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as TaxRow[]).map(mapTax);
    const operations = (db.prepare(
      'SELECT * FROM financial_operations WHERE user_id = ? AND net_worth_month_id = ? ORDER BY date, id',
    ).all(userId, m.id) as OpRow[]).map(mapOp);
    return {
      year, month, isFrozen: fromBool01(m.is_frozen),
      frozenDate: m.frozen_date, monthNote: m.month_note,
      assets, cashEntries, pensions, debts, taxes, operations,
    };
  };

  // --- Aggregate snapshot (NetWorthTrackerData) ---
  router.get('/net-worth/snapshot', handler((req, res) => {
    const userId = resolveUserId(req);
    const cfg = ensureCfg(db, userId);
    const years = db.prepare(
      'SELECT * FROM net_worth_years WHERE user_id = ? ORDER BY year',
    ).all(userId) as YearRow[];
    const yearsOut = years.map((y) => {
      const months = db.prepare(
        'SELECT * FROM net_worth_months WHERE user_id = ? AND net_worth_year_id = ? ORDER BY month',
      ).all(userId, y.id) as MonthRow[];
      return {
        year: y.year,
        isArchived: fromBool01(y.is_archived),
        months: months.map((m) => getMonth(userId, y.year, m.month)),
      };
    });
    res.json({
      years: yearsOut,
      currentYear: cfg.current_year,
      currentMonth: cfg.current_month,
      defaultCurrency: cfg.default_currency,
      settings: {
        showPensionInNetWorth: fromBool01(cfg.show_pension_in_net_worth),
        includeUnrealizedGains: fromBool01(cfg.include_unrealized_gains),
        syncWithAssetAllocation: fromBool01(cfg.sync_with_asset_allocation),
      },
    });
  }));

  // --- Months ---
  router.get('/net-worth/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    res.json(getMonth(userId, year, month));
  }));

  router.put('/net-worth/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const m = ensureNwMonth(db, userId, year, month);
    const holdings = Array.isArray(body.assets) ? (body.assets as Record<string, unknown>[]) : [];
    const cashes = Array.isArray(body.cashEntries) ? (body.cashEntries as Record<string, unknown>[]) : [];
    const pensions = Array.isArray(body.pensions) ? (body.pensions as Record<string, unknown>[]) : [];
    const debts = Array.isArray(body.debts) ? (body.debts as Record<string, unknown>[]) : [];
    const taxes = Array.isArray(body.taxes) ? (body.taxes as Record<string, unknown>[]) : [];
    const ops = Array.isArray(body.operations) ? (body.operations as Record<string, unknown>[]) : [];
    for (const h of holdings) validateHolding(h);
    for (const c of cashes) validateCash(c);
    for (const p of pensions) validatePension(p);
    for (const d of debts) validateDebt(d);
    for (const t of taxes) validateTax(t);
    for (const o of ops) validateOp(o);
    const holdingIns = db.prepare(
      `INSERT INTO asset_holdings (${HOLDING_COLS}) VALUES (${HOLDING_PLACEHOLDERS})`,
    );
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM asset_holdings WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM cash_entries WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM pension_entries WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM debt_entries WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM tax_entries WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      db.prepare('DELETE FROM financial_operations WHERE user_id = ? AND net_worth_month_id = ?').run(userId, m.id);
      for (const h of holdings) holdingIns.run(...bindHolding(userId, m.id, h));
      for (const c of cashes) insertCash(db, userId, m.id, c);
      for (const p of pensions) insertPension(db, userId, m.id, p);
      for (const d of debts) insertDebt(db, userId, m.id, d);
      for (const t of taxes) insertTax(db, userId, m.id, t);
      for (const o of ops) insertOp(db, userId, m.id, o);
      if (body.isFrozen !== undefined || body.monthNote !== undefined || body.frozenDate !== undefined) {
        db.prepare(
          `UPDATE net_worth_months SET is_frozen = ?, frozen_date = ?, month_note = ? WHERE id = ?`,
        ).run(
          bool01(body.isFrozen),
          body.frozenDate != null ? String(body.frozenDate) : null,
          body.monthNote != null ? String(body.monthNote) : null,
          m.id,
        );
      }
    });
    tx();
    res.json(getMonth(userId, year, month));
  }));

  router.patch('/net-worth/months/:year/:month', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const m = ensureNwMonth(db, userId, year, month);
    if ('isFrozen' in body) {
      const frozenDate = body.isFrozen ? (body.frozenDate as string | undefined) ?? nowIso() : null;
      db.prepare('UPDATE net_worth_months SET is_frozen = ?, frozen_date = ? WHERE id = ?')
        .run(bool01(body.isFrozen), frozenDate, m.id);
    }
    if ('monthNote' in body) {
      db.prepare('UPDATE net_worth_months SET month_note = ? WHERE id = ?')
        .run(body.monthNote != null ? String(body.monthNote) : null, m.id);
    }
    res.json(getMonth(userId, year, month));
  }));

  // --- Holdings ---
  router.get('/net-worth/months/:year/:month/holdings', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      'SELECT * FROM asset_holdings WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as HoldingRow[];
    res.json(rows.map(mapHolding));
  }));

  router.post('/net-worth/months/:year/:month/holdings', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateHolding(body);
    const m = ensureNwMonth(db, userId, year, month);
    const info = db.prepare(
      `INSERT INTO asset_holdings (${HOLDING_COLS}) VALUES (${HOLDING_PLACEHOLDERS})`,
    ).run(...bindHolding(userId, m.id, body));
    const row = db.prepare('SELECT * FROM asset_holdings WHERE id = ?').get(info.lastInsertRowid) as HoldingRow;
    res.status(201).json(mapHolding(row));
  }));

  router.put('/net-worth/months/:year/:month/holdings/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateHolding(body);
    const m = ensureNwMonth(db, userId, year, month);
    const existing = db.prepare(
      'SELECT * FROM asset_holdings WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as HoldingRow | undefined;
    const tx = db.transaction(() => {
      if (existing) {
        db.prepare('DELETE FROM asset_holdings WHERE id = ?').run(existing.id);
      }
      db.prepare(`INSERT INTO asset_holdings (${HOLDING_COLS}) VALUES (${HOLDING_PLACEHOLDERS})`)
        .run(...bindHolding(userId, m.id, { ...body, externalId: req.params.externalId }));
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM asset_holdings WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as HoldingRow;
    res.json(mapHolding(row));
  }));

  router.delete('/net-worth/months/:year/:month/holdings/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare(
      'DELETE FROM asset_holdings WHERE user_id = ? AND external_id = ?',
    ).run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Holding not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  // --- Cash entries ---
  router.get('/net-worth/months/:year/:month/cash', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      'SELECT * FROM cash_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as CashRow[];
    res.json(rows.map(mapCash));
  }));

  router.post('/net-worth/months/:year/:month/cash', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateCash(body);
    const m = ensureNwMonth(db, userId, year, month);
    insertCash(db, userId, m.id, body);
    const row = db.prepare(
      'SELECT * FROM cash_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, String(body.externalId)) as CashRow;
    res.status(201).json(mapCash(row));
  }));

  router.put('/net-worth/months/:year/:month/cash/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateCash(body);
    const m = ensureNwMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM cash_entries WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      insertCash(db, userId, m.id, { ...body, externalId: req.params.externalId });
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM cash_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as CashRow;
    res.json(mapCash(row));
  }));

  router.delete('/net-worth/months/:year/:month/cash/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM cash_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Cash entry not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  // --- Pension entries ---
  router.get('/net-worth/months/:year/:month/pensions', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      'SELECT * FROM pension_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as PensionRow[];
    res.json(rows.map(mapPension));
  }));

  router.post('/net-worth/months/:year/:month/pensions', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validatePension(body);
    const m = ensureNwMonth(db, userId, year, month);
    insertPension(db, userId, m.id, body);
    const row = db.prepare(
      'SELECT * FROM pension_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, String(body.externalId)) as PensionRow;
    res.status(201).json(mapPension(row));
  }));

  router.put('/net-worth/months/:year/:month/pensions/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validatePension(body);
    const m = ensureNwMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM pension_entries WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      insertPension(db, userId, m.id, { ...body, externalId: req.params.externalId });
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM pension_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as PensionRow;
    res.json(mapPension(row));
  }));

  router.delete('/net-worth/months/:year/:month/pensions/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM pension_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Pension entry not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  // --- Debt entries ---
  router.get('/net-worth/months/:year/:month/debts', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      'SELECT * FROM debt_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as DebtRow[];
    res.json(rows.map(mapDebt));
  }));

  router.post('/net-worth/months/:year/:month/debts', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateDebt(body);
    const m = ensureNwMonth(db, userId, year, month);
    insertDebt(db, userId, m.id, body);
    const row = db.prepare(
      'SELECT * FROM debt_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, String(body.externalId)) as DebtRow;
    res.status(201).json(mapDebt(row));
  }));

  router.put('/net-worth/months/:year/:month/debts/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateDebt(body);
    const m = ensureNwMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM debt_entries WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      insertDebt(db, userId, m.id, { ...body, externalId: req.params.externalId });
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM debt_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as DebtRow;
    res.json(mapDebt(row));
  }));

  router.delete('/net-worth/months/:year/:month/debts/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM debt_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Debt entry not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  // --- Tax entries ---
  router.get('/net-worth/months/:year/:month/taxes', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      'SELECT * FROM tax_entries WHERE user_id = ? AND net_worth_month_id = ? ORDER BY id',
    ).all(userId, m.id) as TaxRow[];
    res.json(rows.map(mapTax));
  }));

  router.post('/net-worth/months/:year/:month/taxes', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateTax(body);
    const m = ensureNwMonth(db, userId, year, month);
    insertTax(db, userId, m.id, body);
    const row = db.prepare(
      'SELECT * FROM tax_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, String(body.externalId)) as TaxRow;
    res.status(201).json(mapTax(row));
  }));

  router.put('/net-worth/months/:year/:month/taxes/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateTax(body);
    const m = ensureNwMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM tax_entries WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      insertTax(db, userId, m.id, { ...body, externalId: req.params.externalId });
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM tax_entries WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as TaxRow;
    res.json(mapTax(row));
  }));

  router.delete('/net-worth/months/:year/:month/taxes/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM tax_entries WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Tax entry not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  // --- Financial operations (paginated) ---
  router.get('/net-worth/months/:year/:month/operations', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const { limit, offset } = parsePagination(req);
    const m = ensureNwMonth(db, userId, year, month);
    const rows = db.prepare(
      `SELECT * FROM financial_operations
        WHERE user_id = ? AND net_worth_month_id = ?
        ORDER BY date DESC, id DESC
        LIMIT ? OFFSET ?`,
    ).all(userId, m.id, limit, offset) as OpRow[];
    res.json({
      items: rows.map(mapOp),
      nextCursor: nextCursor(offset, rows.length, limit),
    });
  }));

  router.post('/net-worth/months/:year/:month/operations', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateOp(body);
    const m = ensureNwMonth(db, userId, year, month);
    insertOp(db, userId, m.id, body);
    const row = db.prepare(
      'SELECT * FROM financial_operations WHERE user_id = ? AND external_id = ?',
    ).get(userId, String(body.externalId)) as OpRow;
    res.status(201).json(mapOp(row));
  }));

  router.put('/net-worth/months/:year/:month/operations/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const { year, month } = parseYearMonth(req.params.year, req.params.month);
    const body = (req.body ?? {}) as Record<string, unknown>;
    validateOp(body);
    const m = ensureNwMonth(db, userId, year, month);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM financial_operations WHERE user_id = ? AND external_id = ?')
        .run(userId, req.params.externalId);
      insertOp(db, userId, m.id, { ...body, externalId: req.params.externalId });
    });
    tx();
    const row = db.prepare(
      'SELECT * FROM financial_operations WHERE user_id = ? AND external_id = ?',
    ).get(userId, req.params.externalId) as OpRow;
    res.json(mapOp(row));
  }));

  router.delete('/net-worth/months/:year/:month/operations/:externalId', handler((req, res) => {
    const userId = resolveUserId(req);
    const info = db.prepare('DELETE FROM financial_operations WHERE user_id = ? AND external_id = ?')
      .run(userId, req.params.externalId);
    if (info.changes === 0) throw apiError(404, 'not_found', `Operation not found: ${req.params.externalId}`);
    res.status(204).send();
  }));

  return router;
};
