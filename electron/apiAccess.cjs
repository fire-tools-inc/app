// Local API access: an opt-in, stable way for other apps, scripts and AI
// agents on this computer to call the desktop app's API. Off by default
// because the client token unlocks the decrypted database while the app runs.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PREFS_FILE = 'api-access.json';
const DISCOVERY_FILE = 'local-api.json';
const DISCOVERY_SCHEMA_VERSION = 1;
const DEFAULT_PORT = 47820;
const GUIDE_URL = 'https://fire-tools-inc.github.io/app/docs/user/api-access.html';
const OPENAPI_URL = 'https://fire-tools-inc.github.io/app/api/openapi.yaml';

function prefsPath(userDataDir) {
  return path.join(userDataDir, PREFS_FILE);
}

function discoveryPath(userDataDir) {
  return path.join(userDataDir, DISCOVERY_FILE);
}

function isValidPort(port) {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}

/**
 * Reads the saved preference. `cipher` is `{ isAvailable(), decrypt(base64) }`
 * (Electron safeStorage in production). A missing file means disabled; any
 * other problem is returned as `error` and also means disabled.
 */
function readPrefs(userDataDir, cipher) {
  const defaults = { enabled: false, port: DEFAULT_PORT, token: null, error: null };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(prefsPath(userDataDir), 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return defaults;
    return { ...defaults, error: errorMessage(err) };
  }
  if (parsed === null || typeof parsed !== 'object') return { ...defaults, error: 'The API access preference is not an object.' };
  const port = isValidPort(parsed.port) ? parsed.port : DEFAULT_PORT;
  let token = null;
  let error = null;
  if (parsed.token && typeof parsed.token.value === 'string') {
    try {
      if (parsed.token.storage === 'safeStorage') {
        token = cipher && cipher.isAvailable() ? cipher.decrypt(parsed.token.value) : null;
        if (!token) error = 'The saved API token could not be decrypted; a new one will be issued.';
      } else if (parsed.token.storage === 'plain') {
        token = parsed.token.value;
      }
    } catch (err) {
      error = `The saved API token could not be decrypted (${errorMessage(err)}); a new one will be issued.`;
    }
  }
  return { enabled: parsed.enabled === true, port, token, error };
}

function writeFileAtomic(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, { mode: 0o600 });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.chmodSync(file, 0o600);
}

/** Saves the preference; the token is encrypted with `cipher` when available. */
function writePrefs(userDataDir, { enabled, port, token }, cipher) {
  let storedToken = null;
  if (token) {
    storedToken = cipher && cipher.isAvailable()
      ? { storage: 'safeStorage', value: cipher.encrypt(token) }
      : { storage: 'plain', value: token };
  }
  const payload = { enabled: enabled === true, port: isValidPort(port) ? port : DEFAULT_PORT, token: storedToken };
  writeFileAtomic(prefsPath(userDataDir), `${JSON.stringify(payload, null, 2)}\n`);
}

function writeDiscovery(userDataDir, { apiBaseUrl, token, appVersion, pid, startedAt, stablePort }) {
  const payload = {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    app: 'Fire Tools',
    appVersion,
    apiBaseUrl,
    token,
    stablePort,
    pid,
    startedAt,
    guideUrl: GUIDE_URL,
    openapiUrl: OPENAPI_URL,
  };
  writeFileAtomic(discoveryPath(userDataDir), `${JSON.stringify(payload, null, 2)}\n`);
}

function removeDiscovery(userDataDir) {
  fs.rmSync(discoveryPath(userDataDir), { force: true });
}

module.exports = {
  DEFAULT_PORT,
  DISCOVERY_FILE,
  discoveryPath,
  isValidPort,
  newToken,
  readPrefs,
  writePrefs,
  writeDiscovery,
  removeDiscovery,
};
