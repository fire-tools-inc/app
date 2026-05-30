import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { applyPassphrase, escapePassphrase, initDb, WrongPassphraseError } from '../src/db.js';
import { rekeyDatabase, RekeyError } from '../src/rekey.js';
import type { ServerEnv } from '../src/env.js';

const MIGRATIONS = join(__dirname, '..', 'migrations');

const buildEnv = (dbPath: string, passphrase?: string): ServerEnv => ({
  port: 0,
  host: '127.0.0.1',
  databaseUrl: `file:${dbPath}`,
  schemaPath: '../docs/database/schema.sql',
  migrationsPath: MIGRATIONS,
  corsOrigins: [],
  corsAllowAll: true,
  rateLimit: { windowMs: 60_000, max: 1000 },
  nodeEnv: 'test',
  passphrase,
});

describe('database encryption', () => {
  let tmp: string;
  let dbPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fire-tools-enc-'));
    dbPath = join(tmp, 'fire.db');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('escapes single quotes safely', () => {
    expect(escapePassphrase("o'reilly")).toBe("o''reilly");
    expect(escapePassphrase("a'b'c")).toBe("a''b''c");
    expect(escapePassphrase('plain')).toBe('plain');
  });

  it('opens an unencrypted DB and persists data without a passphrase', () => {
    const { db, dbPath: openedPath } = initDb(buildEnv(dbPath));
    expect(openedPath).toBe(dbPath);
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t(k,v) VALUES (?, ?)').run('hello', 'world');
    db.close();

    const reopened = new Database(dbPath);
    const row = reopened.prepare('SELECT v FROM t WHERE k = ?').get('hello') as { v: string };
    expect(row.v).toBe('world');
    reopened.close();
  });

  it('rekey roundtrip: unencrypted → encrypted → reopen with key → unencrypted', async () => {
    const passphrase = "p@ss-w/ord-'with'-quotes";
    const newPassphrase = 'rotated-key-456';

    // 1. Boot unencrypted and write some data.
    let { db } = initDb(buildEnv(dbPath));
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t(k,v) VALUES (?, ?)').run('hello', 'world');

    // 2. Encrypt in place.
    const r1 = await rekeyDatabase({
      db,
      dbPath,
      currentlyEncrypted: false,
      action: 'set',
      newPassphrase: passphrase,
    });
    expect(r1.encrypted).toBe(true);
    expect(r1.backupPath).toBeTruthy();
    expect(existsSync(r1.backupPath!)).toBe(true);
    db.close();

    // 3. Reopen WITHOUT key — should still appear as a file, but a SELECT must fail.
    const noKey = new Database(dbPath);
    expect(() => noKey.prepare('SELECT v FROM t').get()).toThrow();
    noKey.close();

    // 4. Reopen with correct key — verify data preserved.
    let env = buildEnv(dbPath, passphrase);
    ({ db } = initDb(env));
    const row = db.prepare('SELECT v FROM t WHERE k = ?').get('hello') as { v: string };
    expect(row.v).toBe('world');

    // 5. Rotate.
    const r2 = await rekeyDatabase({
      db,
      dbPath,
      currentlyEncrypted: true,
      action: 'rotate',
      currentPassphrase: passphrase,
      newPassphrase,
    });
    expect(r2.encrypted).toBe(true);
    expect(r2.backupPath).toBeNull();
    db.close();

    // 6. Old key now fails.
    env = buildEnv(dbPath, passphrase);
    expect(() => initDb(env)).toThrow(WrongPassphraseError);

    // 7. New key works.
    env = buildEnv(dbPath, newPassphrase);
    ({ db } = initDb(env));
    expect((db.prepare('SELECT v FROM t WHERE k = ?').get('hello') as { v: string }).v).toBe('world');

    // 8. Remove encryption.
    const r3 = await rekeyDatabase({
      db,
      dbPath,
      currentlyEncrypted: true,
      action: 'remove',
      currentPassphrase: newPassphrase,
    });
    expect(r3.encrypted).toBe(false);
    db.close();

    // 9. Plain reopen works.
    const plain = new Database(dbPath);
    expect((plain.prepare('SELECT v FROM t WHERE k = ?').get('hello') as { v: string }).v).toBe('world');
    plain.close();
  });

  it('rejects wrong currentPassphrase on rotate with friendly error', async () => {
    const passphrase = 'correct-horse';
    let { db } = initDb(buildEnv(dbPath));
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY)');
    await rekeyDatabase({ db, dbPath, currentlyEncrypted: false, action: 'set', newPassphrase: passphrase });
    db.close();

    ({ db } = initDb(buildEnv(dbPath, passphrase)));
    await expect(
      rekeyDatabase({
        db,
        dbPath,
        currentlyEncrypted: true,
        action: 'rotate',
        currentPassphrase: 'wrong-key',
        newPassphrase: 'doesnt-matter',
      }),
    ).rejects.toMatchObject({ status: 401, code: 'wrong_passphrase' });
    db.close();
  });

  it('refuses set on an already encrypted DB', async () => {
    let { db } = initDb(buildEnv(dbPath));
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY)');
    await rekeyDatabase({ db, dbPath, currentlyEncrypted: false, action: 'set', newPassphrase: 'first' });
    db.close();

    ({ db } = initDb(buildEnv(dbPath, 'first')));
    await expect(
      rekeyDatabase({
        db,
        dbPath,
        currentlyEncrypted: true,
        action: 'set',
        newPassphrase: 'second',
      }),
    ).rejects.toBeInstanceOf(RekeyError);
    db.close();
  });

  it('writes backup file before first set', async () => {
    const { db } = initDb(buildEnv(dbPath));
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO t(k) VALUES (?)').run('row');
    const result = await rekeyDatabase({ db, dbPath, currentlyEncrypted: false, action: 'set', newPassphrase: 'abc12345' });
    db.close();
    expect(result.backupPath).toMatch(/\.bak-pre-encryption-/);
    expect(existsSync(result.backupPath!)).toBe(true);

    // Backup must be readable without key.
    const backup = new Database(result.backupPath!);
    expect((backup.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n).toBe(1);
    backup.close();

    // Sanity: at least one backup file is in the directory.
    const files = readdirSync(tmp);
    expect(files.some((f) => f.includes('bak-pre-encryption'))).toBe(true);
  });

  it('applyPassphrase throws WrongPassphraseError on key mismatch', async () => {
    let { db } = initDb(buildEnv(dbPath));
    db.exec('CREATE TABLE t(k TEXT PRIMARY KEY)');
    await rekeyDatabase({ db, dbPath, currentlyEncrypted: false, action: 'set', newPassphrase: 'right' });
    db.close();

    const handle = new Database(dbPath);
    expect(() => applyPassphrase(handle, 'wrong')).toThrow(WrongPassphraseError);
    handle.close();
  });
});
