# Fire Tools

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.22.0-brightgreen)](package.json)

Local-first tools for **FIRE (Financial Independence, Retire Early)** planning.
Explore retirement scenarios, manage an investment allocation, and track
cashflow, debts and net worth without a mandatory account.

The React app ships as an **Electron desktop app with an embedded backend**
and a **read-only browser demo**. Calculations run on your device; market data,
optional model-assisted imports and desktop update checks can contact external
services. See [Security & Privacy](#security--privacy) for the boundaries.

**[Download the desktop app](https://github.com/fire-tools-inc/app/releases)**
| **[Try the live demo](https://fire-tools-inc.github.io/app/demo/)**
| **[Read the user guide](docs/user/README.md)**

> **Use the desktop app to keep your own financial data.** Normal HTTP(S)
> browser builds, including Vite development and Docker-hosted pages, use mock
> data and do not persist financial edits. Running a backend does not turn the
> browser demo into the full desktop app.

![Fire Tools dashboard showing net worth history, portfolio value and FIRE progress](docs/user/screenshots/homepage.png)

*Dashboard preview with synthetic demo data.*

## Disclaimer

This software is for **educational and planning purposes only**, not financial,
legal or tax advice. Projections are not guarantees. Yahoo Finance data is
**indicative only**, may be delayed or inaccurate, and uses an unofficial
endpoint. Always verify with your broker. Request limits are shown in
**Settings > Market Data**.

## Features

| Feature | Description |
|---------|-------------|
| **Home dashboard** | Saved net worth history, current allocation, monthly cashflow, FIRE-target progress, upcoming commitments and savings goals. [Guide](docs/user/homepage.md). |
| **Dark glass workspace** | Branded, collapsible sidebar, teal accents and readable financial data. Collapse to named icons for more page space; dark mode remains the default. |
| **FIRE Calculator** | Projections based on savings, expenses and expected returns; **Standard, Lean, Fat, Barista and Coast** variants; saved scenarios and shareable input URLs. [Guide](docs/user/fire-calculator.md). |
| **Reverse FIRE Calculator** | Compute the monthly savings needed to retire by a target age. |
| **Monte Carlo Simulations** | Up to 100,000 cancellable background-worker runs, volatility, black-swan modelling and opt-in detailed logs. [Guide](docs/user/monte-carlo.md). |
| **Investment Growth Calculator** | Project portfolio value with contributions, expected returns, inflation and savings-rate feedback. |
| **Withdrawal Rate Simulator** | Portfolio longevity tests across withdrawal rates, with a live slider. [Guide](docs/user/withdrawal-rate.md). |
| **Asset Allocation Manager** | Portfolio tracking, target weights and rebalancing recommendations. [Guide](docs/user/asset-allocation.md). |
| **DCA Helper** | Dollar-cost averaging planning inside Asset Allocation. |
| **Portfolio Backtest** | Buy-and-hold historical analysis with return, volatility and drawdown metrics. Missing market history uses labelled, deterministic asset-class assumptions. [Guide](docs/user/backtesting.md). |
| **Debt Payoff Calculator** | Snowball/avalanche strategies, fixed-budget or fixed-timeline modes, and a repayment timeline chart. |
| **Cashflow Tracker** | Income/expense categorization, budgets, 50/30/20 analysis, and YTD/yearly/custom-range totals and averages. [Guide](docs/user/expense-tracker.md). |
| **Cashflow Planning** | Recurring bills/income, explicit payment confirmation, and 30/90/365-day cashflow forecasts. [Guide](docs/user/cashflow-planning.md). |
| **Savings Goals** | Manually earmarked sinking funds, deadlines and required monthly contributions, without changing net worth. |
| **Offline Import Rules** | Review-first local categorization rules; manual overrides win and matched rows need no AI. |
| **Net Worth Tracker** | Monthly snapshots of assets, cash and pensions with historical charts. [Guide](docs/user/net-worth-tracker.md). |
| **Guided setup** | A questionnaire that helps populate calculator inputs and allocation targets. [Guide](docs/user/questionnaire.md). |
| **JSON / CSV Export and Import** | Portable calculator, allocation, cashflow and net-worth data; see [backup limitations](#data-storage-and-backups). |
| **Languages** | English, Italian, French, German and Spanish, selected in Settings. Sidebar navigation labels remain English. |
| **Build Info** | Version, commit hash and dependency versions in **Settings > About**. |

### Experimental features

Enable these in **Settings > Experimental features** on desktop. The public
demo enables previews by default.

- **Portfolio Breakdown:** view the portfolio by sector, region, currency,
  holding and ETF provider.
- **Document / Receipt Import:** PDF.js or backend-local LiteParse/OCR,
  retained receipt photos, paired Wi-Fi uploads and an optional user-managed
  HTTPS tunnel. Optional categorization supports a user-configured
  OpenAI-compatible local or hosted model. See the
  [document import guide](docs/pdf-import.md).

## Install the desktop app

Download the installer for your platform from the
[official releases](https://github.com/fire-tools-inc/app/releases). Packaged
apps do not require a separate Node.js, npm or database installation.

| Platform | Release artifacts | Requirements |
|----------|-------------------|--------------|
| **macOS** | `.dmg` or `.zip`, Apple Silicon / Intel | Choose the build matching your Mac. |
| **Windows** | `.exe` installer, x64 | Run the installer and follow its prompts. |
| **Linux** | `.AppImage`, x64 | glibc **2.35 or newer**; allow the file to execute before opening it. |

The app starts its embedded backend automatically. See
[desktop troubleshooting](electron/README.md#startup-troubleshooting) for
native-module or startup failures.

### Install on macOS

Open the DMG or extract the ZIP, then move **Fire Tools.app** into
**Applications** before opening it.

If macOS Gatekeeper blocks the app, first verify that your download came from
the official releases above and that you trust it. Only then open **Terminal**
and run:

```sh
xattr -dr com.apple.quarantine "/Applications/Fire Tools.app"
```

Reopen **Fire Tools** from Applications. This removes the quarantine attribute
from this app only, bypassing its downloaded-app quarantine checks. Never use
this command for an untrusted download or disable Gatekeeper globally.

## First run and configuration

1. Open **Settings** and choose your currency, language, date format and number
   formatting before entering data.
2. Use **Questionnaire** for guided setup, or enter assumptions directly in
   **FIRE Calculator**. Compare scenarios rather than treating a single
   projection as a prediction.
3. Add holdings in **Asset Allocation**, record income/expenses in
   **Cashflow Tracker**, and save monthly **Net Worth Tracker** snapshots.
   Use Home for a consolidated view.
4. Export your financial data from Settings regularly. Read
   [Data storage and backups](#data-storage-and-backups) before relying on a
   database copy as your only backup.

| Setting | Behavior |
|---------|----------|
| **Backend** | Uses the embedded desktop backend by default. **Custom URL** connects backend-supported features to your own server; enter its origin, such as `http://localhost:8080`, without `/api/v1`, then test the connection. It does not migrate renderer financial stores. |
| **AI features** | Disable or enable all local/hosted model calls without clearing model configuration. No model is configured by default, and each categorization action requires consent. Local OCR, receipt pairing and ordinary imports work with AI disabled. |
| **Experimental features** | Opt in to Portfolio Breakdown and document/receipt imports. |
| **Security** | Optional desktop SQLite passphrase encryption uses the OS secure store; Linux needs an available keyring. It does not encrypt renderer storage or exports. [Details](docs/security/passphrase.md). |
| **Updates & Backups** | Packaged desktop apps check GitHub Releases by default; automatic downloads are off. Configure checks, downloads and database snapshots here. [Details](docs/engineering/auto-updater.md). |

## Quick Start

### Prerequisites for source development

- **Node.js >=22.22.0**, **npm** and **Git**.
- A graphical desktop session for Electron. Linux native SQLite binaries need
  **glibc >=2.35**.
- **Docker Engine + Compose** only if using the container deployment.

Use the committed lockfiles to restore the root and backend dependencies
separately. Installation downloads Electron and verifies the native SQLite
bindings; Node.js and Electron share the bundled Node-API binaries.

### Run the desktop app from source

```sh
git clone https://github.com/fire-tools-inc/app.git
cd app
npm ci
npm --prefix server ci
npm --prefix server run build
npm run electron:dev
```

This starts Vite and Electron; Electron starts the embedded backend on a
random loopback port. For backend development with a separate watched server,
use `npm run electron:dev:full` instead, which starts the backend on port
**8787** together with Vite and Electron.

### Preview the browser demo and website

After `npm ci` in the repository root, choose one:

```sh
npm run dev       # demo at http://localhost:5173/demo/
npm run dev:all   # landing at /, demo at /demo/, docs at /docs/, API viewer at /api/
```

These are **demo previews**, not a way to save personal financial data.
No backend is needed for the ordinary browser demo.

The normal `dev` and Electron prelaunch hooks stop known development ports.
On a shared host, use a dedicated free port without the stop hook, for example
`npx vite --host 127.0.0.1 --port 5187 --strictPort`. See the
[desktop development guide](electron/README.md#run-in-dev) for the Electron
equivalent.

### Build

```sh
npm run build                # Pages layout: landing, demo, API viewer and docs in dist/
npm run build:self-hosted    # demo at /demo/ without the GitHub Pages repository prefix
npm run electron:dist        # desktop packages in release/<version>/
```

The self-hosted build uses fingerprinted asset filenames for cache-safe
updates. Desktop packaging uses [`electron-builder.yml`](electron-builder.yml);
signing/notarization requires additional
[platform configuration](electron/README.md#signing--notarization).

Dependency lifecycle approvals are version-pinned in both package manifests.
After changing dependencies, review `npm install-scripts ls` in the root and
`server/`, then approve only inspected scripts with
`npm install-scripts approve <package>`. Do not approve all packages blindly.

## Development checks

```sh
npm test
npm --prefix server test
npm run build
npx playwright install chromium  # once, if the browser binary is missing
npm run test:browser
npm run docs:screenshots -- homepage  # refresh only the dashboard screenshot
```

Unexpected warnings and errors fail tests; deliberate failure paths assert
their diagnostic messages. See [test conventions](tests/README.md) for
async fixtures, log assertions and verbose output.

The browser suite builds the self-hosted app and uses an isolated Vite preview
on port **5188**, synthetic data and mock market responses. It checks sidebar
collapse/focus and chart geometry across desktop/mobile widths without
contacting market services.

## Deployment Options

| Mode | What works today | Details |
|------|------------------|---------|
| **Desktop** | Full local planning UI, renderer-local financial stores and an embedded SQLite backend. | [Install](#install-the-desktop-app) or [build from source](#quick-start). |
| **Web demo** | Mock-data, read-only financial preview on the public site, Vite or a self-hosted HTTP(S) server. | [Live demo](https://fire-tools-inc.github.io/app/demo/). |
| **Docker Compose** | SQLite backend with a persistent volume, plus nginx serving the demo/website and proxying `/api/`. The desktop app can use this backend through Custom URL. | [Deployment guide](docs/deployment/README.md). |

To run the container stack from a clone:

```sh
docker compose build --no-cache
docker compose up -d
curl --fail http://localhost:8080/api/v1/health
```

Open **http://localhost:8080** for the website; the demo is at **/demo/**.
The API has **no implemented authentication layer**. Keep it on a trusted
private network and do not expose it publicly. Backend environment variables
such as `DATABASE_URL`, `PORT`, `HOST` and `CORS_ORIGIN` are documented in
[`server/README.md`](server/README.md#configuration).

**Not implemented here:** a PostgreSQL driver and a native mobile app.
The PostgreSQL-compatible schema/Compose profile and the
[Flutter mobile plan](docs/mobile/README.md) are not working alternatives to
the SQLite desktop app.

For maintainers, main-branch pushes prepare versioned desktop releases unless
marked `[skip ci]`. `./scripts/release.sh vX.Y.Z` provides the locally validated
release path from a clean, synchronized `main` checkout. See the
[release guide](docs/engineering/releasing.md) for checks, publication
monitoring and retries.

## Data storage and backups

Financial data is local-first, but **not all desktop data lives in SQLite**:

| Store | Current responsibility |
|-------|------------------------|
| **Renderer stores** | Calculator, allocation and tracker data use encrypted SafeCookies/localStorage helpers. Electron uses localStorage as authoritative; cashflow and net-worth histories use localStorage rather than size-limited cookies. |
| **Backend SQLite** | Owns its API records, receipt originals and supported preferences. Desktop uses `firetools.db` in the OS user-data directory; Docker uses the `firetools-data` volume. Existing renderer financial stores are not automatically migrated or synchronized into it. |

Settings' combined JSON export covers **FIRE calculator inputs, asset
allocation, cashflow (including planning/rules) and net worth**. Separate
CSV/JSON exports are also available. It is not a complete profile backup:
debts, saved scenarios, app settings and receipt originals are outside that
combined export. Receipt originals need a backend database backup.

Database snapshots and passphrase encryption do **not** cover renderer
localStorage. Keep financial exports as well as appropriate profile/database
backups; protect exported files because they are not encrypted by the app.
See [storage details](docs/database/README.md) and
[receipt retention](docs/pdf-import.md).

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, strict TypeScript, Vite, React Router, Recharts, react-i18next and crypto-js. |
| **Calculations** | Client-side utilities; cancellable module workers for Monte Carlo and withdrawal simulations. |
| **Backend** | Node.js, Express 5, Zod and TypeScript (ESM). |
| **Desktop** | Electron with context isolation and sandboxing, electron-builder and electron-updater. |
| **API** | OpenAPI 3.0.3: [`docs/api/openapi.yaml`](docs/api/openapi.yaml). |
| **Database** | SQLite via the `better-sqlite3-multiple-ciphers` npm alias; reference schema in [`docs/database/schema.sql`](docs/database/schema.sql). |

## Security & Privacy

- **External requests:** market prices, metadata, exchange rates and backtests
  use Yahoo Finance; allocation can refresh prices when opened. Packaged market
  requests use the third-party `corsproxy.io` proxy. Model categorization sends
  selected import data to your configured endpoint only with per-action
  consent. Packaged desktop update checks contact GitHub by default.
- **Encryption boundaries:** renderer AES storage uses a key shipped in the
  app, so it is not protection against JavaScript execution or a compromised
  local account. Optional [desktop passphrase encryption](docs/security/passphrase.md)
  protects the SQLite database, not every store or export.
- **Privacy mode** visually hides values; it does not remove them from data or
  exports. Financial log details are separately opt-in through
  [PII-gated logging](docs/engineering/logging.md).
- **Offline interface assets:** system typefaces and a bundled Material
  Symbols font; no Google Fonts requests are needed to render the interface.

For responsible vulnerability reporting, see [SECURITY.md](SECURITY.md).

## Documentation

| Topic | Link |
|-------|------|
| OpenAPI contract | [docs/api/](docs/api/) |
| Database schema | [docs/database/](docs/database/) |
| Deployment guide | [docs/deployment/](docs/deployment/) |
| User guides | [docs/user/](docs/user/) |
| Engineering docs | [docs/engineering/](docs/engineering/) |
| Desktop app | [electron/README.md](electron/README.md) |
| Backend server | [server/README.md](server/README.md) |
| Mobile app plan | [docs/mobile/](docs/mobile/) |
| PDF import | [docs/pdf-import.md](docs/pdf-import.md) |
| Tests and diagnostics | [tests/README.md](tests/README.md) |
| Security policy | [SECURITY.md](SECURITY.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| AI agent instructions | [AGENTS.md](AGENTS.md) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Check [open issues](https://github.com/fire-tools-inc/app/issues), fork, branch, and submit a PR.

## License

[MIT](LICENSE)

## Support

- [Report a bug](https://github.com/fire-tools-inc/app/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/fire-tools-inc/app/issues/new?template=feature_request.yml)
- [UX/UI suggestion](https://github.com/fire-tools-inc/app/issues/new?template=ux_ui_suggestion.yml)
- [SUPPORT.md](SUPPORT.md)

You can also report bugs from the app: **Settings > Support & Feedback**.
