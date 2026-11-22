import { describe, expect, it } from 'vitest';
import { expenseTrackerAdapter } from '../../src/utils/backendSync/adapters';
import {
  diffSerialized,
  mergeChangesets,
  serializeDoc,
  splitRejectedOperation,
  threeWayMerge,
} from '../../src/utils/backendSync/changeset';
import type { Changeset, ChangesetMode } from '../../src/utils/backendSync/types';
import type { ExpenseEntry, ExpenseTrackerData } from '../../src/types/expenseTracker';
import { expenseTrackerFixture } from './backendSyncFixtures';

const adapter = expenseTrackerAdapter;
const keyOf = adapter.keyOf.bind(adapter);
const serialize = (doc: ExpenseTrackerData) => serializeDoc(adapter.normalize(doc), adapter);
const march = (doc: ExpenseTrackerData) => doc.years[1].months[0];
const expense = (id: string, amount: number): ExpenseEntry => ({
  id, type: 'expense', date: '2025-03-15', amount, description: `Synthetic ${id}`, category: 'OTHER', expenseType: 'WANT',
});
const entry = (mode: ChangesetMode, changeset: Changeset) => ({ mode, changeset });

describe('changeset diff', () => {
  it('ignores object identity and key order', () => {
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).reverse().map(([key, member]) => [key, reverseKeys(member)]));
    };
    const doc = expenseTrackerFixture();
    const reordered = reverseKeys(doc) as ExpenseTrackerData;
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(doc)[0]);
    expect(diffSerialized(serialize(doc), serialize(reordered), adapter)).toEqual({});
    expect(diffSerialized(serialize(doc), serialize(structuredClone(doc)), adapter)).toEqual({});
  });

  it('sends only changed entities, deletes and singletons', () => {
    const before = expenseTrackerFixture();
    const after = structuredClone(before);
    march(after).expenses[1].amount = 99;
    march(after).expenses.push(expense('exp-new', 5));
    march(after).incomes = [];
    after.currentMonth = 4;
    const changes = diffSerialized(serialize(before), serialize(after), adapter);
    expect(changes.set).toEqual({ config: { currency: 'EUR', currentYear: 2025, currentMonth: 4 } });
    expect(changes.upsert?.expenses.map((item) => [item.id, item.amount, item.position])).toEqual([
      ['exp-2', 99, 1],
      ['exp-new', 5, 2],
    ]);
    expect(changes.delete).toEqual({ incomes: ['inc-1'] });
  });
});

describe('ordered merge of queued changes', () => {
  it('keeps the latest version of every rapidly edited entity', () => {
    const merged = mergeChangesets([
      entry('patch', { upsert: { expenses: [{ id: 'a', amount: 1 }] } }),
      entry('patch', { upsert: { expenses: [{ id: 'a', amount: 2 }, { id: 'b', amount: 7 }] } }),
      entry('patch', { upsert: { expenses: [{ id: 'a', amount: 3 }] } }),
    ], keyOf);
    expect(merged).toEqual({ mode: 'patch', changeset: { upsert: { expenses: [{ id: 'b', amount: 7 }, { id: 'a', amount: 3 }] } } });
  });

  it('applies delete after upsert as delete and upsert after delete as upsert', () => {
    const merged = mergeChangesets([
      entry('patch', { upsert: { expenses: [{ id: 'a', amount: 1 }, { id: 'b', amount: 1 }] } }),
      entry('patch', { delete: { expenses: ['a', 'b'] } }),
      entry('patch', { upsert: { expenses: [{ id: 'b', amount: 4 }] }, set: { config: { currentMonth: 1 } } }),
      entry('patch', { set: { config: { currentMonth: 2 } } }),
    ], keyOf);
    expect(merged.changeset).toEqual({
      set: { config: { currentMonth: 2 } },
      upsert: { expenses: [{ id: 'b', amount: 4 }] },
      delete: { expenses: ['a'] },
    });
  });

  it('starts over at a replace and sends later edits with it', () => {
    const merged = mergeChangesets([
      entry('patch', { upsert: { expenses: [{ id: 'old', amount: 1 }] } }),
      entry('replace', { initialize: true }),
      entry('patch', { upsert: { expenses: [{ id: 'new', amount: 2 }] }, delete: { incomes: ['gone'] } }),
    ], keyOf);
    expect(merged).toEqual({ mode: 'replace', changeset: { initialize: true, upsert: { expenses: [{ id: 'new', amount: 2 }] } } });
  });

  it('never sends the same key twice in one collection', () => {
    const merged = mergeChangesets([
      entry('patch', { upsert: { monthBudgets: [{ year: 2025, month: 3, category: 'GROCERIES', monthlyBudget: 1 }] } }),
      entry('patch', { upsert: { monthBudgets: [{ year: 2025, month: 3, category: 'GROCERIES', monthlyBudget: 2 }] } }),
    ], keyOf);
    expect(merged.changeset.upsert?.monthBudgets).toEqual([{ year: 2025, month: 3, category: 'GROCERIES', monthlyBudget: 2 }]);
  });
});

describe('three-way merge for stale views', () => {
  it('keeps remote additions the view never saw alongside its own edits', () => {
    const base = expenseTrackerFixture();
    const remote = structuredClone(base);
    march(remote).expenses.push(expense('agent-1', 12));
    remote.globalBudgets[0].monthlyBudget = 175;
    const stale = structuredClone(base);
    march(stale).expenses[1].amount = 130;
    stale.currentMonth = 4;

    const merged = threeWayMerge(serialize(base), serialize(stale), serialize(remote), adapter);
    const result = adapter.denormalize({
      set: Object.fromEntries(Object.entries(merged.set).map(([key, value]) => [key, JSON.parse(value)])),
      collections: Object.fromEntries(Object.entries(merged.collections).map(([name, rows]) => [
        name, Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, JSON.parse(value)])),
      ])),
    })!;
    expect(march(result).expenses.map((item) => [item.id, item.amount])).toEqual([
      ['exp-1', 45], ['exp-2', 130], ['agent-1', 12],
    ]);
    expect(result.globalBudgets[0].monthlyBudget).toBe(175);
    expect(result.currentMonth).toBe(4);
  });

  it('merges singleton fields changed on different sides', () => {
    const base = expenseTrackerFixture();
    const remote = { ...base, currency: 'USD' as const };
    const stale = { ...base, currentMonth: 5 };
    const merged = threeWayMerge(serialize(base), serialize(stale), serialize(remote), adapter);
    expect(JSON.parse(merged.set.config)).toEqual({ currency: 'USD', currentYear: 2025, currentMonth: 5 });
  });
});

describe('rejection isolation', () => {
  const changeset: Changeset = {
    set: { config: { currentMonth: 3 } },
    upsert: { expenses: [{ id: 'ok', amount: 1 }, { id: 'bad', amount: -1 }] },
    delete: { incomes: ['inc-1'] },
  };

  it('splits out the entity named by details', () => {
    const split = splitRejectedOperation(changeset, { collection: 'expenses', key: 'bad' }, keyOf);
    expect(split?.rejected).toEqual({ upsert: { expenses: [{ id: 'bad', amount: -1 }] } });
    expect(split?.remaining.upsert).toEqual({ expenses: [{ id: 'ok', amount: 1 }] });
    expect(split?.remaining.delete).toEqual({ incomes: ['inc-1'] });
  });

  it('understands singleton and positional details', () => {
    expect(splitRejectedOperation(changeset, { collection: 'set', key: 'config' }, keyOf)?.rejected).toEqual({ set: { config: { currentMonth: 3 } } });
    expect(splitRejectedOperation(changeset, { collection: 'expenses', key: '#0' }, keyOf)?.rejected).toEqual({ upsert: { expenses: [{ id: 'ok', amount: 1 }] } });
    expect(splitRejectedOperation(changeset, { collection: 'expenses', key: 'missing' }, keyOf)).toBeNull();
    expect(splitRejectedOperation(changeset, undefined, keyOf)).toBeNull();
  });
});
