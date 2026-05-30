# Electron — Fire Tools desktop wrapper

Wraps the existing React SPA so it ships as a signed binary on macOS,
Windows and Linux. Tracks issue
[#132](https://github.com/mbianchidev/fire-tools/issues/132).

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

Env vars (set in CI secrets — never commit):

| Var                          | Purpose                                    |
|------------------------------|--------------------------------------------|
| `CSC_LINK`                   | Path/URL to `.p12` macOS signing cert      |
| `CSC_KEY_PASSWORD`           | Password for the `.p12`                    |
| `APPLE_ID`                   | Apple ID for notarization                  |
| `APPLE_APP_SPECIFIC_PASSWORD`| App-specific password                      |
| `APPLE_TEAM_ID`              | Apple Developer team id                    |
| `WINDOWS_CERTIFICATE_LINK`   | Path/URL to Windows code-signing cert      |
| `WINDOWS_CERTIFICATE_PASSWORD` | Password for the Windows cert            |

Set `notarize: true` in [`../electron-builder.yml`](../electron-builder.yml)
once macOS notarization credentials are wired into CI.

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

Both `onNavigate` / `onMenuAction` return an unsubscribe function — use
in a `useEffect` cleanup.

