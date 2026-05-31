/**
 * Questionnaire Prompt Preferences
 * Handles saving/loading the questionnaire prompt dismissed state to/from encrypted cookies
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { encryptData, decryptData } from './cookieEncryption';
import {
  PREF_KEY_QUESTIONNAIRE_PROMPT_DISMISSED,
  pushPreferenceToBackend,
  deletePreferenceFromBackend,
} from './uiPreferencesSync';
import { logger } from './logger';

const QUESTIONNAIRE_PROMPT_DISMISSED_KEY = 'fire-tools-questionnaire-prompt-dismissed';

const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365,
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

export function saveQuestionnairePromptDismissed(dismissed: boolean): void {
  try {
    const payload = JSON.stringify({ dismissed });
    const encrypted = encryptData(payload);
    SafeCookies.set(QUESTIONNAIRE_PROMPT_DISMISSED_KEY, encrypted, COOKIE_OPTIONS);
    pushPreferenceToBackend(PREF_KEY_QUESTIONNAIRE_PROMPT_DISMISSED, payload);
  } catch (error) {
    logger.error('questionnaire-prompt-preferences', 'save-failed', 'failed to save questionnaire prompt preference', { pii: { error: (error as Error)?.message } });
  }
}

export function loadQuestionnairePromptDismissed(): boolean {
  try {
    const encrypted = SafeCookies.get(QUESTIONNAIRE_PROMPT_DISMISSED_KEY);
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
    logger.error('questionnaire-prompt-preferences', 'load-failed', 'failed to load questionnaire prompt preference', { pii: { error: (error as Error)?.message } });
    return false;
  }
}

export function clearQuestionnairePromptPreference(): void {
  try {
    SafeCookies.remove(QUESTIONNAIRE_PROMPT_DISMISSED_KEY, { path: '/' });
    deletePreferenceFromBackend(PREF_KEY_QUESTIONNAIRE_PROMPT_DISMISSED);
  } catch (error) {
    logger.error('questionnaire-prompt-preferences', 'clear-failed', 'failed to clear questionnaire prompt preference', { pii: { error: (error as Error)?.message } });
  }
}
