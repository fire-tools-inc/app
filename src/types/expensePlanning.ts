import type { SupportedCurrency } from './currency';
import type { ExpenseType, IncomeSource } from './expenseTracker';

export interface Recurrence {
  unit: 'once' | 'day' | 'week' | 'month' | 'year';
  interval: number;
}

interface ScheduleBase {
  id: string;
  name: string;
  amount: number;
  currency: SupportedCurrency;
  startDate: string;
  endDate?: string;
  recurrence: Recurrence;
  enabled: boolean;
  archived: boolean;
}

export interface ScheduledExpense extends ScheduleBase {
  kind: 'expense';
  category: string;
  expenseType: ExpenseType;
}

export interface ScheduledIncome extends ScheduleBase {
  kind: 'income';
  source: IncomeSource;
}

export type CashflowSchedule = ScheduledExpense | ScheduledIncome;

export interface ScheduledOccurrenceReference {
  scheduleId: string;
  scheduledDate: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  currency: SupportedCurrency;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string;
  archived: boolean;
}

export interface ImportRuleMatch {
  description: string;
  operator: 'equals' | 'contains';
  currency?: SupportedCurrency;
  minAmount?: number;
  maxAmount?: number;
}

interface ImportRuleBase {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: ImportRuleMatch;
}

export interface ExpenseCategorizationRule extends ImportRuleBase {
  kind: 'expense';
  category: string;
  expenseType: ExpenseType;
}

export interface IncomeCategorizationRule extends ImportRuleBase {
  kind: 'income';
  source: IncomeSource;
}

export type ImportCategorizationRule = ExpenseCategorizationRule | IncomeCategorizationRule;

export type ForecastHorizon = 30 | 90 | 365;

export interface CashflowForecastInputs {
  openingBalance: number;
  startDate: string;
  horizon: ForecastHorizon;
  currency: SupportedCurrency;
}

export interface ExpensePlanningData {
  schemaVersion: 1;
  schedules: CashflowSchedule[];
  skippedOccurrences: ScheduledOccurrenceReference[];
  goals: SavingsGoal[];
  rules: ImportCategorizationRule[];
  forecast?: CashflowForecastInputs;
}
