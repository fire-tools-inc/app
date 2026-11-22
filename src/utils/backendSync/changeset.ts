/**
 * Pure changeset helpers: serialize normalized documents, diff them, merge
 * queued changes in order and three-way merge stale views with remote data.
 */

import { canonicalStringify, isPlainObject } from './canonical';
import type {
  Changeset,
  ChangesetMode,
  DomainAdapter,
  Entity,
  NormalizedDoc,
  SerializedDoc,
} from './types';

type AdapterShape = Pick<DomainAdapter, 'singletons' | 'collections'>;

export function serializeDoc(doc: NormalizedDoc, adapter: AdapterShape): SerializedDoc {
  const set: Record<string, string> = {};
  for (const key of adapter.singletons) set[key] = canonicalStringify(doc.set[key] ?? null);
  const collections: Record<string, Record<string, string>> = {};
  for (const collection of adapter.collections) {
    const source = doc.collections[collection] ?? {};
    const target: Record<string, string> = {};
    for (const key of Object.keys(source)) target[key] = canonicalStringify(source[key]);
    collections[collection] = target;
  }
  return { set, collections };
}

export function deserializeDoc(doc: SerializedDoc): NormalizedDoc {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.set)) set[key] = JSON.parse(value) as unknown;
  const collections: Record<string, Record<string, Entity>> = {};
  for (const [collection, entries] of Object.entries(doc.collections)) {
    const target: Record<string, Entity> = {};
    for (const [key, value] of Object.entries(entries)) target[key] = JSON.parse(value) as Entity;
    collections[collection] = target;
  }
  return { set, collections };
}

export function serializedEqual(a: SerializedDoc, b: SerializedDoc): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}

export function emptySerializedDoc(adapter: AdapterShape): SerializedDoc {
  return serializeDoc({ set: {}, collections: {} }, adapter);
}

/** Changes that turn `prev` into `next`, with full entities for every upsert. */
export function diffSerialized(prev: SerializedDoc, next: SerializedDoc, adapter: AdapterShape): Changeset {
  const changeset: Changeset = {};
  for (const key of adapter.singletons) {
    const before = prev.set[key] ?? 'null';
    const after = next.set[key] ?? 'null';
    if (before !== after) (changeset.set ??= {})[key] = JSON.parse(after) as unknown;
  }
  for (const collection of adapter.collections) {
    const before = prev.collections[collection] ?? {};
    const after = next.collections[collection] ?? {};
    const upserts: Entity[] = [];
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) upserts.push(JSON.parse(after[key]) as Entity);
    }
    const deletes = Object.keys(before).filter((key) => !(key in after));
    if (upserts.length) (changeset.upsert ??= {})[collection] = upserts;
    if (deletes.length) (changeset.delete ??= {})[collection] = deletes;
  }
  return changeset;
}

/** Every singleton and entity of a document, for a replace (`PUT`). */
export function fullChangeset(doc: NormalizedDoc, adapter: AdapterShape, initialize: boolean): Changeset {
  const changeset: Changeset = initialize ? { initialize: true } : {};
  for (const key of adapter.singletons) {
    const value = doc.set[key];
    if (value !== undefined && value !== null) (changeset.set ??= {})[key] = value;
  }
  for (const collection of adapter.collections) {
    const entities = Object.values(doc.collections[collection] ?? {});
    if (entities.length) (changeset.upsert ??= {})[collection] = entities;
  }
  return changeset;
}

export function hasChangesetOperations(changeset: Changeset): boolean {
  return Boolean(
    (changeset.set && Object.keys(changeset.set).length)
    || (changeset.upsert && Object.values(changeset.upsert).some((entities) => entities.length))
    || (changeset.delete && Object.values(changeset.delete).some((keys) => keys.length)),
  );
}

export function countChangesetOperations(changeset: Changeset): number {
  return Object.keys(changeset.set ?? {}).length
    + Object.values(changeset.upsert ?? {}).reduce((sum, entities) => sum + entities.length, 0)
    + Object.values(changeset.delete ?? {}).reduce((sum, keys) => sum + keys.length, 0);
}

type EntityOperation = { op: 'upsert'; entity: Entity } | { op: 'delete' };

/**
 * Merges queued changesets in order: later singleton values and later
 * upserts win, a delete after an upsert deletes and an upsert after a delete
 * upserts. A replace discards everything queued before it, because the
 * server deletes the whole domain first.
 */
export function mergeChangesets(
  entries: readonly { mode: ChangesetMode; changeset: Changeset }[],
  keyOf: (collection: string, entity: Entity) => string,
): { mode: ChangesetMode; changeset: Changeset } {
  let mode: ChangesetMode = 'patch';
  let initialize = false;
  let set = new Map<string, unknown>();
  let collections = new Map<string, Map<string, EntityOperation>>();
  const operations = (collection: string) => {
    let existing = collections.get(collection);
    if (!existing) {
      existing = new Map();
      collections.set(collection, existing);
    }
    return existing;
  };

  for (const entry of entries) {
    if (entry.mode === 'replace') {
      mode = 'replace';
      set = new Map();
      collections = new Map();
    }
    const { changeset } = entry;
    if (changeset.initialize) initialize = true;
    for (const [collection, keys] of Object.entries(changeset.delete ?? {})) {
      const target = operations(collection);
      for (const key of keys) {
        target.delete(key);
        target.set(key, { op: 'delete' });
      }
    }
    for (const [key, value] of Object.entries(changeset.set ?? {})) set.set(key, value);
    for (const [collection, entities] of Object.entries(changeset.upsert ?? {})) {
      const target = operations(collection);
      for (const entity of entities) {
        const key = keyOf(collection, entity);
        target.delete(key);
        target.set(key, { op: 'upsert', entity });
      }
    }
  }

  const changeset: Changeset = initialize ? { initialize: true } : {};
  if (set.size) changeset.set = Object.fromEntries(set);
  for (const [collection, target] of collections) {
    const upserts: Entity[] = [];
    const deletes: string[] = [];
    for (const [key, operation] of target) {
      if (operation.op === 'upsert') upserts.push(operation.entity);
      else if (mode === 'patch') deletes.push(key);
    }
    if (upserts.length) (changeset.upsert ??= {})[collection] = upserts;
    if (deletes.length) (changeset.delete ??= {})[collection] = deletes;
  }
  return { mode, changeset };
}

function mergeSingleton(base: string, ours: string, theirs: string): string {
  if (ours === base) return theirs;
  if (theirs === base || theirs === ours) return ours;
  const parsedBase = JSON.parse(base) as unknown;
  const parsedOurs = JSON.parse(ours) as unknown;
  const parsedTheirs = JSON.parse(theirs) as unknown;
  if (!isPlainObject(parsedBase) || !isPlainObject(parsedOurs) || !isPlainObject(parsedTheirs)) return ours;
  // Both sides edited the same singleton: keep each field changed locally and
  // take the remote value for fields the stale view did not touch.
  const merged: Record<string, unknown> = {};
  for (const field of new Set([...Object.keys(parsedBase), ...Object.keys(parsedOurs), ...Object.keys(parsedTheirs)])) {
    const changedHere = canonicalStringify(parsedOurs[field]) !== canonicalStringify(parsedBase[field]);
    const value = changedHere ? parsedOurs[field] : parsedTheirs[field];
    if (value !== undefined) merged[field] = value;
  }
  return canonicalStringify(merged);
}

/**
 * Three-way merge for a save made by a view that still shows `base` after
 * the backend moved to `theirs`: entities the view changed win, everything
 * it merely carried over keeps the remote version.
 */
export function threeWayMerge(
  base: SerializedDoc,
  ours: SerializedDoc,
  theirs: SerializedDoc,
  adapter: AdapterShape,
): SerializedDoc {
  const set: Record<string, string> = {};
  for (const key of adapter.singletons) {
    set[key] = mergeSingleton(base.set[key] ?? 'null', ours.set[key] ?? 'null', theirs.set[key] ?? 'null');
  }
  const collections: Record<string, Record<string, string>> = {};
  for (const collection of adapter.collections) {
    const b = base.collections[collection] ?? {};
    const o = ours.collections[collection] ?? {};
    const t = theirs.collections[collection] ?? {};
    const merged: Record<string, string> = {};
    for (const key of new Set([...Object.keys(o), ...Object.keys(t), ...Object.keys(b)])) {
      const value = o[key] === b[key] ? t[key] : o[key];
      if (value !== undefined) merged[key] = value;
    }
    collections[collection] = merged;
  }
  return { set, collections };
}

export interface RejectionDetails {
  collection?: unknown;
  key?: unknown;
  message?: unknown;
}

/**
 * Splits the operation named by a `400`/`409` response's `details` out of a
 * changeset so the remaining valid edits can be retried. Returns null when
 * the details do not identify an operation in the changeset.
 */
export function splitRejectedOperation(
  changeset: Changeset,
  details: RejectionDetails | undefined,
  keyOf: (collection: string, entity: Entity) => string,
): { rejected: Changeset; remaining: Changeset } | null {
  if (!details || typeof details.collection !== 'string') return null;
  const collection = details.collection;
  const key = details.key === undefined || details.key === null ? undefined : String(details.key);
  const remaining: Changeset = structuredClone(changeset);

  const singletonKey = collection === 'set' ? key : collection;
  if (singletonKey !== undefined && remaining.set && singletonKey in remaining.set) {
    const value = remaining.set[singletonKey];
    delete remaining.set[singletonKey];
    if (!Object.keys(remaining.set).length) delete remaining.set;
    return { rejected: { set: { [singletonKey]: value } }, remaining };
  }
  if (key === undefined) return null;
  const upserts = remaining.upsert?.[collection];
  // Structural errors name the position in the sent array ("#3").
  const positional = /^#(\d+)$/.exec(key);
  const index = positional
    ? (upserts && Number(positional[1]) < upserts.length ? Number(positional[1]) : -1)
    : upserts?.findIndex((entity) => keyOf(collection, entity) === key) ?? -1;
  if (upserts && index >= 0) {
    const [entity] = upserts.splice(index, 1);
    if (!upserts.length) delete remaining.upsert![collection];
    if (!Object.keys(remaining.upsert!).length) delete remaining.upsert;
    return { rejected: { upsert: { [collection]: [entity] } }, remaining };
  }
  const deletes = remaining.delete?.[collection];
  const deleteIndex = positional ? -1 : deletes?.indexOf(key) ?? -1;
  if (deletes && deleteIndex >= 0) {
    const [deleted] = deletes.splice(deleteIndex, 1);
    if (!deletes.length) delete remaining.delete![collection];
    if (!Object.keys(remaining.delete!).length) delete remaining.delete;
    return { rejected: { delete: { [collection]: [deleted] } }, remaining };
  }
  return null;
}
