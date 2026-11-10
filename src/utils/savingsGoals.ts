import type { SavingsGoal } from '../types/expensePlanning';
import { createEmptyExpensePlanning, ExpensePlanningError, parseExpensePlanning } from './expensePlanning';
import { isValidCalendarDate } from './dateValidation';

export interface SavingsGoalProgress {
  progress: number;
  remaining: number;
  monthlyContribution: number | null;
  monthsRemaining: number | null;
  complete: boolean;
  overdue: boolean;
}

export function savingsGoalProgress(goal: SavingsGoal, today: string): SavingsGoalProgress {
  parseExpensePlanning({ ...createEmptyExpensePlanning(), goals: [goal] });
  if (!isValidCalendarDate(today)) throw new ExpensePlanningError('invalidInput', 'Invalid goal calculation date.');
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const progress = goal.savedAmount / goal.targetAmount * 100;
  if (!Number.isFinite(progress)) throw new ExpensePlanningError('invalidInput', 'Goal values exceed the supported numeric range.');
  const complete = remaining === 0;
  const overdue = !complete && Boolean(goal.targetDate && goal.targetDate < today);
  let monthsRemaining: number | null = null;
  let monthlyContribution: number | null = null;
  if (goal.targetDate) {
    const [year, month] = today.split('-').map(Number);
    const [targetYear, targetMonth] = goal.targetDate.split('-').map(Number);
    monthsRemaining = goal.targetDate < today ? 0 : (targetYear - year) * 12 + targetMonth - month + 1;
    if (complete) monthlyContribution = 0;
    else if (!overdue) {
      const scale = goal.currency === 'JPY' ? 1 : 100;
      const scaled = remaining * scale / monthsRemaining;
      if (!Number.isFinite(scaled)) throw new ExpensePlanningError('invalidInput', 'Goal values exceed the supported numeric range.');
      const nearest = Math.round(scaled);
      const rounded = Math.abs(scaled - nearest) <= Number.EPSILON * Math.max(1, scaled) * 2
        ? nearest : Math.ceil(scaled);
      monthlyContribution = Math.max(1, rounded) / scale;
    }
  }
  return { progress, remaining, monthlyContribution, monthsRemaining, complete, overdue };
}
