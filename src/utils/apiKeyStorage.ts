/**
 * API Key Storage
 * 
 * Manages encrypted storage of user-provided API keys for price data providers.
 * Keys are stored in localStorage with AES encryption for obfuscation.
 */

import { ApiKeyConfig, DEFAULT_API_KEY_CONFIG } from '../types/priceApi';
import { encryptData, decryptData } from './cookieEncryption';

const API_KEY_STORAGE_KEY = 'fire-tools-api-keys';

/**
 * Save API key configuration to encrypted localStorage
 * @param config - The API key configuration to save
 */
export function saveApiKeyConfig(config: ApiKeyConfig): void {
  try {
    const updatedConfig: ApiKeyConfig = {
      ...config,
      lastUpdated: new Date().toISOString(),
    };
    const encrypted = encryptData(JSON.stringify(updatedConfig));
    localStorage.setItem(API_KEY_STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('Failed to save API key configuration:', error);
  }
}

/**
 * Load API key configuration from encrypted localStorage
 * @returns The API key configuration or defaults if not found
 */
export function loadApiKeyConfig(): ApiKeyConfig {
  try {
    const encrypted = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (!encrypted) {
      return { ...DEFAULT_API_KEY_CONFIG };
    }

    const decrypted = decryptData(encrypted);
    if (!decrypted) {
      return { ...DEFAULT_API_KEY_CONFIG };
    }

    const config = JSON.parse(decrypted) as ApiKeyConfig;
    return {
      ...DEFAULT_API_KEY_CONFIG,
      ...config,
    };
  } catch {
    return { ...DEFAULT_API_KEY_CONFIG };
  }
}

/**
 * Clear all stored API keys
 */
export function clearApiKeyConfig(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear API key configuration:', error);
  }
}

/**
 * Check if a specific provider API key is configured
 * @param provider - The provider to check
 * @returns True if an API key is configured for the provider
 */
export function hasApiKey(provider: 'alphavantage' | 'financialdata'): boolean {
  const config = loadApiKeyConfig();
  if (provider === 'alphavantage') {
    return !!config.alphaVantageKey && config.alphaVantageKey.trim().length > 0;
  }
  if (provider === 'financialdata') {
    return !!config.financialDataKey && config.financialDataKey.trim().length > 0;
  }
  return false;
}
