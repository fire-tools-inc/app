/** Synthetic, renderer-shaped documents for the /state routes. */

type Doc = Record<string, unknown>;
type Item = Record<string, unknown>;

export const settingsDoc = {
  accountName: 'Synthetic Portfolio',
  decimalSeparator: ',',
  decimalPlaces: 3,
  currencySettings: {
    defaultCurrency: 'CHF',
    fallbackRates: { USD: 0.91, GBP: 1.17, EUR: 0.96 },
    useApiRates: false,
    lastApiUpdate: '2025-02-01T10:00:00.000Z',
  },
  privacyMode: true,
  country: 'CH',
  dateFormat: 'YYYY-MM-DD',
  fireAssetClassInclusion: {
    STOCKS: true, BONDS: true, CASH: false, CRYPTO: true, REAL_ESTATE: false,
    COMMODITIES: true, VEHICLE: false, COLLECTIBLE: false, ART: false,
  },
  includePrimaryResidenceInFIRE: false,
  searchThreshold: 12,
  experimentalFeatures: { portfolioBreakdown: true, pdfImport: false },
  aiFeaturesEnabled: false,
  language: 'it',
};

export const calculatorDoc = {
  initialSavings: 85000,
  stocksPercent: 70,
  bondsPercent: 20,
  cashPercent: 10,
  currentAnnualExpenses: 32000,
  fireAnnualExpenses: 30000,
  annualLaborIncome: 68000,
  laborIncomeGrowthRate: 2.5,
  savingsRate: 35,
  desiredWithdrawalRate: 3.5,
  yearsOfExpenses: 28.5,
  fireType: 'coast',
  leanExpenseMultiplier: 0.65,
  fatExpenseMultiplier: 1.8,
  baristaAnnualIncome: 18000,
  coastTargetAge: 58,
  expectedStockReturn: 6.5,
  expectedBondReturn: 2.5,
  expectedCashReturn: -1.5,
  yearOfBirth: 1988,
  retirementAge: 62,
  statePensionIncome: 9000,
  privatePensionIncome: 4000,
  otherIncome: 1200,
  stopWorkingAtFIRE: true,
  maxAge: 95,
  useAssetAllocationValue: true,
  useExpenseTrackerExpenses: true,
  useExpenseTrackerIncome: false,
};

export const assetAllocationDoc = {
  assets: [
    {
      id: 'asset-world', name: 'Synthetic World ETF', ticker: 'SWLD', isin: 'IE00SYNTH0001',
      assetClass: 'STOCKS', subAssetType: 'ETF', currentValue: 24000, shares: 200, pricePerShare: 120,
      acquisitionPrice: 95.5, originalCurrency: 'USD', originalValue: 26000, targetMode: 'PERCENTAGE',
      targetValue: 20000, targetPercent: 80, institutionCode: 'SYNTH_BROKER', institutionName: 'Synthetic Broker',
      isPrimaryResidence: false, marketPrice: 121.4,
    },
    {
      id: 'asset-home', name: 'Synthetic Flat', ticker: '', assetClass: 'REAL_ESTATE', subAssetType: 'PROPERTY',
      currentValue: 300000, targetMode: 'OFF', isPrimaryResidence: true,
      mortgageData: {
        principalAmount: 250000, currentBalance: 180000, interestRate: 2.1, termYears: 25, remainingYears: 18,
        monthlyPayment: 1050, startDate: '2018-04-01', propertyValue: 320000, lender: 'Synthetic Bank',
      },
    },
    {
      id: 'asset-cash', name: 'Synthetic Savings', ticker: '', assetClass: 'CASH', subAssetType: 'SAVINGS_ACCOUNT',
      currentValue: 8000, targetMode: 'SET', targetValue: 8000, isPrimaryResidence: false,
    },
  ],
  assetClassTargets: {
    STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 80 },
    BONDS: { targetMode: 'PERCENTAGE', targetPercent: 20 },
    CASH: { targetMode: 'SET' },
    REAL_ESTATE: { targetMode: 'OFF' },
  },
};

const expense = (id: string, date: string, amount: number, extra: Item = {}): Item => ({
  id, type: 'expense', date, amount, description: `Synthetic ${id}`, category: 'GROCERIES', expenseType: 'NEED',
  isRecurring: false, ...extra,
});
const income = (id: string, date: string, amount: number, extra: Item = {}): Item => ({
  id, type: 'income', date, amount, description: `Synthetic ${id}`, source: 'SALARY', isRecurring: false, ...extra,
});

export const expenseTrackerDoc = {
  years: [
    {
      year: 2024, isArchived: true,
      months: [{
        year: 2024, month: 12, isClosed: true,
        incomes: [income('inc-dec', '2024-12-20', 3300)],
        expenses: [expense('exp-dec-gift', '2024-12-18', 120, { category: 'GIFTS_DONATIONS', expenseType: 'WANT' })],
        budgets: [{ category: 'GIFTS_DONATIONS', monthlyBudget: 200, currency: 'EUR' }],
      }],
    },
    {
      year: 2025, isArchived: false,
      months: [
        {
          year: 2025, month: 1, isClosed: true,
          incomes: [
            income('inc-salary', '2025-01-27', 3500, { currency: 'EUR', isRecurring: true }),
            income('inc-bonus', '2025-01-30', 800, { source: 'BONUS', scheduleId: 'sched-bonus', scheduledDate: '2025-01-30' }),
          ],
          expenses: [
            expense('exp-rent', '2025-01-01', 1200, {
              currency: 'EUR', category: 'HOUSING', subCategory: 'Rent', scheduleId: 'sched-rent', scheduledDate: '2025-01-01',
            }),
            expense('exp-coffee', '2025-01-05', 7.5, {
              category: 'DINING_OUT', expenseType: 'WANT', unitAmount: 2.5, quantity: 3, isRecurring: true,
            }),
            expense('exp-vet', '2025-01-09', 60, { category: 'custom-pets' }),
          ],
          budgets: [
            { category: 'HOUSING', monthlyBudget: 1200, currency: 'EUR' },
            { category: 'DINING_OUT', monthlyBudget: 150 },
          ],
        },
        { year: 2025, month: 3, isClosed: false, incomes: [], expenses: [], budgets: [] },
      ],
    },
  ],
  currentYear: 2025,
  currentMonth: 3,
  currency: 'EUR',
  globalBudgets: [
    { category: 'GROCERIES', monthlyBudget: 400, currency: 'EUR' },
    { category: 'custom-pets', monthlyBudget: 80 },
  ],
  customCategories: [{ id: 'custom-pets', name: 'Pets', icon: 'pets', color: '#88aa77', defaultExpenseType: 'NEED' }],
  categoryOverrides: [{ id: 'DINING_OUT', name: 'Eating out', icon: 'restaurant_menu', color: '#cc8844' }],
  planning: {
    schemaVersion: 1,
    schedules: [{
      id: 'sched-rent', kind: 'expense', name: 'Rent', amount: 1200, currency: 'EUR', startDate: '2025-01-01',
      endDate: '2025-12-31', recurrence: { unit: 'month', interval: 1 }, enabled: true, archived: false,
      category: 'HOUSING', expenseType: 'NEED',
    }],
    skippedOccurrences: [{ scheduleId: 'sched-rent', scheduledDate: '2025-02-01' }],
    goals: [{
      id: 'goal-buffer', name: 'Buffer', currency: 'EUR', targetAmount: 10000, savedAmount: 2500,
      targetDate: '2026-06-30', archived: false,
    }],
    rules: [{
      id: 'rule-coffee', name: 'Coffee', enabled: true, priority: 0,
      match: { description: 'coffee', operator: 'contains', currency: 'EUR', minAmount: 1, maxAmount: 10 },
      kind: 'expense', category: 'DINING_OUT', expenseType: 'WANT',
    }],
    forecast: { openingBalance: 3000, startDate: '2025-03-01', horizon: 90, currency: 'EUR' },
  },
};

export const netWorthDoc = {
  years: [{
    year: 2025, isArchived: false,
    months: [
      {
        year: 2025, month: 1,
        assets: [
          {
            id: 'nw-etf', ticker: 'SWLD', name: 'Synthetic World ETF', shares: 10, pricePerShare: 100,
            acquisitionPrice: 90, currency: 'EUR', assetClass: 'ETF', note: 'Core holding', targetMode: 'PERCENTAGE',
            targetPercent: 60, targetValue: 6000, syncAssetClass: 'STOCKS', syncSubAssetType: 'ETF',
            isin: 'IE00SYNTH0001', isPrimaryResidence: false,
          },
          {
            id: 'nw-car', ticker: 'CAR', name: 'Synthetic Car', shares: 1, pricePerShare: 9000, currency: 'EUR',
            assetClass: 'VEHICLE', isPrimaryResidence: false,
            vehicleDepreciation: {
              method: 'DECLINING_BALANCE', purchasePrice: 15000, purchaseDate: '2022-05-01', salvageValue: 2000,
              usefulLifeYears: 10, currentDepreciation: 6000, annualDepreciationRate: 15,
            },
          },
          {
            id: 'nw-home', ticker: 'HOME', name: 'Synthetic Flat', shares: 1, pricePerShare: 300000, currency: 'EUR',
            assetClass: 'REAL_ESTATE', isPrimaryResidence: true,
            mortgageInfo: {
              principalAmount: 250000, currentBalance: 180000, interestRate: 2.1, termYears: 25, remainingYears: 18,
              monthlyPayment: 1050, startDate: '2018-04-01', lender: 'Synthetic Bank',
            },
          },
        ],
        cashEntries: [{
          id: 'nw-cash', accountName: 'Synthetic Savings', accountType: 'SAVINGS', balance: 5000, currency: 'EUR',
          note: 'Emergency', institutionCode: 'SYNTH_BANK', institutionName: 'Synthetic Bank', shares: 1,
          pricePerShare: 5000, targetMode: 'SET', targetPercent: 10, targetValue: 5000, syncSubAssetType: 'SAVINGS_ACCOUNT',
        }],
        pensions: [{
          id: 'nw-pension', name: 'Synthetic Pension', currentValue: 42000, currency: 'EUR', pensionType: 'PRIVATE',
          note: 'Pillar 3a',
        }],
        operations: [{
          id: 'nw-op', date: '2025-01-15', type: 'PURCHASE', description: 'Bought ETF', amount: 1000, currency: 'EUR',
          relatedAssetId: 'nw-etf', relatedAccountId: 'nw-cash', note: 'Monthly plan',
        }],
        debts: [{
          id: 'nw-loan', name: 'Synthetic Car Loan', debtType: 'CAR_LOAN', currentBalance: 4000, interestRate: 4.5,
          monthlyPayment: 250, currency: 'EUR', note: 'Ends 2026', creditor: 'Synthetic Lender',
        }],
        taxes: [{
          id: 'nw-tax', name: 'Synthetic Income Tax', taxType: 'INCOME_TAX', amount: 2500, dueDate: '2025-06-30',
          currency: 'EUR', note: 'Provisional', isPaid: false,
        }],
        isFrozen: true,
        frozenDate: '2025-02-01T00:00:00.000Z',
        monthNote: 'Synthetic month note',
      },
      {
        year: 2025, month: 2, assets: [], cashEntries: [], pensions: [], operations: [], debts: [], taxes: [],
        isFrozen: false,
      },
    ],
  }],
  currentYear: 2025,
  currentMonth: 2,
  defaultCurrency: 'EUR',
  settings: { showPensionInNetWorth: false, includeUnrealizedGains: false, syncWithAssetAllocation: true },
};

export const documents = {
  settings: settingsDoc,
  calculator: calculatorDoc,
  assetAllocation: assetAllocationDoc,
  expenseTracker: expenseTrackerDoc,
  netWorth: netWorthDoc,
} as const;

export type DomainName = keyof typeof documents;

const positioned = (items: Item[], parent: Item = {}): Item[] =>
  items.map((item, position) => ({ ...item, ...parent, position }));

/**
 * Converts a renderer document into a Changeset. Leaf entities are sent in
 * reverse order so the stored order can only come from their positions.
 */
export const toChangeset = (domain: DomainName, doc: Doc): Doc => {
  if (domain === 'settings') return { initialize: true, set: { settings: doc } };
  if (domain === 'calculator') return { initialize: true, set: { inputs: doc } };
  if (domain === 'assetAllocation') {
    return {
      initialize: true,
      set: { assetClassTargets: doc.assetClassTargets },
      upsert: { assets: positioned(doc.assets as Item[]).reverse() },
    };
  }
  const years = doc.years as Array<Item & { months: Item[] }>;
  const months = years.flatMap(year => year.months);
  const leaves = (field: string) => months
    .flatMap(month => positioned(month[field] as Item[], { year: month.year, month: month.month }))
    .reverse();
  const yearEntities = years.map(({ year, isArchived }) => ({ year, isArchived }));
  if (domain === 'expenseTracker') {
    return {
      initialize: true,
      set: {
        config: { currency: doc.currency, currentYear: doc.currentYear, currentMonth: doc.currentMonth },
        planning: doc.planning ?? null,
      },
      upsert: {
        years: yearEntities,
        months: months.map(({ year, month, isClosed }) => ({ year, month, isClosed })),
        expenses: leaves('expenses'),
        incomes: leaves('incomes'),
        monthBudgets: leaves('budgets'),
        globalBudgets: positioned(doc.globalBudgets as Item[]).reverse(),
        customCategories: positioned((doc.customCategories ?? []) as Item[]).reverse(),
        categoryOverrides: positioned((doc.categoryOverrides ?? []) as Item[]).reverse(),
      },
    };
  }
  return {
    initialize: true,
    set: {
      config: {
        defaultCurrency: doc.defaultCurrency, currentYear: doc.currentYear, currentMonth: doc.currentMonth,
        settings: doc.settings,
      },
    },
    upsert: {
      years: yearEntities,
      months: months.map(({ year, month, isFrozen, frozenDate, monthNote }) => ({ year, month, isFrozen, frozenDate, monthNote })),
      assets: leaves('assets'),
      cashEntries: leaves('cashEntries'),
      pensions: leaves('pensions'),
      debts: leaves('debts'),
      taxes: leaves('taxes'),
      operations: leaves('operations'),
    },
  };
};
