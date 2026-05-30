import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { handler, resolveUserId, apiError, bool01, fromBool01, nowIso } from '../http.js';
import {
  type SettingsFileStore,
  type SettingsFileShape,
  type PerUserSettings,
} from '../settingsFile.js';

interface SettingsRow {
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

const parseJson = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const mapSettings = (row: SettingsRow) => {
  const out: Record<string, unknown> = {
    accountName: row.account_name,
    decimalSeparator: row.decimal_separator,
    decimalPlaces: row.decimal_places,
    currencySettings: {
      defaultCurrency: row.default_currency,
      fallbackRates: parseJson<Record<string, number>>(row.fallback_rates_json, {}),
      useApiRates: fromBool01(row.use_api_rates),
      lastApiUpdate: row.last_api_update,
    },
    privacyMode: fromBool01(row.privacy_mode),
    country: row.country,
    dateFormat: row.date_format,
    fireAssetClassInclusion: parseJson<Record<string, boolean>>(row.fire_asset_class_inclusion_json, {}),
    includePrimaryResidenceInFIRE: fromBool01(row.include_primary_residence_in_fire),
    searchThreshold: row.search_threshold,
    experimentalFeatures: parseJson<Record<string, boolean>>(row.experimental_features_json, {}),
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

const mapNotifPref = (row: NotifPrefRow) => ({
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
  taxReminderMonths: parseJson<number[]>(row.tax_reminder_months_json, [3, 6, 9, 12]),
  taxReminderDaysBefore: row.tax_reminder_days_before,
  lastChecked: row.last_checked,
});

const ensureSettings = (db: Database, userId: number): SettingsRow => {
  let row = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(userId) as SettingsRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as SettingsRow;
  }
  return row;
};

const ensureNotifPref = (db: Database, userId: number): NotifPrefRow => {
  let row = db
    .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
    .get(userId) as NotifPrefRow | undefined;
  if (!row) {
    db.prepare('INSERT INTO notification_preferences (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').get(userId) as NotifPrefRow;
  }
  return row;
};

type SettingsBody = Record<string, unknown>;

const applySettingsPatch = (db: Database, userId: number, patch: SettingsBody): void => {
  ensureSettings(db, userId);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown): void => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };
  if (typeof patch.accountName === 'string') set('account_name', patch.accountName);
  if (patch.decimalSeparator === '.' || patch.decimalSeparator === ',') set('decimal_separator', patch.decimalSeparator);
  if (typeof patch.decimalPlaces === 'number') set('decimal_places', patch.decimalPlaces);
  if (typeof patch.privacyMode === 'boolean') set('privacy_mode', bool01(patch.privacyMode));
  if (patch.country === null || typeof patch.country === 'string') set('country', patch.country);
  if (typeof patch.dateFormat === 'string') set('date_format', patch.dateFormat);
  if (typeof patch.includePrimaryResidenceInFIRE === 'boolean')
    set('include_primary_residence_in_fire', bool01(patch.includePrimaryResidenceInFIRE));
  if (typeof patch.searchThreshold === 'number') set('search_threshold', patch.searchThreshold);
  if (patch.fireAssetClassInclusion && typeof patch.fireAssetClassInclusion === 'object')
    set('fire_asset_class_inclusion_json', JSON.stringify(patch.fireAssetClassInclusion));
  if (patch.experimentalFeatures && typeof patch.experimentalFeatures === 'object')
    set('experimental_features_json', JSON.stringify(patch.experimentalFeatures));
  if (patch.currencySettings && typeof patch.currencySettings === 'object') {
    const cs = patch.currencySettings as Record<string, unknown>;
    if (typeof cs.defaultCurrency === 'string') set('default_currency', cs.defaultCurrency);
    if (typeof cs.useApiRates === 'boolean') set('use_api_rates', bool01(cs.useApiRates));
    if (cs.lastApiUpdate === null || typeof cs.lastApiUpdate === 'string') set('last_api_update', cs.lastApiUpdate);
    if (cs.fallbackRates && typeof cs.fallbackRates === 'object')
      set('fallback_rates_json', JSON.stringify(cs.fallbackRates));
  }
  if (patch.llmCategorization === null) {
    set('llm_base_url', null);
    set('llm_api_key', null);
    set('llm_model', null);
  } else if (patch.llmCategorization && typeof patch.llmCategorization === 'object') {
    const llm = patch.llmCategorization as Record<string, unknown>;
    if (typeof llm.baseUrl === 'string') set('llm_base_url', llm.baseUrl);
    if (typeof llm.apiKey === 'string') set('llm_api_key', llm.apiKey);
    if (typeof llm.model === 'string') set('llm_model', llm.model);
  }
  if (sets.length === 0) return;
  set('updated_at', nowIso());
  vals.push(userId);
  db.prepare(`UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = ?`).run(...vals);
};

const replaceNotifPref = (db: Database, userId: number, body: Record<string, unknown>): void => {
  ensureNotifPref(db, userId);
  const required = [
    'enableInAppNotifications',
    'newMonthReminders',
    'newQuarterReminders',
    'taxReminders',
    'dcaReminders',
    'portfolioAlerts',
    'fireMilestones',
    'enableEmailNotifications',
    'emailAddress',
    'emailFrequency',
    'taxReminderMonths',
    'taxReminderDaysBefore',
  ];
  for (const k of required) {
    if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
  }
  db.prepare(
    `UPDATE notification_preferences SET
       enable_in_app_notifications = ?,
       new_month_reminders         = ?,
       new_quarter_reminders       = ?,
       tax_reminders               = ?,
       dca_reminders               = ?,
       portfolio_alerts            = ?,
       fire_milestones             = ?,
       enable_email_notifications  = ?,
       email_address               = ?,
       email_frequency             = ?,
       tax_reminder_months_json    = ?,
       tax_reminder_days_before    = ?,
       last_checked                = ?,
       updated_at                  = ?
     WHERE user_id = ?`,
  ).run(
    bool01(body.enableInAppNotifications),
    bool01(body.newMonthReminders),
    bool01(body.newQuarterReminders),
    bool01(body.taxReminders),
    bool01(body.dcaReminders),
    bool01(body.portfolioAlerts),
    bool01(body.fireMilestones),
    bool01(body.enableEmailNotifications),
    String(body.emailAddress ?? ''),
    String(body.emailFrequency),
    JSON.stringify(body.taxReminderMonths ?? []),
    Number(body.taxReminderDaysBefore),
    (body.lastChecked as string | null) ?? null,
    nowIso(),
    userId,
  );
};

export const buildSettingsRouter = (db: Database, fileStore?: SettingsFileStore): Router => {
  const router = Router();

  /** Best-effort sync after a successful DB write. Errors are logged inside. */
  const mirror = (): void => {
    if (fileStore) fileStore.syncFromDb(db);
  };

  router.get(
    '/settings',
    handler((req, res) => {
      const userId = resolveUserId(req);
      res.json(mapSettings(ensureSettings(db, userId)));
    }),
  );

  router.put(
    '/settings',
    handler((req, res) => {
      const userId = resolveUserId(req);
      const body = (req.body ?? {}) as SettingsBody;
      const required = [
        'accountName',
        'decimalSeparator',
        'decimalPlaces',
        'currencySettings',
        'privacyMode',
        'dateFormat',
        'fireAssetClassInclusion',
        'includePrimaryResidenceInFIRE',
        'searchThreshold',
        'experimentalFeatures',
      ];
      for (const k of required) {
        if (!(k in body)) throw apiError(400, 'invalid_body', `Missing required field: ${k}`);
      }
      applySettingsPatch(db, userId, body);
      mirror();
      res.json(mapSettings(ensureSettings(db, userId)));
    }),
  );

  router.patch(
    '/settings',
    handler((req, res) => {
      const userId = resolveUserId(req);
      applySettingsPatch(db, userId, (req.body ?? {}) as SettingsBody);
      mirror();
      res.json(mapSettings(ensureSettings(db, userId)));
    }),
  );

  router.get(
    '/settings/notifications',
    handler((req, res) => {
      const userId = resolveUserId(req);
      res.json(mapNotifPref(ensureNotifPref(db, userId)));
    }),
  );

  router.put(
    '/settings/notifications',
    handler((req, res) => {
      const userId = resolveUserId(req);
      replaceNotifPref(db, userId, (req.body ?? {}) as Record<string, unknown>);
      mirror();
      res.json(mapNotifPref(ensureNotifPref(db, userId)));
    }),
  );

  // ----- settings.json file management -----------------------------------

  router.get(
    '/settings/file',
    handler((_req, res) => {
      if (!fileStore) {
        throw apiError(503, 'settings_file_unavailable', 'Settings file persistence is disabled');
      }
      const contents = fileStore.read();
      res.json({
        path: fileStore.path,
        exists: contents !== null,
        contents,
      });
    }),
  );

  router.post(
    '/settings/file/sync',
    handler((_req, res) => {
      if (!fileStore) {
        throw apiError(503, 'settings_file_unavailable', 'Settings file persistence is disabled');
      }
      const ok = fileStore.syncFromDb(db);
      if (!ok) throw apiError(500, 'settings_file_write_failed', 'Failed to write settings.json');
      res.json({ path: fileStore.path, ok: true });
    }),
  );

  router.post(
    '/settings/file/import',
    handler((req, res) => {
      const body = req.body as SettingsFileShape | undefined;
      if (!body || typeof body !== 'object' || !('users' in body)) {
        throw apiError(400, 'invalid_body', 'Expected SettingsFileShape with `users` map');
      }
      const userId = resolveUserId(req);
      const perUser = pickUserPayload(body, userId);
      if (!perUser) {
        throw apiError(
          400,
          'invalid_body',
          `No settings found for user ${userId} in provided payload`,
        );
      }
      if (perUser.settings && Object.keys(perUser.settings).length > 0) {
        applySettingsPatch(db, userId, perUser.settings);
      }
      if (
        perUser.notificationPreferences &&
        Object.keys(perUser.notificationPreferences).length > 0
      ) {
        replaceNotifPref(db, userId, perUser.notificationPreferences);
      }
      mirror();
      res.json({
        settings: mapSettings(ensureSettings(db, userId)),
        notificationPreferences: mapNotifPref(ensureNotifPref(db, userId)),
      });
    }),
  );

  return router;
};

/**
 * Choose the user payload from an imported SettingsFileShape. Prefers the
 * exact user id match; falls back to the only present user when there is
 * exactly one (covers single-user exports from a different install).
 */
const pickUserPayload = (
  shape: SettingsFileShape,
  userId: number,
): PerUserSettings | null => {
  const direct = shape.users[String(userId)];
  if (direct) return direct;
  const keys = Object.keys(shape.users);
  if (keys.length === 1) return shape.users[keys[0]];
  return null;
};
