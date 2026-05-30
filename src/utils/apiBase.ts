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

interface EmbeddedBackendInfo {
  url: string | null;
  dbPath: string | null;
  error: string | null;
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
}

declare global {
  interface Window {
    fireTools?: FireToolsBridge;
  }
}

const API_VERSION_PREFIX = '/api/v1';

let cachedEmbedded: EmbeddedBackendInfo | null = null;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

const withVersion = (origin: string): string =>
  `${stripTrailingSlash(origin)}${API_VERSION_PREFIX}`;

export const getEmbeddedBackendInfo = async (): Promise<EmbeddedBackendInfo | null> => {
  if (cachedEmbedded && cachedEmbedded.url) return cachedEmbedded;
  const bridge = window.fireTools;
  if (!bridge?.getEmbeddedBackend) return null;
  try {
    cachedEmbedded = await bridge.getEmbeddedBackend();
    return cachedEmbedded;
  } catch (err) {
    console.error('Failed to resolve embedded backend URL:', err);
    return null;
  }
};

/**
 * Returns the API base URL (including `/api/v1`) or `null` when no backend
 * is reachable (pure browser build with no custom URL configured).
 */
export const getApiBaseUrl = async (): Promise<string | null> => {
  const { backend } = loadSettings();

  // In custom mode honor the user's intent: never silently fall back to
  // embedded when the custom URL is missing — return null so callers surface
  // a clear "backend unreachable" error instead of querying an unexpected one.
  if (backend.mode === 'custom') {
    return backend.customUrl ? withVersion(backend.customUrl) : null;
  }

  const info = await getEmbeddedBackendInfo();
  if (info?.url) return withVersion(info.url);
  return null;
};

/**
 * Probe a backend URL for `/api/v1/health`. Returns the parsed JSON or throws.
 * Used by the Settings "Test connection" button.
 */
export const probeBackend = async (
  baseUrl: string,
  timeoutMs = 5000
): Promise<{ status: string; [key: string]: unknown }> => {
  const target = `${withVersion(baseUrl)}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as { status: string };
  } finally {
    clearTimeout(timer);
  }
};
