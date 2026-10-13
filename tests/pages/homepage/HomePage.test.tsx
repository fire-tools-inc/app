import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from '../../../src/components/HomePage';
import { createEmptyMonthlySnapshot } from '../../../src/types/netWorthTracker';
import { DEFAULT_SETTINGS } from '../../../src/utils/cookieSettings';
import { DEFAULT_INPUTS } from '../../../src/utils/defaults';
import { expectDiagnostic } from '../../shared/diagnostics';
import { cashflowFixture, expenseSchedule, planningFixture } from '../expense-tracker/planningFixtures';
import { calendarDate } from '../../../src/utils/cashflowSchedules';

const mocks = vi.hoisted(() => ({
  assets: vi.fn(),
  netWorth: vi.fn(),
  cashflow: vi.fn(),
  inputs: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('../../../src/utils/cookieStorage', () => ({
  loadAssetAllocation: mocks.assets,
  loadNetWorthTrackerData: mocks.netWorth,
  loadExpenseTrackerData: mocks.cashflow,
  loadFireCalculatorInputs: mocks.inputs,
}));
vi.mock('../../../src/utils/cookieSettings', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/utils/cookieSettings')>(),
  loadSettings: mocks.settings,
  saveSettings: mocks.saveSettings,
}));
vi.mock('../../../src/hooks/useDeferredRender', () => ({
  useDeferredRender: () => false,
}));

function mount() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assets.mockReturnValue({ assets: null, assetClassTargets: null });
  mocks.netWorth.mockReturnValue(null);
  mocks.cashflow.mockReturnValue(null);
  mocks.inputs.mockReturnValue(null);
  mocks.settings.mockReturnValue(structuredClone(DEFAULT_SETTINGS));
});

afterEach(cleanup);

describe('home dashboard', () => {
  it('shows read-only upcoming commitments and manual goals with planner deep links', () => {
    mocks.cashflow.mockReturnValue({
      ...cashflowFixture(), planning: planningFixture({ schedules: [expenseSchedule({ startDate: calendarDate() })] }),
    });
    mount();
    expect(screen.getByRole('region', { name: 'Upcoming commitments' })).toBeDefined();
    expect(screen.getByText('Test goal')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open planning' }).getAttribute('href')).toBe('/expense-tracker?tab=planning');
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it('replaces tool tiles with four financial sections and useful empty states', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeDefined();
    for (const name of ['Net worth history', 'Asset allocation', 'Monthly cash flow', 'FIRE progress']) {
      expect(screen.getByRole('region', { name })).toBeDefined();
    }
    expect(document.querySelector('.feature-card')).toBeNull();
    expect(screen.getByRole('link', { name: 'Browse all tools' }).getAttribute('href')).toBe('https://test.github.io/test/#features');
    expect(screen.getByRole('link', { name: 'Track net worth' }).getAttribute('href')).toBe('/net-worth-tracker');
    expect(screen.getByRole('link', { name: 'Set up your FIRE plan' }).getAttribute('href')).toBe('/fire-calculator');
  });

  it('shows saved zero balances and zero-year FIRE rather than treating them as missing', () => {
    const now = new Date();
    const snapshot = createEmptyMonthlySnapshot(now.getFullYear(), now.getMonth() + 1);
    snapshot.cashEntries = [{
      id: 'synthetic-zero', accountName: 'Synthetic cash',
      accountType: 'SAVINGS', balance: 0, currency: 'EUR',
    }];
    mocks.netWorth.mockReturnValue({
      years: [{ year: snapshot.year, months: [snapshot] }],
      currentYear: snapshot.year, currentMonth: snapshot.month, defaultCurrency: 'EUR',
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: true },
    });
    mocks.inputs.mockReturnValue({ ...DEFAULT_INPUTS, desiredWithdrawalRate: 0 });
    mount();
    expect(document.querySelector('.dashboard-metric--net-worth dd')?.textContent).toBe('€0.00');
    expect(within(screen.getByRole('region', { name: 'FIRE progress' })).getByText('Target reached')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'FIRE target progress' }).getAttribute('aria-valuenow')).toBe('100');
  });

  it('refreshes saved values on focus and storage changes, without writing domain stores', () => {
    mount();
    mocks.assets.mockReturnValue({
      assets: [{
        id: 'synthetic-asset', name: 'Synthetic fund', ticker: 'TEST',
        assetClass: 'STOCKS', subAssetType: 'ETF', currentValue: 42000,
        targetMode: 'PERCENTAGE', targetPercent: 100,
      }],
      assetClassTargets: null,
    });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(document.querySelector('.dashboard-metric--portfolio dd')?.textContent).toBe('€42,000');
    mocks.assets.mockReturnValue({ assets: [], assetClassTargets: null });
    act(() => window.dispatchEvent(new Event('storage')));
    expect(document.querySelector('.dashboard-metric--portfolio dd')?.textContent).toBe('—');
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it('honors saved privacy preferences for financial totals', () => {
    mocks.settings.mockReturnValue({ ...DEFAULT_SETTINGS, privacyMode: true });
    mocks.inputs.mockReturnValue(DEFAULT_INPUTS);
    mount();
    expect(screen.getByRole('button', { name: 'Show values' })).toBeDefined();
    expect(document.querySelector('.dashboard-metric--fire .privacy-blur')).not.toBeNull();
    expect(screen.getByRole('progressbar', { name: 'FIRE target progress' }).hasAttribute('aria-valuenow')).toBe(false);
  });

  it('persists the privacy toggle only after a successful settings write', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Hide values' }));
    expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ privacyMode: true }));
    expect(screen.getByRole('button', { name: 'Show values' })).toBeDefined();
  });

  it('surfaces a failed privacy-settings write instead of claiming it saved', () => {
    mocks.saveSettings.mockImplementationOnce(() => { throw new Error('Synthetic storage failure'); });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Hide values' }));
    expect(screen.getByRole('alert').textContent).toContain('Could not save your privacy preference');
    expect(screen.getByRole('button', { name: 'Hide values' })).toBeDefined();
    expectDiagnostic('error', '[privacy-save-failed]: failed to save dashboard privacy preference');
  });

  it('removes refresh subscriptions on unmount', () => {
    const { unmount } = mount();
    const calls = mocks.assets.mock.calls.length;
    unmount();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('storage'));
    expect(mocks.assets).toHaveBeenCalledTimes(calls);
  });
});
