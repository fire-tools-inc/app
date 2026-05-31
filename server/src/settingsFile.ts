/**
 * Settings JSON file persistence.
 *
 * The SQLite database remains the source of truth for live reads, but every
 * settings mutation is mirrored to a `settings.json` file in the same
 * directory as the database. This gives users:
 *   - A portable, human-readable backup that survives DB corruption
 *   - A predictable on-disk location for power users / CI / migrations
 *   - A stable artifact under Electron's `app.getPath('userData')`
 *
 * Writes are atomic: we write to `settings.json.tmp`, fsync, then rename. A
 * malformed file is preserved as `settings.json.corrupt-<timestamp>` so we
 * never silently destroy user data.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { fromBool01 } from './http.js';
import { logger } from './logger.js';

export const SETTINGS_FILE_NAME = 'settings.json';
export const SETTINGS_SCHEMA_VERSION = 1;

/** Filenames we will detect and migrate into the canonical settings.json. */
const LEGACY_FILE_NAMES = [
  'firetools-settings.json',
  'fire-tools-settings.json',
  'preferences.json',
];

export interface PerUserSettings {
  settings: Record<string, unknown>;
  notificationPreferences: Record<string, unknown>;
}

export interface SettingsFileShape {
  schemaVersion: number;
  generatedAt: string;
  /** Keyed by user id (string). Single-user mode uses `"1"`. */
  users: Record<string, PerUserSettings>;
}

/** Resolve the canonical settings.json path for a given DB path. */
export const getSettingsFilePath = (dbPath: string): string => {
  const dir = path.dirname(path.resolve(dbPath));
  return path.join(dir, SETTINGS_FILE_NAME);
};

const tmpPathFor = (target: string): string =>
  `${target}.tmp.${process.pid}.${Date.now()}`;

const corruptPathFor = (target: string): string =>
  `${target}.corrupt-${Date.now()}`;

/**
 * Safely read and parse the settings file.
 *
 * - Returns `null` if the file does not exist.
 * - On JSON parse failure: backs the file up to `settings.json.corrupt-<ts>`,
 *   logs the error, and returns `null` so callers can recover by resyncing
 *   from the database.
 * - Validates the top-level shape; anything unrecognized is rejected the
 *   same way (backed up + `null`).
 */
export const readSettingsFile = (filePath: string): SettingsFileShape | null => {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    logger.error('settingsFile', null, `failed to read ${filePath}: ${err}`);
    return null;
  }
  if (raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.error('settingsFile', null, `malformed JSON at ${filePath}: ${err}`);
    quarantine(filePath);
    return null;
  }
  if (!isSettingsFileShape(parsed)) {
    logger.error('settingsFile', null, `unexpected shape at ${filePath}`);
    quarantine(filePath);
    return null;
  }
  return parsed;
};

const isSettingsFileShape = (v: unknown): v is SettingsFileShape => {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.schemaVersion !== 'number') return false;
  if (typeof o.users !== 'object' || o.users === null) return false;
  for (const u of Object.values(o.users as Record<string, unknown>)) {
    if (typeof u !== 'object' || u === null) return false;
    const pu = u as Record<string, unknown>;
    if (typeof pu.settings !== 'object' || pu.settings === null) return false;
    if (typeof pu.notificationPreferences !== 'object' || pu.notificationPreferences === null)
      return false;
  }
  return true;
};

const quarantine = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      const dest = corruptPathFor(filePath);
      fs.renameSync(filePath, dest);
      logger.error('settingsFile', null, `quarantined corrupt file to ${dest}`);
    }
  } catch (err) {
    logger.error('settingsFile', null, `failed to quarantine ${filePath}: ${err}`);
  }
};

/**
 * Atomically write the settings file.
 *
 * Algorithm: write to a uniquely-named tmp in the same directory, fsync the
 * file descriptor (so the bytes are durable on disk), then rename onto the
 * target. `rename` is atomic within a single filesystem on POSIX and on
 * NTFS, which covers every platform Fire Tools ships on.
 *
 * Never throws — JSON sync failures must not break API responses. Returns
 * `true` on success, `false` on any failure (already logged).
 */
export const writeSettingsFileAtomic = (
  filePath: string,
  data: SettingsFileShape,
): boolean => {
  const tmp = tmpPathFor(filePath);
  let fd: number | null = null;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const payload = `${JSON.stringify(data, null, 2)}\n`;
    fd = fs.openSync(tmp, 'w', 0o600);
    fs.writeSync(fd, payload, 0, 'utf8');
    try {
      fs.fsyncSync(fd);
    } catch (err) {
      // fsync may legitimately fail on some FS (e.g. tmpfs, network mounts);
      // log but proceed — the rename still provides crash-consistency.
      logger.error('settingsFile', null, `fsync failed (continuing): ${err}`);
    }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    logger.error('settingsFile', null, `atomic write failed for ${filePath}: ${err}`);
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return false;
  }
};

/**
 * Look for legacy settings files alongside the DB and rename the first
 * match to the canonical filename. Safe to call repeatedly.
 *
 * Returns the path of the file we adopted, or `null` if nothing was migrated.
 */
export const migrateLegacySettingsFile = (dbPath: string): string | null => {
  const target = getSettingsFilePath(dbPath);
  if (fs.existsSync(target)) return null;
  const dir = path.dirname(target);
  for (const name of LEGACY_FILE_NAMES) {
    const candidate = path.join(dir, name);
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.renameSync(candidate, target);
      logger.systemEvent('settingsFile', null, `migrated legacy file ${candidate} -> ${target}`);
      return candidate;
    } catch (err) {
      logger.error('settingsFile', null, `legacy rename failed ${candidate}: ${err}`);
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// DB <-> JSON sync helpers
// ---------------------------------------------------------------------------

interface SettingsRow {
  user_id: number;
  account_name: string;
  decimal_separator: string;
  decimal_places: number;
  default_currency: string;
  use_api_rates: number;
  last_api_update: string | null;
  fallback_rates_json: string;
  privacy_mode: number;
  country: string | null;
  date_format: string;
  fire_asset_class_inclusion_json: string;
  include_primary_residence_in_fire: number;
  search_threshold: number;
  experimental_features_json: string;
  llm_base_url: string | null;
  llm_api_key: string | null;
  llm_model: string | null;
}

interface NotifPrefRow {
  user_id: number;
  enable_in_app_notifications: number;
  new_month_reminders: number;
  new_quarter_reminders: number;
  tax_reminders: number;
  dca_reminders: number;
  portfolio_alerts: number;
  fire_milestones: number;
  enable_email_notifications: number;
  email_address: string;
  email_frequency: string;
  tax_reminder_months_json: string;
  tax_reminder_days_before: number;
  last_checked: string | null;
}

const safeParseJson = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const rowToSettings = (row: SettingsRow): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    accountName: row.account_name,
    decimalSeparator: row.decimal_separator,
    decimalPlaces: row.decimal_places,
    currencySettings: {
      defaultCurrency: row.default_currency,
      fallbackRates: safeParseJson<Record<string, number>>(row.fallback_rates_json, {}),
      useApiRates: fromBool01(row.use_api_rates),
      lastApiUpdate: row.last_api_update,
    },
    privacyMode: fromBool01(row.privacy_mode),
    country: row.country,
    dateFormat: row.date_format,
    fireAssetClassInclusion: safeParseJson<Record<string, boolean>>(
      row.fire_asset_class_inclusion_json,
      {},
    ),
    includePrimaryResidenceInFIRE: fromBool01(row.include_primary_residence_in_fire),
    searchThreshold: row.search_threshold,
    experimentalFeatures: safeParseJson<Record<string, boolean>>(
      row.experimental_features_json,
      {},
    ),
  };
  if (row.llm_base_url && row.llm_api_key && row.llm_model) {
    out.llmCategorization = {
      baseUrl: row.llm_base_url,
      apiKey: row.llm_api_key,
      model: row.llm_model,
    };
  }
  return out;
};

const rowToNotifPref = (row: NotifPrefRow): Record<string, unknown> => ({
  enableInAppNotifications: fromBool01(row.enable_in_app_notifications),
  newMonthReminders: fromBool01(row.new_month_reminders),
  newQuarterReminders: fromBool01(row.new_quarter_reminders),
  taxReminders: fromBool01(row.tax_reminders),
  dcaReminders: fromBool01(row.dca_reminders),
  portfolioAlerts: fromBool01(row.portfolio_alerts),
  fireMilestones: fromBool01(row.fire_milestones),
  enableEmailNotifications: fromBool01(row.enable_email_notifications),
  emailAddress: row.email_address,
  emailFrequency: row.email_frequency,
  taxReminderMonths: safeParseJson<number[]>(row.tax_reminder_months_json, [3, 6, 9, 12]),
  taxReminderDaysBefore: row.tax_reminder_days_before,
  lastChecked: row.last_checked,
});

/**
 * Project the current contents of `user_settings` and
 * `notification_preferences` into a SettingsFileShape. Users without rows in
 * either table are skipped.
 */
export const projectFromDb = (db: Database): SettingsFileShape => {
  const settingsRows = db
    .prepare<unknown[], SettingsRow>('SELECT * FROM user_settings')
    .all() as SettingsRow[];
  const notifRows = db
    .prepare<unknown[], NotifPrefRow>('SELECT * FROM notification_preferences')
    .all() as NotifPrefRow[];

  const users: Record<string, PerUserSettings> = {};
  for (const row of settingsRows) {
    users[String(row.user_id)] = {
      settings: rowToSettings(row),
      notificationPreferences: {},
    };
  }
  for (const row of notifRows) {
    const key = String(row.user_id);
    if (!users[key]) {
      users[key] = { settings: {}, notificationPreferences: {} };
    }
    users[key].notificationPreferences = rowToNotifPref(row);
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    users,
  };
};

/**
 * Project current DB state to JSON and atomically write it. Returns `true`
 * on success. Never throws.
 */
export const syncSettingsToFile = (db: Database, filePath: string): boolean => {
  try {
    const shape = projectFromDb(db);
    return writeSettingsFileAtomic(filePath, shape);
  } catch (err) {
    logger.error('settingsFile', null, `sync from DB failed: ${err}`);
    return false;
  }
};

/**
 * Settings file store bound to a specific filesystem path. Pass to routers
 * so they can mirror writes without re-resolving the path each time.
 */
export interface SettingsFileStore {
  path: string;
  read: () => SettingsFileShape | null;
  syncFromDb: (db: Database) => boolean;
}

export const createSettingsFileStore = (dbPath: string): SettingsFileStore => {
  const filePath = getSettingsFilePath(dbPath);
  return {
    path: filePath,
    read: () => readSettingsFile(filePath),
    syncFromDb: (db: Database) => syncSettingsToFile(db, filePath),
  };
};
