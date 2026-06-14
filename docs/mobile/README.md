# Mobile app — separate repo, Flutter

Tracking issue: [#134](https://github.com/fire-tools-inc/app/issues/134).

## Why a separate repo

- Mobile toolchains (Xcode, Android SDK, Gradle, CocoaPods, signing
  identities, store fastlane configs) are heavy and irrelevant to web /
  desktop contributors.
- App-store CI (TestFlight upload, Play internal track, privacy
  manifests, screenshot pipelines) is mobile-specific.
- Release cadence is different: store review cycles vs. web hotfixes.

The plan is to publish a sibling repo, **`fire-tools-mobile`**, that
consumes the same OpenAPI contract this repo defines.

## Stack

- **Flutter 3** (stable channel) for the UI — single Dart codebase that
  targets iOS, Android, and (later) macOS / Windows / Linux if needed.
- **`dio`** as the HTTP client.
- **OpenAPI Generator (Dart-Dio)** to generate the API client from
  [`docs/api/openapi.yaml`](../api/openapi.yaml). Pin the contract
  version in the mobile repo's `pubspec.yaml` and refresh via a CI
  script when this repo cuts a release.
- **`flutter_secure_storage`** for any sensitive client-side data
  (Keychain on iOS, EncryptedSharedPreferences on Android).
- **`fl_chart`** for the calculator/Monte-Carlo visualisations
  (matching what the React app does with Recharts).
- **`riverpod`** or **`bloc`** for state management — to be chosen by
  the mobile repo on first commit, not pre-decided here.

## How it talks to the backend

Two supported run modes — same as the desktop app:

1. **Self-hosted backend.** Point the mobile app at a user-supplied
   `https://…/api/v1` base URL (the local Docker Compose stack, a
   personal VPS, etc.). Auth = bearer token reserved by the contract.
2. **Standalone, fallback storage.** A pure-Flutter local data layer
   (SQLite via `sqflite`, optionally encrypted with `sqlcipher`) that
   mirrors a strict subset of the schema for users who don't want to
   run a server. This is the mobile equivalent of the current web app's
   encrypted-cookie mode.

The API contract in
[`docs/api/openapi.yaml`](../api/openapi.yaml) is the source of truth.
Any breaking change must bump the OpenAPI version *here* before the
mobile repo regenerates its client.

## Why Flutter instead of a webview wrapper

- Native look + feel, real platform widgets, no jank on long lists or
  charts.
- One Dart codebase covers iOS *and* Android (and optionally desktop
  targets later) without dragging the React/Vite toolchain along.
- App-store reviewers don't reject "webview-of-a-website" submissions
  the way they do with thin wrappers.
- Offline mode, secure storage, background tasks, and biometric auth
  all have first-party Flutter plugins.

## Contract sharing

This repo owns:

- `docs/api/openapi.yaml` — REST contract
- `docs/database/schema.sql` — DB schema (SQLite-first,
  Postgres-compatible)
- `src/types/*.ts` — TypeScript shapes that mirror the above

The mobile repo will:

- Regenerate its Dart client from `openapi.yaml` (script committed
  there).
- Mirror the small "local mode" subset of the schema in its own
  `sqflite` migrations — not import the SQL file directly, because
  the mobile schema is intentionally narrower.

## Not in scope for this PR

- Creating `fire-tools-mobile` (separate repo, separate PR).
- Pinning concrete Flutter / dio / fl_chart versions — locked when the
  mobile repo's first commit lands.
- App-store metadata, signing certs, fastlane pipelines.
