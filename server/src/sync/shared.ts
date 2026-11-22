import type { Database } from 'better-sqlite3';
import { z, ZodError } from 'zod';
import { isApiError } from '../http.js';

export const SYNC_DOMAINS = ['settings', 'calculator', 'assetAllocation', 'expenseTracker', 'netWorth'] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];
export const isSyncDomain = (value: string): value is SyncDomain => (SYNC_DOMAINS as readonly string[]).includes(value);

export type Entity = Record<string, unknown>;

/** Changes to one domain: singletons in `set`, collection items in `upsert`/`delete`. */
export interface Changeset {
  initialize?: boolean;
  set?: Record<string, unknown>;
  upsert?: Record<string, Entity[]>;
  delete?: Record<string, string[]>;
}

export interface DomainHandler {
  /** Singleton names accepted in `set`. */
  setKeys: readonly string[];
  /** Collections in upsert order (parents first); deletes run in reverse. */
  collections: readonly string[];
  hasData(db: Database, userId: number): boolean;
  read(db: Database, userId: number): unknown;
  /** Removes the user's data for the domain (PUT replace semantics). */
  clear(db: Database, userId: number): void;
  applySet(db: Database, userId: number, key: string, value: unknown): void;
  /** Stable key of an entity, or null when it cannot be derived. */
  keyOf(collection: string, entity: Entity): string | null;
  /** Inserts or updates every entity of one collection, in order. */
  upsert(db: Database, userId: number, collection: string, entities: Entity[]): void;
  remove(db: Database, userId: number, collection: string, key: string): void;
}

/** Rejected change, reported as `{ collection, key, message }`. */
export class SyncEntityError extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly collection: string | null,
    readonly key: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'SyncEntityError';
  }
}

const describeZod = (error: ZodError): string =>
  error.issues.map(issue => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('; ');

const describeApiDetails = (details: unknown): string => {
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (!fieldErrors) return '';
  const parts = Object.entries(fieldErrors).map(([field, messages]) => `${field}: ${messages.join(', ')}`);
  return parts.length ? ` (${parts.join('; ')})` : '';
};

const sqliteConstraintCode = (error: unknown): string | null =>
  error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')
    ? error.code
    : null;

/** Maps validation, API and SQLite constraint errors to a SyncEntityError; returns anything else unchanged. */
export const toSyncError = (error: unknown, collection: string | null, key: string | null): unknown => {
  if (error instanceof SyncEntityError) {
    return error.collection === null && collection !== null
      ? new SyncEntityError(error.status, collection, error.key ?? key, error.message)
      : error;
  }
  if (error instanceof ZodError) return new SyncEntityError(400, collection, key, describeZod(error));
  if (isApiError(error)) {
    const status = error.status === 409 ? 409 : 400;
    return new SyncEntityError(status, collection, key, `${error.message}${describeApiDetails(error.details)}`);
  }
  const code = sqliteConstraintCode(error);
  if (code) {
    const conflict = code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
    return new SyncEntityError(conflict ? 409 : 400, collection, key, (error as Error).message);
  }
  return error;
};

export const withEntity = <T>(collection: string | null, key: string | null, fn: () => T): T => {
  try {
    return fn();
  } catch (error) {
    throw toSyncError(error, collection, key);
  }
};

/** Drops null/undefined values so documents use absent optional keys. */
export const compact = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined));

/** Turns a granular API item (numeric `id`, `externalId`) into the app's entity (`id` = external id). */
export const asDocumentEntity = (mapped: Record<string, unknown>): Record<string, unknown> => {
  const { id: _rowId, externalId, ...rest } = mapped;
  return compact({ id: externalId, ...rest });
};

/** Granular validators and binders expect `externalId`; app entities carry it as `id`. */
export const asApiBody = (entity: Entity): Entity => ({ ...entity, externalId: entity.id });

export const ORDER_BY_POSITION = 'ORDER BY position IS NULL, position, id';

const columnList = (columns: string): string[] => columns.split(',').map(column => column.trim()).filter(Boolean);

/** INSERT ... ON CONFLICT DO UPDATE for every non-key column of `columns`. */
export const upsertStatement = (table: string, columns: string, conflict: string, extraUpdates: string[] = []): string => {
  const cols = columnList(columns);
  const keys = new Set(columnList(conflict));
  const updates = cols.filter(column => !keys.has(column)).map(column => `${column} = excluded.${column}`);
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
    ON CONFLICT (${conflict}) DO UPDATE SET ${[...updates, ...extraUpdates].join(', ')}`;
};

export const pad2 = (value: number): string => String(value).padStart(2, '0');
export const monthKey = (year: number, month: number): string => `${year}-${pad2(month)}`;

export const parseYearKey = (key: string): number => {
  if (!/^\d{4}$/.test(key)) throw new SyncEntityError(400, null, key, 'Year keys look like "2025".');
  return Number(key);
};

export const parseMonthKey = (key: string): { year: number; month: number } => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new SyncEntityError(400, null, key, 'Month keys look like "2025-03".');
  return { year: Number(match[1]), month };
};

export const fieldTypes = {
  id: z.string().min(1),
  string: z.string(),
  optionalString: z.string().nullish(),
  number: z.number(),
  optionalNumber: z.number().nullish(),
  boolean: z.boolean(),
  optionalBoolean: z.boolean().nullish(),
  year: z.number().int().min(1900).max(2200),
  month: z.number().int().min(1).max(12),
  position: z.number().int().nonnegative().nullish(),
};

export const yearEntity = z.looseObject({ year: fieldTypes.year, isArchived: fieldTypes.optionalBoolean });

/** Item stored in a month: the app's entity plus its parent month and list position. */
export const placed = <T extends z.ZodRawShape>(shape: T) =>
  z.looseObject({ ...shape, year: fieldTypes.year, month: fieldTypes.month, position: fieldTypes.position });

export const yearOf = (entity: Entity): string | null => (typeof entity.year === 'number' ? String(entity.year) : null);

export const monthOf = (entity: Entity): string | null =>
  typeof entity.year === 'number' && typeof entity.month === 'number' ? monthKey(entity.year, entity.month) : null;

export const idOf = (entity: Entity): string | null => (typeof entity.id === 'string' && entity.id ? entity.id : null);

export const positionOf = (entity: Entity): number | null => (typeof entity.position === 'number' ? entity.position : null);
