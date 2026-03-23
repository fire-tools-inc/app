import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  saveApiKeyConfig,
  loadApiKeyConfig,
  clearApiKeyConfig,
  hasApiKey,
} from '../../src/utils/apiKeyStorage';
import { DEFAULT_API_KEY_CONFIG } from '../../src/types/priceApi';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('API Key Storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  describe('loadApiKeyConfig', () => {
    it('should return defaults when no config exists', () => {
      const config = loadApiKeyConfig();
      expect(config.alphaVantageKey).toBeUndefined();
      expect(config.financialDataKey).toBeUndefined();
      expect(config.lastUpdated).toBeNull();
    });

    it('should return defaults for invalid/corrupted data', () => {
      localStorageMock.setItem('fire-tools-api-keys', 'invalid-encrypted-data');
      const config = loadApiKeyConfig();
      expect(config.alphaVantageKey).toBeUndefined();
      expect(config.financialDataKey).toBeUndefined();
    });
  });

  describe('saveApiKeyConfig', () => {
    it('should save and load API key config correctly', () => {
      const config = {
        ...DEFAULT_API_KEY_CONFIG,
        alphaVantageKey: 'test-alpha-key-123',
        financialDataKey: 'test-fd-key-456',
      };

      saveApiKeyConfig(config);

      // Verify localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'fire-tools-api-keys',
        expect.any(String)
      );

      // Verify round-trip
      const loaded = loadApiKeyConfig();
      expect(loaded.alphaVantageKey).toBe('test-alpha-key-123');
      expect(loaded.financialDataKey).toBe('test-fd-key-456');
      expect(loaded.lastUpdated).toBeTruthy();
    });

    it('should update lastUpdated timestamp on save', () => {
      const config = {
        ...DEFAULT_API_KEY_CONFIG,
        alphaVantageKey: 'key-123',
      };

      saveApiKeyConfig(config);
      const loaded = loadApiKeyConfig();

      expect(loaded.lastUpdated).toBeTruthy();
      // Should be a valid ISO date string
      expect(new Date(loaded.lastUpdated!).toISOString()).toBeTruthy();
    });
  });

  describe('clearApiKeyConfig', () => {
    it('should remove stored API keys', () => {
      const config = {
        ...DEFAULT_API_KEY_CONFIG,
        alphaVantageKey: 'test-key',
      };

      saveApiKeyConfig(config);
      clearApiKeyConfig();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('fire-tools-api-keys');

      const loaded = loadApiKeyConfig();
      expect(loaded.alphaVantageKey).toBeUndefined();
    });
  });

  describe('hasApiKey', () => {
    it('should return false when no keys are configured', () => {
      expect(hasApiKey('alphavantage')).toBe(false);
      expect(hasApiKey('financialdata')).toBe(false);
    });

    it('should return true when Alpha Vantage key is configured', () => {
      saveApiKeyConfig({
        ...DEFAULT_API_KEY_CONFIG,
        alphaVantageKey: 'my-key',
      });

      expect(hasApiKey('alphavantage')).toBe(true);
      expect(hasApiKey('financialdata')).toBe(false);
    });

    it('should return true when financialdata.net key is configured', () => {
      saveApiKeyConfig({
        ...DEFAULT_API_KEY_CONFIG,
        financialDataKey: 'my-key',
      });

      expect(hasApiKey('alphavantage')).toBe(false);
      expect(hasApiKey('financialdata')).toBe(true);
    });

    it('should return false for empty string keys', () => {
      saveApiKeyConfig({
        ...DEFAULT_API_KEY_CONFIG,
        alphaVantageKey: '',
        financialDataKey: '   ',
      });

      expect(hasApiKey('alphavantage')).toBe(false);
      expect(hasApiKey('financialdata')).toBe(false);
    });
  });
});
