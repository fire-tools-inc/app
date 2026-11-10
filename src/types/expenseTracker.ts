/**
 * Expense and Income Tracker Types
 */

import { SupportedCurrency } from './currency';
import type { ExpensePlanningData } from './expensePlanning';

// Transaction categories for expenses
export type ExpenseCategory = 
  | 'NO_CATEGORY'
  | 'HOUSING'
  | 'UTILITIES'
  | 'TRANSPORTATION'
  | 'GROCERIES'
  | 'DINING_OUT'
  | 'HEALTHCARE'
  | 'INSURANCE'
  | 'ENTERTAINMENT'
  | 'SHOPPING'
  | 'PERSONAL_CARE'
  | 'EDUCATION'
  | 'DEBT_PAYMENTS'
  | 'BUSINESS'
  | 'FEES'
  | 'LIFESTYLE_LEISURE'
  | 'COLLECTIBLES'
  | 'MUSIC'
  | 'TRAVEL'
  | 'HOLIDAYS'
  | 'GIFTS_DONATIONS'
  | 'SUBSCRIPTIONS'
  | 'OTHER';

// Needs vs Wants classification for 50/30/20 rule
export type ExpenseType = 'NEED' | 'WANT';

// Income source types
export type IncomeSource = 
  | 'SALARY'
  | 'FREELANCE'
  | 'BUSINESS'
  | 'INVESTMENTS'
  | 'RENTAL'
  | 'PENSION'
  | 'SOCIAL_SECURITY'
  | 'BONUS'
  | 'GIFT'
  | 'OTHER';

// Base transaction interface
export interface Transaction {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  amount: number;
  description: string;
  currency?: SupportedCurrency;
  isRecurring?: boolean; // Whether this is a recurring transaction
  scheduleId?: string;
  scheduledDate?: string;
}

// Income entry
export interface IncomeEntry extends Transaction {
  type: 'income';
  source: IncomeSource;
}

// Expense entry
export interface ExpenseEntry extends Transaction {
  type: 'expense';
  category: ExpenseCategory | string; // Supports both built-in and custom category IDs
  subCategory?: string;
  expenseType: ExpenseType; // Need vs Want
}

// Budget for a specific category
export interface CategoryBudget {
  category: ExpenseCategory | string; // Supports both built-in and custom category IDs
  monthlyBudget: number;
  currency?: SupportedCurrency;
}

// Month data container
export interface MonthData {
  year: number;
  month: number; // 1-12
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  budgets: CategoryBudget[];
  isClosed?: boolean; // Month can be marked as closed but still editable
}

// Year data container
export interface YearData {
  year: number;
  months: MonthData[];
  isArchived?: boolean;
}

// Summary statistics
export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsAmount: number;
  savingsRate: number; // As percentage
}

// Category breakdown
export interface CategoryBreakdown {
  category: ExpenseCategory | string; // Supports both built-in and custom category IDs
  totalAmount: number;
  percentage: number;
  budgeted?: number;
  remaining?: number;
  transactionCount: number;
}

// 50/30/20 breakdown
export interface BudgetRuleBreakdown {
  needs: {
    amount: number;
    percentage: number;
    targetPercentage: 50;
    categories: CategoryBreakdown[];
  };
  wants: {
    amount: number;
    percentage: number;
    targetPercentage: 30;
    categories: CategoryBreakdown[];
  };
  savings: {
    amount: number;
    percentage: number;
    targetPercentage: 20;
  };
}

// Time period for aggregations
export type TimePeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

// Period breakdown for tables
export interface PeriodBreakdown {
  period: string; // e.g., "2024-01", "2024-Q1", "2024"
  periodType: TimePeriod;
  categories: CategoryBreakdown[];
  totalExpenses: number;
  totalIncome: number;
}

// Chart data types
export interface MonthlyComparisonData {
  month: string;
  expenses: number;
  income: number;
  average?: number;
}

export interface CategoryTrendData {
  month: string;
  [category: string]: number | string;
}

export interface PieChartData {
  name: string;
  value: number;
  percentage: number;
  color?: string;
}

// Filter and sort options
export type SortField = 'date' | 'amount' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface TransactionFilter {
  startDate?: string;
  endDate?: string;
  filterDate?: string; // Exact date filter (e.g., "2026-01-15")
  category?: ExpenseCategory;
  incomeSource?: IncomeSource;
  expenseType?: ExpenseType;
  transactionType?: 'income' | 'expense'; // Filter by transaction type
  minAmount?: number;
  maxAmount?: number;
  searchTerm?: string;
  isRecurring?: boolean; // Filter for recurring transactions
}

export interface TransactionSort {
  field: SortField;
  direction: SortDirection;
}

// Custom category definition
export interface CustomCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultExpenseType: ExpenseType;
}

// Override for built-in categories (allows customization of default categories)
export interface CategoryOverride {
  id: ExpenseCategory; // ID of the built-in category being overridden
  name?: string; // Custom name (optional)
  icon?: string; // Custom icon (optional)
  color?: string; // Custom color (optional)
}

// Special constant for the "No Category" ID - this category cannot be edited or deleted
export const NO_CATEGORY_ID = 'NO_CATEGORY' as const;

// Main expense tracker state
export interface ExpenseTrackerData {
  years: YearData[];
  currentYear: number;
  currentMonth: number;
  currency: SupportedCurrency;
  globalBudgets: CategoryBudget[]; // Global budgets that apply to all months
  customCategories?: CustomCategory[]; // User-defined custom categories
  categoryOverrides?: CategoryOverride[]; // User customizations of built-in categories
  planning?: ExpensePlanningData;
}

// Category display info (supports both built-in and custom categories)
export interface CategoryInfo {
  id: ExpenseCategory | string;
  name: string;
  icon: string;
  defaultExpenseType: ExpenseType;
  color?: string; // Optional color for custom categories
  isCustom?: boolean; // Flag to indicate if this is a custom category
  isProtected?: boolean; // Flag to indicate if this category cannot be edited or deleted
}

// Default categories configuration
// Note: NO_CATEGORY is first and protected - it cannot be edited or deleted
export const EXPENSE_CATEGORIES: CategoryInfo[] = [
  { id: NO_CATEGORY_ID, name: 'No Category', icon: 'help_outline', defaultExpenseType: 'WANT', isProtected: true },
  { id: 'HOUSING', name: 'Housing', icon: 'home', defaultExpenseType: 'NEED' },
  { id: 'UTILITIES', name: 'Utilities', icon: 'lightbulb', defaultExpenseType: 'NEED' },
  { id: 'TRANSPORTATION', name: 'Transportation', icon: 'directions_car', defaultExpenseType: 'NEED' },
  { id: 'GROCERIES', name: 'Groceries', icon: 'shopping_cart', defaultExpenseType: 'NEED' },
  { id: 'DINING_OUT', name: 'Dining Out', icon: 'restaurant', defaultExpenseType: 'WANT' },
  { id: 'HEALTHCARE', name: 'Healthcare', icon: 'local_hospital', defaultExpenseType: 'NEED' },
  { id: 'INSURANCE', name: 'Insurance', icon: 'security', defaultExpenseType: 'NEED' },
  { id: 'ENTERTAINMENT', name: 'Entertainment', icon: 'movie', defaultExpenseType: 'WANT' },
  { id: 'SHOPPING', name: 'Shopping', icon: 'shopping_bag', defaultExpenseType: 'WANT' },
  { id: 'PERSONAL_CARE', name: 'Personal Care', icon: 'spa', defaultExpenseType: 'WANT' },
  { id: 'EDUCATION', name: 'Education', icon: 'school', defaultExpenseType: 'NEED' },
  { id: 'DEBT_PAYMENTS', name: 'Debt Payments', icon: 'credit_card', defaultExpenseType: 'NEED' },
  { id: 'BUSINESS', name: 'Business', icon: 'work', defaultExpenseType: 'NEED' },
  { id: 'FEES', name: 'Fees', icon: 'receipt_long', defaultExpenseType: 'NEED' },
  { id: 'LIFESTYLE_LEISURE', name: 'Lifestyle & Leisure', icon: 'self_improvement', defaultExpenseType: 'WANT' },
  { id: 'COLLECTIBLES', name: 'Collectibles', icon: 'emoji_events', defaultExpenseType: 'WANT' },
  { id: 'MUSIC', name: 'Music', icon: 'music_note', defaultExpenseType: 'NEED' },
  { id: 'TRAVEL', name: 'Travel', icon: 'flight', defaultExpenseType: 'WANT' },
  { id: 'HOLIDAYS', name: 'Holidays', icon: 'beach_access', defaultExpenseType: 'WANT' },
  { id: 'GIFTS_DONATIONS', name: 'Gifts & Donations', icon: 'redeem', defaultExpenseType: 'WANT' },
  { id: 'SUBSCRIPTIONS', name: 'Subscriptions', icon: 'subscriptions', defaultExpenseType: 'WANT' },
  { id: 'OTHER', name: 'Other', icon: 'inventory_2', defaultExpenseType: 'WANT' },
];

// Income source display info
export interface IncomeSourceInfo {
  id: IncomeSource;
  name: string;
  icon: string;
}

export const INCOME_SOURCES: IncomeSourceInfo[] = [
  { id: 'SALARY', name: 'Salary', icon: 'work' },
  { id: 'FREELANCE', name: 'Freelance', icon: 'computer' },
  { id: 'BUSINESS', name: 'Business', icon: 'business' },
  { id: 'INVESTMENTS', name: 'Investments', icon: 'trending_up' },
  { id: 'RENTAL', name: 'Rental', icon: 'home' },
  { id: 'PENSION', name: 'Pension', icon: 'elderly' },
  { id: 'SOCIAL_SECURITY', name: 'Social Security', icon: 'account_balance' },
  { id: 'BONUS', name: 'Bonus', icon: 'celebration' },
  { id: 'GIFT', name: 'Gift', icon: 'redeem' },
  { id: 'OTHER', name: 'Other', icon: 'attach_money' },
];

// Helper function to convert snake_case icon names to readable labels
export function formatIconLabel(icon: string): string {
  return icon
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Helper function to get category info (supports built-in, custom categories, and overrides)
export function getCategoryInfo(
  category: ExpenseCategory | string, 
  customCategories?: CustomCategory[],
  categoryOverrides?: CategoryOverride[]
): CategoryInfo {
  // First check built-in categories
  const builtIn = EXPENSE_CATEGORIES.find(c => c.id === category);
  if (builtIn) {
    // Check if there's an override for this built-in category
    const override = categoryOverrides?.find(o => o.id === category);
    if (override) {
      return {
        ...builtIn,
        name: override.name || builtIn.name,
        icon: override.icon || builtIn.icon,
        color: override.color,
        isCustom: false,
      };
    }
    return { ...builtIn, isCustom: false };
  }
  
  // Check custom categories if provided
  if (customCategories) {
    const custom = customCategories.find(c => c.id === category);
    if (custom) {
      return {
        id: custom.id,
        name: custom.name,
        icon: custom.icon,
        defaultExpenseType: custom.defaultExpenseType,
        color: custom.color,
        isCustom: true,
      };
    }
  }
  
  // Fall back to "No Category" for unknown categories
  return { ...EXPENSE_CATEGORIES[0], isCustom: false };
}

// Helper function to get all categories (built-in + custom, with overrides applied)
export function getAllCategories(
  customCategories?: CustomCategory[],
  categoryOverrides?: CategoryOverride[]
): CategoryInfo[] {
  const builtInCategories: CategoryInfo[] = EXPENSE_CATEGORIES.map(c => {
    const override = categoryOverrides?.find(o => o.id === c.id);
    return {
      ...c,
      name: override?.name || c.name,
      icon: override?.icon || c.icon,
      color: override?.color,
      isCustom: false,
    };
  });
  
  if (!customCategories || customCategories.length === 0) {
    return builtInCategories;
  }
  
  const customCategoryInfos: CategoryInfo[] = customCategories.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    defaultExpenseType: c.defaultExpenseType,
    color: c.color,
    isCustom: true,
  }));
  
  return [...builtInCategories, ...customCategoryInfos];
}

// Helper function to get icons already in use by categories (considers overrides)
export function getUsedIcons(customCategories?: CustomCategory[], categoryOverrides?: CategoryOverride[]): string[] {
  // Get built-in icons, considering overrides
  const builtInIcons = EXPENSE_CATEGORIES.map(c => {
    const override = categoryOverrides?.find(o => o.id === c.id);
    return override?.icon || c.icon;
  });
  const customIcons = customCategories?.map(c => c.icon) || [];
  return [...builtInIcons, ...customIcons];
}

// Generate unique category ID
export function generateCategoryId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Predefined colors for category selection
export const CATEGORY_COLORS: string[] = [
  '#667eea', // Indigo
  '#764ba2', // Purple
  '#f093fb', // Pink light
  '#f5576c', // Red
  '#4facfe', // Blue
  '#00f2fe', // Cyan
  '#43e97b', // Green
  '#38f9d7', // Teal
  '#fa709a', // Rose
  '#fee140', // Yellow
  '#30cfd0', // Aqua
  '#330867', // Dark purple
  '#a8eb12', // Lime
  '#fccb90', // Peach
  '#d57eeb', // Violet
  '#e0c3fc', // Lavender
  '#8fd3f4', // Sky blue
  '#ff6b6b', // Coral
  '#4ecdc4', // Turquoise
  '#ffe66d', // Sunflower
];

// Available icons for custom categories (common Material Symbols)
export const AVAILABLE_ICONS: string[] = [
  'pets', 'child_care', 'fitness_center', 'sports_soccer', 'sports_basketball',
  'sports_esports', 'palette', 'brush', 'camera_alt', 'phone_iphone',
  'laptop', 'headphones', 'watch', 'print', 'wifi',
  'coffee', 'local_bar', 'cake', 'bakery_dining', 'fastfood',
  'local_pizza', 'icecream', 'local_florist', 'yard', 'park',
  'directions_bike', 'directions_boat', 'directions_bus', 'local_taxi', 'train',
  'local_gas_station', 'local_parking', 'electric_car', 'two_wheeler', 'sailing',
  'sports', 'pool', 'golf_course', 'casino', 'theater_comedy',
  'library_books', 'menu_book', 'newspaper', 'article', 'bookmark',
  'savings', 'account_balance_wallet', 'payments', 'paid', 'price_check',
  'checkroom', 'dry_cleaning', 'iron', 'cleaning_services', 'plumbing',
  'handyman', 'construction', 'architecture', 'engineering', 'design_services',
  'science', 'biotech', 'psychology', 'medication', 'vaccines',
  'local_pharmacy', 'medical_services', 'healing', 'health_and_safety', 'dentistry',
  'volunteer_activism', 'favorite', 'loyalty', 'diamond', 'auto_awesome',
  'star', 'thumb_up', 'emoji_emotions', 'celebration', 'party_mode',
];

// Helper function to get available icons (excluding ones already in use)
export function getAvailableIcons(customCategories?: CustomCategory[], categoryOverrides?: CategoryOverride[]): string[] {
  const usedIcons = getUsedIcons(customCategories, categoryOverrides);
  return AVAILABLE_ICONS.filter(icon => !usedIcons.includes(icon));
}

// Helper function to get income source info
export function getIncomeSourceInfo(source: IncomeSource): IncomeSourceInfo {
  return INCOME_SOURCES.find(s => s.id === source) || INCOME_SOURCES[INCOME_SOURCES.length - 1];
}

// Helper to format month key (for storage/lookup)
export function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Helper to parse month key
export function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

// Helper to get current month key
export function getCurrentMonthKey(): string {
  const now = new Date();
  return getMonthKey(now.getFullYear(), now.getMonth() + 1);
}

// Default empty month data
export function createEmptyMonthData(year: number, month: number): MonthData {
  return {
    year,
    month,
    incomes: [],
    expenses: [],
    budgets: [],
    isClosed: false,
  };
}

// Default empty year data
export function createEmptyYearData(year: number): YearData {
  return {
    year,
    months: [],
    isArchived: false,
  };
}

// Generate unique ID
export function generateTransactionId(): string {
  return `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
