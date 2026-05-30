// Electron main process. Plain CommonJS so it loads cleanly even though
// the root package.json declares "type": "module" for Vite.
const { app, BrowserWindow, shell, ipcMain, nativeTheme, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const windowState = require('./windowState.cjs');
const { installMenu, DOCS_URL, REPO_URL } = require('./menu.cjs');

const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
const isMac = process.platform === 'darwin';

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
    });
    console.log(
      `[fire-tools] embedded backend started at ${embeddedServer.url} (db: ${embeddedServer.dbPath})`
    );
  } catch (err) {
    embeddedServerError = err && err.message ? err.message : String(err);
    console.error('[fire-tools] failed to start embedded backend:', err);
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

// Show a native OS notification (macOS NotificationCenter / Windows Action
// Center / Linux libnotify). Title is required; everything else is opt-in.
ipcMain.handle('fire-tools:show-native-notification', (_event, opts) => {
  try {
    if (!Notification.isSupported()) return false;
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
    });
    notification.on('click', () => {
      focusMainWindow();
    });
    notification.show();
    return true;
  } catch (err) {
    console.error('[fire-tools] failed to show native notification:', err);
    return false;
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
