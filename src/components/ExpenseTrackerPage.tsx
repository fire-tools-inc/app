import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchableSelect, SelectOption } from './SearchableSelect';
import { useSearchParams } from 'react-router-dom';
import {
  ExpenseTrackerData,
  IncomeEntry,
  ExpenseEntry,
  ExpenseCategory,
  IncomeSource,
  ExpenseType,
  TransactionFilter,
  TransactionSort,
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  createEmptyMonthData,
  createEmptyYearData,
  generateTransactionId,
  getCategoryInfo,
  getAllCategories,
  CustomCategory,
  CategoryOverride,
} from '../types/expenseTracker';
import { SupportedCurrency } from '../types/currency';
import {
  calculateTransactionSummary,
  calculateCategoryBreakdown,
  calculateBudgetRuleBreakdown,
  calculateMonthlyComparison,
  calculateCategoryTrends,
  filterTransactions,
  sortTransactions,
  calculateQuarterlyBreakdown,
  calculateYearToDateBreakdown,
  copyRecurringTransactionsToNewMonth,
} from '../utils/expenseCalculator';
import {
  saveExpenseTrackerData,
  loadExpenseTrackerData,
} from '../utils/cookieStorage';
import {
  exportExpenseTrackerToCSV,
  importExpenseTrackerFromCSV,
} from '../utils/csvExport';
import { loadSettings, saveSettings, type DateFormat } from '../utils/cookieSettings';
import { formatDate } from '../utils/dateFormatter';
import { generateDemoExpenseData } from '../utils/demoExpenseData';
import { useTableSort } from '../utils/useTableSort';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { DataManagement } from './DataManagement';
import { ExpenseBreakdownChart } from './ExpenseBreakdownChart';
import { SpendingTrendChart } from './SpendingTrendChart';
import { MonthlyComparisonChart } from './MonthlyComparisonChart';
import { ValidatedNumberInput } from './ValidatedNumberInput';
import { MaterialIcon } from './MaterialIcon';
import { ScrollToTopButton } from './ScrollToTopButton';
import { PrivacyBlur } from './PrivacyBlur';
import { CategoryManagerDialog } from './CategoryManagerDialog';
import { PDFImportDialog } from './PDFImportDialog';
import './ExpenseTrackerPage.css';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper to format currency (using centralized formatter)
function formatCurrency(amount: number, currency: string): string {
  return formatDisplayCurrency(amount, currency);
}

// Get default data
function getDefaultData(): ExpenseTrackerData {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Load default currency from user settings
  const settings = loadSettings();
  const defaultCurrency = settings.currencySettings.defaultCurrency;

  return {
    years: [
      {
        year: currentYear,
        months: [createEmptyMonthData(currentYear, currentMonth)],
        isArchived: false,
      },
    ],
    currentYear,
    currentMonth,
    currency: defaultCurrency,
    globalBudgets: [],
  };
}

// Deep clone helper for immutable state updates
function deepCloneData(data: ExpenseTrackerData): ExpenseTrackerData {
  return JSON.parse(JSON.stringify(data));
}

export function ExpenseTrackerPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [data, setData] = useState<ExpenseTrackerData>(() => {
    const saved = loadExpenseTrackerData();
    // Always get current default currency from settings
    const settings = loadSettings();
    const currentDefaultCurrency = settings.currencySettings.defaultCurrency;
    
    if (saved) {
      // Ensure globalBudgets exists for backward compatibility
      // Update the currency to match current settings
      return {
        ...saved,
        globalBudgets: saved.globalBudgets || [],
        currency: currentDefaultCurrency,
      };
    }
    return getDefaultData();
  });
  
  // Get year/month from URL params or use current
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const urlYear = searchParams.get('year');
  const urlMonth = searchParams.get('month');
  
  const [selectedYear, setSelectedYear] = useState(() => {
    if (urlYear) {
      const year = parseInt(urlYear, 10);
      if (!isNaN(year) && year >= 1900 && year <= 2100) return year;
    }
    return currentYear;
  });
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (urlMonth) {
      const month = parseInt(urlMonth, 10);
      if (!isNaN(month) && month >= 1 && month <= 12) return month;
    }
    return currentMonth;
  });
  
  const [activeTab, setActiveTab] = useState<'transactions' | 'budgets' | 'analytics'>('transactions');
  
  // Form state
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<IncomeEntry | ExpenseEntry | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [showPdfImport, setShowPdfImport] = useState(false);
  const [pdfImportEnabled, setPdfImportEnabled] = useState<boolean>(() => {
    return Boolean(loadSettings().experimentalFeatures?.pdfImport);
  });
  const [llmConfig, setLlmConfig] = useState(() => loadSettings().llmCategorization);
  
  // Filter/sort state
  const [filter, setFilter] = useState<TransactionFilter>({});
  const [sort, setSort] = useState<TransactionSort>({ field: 'date', direction: 'desc' });
  
  // How to use collapsed state
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  
  // Budget rule info collapsed state
  const [isBudgetRuleInfoOpen, setIsBudgetRuleInfoOpen] = useState(true);
  
  // Analytics period selection state
  const [analyticsView, setAnalyticsView] = useState<'monthly' | 'quarterly' | 'yearly' | 'ytd'>('monthly');
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil(currentMonth / 3));
  
  // Privacy mode state (loaded from settings, toggleable on page)
  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => {
    const settings = loadSettings();
    return settings.privacyMode;
  });
  
  // Date format state (loaded from settings)
  const [dateFormat, setDateFormat] = useState<DateFormat>(() => {
    const settings = loadSettings();
    return settings.dateFormat;
  });
  
  // Search threshold state (loaded from settings)
  const [searchThreshold] = useState<number>(() => {
    const settings = loadSettings();
    return settings.searchThreshold ?? 8;
  });
  
  // Listen for settings changes (e.g., from Settings page)
  useEffect(() => {
    const handleStorageChange = () => {
      const settings = loadSettings();
      setDateFormat(settings.dateFormat);
      setIsPrivacyMode(settings.privacyMode);
      setPdfImportEnabled(Boolean(settings.experimentalFeatures?.pdfImport));
      setLlmConfig(settings.llmCategorization);
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('focus', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleStorageChange);
    };
  }, []);
  
  // Toggle privacy mode and save to settings
  const togglePrivacyMode = () => {
    const newMode = !isPrivacyMode;
    setIsPrivacyMode(newMode);
    const settings = loadSettings();
    saveSettings({ ...settings, privacyMode: newMode });
  };

  // Sync URL params when year/month changes
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('year', selectedYear.toString());
    newParams.set('month', selectedMonth.toString());
    setSearchParams(newParams, { replace: true });
  }, [selectedYear, selectedMonth, setSearchParams, searchParams]);

  // Save data whenever it changes
  useEffect(() => {
    saveExpenseTrackerData(data);
  }, [data]);
  
  // Check if we're viewing a past period
  const isViewingPastPeriod = selectedYear < currentYear || 
    (selectedYear === currentYear && selectedMonth < currentMonth);
  
  // Navigate to current period
  const goToCurrentPeriod = useCallback(() => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  }, [currentYear, currentMonth]);

  // Auto-create month/year if it doesn't exist, and copy recurring transactions from previous month
  useEffect(() => {
    setData(prev => {
      const yearData = prev.years.find(y => y.year === selectedYear);
      const monthExists = yearData?.months.find(m => m.month === selectedMonth);
      
      // If year and month already exist, no need to update
      if (yearData && monthExists) {
        return prev;
      }
      
      // Create new data with year/month
      const newData = deepCloneData(prev);
      
      // Ensure year exists
      let targetYear = newData.years.find(y => y.year === selectedYear);
      if (!targetYear) {
        targetYear = createEmptyYearData(selectedYear);
        newData.years.push(targetYear);
        newData.years.sort((a, b) => b.year - a.year); // Sort descending
      }
      
      // Ensure month exists and populate with recurring transactions
      if (!targetYear.months.find(m => m.month === selectedMonth)) {
        const monthData = createEmptyMonthData(selectedYear, selectedMonth);
        
        // Find the previous month to copy recurring transactions from
        let prevMonth: number;
        let prevYear: number;
        if (selectedMonth === 1) {
          prevMonth = 12;
          prevYear = selectedYear - 1;
        } else {
          prevMonth = selectedMonth - 1;
          prevYear = selectedYear;
        }
        
        // Look for the previous month in the data
        const prevYearData = newData.years.find(y => y.year === prevYear);
        const prevMonthData = prevYearData?.months.find(m => m.month === prevMonth);
        
        // Copy recurring transactions from previous month if it exists
        if (prevMonthData) {
          const recurringTransactions = copyRecurringTransactionsToNewMonth(
            prevMonthData,
            selectedYear,
            selectedMonth
          );
          monthData.incomes = recurringTransactions.incomes;
          monthData.expenses = recurringTransactions.expenses;
        }
        
        targetYear.months.push(monthData);
        targetYear.months.sort((a, b) => a.month - b.month);
      }
      
      return newData;
    });
  }, [selectedYear, selectedMonth]);

  // Get current month data
  const currentMonthData = useMemo(() => {
    const yearData = data.years.find(y => y.year === selectedYear);
    if (!yearData) return null;
    return yearData.months.find(m => m.month === selectedMonth);
  }, [data, selectedYear, selectedMonth]);

  // Calculate summary for current month
  const summary = useMemo(() => {
    if (!currentMonthData) {
      return { totalIncome: 0, totalExpenses: 0, netBalance: 0, savingsAmount: 0, savingsRate: 0 };
    }
    return calculateTransactionSummary(currentMonthData.incomes, currentMonthData.expenses);
  }, [currentMonthData]);

  // Get all months data for charts
  const allMonthsData = useMemo(() => {
    const yearData = data.years.find(y => y.year === selectedYear);
    return yearData?.months || [];
  }, [data, selectedYear]);

  // Calculate category breakdown based on analytics view (using global budgets)
  // For non-monthly views, multiply budget by number of months:
  // - Quarterly: 3x budget (MONTHS_PER_QUARTER)
  // - Yearly: 12x budget (MONTHS_PER_YEAR)
  // - YTD Average: monthly budget (since we're comparing monthly averages)
  const MONTHS_PER_QUARTER = 3;
  const MONTHS_PER_YEAR = 12;
  
  const categoryBreakdown = useMemo(() => {
    if (activeTab === 'analytics') {
      switch (analyticsView) {
        case 'quarterly': {
          const result = calculateQuarterlyBreakdown(allMonthsData, selectedQuarter);
          // Apply global budgets multiplied by quarter months
          return result.expenses.map(item => {
            const budget = data.globalBudgets.find(b => b.category === item.category);
            const periodBudget = budget?.monthlyBudget !== undefined ? budget.monthlyBudget * MONTHS_PER_QUARTER : undefined;
            return {
              ...item,
              budgeted: periodBudget,
              remaining: periodBudget !== undefined 
                ? periodBudget - item.totalAmount 
                : undefined,
            };
          });
        }
        case 'yearly': {
          const allExpenses = allMonthsData.flatMap(m => m.expenses);
          // Calculate breakdown without budgets first, then apply yearly budget
          const breakdown = calculateCategoryBreakdown(allExpenses, []);
          return breakdown.map(item => {
            const budget = data.globalBudgets.find(b => b.category === item.category);
            const periodBudget = budget?.monthlyBudget !== undefined ? budget.monthlyBudget * MONTHS_PER_YEAR : undefined;
            return {
              ...item,
              budgeted: periodBudget,
              remaining: periodBudget !== undefined 
                ? periodBudget - item.totalAmount 
                : undefined,
            };
          });
        }
        case 'ytd': {
          const result = calculateYearToDateBreakdown(allMonthsData, selectedMonth);
          // For YTD average, we still compare against monthly budget since we're showing monthly average
          return result.average.map(item => {
            const budget = data.globalBudgets.find(b => b.category === item.category);
            return {
              ...item,
              budgeted: budget?.monthlyBudget,
              remaining: budget?.monthlyBudget !== undefined 
                ? budget.monthlyBudget - item.totalAmount 
                : undefined,
            };
          });
        }
        default: // 'monthly'
          if (!currentMonthData) return [];
          return calculateCategoryBreakdown(currentMonthData.expenses, data.globalBudgets);
      }
    }
    // For non-analytics tabs, just use current month
    if (!currentMonthData) return [];
    return calculateCategoryBreakdown(currentMonthData.expenses, data.globalBudgets);
  }, [currentMonthData, data.globalBudgets, activeTab, analyticsView, allMonthsData, selectedQuarter, selectedMonth]);

  // Add table sorting for category breakdown
  const { 
    sortedData: sortedCategoryBreakdown, 
    requestSort: requestCategorySort, 
    getSortIndicator: getCategorySortIndicator 
  } = useTableSort(categoryBreakdown, 'totalAmount');

  // Calculate 50/30/20 breakdown
  const budgetRuleBreakdown = useMemo(() => {
    if (!currentMonthData) return null;
    return calculateBudgetRuleBreakdown(currentMonthData.incomes, currentMonthData.expenses);
  }, [currentMonthData]);

  // Get filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    if (!currentMonthData) return [];
    const allTransactions = [...currentMonthData.incomes, ...currentMonthData.expenses];
    const filtered = filterTransactions(allTransactions, filter);
    return sortTransactions(filtered, sort);
  }, [currentMonthData, filter, sort]);

  // Helper function to handle table header sorting
  const handleTableSort = useCallback((field: TransactionSort['field']) => {
    setSort(prevSort => ({
      field,
      direction: prevSort.field === field 
        ? (prevSort.direction === 'asc' ? 'desc' : 'asc')
        : 'asc'
    }));
  }, []);

  // Helper function to get sort indicator for table headers
  const getTransactionSortIndicator = useCallback((field: TransactionSort['field']) => {
    if (sort.field !== field) return '⇅';
    return sort.direction === 'asc' ? '↑' : '↓';
  }, [sort]);

  // Get filtered months data based on analytics view
  const filteredMonthsData = useMemo(() => {
    switch (analyticsView) {
      case 'monthly':
        return currentMonthData ? [currentMonthData] : [];
      case 'quarterly': {
        // Filter months for the selected quarter
        const quarterStartMonth = (selectedQuarter - 1) * 3 + 1;
        const quarterEndMonth = selectedQuarter * 3;
        return allMonthsData.filter(m => m.month >= quarterStartMonth && m.month <= quarterEndMonth);
      }
      case 'ytd':
        // Filter months from beginning of year to selected month
        return allMonthsData.filter(m => m.month <= selectedMonth);
      case 'yearly':
      default:
        return allMonthsData;
    }
  }, [analyticsView, selectedQuarter, selectedMonth, currentMonthData, allMonthsData]);

  // Monthly comparison data - uses filtered months based on analytics view
  const monthlyComparisonData = useMemo(() => {
    return calculateMonthlyComparison(filteredMonthsData);
  }, [filteredMonthsData]);

  // Category trends data - uses filtered months based on analytics view
  const categoryTrendsData = useMemo(() => {
    return calculateCategoryTrends(filteredMonthsData);
  }, [filteredMonthsData]);

  // Add income - combines month creation and income addition in one update
  const handleAddIncome = useCallback((income: Omit<IncomeEntry, 'id' | 'type'>) => {
    const [year, month] = income.date.split('-').map(Number);
    
    setData(prev => {
      const newData = deepCloneData(prev);
      
      // Ensure year exists
      let yearData = newData.years.find(y => y.year === year);
      if (!yearData) {
        yearData = createEmptyYearData(year);
        newData.years.push(yearData);
        newData.years.sort((a, b) => a.year - b.year);
      }
      
      // Ensure month exists
      let monthData = yearData.months.find(m => m.month === month);
      if (!monthData) {
        monthData = createEmptyMonthData(year, month);
        yearData.months.push(monthData);
        yearData.months.sort((a, b) => a.month - b.month);
      }
      
      // Add income
      const newIncome: IncomeEntry = {
        ...income,
        id: generateTransactionId(),
        type: 'income',
      };
      monthData.incomes.push(newIncome);
      
      return newData;
    });
    
    setShowIncomeForm(false);
  }, []);

  // Add expense - combines month creation and expense addition in one update
  const handleAddExpense = useCallback((expense: Omit<ExpenseEntry, 'id' | 'type'>) => {
    const [year, month] = expense.date.split('-').map(Number);
    
    setData(prev => {
      const newData = deepCloneData(prev);
      
      // Ensure year exists
      let yearData = newData.years.find(y => y.year === year);
      if (!yearData) {
        yearData = createEmptyYearData(year);
        newData.years.push(yearData);
        newData.years.sort((a, b) => a.year - b.year);
      }
      
      // Ensure month exists
      let monthData = yearData.months.find(m => m.month === month);
      if (!monthData) {
        monthData = createEmptyMonthData(year, month);
        yearData.months.push(monthData);
        yearData.months.sort((a, b) => a.month - b.month);
      }
      
      // Add expense
      const newExpense: ExpenseEntry = {
        ...expense,
        id: generateTransactionId(),
        type: 'expense',
      };
      monthData.expenses.push(newExpense);
      
      return newData;
    });
    
    setShowExpenseForm(false);
  }, []);

  // Update income
  const handleUpdateIncome = useCallback((id: string, updates: Partial<IncomeEntry>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.incomes.findIndex(i => i.id === id);
          if (index !== -1) {
            monthData.incomes[index] = { ...monthData.incomes[index], ...updates };
            return newData;
          }
        }
      }
      return newData;
    });
    setEditingTransaction(null);
  }, []);

  // Update expense
  const handleUpdateExpense = useCallback((id: string, updates: Partial<ExpenseEntry>) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          const index = monthData.expenses.findIndex(e => e.id === id);
          if (index !== -1) {
            monthData.expenses[index] = { ...monthData.expenses[index], ...updates };
            return newData;
          }
        }
      }
      return newData;
    });
    setEditingTransaction(null);
  }, []);

  // Delete transaction
  const handleDeleteTransaction = useCallback((id: string, type: 'income' | 'expense') => {
    if (!confirm(t('expenseTracker.confirm.deleteTransaction'))) return;
    
    setData(prev => {
      const newData = deepCloneData(prev);
      for (const yearData of newData.years) {
        for (const monthData of yearData.months) {
          if (type === 'income') {
            const index = monthData.incomes.findIndex(i => i.id === id);
            if (index !== -1) {
              monthData.incomes.splice(index, 1);
              return newData;
            }
          } else {
            const index = monthData.expenses.findIndex(e => e.id === id);
            if (index !== -1) {
              monthData.expenses.splice(index, 1);
              return newData;
            }
          }
        }
      }
      return newData;
    });
  }, []);

  // Update global budget for a category (supports both built-in and custom category IDs)
  const handleUpdateBudget = useCallback((category: ExpenseCategory | string, amount: number) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      
      const existingIndex = newData.globalBudgets.findIndex(b => b.category === category);
      if (existingIndex !== -1) {
        if (amount <= 0) {
          newData.globalBudgets.splice(existingIndex, 1);
        } else {
          newData.globalBudgets[existingIndex].monthlyBudget = amount;
        }
      } else if (amount > 0) {
        newData.globalBudgets.push({ category, monthlyBudget: amount });
      }
      
      return newData;
    });
  }, []);

  // Add custom category
  const handleAddCategory = useCallback((category: CustomCategory) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      if (!newData.customCategories) {
        newData.customCategories = [];
      }
      newData.customCategories.push(category);
      return newData;
    });
  }, []);

  // Update custom category
  const handleUpdateCategory = useCallback((category: CustomCategory) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      if (!newData.customCategories) return newData;
      
      const index = newData.customCategories.findIndex(c => c.id === category.id);
      if (index !== -1) {
        newData.customCategories[index] = category;
      }
      return newData;
    });
  }, []);

  // Delete custom category - reassign expenses to the specified category (defaults to NO_CATEGORY)
  const handleDeleteCategory = useCallback((categoryId: string, reassignTo?: string) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      if (!newData.customCategories) return newData;
      
      // If reassignTo is specified, reassign all expenses with this category
      if (reassignTo) {
        for (const yearData of newData.years) {
          for (const monthData of yearData.months) {
            for (const expense of monthData.expenses) {
              if (expense.category === categoryId) {
                expense.category = reassignTo;
              }
            }
          }
        }
      }
      
      newData.customCategories = newData.customCategories.filter(c => c.id !== categoryId);
      return newData;
    });
  }, []);

  // Update a built-in category with an override
  const handleUpdateBuiltInCategory = useCallback((override: CategoryOverride) => {
    setData(prev => {
      const newData = deepCloneData(prev);
      if (!newData.categoryOverrides) {
        newData.categoryOverrides = [];
      }
      
      // Find existing override and update or add new one
      const existingIndex = newData.categoryOverrides.findIndex(o => o.id === override.id);
      if (existingIndex >= 0) {
        // Merge with existing override
        newData.categoryOverrides[existingIndex] = {
          ...newData.categoryOverrides[existingIndex],
          ...override,
        };
      } else {
        newData.categoryOverrides.push(override);
      }
      
      return newData;
    });
  }, []);

  // Get count of expenses for a specific category (across all years)
  const getExpenseCountForCategory = useCallback((categoryId: string): number => {
    let count = 0;
    for (const yearData of data.years) {
      for (const monthData of yearData.months) {
        count += monthData.expenses.filter(e => e.category === categoryId).length;
      }
    }
    return count;
  }, [data.years]);

  // Export data
  const handleExport = () => {
    const csv = exportExpenseTrackerToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense-tracker-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import data
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const imported = importExpenseTrackerFromCSV(csv);
        setData(imported);
        setSelectedYear(imported.currentYear);
        setSelectedMonth(imported.currentMonth);
      } catch (error) {
        alert(t('expenseTracker.messages.importCsvError', { message: error instanceof Error ? error.message : t('common.unknownError') }));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Reset data
  const handleResetData = () => {
    if (confirm(t('expenseTracker.confirm.reset'))) {
      const defaultData = getDefaultData();
      setData(defaultData);
      setSelectedYear(defaultData.currentYear);
      setSelectedMonth(defaultData.currentMonth);
    }
  };

  // Load demo data
  const handleLoadDemo = () => {
    if (confirm(t('expenseTracker.confirm.loadDemo', { year: selectedYear }))) {
      const demoData = generateDemoExpenseData(selectedYear);
      
      // Merge demo data with existing data
      // Remove existing year data if present, then add demo data
      const filteredYears = data.years.filter(y => y.year !== selectedYear);
      const mergedData: ExpenseTrackerData = {
        ...data,
        years: [...filteredYears, ...demoData.years].sort((a, b) => b.year - a.year),
      };
      
      setData(mergedData);
    }
  };

  // Available years for selector - include years from data plus unlimited past years
  const availableYears = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const years = new Set(data.years.map(y => y.year));
    
    // Add current year
    years.add(currentYear);
    
    // Add past years: go back 30 years to allow historical data entry
    for (let i = 1; i <= 30; i++) {
      years.add(currentYear - i);
    }
    
    // Allow next year if we're viewing December (user can add January of next year)
    if (selectedMonth === 12) {
      years.add(selectedYear + 1);
    }
    years.add(currentYear + 1); // Always allow next year
    
    return Array.from(years).sort((a, b) => b - a);
  }, [data, selectedMonth, selectedYear]);

  // Available months for selector
  const availableMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  const getMonthName = (month: number) => t(`common.months.${MONTH_NAMES[month - 1].toLowerCase()}`);
  const periodLabel = analyticsView === 'monthly'
    ? t('expenseTracker.period.monthYear', { month: getMonthName(selectedMonth), year: selectedYear })
    : analyticsView === 'quarterly'
      ? t('expenseTracker.period.quarterYear', { quarter: selectedQuarter, year: selectedYear })
      : analyticsView === 'yearly'
        ? t('expenseTracker.period.fullYear', { year: selectedYear })
        : t('expenseTracker.period.ytdAverage', { year: selectedYear });

  return (
    <div className="expense-tracker-page">
      <header className="page-header">
        <div className="page-header-top">
          <h1><MaterialIcon name="account_balance_wallet" className="page-header-icon" /> {t('expenseTracker.title')}</h1>
        </div>
        <p>
          {t('expenseTracker.subtitle')}
        </p>
      </header>

      <main className="expense-tracker-main" id="main-content">
        {/* How to Use Section */}
        <section className="allocation-info collapsible-section">
          <button 
            className="collapsible-header" 
            onClick={() => setIsHowToUseOpen(!isHowToUseOpen)}
            aria-expanded={isHowToUseOpen}
            aria-controls="how-to-use-content"
          >
            <h4><MaterialIcon name="lightbulb" /> {t('expenseTracker.howItWorks.title')} <span className="collapse-icon-small" aria-hidden="true">{isHowToUseOpen ? '▼' : '▶'}</span></h4>
          </button>
          {isHowToUseOpen && (
            <ul id="how-to-use-content" className="how-to-use-content">
              <li><strong>{t('expenseTracker.howItWorks.addTransactionsLabel')}</strong> {t('expenseTracker.howItWorks.addTransactionsText')}</li>
              <li><strong>{t('expenseTracker.howItWorks.editDeleteLabel')}</strong> {t('expenseTracker.howItWorks.editDeleteText')}</li>
              <li><strong>{t('expenseTracker.howItWorks.setBudgetsLabel')}</strong> {t('expenseTracker.howItWorks.setBudgetsText')}</li>
              <li><strong>{t('expenseTracker.howItWorks.needsWantsLabel')}</strong> {t('expenseTracker.howItWorks.needsWantsText')}</li>
              <li><strong>{t('expenseTracker.howItWorks.viewAnalyticsLabel')}</strong> {t('expenseTracker.howItWorks.viewAnalyticsText')}</li>
              <li><strong>{t('expenseTracker.howItWorks.navigateMonthsLabel')}</strong> {t('expenseTracker.howItWorks.navigateMonthsText')}</li>
            </ul>
          )}
        </section>

        {/* Data Management */}
        <DataManagement
          onExport={handleExport}
          onImport={handleImport}
          onReset={handleResetData}
          onLoadDemo={handleLoadDemo}
          defaultOpen={false}
        />

        {/* Month/Year Selector */}
        <section className="period-selector" aria-labelledby="period-selector-heading">
          <h3 id="period-selector-heading" className="visually-hidden">{t('expenseTracker.selectPeriod')}</h3>
          <div className="selector-row">
            <div className="selector-group">
              <label htmlFor="year-select">{t('expenseTracker.year')}</label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="selector-group">
              <label htmlFor="month-select">{t('expenseTracker.month')}</label>
              <select
                id="month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {availableMonths.map(month => (
                  <option key={month} value={month}>{getMonthName(month)}</option>
                ))}
              </select>
            </div>
            {isViewingPastPeriod && (
              <button
                className="btn-current-period"
                onClick={goToCurrentPeriod}
              >
                <span aria-hidden="true">📅</span> {t('expenseTracker.backToCurrentPeriod')}
              </button>
            )}
          </div>
        </section>

        {/* Summary Cards */}
        <section className="summary-section" aria-labelledby="summary-heading">
          <h3 id="summary-heading">{t('expenseTracker.summaryFor', { month: getMonthName(selectedMonth), year: selectedYear })}</h3>
          <div className="summary-cards">
            <div className="summary-card income">
              <button 
                className="privacy-eye-btn card-privacy-btn"
                onClick={togglePrivacyMode}
                title={isPrivacyMode ? t('common.showValues') : t('common.hideValues')}
                aria-pressed={isPrivacyMode}
              >
                <MaterialIcon name={isPrivacyMode ? 'visibility_off' : 'visibility'} size="small" />
              </button>
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="trending_up" /></span>
              <div className="card-content">
                <span className="card-label">{t('expenseTracker.totalIncome')}</span>
                <span className="card-value">
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(summary.totalIncome, data.currency)}</PrivacyBlur>
                </span>
              </div>
            </div>
            <div className="summary-card expenses">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="trending_down" /></span>
              <div className="card-content">
                <span className="card-label">{t('expenseTracker.totalExpenses')}</span>
                <span className="card-value">{formatCurrency(summary.totalExpenses, data.currency)}</span>
              </div>
            </div>
            <div className={`summary-card balance ${summary.netBalance >= 0 ? 'positive' : 'negative'}`}>
              <span className="card-icon" aria-hidden="true">{summary.netBalance >= 0 ? <MaterialIcon name="account_balance_wallet" /> : <MaterialIcon name="warning" />}</span>
              <div className="card-content">
                <span className="card-label">{t('expenseTracker.netBalance')}</span>
                <span className="card-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(summary.netBalance, data.currency)}</PrivacyBlur></span>
              </div>
            </div>
            <div className="summary-card savings">
              <span className="card-icon" aria-hidden="true"><MaterialIcon name="savings" /></span>
              <div className="card-content">
                <span className="card-label">{t('expenseTracker.savingsRate')}</span>
                <span className="card-value"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(summary.savingsRate)}</PrivacyBlur></span>
              </div>
            </div>
          </div>
        </section>

        {/* {t('expenseTracker.budgetRule.title')} */}
        {budgetRuleBreakdown && (
          <section className="budget-rule-section" data-tour="budget-analysis">
            <button 
              className="collapsible-header" 
              onClick={() => setIsBudgetRuleInfoOpen(!isBudgetRuleInfoOpen)}
              aria-expanded={isBudgetRuleInfoOpen}
              aria-controls="budget-rule-content"
            >
              <h3><MaterialIcon name="bar_chart" /> {t('expenseTracker.budgetRule.title')} <span className="collapse-icon-small" aria-hidden="true">{isBudgetRuleInfoOpen ? '▼' : '▶'}</span></h3>
            </button>
            {isBudgetRuleInfoOpen && (
              <div id="budget-rule-content" className="budget-rule-content">
                <div className="budget-rule-info">
                  <p>
                    <strong>{t('expenseTracker.budgetRule.ruleLabel')}</strong> {t('expenseTracker.budgetRule.ruleText')}
                  </p>
                </div>
                <div className="budget-rule-bars">
                  <div className="rule-bar">
                    <div className="rule-bar-label">
                      <span>{t('expenseTracker.budgetRule.needs')}</span>
                      <span><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(budgetRuleBreakdown.needs.percentage)}</PrivacyBlur></span>
                    </div>
                    <div className="rule-bar-track">
                      <div 
                        className={`rule-bar-fill needs ${budgetRuleBreakdown.needs.percentage > 50 ? 'over' : ''}`}
                        style={{ width: `${Math.min(budgetRuleBreakdown.needs.percentage, 100)}%` }}
                      />
                      <div className="rule-bar-target" style={{ left: '50%' }} />
                    </div>
                    <span className="rule-bar-amount"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(budgetRuleBreakdown.needs.amount, data.currency)}</PrivacyBlur></span>
                  </div>
                  <div className="rule-bar">
                    <div className="rule-bar-label">
                      <span>{t('expenseTracker.budgetRule.wants')}</span>
                      <span><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(budgetRuleBreakdown.wants.percentage)}</PrivacyBlur></span>
                    </div>
                    <div className="rule-bar-track">
                      <div 
                        className={`rule-bar-fill wants ${budgetRuleBreakdown.wants.percentage > 30 ? 'over' : ''}`}
                        style={{ width: `${Math.min(budgetRuleBreakdown.wants.percentage, 100)}%` }}
                      />
                      <div className="rule-bar-target" style={{ left: '30%' }} />
                    </div>
                    <span className="rule-bar-amount"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(budgetRuleBreakdown.wants.amount, data.currency)}</PrivacyBlur></span>
                  </div>
                  <div className="rule-bar">
                    <div className="rule-bar-label">
                      <span>{t('expenseTracker.budgetRule.savings')}</span>
                      <span><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatDisplayPercent(budgetRuleBreakdown.savings.percentage)}</PrivacyBlur></span>
                    </div>
                    <div className="rule-bar-track">
                      <div 
                        className={`rule-bar-fill savings ${budgetRuleBreakdown.savings.percentage >= 20 ? 'good' : ''}`}
                        style={{ width: `${Math.min(budgetRuleBreakdown.savings.percentage, 100)}%` }}
                      />
                      <div className="rule-bar-target" style={{ left: '20%' }} />
                    </div>
                    <span className="rule-bar-amount"><PrivacyBlur isPrivacyMode={isPrivacyMode}>{formatCurrency(budgetRuleBreakdown.savings.amount, data.currency)}</PrivacyBlur></span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Tabs */}
        <div className="tabs" role="tablist" aria-label={t('expenseTracker.tabsAria')} data-tour="expense-tabs">
          <button
            role="tab"
            aria-selected={activeTab === 'transactions'}
            onClick={() => setActiveTab('transactions')}
            className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          >
            <MaterialIcon name="receipt_long" /> {t('expenseTracker.transactions')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'budgets'}
            onClick={() => setActiveTab('budgets')}
            className={`tab ${activeTab === 'budgets' ? 'active' : ''}`}
            data-tour="budgets-tab"
          >
            <MaterialIcon name="savings" /> {t('expenseTracker.budgets')}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
            className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
            data-tour="analytics-tab"
          >
            <MaterialIcon name="analytics" /> {t('expenseTracker.analytics')}
          </button>
        </div>

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <section className="transactions-section" role="tabpanel" aria-labelledby="transactions-tab">
            <div className="section-header">
              <h3>{t('expenseTracker.transactions')}</h3>
              <div className="transaction-actions" data-tour="transaction-actions">
                <button className="btn-add income" onClick={() => setShowIncomeForm(true)}>
                  <MaterialIcon name="add" /> {t('expenseTracker.addIncome')}
                </button>
                <button className="btn-add expense" onClick={() => setShowExpenseForm(true)}>
                  <MaterialIcon name="add" /> {t('expenseTracker.addExpense')}
                </button>
                {pdfImportEnabled && (
                  <button
                    className="btn-add"
                    onClick={() => setShowPdfImport(true)}
                    aria-label={t('expenseTracker.importPdfAria')}
                  >
                    <MaterialIcon name="picture_as_pdf" /> {t('expenseTracker.importPdf')}
                  </button>
                )}
              </div>
            </div>

            {/* Filter/Sort Controls */}
            <div className="filter-controls">
              <div className="filter-group">
                <label htmlFor="sort-field">{t('expenseTracker.sortBy')}</label>
                <select
                  id="sort-field"
                  value={sort.field}
                  onChange={(e) => setSort({ ...sort, field: e.target.value as TransactionSort['field'] })}
                >
                  <option value="date">{t('expenseTracker.date')}</option>
                  <option value="amount">{t('expenseTracker.amount')}</option>
                  <option value="category">{t('expenseTracker.category')}</option>
                </select>
                <button
                  className="sort-direction-btn"
                  onClick={() => setSort({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
                  aria-label={sort.direction === 'asc' ? t('expenseTracker.sortDescending') : t('expenseTracker.sortAscending')}
                >
                  {sort.direction === 'asc' ? '↑' : '↓'}
                </button>
              </div>
              <div className="filter-group">
                <label htmlFor="filter-transaction-type">{t('expenseTracker.show')}</label>
                <select
                  id="filter-transaction-type"
                  value={filter.transactionType || ''}
                  onChange={(e) => setFilter({ 
                    ...filter, 
                    transactionType: e.target.value as 'income' | 'expense' || undefined,
                    // Clear category filter if switching to income
                    category: e.target.value === 'income' ? undefined : filter.category,
                    // Clear expense type filter if switching to income  
                    expenseType: e.target.value === 'income' ? undefined : filter.expenseType
                  })}
                >
                  <option value="">{t('expenseTracker.allTransactions')}</option>
                  <option value="expense">{t('expenseTracker.onlyExpenses')}</option>
                  <option value="income">{t('expenseTracker.onlyIncome')}</option>
                </select>
              </div>
              <div className="filter-group">
                <label htmlFor="filter-category">{t('expenseTracker.category')}</label>
                <SearchableSelect
                  options={[
                    { id: '', label: t('expenseTracker.allCategories') },
                    ...EXPENSE_CATEGORIES.map(c => ({ id: c.id, label: c.name, icon: c.icon }))
                  ]}
                  value={filter.category || ''}
                  onChange={(val) => setFilter({ 
                    ...filter, 
                    category: val as ExpenseCategory || undefined,
                    transactionType: val ? 'expense' : undefined
                  })}
                  disabled={filter.transactionType === 'income'}
                  searchThreshold={searchThreshold}
                  ariaLabel={t('expenseTracker.filterByCategory')}
                  renderOption={(option) => (
                    <>
                      {option.icon && <MaterialIcon name={option.icon} size="small" />}
                      <span>{option.label}</span>
                    </>
                  )}
                />
              </div>
              <div className="filter-group">
                <label htmlFor="filter-date">{t('expenseTracker.date')}</label>
                <input
                  id="filter-date"
                  type="date"
                  className="date-filter-input"
                  value={filter.filterDate || ''}
                  onChange={(e) => setFilter({ ...filter, filterDate: e.target.value || undefined })}
                />
              </div>
              <div className="filter-group">
                <label htmlFor="filter-type">{t('expenseTracker.type')}</label>
                <select
                  id="filter-type"
                  value={filter.expenseType || ''}
                  onChange={(e) => setFilter({ 
                    ...filter, 
                    expenseType: e.target.value as ExpenseType || undefined,
                    // When selecting needs/wants, filter to expenses only; when clearing, reset to all transactions
                    transactionType: e.target.value ? 'expense' : undefined
                  })}
                  disabled={filter.transactionType === 'income'}
                >
                  <option value="">{t('expenseTracker.all')}</option>
                  <option value="NEED">{t('expenseTracker.needs')}</option>
                  <option value="WANT">{t('expenseTracker.wants')}</option>
                </select>
              </div>
              <div className="filter-group">
                <label htmlFor="filter-recurring">{t('expenseTracker.recurring')}</label>
                <select
                  id="filter-recurring"
                  value={filter.isRecurring === undefined ? '' : filter.isRecurring.toString()}
                  onChange={(e) => setFilter({ ...filter, isRecurring: e.target.value === '' ? undefined : e.target.value === 'true' })}
                >
                  <option value="">{t('expenseTracker.all')}</option>
                  <option value="true">{t('expenseTracker.recurringOnly')}</option>
                  <option value="false">{t('expenseTracker.oneTimeOnly')}</option>
                </select>
              </div>
              <div className="filter-group">
                <label htmlFor="filter-search">{t('expenseTracker.search')}</label>
                <input
                  id="filter-search"
                  type="text"
                  placeholder={t('expenseTracker.searchPlaceholder')}
                  value={filter.searchTerm || ''}
                  onChange={(e) => setFilter({ ...filter, searchTerm: e.target.value || undefined })}
                />
              </div>
              <div className="filter-group filter-group-amount-range">
                <label>{t('expenseTracker.amountRange')}</label>
                <div className="amount-range-inputs">
                  <input
                    id="filter-min-amount"
                    type="number"
                    placeholder={t('expenseTracker.min')}
                    min="0"
                    step="0.01"
                    value={filter.minAmount ?? ''}
                    onChange={(e) => setFilter({ ...filter, minAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                  />
                  <span className="amount-range-separator">-</span>
                  <input
                    id="filter-max-amount"
                    type="number"
                    placeholder={t('expenseTracker.max')}
                    min="0"
                    step="0.01"
                    value={filter.maxAmount ?? ''}
                    onChange={(e) => setFilter({ ...filter, maxAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                  />
                </div>
              </div>
            </div>

            {/* Transaction List */}
            <div className="transactions-list">
              {filteredTransactions.length === 0 ? (
                <div className="empty-state">
                  <p>{t('expenseTracker.emptyTransactions')}</p>
                </div>
              ) : (
                <table className="transactions-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleTableSort('date')}>
                        {t('expenseTracker.date')} <span className="sort-indicator">{getTransactionSortIndicator('date')}</span>
                      </th>
                      <th>{t('expenseTracker.description')}</th>
                      <th className="sortable" onClick={() => handleTableSort('category')}>
                        {t('expenseTracker.categorySource')} <span className="sort-indicator">{getTransactionSortIndicator('category')}</span>
                      </th>
                      <th>{t('expenseTracker.type')}</th>
                      <th className="sortable amount-col" onClick={() => handleTableSort('amount')}>
                        {t('expenseTracker.amount')} <span className="sort-indicator">{getTransactionSortIndicator('amount')}</span>
                      </th>
                      <th>{t('expenseTracker.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr 
                        key={transaction.id} 
                        className={`${transaction.type === 'income' ? 'income-row' : 'expense-row'}${transaction.isRecurring ? ' recurring-row' : ''}`}
                      >
                        <td>{formatDate(transaction.date, dateFormat)}</td>
                        <td>
                          {transaction.description}
                          {transaction.isRecurring && (
                            <span className="recurring-badge" title={t('expenseTracker.recurringTransaction')}>
                              <MaterialIcon name="autorenew" size="small" />
                            </span>
                          )}
                        </td>
                        <td>
                          {transaction.type === 'income' 
                            ? INCOME_SOURCES.find(s => s.id === (transaction as IncomeEntry).source)?.name
                            : getCategoryInfo((transaction as ExpenseEntry).category, data.customCategories).name
                          }
                        </td>
                        <td>
                          {transaction.type === 'income' ? (
                            <span className="type-badge income">{t('expenseTracker.income')}</span>
                          ) : (
                            <span className={`type-badge ${(transaction as ExpenseEntry).expenseType.toLowerCase()}`}>
                              {(transaction as ExpenseEntry).expenseType === 'NEED' ? t('expenseTracker.need') : t('expenseTracker.want')}
                            </span>
                          )}
                        </td>
                        <td className={`amount-col ${transaction.type === 'income' ? 'positive' : 'negative'}`}>
                          {transaction.type === 'income' ? (
                            <PrivacyBlur isPrivacyMode={isPrivacyMode}>+{formatCurrency(transaction.amount, data.currency)}</PrivacyBlur>
                          ) : (
                            <span>-{formatCurrency(transaction.amount, data.currency)}</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn-icon"
                            onClick={() => setEditingTransaction(transaction)}
                            aria-label={t('expenseTracker.editTransaction')}
                          >
                            <MaterialIcon name="edit" size="small" />
                          </button>
                          <button
                            className="btn-icon delete"
                            onClick={() => handleDeleteTransaction(transaction.id, transaction.type)}
                            aria-label={t('expenseTracker.deleteTransaction')}
                          >
                            <MaterialIcon name="delete" size="small" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Sum row - only shown when filtering/searching */}
                  {(filter.searchTerm || filter.category || filter.filterDate || filter.expenseType || filter.transactionType || filter.isRecurring !== undefined || filter.minAmount !== undefined || filter.maxAmount !== undefined) && filteredTransactions.length > 0 && (
                    <tfoot>
                      <tr className="sum-row">
                        <td colSpan={4} className="sum-label">
                          <strong>{t('expenseTracker.sumOfFilteredTransactions')}</strong>
                        </td>
                        <td className="amount-col">
                          <strong>
                            {(() => {
                              const totalIncome = filteredTransactions
                                .filter(t => t.type === 'income')
                                .reduce((sum, t) => sum + t.amount, 0);
                              const totalExpenses = filteredTransactions
                                .filter(t => t.type === 'expense')
                                .reduce((sum, t) => sum + t.amount, 0);
                              const netAmount = totalIncome - totalExpenses;
                              return (
                                <span className={netAmount >= 0 ? 'positive' : 'negative'}>
                                  {netAmount >= 0 ? '+' : ''}{formatCurrency(netAmount, data.currency)}
                                </span>
                              );
                            })()}
                          </strong>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </section>
        )}

        {/* Budgets Tab */}
        {activeTab === 'budgets' && (
          <section className="budgets-section" role="tabpanel" aria-labelledby="budgets-tab" data-tour="budgets-content">
            <div className="budgets-header">
              <div>
                <h3>{t('expenseTracker.monthlyBudgets')}</h3>
                <p className="section-description">
                  {t('expenseTracker.monthlyBudgetsDescription')}
                </p>
              </div>
              <button 
                className="btn-manage-categories"
                onClick={() => setShowCategoryManager(true)}
              >
                <MaterialIcon name="category" size="small" />
                {t('expenseTracker.manageCategories')}
              </button>
            </div>
            <div className="budgets-grid">
              {getAllCategories(data.customCategories).map(category => {
                const breakdown = categoryBreakdown.find(b => b.category === category.id);
                const budget = data.globalBudgets.find(b => b.category === category.id);
                const spent = breakdown?.totalAmount || 0;
                const budgeted = budget?.monthlyBudget || 0;
                const remaining = budgeted - spent;
                const percentUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;

                return (
                  <div key={category.id} className={`budget-card ${category.isCustom ? 'custom' : ''}`}>
                    <div className="budget-header">
                      {category.isCustom && category.color && (
                        <span className="custom-category-color" style={{ backgroundColor: category.color }} />
                      )}
                      <span className="category-icon" aria-hidden="true"><MaterialIcon name={category.icon} size="small" /></span>
                      <span className="category-name">{category.name}</span>
                      <span className={`expense-type-badge ${category.defaultExpenseType.toLowerCase()}`}>
                        {category.defaultExpenseType === 'NEED' ? t('expenseTracker.need') : t('expenseTracker.want')}
                      </span>
                    </div>
                    <div className="budget-details">
                      <div className="budget-input-row">
                        <label htmlFor={`budget-${category.id}`}>{t('expenseTracker.budget')}</label>
                        <ValidatedNumberInput
                          value={budgeted}
                          onChange={(value) => handleUpdateBudget(category.id, value)}
                          validation={{ min: 0, allowDecimals: true }}
                          placeholder="0"
                        />
                      </div>
                      <div className="budget-stats">
                        <span>{t('expenseTracker.spentThisMonth')} {formatCurrency(spent, data.currency)}</span>
                        {budgeted > 0 && (
                          <span className={remaining >= 0 ? 'positive' : 'negative'}>
                            {t('expenseTracker.remaining')} {formatCurrency(remaining, data.currency)}
                          </span>
                        )}
                      </div>
                      {budgeted > 0 && (
                        <div className="budget-progress">
                          <div 
                            className={`budget-progress-fill ${percentUsed > 100 ? 'over' : percentUsed > 80 ? 'warning' : ''}`}
                            style={{ width: `${Math.min(percentUsed, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <section className="analytics-section" role="tabpanel" aria-labelledby="analytics-tab" data-tour="analytics-content">
            <h3>{t('expenseTracker.spendingAnalyticsFor', { year: selectedYear })}</h3>
            
            {/* Analytics View Selector */}
            <div className="analytics-view-selector">
              <div className="selector-group">
                <label htmlFor="analytics-view">{t('expenseTracker.view')}</label>
                <select
                  id="analytics-view"
                  value={analyticsView}
                  onChange={(e) => setAnalyticsView(e.target.value as 'monthly' | 'quarterly' | 'yearly' | 'ytd')}
                >
                  <option value="monthly">{t('expenseTracker.monthly')}</option>
                  <option value="quarterly">{t('expenseTracker.quarterly')}</option>
                  <option value="yearly">{t('expenseTracker.yearlyTotal')}</option>
                  <option value="ytd">{t('expenseTracker.yearToDateAverage')}</option>
                </select>
              </div>
              {analyticsView === 'quarterly' && (
                <div className="selector-group">
                  <label htmlFor="quarter-select">{t('expenseTracker.quarter')}</label>
                  <select
                    id="quarter-select"
                    value={selectedQuarter}
                    onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                  >
                    <option value={1}>{t('expenseTracker.quarters.q1')}</option>
                    <option value={2}>{t('expenseTracker.quarters.q2')}</option>
                    <option value={3}>{t('expenseTracker.quarters.q3')}</option>
                    <option value={4}>{t('expenseTracker.quarters.q4')}</option>
                  </select>
                </div>
              )}
            </div>
            
            {/* Expense Breakdown Pie Chart */}
            <div className="chart-container">
              <h4>
                {t('expenseTracker.expenseBreakdown', { period: periodLabel })}
              </h4>
              <ExpenseBreakdownChart 
                data={categoryBreakdown}
                currency={data.currency}
                customCategories={data.customCategories}
              />
            </div>

            {/* Monthly Comparison Chart */}
            <div className="chart-container">
              <h4>{t('expenseTracker.monthlySpendingComparison')}</h4>
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                <MonthlyComparisonChart 
                  data={monthlyComparisonData}
                  currency={data.currency}
                />
              </PrivacyBlur>
            </div>

            {/* Category Trends Chart */}
            <div className="chart-container">
              <h4>{t('expenseTracker.categorySpendingTrends')}</h4>
              <SpendingTrendChart 
                data={categoryTrendsData}
                currency={data.currency}
                customCategories={data.customCategories}
              />
            </div>

            {/* Category Breakdown Table */}
            <div className="breakdown-table-container">
              <h4>{t('expenseTracker.categoryBreakdown', { period: periodLabel })}</h4>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th 
                      onClick={() => requestCategorySort('category')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {t('expenseTracker.category')} {getCategorySortIndicator('category')}
                    </th>
                    <th 
                      onClick={() => requestCategorySort('totalAmount')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {analyticsView === 'ytd' ? t('expenseTracker.monthlyAverage') : t('expenseTracker.total')} {getCategorySortIndicator('totalAmount')}
                    </th>
                    <th 
                      onClick={() => requestCategorySort('percentage')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {t('expenseTracker.percentOfTotal')} {getCategorySortIndicator('percentage')}
                    </th>
                    <th 
                      onClick={() => requestCategorySort('budgeted')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {t('expenseTracker.budget')} {getCategorySortIndicator('budgeted')}
                    </th>
                    <th 
                      onClick={() => requestCategorySort('remaining')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {t('expenseTracker.remaining')} {getCategorySortIndicator('remaining')}
                    </th>
                    <th 
                      onClick={() => requestCategorySort('transactionCount')}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      title={t('expenseTracker.clickToSort')}
                    >
                      {t('expenseTracker.transactions')} {getCategorySortIndicator('transactionCount')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCategoryBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-state">{t('expenseTracker.noExpensesForPeriod')}</td>
                    </tr>
                  ) : (
                    sortedCategoryBreakdown.map(item => {
                      const categoryInfo = getCategoryInfo(item.category, data.customCategories);
                      return (
                        <tr key={item.category}>
                          <td>
                            {categoryInfo.isCustom && categoryInfo.color && (
                              <span className="custom-category-color" style={{ backgroundColor: categoryInfo.color }} />
                            )}
                            <span className="category-icon" aria-hidden="true">
                              <MaterialIcon name={categoryInfo.icon} size="small" />
                            </span>
                            {categoryInfo.name}
                          </td>
                          <td>{formatCurrency(item.totalAmount, data.currency)}</td>
                          <td>{formatDisplayPercent(item.percentage)}</td>
                          <td>{item.budgeted ? formatCurrency(item.budgeted, data.currency) : '-'}</td>
                          <td className={item.remaining !== undefined ? (item.remaining >= 0 ? 'positive' : 'negative') : ''}>
                            {item.remaining !== undefined ? formatCurrency(item.remaining, data.currency) : '-'}
                          </td>
                          <td>{item.transactionCount}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Income Form Dialog */}
        {showIncomeForm && (
          <TransactionFormDialog
            type="income"
            onSubmit={handleAddIncome}
            onClose={() => setShowIncomeForm(false)}
            currency={data.currency}
            defaultDate={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`}
            searchThreshold={searchThreshold}
          />
        )}

        {/* PDF Import Dialog (experimental) */}
        {showPdfImport && pdfImportEnabled && (
          <PDFImportDialog
            onClose={() => setShowPdfImport(false)}
            onAddIncome={handleAddIncome}
            onAddExpense={handleAddExpense}
            defaultCurrency={data.currency}
            customCategories={data.customCategories}
            categoryOverrides={data.categoryOverrides}
            llmConfig={llmConfig}
          />
        )}

        {/* Expense Form Dialog */}
        {showExpenseForm && (
          <TransactionFormDialog
            type="expense"
            onSubmit={handleAddExpense}
            onClose={() => setShowExpenseForm(false)}
            currency={data.currency}
            defaultDate={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`}
            customCategories={data.customCategories}
            searchThreshold={searchThreshold}
          />
        )}

        {/* Edit Transaction Dialog */}
        {editingTransaction && (
          <TransactionFormDialog
            type={editingTransaction.type}
            initialData={editingTransaction}
            onSubmit={(formData) => {
              if (editingTransaction.type === 'income') {
                handleUpdateIncome(editingTransaction.id, formData as Partial<IncomeEntry>);
              } else {
                handleUpdateExpense(editingTransaction.id, formData as Partial<ExpenseEntry>);
              }
            }}
            onClose={() => setEditingTransaction(null)}
            currency={data.currency}
            customCategories={data.customCategories}
            searchThreshold={searchThreshold}
          />
        )}

        {/* Category Manager Dialog */}
        {showCategoryManager && (
          <CategoryManagerDialog
            customCategories={data.customCategories || []}
            categoryOverrides={data.categoryOverrides || []}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onUpdateBuiltInCategory={handleUpdateBuiltInCategory}
            onClose={() => setShowCategoryManager(false)}
            getExpenseCountForCategory={getExpenseCountForCategory}
          />
        )}

        <ScrollToTopButton />
      </main>
    </div>
  );
}

// Transaction Form Dialog Component
interface TransactionFormDialogProps {
  type: 'income' | 'expense';
  initialData?: IncomeEntry | ExpenseEntry;
  onSubmit: (data: any) => void;
  onClose: () => void;
  currency: SupportedCurrency;
  defaultDate?: string;
  customCategories?: CustomCategory[];
  searchThreshold?: number;
}

function TransactionFormDialog({
  type,
  initialData,
  onSubmit,
  onClose,
  currency,
  defaultDate,
  customCategories,
  searchThreshold,
}: TransactionFormDialogProps) {
  const { t } = useTranslation();
  const isEditing = !!initialData;
  const today = new Date().toISOString().split('T')[0];
  
  const [date, setDate] = useState(initialData?.date || defaultDate || today);
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [description, setDescription] = useState(initialData?.description || '');
  
  // Income-specific
  const [source, setSource] = useState<IncomeSource>(
    (initialData as IncomeEntry)?.source || 'SALARY'
  );
  
  // Expense-specific (supports both built-in and custom category IDs)
  const [category, setCategory] = useState<ExpenseCategory | string>(
    (initialData as ExpenseEntry)?.category || 'OTHER'
  );
  const [subCategory, setSubCategory] = useState(
    (initialData as ExpenseEntry)?.subCategory || ''
  );
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    (initialData as ExpenseEntry)?.expenseType || 
    getCategoryInfo((initialData as ExpenseEntry)?.category || 'OTHER', customCategories).defaultExpenseType
  );
  
  // Recurring state - common for both income and expense
  const [isRecurring, setIsRecurring] = useState<boolean>(
    initialData?.isRecurring ?? false
  );
  
  // Build category options for SearchableSelect
  const categoryOptions: SelectOption[] = useMemo(() =>
    getAllCategories(customCategories).map(c => ({
      id: c.id,
      label: c.name,
      icon: c.icon,
      isCustom: c.isCustom,
      color: c.color,
    })),
    [customCategories]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert(t('expenseTracker.validation.amountGreaterThanZero'));
      return;
    }

    if (type === 'income') {
      onSubmit({
        date,
        amount: parsedAmount,
        description,
        source,
        currency,
        isRecurring,
      });
    } else {
      onSubmit({
        date,
        amount: parsedAmount,
        description,
        category,
        subCategory: subCategory || undefined,
        expenseType,
        currency,
        isRecurring,
      });
    }
  };

  // Update expense type when category changes (supports both built-in and custom category IDs)
  const handleCategoryChange = (newCategory: ExpenseCategory | string) => {
    setCategory(newCategory);
    setExpenseType(getCategoryInfo(newCategory, customCategories).defaultExpenseType);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{isEditing ? t('common.edit') : t('common.add')} {type === 'income' ? t('expenseTracker.income') : t('expenseTracker.expense')}</h2>
          <button className="dialog-close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-group">
            <label htmlFor="transaction-date">{t('expenseTracker.date')}</label>
            <input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="transaction-amount">{t('expenseTracker.amountWithCurrency', { currency })}</label>
            <input
              id="transaction-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="transaction-description">{t('expenseTracker.description')}</label>
            <input
              id="transaction-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('expenseTracker.descriptionPlaceholder')}
              required
            />
          </div>
          
          {type === 'income' ? (
            <div className="form-group">
              <label htmlFor="income-source">{t('expenseTracker.source')}</label>
              <SearchableSelect
                options={INCOME_SOURCES.map(s => ({ id: s.id, label: s.name, icon: s.icon }))}
                value={source}
                onChange={(val) => setSource(val as IncomeSource)}
                searchThreshold={searchThreshold}
                ariaLabel={t('expenseTracker.incomeSource')}
                renderOption={(option) => (
                  <>
                    {option.icon && <MaterialIcon name={option.icon} size="small" />}
                    <span>{option.label}</span>
                  </>
                )}
                renderValue={(option) => option ? (
                  <>
                    {option.icon && <MaterialIcon name={option.icon} size="small" />}
                    <span>{option.label}</span>
                  </>
                ) : t('expenseTracker.selectSource')}
              />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="expense-category">{t('expenseTracker.category')}</label>
                <SearchableSelect
                  options={categoryOptions}
                  value={category}
                  onChange={(id) => handleCategoryChange(id)}
                  searchThreshold={searchThreshold}
                  ariaLabel={t('expenseTracker.expenseCategory')}
                  renderValue={(option) => option ? (
                    <>
                      <MaterialIcon name={option.icon || 'category'} size="small" />
                      <span>{option.label}</span>
                    </>
                  ) : t('expenseTracker.selectCategory')}
                  renderOption={(option) => (
                    <>
                      {option.isCustom && option.color && (
                        <span className="custom-category-indicator" style={{ backgroundColor: option.color }} />
                      )}
                      <MaterialIcon name={option.icon || 'category'} size="small" />
                      <span>{option.label}</span>
                    </>
                  )}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="expense-subcategory">{t('expenseTracker.subcategoryOptional')}</label>
                <input
                  id="expense-subcategory"
                  type="text"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  placeholder={t('expenseTracker.subcategoryPlaceholder')}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="expense-type">{t('expenseTracker.type')}</label>
                <select
                  id="expense-type"
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value as ExpenseType)}
                >
                  <option value="NEED">{t('expenseTracker.needEssential')}</option>
                  <option value="WANT">{t('expenseTracker.wantNonEssential')}</option>
                </select>
              </div>
            </>
          )}
          
          {/* Recurring toggle - applies to both income and expense */}
          <div className="form-group form-group-checkbox">
            <label className="toggle-switch-label">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span className="toggle-switch"></span>
              <MaterialIcon name="autorenew" size="small" />
              <span>{t('expenseTracker.recurringTransaction')}</span>
            </label>
            <span className="checkbox-hint">
              {t('expenseTracker.recurringHint')}
            </span>
          </div>
          
          <div className="dialog-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-submit">
              {isEditing ? t('common.update') : t('common.add')} {type === 'income' ? t('expenseTracker.income') : t('expenseTracker.expense')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
