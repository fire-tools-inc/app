import { describe, expect, it } from 'vitest';
import type { Asset } from '../../../src/types/assetAllocation';
import type { ExpenseTrackerData } from '../../../src/types/expenseTracker';
import { createEmptyMonthlySnapshot, type NetWorthTrackerData } from '../../../src/types/netWorthTracker';
import { DEFAULT_SETTINGS } from '../../../src/utils/cookieSettings';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';
import { buildDashboardData, type DashboardSources } from '../../../src/utils/dashboard';
import { calculateFIRE } from '../../../src/utils/fireCalculator';

const NOW = new Date(2026, 9, 11);

function sources(overrides: Partial<DashboardSources> = {}): DashboardSources {
  return {
    assets: null,
    netWorth: null,
    cashflow: null,
    inputs: null,
    settings: structuredClone(DEFAULT_SETTINGS),
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'synthetic-fund',
    name: 'Synthetic fund',
    ticker: 'TEST',
    assetClass: 'STOCKS',
    subAssetType: 'ETF',
    currentValue: 80000,
    targetMode: 'PERCENTAGE',
    targetPercent: 100,
    ...overrides,
  };
}

function netWorth(): NetWorthTrackerData {
  const september = createEmptyMonthlySnapshot(2026, 9);
  september.cashEntries = [{
    id: 'synthetic-cash', accountName: 'Synthetic account',
    accountType: 'SAVINGS', balance: 10000, currency: 'EUR',
  }];
  const october = createEmptyMonthlySnapshot(2026, 10);
  october.assets = [{
    id: 'synthetic-house', name: 'Synthetic house', ticker: '',
    assetClass: 'REAL_ESTATE', shares: 1, pricePerShare: 200000, currency: 'EUR',
    mortgageInfo: {
      principalAmount: 100000, currentBalance: 90000, interestRate: 3,
      termYears: 20, remainingYears: 18, monthlyPayment: 500, startDate: '2024-01-01',
    },
  }];
  october.cashEntries = [{
    id: 'synthetic-cash', accountName: 'Synthetic account',
    accountType: 'SAVINGS', balance: 12000, currency: 'EUR',
  }];
  october.pensions = [{
    id: 'synthetic-pension', name: 'Synthetic pension',
    pensionType: 'PRIVATE', currentValue: 30000, currency: 'EUR',
  }];
  october.debts = [{
    id: 'synthetic-debt', name: 'Synthetic loan',
    debtType: 'PERSONAL_LOAN', currentBalance: 5000, currency: 'EUR',
  }];
  october.taxes = [
    { id: 'unpaid-tax', name: 'Synthetic tax', taxType: 'OTHER', amount: 2000, currency: 'EUR', isPaid: false },
    { id: 'paid-tax', name: 'Paid synthetic tax', taxType: 'OTHER', amount: 1000, currency: 'EUR', isPaid: true },
  ];
  return {
    years: [{ year: 2026, months: [october, september] }],
    currentYear: 2026, currentMonth: 9, defaultCurrency: 'EUR',
    settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
  };
}

function cashflow(): ExpenseTrackerData {
  return {
    years: [{
      year: 2026,
      months: [
        {
          year: 2026, month: 9, budgets: [],
          incomes: [{ id: 'old-income', type: 'income', source: 'SALARY', amount: 9000, description: 'Synthetic salary', date: '2026-09-01' }],
          expenses: [],
        },
        {
          year: 2026, month: 10, budgets: [],
          incomes: [{ id: 'income', type: 'income', source: 'SALARY', amount: 3000, description: 'Synthetic salary', date: '2026-10-01' }],
          expenses: [{ id: 'expense', type: 'expense', category: 'HOUSING', expenseType: 'NEED', amount: 3500, description: 'Synthetic expense', date: '2026-10-02' }],
        },
      ],
    }],
    currentYear: 2026, currentMonth: 9, currency: 'USD', globalBudgets: [],
  };
}

describe('dashboard summaries', () => {
  it('does not invent balances, transactions or a FIRE plan for an empty installation', () => {
    const data = buildDashboardData(sources(), NOW);
    expect(data.netWorth.latest).toBeNull();
    expect(data.netWorth.history).toEqual([]);
    expect(data.allocation.total).toBeNull();
    expect(data.cashflow.current).toBeNull();
    expect(data.cashflow.history).toEqual([]);
    expect(data.fire).toBeNull();
    expect(data.firePlanInvalid).toBe(false);
  });

  it('uses the latest real snapshot, not the selected month or a sum of portfolio stores', () => {
    const data = buildDashboardData(sources({ netWorth: netWorth(), assets: [asset()] }), NOW);
    expect(data.netWorth.latest?.period).toBe('2026-10');
    expect(data.netWorth.latest?.netWorth).toBe(145000);
    expect(data.netWorth.change).toBe(135000);
    expect(data.netWorth.history.map(point => point.period)).toEqual(['2026-09', '2026-10']);
    expect(data.allocation.total).toBe(80000);
  });

  it('honors the saved pension setting and keeps source currencies separate', () => {
    const tracker = netWorth();
    tracker.settings.showPensionInNetWorth = false;
    const data = buildDashboardData(sources({ netWorth: tracker, cashflow: cashflow() }), NOW);
    expect(data.netWorth.latest?.netWorth).toBe(115000);
    expect(data.netWorth.currency).toBe('EUR');
    expect(data.cashflow.currency).toBe('USD');
  });

  it('ignores future and untouched empty snapshots without dropping a recorded zero', () => {
    const tracker = netWorth();
    const future = createEmptyMonthlySnapshot(2026, 11);
    future.cashEntries = [{
      id: 'future-cash', accountName: 'Synthetic account',
      accountType: 'SAVINGS', balance: 999999, currency: 'EUR',
    }];
    const recordedZero = createEmptyMonthlySnapshot(2026, 8);
    recordedZero.isFrozen = true;
    tracker.years[0].months.push(future, recordedZero, createEmptyMonthlySnapshot(2026, 7));
    const data = buildDashboardData(sources({ netWorth: tracker }), NOW);
    expect(data.netWorth.history.map(point => point.netWorth)).toEqual([0, 10000, 145000]);
    expect(data.netWorth.latest?.period).toBe('2026-10');
  });

  it('keeps negative net worth and debt-only snapshots', () => {
    const tracker = netWorth();
    const snapshot = createEmptyMonthlySnapshot(2026, 10);
    snapshot.debts = [{
      id: 'synthetic-debt', name: 'Synthetic loan', debtType: 'OTHER',
      currentBalance: 5000, currency: 'EUR',
    }];
    tracker.years[0].months = [snapshot];
    expect(buildDashboardData(sources({ netWorth: tracker }), NOW).netWorth.latest?.netWorth).toBe(-5000);
  });

  it('uses calendar-month cash flow and retains a deficit instead of clamping it away', () => {
    const data = buildDashboardData(sources({ cashflow: cashflow() }), NOW);
    expect(data.cashflow.current).toMatchObject({
      period: '2026-10', totalIncome: 3000, totalExpenses: 3500,
      netBalance: -500, savingsRate: 0,
    });
    expect(data.cashflow.history.map(point => point.period)).toEqual(['2026-09', '2026-10']);
  });

  it('does not present old cash flow as this month or omit zero-valued transactions', () => {
    const tracker = cashflow();
    tracker.years[0].months = [tracker.years[0].months[0]];
    expect(buildDashboardData(sources({ cashflow: tracker }), NOW).cashflow.current).toBeNull();
    tracker.years[0].months[0].incomes[0].amount = 0;
    expect(buildDashboardData(sources({ cashflow: tracker }), NOW).cashflow.history[0].totalIncome).toBe(0);
  });

  it('uses active holdings for allocation values, percentages and canonical colors', () => {
    const data = buildDashboardData(sources({
      assets: [
        asset(),
        asset({ id: 'cash', assetClass: 'CASH', subAssetType: 'SAVINGS_ACCOUNT', currentValue: 20000 }),
        asset({ id: 'excluded', assetClass: 'CRYPTO', currentValue: 90000, targetMode: 'OFF' }),
      ],
    }), NOW);
    expect(data.allocation.total).toBe(100000);
    expect(data.allocation.chartData).toEqual([
      { name: 'STOCKS', value: 80000, percentage: 80, color: '#65D4C4' },
      { name: 'CASH', value: 20000, percentage: 20, color: '#9BD7B0' },
    ]);
  });

  it.each(['standard', 'lean', 'fat', 'barista', 'coast'] as const)(
    'uses the existing %s FIRE calculation, not a different dashboard formula',
    fireType => {
      const inputs = { ...DEFAULT_INPUTS, fireType, yearOfBirth: new Date().getFullYear() - 35 };
      const expected = calculateFIRE(inputs);
      const data = buildDashboardData(sources({ inputs }), NOW);
      expect(data.fire).toMatchObject({
        target: expected.fireTarget,
        portfolioValue: inputs.initialSavings,
        yearsToFIRE: expected.yearsToFIRE,
        fireType,
        usesAllocation: false,
      });
    },
  );

  it('includes negative balances in the portfolio total without producing pie shares above 100 percent', () => {
    const data = buildDashboardData(sources({
      assets: [
        asset({ currentValue: 10000 }),
        asset({ id: 'negative-cash', assetClass: 'CASH', subAssetType: 'CHECKING_ACCOUNT', currentValue: -5000 }),
      ],
    }), NOW);
    expect(data.allocation.total).toBe(5000);
    expect(data.allocation.hasNegativeBalances).toBe(true);
    expect(data.allocation.chartData).toEqual([
      { name: 'STOCKS', value: 10000, percentage: 100, color: '#65D4C4' },
    ]);
  });

  it('respects FIRE asset-class and primary-residence exclusions without counting total net worth', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.includePrimaryResidenceInFIRE = false;
    const data = buildDashboardData(sources({
      settings,
      netWorth: netWorth(),
      inputs: { ...DEFAULT_INPUTS, useAssetAllocationValue: true },
      assets: [
        asset(),
        asset({ id: 'house', assetClass: 'REAL_ESTATE', subAssetType: 'PROPERTY', currentValue: 200000, isPrimaryResidence: true }),
        asset({ id: 'crypto', assetClass: 'CRYPTO', subAssetType: 'COIN', currentValue: 50000 }),
      ],
    }), NOW);
    expect(data.fire?.portfolioValue).toBe(80000);
    expect(data.fire?.usesAllocation).toBe(true);
  });

  it('distinguishes an invalid plan from a missing one', () => {
    const data = buildDashboardData(sources({ inputs: { ...DEFAULT_INPUTS, desiredWithdrawalRate: -1 } }), NOW);
    expect(data.fire).toBeNull();
    expect(data.firePlanInvalid).toBe(true);
  });

  it('preserves zero targets and progress above 100 percent', () => {
    const zero = buildDashboardData(sources({
      inputs: { ...DEFAULT_INPUTS, desiredWithdrawalRate: 0 },
    }), NOW);
    expect(zero.fire).toMatchObject({ target: 0, progress: 100, remaining: 0, yearsToFIRE: 0 });
    const funded = buildDashboardData(sources({
      inputs: { ...DEFAULT_INPUTS, fireAnnualExpenses: 1000, yearsOfExpenses: 25, initialSavings: 50000 },
    }), NOW);
    expect(funded.fire).toMatchObject({ target: 25000, progress: 200, remaining: 0, yearsToFIRE: 0 });
  });

  it('does not mutate source data or frozen histories', () => {
    const input = sources({ netWorth: netWorth(), cashflow: cashflow(), assets: [asset()] });
    const before = structuredClone(input);
    buildDashboardData(input, NOW);
    expect(input).toEqual(before);
  });
});
