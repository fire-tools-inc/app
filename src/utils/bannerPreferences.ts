import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { encryptData, decryptData } from './cookieEncryption';
import {
  PREF_KEY_SECURITY_BANNER_DISMISSED,
  pushPreferenceToBackend,
  deletePreferenceFromBackend,
} from './uiPreferencesSync';
import { logger } from './logger';

const SECURITY_BANNER_KEY = 'fire-tools-security-banner-dismissed';

const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365,
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

export function saveSecurityBannerDismissed(dismissed: boolean): void {
  try {
    const payload = JSON.stringify({ dismissed });
    const encrypted = encryptData(payload);
    SafeCookies.set(SECURITY_BANNER_KEY, encrypted, COOKIE_OPTIONS);
    pushPreferenceToBackend(PREF_KEY_SECURITY_BANNER_DISMISSED, payload);
  } catch (error) {
    logger.error('banner-preferences', 'save-failed', 'failed to save security banner preference', { pii: { error: (error as Error)?.message } });
  }
}

export function loadSecurityBannerDismissed(): boolean {
  try {
    const encrypted = SafeCookies.get(SECURITY_BANNER_KEY);
    if (!encrypted) {
      return false;
    }

    const decrypted = decryptData(encrypted);
    if (!decrypted) {
      return false;
    }

    const parsed = JSON.parse(decrypted);
    return parsed.dismissed === true;
  } catch (error) {
    logger.error('banner-preferences', 'load-failed', 'failed to load security banner preference', { pii: { error: (error as Error)?.message } });
    return false;
  }
}

export function clearSecurityBannerPreference(): void {
  try {
    SafeCookies.remove(SECURITY_BANNER_KEY, { path: '/' });
    deletePreferenceFromBackend(PREF_KEY_SECURITY_BANNER_DISMISSED);
  } catch (error) {
    logger.error('banner-preferences', 'clear-failed', 'failed to clear security banner preference', { pii: { error: (error as Error)?.message } });
  }
}
