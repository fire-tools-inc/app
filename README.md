# Fire Tools

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.22.0-brightgreen)](package.json)

A privacy-first suite of **FIRE (Financial Independence Retire Early)** planning tools. Financial data is stored locally by default; optional integrations (Yahoo Finance prices, LLM categorization) contact external services only when explicitly enabled.

**Settings → AI features** can disable or enable all local/hosted model calls
without clearing model configuration. OCR and document imports remain usable.

**[Download the desktop app →](https://github.com/fire-tools-inc/app/releases)** &nbsp;·&nbsp; **[Try the live demo →](https://fire-tools-inc.github.io/app/demo/)**

---

## ⚠️ Disclaimer

This software is for **educational and planning purposes only** — not financial, legal, or tax advice. Market data from Yahoo Finance is **indicative only**, may be delayed or inaccurate, and the endpoint is unofficial. Always verify with your broker. See rate-limit details in **Settings → Market Data**.

---

## Features

| Feature | Description |
|---------|-------------|
| **Home dashboard** | Saved net worth history, current allocation, monthly cash flow and FIRE-target progress — [guide](docs/user/homepage.md). Tool discovery lives on the [website](https://fire-tools-inc.github.io/app/#features). |
| **Dark glass workspace** | Branded, collapsible sidebar, teal accents and readable financial data. Collapse to named icons for more page space; dark mode remains the default. |
| 🧮 **FIRE Calculator** | Net-worth projections based on savings rate, expenses, and expected returns. Supports **Standard, Lean, Fat, Barista, and Coast** FIRE variants — see [docs/user/fire-calculator.md](docs/user/fire-calculator.md). |
| ↩️ **Reverse FIRE Calculator** | Compute the monthly savings needed to retire by a target age — [docs](docs/user/fire-calculator.md) |
| 🎲 **Monte Carlo Simulations** | Cancellable background-worker simulations, with volatility, black-swan modelling and opt-in detailed logs |
| 📈 **Investment Growth Calculator** | Project portfolio end value over time with contributions, expected returns, inflation, and savings-rate feedback |
| 📉 **Withdrawal Rate Simulator** | Trinity-style portfolio longevity test across withdrawal rates with a live slider |
| 📊 **Asset Allocation Manager** | Portfolio tracking with rebalancing recommendations |
| 🍩 **Portfolio Breakdown** *(experimental)* | Multi-dimensional view (sector, region, currency, provider) — [details](docs/pdf-import.md) |
| 📄 **Document / Receipt Import** *(experimental)* | PDF.js or local LiteParse/OCR, retained photos, paired Wi-Fi uploads and optional HTTPS tunnel; OpenAI-compatible local-model categorization — [details](docs/pdf-import.md) |
| 💵 **DCA Helper** | Dollar-cost averaging planning |
| 💳 **Debt Payoff Calculator** | Snowball/avalanche strategies, fixed-budget or fixed-timeline modes, repayment timeline chart |
| 💰 **Cashflow Tracker** | Income/expense categorization, budgets, 50/30/20 analysis, YTD/yearly/custom-range expense totals and averages |
| 📈 **Net Worth Tracker** | Monthly snapshots of assets, cash, pensions with historical charts |
| 📥 **CSV Export / Import** | Full data backup and restore |
| 🌍 **Multi-language** | English, Italian, French, German, Spanish — change in Settings |
| ℹ️ **Build Info** | Version, commit hash, dependency versions in Settings → About |

---

## Quick Start

```bash
git clone https://github.com/fire-tools-inc/app.git && cd app
npm install
npm run dev          # → http://localhost:5173
```

To preview the full site (landing page + docs + OpenAPI viewer):

```bash
npm run dev:all      # mirrors GitHub Pages layout
```

For a build served at `/demo/` on your own host, use `npm run build:self-hosted`.
Docker uses this mode so assets do not inherit the GitHub Pages repository
prefix, and asset filenames remain fingerprinted for cache-safe updates.

To run the Electron desktop app against the local backend (boots
`server/` + Vite + Electron in one shot):

```bash
npm install --prefix server   # first time only
npm run electron:dev:full     # backend on :8787 + Electron renderer
```

For Vite + Electron with the embedded backend, first run
`npm --prefix server run build`, then `npm run electron:dev`.
Electron 44.7.0 includes the upstream macOS sleep/wake-registration startup
crash fix; see [desktop troubleshooting](electron/README.md#startup-troubleshooting).

SQLite 13 uses bundled Node-API binaries shared by Node.js and Electron.
Linux desktop builds require **glibc 2.35 or newer**; the Docker images use
Debian Bookworm and meet this minimum. Existing SQLite files and passphrase
encryption remain supported; no data-store migration is required.

Dependency lifecycle approvals are version-pinned in both package manifests.
After updating dependencies, review `npm install-scripts ls` in the root and
`server/`, then approve only the scripts you inspected with
`npm install-scripts approve <package>`. Do not approve all packages blindly.
The frontend container intentionally skips lifecycle scripts because it does
not run native desktop modules.

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
on port 5188, synthetic data and
mock market responses. It checks sidebar collapse/focus and complete chart
geometry across desktop/mobile routes without contacting market services.

---

## Deployment Options

For a desktop release, run `./scripts/release.sh vX.Y.Z` from a clean `main`
checkout synchronized with `origin/main`. It bumps the version, restores
dependencies, audits/tests/builds locally, then atomically pushes the version
commit and tag. GitHub Actions builds and publishes the installers afterward;
the script prints the workflow link without waiting. See the
[release guide](docs/engineering/releasing.md).

| Mode | Storage | How to run | Details |
|------|---------|------------|---------|
| **Web demo** | None — read-only preview | [Live demo](https://fire-tools-inc.github.io/app/demo/) | Seeded sample data; nothing you enter is saved |
| **Docker** | SQLite (volume-backed) | `docker compose up -d` → `localhost:8080` | [docs/deployment/](docs/deployment/) |
| **Electron** | SQLite at OS userData path | `npm run electron:dist` | [electron/README.md](electron/README.md) |
| **Mobile** | Via backend API | Separate Flutter repo | [docs/mobile/](docs/mobile/) |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19 · TypeScript · Vite · React Router · Recharts · react-i18next · crypto-js |
| **Backend** | Node.js · Express 5 · better-sqlite3 · Zod · TypeScript (ESM) |
| **Desktop** | Electron (hardened, contextIsolation + sandbox) · electron-builder · electron-updater |
| **API** | OpenAPI 3.0.3 — [`docs/api/openapi.yaml`](docs/api/openapi.yaml) |
| **Database** | SQLite (first-class) · PostgreSQL-compatible — [`docs/database/schema.sql`](docs/database/schema.sql) |

---

## Security & Privacy

- **Local-only by default** — desktop uses SQLite; browser uses encrypted cookies. Nothing leaves your device unless you opt in.
- **AES-256 browser encryption** — cookie values encrypted before storage
- **Optional passphrase DB encryption** (desktop) — [docs/security/passphrase.md](docs/security/passphrase.md)
- **PII-gated logs** — financial data excluded unless explicitly enabled — [docs/engineering/logging.md](docs/engineering/logging.md)
- **Offline interface assets** — system typefaces and a bundled Material Symbols icon font; the app does not fetch interface fonts from Google

Full policy: [SECURITY.md](SECURITY.md)

---

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
| Security policy | [SECURITY.md](SECURITY.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| AI agent instructions | [AGENTS.md](AGENTS.md) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Check [open issues](https://github.com/fire-tools-inc/app/issues), fork, branch, and submit a PR.

---

## License

[MIT](LICENSE)

---

## Support

- 🐛 [Report a bug](https://github.com/fire-tools-inc/app/issues/new?template=bug_report.yml)
- ✨ [Request a feature](https://github.com/fire-tools-inc/app/issues/new?template=feature_request.yml)
- 🎨 [UX/UI suggestion](https://github.com/fire-tools-inc/app/issues/new?template=ux_ui_suggestion.yml)
- 💬 [SUPPORT.md](SUPPORT.md)

You can also report bugs from the app: **Settings → Support & Feedback**.
