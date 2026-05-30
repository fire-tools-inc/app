// Persist + restore main window bounds and maximized state across launches.
// Stored at app.getPath('userData')/window-state.json so it lives alongside
// the SQLite DB and survives Electron upgrades.

const { app, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const STATE_FILE = 'window-state.json';
const DEFAULT_STATE = Object.freeze({
  width: 1400,
  height: 900,
  x: undefined,
  y: undefined,
  isMaximized: false,
});

function getStateFile() {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function isWithinAnyDisplay(state) {
  if (typeof state.x !== 'number' || typeof state.y !== 'number') return false;
  return screen.getAllDisplays().some((d) => {
    const b = d.bounds;
    return (
      state.x + Math.min(state.width, 200) > b.x &&
      state.x + state.width - 200 < b.x + b.width &&
      state.y + 80 > b.y &&
      state.y + 40 < b.y + b.height
    );
  });
}

function validate(state) {
  const merged = { ...DEFAULT_STATE, ...(state || {}) };
  if (typeof merged.width !== 'number' || merged.width < 960) merged.width = DEFAULT_STATE.width;
  if (typeof merged.height !== 'number' || merged.height < 600) merged.height = DEFAULT_STATE.height;
  if (!isWithinAnyDisplay(merged)) {
    merged.x = undefined;
    merged.y = undefined;
  }
  return merged;
}

function loadState() {
  try {
    const raw = fs.readFileSync(getStateFile(), 'utf8');
    return validate(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function attach(win) {
  let lastNormalBounds = null;
  let saveTimer = null;

  const writeState = () => {
    if (win.isDestroyed()) return;
    const isMaximized = win.isMaximized() || win.isFullScreen();
    if (!isMaximized && !win.isMinimized()) {
      lastNormalBounds = win.getBounds();
    }
    const bounds = lastNormalBounds || win.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    try {
      fs.mkdirSync(path.dirname(getStateFile()), { recursive: true });
      fs.writeFileSync(getStateFile(), JSON.stringify(state, null, 2));
    } catch (err) {
      console.error('[fire-tools] failed to save window state:', err);
    }
  };

  const debouncedSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeState, 500);
  };

  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('maximize', writeState);
  win.on('unmaximize', writeState);
  win.on('enter-full-screen', writeState);
  win.on('leave-full-screen', writeState);
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeState();
  });
}

module.exports = { loadState, attach };
