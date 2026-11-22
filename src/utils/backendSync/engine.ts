/**
 * Backend-authoritative storage engine.
 *
 * When a backend is reachable, SQLite is the source of truth for the five
 * synced domains. The synchronous local stores remain a cache plus a
 * persisted outbox: saves are diffed against an in-memory snapshot and queued,
 * flushed with `PATCH /state/{domain}`, and remote writes (for example from an
 * agent using the API) are pulled in by polling `GET /sync/status`.
 */

import { apiFetchAt, resolveBackend as resolveConfiguredBackend, type ResolvedBackend } from '../apiClient';
import { loadSettings, subscribeToSettingsChanges } from '../cookieSettings';
import { IS_DEMO_MODE } from '../demoMode';
import { logger } from '../logger';
import { SYNC_ADAPTERS } from './adapters';
import { canonicalStringify, isPlainObject } from './canonical';
import {
  deserializeDoc,
  diffSerialized,
  emptySerializedDoc,
  fullChangeset,
  hasChangesetOperations,
  mergeChangesets,
  serializeDoc,
  serializedEqual,
  splitRejectedOperation,
  threeWayMerge,
  type RejectionDetails,
} from './changeset';
import { setLocalChangeSink, withLocalChangesSuppressed } from './localChanges';
import { emptySyncState, loadSyncState, saveSyncState, type PersistedSyncState } from './syncStore';
import {
  SYNC_DOMAINS,
  isSyncDomain,
  type BackendSyncStatus,
  type Changeset,
  type ChangesetMode,
  type DomainAdapter,
  type DomainIssue,
  type DomainSyncStatus,
  type OutboxEntry,
  type RejectedChange,
  type SerializedDoc,
  type StateResponse,
  type SyncDomain,
  type SyncStatusResponse,
  type WriteResponse,
} from './types';

const SECTION = 'backend-sync';
const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const MAX_REJECTION_SPLITS = 50;
const MAX_OUTBOX_ENTRIES = 100;

type FailureKind = 'network' | 'retryable' | 'unauthorized' | 'rejected';

export class SyncHttpError extends Error {
  constructor(
    readonly kind: FailureKind,
    readonly status: number,
    readonly code: string,
    message: string,
    readonly path: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'SyncHttpError';
  }
}

class InstanceChangedError extends Error {
  constructor() {
    super('The database behind the backend changed.');
    this.name = 'InstanceChangedError';
  }
}

type Connection = 'unknown' | 'online' | 'offline' | 'unauthorized' | 'unsupported';

interface DomainRuntime {
  /** Local saves are recorded only while active. */
  active: boolean;
  /** What the backend holds plus queued changes, per entity. */
  snapshot: SerializedDoc | null;
  /** What mounted views showed before a remote change landed, until they remount. */
  viewBase: SerializedDoc | null;
  viewGeneration: number;
  /** Increments on every local save, active or not, to detect races. */
  seq: number;
  conflict: boolean;
  /** Revision whose data could not be written locally; not retried until it changes. */
  failedRevision: number | null;
}

export interface BackupResult {
  ok: boolean;
  error?: string;
}

export interface BackendSyncEngineOptions {
  enabled?: boolean;
  resolveBackend?: () => Promise<ResolvedBackend | null>;
  /** Whether a backend is expected (desktop bridge or custom URL) even if it is not ready yet. */
  expectsBackend?: () => boolean;
  createBackup?: () => Promise<BackupResult>;
  adapters?: Record<SyncDomain, DomainAdapter>;
  pollIntervalMs?: number;
  bootTimeoutMs?: number;
  flushDelayMs?: number;
  requestTimeoutMs?: number;
}

export interface RemoteChangeEvent {
  generation: number;
  domains: SyncDomain[];
}

const defaultExpectsBackend = (): boolean => {
  const { backend } = loadSettings();
  if (backend.mode === 'custom') return Boolean(backend.customUrl);
  return typeof window !== 'undefined' && typeof window.fireTools?.getEmbeddedBackend === 'function';
};

const defaultCreateBackup = async (): Promise<BackupResult> => {
  const create = typeof window !== 'undefined' ? window.fireTools?.backups?.create : undefined;
  if (!create) return { ok: false, error: 'Database backups are not available in this app.' };
  const result = await create();
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'The backup could not be created.' };
};

const backendConfigKey = (): string => {
  const { backend } = loadSettings();
  return backend.mode === 'custom' ? `custom|${backend.customUrl ?? ''}|${backend.customToken ?? ''}` : 'embedded';
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function parseStatusResponse(value: unknown, path: string): SyncStatusResponse {
  if (!isPlainObject(value) || typeof value.instanceId !== 'string' || !isPlainObject(value.domains)) {
    throw new SyncHttpError('retryable', 200, 'invalid_response', 'The backend returned an invalid sync status.', path);
  }
  const domains = {} as Record<SyncDomain, DomainSyncStatus>;
  for (const domain of SYNC_DOMAINS) {
    const entry = value.domains[domain];
    domains[domain] = isPlainObject(entry)
      ? { revision: typeof entry.revision === 'number' ? entry.revision : 0, initialized: entry.initialized === true }
      : { revision: 0, initialized: false };
  }
  return { instanceId: value.instanceId, domains };
}

function parseStateResponse(value: unknown, domain: SyncDomain, path: string): StateResponse {
  if (!isPlainObject(value) || typeof value.instanceId !== 'string' || typeof value.revision !== 'number' || !('data' in value)) {
    throw new SyncHttpError('retryable', 200, 'invalid_response', 'The backend returned invalid data.', path);
  }
  return { domain, instanceId: value.instanceId, revision: value.revision, initialized: value.initialized === true, data: value.data ?? null };
}

function parseWriteResponse(value: unknown, domain: SyncDomain, path: string): WriteResponse {
  if (!isPlainObject(value) || typeof value.revision !== 'number' || typeof value.previousRevision !== 'number') {
    throw new SyncHttpError('retryable', 200, 'invalid_response', 'The backend returned an invalid save response.', path);
  }
  return { domain, revision: value.revision, previousRevision: value.previousRevision, initialized: value.initialized === true };
}

export class BackendSyncEngine {
  private readonly enabled: boolean;
  private readonly resolveBackendImpl: () => Promise<ResolvedBackend | null>;
  private readonly expectsBackend: () => boolean;
  private readonly createBackup: () => Promise<BackupResult>;
  private readonly adapters: Record<SyncDomain, DomainAdapter>;
  private readonly pollIntervalMs: number;
  private readonly bootTimeoutMs: number;
  private readonly flushDelayMs: number;
  private readonly requestTimeoutMs: number;

  private store: PersistedSyncState = emptySyncState();
  private readonly domains = {} as Record<SyncDomain, DomainRuntime>;
  private backend: ResolvedBackend | null = null;
  private configKey: string | null = null;
  private instanceId: string | null = null;
  private connection: Connection = 'unknown';
  private booted = false;
  private viewsActive = false;
  private initPromise: Promise<void> | null = null;
  private settleBoot: (() => void) | null = null;
  private disposed = false;

  private queue: Promise<unknown> = Promise.resolve();
  private flushQueued = false;
  private pollQueued = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryAttempt = 0;
  private inFlight = 0;
  private resolving = false;
  private lastSavedAt: number | null = null;
  private backupPromise: Promise<BackupResult> | null = null;
  private readonly issues = new Map<SyncDomain, DomainIssue>();
  private readonly controllers = new Set<AbortController>();
  private cleanup: Array<() => void> = [];

  private remoteGeneration = 0;
  private readonly statusListeners = new Set<() => void>();
  private readonly remoteListeners = new Set<(event: RemoteChangeEvent) => void>();
  private status: BackendSyncStatus;
  private emitScheduled = false;

  constructor(options: BackendSyncEngineOptions = {}) {
    this.enabled = options.enabled ?? !IS_DEMO_MODE;
    this.resolveBackendImpl = options.resolveBackend ?? resolveConfiguredBackend;
    this.expectsBackend = options.expectsBackend ?? defaultExpectsBackend;
    this.createBackup = options.createBackup ?? defaultCreateBackup;
    this.adapters = options.adapters ?? SYNC_ADAPTERS;
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    this.bootTimeoutMs = options.bootTimeoutMs ?? 8_000;
    this.flushDelayMs = options.flushDelayMs ?? 100;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    for (const domain of SYNC_DOMAINS) {
      this.domains[domain] = { active: false, snapshot: null, viewBase: null, viewGeneration: 0, seq: 0, conflict: false, failedRevision: null };
    }
    this.status = this.computeStatus();
  }

  // ---------------------------------------------------------------- public API

  /**
   * Starts backend storage. Resolves once the boot decision completed or
   * after the boot timeout (the app then continues on the local cache while
   * the engine keeps retrying in the background).
   */
  init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    if (!this.enabled) {
      this.initPromise = Promise.resolve();
      return this.initPromise;
    }
    this.store = loadSyncState();
    for (const domain of SYNC_DOMAINS) {
      if (this.store.domains[domain]) this.activateFromLocal(domain);
    }
    setLocalChangeSink({
      change: (domain, doc) => this.handleLocalChange(domain, doc),
      clear: (domain) => this.handleLocalClear(domain),
    });
    this.configKey = backendConfigKey();
    this.installListeners();

    // Resolves when the first boot reached a usable state; transient
    // failures keep retrying (the desktop backend may still be starting).
    const settled = new Promise<void>((resolve) => {
      this.settleBoot = () => {
        this.settleBoot = null;
        resolve();
      };
    });
    void this.exclusive(() => this.boot());
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        if (!this.booted && this.connection !== 'unsupported') {
          logger.systemEvent(SECTION, 'boot-timeout', 'The database did not answer in time; continuing with the data on this device.');
          if (this.connection === 'unknown') this.connection = 'offline';
          this.scheduleEmit();
        }
        resolve();
      }, this.bootTimeoutMs);
    });
    this.initPromise = Promise.race([settled, timeout]).then(() => {
      if (timer) clearTimeout(timer);
      this.viewsActive = true;
      this.scheduleEmit();
    });
    return this.initPromise;
  }

  dispose(): void {
    this.disposed = true;
    setLocalChangeSink(null);
    for (const remove of this.cleanup) remove();
    this.cleanup = [];
    for (const timer of [this.flushTimer, this.retryTimer]) if (timer) clearTimeout(timer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.flushTimer = this.retryTimer = this.pollTimer = null;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.statusListeners.clear();
    this.remoteListeners.clear();
  }

  getStatus = (): BackendSyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  subscribeRemoteChanges(listener: (event: RemoteChangeEvent) => void): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  getRemoteGeneration(): number {
    return this.remoteGeneration;
  }

  /** Called after views remounted with data up to `generation`. */
  acknowledgeViewRefresh(generation: number): void {
    for (const domain of SYNC_DOMAINS) {
      const runtime = this.domains[domain];
      if (runtime.viewBase && runtime.viewGeneration <= generation) runtime.viewBase = null;
    }
  }

  /** Pages are already showing data (engine started after the first render). */
  markViewsActive(): void {
    this.viewsActive = true;
  }

  isDomainActive(domain: SyncDomain): boolean {
    return this.enabled && this.domains[domain].active;
  }

  /** Waits for queued work (tests and explicit user actions). */
  whenIdle(): Promise<void> {
    return this.exclusive(async () => undefined);
  }

  flushNow(): Promise<void> {
    return this.exclusive(() => this.flushSafely());
  }

  pollNow(): Promise<void> {
    return this.exclusive(() => this.pollSafely());
  }

  retryNow(): Promise<void> {
    this.clearRetry();
    this.retryAttempt = 0;
    this.booted = false;
    return this.exclusive(() => this.boot());
  }

  resolveConflicts(choice: 'database' | 'device'): Promise<void> {
    return this.exclusive(async () => {
      const domains = SYNC_DOMAINS.filter((domain) => this.domains[domain].conflict);
      if (!domains.length || !this.backend || !this.instanceId) return;
      this.resolving = true;
      this.scheduleEmit();
      try {
        if (choice === 'device' && this.backend.mode === 'embedded') {
          this.backupPromise = null;
          const backup = await this.ensureBackup();
          if (!backup.ok) {
            for (const domain of domains) this.setIssue(domain, 'backupFailed', backup.error ?? '');
            return;
          }
        }
        for (const domain of domains) {
          if (choice === 'database') await this.hydrate(domain);
          else await this.replaceWithLocal(domain);
        }
        logger.userAction(SECTION, 'conflict-resolved', choice === 'database'
          ? 'Replaced data on this device with the database copy.'
          : 'Replaced the database with the data on this device.', { pii: { domains } });
      } catch (error) {
        this.handleFailure(error);
      } finally {
        this.resolving = false;
        this.scheduleEmit();
      }
    });
  }

  dismissRejected(id?: string): void {
    this.store.rejected = id ? this.store.rejected.filter((change) => change.id !== id) : [];
    this.persist();
    this.scheduleEmit();
  }

  // ---------------------------------------------------------- local changes

  private handleLocalChange(domain: SyncDomain, doc: unknown): void {
    const runtime = this.domains[domain];
    runtime.seq += 1;
    if (!runtime.active || !runtime.snapshot || this.disposed) return;
    const adapter = this.adapters[domain];
    try {
      let next = serializeDoc(adapter.normalize(doc), adapter);
      if (runtime.viewBase) {
        // The view that saved still shows data from before a remote change:
        // keep its edits and the remote ones instead of reverting the latter.
        const merged = threeWayMerge(runtime.viewBase, next, runtime.snapshot, adapter);
        if (!serializedEqual(merged, next)) {
          next = merged;
          try {
            withLocalChangesSuppressed(() => adapter.writeLocalCache(adapter.denormalize(deserializeDoc(merged))));
          } catch (error) {
            logger.error(SECTION, 'merge-write-failed', 'Merged data could not be written on this device; the database has the merged copy.', {
              pii: { domain, error: errorMessage(error) },
            });
          }
          this.notifyRemoteChange(domain);
        }
      }
      const changeset = diffSerialized(runtime.snapshot, next, adapter);
      runtime.snapshot = next;
      if (hasChangesetOperations(changeset)) this.enqueue(domain, 'patch', changeset);
    } catch (error) {
      logger.error(SECTION, 'record-failed', 'A change could not be prepared for the database.', {
        pii: { domain, error: errorMessage(error) },
      });
    }
  }

  private handleLocalClear(domain: SyncDomain): void {
    const runtime = this.domains[domain];
    runtime.seq += 1;
    if (!runtime.active || this.disposed) return;
    runtime.snapshot = emptySerializedDoc(this.adapters[domain]);
    runtime.viewBase = null;
    this.enqueue(domain, 'replace', { initialize: true });
  }

  private enqueue(domain: SyncDomain, mode: ChangesetMode, changeset: Changeset): void {
    const marker = this.store.domains[domain];
    if (!marker) return;
    const entry: OutboxEntry = {
      id: this.store.nextId,
      domain,
      instanceId: marker.instanceId,
      mode,
      changeset,
      createdAt: new Date().toISOString(),
    };
    this.store.nextId += 1;
    this.store.outbox.push(entry);
    this.compactOutbox();
    this.persist();
    this.scheduleEmit();
    this.scheduleFlush();
  }

  private activateFromLocal(domain: SyncDomain): void {
    const runtime = this.domains[domain];
    const adapter = this.adapters[domain];
    try {
      runtime.snapshot = serializeDoc(adapter.normalize(adapter.readLocal()), adapter);
      runtime.active = true;
    } catch (error) {
      logger.error(SECTION, 'snapshot-failed', 'Local data could not be prepared for the database.', {
        pii: { domain, error: errorMessage(error) },
      });
    }
  }

  // ------------------------------------------------------------------ boot

  private async boot(): Promise<void> {
    if (!this.enabled || this.disposed) return;
    this.backupPromise = null;
    const backend = await this.resolveBackendImpl().catch((error: unknown) => {
      logger.error(SECTION, 'backend-resolution-failed', 'The backend address could not be resolved.', { pii: { error: errorMessage(error) } });
      return null;
    });
    if (!backend) {
      this.backend = null;
      if (this.expectsBackend()) {
        // Show the cached data now; retries pick the backend up once it starts.
        this.connection = 'offline';
        this.settleBoot?.();
        this.scheduleRetry();
      } else {
        this.connection = 'unknown';
        this.settleBoot?.();
      }
      this.scheduleEmit();
      return;
    }
    this.backend = backend;
    try {
      const status = await this.fetchStatus();
      this.instanceId = status.instanceId;
      this.markOnline();
      await this.flushAll();
      for (const domain of SYNC_DOMAINS) {
        try {
          await this.decideDomain(domain, status.domains[domain]);
        } catch (error) {
          if (error instanceof SyncHttpError && error.kind !== 'rejected') throw error;
          if (error instanceof InstanceChangedError) throw error;
          this.setIssue(domain, 'loadFailed', errorMessage(error));
          logger.error(SECTION, 'domain-start-failed', 'Data could not be loaded from the database.', {
            pii: { domain, error: errorMessage(error) },
          });
        }
      }
      this.booted = true;
      logger.systemEvent(SECTION, 'ready', 'Data is stored in the database.');
      this.settleBoot?.();
      // Saves recorded while the boot decision was running.
      if (this.hasPending()) this.scheduleFlush();
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.scheduleEmit();
    }
  }

  private async decideDomain(domain: SyncDomain, remote: DomainSyncStatus): Promise<void> {
    const runtime = this.domains[domain];
    const adapter = this.adapters[domain];
    const marker = this.store.domains[domain];
    runtime.conflict = false;

    if (remote.initialized && marker?.instanceId === this.instanceId) {
      if (!runtime.active) this.activateFromLocal(domain);
      if (this.hasPending(domain)) return;
      await this.hydrate(domain);
      return;
    }

    // Never synced with this database: stop recording against an old marker.
    runtime.active = false;
    const local = adapter.readLocal();
    const localEmpty = adapter.isEmpty(local);

    if (!remote.initialized) {
      if (localEmpty) {
        // Agent-first onboarding: the database copy wins.
        await this.request('PATCH', `/state/${domain}`, { initialize: true });
        await this.hydrate(domain);
        return;
      }
      if (this.backend?.mode === 'custom') {
        const server = await this.getState(domain);
        if (server.data !== null && !adapter.isEmpty(server.data)) {
          if (this.sameContent(adapter, local, server.data)) {
            await this.request('PATCH', `/state/${domain}`, { initialize: true });
            await this.hydrate(domain);
          } else {
            this.markConflict(domain);
          }
          return;
        }
      } else {
        // Before this release the app never showed database data, so this
        // device wins; keep a restorable copy of the database first.
        const backup = await this.ensureBackup();
        if (!backup.ok) {
          this.setIssue(domain, 'backupFailed', backup.error ?? '');
          logger.error(SECTION, 'backup-failed', 'The database was not changed because a backup could not be created.', {
            pii: { domain, error: backup.error },
          });
          return;
        }
      }
      await this.replaceWithLocal(domain);
      return;
    }

    if (localEmpty) {
      await this.hydrate(domain);
      return;
    }
    const server = await this.getState(domain);
    if (server.instanceId !== this.instanceId) throw new InstanceChangedError();
    if (this.sameContent(adapter, local, server.data)) {
      this.applyState(domain, server);
      return;
    }
    this.markConflict(domain);
  }

  private sameContent(adapter: DomainAdapter, local: unknown, remote: unknown): boolean {
    return serializedEqual(serializeDoc(adapter.normalize(local), adapter), serializeDoc(adapter.normalize(remote), adapter));
  }

  private markConflict(domain: SyncDomain): void {
    const runtime = this.domains[domain];
    runtime.conflict = true;
    runtime.active = false;
    logger.systemEvent(SECTION, 'conflict', 'This device and the database hold different data; waiting for a choice.', { pii: { domain } });
    this.scheduleEmit();
  }

  private ensureBackup(): Promise<BackupResult> {
    this.backupPromise ??= this.createBackup().catch((error: unknown) => ({ ok: false, error: errorMessage(error) }));
    return this.backupPromise;
  }

  /** Replaces the backend domain with this device's data (`PUT`, initialize). */
  private async replaceWithLocal(domain: SyncDomain): Promise<void> {
    const runtime = this.domains[domain];
    const adapter = this.adapters[domain];
    runtime.active = false;
    const seq = runtime.seq;
    const normalized = adapter.normalize(adapter.readLocal());
    const { response, rejected } = await this.sendWithRejections(domain, 'replace', fullChangeset(normalized, adapter, true));
    this.addRejected(rejected);
    if (!response) {
      this.setIssue(domain, 'saveFailed', rejected[0]?.message ?? '');
      this.persist();
      return;
    }
    this.dropOutbox((entry) => entry.domain === domain);
    this.store.domains[domain] = { instanceId: this.instanceId!, revision: response.revision };
    runtime.snapshot = serializeDoc(normalized, adapter);
    runtime.active = true;
    runtime.conflict = false;
    runtime.failedRevision = null;
    this.clearIssue(domain);
    this.persist();
    if (rejected.length) {
      await this.hydrate(domain);
    } else if (runtime.seq !== seq) {
      // Edits made while the replacement was in flight.
      this.handleLocalChange(domain, adapter.readLocal());
    }
  }

  // --------------------------------------------------------------- hydrate

  /** Loads the backend copy into the local cache. Returns false when skipped. */
  private async hydrate(domain: SyncDomain): Promise<boolean> {
    const runtime = this.domains[domain];
    const seq = runtime.seq;
    const state = await this.getState(domain);
    if (state.instanceId !== this.instanceId) throw new InstanceChangedError();
    // A local edit arrived meanwhile: flush it first, then load again.
    if (runtime.seq !== seq || this.hasPending(domain)) return false;
    return this.applyState(domain, state);
  }

  private applyState(domain: SyncDomain, state: StateResponse): boolean {
    const runtime = this.domains[domain];
    const adapter = this.adapters[domain];
    const doc = adapter.denormalize(adapter.normalize(state.data));
    const next = serializeDoc(adapter.normalize(doc), adapter);
    let shown: SerializedDoc;
    try {
      shown = serializeDoc(adapter.normalize(adapter.readLocal()), adapter);
    } catch {
      shown = emptySerializedDoc(adapter);
    }
    const changed = !serializedEqual(shown, next);
    if (changed) {
      try {
        withLocalChangesSuppressed(() => adapter.writeLocalCache(doc));
      } catch (error) {
        runtime.failedRevision = state.revision;
        this.setIssue(domain, 'loadFailed', errorMessage(error));
        logger.error(SECTION, 'hydrate-failed', 'Database data could not be stored on this device.', {
          pii: { domain, revision: state.revision, error: errorMessage(error) },
        });
        return false;
      }
    }
    this.dropOutbox((entry) => entry.domain === domain && entry.instanceId !== state.instanceId);
    this.store.domains[domain] = { instanceId: state.instanceId, revision: state.revision };
    runtime.snapshot = next;
    runtime.active = true;
    runtime.conflict = false;
    runtime.failedRevision = null;
    this.clearIssue(domain);
    this.persist();
    if (changed && this.viewsActive) {
      if (!runtime.viewBase) runtime.viewBase = shown;
      this.notifyRemoteChange(domain);
    }
    this.scheduleEmit();
    return changed;
  }

  private notifyRemoteChange(domain: SyncDomain): void {
    this.remoteGeneration += 1;
    const generation = this.remoteGeneration;
    const runtime = this.domains[domain];
    if (runtime.viewBase) runtime.viewGeneration = generation;
    // Deliver outside the caller's stack: saves may run inside React renders.
    setTimeout(() => {
      if (this.disposed) return;
      for (const listener of this.remoteListeners) listener({ generation, domains: [domain] });
    }, 0);
  }

  // ----------------------------------------------------------------- flush

  private scheduleFlush(): void {
    if (this.flushTimer || this.flushQueued || this.disposed) return;
    if (!this.booted || this.connection !== 'online') return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushQueued = true;
      void this.exclusive(async () => {
        this.flushQueued = false;
        await this.flushSafely();
      });
    }, this.flushDelayMs);
  }

  private async flushSafely(): Promise<void> {
    if (!this.booted || !this.backend) return;
    try {
      await this.flushAll();
      this.markOnline();
    } catch (error) {
      this.handleFailure(error);
    }
  }

  private async flushAll(): Promise<void> {
    for (const domain of SYNC_DOMAINS) {
      const entries = this.store.outbox.filter((entry) => entry.domain === domain && entry.instanceId === this.instanceId);
      if (entries.length) await this.flushDomain(domain, entries);
    }
  }

  private async flushDomain(domain: SyncDomain, entries: OutboxEntry[]): Promise<void> {
    const adapter = this.adapters[domain];
    const { mode, changeset } = mergeChangesets(entries, (collection, entity) => adapter.keyOf(collection, entity));
    this.inFlight += 1;
    this.scheduleEmit();
    try {
      const { response, rejected } = await this.sendWithRejections(domain, mode, changeset);
      const sent = new Set(entries.map((entry) => entry.id));
      this.dropOutbox((entry) => sent.has(entry.id));
      this.addRejected(rejected);
      let needsHydrate = rejected.length > 0;
      const marker = this.store.domains[domain];
      if (response && marker) {
        if (response.previousRevision === marker.revision) marker.revision = response.revision;
        else needsHydrate = true;
      }
      this.lastSavedAt = Date.now();
      this.persist();
      if (needsHydrate && !this.hasPending(domain)) await this.hydrate(domain);
    } finally {
      this.inFlight -= 1;
      this.scheduleEmit();
    }
  }

  /**
   * Sends a changeset; on a 4xx naming one invalid item, sets that item aside
   * as rejected and retries the remaining valid edits.
   */
  private async sendWithRejections(
    domain: SyncDomain,
    mode: ChangesetMode,
    changeset: Changeset,
  ): Promise<{ response: WriteResponse | null; rejected: RejectedChange[] }> {
    const adapter = this.adapters[domain];
    const rejected: RejectedChange[] = [];
    let current = changeset;
    for (let attempt = 0; attempt <= MAX_REJECTION_SPLITS; attempt += 1) {
      try {
        const path = `/state/${domain}`;
        const body = await this.request(mode === 'replace' ? 'PUT' : 'PATCH', path, current);
        return { response: parseWriteResponse(body, domain, path), rejected };
      } catch (error) {
        if (!(error instanceof SyncHttpError) || error.kind !== 'rejected') throw error;
        const split = attempt < MAX_REJECTION_SPLITS
          ? splitRejectedOperation(current, error.details as RejectionDetails | undefined, (collection, entity) => adapter.keyOf(collection, entity))
          : null;
        logger.error(SECTION, 'change-rejected', 'The database refused a change.', {
          pii: { domain, status: error.status, code: error.code, message: error.message, details: error.details },
        });
        if (split && (mode === 'replace' || hasChangesetOperations(split.remaining))) {
          rejected.push(this.rejection(domain, error, split.rejected));
          current = split.remaining;
          continue;
        }
        rejected.push(this.rejection(domain, error, current));
        return { response: null, rejected };
      }
    }
    return { response: null, rejected };
  }

  private rejection(domain: SyncDomain, error: SyncHttpError, changeset: Changeset): RejectedChange {
    return {
      id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      domain,
      createdAt: new Date().toISOString(),
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      changeset,
    };
  }

  private addRejected(changes: RejectedChange[]): void {
    for (const change of changes) {
      const signature = canonicalStringify([change.domain, change.code, change.message, change.changeset]);
      const duplicate = this.store.rejected.some((existing) => (
        canonicalStringify([existing.domain, existing.code, existing.message, existing.changeset]) === signature
      ));
      if (!duplicate) this.store.rejected.push(change);
    }
  }

  // ------------------------------------------------------------------ poll

  private async pollSafely(): Promise<void> {
    if (!this.enabled || this.disposed) return;
    if (!this.booted) {
      await this.boot();
      return;
    }
    try {
      const status = await this.fetchStatus();
      this.markOnline();
      if (status.instanceId !== this.instanceId
        || SYNC_DOMAINS.some((domain) => this.domains[domain].active && !status.domains[domain].initialized)) {
        throw new InstanceChangedError();
      }
      // Domains with queued changes learn about remote writes from the
      // flush response (previousRevision); the others hydrate directly.
      const changed = SYNC_DOMAINS.filter((domain) => {
        const runtime = this.domains[domain];
        const remote = status.domains[domain];
        return runtime.active
          && !this.hasPending(domain)
          && remote.revision !== this.store.domains[domain]?.revision
          && remote.revision !== runtime.failedRevision;
      });
      await this.flushAll();
      for (const domain of changed) {
        if (!this.hasPending(domain)) await this.hydrate(domain);
      }
      // A start-up decision skipped because of a concurrent local edit.
      for (const domain of SYNC_DOMAINS) {
        const runtime = this.domains[domain];
        if (!runtime.active && !runtime.conflict && !this.issues.has(domain)) {
          await this.decideDomain(domain, status.domains[domain]);
        }
      }
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.scheduleEmit();
    }
  }

  private installListeners(): void {
    if (typeof window === 'undefined') return;
    const pollIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (this.retryTimer) return;
      if (!this.backend && !this.expectsBackend()) return;
      this.queuePoll();
    };
    const pollNowOnReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // Returning to the app retries immediately instead of waiting for the backoff.
      this.clearRetry();
      this.queuePoll();
    };
    this.pollTimer = setInterval(pollIfVisible, this.pollIntervalMs);
    window.addEventListener('focus', pollNowOnReturn);
    document.addEventListener('visibilitychange', pollNowOnReturn);
    const unsubscribeSettings = subscribeToSettingsChanges(() => this.handleSettingsChange());
    this.cleanup.push(
      () => window.removeEventListener('focus', pollNowOnReturn),
      () => document.removeEventListener('visibilitychange', pollNowOnReturn),
      unsubscribeSettings,
    );
  }

  private queuePoll(): void {
    if (this.pollQueued || this.disposed || this.connection === 'unsupported') return;
    this.pollQueued = true;
    void this.exclusive(async () => {
      this.pollQueued = false;
      await this.pollSafely();
    });
  }

  private handleSettingsChange(): void {
    const key = backendConfigKey();
    if (key === this.configKey) return;
    this.configKey = key;
    // A different backend: decide again for every domain.
    this.backend = null;
    this.instanceId = null;
    this.booted = false;
    this.connection = 'unknown';
    this.retryAttempt = 0;
    this.clearRetry();
    this.issues.clear();
    for (const domain of SYNC_DOMAINS) this.domains[domain].conflict = false;
    this.scheduleEmit();
    void this.exclusive(() => this.boot());
  }

  // --------------------------------------------------------------- network

  private async request(method: 'GET' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<unknown> {
    const backend = this.backend;
    if (!backend) throw new SyncHttpError('network', 0, 'backend_unavailable', 'No backend is configured.', path);
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let response: Response;
    try {
      response = await apiFetchAt(backend, path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (error) {
      throw new SyncHttpError('network', 0, 'network_error', errorMessage(error), path);
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        throw new SyncHttpError('retryable', response.status, 'invalid_response', 'The backend returned a response that is not JSON.', path);
      }
    }
    const envelope = await response.json().catch(() => null) as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null;
    const code = typeof envelope?.error?.code === 'string' ? envelope.error.code : `http_${response.status}`;
    const message = typeof envelope?.error?.message === 'string' ? envelope.error.message : `HTTP ${response.status}`;
    const status = response.status;
    const kind: FailureKind = status === 401 || status === 403
      ? 'unauthorized'
      : status === 408 || status === 425 || status === 429 || status >= 500 ? 'retryable' : 'rejected';
    throw new SyncHttpError(kind, status, code, message, path, envelope?.error?.details);
  }

  private async fetchStatus(): Promise<SyncStatusResponse> {
    return parseStatusResponse(await this.request('GET', '/sync/status'), '/sync/status');
  }

  private async getState(domain: SyncDomain): Promise<StateResponse> {
    const path = `/state/${domain}`;
    return parseStateResponse(await this.request('GET', path), domain, path);
  }

  private handleFailure(error: unknown): void {
    if (error instanceof InstanceChangedError) {
      logger.systemEvent(SECTION, 'instance-changed', 'The database changed; comparing it with this device again.');
      this.booted = false;
      this.scheduleRetry(0);
      return;
    }
    if (!(error instanceof SyncHttpError)) {
      logger.error(SECTION, 'unexpected-failure', 'Database sync stopped after an unexpected error and will retry.', {
        pii: { error: errorMessage(error) },
      });
      this.setConnection('offline');
      this.scheduleRetry();
      return;
    }
    if (error.path === '/sync/status' && error.status === 404) {
      // A backend from before database sync: keep the local-only behavior.
      this.connection = 'unsupported';
      for (const domain of SYNC_DOMAINS) this.domains[domain].active = false;
      logger.systemEvent(SECTION, 'unsupported', 'This backend does not support database sync; data stays on this device.');
      this.settleBoot?.();
      this.scheduleEmit();
      return;
    }
    if (error.kind === 'unauthorized') {
      if (this.connection !== 'unauthorized') {
        logger.error(SECTION, 'unauthorized', 'The backend rejected the access token.', { pii: { status: error.status } });
      }
      this.setConnection('unauthorized');
      // Waiting will not fix a wrong token; show the app and the error.
      this.settleBoot?.();
    } else {
      if (this.connection !== 'offline') {
        if (error.kind === 'retryable' && error.status >= 500) {
          logger.error(SECTION, 'server-error', 'The backend failed to answer; changes stay queued.', {
            pii: { status: error.status, code: error.code, message: error.message },
          });
        } else {
          logger.systemEvent(SECTION, 'offline', 'The database is unreachable; changes stay queued on this device.', {
            pii: { status: error.status, code: error.code },
          });
        }
      }
      this.setConnection('offline');
      // An unreachable backend will not answer before the boot timeout either.
      if (error.kind === 'network') this.settleBoot?.();
    }
    this.scheduleRetry();
  }

  private setConnection(connection: Connection): void {
    this.connection = connection;
    this.scheduleEmit();
  }

  private markOnline(): void {
    if (this.connection !== 'online' && this.connection !== 'unknown') {
      logger.systemEvent(SECTION, 'online', 'The database is reachable again.');
    }
    this.connection = 'online';
    this.retryAttempt = 0;
    this.clearRetry();
    this.scheduleEmit();
  }

  private scheduleRetry(delayMs?: number): void {
    if (this.disposed || this.retryTimer) return;
    const delay = delayMs ?? Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.retryAttempt);
    if (delayMs === undefined) this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.exclusive(() => (this.booted ? this.pollSafely() : this.boot()));
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ----------------------------------------------------------------- state

  /** Queued changes for the current backend instance. */
  private hasPending(domain?: SyncDomain): boolean {
    return this.store.outbox.some((entry) => entry.instanceId === this.instanceId && (!domain || entry.domain === domain));
  }

  /**
   * Merges long offline queues per domain. The merge preserves every edit's
   * effect (it is the same merge a flush performs), it only bounds storage.
   */
  private compactOutbox(): void {
    // A flush in flight removes exactly the entries it sent; never rewrite them meanwhile.
    if (this.store.outbox.length <= MAX_OUTBOX_ENTRIES || this.inFlight > 0) return;
    const groups = new Map<string, OutboxEntry[]>();
    for (const entry of this.store.outbox) {
      const key = `${entry.domain}|${entry.instanceId}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    const compacted: OutboxEntry[] = [];
    for (const entries of groups.values()) {
      const last = entries[entries.length - 1];
      const adapter = this.adapters[last.domain];
      const { mode, changeset } = mergeChangesets(entries, (collection, entity) => adapter.keyOf(collection, entity));
      compacted.push({ ...last, mode, changeset });
    }
    this.store.outbox = compacted.sort((a, b) => a.id - b.id);
  }

  private dropOutbox(predicate: (entry: OutboxEntry) => boolean): void {
    this.store.outbox = this.store.outbox.filter((entry) => !predicate(entry));
  }

  private persist(): void {
    if (this.enabled && !this.disposed) saveSyncState(this.store);
  }

  private setIssue(domain: SyncDomain, kind: DomainIssue['kind'], message: string): void {
    this.issues.set(domain, { domain, kind, message });
    this.scheduleEmit();
  }

  private clearIssue(domain: SyncDomain): void {
    if (this.issues.delete(domain)) this.scheduleEmit();
  }

  private computeStatus(): BackendSyncStatus {
    const pending = this.store.outbox.length;
    const conflicts = SYNC_DOMAINS.filter((domain) => this.domains[domain].conflict);
    let state: BackendSyncStatus['state'];
    if (!this.enabled || this.connection === 'unsupported') state = 'disabled';
    else if (!this.backend && this.connection === 'unknown') state = pending ? 'offline' : 'disabled';
    else if (this.connection === 'unauthorized') state = 'unauthorized';
    else if (this.connection === 'offline') state = 'offline';
    else if (!this.booted) state = 'starting';
    else if (this.inFlight > 0 || pending > 0) state = 'saving';
    else state = 'saved';
    return {
      state,
      pending,
      rejected: [...this.store.rejected],
      conflicts,
      issues: [...this.issues.values()],
      resolving: this.resolving,
      lastSavedAt: this.lastSavedAt,
    };
  }

  private scheduleEmit(): void {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.status = this.computeStatus();
      for (const listener of this.statusListeners) listener();
    });
  }
}

export { isSyncDomain };
