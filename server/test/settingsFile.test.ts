import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/migrate.js';
import {
  SETTINGS_FILE_NAME,
  SETTINGS_SCHEMA_VERSION,
  getSettingsFilePath,
  readSettingsFile,
  writeSettingsFileAtomic,
  migrateLegacySettingsFile,
  projectFromDb,
  syncSettingsToFile,
  createSettingsFileStore,
  type SettingsFileShape,
} from '../src/settingsFile.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-settings-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const sampleShape = (): SettingsFileShape => ({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  generatedAt: new Date().toISOString(),
  users: {
    '1': {
      settings: { accountName: 'Test', privacyMode: false },
      notificationPreferences: { enableInAppNotifications: true },
    },
  },
});

describe('getSettingsFilePath', () => {
  it('returns settings.json sibling of the DB file', () => {
    const dbPath = path.join(tmpDir, 'firetools.db');
    expect(getSettingsFilePath(dbPath)).toBe(path.join(tmpDir, SETTINGS_FILE_NAME));
  });

  it('resolves relative paths', () => {
    const result = getSettingsFilePath('./data/firetools.db');
    expect(result.endsWith(path.join('data', SETTINGS_FILE_NAME))).toBe(true);
    expect(path.isAbsolute(result)).toBe(true);
  });
});

describe('writeSettingsFileAtomic + readSettingsFile', () => {
  it('writes JSON that round-trips through read', () => {
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    const data = sampleShape();
    expect(writeSettingsFileAtomic(target, data)).toBe(true);
    const round = readSettingsFile(target);
    expect(round).not.toBeNull();
    expect(round?.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(round?.users['1'].settings.accountName).toBe('Test');
  });

  it('does not leave the tmp file behind on success', () => {
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    writeSettingsFileAtomic(target, sampleShape());
    const leftovers = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith(`${SETTINGS_FILE_NAME}.tmp`));
    expect(leftovers).toEqual([]);
  });

  it('overwrites an existing file', () => {
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    writeSettingsFileAtomic(target, sampleShape());
    const v2 = sampleShape();
    v2.users['1'].settings.accountName = 'Updated';
    writeSettingsFileAtomic(target, v2);
    expect(readSettingsFile(target)?.users['1'].settings.accountName).toBe('Updated');
  });

  it('returns null when reading a missing file', () => {
    expect(readSettingsFile(path.join(tmpDir, 'nope.json'))).toBeNull();
  });

  it('quarantines malformed JSON and returns null', () => {
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    fs.writeFileSync(target, '{ this is not valid json');
    expect(readSettingsFile(target)).toBeNull();
    expect(fs.existsSync(target)).toBe(false);
    const quarantined = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith(`${SETTINGS_FILE_NAME}.corrupt-`));
    expect(quarantined.length).toBe(1);
  });

  it('quarantines JSON with the wrong shape', () => {
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    fs.writeFileSync(target, JSON.stringify({ wrong: 'shape' }));
    expect(readSettingsFile(target)).toBeNull();
    const quarantined = fs
      .readdirSync(tmpDir)
      .filter((f) => f.startsWith(`${SETTINGS_FILE_NAME}.corrupt-`));
    expect(quarantined.length).toBe(1);
  });

  it('writes with restrictive permissions (POSIX only)', () => {
    if (process.platform === 'win32') return;
    const target = path.join(tmpDir, SETTINGS_FILE_NAME);
    writeSettingsFileAtomic(target, sampleShape());
    const mode = fs.statSync(target).mode & 0o777;
    // 0o600 requested; umask may relax further but never grant world access.
    expect(mode & 0o077).toBe(0);
  });
});

describe('migrateLegacySettingsFile', () => {
  it('renames a legacy file to settings.json', () => {
    const dbPath = path.join(tmpDir, 'firetools.db');
    const legacy = path.join(tmpDir, 'firetools-settings.json');
    fs.writeFileSync(legacy, '{}');
    const migrated = migrateLegacySettingsFile(dbPath);
    expect(migrated).toBe(legacy);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, SETTINGS_FILE_NAME))).toBe(true);
  });

  it('does nothing when the canonical file already exists', () => {
    const dbPath = path.join(tmpDir, 'firetools.db');
    fs.writeFileSync(path.join(tmpDir, SETTINGS_FILE_NAME), '{}');
    fs.writeFileSync(path.join(tmpDir, 'firetools-settings.json'), '{}');
    expect(migrateLegacySettingsFile(dbPath)).toBeNull();
    expect(fs.existsSync(path.join(tmpDir, 'firetools-settings.json'))).toBe(true);
  });

  it('returns null when no legacy file exists', () => {
    expect(migrateLegacySettingsFile(path.join(tmpDir, 'firetools.db'))).toBeNull();
  });
});

describe('projectFromDb + syncSettingsToFile', () => {
  it('mirrors current DB state into the JSON file', () => {
    const dbPath = path.join(tmpDir, 'firetools.db');
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    runMigrations(db, 'migrations');

    db.prepare('INSERT INTO user_settings (user_id, account_name) VALUES (1, ?)').run(
      'From DB',
    );

    const shape = projectFromDb(db);
    expect(shape.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
    expect(shape.users['1'].settings.accountName).toBe('From DB');

    const filePath = getSettingsFilePath(dbPath);
    expect(syncSettingsToFile(db, filePath)).toBe(true);
    expect(readSettingsFile(filePath)?.users['1'].settings.accountName).toBe('From DB');
    db.close();
  });
});

describe('createSettingsFileStore', () => {
  it('binds path and exposes read / syncFromDb', () => {
    const dbPath = path.join(tmpDir, 'firetools.db');
    const store = createSettingsFileStore(dbPath);
    expect(store.path).toBe(path.join(tmpDir, SETTINGS_FILE_NAME));
    expect(store.read()).toBeNull();
  });
});
