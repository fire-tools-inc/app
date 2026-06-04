import { CalculatorInputs } from '../types/calculator';
import { 
  NetWorthTrackerData, 
  AssetHolding, 
  CashEntry, 
  PensionEntry, 
  FinancialOperation,
  MonthlySnapshot 
} from '../types/netWorthTracker';
import { ExpenseTrackerData } from '../types/expenseTracker';
import { Asset, AssetClass, AllocationMode, SubAssetType } from '../types/assetAllocation';
import { SupportedCurrency } from '../types/currency';

// Calculate default savings rate: (income - expenses) / income * 100
const defaultIncome = 60000;
const defaultExpenses = 40000;
const defaultSavingsRate = ((defaultIncome - defaultExpenses) / defaultIncome) * 100;

// Default years of expenses for FIRE target (equivalent to 3% withdrawal rate)
const defaultYearsOfExpenses = 100 / 3; // ~33.33 years

export const DEFAULT_INPUTS: CalculatorInputs = {
  initialSavings: 70000, // Consistent with Asset Allocation demo (~€70k portfolio)
  stocksPercent: 70,
  bondsPercent: 20,
  cashPercent: 10,
  currentAnnualExpenses: defaultExpenses,
  fireAnnualExpenses: 40000,
  annualLaborIncome: defaultIncome,
  laborIncomeGrowthRate: 3,
  savingsRate: defaultSavingsRate,
  desiredWithdrawalRate: 3,
  yearsOfExpenses: defaultYearsOfExpenses,
  fireType: 'standard',
  leanExpenseMultiplier: 0.7,
  fatExpenseMultiplier: 2.0,
  baristaAnnualIncome: 20000,
  coastTargetAge: 65,
  expectedStockReturn: 7,
  expectedBondReturn: 2,
  expectedCashReturn: -2,
  yearOfBirth: 1990,
  retirementAge: 67,
  statePensionIncome: 0,
  privatePensionIncome: 0,
  otherIncome: 0,
  stopWorkingAtFIRE: true,
  maxAge: 100,
  useAssetAllocationValue: false,
  useExpenseTrackerExpenses: false,
  useExpenseTrackerIncome: false,
};

// Base values coherent with Asset Allocation demo data  
// Total portfolio: €70,000 (€65,000 non-cash + €5,000 cash)
// Stocks: €35,000 (40/30/15/10/5%), Bonds: €30,000 (50/25/25%), Cash: €5,000
const NET_WORTH_DEMO_BASE = {
  // STOCKS - €35,000 total with 40/30/15/10/5% distribution
  // SPY: 23.921 shares @ €585.21 = €14,000 (40%)
  spyShares: 23.921,
  spyPrice: 585.21,
  // VTI: 44.019 shares @ €238.54 = €10,500 (30%)
  vtiShares: 44.019,
  vtiPrice: 238.54,
  // VXUS: 84.067 shares @ €62.45 = €5,250 (15%)
  vxusShares: 84.067,
  vxusPrice: 62.45,
  // VWO: 82.977 shares @ €42.18 = €3,500 (10%)
  vwoShares: 82.977,
  vwoPrice: 42.18,
  // VBR: 10.352 shares @ €169.08 = €1,750 (5%)
  vbrShares: 10.352,
  vbrPrice: 169.08,
  // BONDS - €30,000 total with 50/25/25% distribution
  // BND: 238.314 shares @ €62.94 = €15,000 (50%)
  bndShares: 238.314,
  bndPrice: 62.94,
  // TIP: 81.257 shares @ €92.30 = €7,500 (25%)
  tipShares: 81.257,
  tipPrice: 92.30,
  // BNDX: 181.936 shares @ €41.23 = €7,500 (25%)
  bndxShares: 181.936,
  bndxPrice: 41.23,
  // Cash totals: €5,000 (€3,500 + €1,500)
  emergencyFund: 3500,
  checking: 1500,
};

// Seeded random for consistent demo data (using seed value)
function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return min + (x - Math.floor(x)) * (max - min);
}

/**
 * Generate demo net worth data for a specific year
 * @param targetYear - The year to generate demo data for
 * @param previousYearEndData - Optional: Last month data from previous year for year-over-year progression
 * @returns Array of MonthlySnapshot for all 12 months
 */
export function generateDemoNetWorthDataForYear(targetYear: number, previousYearEndData?: MonthlySnapshot): MonthlySnapshot[] {
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const currentYear = new Date().getFullYear();
  
  // If we have previous year data, use it as the starting point with annual growth
  let baseData = previousYearEndData ? {
    // Apply ~7% annual growth to stock prices from previous year end
    spyShares: previousYearEndData.assets.find(a => a.ticker === 'SPY')?.shares || NET_WORTH_DEMO_BASE.spyShares,
    spyPrice: (previousYearEndData.assets.find(a => a.ticker === 'SPY')?.pricePerShare || NET_WORTH_DEMO_BASE.spyPrice) * 1.07,
    vtiShares: previousYearEndData.assets.find(a => a.ticker === 'VTI')?.shares || NET_WORTH_DEMO_BASE.vtiShares,
    vtiPrice: (previousYearEndData.assets.find(a => a.ticker === 'VTI')?.pricePerShare || NET_WORTH_DEMO_BASE.vtiPrice) * 1.07,
    vxusShares: previousYearEndData.assets.find(a => a.ticker === 'VXUS')?.shares || NET_WORTH_DEMO_BASE.vxusShares,
    vxusPrice: (previousYearEndData.assets.find(a => a.ticker === 'VXUS')?.pricePerShare || NET_WORTH_DEMO_BASE.vxusPrice) * 1.05,
    vwoShares: previousYearEndData.assets.find(a => a.ticker === 'VWO')?.shares || NET_WORTH_DEMO_BASE.vwoShares,
    vwoPrice: (previousYearEndData.assets.find(a => a.ticker === 'VWO')?.pricePerShare || NET_WORTH_DEMO_BASE.vwoPrice) * 1.08,
    vbrShares: previousYearEndData.assets.find(a => a.ticker === 'VBR')?.shares || NET_WORTH_DEMO_BASE.vbrShares,
    vbrPrice: (previousYearEndData.assets.find(a => a.ticker === 'VBR')?.pricePerShare || NET_WORTH_DEMO_BASE.vbrPrice) * 1.09,
    // Apply ~2% annual growth to bond prices
    bndShares: previousYearEndData.assets.find(a => a.ticker === 'BND')?.shares || NET_WORTH_DEMO_BASE.bndShares,
    bndPrice: (previousYearEndData.assets.find(a => a.ticker === 'BND')?.pricePerShare || NET_WORTH_DEMO_BASE.bndPrice) * 1.02,
    tipShares: previousYearEndData.assets.find(a => a.ticker === 'TIP')?.shares || NET_WORTH_DEMO_BASE.tipShares,
    tipPrice: (previousYearEndData.assets.find(a => a.ticker === 'TIP')?.pricePerShare || NET_WORTH_DEMO_BASE.tipPrice) * 1.02,
    bndxShares: previousYearEndData.assets.find(a => a.ticker === 'BNDX')?.shares || NET_WORTH_DEMO_BASE.bndxShares,
    bndxPrice: (previousYearEndData.assets.find(a => a.ticker === 'BNDX')?.pricePerShare || NET_WORTH_DEMO_BASE.bndxPrice) * 1.02,
    // Cash grows with savings
    emergencyFund: (previousYearEndData.cashEntries.find((c: CashEntry) => c.accountName === 'Emergency Fund')?.balance || NET_WORTH_DEMO_BASE.emergencyFund) + 2000,
    checking: previousYearEndData.cashEntries.find((c: CashEntry) => c.accountName === 'Main Checking')?.balance || NET_WORTH_DEMO_BASE.checking,
  } : NET_WORTH_DEMO_BASE;
  
  const months: MonthlySnapshot[] = [];
  for (let month = 1; month <= 12; month++) {
    const monthSeed = targetYear * 100 + month;
    
    // SPY (S&P 500) - shares stay relatively stable
    const spyPriceVariation = seededRandom(monthSeed, -0.08, 0.12);
    const spyPrice = Math.round((baseData.spyPrice * (1 + spyPriceVariation + month * 0.005)) * 100) / 100;
    
    // VTI (Total Stock Market) - shares stay relatively stable
    const vtiPriceVariation = seededRandom(monthSeed + 1, -0.08, 0.12);
    const vtiPrice = Math.round((baseData.vtiPrice * (1 + vtiPriceVariation + month * 0.005)) * 100) / 100;
    
    // VXUS (International) - shares stay relatively stable
    const vxusPriceVariation = seededRandom(monthSeed + 2, -0.08, 0.12);
    const vxusPrice = Math.round((baseData.vxusPrice * (1 + vxusPriceVariation + month * 0.005)) * 100) / 100;
    
    // VWO (Emerging Markets) - more volatile
    const vwoPriceVariation = seededRandom(monthSeed + 3, -0.12, 0.15);
    const vwoPrice = Math.round((baseData.vwoPrice * (1 + vwoPriceVariation + month * 0.005)) * 100) / 100;
    
    // VBR (Small Cap) - more volatile
    const vbrPriceVariation = seededRandom(monthSeed + 4, -0.10, 0.13);
    const vbrPrice = Math.round((baseData.vbrPrice * (1 + vbrPriceVariation + month * 0.005)) * 100) / 100;
    
    // BND (Total Bond Market) - less volatile
    const bndPriceVariation = seededRandom(monthSeed + 5, -0.03, 0.03);
    const bndPrice = Math.round((baseData.bndPrice * (1 + bndPriceVariation)) * 100) / 100;
    
    // TIP (Inflation-Protected Bonds) - less volatile
    const tipPriceVariation = seededRandom(monthSeed + 6, -0.03, 0.03);
    const tipPrice = Math.round((baseData.tipPrice * (1 + tipPriceVariation)) * 100) / 100;
    
    // BNDX (International Bonds) - less volatile
    const bndxPriceVariation = seededRandom(monthSeed + 7, -0.03, 0.03);
    const bndxPrice = Math.round((baseData.bndxPrice * (1 + bndxPriceVariation)) * 100) / 100;
    
    // Cash grows with monthly savings, but fluctuates due to expenses
    const emergencyFundGrowth = (month - 1) * 200;
    const emergencyFundVariation = Math.round(seededRandom(monthSeed + 8, -300, 300));
    const checkingVariation = Math.round(seededRandom(monthSeed + 9, -500, 500));
    
    // Only freeze months if target year is current year and month is in the past
    const isFrozen = targetYear === currentYear && month < currentMonth;
    
    const assets: AssetHolding[] = [
      // STOCKS (5 ETFs)
      { 
        id: `demo-asset-${targetYear}-${month}-1`, 
        ticker: 'SPY', 
        name: 'S&P 500 Index', 
        shares: baseData.spyShares, 
        pricePerShare: spyPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'STOCKS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-2`, 
        ticker: 'VTI', 
        name: 'Total Stock Market', 
        shares: baseData.vtiShares, 
        pricePerShare: vtiPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'STOCKS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-3`, 
        ticker: 'VXUS', 
        name: 'Total International Stock', 
        shares: baseData.vxusShares, 
        pricePerShare: vxusPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'STOCKS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-4`, 
        ticker: 'VWO', 
        name: 'Emerging Markets', 
        shares: baseData.vwoShares, 
        pricePerShare: vwoPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'STOCKS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-5`, 
        ticker: 'VBR', 
        name: 'Small Cap Value', 
        shares: baseData.vbrShares, 
        pricePerShare: vbrPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'STOCKS' as const
      },
      // BONDS (3 ETFs)
      { 
        id: `demo-asset-${targetYear}-${month}-6`, 
        ticker: 'BND', 
        name: 'Total Bond Market', 
        shares: baseData.bndShares, 
        pricePerShare: bndPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'BONDS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-7`, 
        ticker: 'TIP', 
        name: 'Inflation-Protected Bonds', 
        shares: baseData.tipShares, 
        pricePerShare: tipPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'BONDS' as const
      },
      { 
        id: `demo-asset-${targetYear}-${month}-8`, 
        ticker: 'BNDX', 
        name: 'International Bond', 
        shares: baseData.bndxShares, 
        pricePerShare: bndxPrice, 
        currency: 'EUR' as SupportedCurrency, 
        assetClass: 'BONDS' as const
      },
    ];
    
    const cashEntries: CashEntry[] = [
      { 
        id: `demo-cash-${targetYear}-${month}-1`, 
        accountName: 'Emergency Fund', 
        accountType: 'SAVINGS' as const, 
        balance: Math.max(2000, baseData.emergencyFund + emergencyFundGrowth + emergencyFundVariation), 
        currency: 'EUR' as SupportedCurrency 
      },
      { 
        id: `demo-cash-${targetYear}-${month}-2`, 
        accountName: 'Main Checking', 
        accountType: 'CHECKING' as const, 
        balance: Math.max(500, baseData.checking + checkingVariation), 
        currency: 'EUR' as SupportedCurrency 
      },
    ];
    
    const pensions: PensionEntry[] = [];
    
    const operations: FinancialOperation[] = month % 3 === 0 ? [
      { id: `demo-op-${targetYear}-${month}-1`, date: `${targetYear}-${String(month).padStart(2, '0')}-15`, type: 'PURCHASE' as const, description: 'Monthly DCA - Various ETFs', amount: 500, currency: 'EUR' as SupportedCurrency },
      { id: `demo-op-${targetYear}-${month}-2`, date: `${targetYear}-${String(month).padStart(2, '0')}-20`, type: 'DIVIDEND' as const, description: 'ETF Dividends', amount: Math.round(seededRandom(monthSeed + 11, 80, 150)), currency: 'EUR' as SupportedCurrency },
    ] : [
      { id: `demo-op-${targetYear}-${month}-1`, date: `${targetYear}-${String(month).padStart(2, '0')}-15`, type: 'PURCHASE' as const, description: 'Monthly DCA - Various ETFs', amount: 500, currency: 'EUR' as SupportedCurrency },
    ];
    
    months.push({
      year: targetYear,
      month,
      assets,
      cashEntries,
      pensions,
      operations,
      debts: [],
      taxes: [],
      isFrozen,
    });
  }
  
  return months;
}

// Demo data for Net Worth Tracker - generates 12 months of data for current year + 12 months of previous year (archived)
export function getDemoNetWorthData(): NetWorthTrackerData {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const prevYear = currentYear - 1;

  // Build last year first, then chain into current year via December snapshot for continuity
  const prevYearMonths = generateDemoNetWorthDataForYear(prevYear);
  const prevDec = prevYearMonths[prevYearMonths.length - 1];
  const months = generateDemoNetWorthDataForYear(currentYear, prevDec);

  return {
    years: [
      {
        year: currentYear,
        months,
        isArchived: false,
      },
      {
        year: prevYear,
        months: prevYearMonths,
        isArchived: true,
      },
    ],
    currentYear,
    currentMonth,
    defaultCurrency: 'EUR',
    settings: {
      showPensionInNetWorth: true,
      includeUnrealizedGains: true,
      syncWithAssetAllocation: true, // Enable sync by default in demo data
    },
  };
}

// Demo data for Cashflow Tracker - 12 months for prior year and 12 months for current year
// with varied incomes (salary, occasional freelance/bonus) and varied expense categories.
// Designed so first month of current year retains salary >= €5,000 to satisfy demo invariants.
export function getDemoCashflowData(): ExpenseTrackerData {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const buildYear = (year: number, isArchived: boolean) => {
    const baseSalary = year === currentYear ? 5200 : 4900;
    const months = [] as ExpenseTrackerData['years'][number]['months'];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const salary = baseSalary + (m - 1) * 8; // tiny monthly drift to look realistic
      const incomes: ExpenseTrackerData['years'][number]['months'][number]['incomes'] = [
        { id: `demo-${year}-inc-sal-${m}`, date: `${year}-${mm}-01`, amount: salary, description: 'Monthly Salary', type: 'income', source: 'SALARY', currency: 'EUR' },
      ];
      // Occasional freelance income (alternating months)
      if (m % 2 === 0) {
        incomes.push({ id: `demo-${year}-inc-frl-${m}`, date: `${year}-${mm}-15`, amount: 250 + (m * 10), description: 'Freelance Work', type: 'income', source: 'FREELANCE', currency: 'EUR' });
      }
      // Annual bonus in December
      if (m === 12) {
        incomes.push({ id: `demo-${year}-inc-bonus`, date: `${year}-12-20`, amount: 2500, description: 'Year-end Bonus', type: 'income', source: 'BONUS', currency: 'EUR' });
      }

      const expenses: ExpenseTrackerData['years'][number]['months'][number]['expenses'] = [
        { id: `demo-${year}-exp-rent-${m}`, date: `${year}-${mm}-01`, amount: 1200, description: 'Rent', type: 'expense', category: 'HOUSING', expenseType: 'NEED', currency: 'EUR' },
        { id: `demo-${year}-exp-gro-${m}`, date: `${year}-${mm}-05`, amount: 320 + ((m * 17) % 90), description: 'Groceries', type: 'expense', category: 'GROCERIES', expenseType: 'NEED', currency: 'EUR' },
        { id: `demo-${year}-exp-util-${m}`, date: `${year}-${mm}-10`, amount: 130 + ((m * 11) % 60), description: 'Utilities', type: 'expense', category: 'UTILITIES', expenseType: 'NEED', currency: 'EUR' },
        { id: `demo-${year}-exp-trn-${m}`, date: `${year}-${mm}-12`, amount: 90 + ((m * 7) % 40), description: 'Transport', type: 'expense', category: 'TRANSPORT', expenseType: 'NEED', currency: 'EUR' },
        { id: `demo-${year}-exp-din-${m}`, date: `${year}-${mm}-18`, amount: 140 + ((m * 13) % 80), description: 'Dining Out', type: 'expense', category: 'DINING_OUT', expenseType: 'WANT', currency: 'EUR' },
        { id: `demo-${year}-exp-ent-${m}`, date: `${year}-${mm}-22`, amount: 60 + ((m * 9) % 50), description: 'Entertainment', type: 'expense', category: 'ENTERTAINMENT', expenseType: 'WANT', currency: 'EUR' },
        { id: `demo-${year}-exp-sub-${m}`, date: `${year}-${mm}-25`, amount: 45, description: 'Streaming Services', type: 'expense', category: 'SUBSCRIPTIONS', expenseType: 'WANT', currency: 'EUR' },
      ];

      months.push({
        year,
        month: m,
        incomes,
        expenses,
        budgets: [],
      });
    }
    return { year, months, isArchived };
  };

  return {
    years: [
      buildYear(prevYear, true),
      buildYear(currentYear, false),
    ],
    currentYear,
    currentMonth: 1,
    currency: 'EUR',
    globalBudgets: [],
  };
}

// Demo data for Asset Allocation - coherent with Net Worth demo data for current month
// Portfolio structure updated to 8 ETFs (5 stocks + 3 bonds + 2 cash)
// - Total: €70,000 (€65,000 non-cash + €5,000 cash)
// - Stocks: €35,000 (50% actual) with 50% target = +€0 delta
// - Bonds: €30,000 (42.86% actual) with 43% target = ±€0 delta (rounded)
// - Cash: €5,000 (7.14% actual) with 7% target = +€0 delta
// Asset class targets are portfolio-wide: Stocks 50%, Bonds 43%, Cash 7%
export function getDemoAssetAllocationData(): { 
  assets: Asset[]; 
  assetClassTargets: Record<AssetClass, { targetMode: AllocationMode; targetPercent?: number }>;
} {
  // Portfolio totals: €70,000 with €35k stocks (5 ETFs), €30k bonds (3 ETFs), €5k cash
  // Using realistic prices and fractional shares for each ETF
  
  // STOCKS: €35,000 total (50% of portfolio)
  // Individual targets add up to 100% within STOCKS class
  
  // SPY (S&P 500): €7,000 (20% of stocks = 40% target × 50% of total)
  // Price: 683.17 USD ≈ 585.21 EUR (at 1.167 USD/EUR)
  // Shares: 7,000 / 585.21 = 11.961 shares
  const spyShares = 11.961;
  const spyPrice = 585.21;
  
  // VTI (Total Stock Market): €7,000 (20% of stocks)
  // Price: 278.45 USD ≈ 238.54 EUR
  // Shares: 7,000 / 238.54 = 29.346 shares
  const vtiShares = 29.346;
  const vtiPrice = 238.54;
  
  // VXUS (Total International): €7,000 (20% of stocks)
  // Price: 72.89 USD ≈ 62.45 EUR
  // Shares: 7,000 / 62.45 = 112.090 shares
  const vxusShares = 112.090;
  const vxusPrice = 62.45;
  
  // VWO (Emerging Markets): €7,000 (20% of stocks)
  // Price: 49.23 USD ≈ 42.18 EUR
  // Shares: 7,000 / 42.18 = 165.947 shares
  const vwoShares = 165.947;
  const vwoPrice = 42.18;
  
  // VBR (Small Cap Value): €7,000 (20% of stocks)
  // Price: 197.34 USD ≈ 169.08 EUR
  // Shares: 7,000 / 169.08 = 41.410 shares
  const vbrShares = 41.410;
  const vbrPrice = 169.08;
  
  // BONDS: €30,000 total (42.86% of portfolio, 43% target)
  // Allocation within bonds: 50%/25%/25%
  
  // BND (Total Bond Market): €15,000 (50% of bonds)
  // Price: 73.45 USD ≈ 62.94 EUR
  // Shares: 15,000 / 62.94 = 238.314 shares
  const bndShares = 238.314;
  const bndPrice = 62.94;
  
  // TIP (Inflation-Protected): €7,500 (25% of bonds)
  // Price: €92.30/share
  // Shares: 7,500 / 92.30 = 81.257 shares
  const tipShares = 81.257;
  const tipPrice = 92.30;
  
  // BNDX (International Bond): €7,500 (25% of bonds)
  // Price: 48.12 USD ≈ 41.23 EUR
  // Shares: 7,500 / 41.23 = 181.936 shares
  const bndxShares = 181.936;
  const bndxPrice = 41.23;
  
  return {
    assets: [
      // STOCKS (5 ETFs)
      {
        id: 'demo-aa-1',
        name: 'S&P 500 Index',
        ticker: 'SPY',
        isin: 'US78462F1030',
        assetClass: 'STOCKS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(spyShares * spyPrice * 100) / 100,
        shares: spyShares,
        pricePerShare: spyPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 30, // 30% of STOCKS allocation (€10,500 of €35,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-2',
        name: 'Total Stock Market',
        ticker: 'VTI',
        isin: 'US9229083632',
        assetClass: 'STOCKS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(vtiShares * vtiPrice * 100) / 100,
        shares: vtiShares,
        pricePerShare: vtiPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 30, // 30% of STOCKS allocation (€10,500 of €35,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-3',
        name: 'Total International Stock',
        ticker: 'VXUS',
        isin: 'US9219107094',
        assetClass: 'STOCKS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(vxusShares * vxusPrice * 100) / 100,
        shares: vxusShares,
        pricePerShare: vxusPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 20, // 20% of STOCKS allocation (€7,000 of €35,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-4',
        name: 'Emerging Markets',
        ticker: 'VWO',
        isin: 'US9220428588',
        assetClass: 'STOCKS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(vwoShares * vwoPrice * 100) / 100,
        shares: vwoShares,
        pricePerShare: vwoPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 10, // 10% of STOCKS allocation (€3,500 of €35,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-5',
        name: 'Small Cap Value',
        ticker: 'VBR',
        isin: 'US9219107771',
        assetClass: 'STOCKS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(vbrShares * vbrPrice * 100) / 100,
        shares: vbrShares,
        pricePerShare: vbrPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 10, // 10% of STOCKS allocation (€3,500 of €35,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      // BONDS (3 ETFs)
      {
        id: 'demo-aa-6',
        name: 'Total Bond Market',
        ticker: 'BND',
        isin: 'US9219378356',
        assetClass: 'BONDS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(bndShares * bndPrice * 100) / 100,
        shares: bndShares,
        pricePerShare: bndPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 50, // 50% of BONDS allocation (€15,000 of €30,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-7',
        name: 'Inflation-Protected Bonds',
        ticker: 'TIP',
        isin: 'US46434V6478',
        assetClass: 'BONDS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(tipShares * tipPrice * 100) / 100,
        shares: tipShares,
        pricePerShare: tipPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 25, // 25% of BONDS allocation (€7,500 of €30,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      {
        id: 'demo-aa-8',
        name: 'International Bond',
        ticker: 'BNDX',
        isin: 'US9219107771',
        assetClass: 'BONDS' as AssetClass,
        subAssetType: 'ETF' as SubAssetType,
        currentValue: Math.round(bndxShares * bndxPrice * 100) / 100,
        shares: bndxShares,
        pricePerShare: bndxPrice,
        targetMode: 'PERCENTAGE' as AllocationMode,
        targetPercent: 25, // 25% of BONDS allocation (€7,500 of €30,000)
        originalCurrency: 'EUR' as SupportedCurrency,
      },
      // CASH (2 accounts) - now with SET mode for fixed amounts
      // Emergency Fund: €3,500 (70% of cash)
      {
        id: 'demo-aa-9',
        name: 'Emergency Fund',
        ticker: '',
        assetClass: 'CASH' as AssetClass,
        subAssetType: 'SAVINGS_ACCOUNT' as SubAssetType,
        currentValue: 3500,
        shares: 3500, // Value stored as shares for cash
        pricePerShare: 1, // Price is 1 for cash
        targetMode: 'SET' as AllocationMode,
        targetValue: 3500, // Fixed amount target
      },
      // Main Checking: €1,500 (30% of cash)
      {
        id: 'demo-aa-10',
        name: 'Main Checking',
        ticker: '',
        assetClass: 'CASH' as AssetClass,
        subAssetType: 'CHECKING_ACCOUNT' as SubAssetType,
        currentValue: 1500,
        shares: 1500, // Value stored as shares for cash
        pricePerShare: 1, // Price is 1 for cash
        targetMode: 'SET' as AllocationMode,
        targetValue: 1500, // Fixed amount target
      },
    ],
    assetClassTargets: {
      STOCKS: { targetMode: 'PERCENTAGE', targetPercent: 54 }, // 54% of portfolio (excl. cash)
      BONDS: { targetMode: 'PERCENTAGE', targetPercent: 46 }, // 46% of portfolio (excl. cash)
      REAL_ESTATE: { targetMode: 'OFF', targetPercent: 0 },
      CRYPTO: { targetMode: 'OFF', targetPercent: 0 },
      COMMODITIES: { targetMode: 'OFF', targetPercent: 0 },
      VEHICLE: { targetMode: 'OFF', targetPercent: 0 },
      COLLECTIBLE: { targetMode: 'OFF', targetPercent: 0 },
      ART: { targetMode: 'OFF', targetPercent: 0 },
      CASH: { targetMode: 'SET', targetPercent: 0 },
    },
  };
}
