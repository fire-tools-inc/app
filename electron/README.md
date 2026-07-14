# Electron — Fire Tools desktop wrapper

Wraps the existing React SPA so it ships as a signed binary on macOS,
Windows and Linux. Tracks issue
[#132](https://github.com/fire-tools-inc/app/issues/132).

> **Scope of this scaffold.** Wraps the React SPA **and bundles the
> Node + Express + SQLite backend in-process**: the main process starts the
> embedded server on a random localhost port at boot, the renderer talks to
> it like any other API, and SQLite lives at the OS userData path
> (`~/Library/Application Support/fire-tools/firetools.db` on macOS,
> `%APPDATA%\fire-tools\firetools.db` on Windows,
> `~/.config/fire-tools/firetools.db` on Linux). Users who prefer to run
> the backend elsewhere (Docker, remote box) can switch to a custom URL via
> **Settings → Backend → Custom URL** without rebuilding the app.

## Run in dev

Two terminals:

```sh
# 1. Vite dev server (relative-base build for Electron)
ELECTRON_RENDERER_URL=http://localhost:5173 npm run dev

# 2. Electron, pointed at the Vite dev server
ELECTRON_RENDERER_URL=http://localhost:5173 npm run electron:dev
```

Or one-liner with concurrent processes (your shell of choice — we
intentionally don't pull in `concurrently` to keep deps lean).

## Build a distributable

```sh
npm run electron:build   # produces dist-electron/ from Vite
npm run electron:dist    # runs electron-builder per electron-builder.yml
```

Artifacts land in `release/<version>/`. Defaults: `.dmg` (macOS),
`.exe` NSIS installer (Windows), `.AppImage` (Linux).

## Signing & notarization

Tagged macOS releases must use a **Developer ID Application** certificate and
Apple notarization. The release workflow fails before building if any required
secret is missing, then extracts the updater ZIP and verifies its signature,
Team ID, designated requirement, stapled notarization ticket, and Gatekeeper
assessment before upload.

Configure these repository Actions secrets (never commit their values):

| Secret | Purpose |
|--------|---------|
| `CSC_LINK` | Base64-encoded Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_API_KEY_BASE64` | Base64-encoded App Store Connect API key `.p8` |
| `APPLE_API_KEY_ID` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer UUID |
| `APPLE_TEAM_ID` | Apple Developer Team ID; also checked against the signed app |
| `WINDOWS_CERTIFICATE_LINK` | Path/URL to the Windows code-signing certificate |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the Windows certificate |

Create single-line base64 values on macOS with:

```sh
base64 -i DeveloperIDApplication.p12 | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Local `npm run electron:dist` builds can still use the ad-hoc `afterSign`
fallback when no certificate is configured. Those builds are for development
only and cannot safely self-update.

### Existing unsigned installs

Published macOS builds through v2.3.2 were not Developer ID-signed; recent
versions, including v2.2.1 and v2.3.2, were ad-hoc signed. macOS assigns each
ad-hoc build a designated requirement tied to its exact code hash, so ShipIt
rejects the next version with
`code failed to satisfy specified code requirement(s)`. Users must download
and install the **first Developer ID-signed release** manually once.
Auto-update works normally after that; future certificate renewals under the
same Apple Team ID do not require another manual migration.

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer cannot reach Node directly; the preload exposes a tiny
  read-only surface (`window.fireTools`).
- External links open in the OS browser via `shell.openExternal`.
- `will-navigate` is blocked except for the dev server and `file://`.
- **Single-instance lock**: launching a second copy focuses the existing
  window instead of starting a competing process (protects the SQLite DB
  from concurrent writers).

## Native desktop UX

The Electron build is not just a thin web wrapper:

- **Boots straight into the FIRE Calculator** (`/fire-calculator`) instead
  of the marketing homepage.
- **Decorative web header is hidden**; the nav bar becomes the OS
  drag-region.
- **macOS** uses `titleBarStyle: 'hiddenInset'` for a flush, native look
  (traffic-light controls only). About panel data comes from
  `package.json`.
- **Native menu bar** with platform-aware accelerators (Cmd⇄Ctrl):
  - File → Import CSV (`⌘O`), Export CSV (`⌘S`)
  - Edit → standard undo/redo/cut/copy/paste/select-all roles
  - Navigate → Home (`⌘0`), FIRE Calculator (`⌘1`), Asset Allocation
    (`⌘2`), DCA Helper (`⌘3`), Budget (`⌘4`), Net Worth (`⌘5`),
    Tax Calculator (`⌘6`), Settings (`⌘,`)
  - View → reload, force-reload, toggle DevTools, zoom in/out/reset,
    toggle full-screen
  - Help → Docs, GitHub repo, Report an issue, About
- **Window state persistence**: size, position and maximized state are
  stored in `window-state.json` under the OS userData dir
  (`~/Library/Application Support/fire-tools/window-state.json` on macOS).
  Bounds are validated against the current display layout on reopen, so
  windows can't end up off-screen after a monitor change.

### Preload bridge (`window.fireTools`)

| Member                 | Type                                | Purpose                                        |
|------------------------|-------------------------------------|------------------------------------------------|
| `platform`             | string                              | `process.platform` value                       |
| `versions`             | `NodeJS.ProcessVersions`            | Node/Chrome/Electron versions                  |
| `getEmbeddedBackend()` | `() => Promise<{url, dbPath, ...}>` | Embedded backend metadata (or `error`)         |
| `openExternal(url)`    | `(string) => Promise<void>`         | Open in OS browser via `shell.openExternal`    |
| `onNavigate(cb)`       | `(path => void) => () => void`      | Subscribe to menu → router navigation          |
| `onMenuAction(cb)`     | `(action => void) => () => void`    | Subscribe to non-nav menu actions (e.g. CSV)   |
| `updater.*`            | namespace                            | Auto-update IPC (see below)                    |

Both `onNavigate` / `onMenuAction` return an unsubscribe function — use
in a `useEffect` cleanup.

## Auto-updater (issue #236)

The packaged desktop build can self-update from GitHub Releases using
[`electron-updater`](https://www.electron.build/auto-update). Updates are
**guarded by an always-on backup step** so a bad release can never wipe
your data.

### Flow

1. On app start (when `app.isPackaged === true`), `electron/updater.cjs`
   asks GitHub Releases for the latest version. Configurable via
   `settings.updater.autoCheck` (default `true`).
2. If an update is available, the renderer is notified
   (`updater:update-available`) and a banner appears in-app.
3. Download starts either automatically (`autoDownload = true`) or after
   the user clicks **Download**. Progress events are forwarded so the UI
   can show a percentage.
4. When the download is complete:
   - `backup.cjs::createBackup` snapshots `firetools.db` (+ WAL/SHM),
     `window-state.json`, and `auto-update.json` into
     `<userData>/backups/<timestamp>-<version>/`.
   - The manifest is written as `manifest.json` with schema version `1`,
     per-file SHA-256, byte counts and total size.
   - `rotateBackups` then prunes older entries down to
     `settings.updater.keepBackups` (default `3`, **minimum `1`**).
5. The UI prompts the user to **Install & restart**; on confirm the app
   relaunches into the new version.

### Settings

`settings.updater` (encrypted cookie, web build ignores it):

| Field          | Default | Notes                                                 |
|----------------|---------|-------------------------------------------------------|
| `autoCheck`    | `true`  | Periodic check for new releases                       |
| `autoDownload` | `false` | Start downloading without user prompt                 |
| `notifyOnly`   | `false` | Never download/install — only notify                  |
| `keepBackups`  | `3`     | Clamped to `[1, 100]`. `0` becomes `1`                |

### Restore

Settings → *Updates & backups* → **Backups** lists every snapshot with
its timestamp, source version, total size, and validity (manifest +
SHA-256 verification). Clicking **Restore** runs
`backup.cjs::restoreBackup`:

1. Takes a *pre-restore* safety snapshot of the current state
   (`<currentVersion>-prerestore`).
2. Atomically swaps the chosen backup's files in over the live ones.
3. Returns the safety backup id so the user can roll back the rollback.

### Files

- `electron/updater.cjs` — `electron-updater` wrapper, IPC + events.
- `electron/backup.cjs` — pure-Node backup / rotate / restore module.
- `electron/main.cjs` — registers `updater:*` and `backup:*` IPC handlers.
- `electron/preload.cjs` — exposes `window.fireTools.updater.*` and
  `window.fireTools.backup.*` to the renderer.
- `src/utils/updater.ts` — renderer-side bridge.
- `src/components/UpdateNotification.tsx` — in-app banner.

See [`docs/engineering/auto-updater.md`](../docs/engineering/auto-updater.md)
for the full design including manifest schema and rollback flow.
