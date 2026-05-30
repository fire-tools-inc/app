# Auto-updater design

Tracking issue: [#236](https://github.com/mbianchidev/fire-tools/issues/236).
Applies to the **Electron desktop build only**; the web build self-refreshes
on reload and ignores `settings.updater.*`.

## Goals

1. The packaged app can update itself from GitHub Releases without the user
   having to download installers manually.
2. **One backup minimum** — a release can never destroy the user's data. A
   pre-install backup is taken every time and at least one snapshot is kept
   alive at all times, even when retention is misconfigured.
3. Backups must be **restorable** — the user can roll back to any saved
   snapshot from inside the app, with a *safety* snapshot of the current
   state taken first.
4. The user keeps control: an opt-out toggle, configurable retention, and
   a "notify only" mode for users who never want background downloads.

## Architecture

```
┌────────────────────┐   IPC    ┌────────────────────┐
│  Renderer (React)  │ <──────► │  Main (Electron)   │
│                    │          │                    │
│ UpdateNotification │  events  │ electron/updater   │ ──► electron-updater
│ SettingsPage       │ ──────►  │ electron/backup    │ ──► fs (atomic)
│ src/utils/updater  │ ──IPC──► │ electron/main      │
└────────────────────┘          └────────────────────┘
```

- **`electron/updater.cjs`** wraps `autoUpdater` from `electron-updater`.
  - Forces `autoDownload = false` so we always show the banner first.
  - Emits `update-available`, `download-progress`, `update-downloaded`,
    `error` to all renderer `webContents`.
  - Exposes `checkForUpdates`, `downloadUpdate`, and `quitAndInstall`.
  - `quitAndInstall` calls `backup.createBackup` + `backup.rotateBackups`
    **before** handing control to the installer. If the backup fails we
    surface `backupFailed` and refuse to install.
- **`electron/backup.cjs`** is a pure-Node module (no Electron imports) so
  it can be unit-tested under vitest with `@vitest-environment node`. See
  [Manifest schema](#manifest-schema) below.
- **`electron/main.cjs`** registers IPC channels in `app.whenReady`:
  - `updater:check`, `updater:download`, `updater:install`,
    `updater:getStatus`
  - `backup:create`, `backup:list`, `backup:restore`, `backup:rotate`,
    `backup:getDir`
- **`electron/preload.cjs`** whitelists those channels and exposes them
  as `window.fireTools.updater.*` and `window.fireTools.backup.*`.
- **`src/utils/updater.ts`** is a thin renderer-side bridge with typed
  helpers; it falls back to no-ops in the web build (where
  `window.fireTools` is undefined).
- **`src/components/UpdateNotification.tsx`** subscribes to events and
  renders the in-app banner (download / install / dismiss).
- **`src/components/SettingsPage.tsx`** — *Updates & backups* section
  surfaces every knob plus the backup table with Restore action.

## Settings (`UserSettings.updater`)

Defined in `src/utils/cookieSettings.ts`:

```ts
interface UpdaterSettings {
  autoCheck: boolean;     // default true  — check on startup + interval
  autoDownload: boolean;  // default false — auto-download approved updates
  notifyOnly: boolean;    // default false — never download/install
  keepBackups: number;    // default 3, clamped to [1, 100]
}
```

`mergeUpdaterSettings(input)` is the single, idempotent normalizer:
- Wrong types fall back to defaults.
- `keepBackups` is floored, clamped, and **never goes below `1`** —
  passing `0`, `-5`, `NaN`, or `Infinity` all resolve to the minimum.

## Backup layout

```
<userData>/backups/
  2025-01-15T12-34-56-789Z-1.2.3/
    manifest.json
    firetools.db
    firetools.db-wal       (only if present)
    firetools.db-shm       (only if present)
    window-state.json      (if present)
    auto-update.json       (if present)
  2025-01-14T09-12-44-001Z-1.2.2/
    ...
```

The directory name is `<ISO-timestamp>-<version>`, sortable
lexicographically — the listing is returned newest-first.

> **Note**: cookie-backed renderer settings (`fire-calculator-settings`)
> live in the browser cookie store, not in `userData`, so they are not
> part of the snapshot. Users who clear cookies still need to re-enter
> them. The DB and `auto-update.json` are the durable record.

### Manifest schema

`manifest.json` (`schema: 1`):

```json
{
  "schema": 1,
  "id": "2025-01-15T12-34-56-789Z-1.2.3",
  "timestamp": "2025-01-15T12:34:56.789Z",
  "version": "1.2.3",
  "files": [
    { "name": "firetools.db",     "bytes": 1572864, "sha256": "..." },
    { "name": "firetools.db-wal", "bytes":    8192, "sha256": "..." },
    { "name": "window-state.json","bytes":     128, "sha256": "..." }
  ],
  "totalBytes": 1581184
}
```

A snapshot is **valid** when every file listed in the manifest exists on
disk and re-hashes to the same SHA-256. `listBackups` returns
`valid: false` (+ `error`) for any snapshot that fails this check, so the
UI can disable Restore.

## Atomicity

`createBackup`:

1. Writes to `backups/.tmp-<id>/`.
2. Copies each source file in turn, hashing as it goes.
3. Writes `manifest.json` last.
4. Renames the tmp dir to the final `<id>/`. The rename is the
   commit point — partial backups never appear in `listBackups`.

`restoreBackup`:

1. Calls `createBackup({ version: '<current>-prerestore' })` first as a
   safety net.
2. Verifies the chosen backup is valid.
3. For each file in the manifest, copies into `<userData>/.restore-<id>/`
   then renames over the live file.
4. Returns the `safetyBackupId` so the UI can offer a single-click undo.

## Rotation invariant

`rotateBackups({ keep })`:

- Clamps `keep` to `[1, 100]`. `keep <= 0` → `1`. `keep > 100` → `100`.
- Sorts backups by timestamp descending and removes everything past
  index `keep - 1`.
- Returns `{ kept, removed }`.

> The clamp guarantees the app can **never** wipe every backup, even if
> a future caller passes `0` or a corrupt setting sneaks through.

## Failure modes & recovery

| Failure                       | Behaviour                                                        |
|-------------------------------|------------------------------------------------------------------|
| Network error during check    | Logged, banner not shown, user can retry from Settings           |
| Download error                | `updater:error` event → banner shows retry option                |
| Backup fails before install   | Install **aborted**, banner shows "Backup failed" with details   |
| Install fails after backup    | App relaunches old version; snapshot still on disk for rollback  |
| DB corrupted after update     | Settings → Backups → Restore previous snapshot (one click)       |
| User aborts restore midway    | Pre-restore safety snapshot is intact; Restore is rename-based   |

## Testing

- `tests/shared/electron-backup.test.ts` (node env) — backup/list/rotate
  /restore including the min-1 invariant and `.tmp-` cleanup.
- `tests/pages/settings/cookieSettings.test.ts` — `mergeUpdaterSettings`
  defaults, clamping, NaN handling, and round-trip through save/load.
- `tests/shared/i18n.test.ts` — strict parity across the 5 locales for
  the new `update.*` / `settings.updater.*` keys.

## Distribution

`electron-builder.yml` publishes to GitHub Releases:

```yaml
publish:
  - provider: github
    owner: mbianchidev
    repo: fire-tools
```

`.github/workflows/release.yml` uploads the `*.yml` and `*.blockmap`
files alongside the installer so `electron-updater` can resolve the
latest version.
