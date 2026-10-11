# Fire Tools — Engineering documentation

This section is for developers and operators who want to **self-host the
backend**, **build a custom client**, or **understand the internals**. If
you're a regular user, you probably want the [user guide](../user/README.md)
instead.

## Pages in this section

- [Backend deployment (Docker Compose)](./backend-deploy.md)
- [API & custom clients (OpenAPI)](./api-client.md)
- [Database & schema](./database.md)
- [Migrations & rollbacks](./migrations.md)
- [Audit log](./audit-log.md)
- [Logging & PII handling](./logging.md)
- [GitHub Pages deploy](./github-pages.md)
- [Cutting a release](./releasing.md)

## Architecture at a glance

```
+----------------+        +----------------+        +----------------+
|  Web / Electron| <----> |  Node.js API   | <----> |     SQLite     |
|     client     |  HTTP  |   Express +    |  SQL   |  local file DB |
|  (React, Vite) |        |    OpenAPI     |        |  local/compose |
+----------------+        +----------------+        +----------------+
```

- **Client** — the React app under `src/`. Built with Vite. Tool pages are
  emitted as route-level chunks, preloaded when navigation intent is detected,
  chart-heavy views render progressively after the page shell, and language
  packs load on demand with English kept as the fallback. Desktop preference
  sync also runs behind the application shell, so backend startup does not
  delay routes. Monte Carlo and withdrawal-rate calculations run in cancellable
  module workers. Monte Carlo histograms and percentiles are computed there
  too, so the UI receives a compact summary rather than the full simulation
  array. Detailed logs are explicitly opt-in.
  The same client ships to the web (`dist/`) and Electron.
- **Dashboard** — `/` reads the existing frontend stores through
  `src/utils/dashboard.ts`. It derives net worth, active allocation, calendar-month
  cash flow and the saved FIRE plan with the shared calculation helpers. It does
  not create a backend store, mutate financial records or seed defaults.
  Recharts loads only in the deferred dashboard chart chunk. Marketing/tool
  discovery remains in `website/index.html#features`.
- **Interface** — a dark-default, teal liquid-glass token system in `src/App.css`.
  Backdrop blur is reserved for floating chrome rather than every data card.
  `AppNavigation` owns a fixed-width desktop sidebar and a keyboard-contained
  mobile drawer; route content uses the remaining workspace. The desktop rail
  is inset and rounded, with a branded static profile header and compact pointer
  targets; touch navigation retains 44-pixel targets. A persisted desktop
  collapse mode keeps named icon links while widening the page, and mobile
  always retains full labels. Settings is not duplicated in the profile.
  Portfolio charts
  share `src/utils/chartColors.ts` so a class has the same readable color in
  allocation, breakdown and net-worth flow views. The allocation donut uses a
  compact plot with an opaque-text legend, rather than colored floating labels.
  Responsive radii, external legends, sign-aware income stacks and page-scoped
  chart styles prevent cropping. Histograms and Sankey diagrams scroll locally
  at narrow widths. Cashflow charts share stable colors and user overrides.
  System typefaces and a bundled, Apache-licensed Material Symbols font keep
  interface rendering independent of external font services.
- **Settings reads** — the decrypted payload is cached by its encrypted
  storage value. Saved settings are reconstructed with independent nested
  fields, so formatting many cells does not repeatedly decrypt the payload or
  leak cached mutations between readers. Treat shared defaults as immutable.
- **Client storage** — frontend domain stores still use encrypted cookies and
  localStorage, with localStorage authoritative in Electron. Supported UI
  preferences mirror the backend, but not every domain page is an API client.
  The read-only browser demo does not require a backend.
- **Backend** — a small Node.js + Express service in `server/`. SQLite is the
  supported storage driver; the schema is Postgres-compatible, but the
  Postgres driver remains deferred.
- **Native startup** — Electron 44.7.0 includes the macOS unavailable
  sleep/wake-registration fix. The development launcher owns the actual Vite
  and Electron processes and reports native signal failures. See
  [desktop startup troubleshooting](../../electron/README.md#startup-troubleshooting).
- **Native SQLite** — `better-sqlite3-multiple-ciphers` 13 uses bundled Node-API
  binaries, preserving encryption while removing the deprecated native
  installer. Node.js and Electron use the same compatible prebuild. Both
  manifests require Node.js >=22.22.0; Linux binaries require glibc >=2.35.
  Electron packages retain only their target platform/architecture (Linux
  keeps its glibc and musl variants); the Bookworm backend image keeps only
  its Linux architecture. The existing real database-open probes remain in
  the install/build lifecycle. Packaging does not force an ABI-specific rebuild.
  Each platform's `files` list includes the shared positive application
  whitelist (YAML anchors), not only native exclusions. A negative-only
  platform list can expand packaging to the whole repository. Inspect the
  final ASAR as well as testing individual glob matches.
  Keep the existing `@types/better-sqlite3` dependency: the cipher package's
  bundled declaration currently lacks an export-map entry for NodeNext.
- **Dependency approvals** — `allowScripts` entries are pinned to reviewed
  installed versions in both manifests. Use `npm install-scripts ls`,
  review any newly listed dependency scripts, then approve specific packages;
  prune only obsolete pins after upgrades. Keep reviewed native pins when npm
  reports an implicit install script, even if the package sets `gypfile: false`;
  pruning those pins can bring the clean-install notices back.
  Older npm releases may not enforce this
  policy, so use an npm release supporting `install-scripts` when reviewing it.
  The `electron-updater`-scoped equality override replaces deprecated
  `lodash.isequal` with `fast-deep-equal` for its plain update-manifest and file
  metadata comparisons. Update cache regressions exercise the actual updater
  helper; other Lodash dependencies are unchanged.
- **PDF assets** — standard fonts and their licenses are emitted as local Vite
  assets alongside character maps and decoder resources, and loaded by the
  PDF.js 6 `BinaryDataFactory` on the main thread. This works
  with fingerprinted web builds and relative Electron assets without a CDN.
- **Document parsing and receipts** — PDF.js remains the renderer default;
  `POST /document-text` runs the optional LiteParse/Tesseract engine in a
  bounded, disposable Node/Electron-as-Node process. Native bindings and the
  worker are unpacked for Electron. Source files use private temporary
  directories removed on every outcome. Build/test/dev lifecycle hooks bundle
  English Tesseract data from a pinned development-only package, including its
  Apache-2.0 license and SHA-256 provenance. The worker verifies the local model
  exists and uses its real unpacked path; it never falls back to a first-use
  download. The 23.5 MB data file is not part of the renderer bundle.
  `receipts` retains original photo
  BLOBs before OCR; renderer financial writes remain localStorage-authoritative.
  Batch import persists once and uses content-derived receipt transaction IDs.
  `receipt-pairings` opens an opt-in, upload-only listener with a 30-minute
  capability. Phone IndexedDB retains originals until storage acknowledgement.
  An existing HTTPS tunnel or private container-host address can be supplied;
  no tunnel provider is integrated and the normal desktop API stays private.
  Migration `0004_receipts` adds only the original-image table; rollback deletes
  images but leaves imported financial entries untouched.
- **Expense statistics** — inclusive transaction-date filtering, elapsed
  calendar denominators (including gaps), archived history and explicit
  currency filtering. Invalid legacy records produce a visible exclusion
  count. Wide history charts use local keyboard scrolling and accessible data
  tables rather than viewport-wide overflow.
- **Container builds** — `build:self-hosted` uses `/demo/` with fingerprinted
  assets, rather than the repository-prefixed Pages path. `.dockerignore`
  keeps host dependencies and generated outputs out of the build context.
  Bundled SQLite binaries remove the compiler/APT installation steps and their
  debconf/missing-manpage notices. The backend runs Node directly as PID 1;
  its SIGTERM/SIGINT handlers close HTTP and SQLite. The existing UID 10001
  remains unchanged so existing data-volume permissions still work.
  Container installs skip unneeded lifecycle scripts to avoid older npm's
  implicit node-gyp build, and disable only npm's interactive update notifier.
  Build errors and database-open failures still fail the image build.
- **Contract** — [OpenAPI 3.0.3](https://github.com/fire-tools-inc/app/blob/main/docs/api/openapi.yaml).
  Source of truth for both server routes and any generated client. Also
  published at [`/app/api/`](https://fire-tools-inc.github.io/app/api/).

## Why a local-first backend?

Most FIRE tools either run entirely client-side (data trapped in one browser)
or fully cloud-hosted (third party sees your finances). Fire Tools' backend
is meant to run **on your own machine** (Docker Desktop, your homelab,
whatever) so your data stays on your hardware while still being reachable
from multiple devices on your network.

Every domain table already carries `user_id`, but the default configuration
boots a single user. The schema and user-scoping helpers leave room for a
future authenticated multi-tenant deployment; they are not authentication.

## Source map

| Path | Purpose |
| ---- | ------- |
| `src/` | React + TypeScript frontend (Vite) |
| `src/i18n/` | On-demand translation resources and language setup |
| `src/routes/` | Lazy route registry and navigation preloading |
| `src/workers/` | Monte Carlo and withdrawal-rate simulation execution |
| `src/assets/fonts/` | Bundled icon font; its license is distributed from `public/` |
| `.github/skills/` | Repository-local UI, performance and data-integrity workflows |
| `server/` | Node.js + Express + better-sqlite3 backend |
| `electron/` | Electron main + preload (desktop wrapper) |
| `website/` | Marketing landing page |
| `docs/api/` | OpenAPI contract + Redocly config |
| `docs/database/` | DDL + ERD notes |
| `docs/deployment/` | Docker Compose how-tos |
| `docs/user/` | End-user documentation (this site's `/docs/user/`) |
| `docs/engineering/` | Engineering documentation (this site's `/docs/engineering/`) |

## Agent-assisted changes

`AGENTS.md` is the contributor-wide agent entry point. The focused skills in
`.github/skills/` capture the interface, calculation-performance and
data-retention safeguards for future changes. Read the relevant `SKILL.md`
before working in that area. Each skill includes planning smoke-test prompts;
those fixtures are not claims of completed model benchmarks.

`npm run test:browser` runs the committed Playwright regression suite with
synthetic data and mocked external responses. Its CI job verifies navigation,
plot and label bounds, usable chart height and local-only overflow across
desktop/mobile routes.

## Related links

- [Project README](https://github.com/fire-tools-inc/app)
- [Issue tracker](https://github.com/fire-tools-inc/app/issues)
- [Live OpenAPI viewer](https://fire-tools-inc.github.io/app/api/)
- [Mobile repo plan](https://github.com/fire-tools-inc/app/blob/main/docs/mobile/README.md)
