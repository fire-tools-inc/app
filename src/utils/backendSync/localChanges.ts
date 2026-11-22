/**
 * Bridge between the synchronous storage helpers and the sync engine.
 *
 * `cookieStorage.ts` and `cookieSettings.ts` call `recordLocalChange()` after
 * writing their local cache. This module has no storage imports, so the
 * helpers can depend on it without an import cycle; the engine registers a
 * sink when backend storage is active. Without a sink (demo mode, pure web,
 * before activation) every call is a no-op.
 */

import type { SyncDomain } from './types';

export interface LocalChangeSink {
  change(domain: SyncDomain, doc: unknown): void;
  clear(domain: SyncDomain): void;
}

let sink: LocalChangeSink | null = null;
let suppressed = 0;

export function setLocalChangeSink(next: LocalChangeSink | null): void {
  sink = next;
}

/** Runs `write` without recording outbox changes (used to hydrate the cache). */
export function withLocalChangesSuppressed<T>(write: () => T): T {
  suppressed += 1;
  try {
    return write();
  } finally {
    suppressed -= 1;
  }
}

export function recordLocalChange(domain: SyncDomain, doc: unknown): void {
  if (!sink || suppressed > 0) return;
  sink.change(domain, doc);
}

export function recordLocalClear(domain: SyncDomain): void {
  if (!sink || suppressed > 0) return;
  sink.clear(domain);
}
