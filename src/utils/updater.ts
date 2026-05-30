/**
 * Renderer-side wrapper around the Electron auto-updater bridge exposed by
 * the main process at `window.fireTools.updater`. Safe to import in any
 * build — falls back to no-ops (and a "disabled" state) in pure web builds.
 */

import type {
  UpdaterEvent,
  UpdaterPrefs,
  UpdaterState,
  BackupRecord,
} from './apiBase';

export type {
  UpdaterEvent,
  UpdaterPrefs,
  UpdaterState,
  UpdaterStatus,
  BackupRecord,
} from './apiBase';

const isElectron = (): boolean => typeof window !== 'undefined' && !!window.fireTools?.updater;
const isBackupsBridge = (): boolean => typeof window !== 'undefined' && !!window.fireTools?.backups;

const disabledState: UpdaterState = {
  status: 'disabled-dev',
  error: null,
  info: null,
  progress: null,
  result: null,
};

export async function checkForUpdates(): Promise<UpdaterState> {
  if (!isElectron()) return disabledState;
  return window.fireTools!.updater!.check();
}

export async function downloadUpdate(): Promise<UpdaterState> {
  if (!isElectron()) return disabledState;
  return window.fireTools!.updater!.download();
}

export async function installUpdate(): Promise<boolean> {
  if (!isElectron()) return false;
  return window.fireTools!.updater!.install();
}

export async function getUpdaterState(): Promise<UpdaterState> {
  if (!isElectron()) return disabledState;
  return window.fireTools!.updater!.getState();
}

export async function getUpdaterPrefs(): Promise<UpdaterPrefs | null> {
  if (!isElectron()) return null;
  return window.fireTools!.updater!.getPrefs();
}

export async function setUpdaterPrefs(prefs: Partial<UpdaterPrefs>): Promise<UpdaterPrefs | null> {
  if (!isElectron()) return null;
  return window.fireTools!.updater!.setPrefs(prefs);
}

export function subscribeUpdaterEvents(callback: (event: UpdaterEvent) => void): () => void {
  if (typeof window === 'undefined' || !window.fireTools?.onUpdaterEvent) {
    return () => {};
  }
  return window.fireTools.onUpdaterEvent(callback);
}

export async function listBackups(): Promise<BackupRecord[]> {
  if (!isBackupsBridge()) return [];
  const res = await window.fireTools!.backups!.list();
  return res.ok && res.backups ? res.backups : [];
}

export async function createBackupNow(): Promise<BackupRecord | null> {
  if (!isBackupsBridge()) return null;
  const res = await window.fireTools!.backups!.create();
  return res.ok && res.backup ? res.backup : null;
}

export async function restoreBackup(backupId: string): Promise<{
  ok: boolean;
  error?: string;
  safetyBackupId?: string;
  restored?: string[];
}> {
  if (!isBackupsBridge()) return { ok: false, error: 'Not running in Electron' };
  return window.fireTools!.backups!.restore({ backupId });
}

export const updaterBridgeAvailable = isElectron;
export const backupsBridgeAvailable = isBackupsBridge;
