// Electron main process. Plain CommonJS so it loads cleanly even though
// the root package.json declares "type": "module" for Vite.
const { app, BrowserWindow, shell, ipcMain, nativeImage, nativeTheme, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const windowState = require('./windowState.cjs');
const { installMenu, DOCS_URL, REPO_URL } = require('./menu.cjs');
const backup = require('./backup.cjs');
const updater = require('./updater.cjs');
const logFile = require('./logFile.cjs');

const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
const isMac = process.platform === 'darwin';

// Force the product name early so the OS (especially macOS NotificationCenter
// in dev mode, where the bundle id is Electron's default) attributes
// notifications, the menu bar, and About panel to "Fire Tools".
app.setName('Fire Tools');

// Resolve the brand icon once. Used for native notifications and the macOS
// Dock so the user always sees the Fire Tools logo regardless of how the
// app is launched (dev electron binary vs packaged app).
const BRAND_ICON_PATH = path.join(__dirname, 'build', 'icon.png');
let brandIconImage = null;
try {
  if (fs.existsSync(BRAND_ICON_PATH)) {
    const img = nativeImage.createFromPath(BRAND_ICON_PATH);
    if (!img.isEmpty()) brandIconImage = img;
  }
} catch (err) {
  console.warn('[fire-tools] could not load brand icon:', err && err.message ? err.message : err);
}

// Enforce single instance: prevents two processes racing on the SQLite DB
// and gives users a clean "focus existing window" UX when they re-launch.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  return;
}

let mainWindow = null;
let embeddedServer = null;
let embeddedServerError = null;

// Initialise the on-disk log file before anything else can call logInfo/Error.
// Logs live next to the SQLite DB so bug reports and backups always travel
// together. Size cap defaults to 50MB; users can adjust via Settings.
try {
  logFile.init({ dir: app.getPath('userData') });
} catch (err) {
  console.error('[fire-tools] failed to init log file:', err);
}

// Wrap raw console output so every main-process diagnostic also lands in the
// on-disk log file alongside backend/renderer entries. Kept tiny on purpose;
// callers still get console output, the file just gets a mirrored copy.
function nowStamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function mainLogLine(level, parts) {
  const text = parts
    .map((p) => {
      if (p instanceof Error) return p.stack || p.message;
      if (typeof p === 'string') return p;
      try { return JSON.stringify(p); } catch { return String(p); }
    })
    .join(' ');
  return `[${nowStamp()}] [electron-main] [system] [${level}]: ${text}\n`;
}

function logInfo(...args) {
  console.log(...args);
  try { logFile.append(mainLogLine('info', args)); } catch { /* ignore */ }
}

function logWarn(...args) {
  console.warn(...args);
  try { logFile.append(mainLogLine('warn', args)); } catch { /* ignore */ }
}

function logError(...args) {
  console.error(...args);
  try { logFile.append(mainLogLine('error', args)); } catch { /* ignore */ }
}

async function startEmbedded() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'firetools.db');
    // Use __dirname-relative paths so resolution works whether we're launched
    // unpackaged (electron electron/main.cjs → __dirname = <repo>/electron)
    // or packaged inside an asar (__dirname = .../app.asar/electron). In both
    // cases server/ is the sibling directory next to electron/.
    const projectRoot = path.resolve(__dirname, '..');
    const migrationsPath = path.join(projectRoot, 'server', 'migrations');
    const embedEntry = path.join(projectRoot, 'server', 'dist', 'embed.js');

    if (!fs.existsSync(migrationsPath)) {
      throw new Error(`Migrations directory not found at ${migrationsPath}`);
    }
    if (!fs.existsSync(embedEntry)) {
      throw new Error(
        `Embedded server entry not found at ${embedEntry}. Did you run \`npm run --workspace server build\`?`
      );
    }

    const embedModule = await import(
      require('node:url').pathToFileURL(embedEntry).href
    );
    embeddedServer = await embedModule.startEmbeddedServer({
      dbPath,
      migrationsPath,
      host: '127.0.0.1',
      corsAllowAll: true,
      // Funnel backend log lines into the same on-disk file the renderer
      // writes to, so bug-report exports contain both sides of the stack.
      logSink: (line) => logFile.append(line),
    });
    logInfo(
      `[fire-tools] embedded backend started at ${embeddedServer.url} (db: ${embeddedServer.dbPath})`
    );
  } catch (err) {
    embeddedServerError = err && err.message ? err.message : String(err);
    logError('[fire-tools] failed to start embedded backend:', err);
  }
}

function loadInitialRoute(win) {
  // Open directly to the FIRE Calculator so the primary tool is visible
  // without the user having to click through the homepage tiles.
  const initialRoute = '/fire-calculator';
  if (isDev) {
    // Dev server runs in `--mode electron` (base '/'), so we hit the route
    // directly without the web build's `/demo` basename.
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${initialRoute}`);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist-electron', 'index.html'), {
      hash: initialRoute,
    });
  }
}

function createWindow() {
  const state = windowState.loadState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0A0B0E',
    title: 'Fire Tools',
    show: false, // show after ready-to-show to avoid white flash
    // Native macOS look: hide the title bar but keep traffic-light controls
    // inset into the window. Other platforms keep the standard frame.
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  windowState.attach(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (state.isMaximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Open external links in the default browser, not in the Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  loadInitialRoute(mainWindow);
}

function focusMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

ipcMain.handle('fire-tools:embedded-backend-info', () => ({
  url: embeddedServer ? embeddedServer.url : null,
  dbPath: embeddedServer ? embeddedServer.dbPath : null,
  error: embeddedServerError,
}));

ipcMain.handle('fire-tools:open-external', (_event, url) => {
  if (typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  shell.openExternal(url);
  return true;
});

// --- Log file IPC -------------------------------------------------------
// Renderer ships fully formatted log lines (already PII-gated) to be
// appended to the shared on-disk log. setMaxMb adjusts the rotation
// threshold without restarting the app.
ipcMain.handle('fire-tools:log-append', (_event, line) => {
  if (typeof line !== 'string' || line.length === 0) return false;
  try { logFile.append(line); return true; } catch { return false; }
});

ipcMain.handle('fire-tools:log-set-max-mb', (_event, mb) => {
  const num = typeof mb === 'number' ? mb : Number(mb);
  if (!Number.isFinite(num) || num <= 0) return false;
  try { logFile.setMaxBytes(Math.floor(num) * 1024 * 1024); return true; } catch { return false; }
});

ipcMain.handle('fire-tools:log-get-info', () => {
  try {
    const info = logFile.getInfo();
    return { ok: true, ...info, maxMb: Math.round(info.maxBytes / (1024 * 1024)) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

// Hold strong references to in-flight Notifications. Electron's docs warn
// that without this the GC can collect them before they're displayed,
// which is exactly what was happening on macOS — show() returned but the
// toast never reached NotificationCenter.
const liveNotifications = new Set();

// Show a native OS notification (macOS NotificationCenter / Windows Action
// Center / Linux libnotify). Title is required; everything else is opt-in.
function showNativeNotification(opts) {
  try {
    if (!Notification.isSupported()) {
      console.warn('[fire-tools] native notifications not supported on this platform');
      return false;
    }
    if (!opts || typeof opts.title !== 'string' || opts.title.length === 0) {
      return false;
    }
    const body = typeof opts.body === 'string' ? opts.body : '';
    const urgency =
      opts.urgency === 'low' || opts.urgency === 'critical'
        ? opts.urgency
        : 'normal';
    const notification = new Notification({
      title: opts.title,
      body,
      silent: false,
      urgency, // Linux only; ignored elsewhere
      // Explicit icon so macOS NotificationCenter (and other platforms)
      // show the Fire Tools logo even in dev mode where the bundle id
      // falls back to Electron's default.
      ...(brandIconImage ? { icon: brandIconImage } : {}),
    });
    liveNotifications.add(notification);
    const release = () => liveNotifications.delete(notification);
    notification.on('click', () => {
      focusMainWindow();
      release();
    });
    notification.on('close', release);
    notification.on('failed', (_e, error) => {
      console.error('[fire-tools] native notification failed:', error);
      release();
    });
    // Belt-and-braces: free the reference after a reasonable display window
    // even if the OS never fires close (some Linux notifiers don't).
    setTimeout(release, 30_000);
    notification.show();
    return true;
  } catch (err) {
    console.error('[fire-tools] failed to show native notification:', err);
    return false;
  }
}

ipcMain.handle('fire-tools:show-native-notification', (_event, opts) => {
  return showNativeNotification(opts);
});

// --- Auto-updater IPC ---------------------------------------------------
ipcMain.handle('fire-tools:updater-check', async () => {
  try {
    return await updater.check();
  } catch (err) {
    console.error('[fire-tools] updater check failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fire-tools:updater-download', async () => {
  try {
    return await updater.download();
  } catch (err) {
    console.error('[fire-tools] updater download failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fire-tools:updater-install', async () => {
  try {
    return await updater.quitAndInstall();
  } catch (err) {
    console.error('[fire-tools] updater install failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fire-tools:updater-state', () => updater.getState());

ipcMain.handle('fire-tools:updater-get-prefs', () => updater.getPrefs());

ipcMain.handle('fire-tools:updater-set-prefs', (_event, prefs) => {
  try {
    return updater.setPrefs(prefs || {});
  } catch (err) {
    console.error('[fire-tools] updater set-prefs failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

// --- Backup IPC ---------------------------------------------------------
ipcMain.handle('fire-tools:backups-list', async () => {
  try {
    const backups = await backup.listBackups({ userDataDir: app.getPath('userData') });
    return { ok: true, backups };
  } catch (err) {
    console.error('[fire-tools] backups list failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fire-tools:backups-create', async () => {
  try {
    const result = await backup.createBackup({
      userDataDir: app.getPath('userData'),
      version: app.getVersion(),
    });
    const prefs = await updater.getPrefs();
    await backup.rotateBackups({
      userDataDir: app.getPath('userData'),
      keep: prefs && typeof prefs.keepBackups === 'number' ? prefs.keepBackups : 3,
    });
    return { ok: true, backup: result };
  } catch (err) {
    console.error('[fire-tools] backups create failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('fire-tools:backups-restore', async (_event, opts) => {
  try {
    if (!opts || typeof opts.backupId !== 'string') {
      return { ok: false, error: 'backupId required' };
    }
    const result = await backup.restoreBackup({
      userDataDir: app.getPath('userData'),
      backupId: opts.backupId,
      currentVersion: app.getVersion(),
    });
    return { ok: true, ...result };
  } catch (err) {
    console.error('[fire-tools] backups restore failed:', err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

app.on('second-instance', () => {
  focusMainWindow();
});

app.whenReady().then(async () => {
  // Required for Windows toasts to register and group under the right
  // application identity. Must match electron-builder.yml `appId`.
  if (typeof app.setAppUserModelId === 'function') {
    app.setAppUserModelId('dev.mb-consulting.firetools');
  }

  // Make sure the Dock icon on macOS matches the brand, even in dev
  // where Electron would otherwise show its own logo.
  if (isMac && brandIconImage && app.dock && typeof app.dock.setIcon === 'function') {
    try {
      app.dock.setIcon(brandIconImage);
    } catch (err) {
      console.warn('[fire-tools] dock.setIcon failed:', err && err.message ? err.message : err);
    }
  }

  // Populate the macOS "About <app>" panel with real metadata.
  if (isMac) {
    app.setAboutPanelOptions({
      applicationName: 'Fire Tools',
      applicationVersion: app.getVersion(),
      version: `${process.versions.electron} (Electron)`,
      copyright: 'Privacy-first FIRE planning, all on your device.',
      website: DOCS_URL,
    });
  }

  // Honor system dark/light preference for native chrome.
  nativeTheme.themeSource = 'dark';

  await startEmbedded();
  installMenu();
  createWindow();

  // Wire auto-updater after the window exists so it can broadcast events.
  updater
    .setupUpdater({
      getWindow: () => mainWindow,
      notify: (opts) => showNativeNotification(opts),
    })
    .catch((err) => {
      console.error('[fire-tools] failed to initialize auto-updater:', err);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else focusMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('before-quit', async (event) => {
  if (!embeddedServer) return;
  const server = embeddedServer;
  embeddedServer = null;
  event.preventDefault();
  try {
    await server.close();
  } catch (err) {
    console.error('[fire-tools] error closing embedded backend:', err);
  }
  app.quit();
});

// Hardening: block creation of unauthorized webContents and navigation outside the app.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const allowedDevOrigin = process.env.ELECTRON_RENDERER_URL;
    const isDevOrigin = allowedDevOrigin && navigationUrl.startsWith(allowedDevOrigin);
    const isFileOrigin = navigationUrl.startsWith('file://');
    if (!isDevOrigin && !isFileOrigin) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});

// Suppress unused-binding warnings (REPO_URL re-exported via menu.cjs for renderer).
void REPO_URL;
