/**
 * Audit log React context.
 *
 * Records meaningful, user-initiated actions in a privacy-first, client-side
 * store. Entries are kept in memory and mirrored to encrypted local storage
 * via {@link saveAuditLog}. Nothing is ever sent off device.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AuditLogEntry, AuditActionType, AuditLogPayload } from '../types/auditLog';
import { loadAuditLog, saveAuditLog, clearAuditLog as clearAuditLogStorage } from '../utils/cookieStorage';
import { IS_DEMO_MODE } from '../utils/demoMode';
import { logger } from '../utils/logger';

const MAX_PAYLOAD_KEYS = 12;
const MAX_PAYLOAD_STRING_LENGTH = 120;

export interface AuditLogContextValue {
  /** Current entries, oldest first. */
  entries: AuditLogEntry[];
  /** Record a new audit event. No-op in demo mode. */
  logAuditEvent: (actionType: AuditActionType, payload?: AuditLogPayload) => void;
  /** Remove all audit entries from memory and storage. */
  clearLog: () => void;
}

const AuditLogContext = createContext<AuditLogContextValue | null>(null);

/** Generate a stable unique id, preferring crypto.randomUUID when available. */
function generateId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `audit-${Date.now()}-${hex}`;
    }
  } catch {
    // fall through to the timestamp-based fallback
  }
  return `audit-${Date.now()}-${globalThis.performance?.now?.().toString(36).replace('.', '') ?? ''}`;
}

/**
 * Keep payloads small and non-sensitive: drop non-primitive values, cap the
 * number of keys, and truncate long strings.
 */
function sanitizePayload(payload: AuditLogPayload): AuditLogPayload {
  const out: AuditLogPayload = {};
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (count >= MAX_PAYLOAD_KEYS) break;
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      count++;
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_PAYLOAD_STRING_LENGTH);
      count++;
    }
  }
  return out;
}

export function AuditLogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(() => loadAuditLog());
  // One session id per app load, used to group related actions.
  const sessionIdRef = useRef<string>(generateId());
  // Skip persisting on the initial hydration render.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    saveAuditLog(entries);
  }, [entries]);

  const logAuditEvent = useCallback((actionType: AuditActionType, payload: AuditLogPayload = {}) => {
    if (IS_DEMO_MODE) return;
    const entry: AuditLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      actionType,
      payload: sanitizePayload(payload),
      sessionId: sessionIdRef.current,
    };
    logger.userAction('audit-log', actionType, 'recorded audit event');
    setEntries(prev => [...prev, entry]);
  }, []);

  const clearLog = useCallback(() => {
    setEntries([]);
    clearAuditLogStorage();
  }, []);

  return (
    <AuditLogContext.Provider value={{ entries, logAuditEvent, clearLog }}>
      {children}
    </AuditLogContext.Provider>
  );
}

/** Access the audit log. Must be used within an {@link AuditLogProvider}. */
export function useAuditLog(): AuditLogContextValue {
  const ctx = useContext(AuditLogContext);
  if (!ctx) {
    throw new Error('useAuditLog must be used within an AuditLogProvider');
  }
  return ctx;
}
