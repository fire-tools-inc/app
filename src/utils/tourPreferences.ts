/**
 * Tour preferences utilities
 * Handles saving/loading tour completion state to/from encrypted cookies
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { encryptData, decryptData } from './cookieEncryption';
import {
  PREF_KEY_TOUR_COMPLETED,
  pushPreferenceToBackend,
  deletePreferenceFromBackend,
} from './uiPreferencesSync';
import { logger } from './logger';

const TOUR_COMPLETED_KEY = 'fire-tools-tour-completed';

const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365,
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

export function saveTourCompleted(completed: boolean): void {
  try {
    const payload = JSON.stringify({ completed });
    const encrypted = encryptData(payload);
    SafeCookies.set(TOUR_COMPLETED_KEY, encrypted, COOKIE_OPTIONS);
    pushPreferenceToBackend(PREF_KEY_TOUR_COMPLETED, payload);
  } catch (error) {
    logger.error('tour-preferences', 'save-failed', 'failed to save tour preference', { pii: { error: (error as Error)?.message } });
  }
}

export function loadTourCompleted(): boolean {
  try {
    const encrypted = SafeCookies.get(TOUR_COMPLETED_KEY);
    if (!encrypted) {
      return false;
    }

    const decrypted = decryptData(encrypted);
    if (!decrypted) {
      return false;
    }

    const parsed = JSON.parse(decrypted);
    return parsed.completed === true;
  } catch (error) {
    logger.error('tour-preferences', 'load-failed', 'failed to load tour preference', { pii: { error: (error as Error)?.message } });
    return false;
  }
}

export function clearTourPreference(): void {
  try {
    SafeCookies.remove(TOUR_COMPLETED_KEY, { path: '/' });
    deletePreferenceFromBackend(PREF_KEY_TOUR_COMPLETED);
  } catch (error) {
    logger.error('tour-preferences', 'clear-failed', 'failed to clear tour preference', { pii: { error: (error as Error)?.message } });
  }
}
