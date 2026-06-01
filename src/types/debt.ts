/**
 * Debt payoff calculator types.
 */

export type DebtRepaymentMethod = 'snowball' | 'avalanche';
export type DebtRepaymentMode = 'fixed-budget' | 'fixed-timeline';

export interface Debt {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  interestRate: number;
  isMortgage?: boolean;
}

export interface DebtPayoffInputs {
  debts: Debt[];
  method: DebtRepaymentMethod;
  mode: DebtRepaymentMode;
  monthlyBudget: number;
  targetMonths: number;
}

export interface DebtMonthSnapshot {
  month: number;
  totalBalance: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  balancesByDebt: Record<string, number>;
}

export interface DebtPayoffSummary {
  debtId: string;
  name: string;
  payoffMonth: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
}

export interface DebtPayoffPlan {
  feasible: boolean;
  infeasibleReason?: string;
  method: DebtRepaymentMethod;
  mode: DebtRepaymentMode;
  monthlyBudget: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  perDebt: DebtPayoffSummary[];
  timeline: DebtMonthSnapshot[];
}

export interface DebtRecommendation {
  recommendedMethod: DebtRepaymentMethod;
  interestSaved: number;
  monthsSaved: number;
}
