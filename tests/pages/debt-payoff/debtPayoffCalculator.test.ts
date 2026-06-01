import { describe, it, expect } from 'vitest';
import {
  calculateFixedBudgetPlan,
  calculateFixedTimelinePlan,
  recommendMethod,
  sumMinimumPayments,
} from '../../../src/utils/debtPayoffCalculator';
import { Debt } from '../../../src/types/debt';

const cc = (over: Partial<Debt> = {}): Debt => ({
  id: 'cc',
  name: 'Credit card',
  balance: 5000,
  minPayment: 150,
  interestRate: 20,
  ...over,
});
const car = (over: Partial<Debt> = {}): Debt => ({
  id: 'car',
  name: 'Car loan',
  balance: 12000,
  minPayment: 320,
  interestRate: 6.5,
  ...over,
});
const small = (over: Partial<Debt> = {}): Debt => ({
  id: 'sm',
  name: 'Small loan',
  balance: 1000,
  minPayment: 50,
  interestRate: 5,
  ...over,
});

describe('debt payoff — basics', () => {
  it('handles an empty debt list', () => {
    const plan = calculateFixedBudgetPlan([], 'avalanche', 0);
    expect(plan.feasible).toBe(true);
    expect(plan.monthsToPayoff).toBe(0);
    expect(plan.perDebt).toEqual([]);
    expect(plan.timeline).toEqual([]);
  });

  it('sums minimum payments', () => {
    expect(sumMinimumPayments([cc(), car(), small()])).toBe(520);
  });

  it('flags budgets below the sum of minimums', () => {
    const plan = calculateFixedBudgetPlan([cc(), car()], 'avalanche', 100);
    expect(plan.feasible).toBe(false);
    expect(plan.infeasibleReason).toBe('budget-below-minimums');
  });

  it('flags budgets that cannot cover first-month interest', () => {
    // Tiny min, balance pegged so monthly interest > budget.
    const huge: Debt = { id: 'h', name: 'Huge', balance: 100000, minPayment: 1, interestRate: 50 };
    const plan = calculateFixedBudgetPlan([huge], 'avalanche', 100);
    expect(plan.feasible).toBe(false);
    expect(['budget-below-interest', 'budget-below-minimums']).toContain(
      plan.infeasibleReason,
    );
  });
});

describe('debt payoff — zero interest', () => {
  it('pays off in balance / budget months', () => {
    const d: Debt = { id: 'a', name: 'A', balance: 1200, minPayment: 100, interestRate: 0 };
    const plan = calculateFixedBudgetPlan([d], 'avalanche', 100);
    expect(plan.feasible).toBe(true);
    expect(plan.monthsToPayoff).toBe(12);
    expect(plan.totalInterestPaid).toBe(0);
    expect(plan.totalPrincipalPaid).toBeCloseTo(1200, 1);
  });
});

describe('debt payoff — snowball vs avalanche', () => {
  it('snowball pays smallest balance first', () => {
    const plan = calculateFixedBudgetPlan(
      [cc(), car(), small()],
      'snowball',
      800,
    );
    expect(plan.feasible).toBe(true);
    const order = [...plan.perDebt].sort((a, b) => a.payoffMonth - b.payoffMonth);
    expect(order[0].debtId).toBe('sm');
  });

  it('avalanche pays highest-interest debt first', () => {
    const plan = calculateFixedBudgetPlan(
      [cc(), car(), small()],
      'avalanche',
      800,
    );
    expect(plan.feasible).toBe(true);
    const order = [...plan.perDebt].sort((a, b) => a.payoffMonth - b.payoffMonth);
    expect(order[0].debtId).toBe('cc');
  });

  it('avalanche pays less total interest than snowball on the same debts', () => {
    const debts = [cc(), car(), small()];
    const av = calculateFixedBudgetPlan(debts, 'avalanche', 800);
    const sn = calculateFixedBudgetPlan(debts, 'snowball', 800);
    expect(av.totalInterestPaid).toBeLessThanOrEqual(sn.totalInterestPaid);
  });
});

describe('debt payoff — timeline mode', () => {
  it('finds a budget that hits the target timeline', () => {
    const plan = calculateFixedTimelinePlan([cc(), car()], 'avalanche', 24);
    expect(plan.feasible).toBe(true);
    expect(plan.monthsToPayoff).toBeLessThanOrEqual(24);
    expect(plan.monthlyBudget).toBeGreaterThan(0);
  });

  it('rejects impossible timelines', () => {
    const plan = calculateFixedTimelinePlan([cc(), car()], 'avalanche', 0);
    expect(plan.feasible).toBe(false);
  });
});

describe('debt payoff — recommendation', () => {
  it('recommends avalanche when snowball is currently chosen and avalanche saves interest', () => {
    const debts = [cc(), car(), small()];
    const rec = recommendMethod(debts, 800, 'snowball');
    expect(rec).not.toBeNull();
    expect(rec!.recommendedMethod).toBe('avalanche');
    expect(rec!.interestSaved).toBeGreaterThan(0);
  });

  it('returns null when the alternative offers no meaningful savings', () => {
    // Single debt — snowball and avalanche are identical.
    const rec = recommendMethod([cc()], 500, 'snowball');
    expect(rec).toBeNull();
  });
});

describe('debt payoff — timeline data', () => {
  it('produces a monotonically non-increasing total balance', () => {
    const plan = calculateFixedBudgetPlan([cc(), car()], 'avalanche', 800);
    for (let i = 1; i < plan.timeline.length; i++) {
      expect(plan.timeline[i].totalBalance).toBeLessThanOrEqual(
        plan.timeline[i - 1].totalBalance + 0.01,
      );
    }
    expect(plan.timeline[plan.timeline.length - 1].totalBalance).toBe(0);
  });

  it('payoff month equals timeline length when feasible', () => {
    const plan = calculateFixedBudgetPlan([cc(), car()], 'avalanche', 800);
    expect(plan.timeline.length).toBe(plan.monthsToPayoff);
  });
});

describe('debt payoff — mortgage style', () => {
  it('treats a mortgage-flagged debt the same as any other debt', () => {
    const mortgage: Debt = {
      id: 'm',
      name: 'Mortgage',
      balance: 200000,
      minPayment: 1200,
      interestRate: 4,
      isMortgage: true,
    };
    const plan = calculateFixedBudgetPlan([mortgage], 'avalanche', 1500);
    expect(plan.feasible).toBe(true);
    expect(plan.monthsToPayoff).toBeGreaterThan(0);
    expect(plan.perDebt[0].debtId).toBe('m');
  });
});
