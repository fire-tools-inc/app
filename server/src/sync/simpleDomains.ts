import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import {
  mapSyncedSettings, resetSyncedSettings, syncedSettingsSchema, writeSyncedSettings,
  type SettingsRow,
} from '../routes/settings.js';
import {
  CALCULATOR_REQUIRED_FIELDS, mapCalc, writeCalculatorInputs, type CalcRow,
} from '../routes/calculator.js';
import {
  ASSET_COLUMNS, assetParams, mapAsset, parseAssetClassTargets, readAssetClassTargets, replaceAssetClassTargets,
  validateAsset, type AssetRow,
} from '../routes/assetAllocation.js';
import {
  ORDER_BY_POSITION, SyncEntityError, asApiBody, asDocumentEntity, compact, fieldTypes, idOf, positionOf,
  upsertStatement, withEntity, type DomainHandler, type Entity,
} from './shared.js';

const unknownSet = (key: string): never => {
  throw new SyncEntityError(400, 'set', key, `Unknown singleton "${key}".`);
};

export const settingsDomain: DomainHandler = {
  setKeys: ['settings'],
  collections: [],
  hasData: (db, userId) => Boolean(db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').get(userId)),
  read: (db, userId) => {
    const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as SettingsRow | undefined;
    return row ? mapSyncedSettings(row) : null;
  },
  clear: (db, userId) => resetSyncedSettings(db, userId),
  applySet: (db, userId, key, value) => {
    if (key !== 'settings') unknownSet(key);
    writeSyncedSettings(db, userId, syncedSettingsSchema.parse(value));
  },
  keyOf: () => null,
  upsert: () => undefined,
  remove: () => undefined,
};

const { number, boolean, optionalNumber, optionalString } = fieldTypes;
const calculatorShape = z.looseObject({
  ...Object.fromEntries(CALCULATOR_REQUIRED_FIELDS.map(field => [field, number])),
  stopWorkingAtFIRE: boolean,
  useAssetAllocationValue: boolean,
  useExpenseTrackerExpenses: boolean,
  useExpenseTrackerIncome: boolean,
  fireType: optionalString,
  leanExpenseMultiplier: optionalNumber,
  fatExpenseMultiplier: optionalNumber,
  baristaAnnualIncome: optionalNumber,
  coastTargetAge: optionalNumber,
});

export const calculatorDomain: DomainHandler = {
  setKeys: ['inputs'],
  collections: [],
  hasData: (db, userId) => Boolean(db.prepare('SELECT 1 FROM calculator_inputs WHERE user_id = ?').get(userId)),
  read: (db, userId) => {
    const row = db.prepare('SELECT * FROM calculator_inputs WHERE user_id = ?').get(userId) as CalcRow | undefined;
    return row ? mapCalc(row) : null;
  },
  clear: (db, userId) => {
    db.prepare('DELETE FROM calculator_inputs WHERE user_id = ?').run(userId);
  },
  applySet: (db, userId, key, value) => {
    if (key !== 'inputs') unknownSet(key);
    if (value === null) {
      db.prepare('DELETE FROM calculator_inputs WHERE user_id = ?').run(userId);
      return;
    }
    writeCalculatorInputs(db, userId, compact(calculatorShape.parse(value)));
  },
  keyOf: () => null,
  upsert: () => undefined,
  remove: () => undefined,
};

const mortgageShape = z.looseObject({
  principalAmount: optionalNumber, currentBalance: optionalNumber, interestRate: optionalNumber,
  termYears: optionalNumber, remainingYears: optionalNumber, monthlyPayment: optionalNumber,
  startDate: optionalString, propertyValue: optionalNumber, lender: optionalString,
});
const assetShape = z.looseObject({
  id: fieldTypes.id, name: fieldTypes.string, ticker: fieldTypes.string, isin: optionalString,
  assetClass: fieldTypes.string, subAssetType: fieldTypes.string, currentValue: number,
  shares: optionalNumber, pricePerShare: optionalNumber, acquisitionPrice: optionalNumber,
  originalCurrency: optionalString, originalValue: optionalNumber, targetMode: fieldTypes.string,
  targetValue: optionalNumber, targetPercent: optionalNumber, institutionCode: optionalString,
  institutionName: optionalString, mortgageData: mortgageShape.nullish(),
  isPrimaryResidence: fieldTypes.optionalBoolean, marketPrice: optionalNumber, position: fieldTypes.position,
});

const assetDocument = (row: AssetRow) => {
  const { mortgageData, ...asset } = asDocumentEntity(mapAsset(row));
  return mortgageData ? { ...asset, mortgageData: compact(mortgageData as Record<string, unknown>) } : asset;
};

const ASSET_UPSERT_SQL = upsertStatement('assets', `${ASSET_COLUMNS}, position`, 'user_id, external_id',
  ['updated_at = CURRENT_TIMESTAMP']);

const upsertAssets = (db: Database, userId: number, entities: Entity[]): void => {
  const statement = db.prepare(ASSET_UPSERT_SQL);
  for (const entity of entities) {
    withEntity('assets', idOf(entity), () => {
      assetShape.parse(entity);
      const body = asApiBody(entity);
      validateAsset(body);
      statement.run(...assetParams(userId, body), positionOf(entity));
    });
  }
};

export const assetAllocationDomain: DomainHandler = {
  setKeys: ['assetClassTargets'],
  collections: ['assets'],
  hasData: (db, userId) => Boolean(
    db.prepare('SELECT 1 FROM assets WHERE user_id = ? LIMIT 1').get(userId)
    ?? db.prepare('SELECT 1 FROM asset_class_targets WHERE user_id = ? LIMIT 1').get(userId),
  ),
  read: (db, userId) => ({
    assets: (db.prepare(`SELECT * FROM assets WHERE user_id = ? ${ORDER_BY_POSITION}`).all(userId) as AssetRow[])
      .map(assetDocument),
    assetClassTargets: readAssetClassTargets(db, userId),
  }),
  clear: (db, userId) => {
    db.prepare('DELETE FROM assets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM asset_class_targets WHERE user_id = ?').run(userId);
  },
  applySet: (db, userId, key, value) => {
    if (key !== 'assetClassTargets') unknownSet(key);
    replaceAssetClassTargets(db, userId, value === null ? null : parseAssetClassTargets(value));
  },
  keyOf: (_collection, entity) => idOf(entity),
  upsert: (db, userId, _collection, entities) => upsertAssets(db, userId, entities),
  remove: (db, userId, _collection, key) => {
    db.prepare('DELETE FROM assets WHERE user_id = ? AND external_id = ?').run(userId, key);
  },
};
