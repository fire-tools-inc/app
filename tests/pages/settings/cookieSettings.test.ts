import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveSettings,
  loadSettings,
  clearSettings,
  validateSettings,
  DEFAULT_SETTINGS,
  type UserSettings,
} from '../../../src/utils/cookieSettings';

// Mock document.cookie
const cookieMock = (() => {
  let cookies: Record<string, string> = {};

  return {
    get: () => {
      return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set: (value: string) => {
      // Parse cookie string like "key=value; path=/; max-age=..."
      const [cookiePair] = value.split(';');
      const [key, val] = cookiePair.split('=');
      if (key && val !== undefined) {
        if (val === '' || value.includes('max-age=0') || value.includes('expires=Thu, 01 Jan 1970')) {
          // Cookie deletion
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

// Mock document.cookie getter/setter
Object.defineProperty(document, 'cookie', {
  get: () => cookieMock.get(),
  set: (value: string) => cookieMock.set(value),
  configurable: true,
});

describe('Cookie Settings utilities', () => {
  beforeEach(() => {
    cookieMock.clear();
    // SafeCookies dual-writes to localStorage in addition to cookies; clear it
    // so state cannot leak between tests in environments where localStorage
    // is fully functional (CI / modern jsdom).
    try {
      window.localStorage.clear();
    } catch {
      // localStorage may be unavailable in some test envs; ignore.
    }
  });

  describe('saveSettings', () => {
    it('should save settings to cookies', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        accountName: 'Test Account',
      };
      
      saveSettings(settings);
      
      const cookieValue = document.cookie;
      expect(cookieValue).toContain('fire-calculator-settings');
    });

    it('should save decimal separator preference', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        decimalSeparator: ',',
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.decimalSeparator).toBe(',');
    });

    it('should save currency settings', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        currencySettings: {
          defaultCurrency: 'EUR',
          fallbackRates: { EUR: 1, USD: 0.90 },
          useApiRates: false,
          lastApiUpdate: null,
        },
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.currencySettings.fallbackRates.USD).toBe(0.90);
    });

    it('should save and load non-EUR default currency', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        currencySettings: {
          ...DEFAULT_SETTINGS.currencySettings,
          defaultCurrency: 'USD',
        },
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.currencySettings.defaultCurrency).toBe('USD');
    });

    it('should preserve default currency when changing other settings', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        currencySettings: {
          ...DEFAULT_SETTINGS.currencySettings,
          defaultCurrency: 'GBP',
        },
      };
      
      saveSettings(settings);
      
      // Update a different setting
      const loaded = loadSettings();
      const updatedSettings: UserSettings = {
        ...loaded,
        accountName: 'New Account Name',
      };
      saveSettings(updatedSettings);
      
      const reloaded = loadSettings();
      expect(reloaded.currencySettings.defaultCurrency).toBe('GBP');
      expect(reloaded.accountName).toBe('New Account Name');
    });

    it('should encrypt data in cookies', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        accountName: 'My Secret Portfolio',
      };
      
      saveSettings(settings);
      const cookieValue = document.cookie;
      
      // Cookie should not contain plaintext sensitive data
      expect(cookieValue).not.toContain('My Secret Portfolio');
    });
  });

  describe('loadSettings', () => {
    it('should return DEFAULT_SETTINGS when no settings saved', () => {
      const loaded = loadSettings();
      
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });

    it('should load saved settings', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        accountName: 'My Portfolio',
        decimalSeparator: ',',
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.accountName).toBe('My Portfolio');
      expect(loaded.decimalSeparator).toBe(',');
    });

    it('should handle corrupted data gracefully', () => {
      document.cookie = 'fire-calculator-settings=invalid-encrypted-data';
      
      const loaded = loadSettings();
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });

    it('should merge with defaults to ensure all fields exist', () => {
      // Create settings with all required fields
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        accountName: 'Partial Account',
      };
      saveSettings(settings);
      
      const loaded = loadSettings();
      expect(loaded.accountName).toBe('Partial Account');
      expect(loaded.decimalSeparator).toBe(DEFAULT_SETTINGS.decimalSeparator);
      expect(loaded.currencySettings).toEqual(DEFAULT_SETTINGS.currencySettings);
    });
  });

  describe('clearSettings', () => {
    it('should clear settings from cookies', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        accountName: 'Test',
      };
      
      saveSettings(settings);
      const cookieBefore = document.cookie;
      expect(cookieBefore).toContain('fire-calculator-settings');
      
      clearSettings();
      
      const loaded = loadSettings();
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_SETTINGS.accountName).toBe('My Portfolio');
      expect(DEFAULT_SETTINGS.decimalSeparator).toBe('.');
      expect(DEFAULT_SETTINGS.decimalPlaces).toBe(2);
      expect(DEFAULT_SETTINGS.currencySettings.defaultCurrency).toBe('EUR');
      expect(DEFAULT_SETTINGS.currencySettings.useApiRates).toBe(true);
    });

    it('should have all fallback rates defined', () => {
      const { fallbackRates } = DEFAULT_SETTINGS.currencySettings;
      
      expect(fallbackRates.EUR).toBe(1);
      expect(fallbackRates.USD).toBe(0.85);
      expect(fallbackRates.GBP).toBe(1.15);
      expect(fallbackRates.CHF).toBe(1.08);
      expect(fallbackRates.JPY).toBe(0.0054);
      expect(fallbackRates.AUD).toBe(0.57);
      expect(fallbackRates.CAD).toBe(0.62);
    });
  });

  describe('decimalPlaces setting', () => {
    it('should save and load decimal places setting', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        decimalPlaces: 3,
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.decimalPlaces).toBe(3);
    });

    it('should default to 2 decimal places when not set', () => {
      const loaded = loadSettings();
      expect(loaded.decimalPlaces).toBe(2);
    });
  });

  describe('privacyMode setting', () => {
    it('should save and load privacy mode setting', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        privacyMode: true,
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.privacyMode).toBe(true);
    });

    it('should default to false for privacy mode', () => {
      const loaded = loadSettings();
      expect(loaded.privacyMode).toBe(false);
    });
  });

  describe('country setting', () => {
    it('should save and load country setting', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        country: 'DE',
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.country).toBe('DE');
    });

    it('should default to undefined for country', () => {
      const loaded = loadSettings();
      expect(loaded.country).toBeUndefined();
    });
  });

  describe('dateFormat setting', () => {
    it('should save and load date format setting', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        dateFormat: 'MM/DD/YYYY',
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.dateFormat).toBe('MM/DD/YYYY');
    });

    it('should default to DD/MM/YYYY for date format', () => {
      const loaded = loadSettings();
      expect(loaded.dateFormat).toBe('DD/MM/YYYY');
    });

    it('should allow YYYY-MM-DD format', () => {
      const settings: UserSettings = {
        ...DEFAULT_SETTINGS,
        dateFormat: 'YYYY-MM-DD',
      };
      
      saveSettings(settings);
      const loaded = loadSettings();
      
      expect(loaded.dateFormat).toBe('YYYY-MM-DD');
    });
  });

  describe('validateSettings', () => {
    it('should accept valid date format DD/MM/YYYY', () => {
      const result = validateSettings({ dateFormat: 'DD/MM/YYYY' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid date format MM/DD/YYYY', () => {
      const result = validateSettings({ dateFormat: 'MM/DD/YYYY' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid date format YYYY-MM-DD', () => {
      const result = validateSettings({ dateFormat: 'YYYY-MM-DD' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid date format', () => {
      // Using any to bypass type checking for invalid input test
      const result = validateSettings({ dateFormat: 'invalid' as unknown as 'DD/MM/YYYY' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date format must be "DD/MM/YYYY", "MM/DD/YYYY", or "YYYY-MM-DD"');
    });
  });

  describe('experimental features', () => {
    it('defaults portfolioBreakdown to false', () => {
      expect(DEFAULT_SETTINGS.experimentalFeatures.portfolioBreakdown).toBe(false);
    });

    it('preserves enabled experimental flags through save/load roundtrip', () => {
      const updated: UserSettings = {
        ...DEFAULT_SETTINGS,
        experimentalFeatures: { portfolioBreakdown: true },
      };
      saveSettings(updated);
      const loaded = loadSettings();
      expect(loaded.experimentalFeatures.portfolioBreakdown).toBe(true);
    });

    it('back-fills experimentalFeatures when missing in saved cookie', () => {
      // Simulate an older cookie that pre-dated the experimentalFeatures field.
      const legacy = { ...DEFAULT_SETTINGS } as Partial<UserSettings>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (legacy as any).experimentalFeatures;
      saveSettings(legacy as UserSettings);
      const loaded = loadSettings();
      expect(loaded.experimentalFeatures).toBeDefined();
      expect(loaded.experimentalFeatures.portfolioBreakdown).toBe(false);
    });
  });
});
