import {
  DEFAULT_SETTINGS,
  DEVICE_LOCAL_SETTINGS_KEYS,
  SYNCED_SETTINGS_KEYS,
  hasStoredSettings,
  loadSettings,
  mergeSettingsWithDefaults,
  saveSettings,
  type SyncedSettings,
  type UserSettings,
} from '../../cookieSettings';
import { canonicalStringify, isPlainObject } from '../canonical';
import type { DomainAdapter } from '../types';

/** The synced subset of complete settings (defaults filled in). */
export function pickSyncedSettings(settings: Partial<UserSettings>): SyncedSettings {
  const complete = mergeSettingsWithDefaults(settings);
  const result: Record<string, unknown> = {};
  for (const key of SYNCED_SETTINGS_KEYS) {
    if (complete[key] !== undefined) result[key] = complete[key];
  }
  return result as SyncedSettings;
}

const defaultSynced = (): string => canonicalStringify(pickSyncedSettings(DEFAULT_SETTINGS));

export const settingsAdapter: DomainAdapter<SyncedSettings> = {
  domain: 'settings',
  singletons: ['settings'],
  collections: [],

  readLocal() {
    return hasStoredSettings() ? pickSyncedSettings(loadSettings()) : null;
  },

  writeLocalCache(doc) {
    if (!doc && !hasStoredSettings()) return;
    const current = loadSettings();
    const synced = pickSyncedSettings(doc ?? {});
    const next: UserSettings = { ...current, country: undefined, ...synced };
    // Device-local preferences (backend, updater, logging, model keys) stay as they are.
    const deviceLocal = next as unknown as Record<string, unknown>;
    for (const key of DEVICE_LOCAL_SETTINGS_KEYS) deviceLocal[key] = current[key];
    saveSettings(next);
  },

  normalize(doc) {
    return { set: { settings: doc ? pickSyncedSettings(doc) : null }, collections: {} };
  },

  keyOf(collection) {
    throw new Error(`Settings have no collection named ${collection}.`);
  },

  denormalize(maps) {
    const value = maps.set.settings;
    return isPlainObject(value) ? pickSyncedSettings(value as Partial<UserSettings>) : null;
  },

  isEmpty(doc) {
    return !doc || canonicalStringify(pickSyncedSettings(doc)) === defaultSynced();
  },
};
