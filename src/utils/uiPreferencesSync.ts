/**
 * UI preferences sync helpers.
 *
 * In pure-web mode (no backend reachable) these become no-ops and the
 * existing encrypted-cookie store keeps acting as the source of truth.
 *
 * In Electron / custom-backend mode the database is the source of truth:
 *  - `syncPreferencesFromBackend()` is called once at boot and mirrors
 *    server values into local cookies so the existing synchronous
 *    `loadXxx()` helpers keep working unchanged.
 *  - `pushPreferenceToBackend()` is invoked from each `saveXxx()` to write
 *    through to the DB without blocking the UI.
 *  - `deletePreferenceFromBackend()` mirrors `clearXxx()` calls.
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { encryptData } from './cookieEncryption';
import { getApiBaseUrl } from './apiBase';
import { logger } from './logger';

export const PREF_KEY_TOUR_COMPLETED = 'tour_completed';
export const PREF_KEY_QUESTIONNAIRE_PROMPT_DISMISSED = 'questionnaire_prompt_dismissed';
export const PREF_KEY_SECURITY_BANNER_DISMISSED = 'security_banner_dismissed';

// Map server key → local storage key used by the sync layer.
const COOKIE_NAMES: Record<string, string> = {
  [PREF_KEY_TOUR_COMPLETED]: 'fire-tools-tour-completed',
  [PREF_KEY_QUESTIONNAIRE_PROMPT_DISMISSED]: 'fire-tools-questionnaire-prompt-dismissed',
  [PREF_KEY_SECURITY_BANNER_DISMISSED]: 'fire-tools-security-banner-dismissed',
};

const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365,
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

const writeMirroredCookie = (cookieName: string, plaintextJson: string): void => {
  try {
    const encrypted = encryptData(plaintextJson);
    SafeCookies.set(cookieName, encrypted, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('ui-preferences-sync', 'mirror-failed', `failed to mirror preference into ${cookieName}`, { pii: { error: (error as Error)?.message } });
  }
};

/**
 * Fetch all UI preferences from the backend and mirror them into local
 * encrypted cookies so synchronous `loadXxx()` helpers stay correct.
 * Safe to call when no backend is reachable: returns immediately.
 */
export const syncPreferencesFromBackend = async (): Promise<void> => {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) return;
  try {
    const res = await fetch(`${baseUrl}/ui-preferences`);
    if (!res.ok) return;
    const data = (await res.json()) as { preferences?: Record<string, string> };
    const prefs = data.preferences ?? {};
    for (const [key, value] of Object.entries(prefs)) {
      const cookieName = COOKIE_NAMES[key];
      if (!cookieName) continue;
      writeMirroredCookie(cookieName, value);
    }
  } catch (error) {
    logger.error('ui-preferences-sync', 'sync-failed', 'failed to sync UI preferences from backend', { pii: { error: (error as Error)?.message } });
  }
};

/**
 * Fire-and-forget PUT to persist a single preference to the backend.
 * Errors are logged but not thrown so the local cookie write always succeeds.
 */
export const pushPreferenceToBackend = (key: string, value: string): void => {
  void (async () => {
    const baseUrl = await getApiBaseUrl();
    if (!baseUrl) return;
    try {
      const res = await fetch(`${baseUrl}/ui-preferences/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        logger.error('ui-preferences-sync', 'push-failed', `failed to push preference ${key} to backend`, { pii: { httpStatus: res.status } });
      }
    } catch (error) {
      logger.error('ui-preferences-sync', 'push-failed', `failed to push preference ${key} to backend`, { pii: { error: (error as Error)?.message } });
    }
  })();
};

/**
 * Fire-and-forget DELETE to clear a single preference from the backend.
 * A 404 is silently ignored (the cookie may simply not have been synced yet).
 */
export const deletePreferenceFromBackend = (key: string): void => {
  void (async () => {
    const baseUrl = await getApiBaseUrl();
    if (!baseUrl) return;
    try {
      const res = await fetch(`${baseUrl}/ui-preferences/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) {
        logger.error('ui-preferences-sync', 'delete-failed', `failed to delete preference ${key} from backend`, { pii: { httpStatus: res.status } });
      }
    } catch (error) {
      logger.error('ui-preferences-sync', 'delete-failed', `failed to delete preference ${key} from backend`, { pii: { error: (error as Error)?.message } });
    }
  })();
};
