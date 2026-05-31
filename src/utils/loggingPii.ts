/**
 * Tiny standalone helper for reading the PII-logging flag from the encrypted
 * settings cookie. Lives in its own module (not in `cookieSettings.ts`) so
 * the logger can read the flag without creating a circular dependency
 * `cookieSettings -> logger -> cookieSettings`.
 *
 * Fails closed: any error reading or decrypting the cookie disables PII
 * logging.
 */
import SafeCookies from './safeCookies';
import { decryptData } from './cookieEncryption';

const SETTINGS_KEY = 'fire_tools_settings';

export const isPiiLoggingEnabled = (): boolean => {
  try {
    const encrypted = SafeCookies.get(SETTINGS_KEY);
    if (!encrypted) return false;
    const decrypted = decryptData(encrypted);
    if (!decrypted) return false;
    const parsed = JSON.parse(decrypted) as { loggingPiiEnabled?: unknown };
    return parsed.loggingPiiEnabled === true;
  } catch {
    return false;
  }
};
