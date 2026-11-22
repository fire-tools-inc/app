/**
 * Persisted, encrypted sync state: the outbox of unsent changes, rejected
 * changes shown to the user and the per-domain marker (backend instance and
 * last known revision). Stored in localStorage because the outbox can
 * outgrow cookie limits.
 */

import { decryptData, encryptData } from '../cookieEncryption';
import { logger } from '../logger';
import { isPlainObject } from './canonical';
import { isSyncDomain, type OutboxEntry, type RejectedChange, type SyncDomain } from './types';

export const SYNC_STATE_KEY = 'fire-tools-backend-sync';
const MAX_REJECTED = 50;

export interface DomainMarker {
  instanceId: string;
  revision: number;
}

export interface PersistedSyncState {
  version: 1;
  nextId: number;
  outbox: OutboxEntry[];
  rejected: RejectedChange[];
  domains: Partial<Record<SyncDomain, DomainMarker>>;
}

export const emptySyncState = (): PersistedSyncState => ({ version: 1, nextId: 1, outbox: [], rejected: [], domains: {} });

function isOutboxEntry(value: unknown): value is OutboxEntry {
  return isPlainObject(value)
    && typeof value.id === 'number'
    && isSyncDomain(value.domain)
    && typeof value.instanceId === 'string'
    && (value.mode === 'patch' || value.mode === 'replace')
    && isPlainObject(value.changeset)
    && typeof value.createdAt === 'string';
}

function isRejectedChange(value: unknown): value is RejectedChange {
  return isPlainObject(value)
    && typeof value.id === 'string'
    && isSyncDomain(value.domain)
    && typeof value.status === 'number'
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.createdAt === 'string'
    && isPlainObject(value.changeset);
}

function parseState(value: unknown): PersistedSyncState {
  if (!isPlainObject(value) || value.version !== 1) throw new Error('Unsupported sync state version.');
  const outbox = Array.isArray(value.outbox) ? value.outbox.filter(isOutboxEntry) : [];
  const rejected = Array.isArray(value.rejected) ? value.rejected.filter(isRejectedChange) : [];
  const domains: Partial<Record<SyncDomain, DomainMarker>> = {};
  if (isPlainObject(value.domains)) {
    for (const [domain, marker] of Object.entries(value.domains)) {
      if (isSyncDomain(domain) && isPlainObject(marker) && typeof marker.instanceId === 'string' && typeof marker.revision === 'number') {
        domains[domain] = { instanceId: marker.instanceId, revision: marker.revision };
      }
    }
  }
  const highestId = outbox.reduce((max, entry) => Math.max(max, entry.id), 0);
  const nextId = typeof value.nextId === 'number' && value.nextId > highestId ? value.nextId : highestId + 1;
  return { version: 1, nextId, outbox, rejected, domains };
}

export function loadSyncState(): PersistedSyncState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return emptySyncState();
    const decrypted = decryptData(raw);
    if (!decrypted) throw new Error('The saved sync state could not be decrypted.');
    return parseState(JSON.parse(decrypted));
  } catch (error) {
    logger.error('backend-sync', 'state-load-failed', 'Saved sync state is unreadable; it was set aside and the device will be compared with the database.', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    try {
      if (raw) localStorage.setItem(`${SYNC_STATE_KEY}.unreadable`, raw);
    } catch {
      // Keeping the unreadable copy is best effort; the comparison still prevents silent loss.
    }
    return emptySyncState();
  }
}

export function saveSyncState(state: PersistedSyncState): boolean {
  try {
    const bounded: PersistedSyncState = { ...state, rejected: state.rejected.slice(-MAX_REJECTED) };
    localStorage.setItem(SYNC_STATE_KEY, encryptData(JSON.stringify(bounded)));
    return true;
  } catch (error) {
    logger.error('backend-sync', 'state-save-failed', 'Pending database changes could not be saved on this device.', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}
