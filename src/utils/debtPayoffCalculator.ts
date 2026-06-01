/**
 * Debt payoff calculator.
 *
 * Supports snowball (smallest balance first) and avalanche (highest interest
 * first) repayment methods, plus two modes: fixed monthly budget, or fixed
 * payoff timeline (solves for the required monthly budget).
 */

import {
  Debt,
  DebtMonthSnapshot,
  DebtPayoffPlan,
  DebtPayoffSummary,
  DebtRecommendation,
  DebtRepaymentMethod,
  DebtRepaymentMode,
} from '../types/debt';

const MAX_MONTHS = 50 * 12;
const EPSILON = 0.005;

interface SimDebt {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  monthlyRate: number;
  interestPaid: number;
  principalPaid: number;
  payoffMonth: number;
}

function toSim(debt: Debt): SimDebt {
  return {
    id: debt.id,
    name: debt.name,
    balance: debt.balance,
    minPayment: debt.minPayment,
    monthlyRate: debt.interestRate / 100 / 12,
    interestPaid: 0,
    principalPaid: 0,
    payoffMonth: 0,
  };
}

function priorityIndex(
  debts: SimDebt[],
  method: DebtRepaymentMethod,
): number {
  let bestIdx = -1;
  let bestKey = Number.POSITIVE_INFINITY;
  for (let i = 0; i < debts.length; i++) {
    const d = debts[i];
    if (d.balance <= EPSILON) continue;
    // Snowball: smallest balance first. Avalanche: highest rate first
    // (encoded as negative monthlyRate so "lowest key wins" still applies).
    const key = method === 'snowball' ? d.balance : -d.monthlyRate;
    if (key < bestKey) {
      bestKey = key;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sum of minimum payments across active debts.
 */
export function sumMinimumPayments(debts: Debt[]): number {
  return round2(debts.reduce((s, d) => s + (d.balance > 0 ? d.minPayment : 0), 0));
}

/**
 * Sum of monthly interest at the current balance — used to detect debts whose
 * minimum payment cannot even cover interest.
 */
function sumFirstMonthInterest(debts: Debt[]): number {
  return debts.reduce((s, d) => s + d.balance * (d.interestRate / 100 / 12), 0);
}

interface SimulationResult {
  feasible: boolean;
  infeasibleReason?: string;
  monthsToPayoff: number;
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  perDebt: DebtPayoffSummary[];
  timeline: DebtMonthSnapshot[];
}

function simulate(
  inputDebts: Debt[],
  method: DebtRepaymentMethod,
  monthlyBudget: number,
  options: { captureTimeline?: boolean; maxMonths?: number } = {},
): SimulationResult {
  const captureTimeline = options.captureTimeline ?? true;
  const maxMonths = options.maxMonths ?? MAX_MONTHS;

  const debts = inputDebts
    .filter((d) => d.balance > 0)
    .map(toSim);

  if (debts.length === 0) {
    return {
      feasible: true,
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }

  const minSum = debts.reduce((s, d) => s + d.minPayment, 0);
  if (monthlyBudget + EPSILON < minSum) {
    return {
      feasible: false,
      infeasibleReason: 'budget-below-minimums',
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }

  const timeline: DebtMonthSnapshot[] = [];
  let totalInterest = 0;
  let totalPrincipal = 0;
  let month = 0;

  while (debts.some((d) => d.balance > EPSILON) && month < maxMonths) {
    month++;
    let budgetLeft = monthlyBudget;
    let monthInterest = 0;
    let monthPrincipal = 0;

    // 1. Accrue interest on every active debt.
    for (const d of debts) {
      if (d.balance <= EPSILON) continue;
      const interest = d.balance * d.monthlyRate;
      d.balance += interest;
      d.interestPaid += interest;
      monthInterest += interest;
    }

    // 2. Pay minimums first.
    for (const d of debts) {
      if (d.balance <= EPSILON) continue;
      const pay = Math.min(d.minPayment, d.balance, budgetLeft);
      d.balance -= pay;
      d.principalPaid += pay;
      budgetLeft -= pay;
      monthPrincipal += pay;
      if (budgetLeft <= EPSILON) break;
    }

    // 3. Throw the surplus at the priority debt; cascade as debts clear.
    while (budgetLeft > EPSILON) {
      const idx = priorityIndex(debts, method);
      if (idx === -1) break;
      const d = debts[idx];
      const pay = Math.min(d.balance, budgetLeft);
      d.balance -= pay;
      d.principalPaid += pay;
      budgetLeft -= pay;
      monthPrincipal += pay;
      if (d.balance <= EPSILON && d.payoffMonth === 0) {
        d.payoffMonth = month;
      }
    }

    // 4. Record any newly-cleared debts (covered by minimums alone).
    for (const d of debts) {
      if (d.balance <= EPSILON && d.payoffMonth === 0) {
        d.payoffMonth = month;
        d.balance = 0;
      }
    }

    totalInterest += monthInterest;
    totalPrincipal += monthPrincipal;

    if (captureTimeline) {
      const balancesByDebt: Record<string, number> = {};
      let total = 0;
      for (const d of debts) {
        balancesByDebt[d.id] = round2(Math.max(0, d.balance));
        total += Math.max(0, d.balance);
      }
      timeline.push({
        month,
        totalBalance: round2(total),
        totalInterestPaid: round2(totalInterest),
        totalPrincipalPaid: round2(totalPrincipal),
        balancesByDebt,
      });
    }
  }

  const feasible = debts.every((d) => d.balance <= EPSILON);

  return {
    feasible,
    infeasibleReason: feasible ? undefined : 'exceeds-max-months',
    monthsToPayoff: feasible ? month : 0,
    totalInterestPaid: round2(totalInterest),
    totalPrincipalPaid: round2(totalPrincipal),
    perDebt: debts.map((d) => ({
      debtId: d.id,
      name: d.name,
      payoffMonth: d.payoffMonth,
      totalInterestPaid: round2(d.interestPaid),
      totalPrincipalPaid: round2(d.principalPaid),
    })),
    timeline,
  };
}

/**
 * Build a debt payoff plan with a fixed monthly budget.
 */
export function calculateFixedBudgetPlan(
  debts: Debt[],
  method: DebtRepaymentMethod,
  monthlyBudget: number,
): DebtPayoffPlan {
  // Reject budgets that cannot even cover the first month's interest — the
  // simulator would otherwise burn through MAX_MONTHS before giving up.
  const firstInterest = sumFirstMonthInterest(debts);
  const minSum = sumMinimumPayments(debts);
  if (monthlyBudget + EPSILON < Math.max(minSum, firstInterest)) {
    return {
      feasible: false,
      infeasibleReason:
        monthlyBudget + EPSILON < minSum ? 'budget-below-minimums' : 'budget-below-interest',
      method,
      mode: 'fixed-budget',
      monthlyBudget,
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }

  const result = simulate(debts, method, monthlyBudget);
  return {
    feasible: result.feasible,
    infeasibleReason: result.infeasibleReason,
    method,
    mode: 'fixed-budget',
    monthlyBudget: round2(monthlyBudget),
    monthsToPayoff: result.monthsToPayoff,
    totalInterestPaid: result.totalInterestPaid,
    totalPrincipalPaid: result.totalPrincipalPaid,
    perDebt: result.perDebt,
    timeline: result.timeline,
  };
}

/**
 * Solve for the smallest monthly budget that pays off all debts within
 * `targetMonths` using the chosen method. Uses binary search.
 */
export function calculateFixedTimelinePlan(
  debts: Debt[],
  method: DebtRepaymentMethod,
  targetMonths: number,
): DebtPayoffPlan {
  const activeDebts = debts.filter((d) => d.balance > 0);
  if (activeDebts.length === 0) {
    return {
      feasible: true,
      method,
      mode: 'fixed-timeline',
      monthlyBudget: 0,
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }
  if (!Number.isFinite(targetMonths) || targetMonths <= 0) {
    return {
      feasible: false,
      infeasibleReason: 'invalid-timeline',
      method,
      mode: 'fixed-timeline',
      monthlyBudget: 0,
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }

  const totalBalance = activeDebts.reduce((s, d) => s + d.balance, 0);
  const maxRate = activeDebts.reduce(
    (m, d) => Math.max(m, d.interestRate / 100 / 12),
    0,
  );
  // Upper bound: enough to clear principal in one month plus a generous
  // interest cushion. Always at least the minimum-payments sum.
  let hi = Math.max(
    sumMinimumPayments(activeDebts),
    totalBalance * (1 + maxRate) + 1,
  );
  let lo = sumMinimumPayments(activeDebts);

  // If even the upper bound can't make it, the timeline is impossible.
  const hiSim = simulate(activeDebts, method, hi, { captureTimeline: false, maxMonths: targetMonths });
  if (!hiSim.feasible || hiSim.monthsToPayoff > targetMonths) {
    return {
      feasible: false,
      infeasibleReason: 'timeline-impossible',
      method,
      mode: 'fixed-timeline',
      monthlyBudget: round2(hi),
      monthsToPayoff: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      perDebt: [],
      timeline: [],
    };
  }

  // Binary search for smallest budget that hits the timeline.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const sim = simulate(activeDebts, method, mid, {
      captureTimeline: false,
      maxMonths: targetMonths,
    });
    if (sim.feasible && sim.monthsToPayoff <= targetMonths) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi - lo < 0.01) break;
  }

  return calculateFixedBudgetPlan(activeDebts, method, round2(hi));
}

/**
 * Compare snowball vs avalanche and recommend the cheaper one, if a
 * meaningful difference exists.
 */
export function recommendMethod(
  debts: Debt[],
  monthlyBudget: number,
  currentMethod: DebtRepaymentMethod,
): DebtRecommendation | null {
  const other: DebtRepaymentMethod =
    currentMethod === 'snowball' ? 'avalanche' : 'snowball';

  const current = simulate(debts, currentMethod, monthlyBudget, {
    captureTimeline: false,
  });
  const alt = simulate(debts, other, monthlyBudget, {
    captureTimeline: false,
  });

  if (!current.feasible || !alt.feasible) return null;

  const interestSaved = current.totalInterestPaid - alt.totalInterestPaid;
  const monthsSaved = current.monthsToPayoff - alt.monthsToPayoff;

  // Surface only if the alternative saves at least $1 of interest or 1 month.
  if (interestSaved <= 1 && monthsSaved <= 0) return null;

  return {
    recommendedMethod: other,
    interestSaved: round2(Math.max(0, interestSaved)),
    monthsSaved: Math.max(0, monthsSaved),
  };
}

/**
 * Convenience wrapper that picks the right calculator based on mode.
 */
export function calculatePlan(
  debts: Debt[],
  method: DebtRepaymentMethod,
  mode: DebtRepaymentMode,
  monthlyBudget: number,
  targetMonths: number,
): DebtPayoffPlan {
  if (mode === 'fixed-timeline') {
    return calculateFixedTimelinePlan(debts, method, targetMonths);
  }
  return calculateFixedBudgetPlan(debts, method, monthlyBudget);
}
