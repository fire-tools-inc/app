/**
 * User Settings utilities
 * Handles saving/loading user preferences to/from encrypted cookies
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import {
  CurrencySettings,
  DEFAULT_CURRENCY_SETTINGS,
} from '../types/currency';
import { AssetClass } from '../types/assetAllocation';
import { LlmCategorizationConfig } from '../types/pdfImport';
import { encryptData, decryptData } from './cookieEncryption';
import { IS_DEMO_MODE } from './demoMode';
import { logger } from './logger';

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

/**
 * UI language code. Kept here (instead of imported from `src/i18n`) so
 * cookieSettings has no dependency on the i18n module — avoids a cycle
 * because the i18n init reads settings to discover the saved language.
 */
export type LanguageCode = 'en' | 'it' | 'fr' | 'de' | 'es';

/**
 * Opt-in experimental / preview features. All default to false so they don't
 * appear in the UI for users who haven't explicitly enabled them.
 */
export interface ExperimentalFeatures {
  /** Portfolio Breakdown page — slices the current portfolio by currency,
   *  holding, sector, region, market, and ETF provider. */
  portfolioBreakdown: boolean;
  /** PDF import in the Expense Tracker — parse receipts, invoices,
   *  bank/credit-card statements, and payslips into transactions. */
  pdfImport: boolean;
}

export const DEFAULT_EXPERIMENTAL_FEATURES: ExperimentalFeatures = {
  portfolioBreakdown: false,
  pdfImport: false,
};

export type BackendMode = 'embedded' | 'custom';

/** Local-deployment backend connection settings.
 * - `embedded`: app uses the in-process backend bundled with Electron
 *   (no-op for non-Electron browser builds).
 * - `custom`: app talks to a separately-running backend at `customUrl`.
 *   Useful when running a shared backend on the LAN, in Docker, etc. */
export interface BackendSettings {
  mode: BackendMode;
  customUrl?: string;
}

export const DEFAULT_BACKEND_SETTINGS: BackendSettings = {
  mode: 'embedded',
};

/** Auto-updater settings (Electron desktop only). Web builds ignore these. */
export interface UpdaterSettings {
  /** Periodically check for updates on app start. */
  autoCheck: boolean;
  /** Automatically download an available update in the background. */
  autoDownload: boolean;
  /** Number of pre-install backups to keep. Minimum 1. */
  keepBackups: number;
  /** Notify only — never download or install automatically. */
  notifyOnly: boolean;
}

export const MIN_KEEP_BACKUPS = 1;
export const MAX_KEEP_BACKUPS = 100;

export const DEFAULT_UPDATER_SETTINGS: UpdaterSettings = {
  autoCheck: true,
  autoDownload: false,
  keepBackups: 3,
  notifyOnly: false,
};

export interface UserSettings {
  accountName: string;
  decimalSeparator: '.' | ',';
  decimalPlaces: number;
  currencySettings: CurrencySettings;
  privacyMode: boolean;
  /**
   * When `true`, the diagnostic logger is allowed to record financial PII
   * (tickers, quantities, account names, portfolio values, etc.) alongside
   * regular log messages. Off by default. Independent from `privacyMode`,
   * which only controls UI value blurring.
   */
  loggingPiiEnabled: boolean;
  /**
   * Maximum on-disk log file size before rotation, in megabytes. The Electron
   * main process clamps the effective value to 1–500MB. The log file lives in
   * the same directory as the SQLite database. Has no effect in the web build.
   */
  maxLogFileSizeMb: number;
  country?: string;
  dateFormat: DateFormat;
  fireAssetClassInclusion: Record<AssetClass, boolean>;
  includePrimaryResidenceInFIRE: boolean;
  searchThreshold: number;
  experimentalFeatures: ExperimentalFeatures;
  /** UI language. Always defaults to English. Independent from currency. */
  language: LanguageCode;
  /** Optional OpenAI-compatible LLM config for PDF import categorization.
   *  Stored encrypted with the rest of the settings. */
  llmCategorization?: LlmCategorizationConfig;
  /** Where the app finds its backend API (embedded vs. custom URL). */
  backend: BackendSettings;
  /** Auto-updater preferences (Electron desktop only). */
  updater: UpdaterSettings;
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
  loggingPiiEnabled: false,
  maxLogFileSizeMb: 50,
  country: undefined,
  dateFormat: 'DD/MM/YYYY',
  fireAssetClassInclusion: DEFAULT_FIRE_ASSET_CLASS_INCLUSION,
  includePrimaryResidenceInFIRE: true, // Default to including primary residence
  searchThreshold: 8,
  experimentalFeatures: DEFAULT_EXPERIMENTAL_FEATURES,
  language: 'en',
  backend: DEFAULT_BACKEND_SETTINGS,
  updater: DEFAULT_UPDATER_SETTINGS,
};

const SETTINGS_KEY = 'fire-calculator-settings';

// Cookie options
const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

/**
 * Save user settings to encrypted storage
 * @param settings - The settings to save
 */
export function saveSettings(settings: UserSettings): void {
  if (IS_DEMO_MODE) return;
  try {
    const settingsJson = JSON.stringify(settings);
    const encryptedSettings = encryptData(settingsJson);
    SafeCookies.set(SETTINGS_KEY, encryptedSettings, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('cookie-settings', 'save-failed', 'failed to save settings', { pii: { error: (error as Error)?.message } });
    throw new Error('Failed to save settings.');
  }
}

/**
 * Merge a partial / unknown updater payload with defaults and clamp the
 * backup retention count to the supported range.
 */
export function mergeUpdaterSettings(input: unknown): UpdaterSettings {
  const partial = (input && typeof input === 'object' ? input : {}) as Partial<UpdaterSettings>;
  // Only accept finite numeric input; NaN / Infinity / wrong types fall back
  // to the default so we never produce a non-finite or NaN keepBackups.
  const rawNum =
    typeof partial.keepBackups === 'number' && Number.isFinite(partial.keepBackups)
      ? Math.floor(partial.keepBackups)
      : DEFAULT_UPDATER_SETTINGS.keepBackups;
  const keepBackups = Math.max(MIN_KEEP_BACKUPS, Math.min(MAX_KEEP_BACKUPS, rawNum));
  return {
    autoCheck: typeof partial.autoCheck === 'boolean' ? partial.autoCheck : DEFAULT_UPDATER_SETTINGS.autoCheck,
    autoDownload: typeof partial.autoDownload === 'boolean' ? partial.autoDownload : DEFAULT_UPDATER_SETTINGS.autoDownload,
    notifyOnly: typeof partial.notifyOnly === 'boolean' ? partial.notifyOnly : DEFAULT_UPDATER_SETTINGS.notifyOnly,
    keepBackups,
  };
}

/**
 * Load user settings from encrypted storage
 * @returns The saved settings, or DEFAULT_SETTINGS if none saved
 */
export function loadSettings(): UserSettings {
  try {
    const encryptedSettings = SafeCookies.get(SETTINGS_KEY);
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
          backend: {
            ...DEFAULT_BACKEND_SETTINGS,
            ...(parsed.backend || {}),
          },
          updater: mergeUpdaterSettings(parsed.updater),
        };
      }
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    logger.error('cookie-settings', 'load-failed', 'failed to load settings from cookies', { pii: { error: (error as Error)?.message } });
    return DEFAULT_SETTINGS;
  }
}

/**
 * Clear user settings from storage
 */
export function clearSettings(): void {
  try {
    SafeCookies.remove(SETTINGS_KEY, { path: '/' });
  } catch (error) {
    logger.error('cookie-settings', 'clear-failed', 'failed to clear settings', { pii: { error: (error as Error)?.message } });
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

  if (settings.language !== undefined) {
    const validLanguages: LanguageCode[] = ['en', 'it', 'fr', 'de', 'es'];
    if (!validLanguages.includes(settings.language as LanguageCode)) {
      errors.push('Language must be one of: en, it, fr, de, es');
    }
  }

  if (settings.loggingPiiEnabled !== undefined && typeof settings.loggingPiiEnabled !== 'boolean') {
    errors.push('loggingPiiEnabled must be a boolean');
  }

  if (settings.backend !== undefined) {
    if (settings.backend.mode !== 'embedded' && settings.backend.mode !== 'custom') {
      errors.push('Backend mode must be "embedded" or "custom"');
    }
    if (settings.backend.mode === 'custom') {
      const url = settings.backend.customUrl;
      if (!url || typeof url !== 'string') {
        errors.push('Custom backend URL is required when mode is "custom"');
      } else {
        try {
          // eslint-disable-next-line no-new
          new URL(url);
        } catch {
          errors.push('Custom backend URL must be a valid absolute URL');
        }
      }
    }
  }

  if (settings.updater !== undefined) {
    if (typeof settings.updater !== 'object' || settings.updater === null) {
      errors.push('Updater settings must be an object');
    } else {
      if (settings.updater.autoCheck !== undefined && typeof settings.updater.autoCheck !== 'boolean') {
        errors.push('Updater autoCheck must be a boolean');
      }
      if (settings.updater.autoDownload !== undefined && typeof settings.updater.autoDownload !== 'boolean') {
        errors.push('Updater autoDownload must be a boolean');
      }
      if (settings.updater.notifyOnly !== undefined && typeof settings.updater.notifyOnly !== 'boolean') {
        errors.push('Updater notifyOnly must be a boolean');
      }
      if (settings.updater.keepBackups !== undefined) {
        const keep = settings.updater.keepBackups;
        if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < MIN_KEEP_BACKUPS || keep > MAX_KEEP_BACKUPS) {
          errors.push(`Updater keepBackups must be an integer between ${MIN_KEEP_BACKUPS} and ${MAX_KEEP_BACKUPS}`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
