#!/usr/bin/env node
// Calls the Fire Tools local API for an agent without printing the access token.
// Usage:
//   node fire-tools-api.mjs status
//   node fire-tools-api.mjs new-id <kind>
//   node fire-tools-api.mjs <GET|POST|PUT|PATCH|DELETE> <path> [json | @file | -]
// Paths are relative to the API base, e.g. /state/expenseTracker.
// Exit codes: 0 success, 1 usage or connection problem, 2 the API returned an error.

import { readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ENABLE_HINT = 'Ask the user to open Fire Tools and turn on Settings > Agent access, '
  + 'or set FIRE_TOOLS_API_URL (and FIRE_TOOLS_API_TOKEN) for a self-hosted backend.';

function fail(message, code = 1) {
  process.stderr.write(`fire-tools-api: ${message}\n`);
  process.exit(code);
}

function discoveryFile() {
  if (process.env.FIRE_TOOLS_DISCOVERY_FILE) return process.env.FIRE_TOOLS_DISCOVERY_FILE;
  const home = homedir();
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Fire Tools', 'agent-api.json');
  if (platform() === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Fire Tools', 'agent-api.json');
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Fire Tools', 'agent-api.json');
}

// Re-read on every call: the desktop app mints a new token each launch.
function connection() {
  const envUrl = process.env.FIRE_TOOLS_API_URL?.trim();
  if (envUrl) {
    return { baseUrl: envUrl.replace(/\/+$/, ''), token: process.env.FIRE_TOOLS_API_TOKEN?.trim() || null };
  }
  const file = discoveryFile();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') fail(`Agent access is off (no ${file}). ${ENABLE_HINT}`);
    fail(`Could not read ${file}: ${err && err.message ? err.message : err}`);
  }
  if (!parsed || typeof parsed.apiBaseUrl !== 'string') fail(`${file} has no apiBaseUrl. ${ENABLE_HINT}`);
  return { baseUrl: parsed.apiBaseUrl.replace(/\/+$/, ''), token: typeof parsed.token === 'string' ? parsed.token : null };
}

function readBody(arg) {
  if (arg === undefined) return undefined;
  let raw = arg;
  if (arg === '-') raw = readFileSync(0, 'utf8');
  else if (arg.startsWith('@')) raw = readFileSync(arg.slice(1), 'utf8');
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch (err) {
    fail(`The request body is not valid JSON: ${err.message}`);
  }
}

async function call(method, path, body) {
  // Only relative API paths, so the token can never be sent to another host.
  if (!path.startsWith('/') || path.startsWith('//') || path.split(/[?#]/)[0].split('/').includes('..')) {
    fail(`Path must be relative to the API base and start with "/" (got "${path}").`);
  }
  const { baseUrl, token } = connection();
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  } catch (err) {
    fail(`Fire Tools is not reachable at ${baseUrl} (${err.cause?.code || err.message}). Is the app running? ${ENABLE_HINT}`);
  }
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies are printed as received.
  }
  return { status: response.status, ok: response.ok, payload };
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

function rejectToken() {
  fail(`The token was rejected. Fire Tools may have restarted with agent access turned off. ${ENABLE_HINT}`, 2);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    print('Usage: fire-tools-api.mjs status | new-id <kind> | <METHOD> <path> [json | @file | -]');
    return;
  }
  if (command === 'new-id') {
    const kind = (rest[0] || 'item').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    print(`agent-${kind}-${randomUUID()}`);
    return;
  }
  const isStatus = command === 'status';
  const method = isStatus ? 'GET' : command.toUpperCase();
  const path = isStatus ? '/sync/status' : rest[0];
  if (!METHODS.has(method)) fail(`Unknown command "${command}". Run with --help.`);
  if (!path) fail('Missing API path, e.g. /state/expenseTracker');
  const result = await call(method, path, isStatus ? undefined : readBody(rest[1]));
  if (result.status === 401) rejectToken();
  if (result.payload !== null) print(result.payload);
  if (!result.ok) {
    process.stderr.write(`fire-tools-api: HTTP ${result.status}\n`);
    process.exit(2);
  }
}

main().catch((err) => fail(err && err.stack ? err.stack : String(err)));
