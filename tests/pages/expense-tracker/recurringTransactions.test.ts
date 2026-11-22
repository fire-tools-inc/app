import { describe, expect, it } from 'vitest';
import {
  copyRecurringTransactionsToNewMonth,
} from '../../../src/utils/expenseCalculator';
import {
  IncomeEntry,
  ExpenseEntry,
  MonthData,
} from '../../../src/types/expenseTracker';

describe('Recurring Transactions', () => {
  // Test data - recurring transactions
  const mockRecurringIncomes: IncomeEntry[] = [
    {
      id: 'inc-1',
      type: 'income',
      date: '2024-01-15',
      amount: 5000,
      description: 'Monthly Salary',
      source: 'SALARY',
      isRecurring: true,
    },
    {
      id: 'inc-2',
      type: 'income',
      date: '2024-01-20',
      amount: 500,
      description: 'One-time freelance work',
      source: 'FREELANCE',
      isRecurring: false,
    },
  ];

  const mockRecurringExpenses: ExpenseEntry[] = [
    {
      id: 'exp-1',
      type: 'expense',
      date: '2024-01-05',
      amount: 1500,
      description: 'Rent',
      category: 'HOUSING',
      expenseType: 'NEED',
      isRecurring: true,
    },
    {
      id: 'exp-2',
      type: 'expense',
      date: '2024-01-10',
      amount: 200,
      description: 'Electric bill',
      category: 'UTILITIES',
      expenseType: 'NEED',
      isRecurring: true,
    },
    {
      id: 'exp-3',
      type: 'expense',
      date: '2024-01-12',
      amount: 150,
      description: 'One-time restaurant dinner',
      category: 'DINING_OUT',
      expenseType: 'WANT',
      isRecurring: false,
    },
    {
      id: 'exp-4',
      type: 'expense',
      date: '2024-01-25',
      amount: 100,
      description: 'Netflix & Spotify subscriptions',
      category: 'SUBSCRIPTIONS',
      expenseType: 'WANT',
      isRecurring: true,
    },
  ];

  const sourceMonth: MonthData = {
    year: 2024,
    month: 1,
    incomes: mockRecurringIncomes,
    expenses: mockRecurringExpenses,
    budgets: [],
  };

  describe('copyRecurringTransactionsToNewMonth', () => {
    it('should copy only recurring incomes to the new month', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      // Should have 1 recurring income (the salary)
      expect(result.incomes).toHaveLength(1);
      expect(result.incomes[0].description).toBe('Monthly Salary');
      expect(result.incomes[0].isRecurring).toBe(true);
    });

    it('should copy only recurring expenses to the new month', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      // Should have 3 recurring expenses (rent, electric, subscriptions)
      expect(result.expenses).toHaveLength(3);
      expect(result.expenses.every(e => e.isRecurring === true)).toBe(true);
    });

    it('should generate new IDs for copied transactions', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      // All IDs should be different from source
      const sourceIncomeIds = sourceMonth.incomes.map(i => i.id);
      const sourceExpenseIds = sourceMonth.expenses.map(e => e.id);
      
      result.incomes.forEach(income => {
        expect(sourceIncomeIds).not.toContain(income.id);
      });
      
      result.expenses.forEach(expense => {
        expect(sourceExpenseIds).not.toContain(expense.id);
      });
    });

    it('should update the date to the new month while preserving the day', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      // All dates should be in February 2024
      result.incomes.forEach(income => {
        expect(income.date.startsWith('2024-02')).toBe(true);
      });
      
      result.expenses.forEach(expense => {
        expect(expense.date.startsWith('2024-02')).toBe(true);
      });
    });

    it('should preserve the day of month in the date', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      // Find the rent expense which was on the 5th
      const rent = result.expenses.find(e => e.description === 'Rent');
      expect(rent?.date).toBe('2024-02-05');
      
      // Find the salary which was on the 15th
      const salary = result.incomes.find(i => i.description === 'Monthly Salary');
      expect(salary?.date).toBe('2024-02-15');
    });

    it('should handle month transitions that would exceed month length', () => {
      // Create source month with transaction on 31st
      const januaryMonth: MonthData = {
        year: 2024,
        month: 1,
        incomes: [],
        expenses: [
          {
            id: 'exp-31',
            type: 'expense',
            date: '2024-01-31',
            amount: 100,
            description: 'End of month expense',
            category: 'OTHER',
            expenseType: 'WANT',
            isRecurring: true,
          },
        ],
        budgets: [],
      };
      
      // Copy to February (which doesn't have 31 days)
      const result = copyRecurringTransactionsToNewMonth(januaryMonth, 2024, 2);
      
      // Should adjust to the last day of February (2024 is a leap year)
      expect(result.expenses[0].date).toBe('2024-02-29');
    });

    it('should preserve all other transaction properties', () => {
      const result = copyRecurringTransactionsToNewMonth(sourceMonth, 2024, 2);
      
      const rent = result.expenses.find(e => e.description === 'Rent');
      expect(rent?.amount).toBe(1500);
      expect(rent?.category).toBe('HOUSING');
      expect(rent?.expenseType).toBe('NEED');
      
      const salary = result.incomes.find(i => i.description === 'Monthly Salary');
      expect(salary?.amount).toBe(5000);
      expect(salary?.source).toBe('SALARY');
    });

    it('keeps the price and times of an amount paid several times', () => {
      const sessions: ExpenseEntry = {
        id: 'exp-sessions', type: 'expense', date: '2024-01-10', amount: 90, unitAmount: 45, quantity: 2,
        description: 'Sessions', category: 'HEALTHCARE', expenseType: 'NEED', isRecurring: true,
      };
      const result = copyRecurringTransactionsToNewMonth({ ...sourceMonth, expenses: [sessions] }, 2024, 2);
      expect(result.expenses[0]).toMatchObject({ amount: 90, unitAmount: 45, quantity: 2, date: '2024-02-10' });
    });

    it('should return empty arrays when no recurring transactions exist', () => {
      const nonRecurringMonth: MonthData = {
        year: 2024,
        month: 1,
        incomes: [
          { id: 'inc-1', type: 'income', date: '2024-01-15', amount: 100, description: 'One-time', source: 'OTHER', isRecurring: false },
        ],
        expenses: [
          { id: 'exp-1', type: 'expense', date: '2024-01-05', amount: 50, description: 'One-time', category: 'OTHER', expenseType: 'WANT', isRecurring: false },
        ],
        budgets: [],
      };
      
      const result = copyRecurringTransactionsToNewMonth(nonRecurringMonth, 2024, 2);
      
      expect(result.incomes).toHaveLength(0);
      expect(result.expenses).toHaveLength(0);
    });

    it('should return empty arrays when source month is empty', () => {
      const emptyMonth: MonthData = {
        year: 2024,
        month: 1,
        incomes: [],
        expenses: [],
        budgets: [],
      };
      
      const result = copyRecurringTransactionsToNewMonth(emptyMonth, 2024, 2);
      
      expect(result.incomes).toHaveLength(0);
      expect(result.expenses).toHaveLength(0);
    });

    it('should handle year transitions correctly', () => {
      const decemberMonth: MonthData = {
        year: 2024,
        month: 12,
        incomes: [
          { id: 'inc-1', type: 'income', date: '2024-12-15', amount: 5000, description: 'Salary', source: 'SALARY', isRecurring: true },
        ],
        expenses: [],
        budgets: [],
      };
      
      const result = copyRecurringTransactionsToNewMonth(decemberMonth, 2025, 1);
      
      expect(result.incomes[0].date).toBe('2025-01-15');
    });
  });
});
