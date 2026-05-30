// Thin wrapper around electron-updater that:
//   * Is a no-op when the app is not packaged (dev / test).
//   * Persists user preferences (auto check / auto download / backup retention)
//     under <userData>/auto-update.json so the main process has them before the
//     renderer is even ready.
//   * Takes a backup via electron/backup.cjs before installing.
//   * Forwards lifecycle events to the renderer on `fire-tools:updater-event`.

const { app } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const backup = require('./backup.cjs');

const PREFS_FILENAME = 'auto-update.json';
const DEFAULT_PREFS = Object.freeze({
  autoCheck: true,       // poll for updates on startup
  autoDownload: false,   // wait for user click before downloading
  keepBackups: 3,        // retention (>= 1)
  notifyOnly: false,     // surface availability but never download/install automatically
});

const MIN_KEEP = 1;
const MAX_KEEP = 100;

let initialized = false;
let prefsCache = null;
let getWindowFn = null;
let notifyFn = null;
let autoUpdater = null;
let lastState = {
  status: 'idle',
  error: null,
  info: null,
  progress: null,
};

function prefsPath() {
  return path.join(app.getPath('userData'), PREFS_FILENAME);
}

function clampKeep(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_PREFS.keepBackups;
  if (n < MIN_KEEP) return MIN_KEEP;
  if (n > MAX_KEEP) return MAX_KEEP;
  return n;
}

function normalizePrefs(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    autoCheck: typeof src.autoCheck === 'boolean' ? src.autoCheck : DEFAULT_PREFS.autoCheck,
    autoDownload: typeof src.autoDownload === 'boolean' ? src.autoDownload : DEFAULT_PREFS.autoDownload,
    keepBackups: clampKeep(src.keepBackups),
    notifyOnly: typeof src.notifyOnly === 'boolean' ? src.notifyOnly : DEFAULT_PREFS.notifyOnly,
  };
}

async function loadPrefs() {
  if (prefsCache) return prefsCache;
  try {
    const raw = await fsp.readFile(prefsPath(), 'utf8');
    prefsCache = normalizePrefs(JSON.parse(raw));
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      console.error('[fire-tools] failed to read updater prefs, using defaults:', err);
    }
    prefsCache = { ...DEFAULT_PREFS };
  }
  return prefsCache;
}

async function savePrefs(next) {
  const normalized = normalizePrefs(next);
  prefsCache = normalized;
  try {
    await fsp.mkdir(path.dirname(prefsPath()), { recursive: true });
    await fsp.writeFile(prefsPath(), JSON.stringify(normalized, null, 2), 'utf8');
  } catch (err) {
    console.error('[fire-tools] failed to persist updater prefs:', err);
  }
  return normalized;
}

function snapshotState() {
  return { ...lastState };
}

function emit(payload) {
  const event = { ...payload, ts: Date.now() };
  if (event.status) lastState.status = event.status;
  if (event.error !== undefined) lastState.error = event.error;
  if (event.info !== undefined) lastState.info = event.info;
  if (event.progress !== undefined) lastState.progress = event.progress;
  try {
    const win = getWindowFn ? getWindowFn() : null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('fire-tools:updater-event', event);
    }
  } catch (err) {
    console.error('[fire-tools] failed to forward updater event:', err);
  }
}

async function takeBackupSafe(reason) {
  try {
    const created = await backup.createBackup({
      userDataDir: app.getPath('userData'),
      version: app.getVersion(),
    });
    const prefs = await loadPrefs();
    const rotation = await backup.rotateBackups({
      userDataDir: app.getPath('userData'),
      keep: prefs.keepBackups,
    });
    emit({
      status: lastState.status,
      info: lastState.info,
      backup: { id: created.id, reason, kept: rotation.kept, removed: rotation.removed },
    });
    return created;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('[fire-tools] backup before update failed:', err);
    emit({ status: 'backup-failed', error: message });
    throw err;
  }
}

/**
 * Initialize the updater (idempotent).
 *
 * @param {Object} opts
 * @param {() => Electron.BrowserWindow | null} opts.getWindow
 * @param {(opts: { title: string, body: string }) => void} [opts.notify]  Optional native-notification dispatcher.
 */
async function setupUpdater({ getWindow, notify } = {}) {
  if (initialized) return { skipped: false };
  initialized = true;
  getWindowFn = typeof getWindow === 'function' ? getWindow : null;
  notifyFn = typeof notify === 'function' ? notify : null;

  if (!app.isPackaged) {
    // Dev mode: keep API surface available but never reach out to GitHub.
    console.log('[fire-tools] auto-updater disabled in dev (app not packaged)');
    emit({ status: 'disabled-dev' });
    return { skipped: true, reason: 'dev' };
  }

  let mod;
  try {
    // Lazy require so dev / test environments without the dependency don't crash.
    mod = require('electron-updater');
  } catch (err) {
    console.error('[fire-tools] electron-updater is not installed:', err);
    emit({ status: 'disabled-missing-dep', error: 'electron-updater not installed' });
    return { skipped: true, reason: 'missing-dep' };
  }

  autoUpdater = mod.autoUpdater;
  autoUpdater.autoDownload = false; // we drive downloads ourselves based on prefs
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (...args) => console.log('[fire-tools][updater]', ...args),
    warn: (...args) => console.warn('[fire-tools][updater]', ...args),
    error: (...args) => console.error('[fire-tools][updater]', ...args),
    debug: () => {},
  };

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking' }));
  autoUpdater.on('update-available', async (info) => {
    emit({ status: 'available', info });
    if (notifyFn) {
      try {
        notifyFn({
          title: 'Fire Tools update available',
          body: `Version ${info && info.version ? info.version : ''} is ready to download.`,
        });
      } catch (err) {
        console.error('[fire-tools] update-available notify failed:', err);
      }
    }
    const prefs = await loadPrefs();
    if (prefs.autoDownload && !prefs.notifyOnly) {
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        emit({ status: 'error', error: err && err.message ? err.message : String(err) });
      }
    }
  });
  autoUpdater.on('update-not-available', (info) => emit({ status: 'not-available', info }));
  autoUpdater.on('download-progress', (progress) => emit({ status: 'downloading', progress }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'downloaded', info }));
  autoUpdater.on('error', (err) => {
    emit({ status: 'error', error: err && err.message ? err.message : String(err) });
  });

  const prefs = await loadPrefs();
  if (prefs.autoCheck) {
    // Defer to avoid contending with embedded backend startup.
    setTimeout(() => {
      autoUpdater
        .checkForUpdates()
        .catch((err) => emit({ status: 'error', error: err && err.message ? err.message : String(err) }));
    }, 10_000);
  }

  return { skipped: false };
}

async function check() {
  if (!autoUpdater) {
    emit({ status: 'disabled-dev' });
    return snapshotState();
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ...snapshotState(), result: result ? { version: result.updateInfo?.version } : null };
  } catch (err) {
    emit({ status: 'error', error: err && err.message ? err.message : String(err) });
    return snapshotState();
  }
}

async function download() {
  if (!autoUpdater) {
    emit({ status: 'disabled-dev' });
    return snapshotState();
  }
  try {
    await autoUpdater.downloadUpdate();
    return snapshotState();
  } catch (err) {
    emit({ status: 'error', error: err && err.message ? err.message : String(err) });
    return snapshotState();
  }
}

async function quitAndInstall() {
  if (!autoUpdater) {
    emit({ status: 'disabled-dev' });
    return false;
  }
  try {
    await takeBackupSafe('pre-install');
  } catch {
    // Backup failure is fatal: we will not proceed with the install.
    return false;
  }
  try {
    // isSilent=false so the user can see the install screen on Windows.
    // forceRunAfter=true to relaunch automatically after the new version installs.
    autoUpdater.quitAndInstall(false, true);
    return true;
  } catch (err) {
    emit({ status: 'error', error: err && err.message ? err.message : String(err) });
    return false;
  }
}

async function getPrefs() {
  return await loadPrefs();
}

async function setPrefs(next) {
  const prev = await loadPrefs();
  const normalized = await savePrefs({ ...prev, ...(next && typeof next === 'object' ? next : {}) });
  return normalized;
}

function getState() {
  return snapshotState();
}

module.exports = {
  setupUpdater,
  check,
  download,
  quitAndInstall,
  getPrefs,
  setPrefs,
  getState,
  _internals: {
    DEFAULT_PREFS,
    MIN_KEEP,
    MAX_KEEP,
    normalizePrefs,
    prefsPath,
  },
};

// Silence unused-binding warnings for transitive requires.
void fs;
