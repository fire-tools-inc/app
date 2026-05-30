import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadQuestionnairePromptDismissed,
  saveQuestionnairePromptDismissed,
  clearQuestionnairePromptPreference,
} from '../../../src/utils/questionnairePromptPreferences';

// Mock document.cookie
const cookieMock = (() => {
  let cookies: Record<string, string> = {};
  const COOKIE_DELETION_MARKERS = ['max-age=0', 'expires=Thu, 01 Jan 1970'];

  return {
    get: () => {
      return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set: (value: string) => {
      const [cookiePair] = value.split(';');
      const [key, val] = cookiePair.split('=');
      if (key && val !== undefined) {
        if (val === '' || COOKIE_DELETION_MARKERS.some((marker) => value.includes(marker))) {
          delete cookies[key.trim()];
        } else {
          cookies[key.trim()] = val.trim();
        }
      }
    },
    clear: () => {
      cookies = {};
    },
  };
})();

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock.get(),
  set: (value: string) => cookieMock.set(value),
  configurable: true,
});

describe('Questionnaire prompt preferences', () => {
  beforeEach(() => {
    cookieMock.clear();
    try { window.localStorage.clear(); } catch { /* no-op */ }
  });

  it('should default to not dismissed', () => {
    expect(loadQuestionnairePromptDismissed()).toBe(false);
  });

  it('should persist dismissed state', () => {
    saveQuestionnairePromptDismissed(true);
    expect(loadQuestionnairePromptDismissed()).toBe(true);
  });

  it('should handle corrupted data gracefully', () => {
    document.cookie = 'fire-tools-questionnaire-prompt-dismissed=invalid';
    expect(loadQuestionnairePromptDismissed()).toBe(false);
  });

  it('should clear preference', () => {
    saveQuestionnairePromptDismissed(true);
    clearQuestionnairePromptPreference();
    expect(loadQuestionnairePromptDismissed()).toBe(false);
  });
});
