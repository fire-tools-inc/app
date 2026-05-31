// File-based log sink for the Electron main process.
//
// Writes one line per entry to `<userData>/firetools.log`. When the file
// exceeds `maxBytes`, it is rotated once to `firetools.log.1` (overwriting
// any prior backup) and a fresh file is started. This keeps total disk
// usage bounded at ~2× `maxBytes` while still preserving a useful history
// for bug reports.
//
// All writes are synchronous so we never lose entries to a crash, but the
// volume is low enough (UI/system events) that this is not a hot path.

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const MIN_MAX_BYTES = 1 * 1024 * 1024; // 1MB hard floor
const MAX_MAX_BYTES = 500 * 1024 * 1024; // 500MB hard ceiling

let logDir = null;
let logPath = null;
let backupPath = null;
let maxBytes = DEFAULT_MAX_BYTES;
let initialized = false;
let writeFailureLogged = false;

function clampBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_MAX_BYTES;
  const v = Math.floor(n);
  if (v < MIN_MAX_BYTES) return MIN_MAX_BYTES;
  if (v > MAX_MAX_BYTES) return MAX_MAX_BYTES;
  return v;
}

function init(opts) {
  if (!opts || typeof opts.dir !== 'string') {
    throw new Error('logFile.init requires { dir }');
  }
  logDir = opts.dir;
  logPath = path.join(logDir, 'firetools.log');
  backupPath = `${logPath}.1`;
  if (typeof opts.maxBytes === 'number') {
    maxBytes = clampBytes(opts.maxBytes);
  }
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    /* userData almost always already exists; ignore */
  }
  initialized = true;
}

function setMaxBytes(n) {
  maxBytes = clampBytes(n);
}

function getMaxBytes() {
  return maxBytes;
}

function getPath() {
  return logPath;
}

function getInfo() {
  let size = 0;
  let backupSize = 0;
  try {
    if (logPath && fs.existsSync(logPath)) size = fs.statSync(logPath).size;
  } catch { /* ignore */ }
  try {
    if (backupPath && fs.existsSync(backupPath)) backupSize = fs.statSync(backupPath).size;
  } catch { /* ignore */ }
  return {
    path: logPath,
    backupPath,
    size,
    backupSize,
    maxBytes,
    initialized,
  };
}

function rotateIfNeeded() {
  if (!logPath || !backupPath) return;
  try {
    const st = fs.statSync(logPath);
    if (st.size <= maxBytes) return;
    // Overwrite any prior backup, then truncate the live file.
    try { fs.rmSync(backupPath, { force: true }); } catch { /* ignore */ }
    try { fs.renameSync(logPath, backupPath); } catch { /* ignore */ }
  } catch {
    /* file may not exist yet */
  }
}

function append(line) {
  if (!initialized || !logPath) return;
  if (typeof line !== 'string' || line.length === 0) return;
  const payload = line.endsWith('\n') ? line : `${line}\n`;
  try {
    rotateIfNeeded();
    fs.appendFileSync(logPath, payload, { encoding: 'utf8' });
  } catch (err) {
    if (!writeFailureLogged) {
      writeFailureLogged = true;
      try {
        process.stderr.write(
          `[fire-tools] log file write failed: ${err && err.message ? err.message : String(err)}\n`,
        );
      } catch { /* nothing else we can do */ }
    }
  }
}

module.exports = {
  init,
  append,
  setMaxBytes,
  getMaxBytes,
  getPath,
  getInfo,
  DEFAULT_MAX_BYTES,
  MIN_MAX_BYTES,
  MAX_MAX_BYTES,
};
