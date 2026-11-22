/**
 * Public entry points for backend-authoritative storage.
 *
 * Pure web without a backend and the demo never start the engine, so the
 * local encrypted stores keep working exactly as before.
 */

import { loadSettings, subscribeToSettingsChanges } from '../cookieSettings';
import { IS_DEMO_MODE } from '../demoMode';
import { BackendSyncEngine, type RemoteChangeEvent } from './engine';
import { SYNC_STATE_KEY } from './syncStore';
import type { BackendSyncStatus, SyncDomain } from './types';

export type { BackendSyncStatus, DomainIssue, RejectedChange, SyncDomain } from './types';
export { SYNC_DOMAINS } from './types';
export type { RemoteChangeEvent } from './engine';

let engine: BackendSyncEngine | null = null;
let stopWaitingForBackend: (() => void) | null = null;

const DISABLED_STATUS: BackendSyncStatus = {
  state: 'disabled', pending: 0, rejected: [], conflicts: [], issues: [], resolving: false, lastSavedAt: null,
};

function hasPersistedSyncState(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SYNC_STATE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * True when a backend is configured (desktop bridge in embedded mode, or a
 * custom URL). Synchronous so the shell can decide whether to show the
 * loading state on its first render.
 */
export function isBackendStorageCandidate(): boolean {
  if (IS_DEMO_MODE) return false;
  const { backend } = loadSettings();
  if (backend.mode === 'custom') return Boolean(backend.customUrl);
  return typeof window !== 'undefined' && typeof window.fireTools?.getEmbeddedBackend === 'function';
}

const statusListeners = new Set<() => void>();
const remoteListeners = new Set<(event: RemoteChangeEvent) => void>();

function getEngine(): BackendSyncEngine {
  if (!engine) {
    engine = new BackendSyncEngine();
    // Forward through module-level sets so subscribers that mounted before
    // the engine existed still receive updates.
    engine.subscribe(() => { for (const listener of statusListeners) listener(); });
    engine.subscribeRemoteChanges((event) => { for (const listener of remoteListeners) listener(event); });
  }
  return engine;
}

/**
 * Starts backend storage and resolves when the local cache reflects the
 * database (or after the boot timeout, continuing offline).
 */
export function initBackendStorage(): Promise<void> {
  if (IS_DEMO_MODE) return Promise.resolve();
  if (engine || isBackendStorageCandidate() || hasPersistedSyncState()) return getEngine().init();
  // Pure web: start only once the user configures a backend in Settings.
  stopWaitingForBackend ??= subscribeToSettingsChanges(() => {
    if (!isBackendStorageCandidate()) return;
    stopWaitingForBackend?.();
    stopWaitingForBackend = null;
    const started = getEngine();
    started.markViewsActive();
    void started.init();
  });
  return Promise.resolve();
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

export function getSyncStatus(): BackendSyncStatus {
  return engine ? engine.getStatus() : DISABLED_STATUS;
}

export function subscribeRemoteChanges(listener: (event: RemoteChangeEvent) => void): () => void {
  remoteListeners.add(listener);
  return () => { remoteListeners.delete(listener); };
}

export function getRemoteGeneration(): number {
  return engine?.getRemoteGeneration() ?? 0;
}

export function acknowledgeViewRefresh(generation: number): void {
  engine?.acknowledgeViewRefresh(generation);
}

/** True when saves of `domain` are written to the backend. */
export function isDomainSynced(domain: SyncDomain): boolean {
  return engine?.isDomainActive(domain) ?? false;
}

export function resolveSyncConflicts(choice: 'database' | 'device'): Promise<void> {
  return engine ? engine.resolveConflicts(choice) : Promise.resolve();
}

export function dismissRejectedChanges(id?: string): void {
  engine?.dismissRejected(id);
}

export function retrySync(): Promise<void> {
  return engine ? engine.retryNow() : Promise.resolve();
}

/** Test helper: stops the shared engine so the next test starts clean. */
export function resetBackendStorageForTests(): void {
  engine?.dispose();
  engine = null;
  stopWaitingForBackend?.();
  stopWaitingForBackend = null;
}
