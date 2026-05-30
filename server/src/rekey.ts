import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { applyPassphrase, escapePassphrase, WrongPassphraseError } from './db.js';

export type RekeyAction = 'set' | 'rotate' | 'remove';

export class RekeyError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'RekeyError';
  }
}

export interface RekeyOptions {
  db: DB;
  dbPath: string;
  /** True when the open handle is currently using a passphrase. */
  currentlyEncrypted: boolean;
  action: RekeyAction;
  currentPassphrase?: string;
  newPassphrase?: string;
}

export interface RekeyResult {
  action: RekeyAction;
  encrypted: boolean;
  /** Absolute path to the unencrypted backup written before the first `set`. */
  backupPath: string | null;
}

const isoStamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

/**
 * Verifies the supplied currentPassphrase by opening a short-lived second
 * handle to the same DB file. SQLCipher rejects the wrong key on first decrypt,
 * which `applyPassphrase` surfaces as `WrongPassphraseError`.
 *
 * Opening a second connection avoids touching the live handle's state (which
 * is already keyed from server boot) and gives a true verification.
 */
const verifyCurrentPassphrase = (
  dbPath: string,
  currentlyEncrypted: boolean,
  supplied: string | undefined,
): void => {
  if (!currentlyEncrypted) return;
  if (!supplied) {
    throw new RekeyError(400, 'missing_current_passphrase', 'currentPassphrase is required when the database is encrypted.');
  }
  let probe: DB | null = null;
  try {
    probe = new Database(dbPath);
    applyPassphrase(probe, supplied);
  } catch (err) {
    if (err instanceof WrongPassphraseError) {
      throw new RekeyError(401, 'wrong_passphrase', 'currentPassphrase does not match the database key.');
    }
    throw err;
  } finally {
    try {
      probe?.close();
    } catch {
      // best-effort cleanup
    }
  }
};

/**
 * Issues `PRAGMA rekey`. Works in-process on the open handle and does not
 * require a restart. SQLCipher rewrites every page atomically.
 *
 * wxSQLite3 forbids rekey while the journal is in WAL mode, so we temporarily
 * switch to DELETE for the operation and restore WAL afterwards.
 *
 * Passes the empty string to remove encryption entirely.
 */
const issueRekey = (db: DB, newKey: string): void => {
  const prevJournal = (db.pragma('journal_mode', { simple: true }) as string) ?? 'wal';
  if (prevJournal.toLowerCase() === 'wal') {
    db.pragma('journal_mode = DELETE');
  }
  try {
    if (newKey === '') {
      db.pragma(`rekey = ''`);
    } else {
      db.pragma(`rekey = '${escapePassphrase(newKey)}'`);
    }
  } finally {
    if (prevJournal.toLowerCase() === 'wal') {
      // Restore WAL — only valid on an unencrypted DB OR an encrypted DB
      // that has been (re)keyed in this same handle.
      db.pragma('journal_mode = WAL');
    }
  }
};

/**
 * Performs the requested rekey action with the following invariants:
 *  - `set` is only valid on an unencrypted DB; takes a snapshot backup first.
 *  - `rotate` is only valid on an encrypted DB; requires currentPassphrase + newPassphrase.
 *  - `remove` is only valid on an encrypted DB; requires currentPassphrase.
 *
 * Throws `RekeyError` for caller-facing problems and `WrongPassphraseError` for
 * key mismatches (callers usually want to map both to HTTP responses).
 */
export const rekeyDatabase = async (opts: RekeyOptions): Promise<RekeyResult> => {
  const { db, dbPath, currentlyEncrypted, action, currentPassphrase, newPassphrase } = opts;

  if (action === 'set') {
    if (currentlyEncrypted) {
      throw new RekeyError(409, 'already_encrypted', 'Database is already encrypted; use action=rotate to change the passphrase.');
    }
    if (!newPassphrase) {
      throw new RekeyError(400, 'missing_new_passphrase', 'newPassphrase is required for action=set.');
    }
  } else if (action === 'rotate') {
    if (!currentlyEncrypted) {
      throw new RekeyError(409, 'not_encrypted', 'Database is not encrypted; use action=set to enable encryption.');
    }
    if (!newPassphrase) {
      throw new RekeyError(400, 'missing_new_passphrase', 'newPassphrase is required for action=rotate.');
    }
  } else if (action === 'remove') {
    if (!currentlyEncrypted) {
      throw new RekeyError(409, 'not_encrypted', 'Database is not encrypted; nothing to remove.');
    }
  } else {
    throw new RekeyError(400, 'invalid_action', `Unknown rekey action "${action as string}".`);
  }

  verifyCurrentPassphrase(dbPath, currentlyEncrypted, currentPassphrase);

  let backupPath: string | null = null;
  if (action === 'set' && existsSync(dbPath)) {
    backupPath = `${dbPath}.bak-pre-encryption-${isoStamp()}`;
    await db.backup(backupPath);
  }

  if (action === 'remove') {
    issueRekey(db, '');
    return { action, encrypted: false, backupPath };
  }

  // set or rotate
  issueRekey(db, newPassphrase as string);
  return { action, encrypted: true, backupPath };
};
