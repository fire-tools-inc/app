/**
 * User Settings utilities
 * Handles saving/loading user preferences to/from encrypted cookies
 */

import Cookies from 'js-cookie';
import {
  CurrencySettings,
  DEFAULT_CURRENCY_SETTINGS,
} from '../types/currency';
import { AssetClass } from '../types/assetAllocation';
import { encryptData, decryptData } from './cookieEncryption';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

/**
 * Opt-in experimental / preview features. All default to false so they don't
 * appear in the UI for users who haven't explicitly enabled them.
 */
export interface ExperimentalFeatures {
  /** Portfolio Breakdown page — slices the current portfolio by currency,
   *  holding, sector, region, market, and ETF provider. */
  portfolioBreakdown: boolean;
}

export const DEFAULT_EXPERIMENTAL_FEATURES: ExperimentalFeatures = {
  portfolioBreakdown: false,
};

export interface UserSettings {
  accountName: string;
  decimalSeparator: '.' | ',';
  decimalPlaces: number;
  currencySettings: CurrencySettings;
  privacyMode: boolean;
  country?: string;
  dateFormat: DateFormat;
  fireAssetClassInclusion: Record<AssetClass, boolean>;
  includePrimaryResidenceInFIRE: boolean;
  searchThreshold: number;
  experimentalFeatures: ExperimentalFeatures;
}

export const DEFAULT_FIRE_ASSET_CLASS_INCLUSION: Record<AssetClass, boolean> = {
  STOCKS: true,
  BONDS: true,
  CASH: true,
  CRYPTO: false,
  REAL_ESTATE: true,
  COMMODITIES: true,
  VEHICLE: false,
  COLLECTIBLE: false,
  ART: false,
};

export const DEFAULT_SETTINGS: UserSettings = {
  accountName: 'My Portfolio',
  decimalSeparator: '.',
  decimalPlaces: 2,
  currencySettings: DEFAULT_CURRENCY_SETTINGS,
  privacyMode: false,
  country: undefined,
  dateFormat: 'DD/MM/YYYY',
  fireAssetClassInclusion: DEFAULT_FIRE_ASSET_CLASS_INCLUSION,
  includePrimaryResidenceInFIRE: true, // Default to including primary residence
  searchThreshold: 8,
  experimentalFeatures: DEFAULT_EXPERIMENTAL_FEATURES,
};

const SETTINGS_KEY = 'fire-calculator-settings';

// Cookie options
const COOKIE_OPTIONS: Cookies.CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: window.location.protocol === 'https:',
  path: '/',
};

/**
 * Save user settings to encrypted cookies
 * @param settings - The settings to save
 */
export function saveSettings(settings: UserSettings): void {
  try {
    const settingsJson = JSON.stringify(settings);
    const encryptedSettings = encryptData(settingsJson);
    Cookies.set(SETTINGS_KEY, encryptedSettings, COOKIE_OPTIONS);
  } catch (error) {
    console.error('Failed to save settings to cookies:', error);
    throw new Error('Failed to save settings to cookies. Cookies may be disabled.');
  }
}

/**
 * Load user settings from encrypted cookies
 * @returns The saved settings, or DEFAULT_SETTINGS if none saved
 */
export function loadSettings(): UserSettings {
  try {
    const encryptedSettings = Cookies.get(SETTINGS_KEY);
    if (encryptedSettings) {
      const decryptedSettings = decryptData(encryptedSettings);
      if (decryptedSettings) {
        const parsed = JSON.parse(decryptedSettings);
        // Merge with defaults to ensure all fields exist
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          currencySettings: {
            ...DEFAULT_SETTINGS.currencySettings,
            ...(parsed.currencySettings || {}),
            fallbackRates: {
              ...DEFAULT_SETTINGS.currencySettings.fallbackRates,
              ...(parsed.currencySettings?.fallbackRates || {}),
            },
          },
          fireAssetClassInclusion: {
            ...DEFAULT_FIRE_ASSET_CLASS_INCLUSION,
            ...(parsed.fireAssetClassInclusion || {}),
          },
          experimentalFeatures: {
            ...DEFAULT_EXPERIMENTAL_FEATURES,
            ...(parsed.experimentalFeatures || {}),
          },
        };
      }
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings from cookies:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Clear user settings from cookies
 */
export function clearSettings(): void {
  try {
    Cookies.remove(SETTINGS_KEY, { path: '/' });
  } catch (error) {
    console.error('Failed to clear settings from cookies:', error);
  }
}

/**
 * Update a single fallback rate
 * @param settings - Current settings
 * @param currency - Currency to update
 * @param rate - New rate
 * @returns Updated settings
 */
export function updateFallbackRate(
  settings: UserSettings,
  currency: string,
  rate: number
): UserSettings {
  return {
    ...settings,
    currencySettings: {
      ...settings.currencySettings,
      fallbackRates: {
        ...settings.currencySettings.fallbackRates,
        [currency]: rate,
      },
    },
  };
}

/**
 * Validate user settings
 * @param settings - Settings to validate
 * @returns Validation result with any errors
 */
export function validateSettings(settings: Partial<UserSettings>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (settings.accountName !== undefined) {
    if (typeof settings.accountName !== 'string') {
      errors.push('Account name must be a string');
    } else if (settings.accountName.length > 100) {
      errors.push('Account name must be 100 characters or less');
    }
  }

  if (settings.decimalSeparator !== undefined) {
    if (settings.decimalSeparator !== '.' && settings.decimalSeparator !== ',') {
      errors.push('Decimal separator must be "." or ","');
    }
  }

  if (settings.decimalPlaces !== undefined) {
    if (typeof settings.decimalPlaces !== 'number' || !Number.isInteger(settings.decimalPlaces)) {
      errors.push('Decimal places must be an integer');
    } else if (settings.decimalPlaces < 0 || settings.decimalPlaces > 4) {
      errors.push('Decimal places must be between 0 and 4');
    }
  }

  if (settings.currencySettings?.fallbackRates) {
    for (const [currency, rate] of Object.entries(settings.currencySettings.fallbackRates)) {
      if (typeof rate !== 'number' || rate <= 0) {
        errors.push(`Invalid rate for ${currency}: must be a positive number`);
      }
    }
  }

  if (settings.dateFormat !== undefined) {
    const validFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
    if (!validFormats.includes(settings.dateFormat)) {
      errors.push('Date format must be "DD/MM/YYYY", "MM/DD/YYYY", or "YYYY-MM-DD"');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
