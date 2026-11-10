import { describe, expect, it } from 'vitest';
import { savingsGoalProgress } from '../../../src/utils/savingsGoals';
import { savingsGoal } from './planningFixtures';

describe('savings goal calculations', () => {
  it('rounds monthly contributions up using inclusive calendar months', () => {
    expect(savingsGoalProgress(savingsGoal({
      targetAmount: 100, savedAmount: 0, targetDate: '2024-03-31',
    }), '2024-01-15').monthlyContribution).toBe(33.34);
  });

  it('uses the native currency minor unit for yen', () => {
    expect(savingsGoalProgress(savingsGoal({
      currency: 'JPY', targetAmount: 100, savedAmount: 0, targetDate: '2024-03-31',
    }), '2024-01-15').monthlyContribution).toBe(34);
  });

  it('handles current-month and overdue deadlines without dividing by zero', () => {
    const goal = savingsGoal({ targetAmount: 100, savedAmount: 20, targetDate: '2024-01-31' });
    expect(savingsGoalProgress(goal, '2024-01-31').monthlyContribution).toBe(80);
    expect(savingsGoalProgress(goal, '2024-02-01')).toMatchObject({
      remaining: 80, monthsRemaining: 0, monthlyContribution: null, overdue: true,
    });
  });

  it('preserves overfunded amounts and never invents a contribution without a deadline', () => {
    const goal = savingsGoal({ targetAmount: 100, savedAmount: 150, targetDate: undefined });
    const before = structuredClone(goal);
    expect(savingsGoalProgress(goal, '2024-01-15')).toMatchObject({
      progress: 150, remaining: 0, complete: true, monthlyContribution: null,
    });
    expect(goal).toEqual(before);
  });
});
