// Preload runs in an isolated world with access to a limited Node surface.
// Keep this file minimal — every API exposed here is reachable from the
// renderer and must be considered an attack surface.
const { contextBridge, ipcRenderer } = require('electron');

// Whitelist the channels the renderer is allowed to subscribe to.
const ALLOWED_MAIN_TO_RENDERER = new Set([
  'fire-tools:navigate',
  'fire-tools:menu-action',
  'fire-tools:updater-event',
]);

function subscribe(channel, callback) {
  if (!ALLOWED_MAIN_TO_RENDERER.has(channel)) return () => {};
  const listener = (_event, ...args) => {
    try {
      callback(...args);
    } catch (err) {
      console.error(`[fire-tools] renderer listener failed for ${channel}:`, err);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('fireTools', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getEmbeddedBackend: () => ipcRenderer.invoke('fire-tools:embedded-backend-info'),
  openExternal: (url) => ipcRenderer.invoke('fire-tools:open-external', url),
  showNativeNotification: (opts) =>
    ipcRenderer.invoke('fire-tools:show-native-notification', opts),
  onNavigate: (callback) => subscribe('fire-tools:navigate', callback),
  onMenuAction: (callback) => subscribe('fire-tools:menu-action', callback),
  onUpdaterEvent: (callback) => subscribe('fire-tools:updater-event', callback),
  updater: {
    check: () => ipcRenderer.invoke('fire-tools:updater-check'),
    download: () => ipcRenderer.invoke('fire-tools:updater-download'),
    install: () => ipcRenderer.invoke('fire-tools:updater-install'),
    getState: () => ipcRenderer.invoke('fire-tools:updater-state'),
    getPrefs: () => ipcRenderer.invoke('fire-tools:updater-get-prefs'),
    setPrefs: (prefs) => ipcRenderer.invoke('fire-tools:updater-set-prefs', prefs),
  },
  backups: {
    list: () => ipcRenderer.invoke('fire-tools:backups-list'),
    create: (opts) => ipcRenderer.invoke('fire-tools:backups-create', opts),
    restore: (opts) => ipcRenderer.invoke('fire-tools:backups-restore', opts),
  },
});
