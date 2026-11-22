import { beforeEach, describe, expect, it } from 'vitest';
import {
  SYNC_ADAPTERS,
  assetAllocationAdapter,
  calculatorAdapter,
  expenseTrackerAdapter,
  netWorthAdapter,
  settingsAdapter,
} from '../../src/utils/backendSync/adapters';
import { fullChangeset } from '../../src/utils/backendSync/changeset';
import type { SyncDomain } from '../../src/utils/backendSync/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type UserSettings } from '../../src/utils/cookieSettings';
import { DEFAULT_INPUTS } from '../../src/utils/defaults';
import { DEFAULT_ALLOCATION_PAGE_TARGETS, DEFAULT_ASSETS } from '../../src/utils/defaultAssets';
import { expectDiagnostic } from './diagnostics';
import { FakeSyncServer } from './backendSyncFakeServer';
import {
  assetAllocationFixture,
  calculatorFixture,
  expenseTrackerFixture,
  netWorthFixture,
  syncedSettingsFixture,
} from './backendSyncFixtures';

const fixtures: Record<SyncDomain, () => unknown> = {
  settings: syncedSettingsFixture,
  calculator: calculatorFixture,
  assetAllocation: assetAllocationFixture,
  expenseTracker: expenseTrackerFixture,
  netWorth: netWorthFixture,
};

beforeEach(() => {
  localStorage.clear();
  window.fireTools = {};
});

describe('backend sync adapters', () => {
  it.each(Object.keys(fixtures) as SyncDomain[])('round-trips a %s document with every optional field', (domain) => {
    const adapter = SYNC_ADAPTERS[domain];
    const doc = fixtures[domain]();
    expect(adapter.denormalize(adapter.normalize(doc))).toStrictEqual(doc);
  });

  it.each(Object.keys(fixtures) as SyncDomain[])('round-trips a %s document through a replace on the server', async (domain) => {
    const adapter = SYNC_ADAPTERS[domain];
    const doc = fixtures[domain]();
    const server = new FakeSyncServer();
    await server.fetch(`http://sync.test/api/v1/state/${domain}`, {
      method: 'PUT',
      body: JSON.stringify(fullChangeset(adapter.normalize(doc), adapter, true)),
    });
    // The backend sends optional flags as explicit booleans; they mean the same.
    const returned = server.data(domain);
    expect(adapter.denormalize(adapter.normalize(returned))).toStrictEqual(doc);
    expect(adapter.isEmpty(returned)).toBe(false);
    expect(server.isInitialized(domain)).toBe(true);
  });

  it('keys cashflow entities by id, month and category with positions from the parent arrays', () => {
    const { set, collections } = expenseTrackerAdapter.normalize(expenseTrackerFixture());
    expect(set.config).toEqual({ currency: 'EUR', currentYear: 2025, currentMonth: 3 });
    expect(Object.keys(collections.years)).toEqual(['2024', '2025']);
    expect(collections.months['2025-03']).toEqual({ year: 2025, month: 3 });
    expect(collections.expenses['exp-2']).toMatchObject({ year: 2025, month: 3, position: 1 });
    expect(collections.incomes['inc-1']).toMatchObject({ year: 2025, month: 3, position: 0 });
    expect(Object.keys(collections.monthBudgets)).toEqual(['2025-03|GROCERIES', '2025-03|custom-hobby']);
    expect(collections.globalBudgets.DINING_OUT).toMatchObject({ position: 0 });
    expect(collections.customCategories['custom-hobby']).toMatchObject({ position: 0 });
    expect(collections.categoryOverrides.GROCERIES).toMatchObject({ position: 0 });
  });

  it('omits computed net worth totals from the synced month', () => {
    const doc = netWorthFixture();
    const withTotals = structuredClone(doc);
    Object.assign(withTotals.years[0].months[0], { totalAssetValue: 1, totalCash: 2, netWorth: 3 });
    const { collections, set } = netWorthAdapter.normalize(withTotals);
    expect(collections.months['2025-02']).toEqual({
      year: 2025, month: 2, isFrozen: true, frozenDate: '2025-03-01T00:00:00.000Z', monthNote: 'Synthetic month note',
    });
    expect(collections.debts['nw-debt-1']).toMatchObject({ year: 2025, month: 2, position: 0 });
    expect(set.config).toEqual({
      defaultCurrency: 'EUR', currentYear: 2025, currentMonth: 2,
      settings: { showPensionInNetWorth: true, includeUnrealizedGains: false, syncWithAssetAllocation: true },
    });
    expect(netWorthAdapter.denormalize(netWorthAdapter.normalize(withTotals))).toStrictEqual(doc);
  });

  it('treats an optional flag sent as false like a missing flag', () => {
    const local = expenseTrackerFixture();
    const remote = structuredClone(local);
    remote.years[1].isArchived = false;
    remote.years[1].months[0].isClosed = false;
    remote.years[1].months[0].expenses[0].isRecurring = false;
    expect(expenseTrackerAdapter.normalize(remote)).toEqual(expenseTrackerAdapter.normalize(local));
    const planningOnlyEmpty = { ...local, planning: { schemaVersion: 1 as const, schedules: [], skippedOccurrences: [], goals: [], rules: [] } };
    expect(expenseTrackerAdapter.normalize(planningOnlyEmpty).set.planning).toBeNull();
  });

  it('keeps both entries when two share an id instead of dropping one', () => {
    const doc = expenseTrackerFixture();
    const march = doc.years[1].months[0];
    march.expenses.push({ ...march.expenses[1], description: 'Synthetic duplicate' });
    const { collections } = expenseTrackerAdapter.normalize(doc);
    expectDiagnostic('warn', 'A duplicated entry id was renamed');
    expect(collections.expenses['exp-2~2']).toMatchObject({ id: 'exp-2~2', description: 'Synthetic duplicate', position: 2 });
    expect(collections.expenses['exp-2']).toMatchObject({ description: 'Synthetic groceries' });
  });

  it('treats missing data, defaults and the untouched sample portfolio as empty', () => {
    expect(settingsAdapter.isEmpty(null)).toBe(true);
    expect(settingsAdapter.isEmpty({ ...syncedSettingsFixture(), ...pickDefaults() })).toBe(true);
    expect(settingsAdapter.isEmpty(syncedSettingsFixture())).toBe(false);
    expect(calculatorAdapter.isEmpty(DEFAULT_INPUTS)).toBe(true);
    expect(calculatorAdapter.isEmpty(calculatorFixture())).toBe(false);
    expect(assetAllocationAdapter.isEmpty({ assets: DEFAULT_ASSETS, assetClassTargets: DEFAULT_ALLOCATION_PAGE_TARGETS })).toBe(true);
    expect(assetAllocationAdapter.isEmpty({ assets: [], assetClassTargets: assetAllocationFixture().assetClassTargets })).toBe(false);
    expect(assetAllocationAdapter.isEmpty(assetAllocationFixture())).toBe(false);
    const shell = { ...expenseTrackerFixture(), years: [{ year: 2025, months: [{ year: 2025, month: 3, incomes: [], expenses: [], budgets: [] }] }], globalBudgets: [], customCategories: [], categoryOverrides: [], planning: undefined };
    expect(expenseTrackerAdapter.isEmpty(shell)).toBe(true);
    expect(expenseTrackerAdapter.isEmpty(expenseTrackerFixture())).toBe(false);
    const emptyNetWorth = { ...netWorthFixture(), years: [{ year: 2025, months: [{ year: 2025, month: 2, assets: [], cashEntries: [], pensions: [], operations: [], debts: [], taxes: [], isFrozen: false }] }] };
    expect(netWorthAdapter.isEmpty(emptyNetWorth)).toBe(true);
    expect(netWorthAdapter.isEmpty(netWorthFixture())).toBe(false);
  });

  it('applies database settings without touching device-local settings', () => {
    const local: UserSettings = {
      ...DEFAULT_SETTINGS,
      accountName: 'Device name',
      loggingPiiEnabled: true,
      maxLogFileSizeMb: 120,
      backend: { mode: 'custom', customUrl: 'http://sync.test', customToken: 'synthetic-token' },
      updater: { autoCheck: false, autoDownload: true, keepBackups: 7, notifyOnly: true },
      llmCategorization: { provider: 'openai', baseUrl: 'https://llm.invalid/v1', apiKey: 'synthetic-key', model: 'synthetic-model' },
    };
    saveSettings(local);

    settingsAdapter.writeLocalCache(syncedSettingsFixture());
    const merged = loadSettings();
    expect(merged.accountName).toBe('Synthetic Household');
    expect(merged.country).toBe('CH');
    expect(merged.language).toBe('it');
    expect(merged.backend).toEqual(local.backend);
    expect(merged.updater).toEqual(local.updater);
    expect(merged.loggingPiiEnabled).toBe(true);
    expect(merged.maxLogFileSizeMb).toBe(120);
    expect(merged.llmCategorization).toEqual(local.llmCategorization);

    // An empty database copy resets synced fields only.
    settingsAdapter.writeLocalCache(null);
    const reset = loadSettings();
    expect(reset.accountName).toBe(DEFAULT_SETTINGS.accountName);
    expect(reset.country).toBeUndefined();
    expect(reset.backend).toEqual(local.backend);
    expect(reset.llmCategorization).toEqual(local.llmCategorization);
  });

  it('never puts device-local settings into the synced document', () => {
    const doc = settingsAdapter.normalize({
      ...syncedSettingsFixture(),
      backend: { mode: 'custom', customUrl: 'http://sync.test', customToken: 'synthetic-token' },
      llmCategorization: { baseUrl: 'https://llm.invalid', apiKey: 'synthetic-key', model: 'm' },
      loggingPiiEnabled: true,
    } as never);
    const keys = Object.keys(doc.set.settings as object);
    expect(keys).not.toContain('backend');
    expect(keys).not.toContain('llmCategorization');
    expect(keys).not.toContain('loggingPiiEnabled');
    expect(keys).not.toContain('updater');
    expect(keys).not.toContain('maxLogFileSizeMb');
  });
});

function pickDefaults() {
  const { accountName, decimalSeparator, decimalPlaces, currencySettings, privacyMode, dateFormat, fireAssetClassInclusion,
    includePrimaryResidenceInFIRE, searchThreshold, experimentalFeatures, aiFeaturesEnabled, language } = DEFAULT_SETTINGS;
  return { accountName, decimalSeparator, decimalPlaces, currencySettings, privacyMode, country: undefined, dateFormat,
    fireAssetClassInclusion, includePrimaryResidenceInFIRE, searchThreshold, experimentalFeatures, aiFeaturesEnabled, language };
}
