/**
 * Shared types for backend-authoritative storage. The HTTP contract lives in
 * docs/api/openapi.yaml (`/sync/status`, `/state/{domain}`).
 */

export const SYNC_DOMAINS = ['settings', 'calculator', 'assetAllocation', 'expenseTracker', 'netWorth'] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];

export function isSyncDomain(value: unknown): value is SyncDomain {
  return typeof value === 'string' && (SYNC_DOMAINS as readonly string[]).includes(value);
}

export type Entity = Record<string, unknown>;

/** Request body of `PATCH`/`PUT /state/{domain}`. */
export interface Changeset {
  /** Marks the domain server-authoritative (sets initialized_at once). */
  initialize?: boolean;
  /** Singletons; `null` deletes the row. */
  set?: Record<string, unknown>;
  /** Collection name to full entities. */
  upsert?: Record<string, Entity[]>;
  /** Collection name to entity keys. */
  delete?: Record<string, string[]>;
}

export type ChangesetMode = 'patch' | 'replace';

/** A document split into singletons and keyed collections. */
export interface NormalizedDoc {
  set: Record<string, unknown>;
  collections: Record<string, Record<string, Entity>>;
}

/** Canonical JSON per singleton/entity, used to diff without object identity. */
export interface SerializedDoc {
  set: Record<string, string>;
  collections: Record<string, Record<string, string>>;
}

export interface DomainAdapter<Doc = unknown> {
  readonly domain: SyncDomain;
  /** Singleton keys sent through `set`. */
  readonly singletons: readonly string[];
  /** Collections in parent-first order. */
  readonly collections: readonly string[];
  /** Current document in the local cache, or null when nothing is stored. */
  readLocal(): Doc | null;
  /** Replaces the local cache without recording an outbox change. */
  writeLocalCache(doc: Doc | null): void;
  normalize(doc: Doc | null): NormalizedDoc;
  /** Key of an entity in `collection`, as used in `delete` lists. */
  keyOf(collection: string, entity: Entity): string;
  denormalize(maps: NormalizedDoc): Doc | null;
  /** True when the document holds no user data (missing, defaults or untouched samples). */
  isEmpty(doc: Doc | null): boolean;
}

export interface DomainSyncStatus {
  revision: number;
  initialized: boolean;
}

export interface SyncStatusResponse {
  instanceId: string;
  domains: Record<SyncDomain, DomainSyncStatus>;
}

export interface StateResponse {
  domain: SyncDomain;
  instanceId: string;
  revision: number;
  initialized: boolean;
  data: unknown;
}

export interface WriteResponse {
  domain: SyncDomain;
  revision: number;
  previousRevision: number;
  initialized: boolean;
}

export interface OutboxEntry {
  id: number;
  domain: SyncDomain;
  /** Server instance the change was recorded against. */
  instanceId: string;
  mode: ChangesetMode;
  changeset: Changeset;
  createdAt: string;
}

export interface RejectedChange {
  id: string;
  domain: SyncDomain;
  createdAt: string;
  status: number;
  code: string;
  message: string;
  details?: unknown;
  changeset: Changeset;
}

export type SyncState = 'disabled' | 'starting' | 'saving' | 'saved' | 'offline' | 'unauthorized';

export interface DomainIssue {
  domain: SyncDomain;
  kind: 'backupFailed' | 'loadFailed' | 'saveFailed';
  message: string;
}

export interface BackendSyncStatus {
  state: SyncState;
  /** Queued local changes not yet confirmed by the backend. */
  pending: number;
  rejected: readonly RejectedChange[];
  conflicts: readonly SyncDomain[];
  issues: readonly DomainIssue[];
  /** True while a conflict choice is being applied. */
  resolving: boolean;
  lastSavedAt: number | null;
}
