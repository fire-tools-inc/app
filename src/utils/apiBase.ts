/**
 * Resolves the API base URL the renderer should use for backend calls.
 *
 * Resolution order:
 *  1. User picked "custom" in Settings → use `customUrl` (+ /api/v1).
 *  2. Otherwise (default) → ask the Electron main process for the
 *     embedded backend URL via the `fireTools` bridge.
 *  3. If neither is available (pure-web build, no Electron, no override)
 *     → `null`. Callers should treat this as "backend features disabled".
 */

import { loadSettings } from './cookieSettings';
import { logger } from './logger';

export interface EmbeddedBackendInfo {
  url: string | null;
  dbPath: string | null;
  error: string | null;
  /** Bearer token required by the embedded API, when the desktop app set one. */
  token?: string | null;
}

interface FireToolsBridge {
  platform?: string;
  versions?: { electron?: string; chrome?: string; node?: string };
  getEmbeddedBackend?: () => Promise<EmbeddedBackendInfo>;
  openExternal?: (url: string) => Promise<boolean>;
  showNativeNotification?: (opts: {
    title: string;
    body?: string;
    urgency?: 'low' | 'normal' | 'critical';
  }) => Promise<boolean>;
  getDbEncryptionStatus?: () => Promise<{
    encrypted: boolean;
    safeStorageAvailable: boolean;
    hasStoredPassphrase: boolean;
  }>;
  setDbPassphrase?: (payload: {
    action: 'set' | 'rotate' | 'remove';
    currentPassphrase?: string;
    newPassphrase?: string;
  }) => Promise<
    | { ok: true; encrypted: boolean; backupPath: string | null }
    | { ok: false; code: string; message: string; backupPath?: string | null }
  >;
  onNavigate?: (callback: (path: string) => void) => () => void;
  onMenuAction?: (callback: (action: string) => void) => () => void;
  onUpdaterEvent?: (callback: (event: UpdaterEvent) => void) => () => void;
  updater?: {
    check: () => Promise<UpdaterState>;
    download: () => Promise<UpdaterState>;
    install: () => Promise<boolean>;
    getState: () => Promise<UpdaterState>;
    getPrefs: () => Promise<UpdaterPrefs>;
    setPrefs: (prefs: Partial<UpdaterPrefs>) => Promise<UpdaterPrefs>;
  };
  backups?: {
    list: () => Promise<{ ok: boolean; backups?: BackupRecord[]; error?: string }>;
    create: () => Promise<{ ok: boolean; backup?: BackupRecord; error?: string }>;
    restore: (opts: { backupId: string }) => Promise<{
      ok: boolean;
      restored?: string[];
      safetyBackupId?: string;
      error?: string;
    }>;
  };
  agentAccess?: {
    get: () => Promise<AgentAccessState>;
    set: (opts: { enabled: boolean }) => Promise<AgentAccessState>;
  };
}

/** Desktop agent access as reported by the main process. */
export interface AgentAccessState {
  ok: boolean;
  enabled?: boolean;
  /** False when the embedded backend is not running (e.g. a custom backend is used). */
  available?: boolean;
  discoveryFile?: string;
  error?: string;
}

export interface UpdaterPrefs {
  autoCheck: boolean;
  autoDownload: boolean;
  keepBackups: number;
  notifyOnly: boolean;
}

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'backup-failed'
  | 'error'
  | 'disabled-dev'
  | 'disabled-missing-dep';

export interface UpdaterInfo {
  version?: string;
  releaseDate?: string;
  releaseName?: string;
  releaseNotes?: string;
}

export interface UpdaterProgress {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export interface UpdaterState {
  status: UpdaterStatus;
  error: string | null;
  info: UpdaterInfo | null;
  progress: UpdaterProgress | null;
  result?: { version?: string } | null;
}

export interface UpdaterEvent {
  status?: UpdaterStatus;
  error?: string | null;
  info?: UpdaterInfo | null;
  progress?: UpdaterProgress | null;
  backup?: {
    id: string;
    reason: string;
    kept?: string[];
    removed?: string[];
  };
  ts: number;
}

export interface BackupRecord {
  id: string;
  dir: string;
  timestamp: string;
  version: string;
  /** Bytes per file as recorded by the manifest (schema v1). */
  files?: Array<{ name: string; bytes: number; sha256: string }>;
  /** Total size in bytes across all files in the backup. */
  totalBytes?: number;
  valid?: boolean;
  error?: string;
}

declare global {
  interface Window {
    fireTools?: FireToolsBridge;
  }
}

const API_VERSION_PREFIX = '/api/v1';

let cachedEmbedded: EmbeddedBackendInfo | null = null;
let embeddedBackendRequest: Promise<EmbeddedBackendInfo | null> | null = null;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const withVersion = (origin: string): string =>
  `${stripTrailingSlash(origin)}${API_VERSION_PREFIX}`;

export const getEmbeddedBackendInfo = async (): Promise<EmbeddedBackendInfo | null> => {
  if (cachedEmbedded && cachedEmbedded.url) return cachedEmbedded;
  const bridge = window.fireTools;
  const getEmbeddedBackend = bridge?.getEmbeddedBackend;
  if (!getEmbeddedBackend) return null;
  if (embeddedBackendRequest) return embeddedBackendRequest;

  embeddedBackendRequest = (async () => {
    try {
      cachedEmbedded = await getEmbeddedBackend();
      return cachedEmbedded;
    } catch (err) {
      logger.error('api-base', 'backend-resolution-failed', 'failed to resolve embedded backend URL', { pii: { error: (err as Error)?.message } });
      return null;
    } finally {
      embeddedBackendRequest = null;
    }
  })();

  return embeddedBackendRequest;
};

export interface ResolvedBackend {
  /** API base URL including `/api/v1`, without a trailing slash. */
  baseUrl: string;
  /** Bearer token to send with requests, or null when the backend has none. */
  token: string | null;
  mode: 'embedded' | 'custom';
}

/**
 * Resolves the backend the renderer should talk to, including its access
 * token, or `null` when no backend is reachable (pure browser build with no
 * custom URL configured).
 */
export const getApiBackend = async (): Promise<ResolvedBackend | null> => {
  const { backend } = loadSettings();

  // In custom mode honor the user's intent: never silently fall back to
  // embedded when the custom URL is missing — return null so callers surface
  // a clear "backend unreachable" error instead of querying an unexpected one.
  if (backend.mode === 'custom') {
    if (!backend.customUrl) return null;
    const token = typeof backend.customToken === 'string' ? backend.customToken.trim() : '';
    return { baseUrl: withVersion(backend.customUrl), token: token || null, mode: 'custom' };
  }

  const info = await getEmbeddedBackendInfo();
  if (!info?.url) return null;
  return {
    baseUrl: withVersion(info.url),
    token: typeof info.token === 'string' && info.token ? info.token : null,
    mode: 'embedded',
  };
};

/**
 * Returns the API base URL (including `/api/v1`) or `null` when no backend
 * is reachable (pure browser build with no custom URL configured).
 */
export const getApiBaseUrl = async (): Promise<string | null> => {
  const backend = await getApiBackend();
  return backend?.baseUrl ?? null;
};

/** Builds the versioned API base for an origin such as `http://localhost:3000`. */
export const apiBaseForOrigin = (origin: string): string => withVersion(origin);
