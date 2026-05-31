// Backup / restore / rotate helpers for the Fire Tools desktop app.
//
// Used by the auto-updater (electron/updater.cjs) to snapshot the SQLite DB
// and a small set of user-state files before installing a new version. The
// invariant is that we always keep at least one backup alive after rotation
// so the user can always roll back.
//
// Layout on disk (under <userData>/backups/):
//   2024-12-31T12-34-56-000Z-1.2.3/
//     manifest.json          { timestamp, version, files: [{ name, bytes, sha256 }] }
//     firetools.db
//     firetools.db-wal       (only if present)
//     firetools.db-shm       (only if present)
//     window-state.json      (only if present)
//     auto-update.json       (only if present)
//
// All writes are atomic: we stage into a sibling .tmp-<id> directory and rename
// into place on success. A partial backup never overwrites an existing one.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const BACKUP_DIRNAME = 'backups';
const MANIFEST_NAME = 'manifest.json';

// Candidate files (relative to userData) that we snapshot. Missing files are
// simply skipped — the SQLite WAL/SHM sidecars only exist while the DB is open
// in WAL mode, and the renderer-side state files may not exist on first run.
const SNAPSHOT_CANDIDATES = [
  'firetools.db',
  'firetools.db-wal',
  'firetools.db-shm',
  'window-state.json',
  'auto-update.json',
];

const MIN_KEEP = 1;
const DEFAULT_KEEP = 3;

function isoStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function backupsRoot(userDataDir) {
  return path.join(userDataDir, BACKUP_DIRNAME);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileExists(p) {
  try {
    const st = await fsp.stat(p);
    return st.isFile();
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
}

async function hashFile(p) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(p);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function copyFileAtomic(src, dst) {
  // Copy to .partial then rename. Ensures a reader never sees a half-written file.
  const partial = `${dst}.partial`;
  await fsp.copyFile(src, partial);
  await fsp.rename(partial, dst);
}

/**
 * Create a backup directory containing snapshots of all known state files.
 *
 * @param {Object} opts
 * @param {string} opts.userDataDir  Electron app.getPath('userData')
 * @param {string} opts.version      Current app version (used in folder name + manifest)
 * @param {string[]} [opts.extraFiles] Extra absolute paths to include (deduped)
 * @returns {Promise<{ id: string, dir: string, files: Array<{name:string,bytes:number,sha256:string}>, timestamp: string, version: string }>}
 */
async function createBackup({ userDataDir, version, extraFiles = [] }) {
  if (!userDataDir || typeof userDataDir !== 'string') {
    throw new Error('createBackup: userDataDir is required');
  }
  if (!version || typeof version !== 'string') {
    throw new Error('createBackup: version is required');
  }

  const root = backupsRoot(userDataDir);
  await ensureDir(root);

  const timestamp = new Date().toISOString();
  const id = `${isoStamp(new Date(timestamp))}-${version}`;
  const finalDir = path.join(root, id);
  const stagingDir = path.join(root, `.tmp-${id}-${process.pid}`);

  // Clean stale staging from a previous crash.
  try {
    await fsp.rm(stagingDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
  await ensureDir(stagingDir);

  const sourcePaths = new Map();
  for (const name of SNAPSHOT_CANDIDATES) {
    sourcePaths.set(name, path.join(userDataDir, name));
  }
  for (const abs of extraFiles) {
    if (typeof abs !== 'string' || abs.length === 0) continue;
    sourcePaths.set(path.basename(abs), abs);
  }

  const recorded = [];
  try {
    for (const [name, src] of sourcePaths.entries()) {
      if (!(await fileExists(src))) continue;
      const dst = path.join(stagingDir, name);
      await copyFileAtomic(src, dst);
      const stat = await fsp.stat(dst);
      const sha256 = await hashFile(dst);
      recorded.push({ name, bytes: stat.size, sha256 });
    }

    if (recorded.length === 0) {
      // Nothing to back up — caller probably ran before the embedded backend
      // wrote its first DB file. Don't leave an empty directory hanging around.
      await fsp.rm(stagingDir, { recursive: true, force: true });
      throw new Error('createBackup: no source files found to back up');
    }

    const manifest = {
      schemaVersion: 1,
      id,
      timestamp,
      version,
      files: recorded,
    };
    await fsp.writeFile(
      path.join(stagingDir, MANIFEST_NAME),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );

    // Atomic flip into the final name. If the target somehow already exists
    // (clock collision), append a short suffix so we never overwrite history.
    let target = finalDir;
    let suffix = 0;
    while (true) {
      try {
        await fsp.rename(stagingDir, target);
        break;
      } catch (err) {
        if (err && err.code === 'ENOTEMPTY') {
          suffix += 1;
          target = `${finalDir}-${suffix}`;
          continue;
        }
        throw err;
      }
    }

    return {
      id: path.basename(target),
      dir: target,
      files: recorded,
      timestamp,
      version,
    };
  } catch (err) {
    // Best-effort cleanup on failure so we never leave junk in backups/.
    try {
      await fsp.rm(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * List existing backups, newest first.
 *
 * @param {Object} opts
 * @param {string} opts.userDataDir
 * @returns {Promise<Array<{ id: string, dir: string, timestamp: string, version: string, files: Array<{name:string,bytes:number,sha256:string}>, totalBytes: number, valid: boolean, error?: string }>>}
 */
async function listBackups({ userDataDir }) {
  const root = backupsRoot(userDataDir);
  let entries;
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.tmp-')) continue;
    const dir = path.join(root, entry.name);
    const manifestPath = path.join(dir, MANIFEST_NAME);
    let manifest = null;
    let error;
    try {
      const raw = await fsp.readFile(manifestPath, 'utf8');
      manifest = JSON.parse(raw);
    } catch (err) {
      error = err && err.message ? err.message : String(err);
    }

    if (manifest && Array.isArray(manifest.files)) {
      const totalBytes = manifest.files.reduce(
        (acc, f) => acc + (typeof f.bytes === 'number' ? f.bytes : 0),
        0
      );
      results.push({
        id: entry.name,
        dir,
        timestamp: manifest.timestamp || '',
        version: manifest.version || '',
        files: manifest.files,
        totalBytes,
        valid: true,
      });
    } else {
      results.push({
        id: entry.name,
        dir,
        timestamp: '',
        version: '',
        files: [],
        totalBytes: 0,
        valid: false,
        error,
      });
    }
  }

  // Sort newest first by timestamp when available, falling back to id.
  results.sort((a, b) => {
    if (a.timestamp && b.timestamp) return b.timestamp.localeCompare(a.timestamp);
    return b.id.localeCompare(a.id);
  });
  return results;
}

/**
 * Rotate backups so that at most `keep` valid backups remain.
 * Always preserves at least MIN_KEEP backups regardless of `keep`.
 *
 * @param {Object} opts
 * @param {string} opts.userDataDir
 * @param {number} [opts.keep] desired retention (clamped to [MIN_KEEP, 100])
 * @returns {Promise<{ removed: string[], kept: string[] }>}
 */
async function rotateBackups({ userDataDir, keep = DEFAULT_KEEP }) {
  let target = Math.floor(Number(keep));
  if (!Number.isFinite(target)) target = DEFAULT_KEEP;
  if (target < MIN_KEEP) target = MIN_KEEP;
  if (target > 100) target = 100;

  const all = await listBackups({ userDataDir });
  if (all.length <= target) {
    return { removed: [], kept: all.map((b) => b.id) };
  }

  // Newest first; keep the first `target`, drop the rest.
  const keptList = all.slice(0, target);
  const dropList = all.slice(target);
  const removed = [];
  for (const b of dropList) {
    try {
      await fsp.rm(b.dir, { recursive: true, force: true });
      removed.push(b.id);
    } catch (err) {
      console.error(`[fire-tools] failed to remove backup ${b.id}:`, err);
    }
  }
  return { removed, kept: keptList.map((b) => b.id) };
}

/**
 * Restore the given backup over the live userData files.
 *
 * Strategy: first re-snapshot the *current* state into a safety backup
 * (so a botched restore is itself reversible), then copy each manifest file
 * back into userData atomically. Caller is responsible for ensuring the app
 * is in a state where the SQLite DB is not actively being written (typically
 * by closing the embedded server first or by restarting the app immediately
 * after this call).
 *
 * @param {Object} opts
 * @param {string} opts.userDataDir
 * @param {string} opts.backupId
 * @param {string} opts.currentVersion
 * @returns {Promise<{ restored: string[], safetyBackupId: string }>}
 */
async function restoreBackup({ userDataDir, backupId, currentVersion }) {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('restoreBackup: backupId is required');
  }
  const list = await listBackups({ userDataDir });
  const target = list.find((b) => b.id === backupId);
  if (!target) throw new Error(`restoreBackup: unknown backup ${backupId}`);
  if (!target.valid) throw new Error(`restoreBackup: backup ${backupId} is corrupt (${target.error || 'unknown'})`);

  // Safety net before destructive copy.
  let safety;
  try {
    safety = await createBackup({
      userDataDir,
      version: `${currentVersion || 'unknown'}-prerestore`,
    });
  } catch (err) {
    // If there's nothing to back up, that's fine — first-run scenario.
    if (!String(err && err.message).includes('no source files')) throw err;
  }

  const restored = [];
  for (const file of target.files) {
    const src = path.join(target.dir, file.name);
    if (!(await fileExists(src))) continue;
    const dst = path.join(userDataDir, file.name);
    await copyFileAtomic(src, dst);
    restored.push(file.name);
  }

  return {
    restored,
    safetyBackupId: safety ? safety.id : '',
  };
}

module.exports = {
  createBackup,
  listBackups,
  rotateBackups,
  restoreBackup,
  // exported for tests
  _internals: {
    SNAPSHOT_CANDIDATES,
    MIN_KEEP,
    DEFAULT_KEEP,
    backupsRoot,
  },
};
