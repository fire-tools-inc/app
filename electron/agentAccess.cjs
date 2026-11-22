// Agent access: an opt-in discovery file that lets local AI agents find the
// embedded API and its per-launch bearer token. Off by default because the
// token unlocks the decrypted database through the API while the app runs.

const fs = require('node:fs');
const path = require('node:path');

const PREFS_FILE = 'agent-access.json';
const DISCOVERY_FILE = 'agent-api.json';
const DISCOVERY_SCHEMA_VERSION = 1;
const GUIDE_URL = 'https://fire-tools-inc.github.io/app/docs/engineering/agent-api.html';
const OPENAPI_URL = 'https://fire-tools-inc.github.io/app/api/openapi.yaml';

function prefsPath(userDataDir) {
  return path.join(userDataDir, PREFS_FILE);
}

function discoveryPath(userDataDir) {
  return path.join(userDataDir, DISCOVERY_FILE);
}

// A missing or unreadable preference means disabled; `error` explains why.
function readPrefs(userDataDir) {
  try {
    const raw = fs.readFileSync(prefsPath(userDataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return { enabled: parsed !== null && typeof parsed === 'object' && parsed.enabled === true, error: null };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { enabled: false, error: null };
    return { enabled: false, error: err && err.message ? err.message : String(err) };
  }
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

function writePrefs(userDataDir, prefs) {
  writeFileAtomic(prefsPath(userDataDir), `${JSON.stringify({ enabled: prefs.enabled === true }, null, 2)}\n`);
}

function writeDiscovery(userDataDir, { apiBaseUrl, token, appVersion, pid, startedAt }) {
  const payload = {
    schemaVersion: DISCOVERY_SCHEMA_VERSION,
    app: 'Fire Tools',
    appVersion,
    apiBaseUrl,
    token,
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
  DISCOVERY_FILE,
  discoveryPath,
  readPrefs,
  writePrefs,
  writeDiscovery,
  removeDiscovery,
};
