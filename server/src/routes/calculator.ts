import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, bool01, fromBool01, nowIso } from '../http.js';

interface CalcRow {
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
}

const REQUIRED_FIELDS = [
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

const mapCalc = (row: CalcRow) => ({
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
});

const ensureCalc = (db: Database, userId: number): CalcRow => {
  let row = db
    .prepare('SELECT * FROM calculator_inputs WHERE user_id = ?')
    .get(userId) as CalcRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO calculator_inputs (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM calculator_inputs WHERE user_id = ?').get(userId) as CalcRow;
  }
  return row;
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
      const body = (req.body ?? {}) as Record<string, unknown>;
      for (const k of REQUIRED_FIELDS) {
        if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
      }
      ensureCalc(db, userId);
      db.prepare(
        `UPDATE calculator_inputs SET
            initial_savings = ?, stocks_percent = ?, bonds_percent = ?, cash_percent = ?,
            current_annual_expenses = ?, fire_annual_expenses = ?, annual_labor_income = ?,
            labor_income_growth_rate = ?, savings_rate = ?, desired_withdrawal_rate = ?,
            years_of_expenses = ?, expected_stock_return = ?, expected_bond_return = ?,
            expected_cash_return = ?, year_of_birth = ?, retirement_age = ?,
            state_pension_income = ?, private_pension_income = ?, other_income = ?,
            stop_working_at_fire = ?, max_age = ?, use_asset_allocation_value = ?,
            use_expense_tracker_expenses = ?, use_expense_tracker_income = ?, updated_at = ?
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
        nowIso(),
        userId,
      );
      res.json(mapCalc(ensureCalc(db, userId)));
    }),
  );

  return router;
};
