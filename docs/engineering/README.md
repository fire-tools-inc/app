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
- **Container builds** — `build:self-hosted` uses `/demo/` with fingerprinted
  assets, rather than the repository-prefixed Pages path. `.dockerignore`
  keeps host dependencies and generated outputs out of the build context.
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
