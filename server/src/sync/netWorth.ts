import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { bool01, fromBool01, nowIso } from '../http.js';
import {
  CASH_COLS, DEBT_COLS, HOLDING_COLS, OPERATION_COLS, PENSION_COLS, TAX_COLS,
  bindCash, bindDebt, bindHolding, bindOp, bindPension, bindTax, ensureNwMonth, ensureNwYear,
  mapCash, mapDebt, mapHolding, mapOp, mapPension, mapTax,
  validateCash, validateDebt, validateHolding, validateNetWorthConfig, validateOp, validatePension, validateTax,
  type CashRow, type DebtRow, type HoldingRow, type NetWorthConfigRow, type NetWorthMonthRow, type NetWorthYearRow,
  type OpRow, type PensionRow, type TaxRow,
} from '../routes/netWorth.js';
import {
  ORDER_BY_POSITION, SyncEntityError, asApiBody, asDocumentEntity, compact, fieldTypes, idOf, monthOf,
  parseMonthKey, parseYearKey, placed, positionOf, upsertStatement, withEntity, yearEntity, yearOf,
  type DomainHandler, type Entity,
} from './shared.js';

const { id, string, optionalString, number, optionalNumber, boolean, optionalBoolean } = fieldTypes;

interface LeafCollection {
  table: string;
  columns: string;
  shape: z.ZodType<Record<string, unknown>>;
  validate: (body: Record<string, unknown>) => void;
  bind: (userId: number, monthId: number, body: Record<string, unknown>) => unknown[];
  document: (row: never) => Record<string, unknown>;
}

const nested = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? compact(value as Record<string, unknown>) : undefined;

const holdingDocument = (row: HoldingRow) => {
  const { vehicleDepreciation, mortgageInfo, ...holding } = asDocumentEntity({ ...mapHolding(row), targetMode: row.target_mode });
  return compact({ ...holding, vehicleDepreciation: nested(vehicleDepreciation), mortgageInfo: nested(mortgageInfo) });
};

const LEAVES: Record<string, LeafCollection> = {
  assets: {
    table: 'asset_holdings',
    columns: HOLDING_COLS,
    shape: placed({
      id, ticker: string, name: string, shares: number, pricePerShare: number, acquisitionPrice: optionalNumber,
      currency: string, assetClass: string, note: optionalString,
      vehicleDepreciation: z.looseObject({
        method: string, purchasePrice: number, purchaseDate: string, salvageValue: number, usefulLifeYears: number,
        currentDepreciation: optionalNumber, annualDepreciationRate: optionalNumber,
      }).nullish(),
      mortgageInfo: z.looseObject({
        principalAmount: number, currentBalance: number, interestRate: number, termYears: number,
        remainingYears: number, monthlyPayment: number, startDate: string, lender: optionalString,
      }).nullish(),
      targetMode: optionalString, targetPercent: optionalNumber, targetValue: optionalNumber,
      syncAssetClass: optionalString, syncSubAssetType: optionalString, isin: optionalString,
      isPrimaryResidence: optionalBoolean,
    }),
    validate: validateHolding,
    bind: bindHolding,
    document: holdingDocument as (row: never) => Record<string, unknown>,
  },
  cashEntries: {
    table: 'cash_entries',
    columns: CASH_COLS,
    shape: placed({
      id, accountName: string, accountType: string, balance: number, currency: string, note: optionalString,
      institutionCode: optionalString, institutionName: optionalString, shares: optionalNumber,
      pricePerShare: optionalNumber, targetMode: optionalString, targetPercent: optionalNumber,
      targetValue: optionalNumber, syncSubAssetType: optionalString,
    }),
    validate: validateCash,
    bind: bindCash,
    document: ((row: CashRow) => asDocumentEntity({ ...mapCash(row), targetMode: row.target_mode })) as (row: never) => Record<string, unknown>,
  },
  pensions: {
    table: 'pension_entries',
    columns: PENSION_COLS,
    shape: placed({ id, name: string, currentValue: number, currency: string, pensionType: string, note: optionalString }),
    validate: validatePension,
    bind: bindPension,
    document: ((row: PensionRow) => asDocumentEntity(mapPension(row))) as (row: never) => Record<string, unknown>,
  },
  debts: {
    table: 'debt_entries',
    columns: DEBT_COLS,
    shape: placed({
      id, name: string, debtType: string, currentBalance: number, interestRate: optionalNumber,
      monthlyPayment: optionalNumber, currency: string, note: optionalString, creditor: optionalString,
    }),
    validate: validateDebt,
    bind: bindDebt,
    document: ((row: DebtRow) => asDocumentEntity(mapDebt(row))) as (row: never) => Record<string, unknown>,
  },
  taxes: {
    table: 'tax_entries',
    columns: TAX_COLS,
    shape: placed({
      id, name: string, taxType: string, amount: number, dueDate: optionalString, currency: string,
      note: optionalString, isPaid: boolean,
    }),
    validate: validateTax,
    bind: bindTax,
    document: ((row: TaxRow) => asDocumentEntity(mapTax(row))) as (row: never) => Record<string, unknown>,
  },
  operations: {
    table: 'financial_operations',
    columns: OPERATION_COLS,
    shape: placed({
      id, date: string, type: string, description: string, amount: number, currency: string,
      relatedAssetId: optionalString, relatedAccountId: optionalString, note: optionalString,
    }),
    validate: validateOp,
    bind: bindOp,
    document: ((row: OpRow) => asDocumentEntity(mapOp(row))) as (row: never) => Record<string, unknown>,
  },
};
const LEAF_NAMES = Object.keys(LEAVES);

const monthShape = z.looseObject({
  year: fieldTypes.year, month: fieldTypes.month, isFrozen: optionalBoolean,
  frozenDate: optionalString, monthNote: optionalString,
});
const configShape = z.looseObject({
  defaultCurrency: string, currentYear: fieldTypes.year, currentMonth: fieldTypes.month,
  settings: z.looseObject({
    showPensionInNetWorth: boolean, includeUnrealizedGains: boolean, syncWithAssetAllocation: optionalBoolean,
  }),
});

const YEAR_UPSERT = upsertStatement('net_worth_years', 'user_id, year, is_archived', 'user_id, year');
const MONTH_UPSERT = upsertStatement('net_worth_months',
  'user_id, net_worth_year_id, month, is_frozen, frozen_date, month_note', 'net_worth_year_id, month');
const CONFIG_UPSERT = upsertStatement('net_worth_config', `user_id, default_currency, current_year, current_month,
  show_pension_in_net_worth, include_unrealized_gains, sync_with_asset_allocation, updated_at`, 'user_id');

const deleteMonthRows = (db: Database, userId: number, monthId: number): void => {
  for (const leaf of Object.values(LEAVES)) {
    db.prepare(`DELETE FROM ${leaf.table} WHERE user_id = ? AND net_worth_month_id = ?`).run(userId, monthId);
  }
  db.prepare('DELETE FROM net_worth_months WHERE user_id = ? AND id = ?').run(userId, monthId);
};

const upsertLeaves = (db: Database, userId: number, collection: string, entities: Entity[]): void => {
  const leaf = LEAVES[collection]!;
  const statement = db.prepare(upsertStatement(leaf.table, `${leaf.columns}, position`, 'user_id, external_id'));
  for (const entity of entities) {
    withEntity(collection, idOf(entity), () => {
      const placement = leaf.shape.parse(entity) as { year: number; month: number };
      const body = asApiBody(entity);
      leaf.validate(body);
      const month = ensureNwMonth(db, userId, placement.year, placement.month);
      statement.run(...leaf.bind(userId, month.id, body), positionOf(entity));
    });
  }
};

const readNetWorth = (db: Database, userId: number) => {
  const config = db.prepare('SELECT * FROM net_worth_config WHERE user_id = ?').get(userId) as NetWorthConfigRow | undefined;
  const years = db.prepare('SELECT * FROM net_worth_years WHERE user_id = ? ORDER BY year').all(userId) as NetWorthYearRow[];
  const months = db.prepare('SELECT * FROM net_worth_months WHERE user_id = ? ORDER BY month').all(userId) as NetWorthMonthRow[];
  const leaves = Object.fromEntries(LEAF_NAMES.map(name => {
    const leaf = LEAVES[name]!;
    const rows = db.prepare(`SELECT * FROM ${leaf.table} WHERE user_id = ? ${ORDER_BY_POSITION}`).all(userId) as
      Array<{ net_worth_month_id: number }>;
    const byMonth = new Map<number, Record<string, unknown>[]>();
    for (const row of rows) {
      const list = byMonth.get(row.net_worth_month_id) ?? [];
      list.push(leaf.document(row as never));
      byMonth.set(row.net_worth_month_id, list);
    }
    return [name, byMonth];
  }));
  const now = new Date();
  return {
    years: years.map(year => ({
      year: year.year,
      isArchived: fromBool01(year.is_archived),
      months: months.filter(month => month.net_worth_year_id === year.id).map(month => compact({
        year: year.year,
        month: month.month,
        ...Object.fromEntries(LEAF_NAMES.map(name => [name, leaves[name]!.get(month.id) ?? []])),
        isFrozen: fromBool01(month.is_frozen),
        frozenDate: month.frozen_date,
        monthNote: month.month_note,
      })),
    })),
    currentYear: config?.current_year ?? now.getUTCFullYear(),
    currentMonth: config?.current_month ?? now.getUTCMonth() + 1,
    defaultCurrency: config?.default_currency ?? 'EUR',
    settings: {
      showPensionInNetWorth: config ? fromBool01(config.show_pension_in_net_worth) : true,
      includeUnrealizedGains: config ? fromBool01(config.include_unrealized_gains) : true,
      syncWithAssetAllocation: config ? fromBool01(config.sync_with_asset_allocation) : false,
    },
  };
};

export const netWorthDomain: DomainHandler = {
  setKeys: ['config'],
  collections: ['years', 'months', ...LEAF_NAMES],
  hasData: (db, userId) => ['net_worth_config', 'net_worth_years']
    .some(table => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? LIMIT 1`).get(userId))),
  read: readNetWorth,
  clear: (db, userId) => {
    for (const table of [...Object.values(LEAVES).map(leaf => leaf.table), 'net_worth_months', 'net_worth_years', 'net_worth_config']) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
  },
  applySet: (db, userId, key, value) => {
    if (key !== 'config') throw new SyncEntityError(400, 'set', key, `Unknown singleton "${key}".`);
    if (value === null) {
      db.prepare('DELETE FROM net_worth_config WHERE user_id = ?').run(userId);
      return;
    }
    const config = configShape.parse(value);
    validateNetWorthConfig({ ...config, ...config.settings });
    db.prepare(CONFIG_UPSERT).run(userId, config.defaultCurrency, config.currentYear, config.currentMonth,
      bool01(config.settings.showPensionInNetWorth), bool01(config.settings.includeUnrealizedGains),
      bool01(config.settings.syncWithAssetAllocation), nowIso());
  },
  keyOf: (collection, entity) => {
    if (collection === 'years') return yearOf(entity);
    if (collection === 'months') return monthOf(entity);
    return idOf(entity);
  },
  upsert: (db, userId, collection, entities) => {
    if (collection === 'years') {
      const statement = db.prepare(YEAR_UPSERT);
      for (const entity of entities) {
        withEntity('years', yearOf(entity), () => {
          const year = yearEntity.parse(entity);
          statement.run(userId, year.year, bool01(year.isArchived));
        });
      }
    } else if (collection === 'months') {
      const statement = db.prepare(MONTH_UPSERT);
      for (const entity of entities) {
        withEntity('months', monthOf(entity), () => {
          const month = monthShape.parse(entity);
          statement.run(userId, ensureNwYear(db, userId, month.year).id, month.month, bool01(month.isFrozen),
            month.frozenDate ?? null, month.monthNote ?? null);
        });
      }
    } else {
      upsertLeaves(db, userId, collection, entities);
    }
  },
  remove: (db, userId, collection, key) => {
    if (collection === 'years') {
      const year = db.prepare('SELECT id FROM net_worth_years WHERE user_id = ? AND year = ?')
        .get(userId, parseYearKey(key)) as { id: number } | undefined;
      if (!year) return;
      const months = db.prepare('SELECT id FROM net_worth_months WHERE user_id = ? AND net_worth_year_id = ?')
        .all(userId, year.id) as Array<{ id: number }>;
      for (const month of months) deleteMonthRows(db, userId, month.id);
      db.prepare('DELETE FROM net_worth_years WHERE user_id = ? AND id = ?').run(userId, year.id);
    } else if (collection === 'months') {
      const { year, month } = parseMonthKey(key);
      const row = db.prepare(`SELECT m.id FROM net_worth_months m JOIN net_worth_years y ON y.id = m.net_worth_year_id
        WHERE y.user_id = ? AND y.year = ? AND m.month = ?`).get(userId, year, month) as { id: number } | undefined;
      if (row) deleteMonthRows(db, userId, row.id);
    } else {
      db.prepare(`DELETE FROM ${LEAVES[collection]!.table} WHERE user_id = ? AND external_id = ?`).run(userId, key);
    }
  },
};
