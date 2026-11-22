import type { Asset } from '../../src/types/assetAllocation';
import type { CalculatorInputs } from '../../src/types/calculator';
import type { ExpenseTrackerData } from '../../src/types/expenseTracker';
import type { NetWorthTrackerData } from '../../src/types/netWorthTracker';
import type { AssetAllocationDoc } from '../../src/utils/backendSync/adapters/assetAllocation';
import type { SyncedSettings } from '../../src/utils/cookieSettings';
import { DEFAULT_SETTINGS } from '../../src/utils/cookieSettings';
import { DEFAULT_INPUTS } from '../../src/utils/defaults';

/** Synthetic fixtures with every optional field populated. */

export const syncedSettingsFixture = (): SyncedSettings => ({
  accountName: 'Synthetic Household',
  decimalSeparator: ',',
  decimalPlaces: 1,
  currencySettings: {
    ...DEFAULT_SETTINGS.currencySettings,
    defaultCurrency: 'CHF',
    fallbackRates: { ...DEFAULT_SETTINGS.currencySettings.fallbackRates, USD: 1.11 },
  },
  privacyMode: true,
  country: 'CH',
  dateFormat: 'YYYY-MM-DD',
  fireAssetClassInclusion: { ...DEFAULT_SETTINGS.fireAssetClassInclusion, CRYPTO: true, ART: true },
  includePrimaryResidenceInFIRE: false,
  searchThreshold: 12,
  experimentalFeatures: { portfolioBreakdown: true, pdfImport: true },
  aiFeaturesEnabled: false,
  language: 'it',
});

export const calculatorFixture = (): CalculatorInputs => ({
  ...DEFAULT_INPUTS,
  initialSavings: 123456,
  stocksPercent: 80,
  bondsPercent: 15,
  cashPercent: 5,
  fireType: 'barista',
  leanExpenseMultiplier: 0.6,
  fatExpenseMultiplier: 2.5,
  baristaAnnualIncome: 18000,
  coastTargetAge: 58,
  yearOfBirth: 1985,
  maxAge: 95,
  useAssetAllocationValue: true,
  useExpenseTrackerExpenses: true,
  useExpenseTrackerIncome: true,
});

const fullAsset = (id: string, name: string): Asset => ({
  id,
  name,
  ticker: `${id.toUpperCase()}X`,
  isin: 'IE00SYNTH0001',
  assetClass: 'REAL_ESTATE',
  subAssetType: 'PROPERTY',
  currentValue: 250000,
  shares: 1,
  pricePerShare: 250000,
  acquisitionPrice: 200000,
  originalCurrency: 'USD',
  originalValue: 270000,
  targetMode: 'SET',
  targetValue: 240000,
  targetPercent: 30,
  institutionCode: 'OTHER',
  institutionName: 'Synthetic Bank',
  mortgageData: {
    principalAmount: 180000,
    currentBalance: 150000,
    interestRate: 2.5,
    termYears: 25,
    remainingYears: 20,
    monthlyPayment: 800,
    startDate: '2020-01-15',
    propertyValue: 250000,
    lender: 'Synthetic Lender',
  },
  isPrimaryResidence: true,
  marketPrice: 251000,
});

const withoutPrimaryResidence = (asset: Asset): Asset => {
  const { isPrimaryResidence: _ignored, ...rest } = asset;
  return rest;
};

export const assetAllocationFixture = (): AssetAllocationDoc => ({
  assets: [fullAsset('home-1', 'Synthetic Flat'), withoutPrimaryResidence(fullAsset('home-2', 'Synthetic Cabin'))],
  assetClassTargets: {
    STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 55 },
    BONDS: { targetMode: 'PERCENTAGE', targetPercent: 35 },
    CASH: { targetMode: 'SET' },
    CRYPTO: { targetMode: 'PERCENTAGE', targetPercent: 10 },
    REAL_ESTATE: { targetMode: 'OFF' },
    COMMODITIES: { targetMode: 'OFF' },
    VEHICLE: { targetMode: 'OFF' },
    COLLECTIBLE: { targetMode: 'OFF' },
    ART: { targetMode: 'OFF' },
  },
});

export const expenseTrackerFixture = (): ExpenseTrackerData => ({
  years: [
    {
      year: 2024,
      isArchived: true,
      months: [
        {
          year: 2024,
          month: 12,
          isClosed: true,
          incomes: [],
          expenses: [{ id: 'exp-2024-1', type: 'expense', date: '2024-12-05', amount: 30, description: 'Synthetic gift', category: 'GIFTS_DONATIONS', expenseType: 'WANT' }],
          budgets: [],
        },
      ],
    },
    {
      year: 2025,
      months: [
        {
          year: 2025,
          month: 3,
          incomes: [
            {
              id: 'inc-1', type: 'income', date: '2025-03-01', amount: 4200, description: 'Synthetic salary', source: 'SALARY',
              currency: 'EUR', scheduleId: 'sched-income', scheduledDate: '2025-03-01',
            },
          ],
          expenses: [
            {
              id: 'exp-1', type: 'expense', date: '2025-03-02', amount: 45, description: 'Synthetic gym x3', category: 'HEALTHCARE',
              subCategory: 'Gym', expenseType: 'WANT', currency: 'EUR', scheduleId: 'sched-gym',
              scheduledDate: '2025-03-02', unitAmount: 15, quantity: 3,
            },
            { id: 'exp-2', type: 'expense', date: '2025-03-10', amount: 120.5, description: 'Synthetic groceries', category: 'GROCERIES', expenseType: 'NEED', isRecurring: true },
          ],
          budgets: [
            { category: 'GROCERIES', monthlyBudget: 400, currency: 'EUR' },
            { category: 'custom-hobby', monthlyBudget: 50 },
          ],
        },
      ],
    },
  ],
  currentYear: 2025,
  currentMonth: 3,
  currency: 'EUR',
  globalBudgets: [{ category: 'DINING_OUT', monthlyBudget: 150, currency: 'EUR' }],
  customCategories: [{ id: 'custom-hobby', name: 'Synthetic hobby', icon: 'palette', color: '#65D4C4', defaultExpenseType: 'WANT' }],
  categoryOverrides: [{ id: 'GROCERIES', name: 'Food shop', icon: 'shopping_basket', color: '#9BD7B0' }],
  planning: {
    schemaVersion: 1,
    schedules: [
      {
        id: 'sched-gym', kind: 'expense', name: 'Synthetic gym', amount: 45, currency: 'EUR', startDate: '2025-01-02',
        endDate: '2025-12-02', recurrence: { unit: 'month', interval: 1 }, enabled: true, archived: false,
        category: 'HEALTHCARE', expenseType: 'WANT',
      },
      {
        id: 'sched-income', kind: 'income', name: 'Synthetic salary', amount: 4200, currency: 'EUR', startDate: '2025-01-01',
        recurrence: { unit: 'month', interval: 1 }, enabled: true, archived: false, source: 'SALARY',
      },
    ],
    skippedOccurrences: [{ scheduleId: 'sched-gym', scheduledDate: '2025-02-02' }],
    goals: [{ id: 'goal-1', name: 'Synthetic buffer', currency: 'EUR', targetAmount: 5000, savedAmount: 1200, targetDate: '2026-01-01', archived: false }],
    rules: [{
      id: 'rule-1', kind: 'expense', name: 'Synthetic market', enabled: true, priority: 1,
      match: { description: 'market', operator: 'contains', currency: 'EUR', minAmount: 1, maxAmount: 500 },
      category: 'GROCERIES', expenseType: 'NEED',
    }],
    forecast: { openingBalance: 2500, startDate: '2025-03-01', horizon: 90, currency: 'EUR' },
  },
});

export const netWorthFixture = (): NetWorthTrackerData => ({
  years: [
    {
      year: 2025,
      months: [
        {
          year: 2025,
          month: 2,
          assets: [
            {
              id: 'nw-asset-car', ticker: 'CAR', name: 'Synthetic car', shares: 1, pricePerShare: 15000, acquisitionPrice: 22000,
              currency: 'EUR', assetClass: 'VEHICLE', note: 'Synthetic note',
              vehicleDepreciation: {
                method: 'DECLINING_BALANCE', purchasePrice: 22000, purchaseDate: '2022-05-01', salvageValue: 3000,
                usefulLifeYears: 10, currentDepreciation: 7000, annualDepreciationRate: 15,
              },
              targetMode: 'OFF', targetPercent: 0, targetValue: 0, syncAssetClass: 'VEHICLE', syncSubAssetType: 'CAR',
              isin: 'XS0000SYNTH',
            },
            {
              id: 'nw-asset-home', ticker: 'HOME', name: 'Synthetic home', shares: 1, pricePerShare: 300000, acquisitionPrice: 280000, currency: 'EUR',
              assetClass: 'REAL_ESTATE', isPrimaryResidence: true,
              mortgageInfo: {
                principalAmount: 200000, currentBalance: 150000, interestRate: 2.1, termYears: 25, remainingYears: 18,
                monthlyPayment: 900, startDate: '2018-04-01', lender: 'Synthetic Lender',
              },
            },
          ],
          cashEntries: [{
            id: 'nw-cash-1', accountName: 'Synthetic savings', accountType: 'SAVINGS', balance: 8000, currency: 'EUR', note: 'Rainy day',
            institutionCode: 'OTHER', institutionName: 'Synthetic Bank', shares: 1, pricePerShare: 8000, targetMode: 'SET',
            targetPercent: 0, targetValue: 8000, syncSubAssetType: 'SAVINGS_ACCOUNT',
          }],
          pensions: [{ id: 'nw-pension-1', name: 'Synthetic pension', currentValue: 42000, currency: 'EUR', pensionType: 'PRIVATE', note: 'Employer match' }],
          operations: [{
            id: 'nw-op-1', date: '2025-02-10', type: 'PURCHASE', description: 'Synthetic ETF buy', amount: 500, currency: 'EUR',
            relatedAssetId: 'nw-asset-home', relatedAccountId: 'nw-cash-1', note: 'Monthly plan',
          }],
          debts: [{
            id: 'nw-debt-1', name: 'Synthetic card', debtType: 'CREDIT_CARD', currentBalance: 600, interestRate: 18.5,
            monthlyPayment: 100, currency: 'EUR', note: 'Pay off', creditor: 'Synthetic Card Co',
          }],
          taxes: [{ id: 'nw-tax-1', name: 'Synthetic tax', taxType: 'INCOME_TAX', amount: 1200, dueDate: '2025-06-30', currency: 'EUR', note: 'Q2', isPaid: false }],
          isFrozen: true,
          frozenDate: '2025-03-01T00:00:00.000Z',
          monthNote: 'Synthetic month note',
        },
      ],
    },
  ],
  currentYear: 2025,
  currentMonth: 2,
  defaultCurrency: 'EUR',
  settings: { showPensionInNetWorth: true, includeUnrealizedGains: false, syncWithAssetAllocation: true },
});
