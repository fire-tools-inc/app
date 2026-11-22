import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseEntry, ExpenseTrackerData } from '../../src/types/expenseTracker';
import { expenseTrackerAdapter } from '../../src/utils/backendSync/adapters';
import { BackendSyncEngine, type BackendSyncEngineOptions } from '../../src/utils/backendSync/engine';
import { SYNC_STATE_KEY, loadSyncState } from '../../src/utils/backendSync/syncStore';
import type { ResolvedBackend } from '../../src/utils/apiBase';
import {
  clearFireCalculatorInputs,
  loadExpenseTrackerData,
  loadFireCalculatorInputs,
  saveExpenseTrackerData,
  saveFireCalculatorInputs,
  saveNetWorthTrackerData,
} from '../../src/utils/cookieStorage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type UserSettings } from '../../src/utils/cookieSettings';
import { DEFAULT_INPUTS } from '../../src/utils/defaults';
import { expectDiagnostic } from './diagnostics';
import { FakeSyncServer } from './backendSyncFakeServer';
import { calculatorFixture, expenseTrackerFixture, netWorthFixture, syncedSettingsFixture } from './backendSyncFixtures';

const TOKEN = 'synthetic-token';
const embedded: ResolvedBackend = { baseUrl: 'http://sync.test/api/v1', token: TOKEN, mode: 'embedded' };
const custom: ResolvedBackend = { ...embedded, mode: 'custom' };

let server: FakeSyncServer;
let engines: BackendSyncEngine[] = [];
let backup: ReturnType<typeof vi.fn<() => Promise<{ ok: boolean; error?: string }>>>;

function createEngine(options: BackendSyncEngineOptions = {}): BackendSyncEngine {
  const engine = new BackendSyncEngine({
    resolveBackend: async () => embedded,
    expectsBackend: () => true,
    createBackup: backup,
    flushDelayMs: 0,
    pollIntervalMs: 60_000,
    bootTimeoutMs: 2_000,
    ...options,
  });
  engines.push(engine);
  return engine;
}

/** Simulates an app restart: the old engine stops, a new one reads persisted state. */
function restart(options: BackendSyncEngineOptions = {}): BackendSyncEngine {
  engines.forEach((engine) => engine.dispose());
  return createEngine(options);
}

async function settle(engine: BackendSyncEngine): Promise<void> {
  await engine.whenIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await engine.whenIdle();
}

const march = (doc: ExpenseTrackerData) => doc.years[1].months[0];
const expense = (id: string, amount: number, description = `Synthetic ${id}`): ExpenseEntry => ({
  id, type: 'expense', date: '2025-03-20', amount, description, category: 'OTHER', expenseType: 'WANT',
});
const canonical = (doc: ExpenseTrackerData | null) => expenseTrackerAdapter.normalize(doc);
const patches = (domain: string) => server.requestsTo('PATCH', `/state/${domain}`);

beforeEach(() => {
  localStorage.clear();
  window.fireTools = {};
  server = new FakeSyncServer();
  server.requiredToken = TOKEN;
  vi.stubGlobal('fetch', vi.fn(server.fetch));
  backup = vi.fn(async () => ({ ok: true }));
});

afterEach(() => {
  engines.forEach((engine) => engine.dispose());
  engines = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete window.fireTools;
});

describe('boot decisions', () => {
  it('initializes an untouched device from the database (agent-first onboarding)', async () => {
    server.seed('expenseTracker', expenseTrackerFixture(), false);
    server.seed('settings', syncedSettingsFixture(), false);
    const engine = createEngine();
    await engine.init();

    expect(canonical(loadExpenseTrackerData())).toEqual(canonical(expenseTrackerFixture()));
    expect(loadSettings().accountName).toBe('Synthetic Household');
    expect(server.isInitialized('expenseTracker')).toBe(true);
    expect(patches('expenseTracker')[0]).toMatchObject({
      body: { initialize: true },
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    expect(backup).not.toHaveBeenCalled();
    expect(engine.isDomainActive('expenseTracker')).toBe(true);
  });

  it('keeps existing desktop data and backs up the database before replacing it', async () => {
    saveExpenseTrackerData(expenseTrackerFixture());
    const agentDoc = expenseTrackerFixture();
    march(agentDoc).expenses = [expense('agent-only', 3)];
    server.seed('expenseTracker', agentDoc, false);
    let putsBeforeBackup = -1;
    backup.mockImplementation(async () => {
      putsBeforeBackup = server.requests.filter((request) => request.method === 'PUT').length;
      return { ok: true };
    });

    await createEngine().init();

    expect(backup).toHaveBeenCalledOnce();
    expect(putsBeforeBackup).toBe(0);
    const put = server.requestsTo('PUT', '/state/expenseTracker')[0];
    expect(put.body?.initialize).toBe(true);
    expect(canonical(server.data('expenseTracker') as ExpenseTrackerData)).toEqual(canonical(expenseTrackerFixture()));
    expect(canonical(loadExpenseTrackerData())).toEqual(canonical(expenseTrackerFixture()));
  });

  it('does not touch the database when the backup fails, and reports it', async () => {
    saveExpenseTrackerData(expenseTrackerFixture());
    const agentDoc = expenseTrackerFixture();
    march(agentDoc).expenses = [expense('agent-only', 3)];
    server.seed('expenseTracker', agentDoc, false);
    backup.mockResolvedValue({ ok: false, error: 'Synthetic disk full' });

    const engine = createEngine();
    await engine.init();
    await settle(engine);

    expectDiagnostic('error', 'a backup could not be created');
    expect(server.requestsTo('PUT', '/state/expenseTracker')).toHaveLength(0);
    expect(server.data('expenseTracker')).toMatchObject({ years: expect.any(Array) });
    expect(engine.getStatus().issues).toEqual([{ domain: 'expenseTracker', kind: 'backupFailed', message: 'Synthetic disk full' }]);
    expect(engine.isDomainActive('expenseTracker')).toBe(false);
    saveExpenseTrackerData({ ...expenseTrackerFixture(), currentMonth: 4 });
    expect(loadSyncState().outbox).toHaveLength(0);
  });

  it('asks before mixing data with a custom backend and applies the database choice', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    server.seed('calculator', { ...calculatorFixture(), initialSavings: 1 }, false);
    const engine = createEngine({ resolveBackend: async () => custom });
    await engine.init();
    await settle(engine);

    expect(engine.getStatus().conflicts).toEqual(['calculator']);
    expect(server.requestsTo('PUT', '/state/calculator')).toHaveLength(0);

    await engine.resolveConflicts('database');
    await settle(engine);
    expect(loadFireCalculatorInputs()?.initialSavings).toBe(1);
    expect(engine.getStatus().conflicts).toEqual([]);
    expect(backup).not.toHaveBeenCalled();
  });

  it('replaces the database with this device on request', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    server.seed('calculator', { ...calculatorFixture(), initialSavings: 1 }, true);
    const engine = createEngine();
    await engine.init();
    await settle(engine);
    expect(engine.getStatus().conflicts).toEqual(['calculator']);

    await engine.resolveConflicts('device');
    await settle(engine);
    expect(backup).toHaveBeenCalledOnce();
    expect((server.data('calculator') as { initialSavings: number }).initialSavings).toBe(123456);
    expect(engine.getStatus().conflicts).toEqual([]);
    expect(engine.isDomainActive('calculator')).toBe(true);
  });

  it('adopts an initialized database silently when both copies match', async () => {
    saveNetWorthTrackerData(netWorthFixture());
    server.seed('netWorth', netWorthFixture(), true);
    const engine = createEngine();
    await engine.init();
    await settle(engine);
    expect(engine.getStatus().conflicts).toEqual([]);
    expect(engine.isDomainActive('netWorth')).toBe(true);
    expect(loadSyncState().domains.netWorth).toEqual({ instanceId: 'instance-a', revision: server.revision('netWorth') });
  });

  it('loads writes made while the app was closed and asks when the database was swapped', async () => {
    saveExpenseTrackerData(expenseTrackerFixture());
    await createEngine().init();

    const added = expenseTrackerFixture();
    march(added).expenses.push(expense('agent-1', 9));
    server.agentWrite('expenseTracker', { upsert: { expenses: [{ ...expense('agent-1', 9), year: 2025, month: 3 }] } });
    await restart().init();
    expect(march(loadExpenseTrackerData()!).expenses.map((item) => item.id)).toContain('agent-1');

    // Same device, different database (instance): nothing is overwritten silently.
    server.instanceId = 'instance-b';
    const engine = restart();
    await engine.init();
    await settle(engine);
    expect(engine.getStatus().conflicts).toEqual([]);
    server.agentWrite('expenseTracker', { delete: { expenses: ['agent-1'] } });
    server.instanceId = 'instance-c';
    const swapped = restart();
    await swapped.init();
    await settle(swapped);
    expect(swapped.getStatus().conflicts).toEqual(['expenseTracker']);
  });
});

describe('saving changes', () => {
  async function bootWithExpenses() {
    saveExpenseTrackerData(expenseTrackerFixture());
    const engine = createEngine();
    await engine.init();
    await settle(engine);
    server.requests.length = 0;
    return engine;
  }

  it('sends only the changed entities with the access token', async () => {
    const engine = await bootWithExpenses();
    const next = expenseTrackerFixture();
    march(next).expenses[1].amount = 99;
    saveExpenseTrackerData(next);
    await engine.flushNow();
    await settle(engine);

    const [patch] = patches('expenseTracker');
    expect(patch.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(patch.body).toEqual({ upsert: { expenses: [expect.objectContaining({ id: 'exp-2', amount: 99, year: 2025, month: 3, position: 1 })] } });
    expect(march(server.data('expenseTracker') as ExpenseTrackerData).expenses[1].amount).toBe(99);
    expect(engine.getStatus()).toMatchObject({ state: 'saved', pending: 0 });
  });

  it('delivers every rapid edit in order', async () => {
    const engine = await bootWithExpenses();
    const doc = expenseTrackerFixture();
    for (let index = 1; index <= 25; index += 1) {
      march(doc).expenses[1] = { ...march(doc).expenses[1], amount: index };
      saveExpenseTrackerData(structuredClone(doc));
    }
    march(doc).expenses.push(expense('temp', 1));
    saveExpenseTrackerData(structuredClone(doc));
    march(doc).expenses.pop();
    saveExpenseTrackerData(structuredClone(doc));
    march(doc).expenses.push(expense('temp', 2));
    saveExpenseTrackerData(structuredClone(doc));
    for (let index = 0; index < 10; index += 1) saveFireCalculatorInputs({ ...DEFAULT_INPUTS, initialSavings: 1000 + index });
    expect(loadSyncState().outbox.length).toBeGreaterThan(20);

    await engine.flushNow();
    await settle(engine);
    expect(canonical(server.data('expenseTracker') as ExpenseTrackerData)).toEqual(canonical(doc));
    expect((server.data('calculator') as { initialSavings: number }).initialSavings).toBe(1009);
    expect(loadSyncState().outbox).toHaveLength(0);
    for (const request of patches('expenseTracker')) {
      const ids = request.body?.upsert?.expenses?.map((item) => item.id) ?? [];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps changes in an encrypted outbox while offline and sends them after a restart', async () => {
    const engine = await bootWithExpenses();
    server.offline = true;
    const next = expenseTrackerFixture();
    march(next).expenses.push(expense('offline-1', 7, 'Synthetic offline edit'));
    saveExpenseTrackerData(next);
    await engine.flushNow();
    await settle(engine);

    expect(engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 });
    const stored = localStorage.getItem(SYNC_STATE_KEY)!;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('Synthetic offline edit');

    server.offline = false;
    const reloaded = restart();
    await reloaded.init();
    await settle(reloaded);
    expect(march(server.data('expenseTracker') as ExpenseTrackerData).expenses.map((item) => item.id)).toContain('offline-1');
    expect(loadSyncState().outbox).toHaveLength(0);
    expect(reloaded.getStatus().state).toBe('saved');
  });

  it('retries with backoff after a network error', async () => {
    const engine = await bootWithExpenses();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    server.offline = true;
    saveFireCalculatorInputs({ ...DEFAULT_INPUTS, initialSavings: 4242 });
    await vi.advanceTimersByTimeAsync(0);
    await engine.whenIdle();
    expect(engine.getStatus()).toMatchObject({ state: 'offline', pending: 1 });

    server.offline = false;
    await vi.advanceTimersByTimeAsync(999);
    expect(server.data('calculator')).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await engine.whenIdle();
    expect((server.data('calculator') as { initialSavings: number }).initialSavings).toBe(4242);
  });

  it('saves valid edits, lists a refused one and reloads the saved data', async () => {
    const engine = await bootWithExpenses();
    server.validators.expenseTracker = (changeset) => {
      const bad = changeset.upsert?.expenses?.find((item) => (item.amount as number) < 0);
      return bad ? {
        status: 400, code: 'invalid_body', message: 'Amount must be a finite non-negative number.',
        details: { collection: 'expenses', key: bad.id, message: 'Amount must be a finite non-negative number.' },
      } : null;
    };
    const next = expenseTrackerFixture();
    march(next).expenses[1].amount = 99;
    march(next).expenses.push(expense('bad-1', -5));
    saveExpenseTrackerData(next);
    await engine.flushNow();
    await settle(engine);

    expectDiagnostic('error', 'The database refused a change.');
    const saved = march(server.data('expenseTracker') as ExpenseTrackerData).expenses;
    expect(saved.map((item) => [item.id, item.amount])).toEqual([['exp-1', 45], ['exp-2', 99]]);
    expect(march(loadExpenseTrackerData()!).expenses.map((item) => item.id)).toEqual(['exp-1', 'exp-2']);
    const [rejected] = engine.getStatus().rejected;
    expect(rejected).toMatchObject({ domain: 'expenseTracker', status: 400, message: 'Amount must be a finite non-negative number.' });
    expect(rejected.changeset.upsert?.expenses[0]).toMatchObject({ id: 'bad-1', amount: -5 });
    expect(loadSyncState().rejected).toHaveLength(1);
    expect(loadSyncState().outbox).toHaveLength(0);

    engine.dismissRejected(rejected.id);
    await settle(engine);
    expect(engine.getStatus().rejected).toEqual([]);
  });

  it('reloads the database copy after a refusal even when newer edits were queued meanwhile', async () => {
    const engine = await bootWithExpenses();
    let editedDuringRequest = false;
    server.validators.expenseTracker = (changeset) => {
      const bad = changeset.upsert?.expenses?.find((item) => (item.amount as number) < 0);
      if (!bad) return null;
      if (!editedDuringRequest) {
        editedDuringRequest = true;
        const later = loadExpenseTrackerData()!;
        march(later).expenses[0].amount = 50;
        saveExpenseTrackerData(later);
      }
      return {
        status: 400, code: 'invalid_body', message: 'Amount must be a finite non-negative number.',
        details: { collection: 'expenses', key: bad.id, message: 'Amount must be a finite non-negative number.' },
      };
    };
    const next = expenseTrackerFixture();
    march(next).expenses.push(expense('bad-1', -5));
    saveExpenseTrackerData(next);
    await engine.flushNow();
    await settle(engine);
    await engine.flushNow();
    await settle(engine);

    expectDiagnostic('error', 'The database refused a change.');
    expect(march(server.data('expenseTracker') as ExpenseTrackerData).expenses.map((item) => [item.id, item.amount]))
      .toEqual([['exp-1', 50], ['exp-2', 120.5]]);
    expect(march(loadExpenseTrackerData()!).expenses.map((item) => item.id)).toEqual(['exp-1', 'exp-2']);
  });

  it('reloads the domain when someone else wrote before our change', async () => {
    const engine = await bootWithExpenses();
    server.agentWrite('expenseTracker', { upsert: { expenses: [{ ...expense('agent-1', 11), year: 2025, month: 3 }] } });
    const next = expenseTrackerFixture();
    march(next).expenses[0].amount = 50;
    saveExpenseTrackerData(next);
    await engine.flushNow();
    await settle(engine);

    expect(server.requestsTo('GET', '/state/expenseTracker')).toHaveLength(1);
    const local = march(loadExpenseTrackerData()!).expenses;
    expect(local.map((item) => [item.id, item.amount])).toEqual([['exp-1', 50], ['exp-2', 120.5], ['agent-1', 11]]);
  });

  it('empties the database domain when local data is cleared', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    const engine = createEngine();
    await engine.init();
    expect(server.data('calculator')).not.toBeNull();
    clearFireCalculatorInputs();
    await engine.flushNow();
    expect(server.requestsTo('PUT', '/state/calculator').at(-1)?.body).toEqual({ initialize: true });
    expect(server.data('calculator')).toBeNull();
  });
});

describe('remote changes', () => {
  it('pulls agent writes, announces them and merges a stale view save without losing them', async () => {
    saveExpenseTrackerData(expenseTrackerFixture());
    const engine = createEngine();
    await engine.init();
    const events: number[] = [];
    engine.subscribeRemoteChanges((event) => events.push(event.generation));

    server.agentWrite('expenseTracker', { upsert: { expenses: [{ ...expense('agent-1', 11), year: 2025, month: 3 }] } });
    await engine.pollNow();
    await settle(engine);
    expect(events).toEqual([1]);
    expect(march(loadExpenseTrackerData()!).expenses.map((item) => item.id)).toEqual(['exp-1', 'exp-2', 'agent-1']);

    // The mounted page still holds the old document and saves an edit.
    const stale = expenseTrackerFixture();
    march(stale).expenses[1].amount = 130;
    saveExpenseTrackerData(stale);
    await engine.flushNow();
    await settle(engine);
    expect(patches('expenseTracker').at(-1)?.body?.delete).toBeUndefined();
    expect(march(server.data('expenseTracker') as ExpenseTrackerData).expenses.map((item) => [item.id, item.amount]))
      .toEqual([['exp-1', 45], ['exp-2', 130], ['agent-1', 11]]);
    expect(march(loadExpenseTrackerData()!).expenses.map((item) => item.id)).toEqual(['exp-1', 'exp-2', 'agent-1']);

    // After the page remounted with fresh data, removing the entry is a real deletion.
    engine.acknowledgeViewRefresh(engine.getRemoteGeneration());
    const fresh = loadExpenseTrackerData()!;
    march(fresh).expenses = march(fresh).expenses.filter((item) => item.id !== 'agent-1');
    saveExpenseTrackerData(fresh);
    await engine.flushNow();
    expect(patches('expenseTracker').at(-1)?.body?.delete).toEqual({ expenses: ['agent-1'] });
  });

  it('applies database settings but keeps device-local settings out of the API', async () => {
    const deviceOnly: UserSettings = {
      ...DEFAULT_SETTINGS,
      loggingPiiEnabled: true,
      maxLogFileSizeMb: 77,
      backend: { mode: 'custom', customUrl: 'http://sync.test', customToken: 'synthetic-device-token' },
      updater: { autoCheck: false, autoDownload: false, keepBackups: 9, notifyOnly: true },
      llmCategorization: { baseUrl: 'https://llm.invalid/v1', apiKey: 'synthetic-llm-key', model: 'synthetic-model' },
    };
    saveSettings(deviceOnly);
    server.seed('settings', syncedSettingsFixture(), true);
    const engine = createEngine({ resolveBackend: async () => custom });
    await engine.init();
    await settle(engine);

    const hydrated = loadSettings();
    expect(hydrated.accountName).toBe('Synthetic Household');
    expect(hydrated.backend).toEqual(deviceOnly.backend);
    expect(hydrated.updater).toEqual(deviceOnly.updater);
    expect(hydrated.llmCategorization).toEqual(deviceOnly.llmCategorization);
    expect(hydrated.maxLogFileSizeMb).toBe(77);

    saveSettings({ ...hydrated, privacyMode: false, llmCategorization: { ...deviceOnly.llmCategorization!, apiKey: 'synthetic-new-key' } });
    await engine.flushNow();
    const body = JSON.stringify(patches('settings').at(-1)?.body);
    expect(body).toContain('"privacyMode":false');
    for (const secret of ['synthetic-device-token', 'synthetic-llm-key', 'synthetic-new-key', 'loggingPiiEnabled', 'updater']) {
      expect(body).not.toContain(secret);
    }
  });
});

describe('failure modes and inactive storage', () => {
  it('opens on the cached data right away when the backend is unreachable, then catches up', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    server.offline = true;
    const engine = createEngine({ bootTimeoutMs: 60_000 });
    const started = Date.now();
    await engine.init();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(engine.getStatus().state).toBe('offline');
    expect(loadFireCalculatorInputs()?.initialSavings).toBe(calculatorFixture().initialSavings);

    server.offline = false;
    await engine.retryNow();
    await settle(engine);
    expect((server.data('calculator') as { initialSavings: number }).initialSavings).toBe(calculatorFixture().initialSavings);
  });

  it('never overwrites a save made while the start-up comparison was in flight', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    server.seed('calculator', calculatorFixture(), true);
    const realFetch = server.fetch;
    let edited = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!edited && String(input).endsWith('/state/calculator') && (init?.method ?? 'GET') === 'GET') {
        edited = true;
        saveFireCalculatorInputs({ ...calculatorFixture(), initialSavings: 777 });
      }
      return realFetch(input, init);
    }));
    const engine = createEngine();
    await engine.init();
    await settle(engine);

    expect(edited).toBe(true);
    expect(loadFireCalculatorInputs()?.initialSavings).toBe(777);
  });

  it('reports a rejected token and keeps changes queued', async () => {
    saveFireCalculatorInputs(calculatorFixture());
    await createEngine().init();
    server.requiredToken = 'rotated-token';
    const engine = restart();
    await engine.init();
    await settle(engine);
    expectDiagnostic('error', 'The backend rejected the access token.');
    expect(engine.getStatus().state).toBe('unauthorized');
    saveFireCalculatorInputs({ ...calculatorFixture(), initialSavings: 5 });
    expect(loadSyncState().outbox).toHaveLength(1);
  });

  it('stays local-only with a backend that has no sync routes', async () => {
    server.statusNotFound = true;
    const engine = createEngine();
    await engine.init();
    await settle(engine);
    saveFireCalculatorInputs(calculatorFixture());
    expect(engine.getStatus().state).toBe('disabled');
    expect(localStorage.getItem(SYNC_STATE_KEY)).toBeNull();
    expect(patches('calculator')).toHaveLength(0);
  });

  it('does nothing in the demo or without a backend', async () => {
    const demo = createEngine({ enabled: false });
    await demo.init();
    const pureWeb = restart({ resolveBackend: async () => null, expectsBackend: () => false });
    await pureWeb.init();
    await settle(pureWeb);
    saveFireCalculatorInputs(calculatorFixture());
    saveExpenseTrackerData(expenseTrackerFixture());
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(SYNC_STATE_KEY)).toBeNull();
    expect(pureWeb.getStatus().state).toBe('disabled');
    expect(loadFireCalculatorInputs()).toEqual(calculatorFixture());
  });

  it('continues on the local cache when the database does not answer in time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const engine = createEngine({ bootTimeoutMs: 8_000, requestTimeoutMs: 60_000 });
    let ready = false;
    void engine.init().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(true);
    expect(engine.getStatus().state).toBe('offline');
  });
});
