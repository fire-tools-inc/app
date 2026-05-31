/**
 * Safe cookie adapter.
 *
 * In web/HTTPS contexts cookies work fine, but in packaged Electron the
 * renderer loads via the `file://` protocol where Chromium silently drops
 * `document.cookie` writes (no site to scope SameSite to). This means
 * `js-cookie` becomes a no-op in production builds, which previously broke:
 *   - notifications storage (panel always empty)
 *   - skip-tour preference (tour replayed forever)
 *   - all other cookie-backed UI state in desktop builds
 *
 * This shim exposes the same `get/set/remove` surface as `js-cookie` but
 * dual-writes to `localStorage` (which works on `file://`) and prefers
 * `localStorage` on read when in Electron. In the browser it keeps cookies
 * authoritative and uses `localStorage` only as a fallback layer.
 */
import Cookies from 'js-cookie';
import { logger } from './logger';

export type CookieAttributes = Cookies.CookieAttributes;

const isElectron = (): boolean => {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { fireTools?: unknown };
  if (w.fireTools) return true;
  try {
    return window.location.protocol === 'file:';
  } catch {
    return false;
  }
};

const lsGet = (key: string): string | undefined => {
  try {
    if (typeof window === 'undefined') return undefined;
    const v = window.localStorage.getItem(key);
    return v ?? undefined;
  } catch {
    return undefined;
  }
};

const lsSet = (key: string, value: string): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  } catch (error) {
    logger.error('safe-cookies', 'localStorage-write-failed', 'failed to write to localStorage', { pii: { key, error: (error as Error)?.message } });
  }
};

const lsRemove = (key: string): void => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  } catch (error) {
    logger.error('safe-cookies', 'localStorage-remove-failed', 'failed to remove from localStorage', { pii: { key, error: (error as Error)?.message } });
  }
};

export const SafeCookies = {
  get(key: string): string | undefined {
    if (isElectron()) {
      // localStorage is authoritative on Electron; fall back to cookies only
      // for any legacy writes that may still exist.
      return lsGet(key) ?? Cookies.get(key);
    }
    // Browser mode: cookies authoritative, localStorage is a safety net.
    return Cookies.get(key) ?? lsGet(key);
  },

  set(key: string, value: string, options?: CookieAttributes): void {
    if (isElectron()) {
      lsSet(key, value);
      return;
    }
    Cookies.set(key, value, options);
    // Mirror to localStorage so a later Electron load (e.g. import/export)
    // can still see the value even without cookies.
    lsSet(key, value);
  },

  remove(key: string, options?: CookieAttributes): void {
    if (isElectron()) {
      lsRemove(key);
      return;
    }
    Cookies.remove(key, options);
    lsRemove(key);
  },
};

export default SafeCookies;
