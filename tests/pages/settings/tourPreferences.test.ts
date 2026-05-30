import { describe, expect, it, beforeEach } from 'vitest';
import {
  loadTourCompleted,
  saveTourCompleted,
  clearTourPreference,
} from '../../../src/utils/tourPreferences';

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

describe('Tour preferences', () => {
  beforeEach(() => {
    cookieMock.clear();
    try { window.localStorage.clear(); } catch { /* no-op */ }
  });

  it('should default to not completed', () => {
    expect(loadTourCompleted()).toBe(false);
  });

  it('should persist completion state', () => {
    saveTourCompleted(true);
    expect(loadTourCompleted()).toBe(true);
  });

  it('should handle corrupted data gracefully', () => {
    document.cookie = 'fire-tools-tour-completed=invalid';
    expect(loadTourCompleted()).toBe(false);
  });

  it('should clear preference', () => {
    saveTourCompleted(true);
    clearTourPreference();
    expect(loadTourCompleted()).toBe(false);
  });
});
