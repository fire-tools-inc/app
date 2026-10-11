import SafeCookies from './safeCookies';
import { encryptData, decryptData } from './cookieEncryption';
import { logger } from './logger';

const SIDEBAR_COLLAPSED_KEY = 'fire-tools-sidebar-collapsed';

export function loadSidebarCollapsed(): boolean {
  try {
    const encrypted = SafeCookies.get(SIDEBAR_COLLAPSED_KEY);
    if (!encrypted) return false;
    const decrypted = decryptData(encrypted);
    if (!decrypted) throw new Error('Sidebar preference could not be decrypted.');
    const payload: unknown = JSON.parse(decrypted);
    if (payload && typeof payload === 'object' && 'collapsed' in payload &&
      typeof payload.collapsed === 'boolean') {
      return payload.collapsed;
    }
    throw new Error('Sidebar preference must contain a boolean collapsed value.');
  } catch (error) {
    logger.error('navigation-preferences', 'load-failed', 'failed to load sidebar preference', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    SafeCookies.set(SIDEBAR_COLLAPSED_KEY, encryptData(JSON.stringify({ collapsed })), {
      expires: 365,
      sameSite: 'strict',
      secure: window.location.protocol === 'https:',
      path: '/',
    });
  } catch (error) {
    logger.error('navigation-preferences', 'save-failed', 'failed to save sidebar preference', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
