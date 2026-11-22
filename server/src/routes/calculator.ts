import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, bool01, fromBool01, nowIso } from '../http.js';

export interface CalcRow {
  initial_savings: number;
  stocks_percent: number;
  bonds_percent: number;
  cash_percent: number;
  current_annual_expenses: number;
  fire_annual_expenses: number;
  annual_labor_income: number;
  labor_income_growth_rate: number;
  savings_rate: number;
  desired_withdrawal_rate: number;
  years_of_expenses: number;
  expected_stock_return: number;
  expected_bond_return: number;
  expected_cash_return: number;
  year_of_birth: number;
  retirement_age: number;
  state_pension_income: number;
  private_pension_income: number;
  other_income: number;
  stop_working_at_fire: number;
  max_age: number;
  use_asset_allocation_value: number;
  use_expense_tracker_expenses: number;
  use_expense_tracker_income: number;
  fire_type: string;
  lean_expense_multiplier: number;
  fat_expense_multiplier: number;
  barista_annual_income: number;
  coast_target_age: number;
}

export const FIRE_TYPES = new Set(['standard', 'lean', 'barista', 'coast', 'fat']);

export const CALCULATOR_REQUIRED_FIELDS = [
  'initialSavings',
  'stocksPercent',
  'bondsPercent',
  'cashPercent',
  'currentAnnualExpenses',
  'fireAnnualExpenses',
  'annualLaborIncome',
  'laborIncomeGrowthRate',
  'savingsRate',
  'desiredWithdrawalRate',
  'yearsOfExpenses',
  'expectedStockReturn',
  'expectedBondReturn',
  'expectedCashReturn',
  'yearOfBirth',
  'retirementAge',
  'statePensionIncome',
  'privatePensionIncome',
  'otherIncome',
  'stopWorkingAtFIRE',
  'maxAge',
  'useAssetAllocationValue',
  'useExpenseTrackerExpenses',
  'useExpenseTrackerIncome',
];

/** FIRE variant fields; optional on writes so older clients keep the saved values. */
export const CALCULATOR_VARIANT_FIELDS = [
  'fireType', 'leanExpenseMultiplier', 'fatExpenseMultiplier', 'baristaAnnualIncome', 'coastTargetAge',
] as const;

export const mapCalc = (row: CalcRow) => ({
  initialSavings: row.initial_savings,
  stocksPercent: row.stocks_percent,
  bondsPercent: row.bonds_percent,
  cashPercent: row.cash_percent,
  currentAnnualExpenses: row.current_annual_expenses,
  fireAnnualExpenses: row.fire_annual_expenses,
  annualLaborIncome: row.annual_labor_income,
  laborIncomeGrowthRate: row.labor_income_growth_rate,
  savingsRate: row.savings_rate,
  desiredWithdrawalRate: row.desired_withdrawal_rate,
  yearsOfExpenses: row.years_of_expenses,
  expectedStockReturn: row.expected_stock_return,
  expectedBondReturn: row.expected_bond_return,
  expectedCashReturn: row.expected_cash_return,
  yearOfBirth: row.year_of_birth,
  retirementAge: row.retirement_age,
  statePensionIncome: row.state_pension_income,
  privatePensionIncome: row.private_pension_income,
  otherIncome: row.other_income,
  stopWorkingAtFIRE: fromBool01(row.stop_working_at_fire),
  maxAge: row.max_age,
  useAssetAllocationValue: fromBool01(row.use_asset_allocation_value),
  useExpenseTrackerExpenses: fromBool01(row.use_expense_tracker_expenses),
  useExpenseTrackerIncome: fromBool01(row.use_expense_tracker_income),
  fireType: row.fire_type,
  leanExpenseMultiplier: row.lean_expense_multiplier,
  fatExpenseMultiplier: row.fat_expense_multiplier,
  baristaAnnualIncome: row.barista_annual_income,
  coastTargetAge: row.coast_target_age,
});

export const ensureCalc = (db: Database, userId: number): CalcRow => {
  let row = db
    .prepare('SELECT * FROM calculator_inputs WHERE user_id = ?')
    .get(userId) as CalcRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO calculator_inputs (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM calculator_inputs WHERE user_id = ?').get(userId) as CalcRow;
  }
  return row;
};

/**
 * Validates and stores a full CalculatorInputs object. The FIRE variant
 * fields are optional and keep their saved values when omitted.
 */
export const writeCalculatorInputs = (db: Database, userId: number, body: Record<string, unknown>): void => {
  for (const k of CALCULATOR_REQUIRED_FIELDS) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
  if (body.fireType !== undefined && !FIRE_TYPES.has(String(body.fireType))) {
    throw apiError(400, 'invalid_body', `Invalid fireType: ${String(body.fireType)}`);
  }
  for (const k of CALCULATOR_VARIANT_FIELDS.slice(1)) {
    const value = body[k];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw apiError(400, 'invalid_body', `${k} must be a finite number`);
    }
  }
  const current = ensureCalc(db, userId);
  db.prepare(
    `UPDATE calculator_inputs SET
        initial_savings = ?, stocks_percent = ?, bonds_percent = ?, cash_percent = ?,
        current_annual_expenses = ?, fire_annual_expenses = ?, annual_labor_income = ?,
        labor_income_growth_rate = ?, savings_rate = ?, desired_withdrawal_rate = ?,
        years_of_expenses = ?, expected_stock_return = ?, expected_bond_return = ?,
        expected_cash_return = ?, year_of_birth = ?, retirement_age = ?,
        state_pension_income = ?, private_pension_income = ?, other_income = ?,
        stop_working_at_fire = ?, max_age = ?, use_asset_allocation_value = ?,
        use_expense_tracker_expenses = ?, use_expense_tracker_income = ?, fire_type = ?,
        lean_expense_multiplier = ?, fat_expense_multiplier = ?, barista_annual_income = ?,
        coast_target_age = ?, updated_at = ?
      WHERE user_id = ?`,
  ).run(
    Number(body.initialSavings),
    Number(body.stocksPercent),
    Number(body.bondsPercent),
    Number(body.cashPercent),
    Number(body.currentAnnualExpenses),
    Number(body.fireAnnualExpenses),
    Number(body.annualLaborIncome),
    Number(body.laborIncomeGrowthRate),
    Number(body.savingsRate),
    Number(body.desiredWithdrawalRate),
    Number(body.yearsOfExpenses),
    Number(body.expectedStockReturn),
    Number(body.expectedBondReturn),
    Number(body.expectedCashReturn),
    Number(body.yearOfBirth),
    Number(body.retirementAge),
    Number(body.statePensionIncome),
    Number(body.privatePensionIncome),
    Number(body.otherIncome),
    bool01(body.stopWorkingAtFIRE),
    Number(body.maxAge),
    bool01(body.useAssetAllocationValue),
    bool01(body.useExpenseTrackerExpenses),
    bool01(body.useExpenseTrackerIncome),
    body.fireType !== undefined ? String(body.fireType) : current.fire_type,
    body.leanExpenseMultiplier !== undefined ? Number(body.leanExpenseMultiplier) : current.lean_expense_multiplier,
    body.fatExpenseMultiplier !== undefined ? Number(body.fatExpenseMultiplier) : current.fat_expense_multiplier,
    body.baristaAnnualIncome !== undefined ? Number(body.baristaAnnualIncome) : current.barista_annual_income,
    body.coastTargetAge !== undefined ? Number(body.coastTargetAge) : current.coast_target_age,
    nowIso(),
    userId,
  );
};

export const buildCalculatorRouter = (db: Database): Router => {
  const router = Router();

  router.get(
    '/calculator/inputs',
    handler((req, res) => {
      const userId = resolveUserId(req);
      res.json(mapCalc(ensureCalc(db, userId)));
    }),
  );

  router.put(
    '/calculator/inputs',
    handler((req, res) => {
      const userId = resolveUserId(req);
      db.transaction(() => writeCalculatorInputs(db, userId, (req.body ?? {}) as Record<string, unknown>))();
      res.json(mapCalc(ensureCalc(db, userId)));
    }),
  );

  return router;
};
