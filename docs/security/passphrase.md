# Passphrase-based database encryption

Fire Tools supports optional passphrase-based encryption of the local SQLite
database file at rest. This is implemented with
[`better-sqlite3-multiple-ciphers`](https://github.com/m4heshd/better-sqlite3-multiple-ciphers),
a drop-in fork of `better-sqlite3` that embeds wxSQLite3 / SQLCipher-compatible
page-level AES encryption.

Encryption is **opt-in** and **only available in the desktop (Electron) app**,
because secure storage of the passphrase requires an OS keychain.

## What it protects

- The SQLite database file (`firetools.db`) and its WAL/SHM sidecars are
  unreadable without the passphrase. Anyone who copies the file from disk —
  through a backup, a stolen laptop, or a misconfigured sync folder — sees only
  encrypted pages.

## What it does **not** protect

- Data in memory while the app is running. Once the app is unlocked, the
  passphrase is in RAM for the lifetime of the embedded server process.
- Other Fire Tools data: cookie-stored settings in the browser build, exported
  CSV files, screenshots, system swap files, or anything outside the SQLite
  database itself.
- The passphrase being recovered by malware running under your user account.
  An OS keychain protects against offline file theft, not local code execution.

## How the passphrase is stored

The Electron app uses Chromium's
[`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage) API,
which delegates to the platform secure store:

| Platform | Backing store                        |
| -------- | ------------------------------------ |
| macOS    | Keychain                             |
| Windows  | DPAPI / Credential Vault             |
| Linux    | Secret Service (gnome-keyring/kwallet) |

The encrypted blob is written to:

```
<userData>/db-passphrase.enc
```

with file mode `0o600`. The passphrase itself is never written to disk in plain
text and is never logged.

On Linux without a running keyring daemon, `safeStorage.isEncryptionAvailable()`
returns `false`. In that case the Security section of Settings is disabled and
the database stays unencrypted. Install `gnome-keyring` or `kwallet` and restart
the app to enable encryption.

## Enabling encryption

1. Open **Settings → Security** in the desktop app.
2. Choose **Enable**.
3. Enter a new passphrase (minimum 8 characters) twice and click **Apply**.

Before encryption is applied, an unencrypted backup of the database is written
next to the current file as:

```
<dbPath>.bak-pre-encryption-<ISO-8601 timestamp>
```

Once you have verified that the encrypted database opens correctly and your
data is intact, **delete the backup**. Otherwise the backup is just an
unencrypted copy of your data sitting on disk.

## Rotating the passphrase

1. **Settings → Security → Rotate**.
2. Enter your current passphrase.
3. Enter a new passphrase twice and click **Apply**.

The rotation is atomic: the new passphrase is only persisted to the keychain
after the database has been successfully re-keyed. If the keychain write fails
after re-keying succeeds, Fire Tools attempts to roll the database back to the
previous passphrase and surfaces a clear error.

## Disabling encryption

1. **Settings → Security → Disable**.
2. Enter your current passphrase and click **Apply**.

The database is re-keyed to an unencrypted state and the passphrase blob is
removed from the OS keychain.

## Forgotten passphrase

**There is no recovery mechanism.** SQLCipher-style page encryption uses your
passphrase as the basis for the AES key. Without the passphrase, the database
file is just opaque ciphertext.

Mitigations:

- Pick a passphrase you will remember (or store it in your password manager).
- Keep the pre-encryption backup (`*.bak-pre-encryption-*`) somewhere safe
  until you are confident in your passphrase, then delete it.
- Use the built-in CSV export to keep portable, non-encrypted copies of your
  data outside the app.

## How it works under the hood

- The driver is swapped via an npm alias in `package.json`:
  `"better-sqlite3": "npm:better-sqlite3-multiple-ciphers@^11.10.0"`. The
  import path and binding name (`better_sqlite3.node`) are unchanged, so the
  rest of the codebase is untouched.
- On startup, `server/src/db.ts` issues
  `PRAGMA key='...'` **before** enabling WAL or foreign keys. SQLCipher
  requires the key to be set on the first page-touch.
- Wrong-key detection runs a trivial `SELECT count(*) FROM sqlite_master`
  immediately after `PRAGMA key`; SQLCipher silently accepts wrong keys on
  open and only fails on first decrypt. A failure here is mapped to a friendly
  `WrongPassphraseError`.
- Rekeying is done with `PRAGMA rekey='...'` (empty string to remove). Because
  wxSQLite3/SQLCipher does not allow rekey while `journal_mode = WAL`, the
  helper temporarily switches to `DELETE`, rekeys, then restores WAL.
- `:memory:` databases cannot be encrypted; only on-disk paths are supported.
- The HTTP endpoint `POST /api/v1/admin/db/passphrase` exposes the same
  set/rotate/remove operations for the standalone (non-Electron) server. It
  binds to loopback only and is intended for local administrative use.

## Threat model summary

| Threat                                    | Protected? |
| ----------------------------------------- | ---------- |
| Laptop stolen, disk imaged                | ✅          |
| Database file copied via backup tool      | ✅          |
| Database file synced to cloud accidentally| ✅          |
| Malware running as your user              | ❌          |
| Memory inspection of the running app      | ❌          |
| Coercion / shoulder-surfing the passphrase| ❌          |
