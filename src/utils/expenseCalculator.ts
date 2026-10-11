/**
 * Expense Calculator Utilities
 * Functions for calculating summaries, breakdowns, and analytics for expense tracking
 */

import {
  IncomeEntry,
  ExpenseEntry,
  MonthData,
  TransactionSummary,
  CategoryBreakdown,
  BudgetRuleBreakdown,
  PeriodBreakdown,
  TimePeriod,
  TransactionFilter,
  TransactionSort,
  MonthlyComparisonData,
  CategoryTrendData,
  CategoryBudget,
  ExpenseCategory,
  Transaction,
  generateTransactionId,
} from '../types/expenseTracker';

/**
 * Calculate transaction summary from income and expenses
 */
export function calculateTransactionSummary(
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[]
): TransactionSummary {
  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const netBalance = totalIncome - totalExpenses;
  const savingsAmount = netBalance > 0 ? netBalance : 0;
  const savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    savingsAmount,
    savingsRate,
  };
}

/**
 * Calculate breakdown by expense category
 */
export function calculateCategoryBreakdown(
  expenses: ExpenseEntry[],
  budgets?: CategoryBudget[]
): CategoryBreakdown[] {
  if (expenses.length === 0) {
    return [];
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Group expenses by category (supports both built-in and custom category IDs)
  const categoryMap = new Map<ExpenseCategory | string, { total: number; count: number }>();
  
  for (const expense of expenses) {
    const existing = categoryMap.get(expense.category);
    if (existing) {
      existing.total += expense.amount;
      existing.count += 1;
    } else {
      categoryMap.set(expense.category, { total: expense.amount, count: 1 });
    }
  }

  // Convert to array with budget info
  const breakdown: CategoryBreakdown[] = [];
  
  for (const [category, data] of categoryMap) {
    const budget = budgets?.find(b => b.category === category);
    const breakdownItem: CategoryBreakdown = {
      category,
      totalAmount: data.total,
      percentage: (data.total / totalExpenses) * 100,
      transactionCount: data.count,
    };

    if (budget) {
      breakdownItem.budgeted = budget.monthlyBudget;
      breakdownItem.remaining = budget.monthlyBudget - data.total;
    }

    breakdown.push(breakdownItem);
  }

  return breakdown;
}

/**
 * Calculate 50/30/20 budget rule breakdown
 */
export function calculateBudgetRuleBreakdown(
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[]
): BudgetRuleBreakdown {
  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // Separate needs and wants
  const needsExpenses = expenses.filter(e => e.expenseType === 'NEED');
  const wantsExpenses = expenses.filter(e => e.expenseType === 'WANT');

  const needsAmount = needsExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const wantsAmount = wantsExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const savingsAmount = totalIncome - totalExpenses;

  return {
    needs: {
      amount: needsAmount,
      percentage: totalIncome > 0 ? (needsAmount / totalIncome) * 100 : 0,
      targetPercentage: 50,
      categories: calculateCategoryBreakdown(needsExpenses),
    },
    wants: {
      amount: wantsAmount,
      percentage: totalIncome > 0 ? (wantsAmount / totalIncome) * 100 : 0,
      targetPercentage: 30,
      categories: calculateCategoryBreakdown(wantsExpenses),
    },
    savings: {
      amount: savingsAmount > 0 ? savingsAmount : 0,
      percentage: totalIncome > 0 ? (Math.max(savingsAmount, 0) / totalIncome) * 100 : 0,
      targetPercentage: 20,
    },
  };
}

/**
 * Format month for display (e.g., "Jan 2024")
 */
function formatMonth(year: number, month: number): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Get quarter from month (1-4)
 */
function getQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Calculate period breakdown for monthly, quarterly, or yearly aggregations
 */
export function calculatePeriodBreakdown(
  monthsData: MonthData[],
  periodType: TimePeriod
): PeriodBreakdown[] {
  const periodMap = new Map<string, {
    expenses: ExpenseEntry[];
    incomes: IncomeEntry[];
    year: number;
    month?: number;
    quarter?: number;
  }>();

  // Group by period
  for (const monthData of monthsData) {
    let periodKey: string;
    
    switch (periodType) {
      case 'MONTHLY':
        periodKey = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
        break;
      case 'QUARTERLY':
        periodKey = `${monthData.year}-Q${getQuarter(monthData.month)}`;
        break;
      case 'YEARLY':
        periodKey = String(monthData.year);
        break;
    }

    const existing = periodMap.get(periodKey);
    if (existing) {
      existing.expenses.push(...monthData.expenses);
      existing.incomes.push(...monthData.incomes);
    } else {
      periodMap.set(periodKey, {
        expenses: [...monthData.expenses],
        incomes: [...monthData.incomes],
        year: monthData.year,
        month: periodType === 'MONTHLY' ? monthData.month : undefined,
        quarter: periodType === 'QUARTERLY' ? getQuarter(monthData.month) : undefined,
      });
    }
  }

  // Convert to array
  const breakdowns: PeriodBreakdown[] = [];
  
  for (const [period, data] of periodMap) {
    const totalExpenses = data.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalIncome = data.incomes.reduce((sum, inc) => sum + inc.amount, 0);

    breakdowns.push({
      period,
      periodType,
      categories: calculateCategoryBreakdown(data.expenses),
      totalExpenses,
      totalIncome,
    });
  }

  // Sort by period
  breakdowns.sort((a, b) => a.period.localeCompare(b.period));

  return breakdowns;
}

/**
 * Filter transactions based on criteria
 */
export function filterTransactions<T extends Transaction>(
  transactions: T[],
  filter: TransactionFilter
): T[] {
  return transactions.filter(transaction => {
    // Transaction type filter (income vs expense)
    if (filter.transactionType) {
      const transactionType = 'source' in transaction ? 'income' : 'expense';
      if (transactionType !== filter.transactionType) {
        return false;
      }
    }

    // Exact date filter
    if (filter.filterDate && transaction.date !== filter.filterDate) {
      return false;
    }

    // Date range filter
    if (filter.startDate && transaction.date < filter.startDate) {
      return false;
    }
    if (filter.endDate && transaction.date > filter.endDate) {
      return false;
    }

    // Amount filter
    if (filter.minAmount !== undefined && transaction.amount < filter.minAmount) {
      return false;
    }
    if (filter.maxAmount !== undefined && transaction.amount > filter.maxAmount) {
      return false;
    }

    // Search term filter - searches in description and amount (supports both . and , for decimals)
    if (filter.searchTerm) {
      const searchLower = filter.searchTerm.toLowerCase();
      const descriptionMatches = transaction.description.toLowerCase().includes(searchLower);
      // Normalize search term: replace all commas with dots for amount comparison
      const normalizedSearchTerm = filter.searchTerm.replace(/,/g, '.');
      const amountString = transaction.amount.toString();
      const amountMatches = amountString.includes(filter.searchTerm) || amountString.includes(normalizedSearchTerm);
      if (!descriptionMatches && !amountMatches) {
        return false;
      }
    }

    // Recurring filter
    if (filter.isRecurring !== undefined) {
      // Treat undefined isRecurring as false for filtering purposes
      const transactionIsRecurring = transaction.isRecurring ?? false;
      if (transactionIsRecurring !== filter.isRecurring) {
        return false;
      }
    }

    // Type-specific filters - only apply to expenses
    if ('category' in transaction) {
      const expense = transaction as unknown as ExpenseEntry;
      if (filter.category && expense.category !== filter.category) {
        return false;
      }
      if (filter.expenseType && expense.expenseType !== filter.expenseType) {
        return false;
      }
    } else {
      // This is an income transaction - exclude if filtering by expense category or expense type
      if (filter.category) {
        return false; // Income should not appear when filtering by expense category
      }
      if (filter.expenseType) {
        return false; // Income should not appear when filtering by Needs/Wants
      }
    }

    if ('source' in transaction) {
      const income = transaction as unknown as IncomeEntry;
      if (filter.incomeSource && income.source !== filter.incomeSource) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort transactions by field and direction
 */
export function sortTransactions<T extends Transaction>(
  transactions: T[],
  sort: TransactionSort
): T[] {
  const sorted = [...transactions];
  
  sorted.sort((a, b) => {
    let comparison = 0;

    switch (sort.field) {
      case 'date':
        comparison = a.date.localeCompare(b.date);
        break;
      case 'amount':
        comparison = a.amount - b.amount;
        break;
      case 'category':
        // For non-expense transactions, use empty string
        const catA = 'category' in a ? (a as unknown as ExpenseEntry).category : '';
        const catB = 'category' in b ? (b as unknown as ExpenseEntry).category : '';
        comparison = catA.localeCompare(catB);
        break;
    }

    return sort.direction === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

/**
 * Calculate monthly comparison data for charts
 */
export function calculateMonthlyComparison(monthsData: MonthData[], elapsedMonths = monthsData.length): MonthlyComparisonData[] {
  if (monthsData.length === 0) {
    return [];
  }

  // Calculate total expenses for average
  const totalExpenses = monthsData.reduce((sum, month) => {
    return sum + month.expenses.reduce((expSum, exp) => expSum + exp.amount, 0);
  }, 0);
  if (!Number.isInteger(elapsedMonths) || elapsedMonths < 1) throw new RangeError('Elapsed months must be a positive integer.');
  const averageExpense = totalExpenses / elapsedMonths;

  return monthsData.map(month => {
    const expenses = month.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const income = month.incomes.reduce((sum, inc) => sum + inc.amount, 0);

    return {
      month: formatMonth(month.year, month.month),
      expenses,
      income,
      average: averageExpense,
    };
  });
}

/**
 * Calculate category trends over time
 */
export function calculateCategoryTrends(monthsData: MonthData[]): CategoryTrendData[] {
  return monthsData.map(month => {
    const trendData: CategoryTrendData = {
      month: formatMonth(month.year, month.month),
    };

    // Group expenses by category
    for (const expense of month.expenses) {
      const category = expense.category;
      if (typeof trendData[category] === 'number') {
        trendData[category] = (trendData[category] as number) + expense.amount;
      } else {
        trendData[category] = expense.amount;
      }
    }

    return trendData;
  });
}

/**
 * Calculate year-to-date average per category
 */
export function calculateYearToDateAverage(monthsData: MonthData[], elapsedMonths = monthsData.length): CategoryBreakdown[] {
  if (monthsData.length === 0) {
    return [];
  }
  if (!Number.isInteger(elapsedMonths) || elapsedMonths < 1) throw new RangeError('Elapsed months must be a positive integer.');

  // Aggregate all expenses (supports both built-in and custom category IDs)
  const categoryTotals = new Map<ExpenseCategory | string, { total: number; count: number; months: Set<number> }>();

  for (const month of monthsData) {
    for (const expense of month.expenses) {
      const existing = categoryTotals.get(expense.category);
      if (existing) {
        existing.total += expense.amount;
        existing.count += 1;
        existing.months.add(month.month);
      } else {
        categoryTotals.set(expense.category, {
          total: expense.amount,
          count: 1,
          months: new Set([month.month]),
        });
      }
    }
  }

  // Calculate averages
  const numMonths = elapsedMonths;
  const breakdown: CategoryBreakdown[] = [];

  for (const [category, data] of categoryTotals) {
    breakdown.push({
      category,
      totalAmount: data.total / numMonths, // Average per month
      percentage: 0, // Will be calculated if needed
      transactionCount: data.count,
    });
  }

  // Calculate percentages based on total average
  const totalAverage = breakdown.reduce((sum, b) => sum + b.totalAmount, 0);
  for (const item of breakdown) {
    item.percentage = totalAverage > 0 ? (item.totalAmount / totalAverage) * 100 : 0;
  }

  return breakdown;
}

/**
 * Calculate quarterly breakdown for a specific quarter
 * @param monthsData - Array of month data to analyze
 * @param quarter - Quarter number (1-4). Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec.
 *                  Invalid quarters (< 1 or > 4) will return empty results.
 * @returns Object containing category breakdowns, total income, and total expenses for the quarter
 */
export function calculateQuarterlyBreakdown(
  monthsData: MonthData[],
  quarter: number
): { expenses: CategoryBreakdown[]; totalIncome: number; totalExpenses: number } {
  // Filter months for the quarter
  const quarterMonths = monthsData.filter(m => getQuarter(m.month) === quarter);
  
  if (quarterMonths.length === 0) {
    return { expenses: [], totalIncome: 0, totalExpenses: 0 };
  }
  
  const allExpenses = quarterMonths.flatMap(m => m.expenses);
  const allIncomes = quarterMonths.flatMap(m => m.incomes);
  
  const totalIncome = allIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  const totalExpenses = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  return {
    expenses: calculateCategoryBreakdown(allExpenses),
    totalIncome,
    totalExpenses,
  };
}

/**
 * Calculate year-to-date breakdown up to and including a specific month
 * @param monthsData - Array of month data to analyze
 * @param upToMonth - Month number (1-12). 1=January, 12=December. Inclusive.
 *                    All months from 1 up to and including this month are considered.
 * @returns Object containing category breakdowns, totals, and monthly averages
 */
export function calculateYearToDateBreakdown(
  monthsData: MonthData[],
  upToMonth: number
): { expenses: CategoryBreakdown[]; totalIncome: number; totalExpenses: number; average: CategoryBreakdown[] } {
  // Filter months up to and including the specified month
  const ytdMonths = monthsData.filter(m => m.month <= upToMonth);
  
  if (ytdMonths.length === 0) {
    return { expenses: [], totalIncome: 0, totalExpenses: 0, average: [] };
  }
  
  const allExpenses = ytdMonths.flatMap(m => m.expenses);
  const allIncomes = ytdMonths.flatMap(m => m.incomes);
  
  const totalIncome = allIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  const totalExpenses = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  return {
    expenses: calculateCategoryBreakdown(allExpenses),
    totalIncome,
    totalExpenses,
    average: calculateYearToDateAverage(ytdMonths, upToMonth),
  };
}

/**
 * Get the number of days in a given month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Copy recurring transactions from a source month to a new target month
 * @param sourceMonth - The month data to copy recurring transactions from
 * @param targetYear - The target year for the new transactions
 * @param targetMonth - The target month (1-12) for the new transactions
 * @returns Object containing arrays of copied incomes and expenses
 */
export function copyRecurringTransactionsToNewMonth(
  sourceMonth: MonthData,
  targetYear: number,
  targetMonth: number
): { incomes: IncomeEntry[]; expenses: ExpenseEntry[] } {
  const targetMonthDays = getDaysInMonth(targetYear, targetMonth);
  
  // Helper to update date to new month while preserving day (adjusting if needed)
  const updateDateToTargetMonth = (originalDate: string): string => {
    const day = parseInt(originalDate.split('-')[2], 10);
    // Clamp day to the maximum days in the target month
    const adjustedDay = Math.min(day, targetMonthDays);
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
  };
  
  // Filter and copy recurring incomes
  const recurringIncomes = sourceMonth.incomes
    .filter(income => income.isRecurring === true)
    .map(income => ({
      ...income,
      id: generateTransactionId(),
      date: updateDateToTargetMonth(income.date),
    }));
  
  // Filter and copy recurring expenses
  const recurringExpenses = sourceMonth.expenses
    .filter(expense => expense.isRecurring === true)
    .map(expense => ({
      ...expense,
      id: generateTransactionId(),
      date: updateDateToTargetMonth(expense.date),
    }));
  
  return {
    incomes: recurringIncomes,
    expenses: recurringExpenses,
  };
}
