/**
 * Single entry point for renderer requests to the Fire Tools backend.
 *
 * `apiFetch()` resolves the configured backend (embedded desktop backend or
 * Settings > Backend custom URL), adds the bearer token when one is known
 * and throws `BackendUnavailableError` when no backend is configured, so
 * callers can keep their documented offline behavior explicit.
 */

import { apiBaseForOrigin, getApiBackend, type ResolvedBackend } from './apiBase';

export type { ResolvedBackend } from './apiBase';

export class BackendUnavailableError extends Error {
  readonly code = 'backend_unavailable';

  constructor(message = 'No Fire Tools backend is configured.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

type HeaderRecord = Record<string, string>;

/** Copies any `HeadersInit` into a plain object so callers and tests can read it. */
function toHeaderRecord(headers: HeadersInit | undefined): HeaderRecord {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const record: HeaderRecord = {};
    headers.forEach((value, key) => { record[key] = value; });
    return record;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as HeaderRecord) };
}

function hasHeader(headers: HeaderRecord, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

/** Request headers for a backend, adding `Authorization` unless the caller set one. */
export function withBackendAuth(token: string | null, headers?: HeadersInit): HeaderRecord {
  const record = toHeaderRecord(headers);
  if (token && !hasHeader(record, 'Authorization')) record.Authorization = `Bearer ${token}`;
  return record;
}

/** Sends a request to an already-resolved backend. `path` is relative to `/api/v1`. */
export function apiFetchAt(backend: ResolvedBackend, path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/')) throw new TypeError('API paths must start with "/".');
  return fetch(`${backend.baseUrl}${path}`, { ...init, headers: withBackendAuth(backend.token, init.headers) });
}

/** Resolves the configured backend, or `null` in pure-web builds without one. */
export function resolveBackend(): Promise<ResolvedBackend | null> {
  return getApiBackend();
}

export async function isBackendConfigured(): Promise<boolean> {
  return (await getApiBackend()) !== null;
}

/**
 * Fetches `path` (relative to `/api/v1`) from the configured backend with its
 * bearer token. Throws `BackendUnavailableError` when no backend is configured.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const backend = await getApiBackend();
  if (!backend) throw new BackendUnavailableError();
  return apiFetchAt(backend, path, init);
}

export interface ProbeOptions {
  token?: string | null;
  timeoutMs?: number;
}

export class BackendProbeError extends Error {
  constructor(message: string, readonly reason: 'http' | 'unauthorized') {
    super(message);
    this.name = 'BackendProbeError';
  }
}

/**
 * Probe a backend origin for `/api/v1/health`, then check that the access
 * token is accepted. Used by the Settings "Test connection" button.
 */
export async function probeBackend(
  origin: string,
  { token = null, timeoutMs = 5000 }: ProbeOptions = {},
): Promise<{ status: string; [key: string]: unknown }> {
  const backend: ResolvedBackend = { baseUrl: apiBaseForOrigin(origin), token: token?.trim() || null, mode: 'custom' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const health = await apiFetchAt(backend, '/health', { signal: controller.signal });
    if (!health.ok) throw new BackendProbeError(`HTTP ${health.status} ${health.statusText}`, 'http');
    const body = (await health.json()) as { status: string };
    // Health is public; a protected route tells whether the token works.
    // Older backends without sync routes answer 404, which is still a success.
    const protectedRoute = await apiFetchAt(backend, '/sync/status', { signal: controller.signal });
    if (protectedRoute.status === 401 || protectedRoute.status === 403) {
      throw new BackendProbeError(`HTTP ${protectedRoute.status}`, 'unauthorized');
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}
