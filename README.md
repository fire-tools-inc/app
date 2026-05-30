# Fire Tools

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19.0-brightgreen)](package.json)

A comprehensive suite of financial tools for **FIRE (Financial Independence Retire Early)** planning. Track your journey to financial independence with powerful calculators, Monte Carlo simulations, and portfolio management features—all running securely in your browser with **no data ever leaving your device**.

## ⚠️ Disclaimer

Fire Tools is provided for **educational and planning purposes only**. The calculations and projections:

- Make assumptions about future market returns
- Do not account for all real-world factors
- Are not financial, legal, or tax advice
- Should not be the sole basis for financial decisions

**Always do your research or consult with a qualified financial advisor before making investment decisions.**

### Market Data Disclaimer

Fire Tools fetches live asset prices and exchange rates from **Yahoo Finance** through a community open-source integration. This data is provided **as an indication only**:

- Prices may be **delayed, incomplete, or inaccurate**
- We take **no responsibility** for wrong or delayed market data
- The Yahoo Finance API is **not officially endorsed** by Yahoo and may **stop working at any time** without notice
- This is a community-discovered endpoint, not a supported commercial API
- **Always verify prices** with your broker or a professional financial data provider before making investment decisions

### Rate Limits

To avoid overloading the Yahoo Finance API, Fire Tools enforces the following limits:

| Limit | Value | Description |
|-------|-------|-------------|
| **Per-request throttle** | 1 second | Minimum delay between consecutive API calls |
| **Daily budget** | 500 requests | Maximum requests per calendar day (resets at midnight) |

When limits are reached, the app gracefully falls back to the last known prices and hardcoded default exchange rates. You can check the current rate-limit status in **Settings → Market Data**.

**[Try it live →](https://mbianchidev.github.io/fire-tools/demo/)**

---

## Features

**🧮 FIRE Calculator**  
Calculate your path to financial independence with detailed projections based on your savings, expenses, and expected returns. Visualize your net worth growth and see exactly when you'll reach your FIRE target.

**🎲 Monte Carlo Simulations**  
Run thousands of probabilistic simulations accounting for market volatility and black swan events. Understand your real probability of success and make informed decisions with confidence.

**📊 Asset Allocation Manager**  
Track your portfolio allocation across stocks, bonds, real estate, commodities, and cash. Get intelligent rebalancing recommendations to maintain your target allocation with customizable allocation targets and visual feedback.

**🍩 Portfolio Breakdown** *(experimental — disabled by default)*  
Slice your current portfolio across multiple dimensions — currency, holding, sector, continent, region, market (exchange), and ETF provider — to spot concentration risk and diversification gaps. Stock sector and exchange come from Yahoo Finance's anonymous search endpoint; stock country is derived from the ISIN prefix. For ETFs (where Yahoo's holdings endpoint requires authentication), the provider, region theme, and asset focus are inferred from the fund's name. Metadata is cached locally for 7 days to minimise API calls. Enable it under **Settings → Experimental Features**.

**📄 PDF Expense / Income Import** *(experimental — disabled by default)*  
Upload receipts, invoices, bank / credit-card statements, or payslips and the Expense Tracker turns them into editable transactions before they're committed. PDFs are parsed **fully in your browser** with `pdfjs-dist` — nothing is uploaded anywhere. An **optional**, opt-in OpenAI-compatible LLM step (OpenAI, Azure OpenAI, Ollama, LM Studio, OpenRouter, …) can re-categorize the parsed rows; only the extracted descriptions/amounts are sent, never the PDF bytes, and the heuristic results are used on any error. Enable under **Settings → Experimental Features**. Full details in [`docs/pdf-import.md`](docs/pdf-import.md).

**💵 DCA Helper**  
Plan your dollar-cost averaging strategy with built-in calculations that help you invest systematically and reduce market timing risk.

**💰 Cashflow Tracker**  
Track your income and expenses with detailed categorization, set monthly budgets per category, and monitor your spending patterns. Interactive charts showing income vs expenses over time. Includes the 50/30/20 budgeting rule analysis and comprehensive spending analytics with trends and comparisons.

**📈 Net Worth Tracker**  
Track your complete financial picture on a monthly basis. Log assets (stocks, ETFs, bonds), cash & liquidity (bank accounts, credit cards), and pensions (state, private, employer). Record financial operations like dividends, purchases, sales, and taxes. View historical net worth charts with YTD and all-time views, plus forecasts with confidence indicators.

**🔒 Privacy-First & Secure**  
All data is stored locally — a SQLite database in the desktop app, or AES-256-encrypted cookies in the browser. No servers, no accounts, no data transmission—complete privacy guaranteed.

**📥 Export & Import**  
Back up your data anytime with CSV export. Import previously saved data to restore your settings across devices or after clearing your local store.

**🌍 Multi-language UI**  
The interface ships in English (default), Italian, French, German, and Spanish. Change the language from **Settings → Language**; the choice is stored alongside your other (encrypted) preferences and is independent of the display currency. See [Internationalization (i18n)](#-internationalization-i18n) for coverage details.

**ℹ️ About / Build Info**
A built-in **Settings → About** section shows the running app version, the git commit hash the build was produced from (with a link to GitHub), the build timestamp, and the versions of major dependencies (React, Vite, Recharts, etc.). When the local backend is reachable, it also surfaces the backend's version and its own dependency set (Express, better-sqlite3, …) — useful for filing bug reports and confirming the frontend and backend are running the same release.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20.19.0 or higher (or 22.12.0+, 24.0.0+)
- **npm** (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/mbianchidev/fire-tools.git

# Navigate to the directory
cd fire-tools

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open your browser to `http://localhost:5173` and start planning your FIRE journey!

#### Serving landing + docs + OpenAPI together (mirrors GitHub Pages)

`npm run dev` only serves the SPA. To preview the landing page, OpenAPI
viewer and user/engineering docs at the same paths they get on Pages:

```bash
npm run dev:all
```

That builds `website/`, `docs/api/openapi.yaml` and `docs/{user,engineering}/`
into `.dev-pages/` (gitignored) and serves them alongside Vite at:

- Landing — http://localhost:5173/
- Demo SPA — http://localhost:5173/demo/
- OpenAPI — http://localhost:5173/api/
- Docs index — http://localhost:5173/docs/
- User docs — http://localhost:5173/docs/user/
- Engineering docs — http://localhost:5173/docs/engineering/

Sources are watched and rebuilt on change.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Run locally with Docker (backend + frontend)

A self-hosted stack is wired in [`docker-compose.yml`](docker-compose.yml).
Backend (Node + SQLite) + frontend (Vite SPA served via nginx + `/api` proxy):

```bash
docker compose build --no-cache
docker compose up -d
# UI:  http://localhost:8080
# API: http://localhost:8080/api/v1/health
```

The backend implements the full OpenAPI contract against SQLite. Migrations
are forward-only SQL files run automatically on boot. Full guide:
[`docs/deployment/README.md`](docs/deployment/README.md). Tracks
issues [#129](https://github.com/mbianchidev/fire-tools/issues/129) and
[#195](https://github.com/mbianchidev/fire-tools/issues/195).

### Desktop app (Electron)

A hardened Electron wrapper is in [`electron/`](electron/) (issue
[#132](https://github.com/mbianchidev/fire-tools/issues/132)). Build
installers for macOS / Windows / Linux:

```bash
npm install
npm run electron:dist   # produces installers under release/
```

The desktop build feels native rather than browser-like: it boots directly
into the FIRE Calculator, hides the decorative web header, ships a
platform-aware native menu (File / Edit / Navigate / View / Window / Help)
with `⌘1..6` tool shortcuts, persists window size/position across launches,
and uses macOS' `hiddenInset` title bar. A single-instance lock protects
the embedded SQLite DB. See [`electron/README.md`](electron/README.md) for
the full menu map, preload bridge API, and signing/notarization details.


### Landing page

Marketing landing page lives in [`website/`](website/) (issue
[#138](https://github.com/mbianchidev/fire-tools/issues/138)) and is
copied to `dist/` (the site root) as a `postbuild` step. The OpenAPI ReDoc
viewer is published next to it at `dist/api/`, and the user / engineering
guides are rendered from the markdown in [`docs/user/`](docs/user/) +
[`docs/engineering/`](docs/engineering/) into `dist/docs/{user,engineering}/`.
The SPA (Vite build) sits under `dist/demo/`.

### Published documentation paths (GitHub Pages)

| Path                                  | What you get                                            | Source                                  |
|---------------------------------------|---------------------------------------------------------|-----------------------------------------|
| `/fire-tools/`                        | Marketing landing page + download links                 | [`website/`](website/)                  |
| `/fire-tools/demo/`                   | The single-page app (read-only demo)                    | `src/`                                  |
| `/fire-tools/api/`                    | OpenAPI 3.0.3 reference (ReDoc)                         | [`docs/api/openapi.yaml`](docs/api/openapi.yaml) |
| `/fire-tools/docs/user/`              | End-user how-tos (with screenshots)                     | [`docs/user/`](docs/user/)              |
| `/fire-tools/docs/engineering/`       | Backend deploy, custom client, migrations, schema       | [`docs/engineering/`](docs/engineering/) |

Regenerate the user-docs screenshots after material UI changes:

```bash
npx playwright install chromium   # first time only
npm run build                     # produces SPA bundle for the dev server route table
npm run docs:screenshots          # writes docs/user/screenshots/*.png
```

### Mobile

The mobile app is intentionally a **separate Flutter repo**
(`fire-tools-mobile`) that consumes the same OpenAPI contract. Rationale
+ stack choice in [`docs/mobile/README.md`](docs/mobile/README.md). Tracks
issue [#134](https://github.com/mbianchidev/fire-tools/issues/134).

---

## Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to the project
- **[AGENTS.md](AGENTS.md)** - Technical architecture and AI agent instructions
- **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** - Community guidelines
- **[SECURITY.md](SECURITY.md)** - Security policy and vulnerability reporting
- **[SUPPORT.md](SUPPORT.md)** - Getting help and support
- **[docs/api/](docs/api/)** - OpenAPI contract for the local-deployment backend (also published at `/fire-tools/api/` on Pages)
- **[docs/database/](docs/database/)** - Database schema (SQLite-first, Postgres-compatible)
- **[docs/deployment/](docs/deployment/)** - Docker Compose deployment guide
- **[docs/user/](docs/user/)** - End-user guides (published at `/fire-tools/docs/user/`)
- **[docs/engineering/](docs/engineering/)** - Backend deploy, custom client, schema, migrations (published at `/fire-tools/docs/engineering/`)
- **[docs/mobile/](docs/mobile/)** - Flutter mobile app plan (separate repo)
- **[electron/README.md](electron/README.md)** - Desktop app build, signing, security posture
- **[server/README.md](server/README.md)** - Local-deployment backend (Node + Express + SQLite)
- **[docs/pdf-import.md](docs/pdf-import.md)** - PDF expense/income import (experimental)

---

## Architecture & APIs

Fire Tools ships in two storage flavours:

- **Desktop app (Electron)** — bundles a local Node/Express backend in-process
  and stores everything in a real SQLite database under the OS `userData`
  directory. This is the recommended way to use Fire Tools.
- **Browser / hosted demo** — pure client-side, with state held in
  AES-256-encrypted cookies (plus a `localStorage` fallback) so the app stays
  fully functional even without a backend.

The local-deployment backend (Docker / Electron) implements the full OpenAPI
contract against SQLite, with forward-only migrations applied automatically on
boot:

- **OpenAPI 3.0.3 spec**: [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — see [`docs/api/README.md`](docs/api/README.md)
- **Database schema**: [`docs/database/schema.sql`](docs/database/schema.sql) — **SQLite is the first-class target**, **PostgreSQL is fully compatible**. See [`docs/database/README.md`](docs/database/README.md).
- **Backend**: [`server/`](server/) — Node + Express + better-sqlite3, full OpenAPI implementation.
- **Docker stack**: [`docker-compose.yml`](docker-compose.yml) + [`docs/deployment/README.md`](docs/deployment/README.md).
- **Desktop wrapper**: [`electron/`](electron/) — hardened Electron, code-sign-ready. **Bundles the backend in-process** so the desktop app needs no separate server; SQLite lives at the OS userData path (`~/Library/Application Support/fire-tools/firetools.db` on macOS, `%APPDATA%\fire-tools\firetools.db` on Windows, `~/.config/fire-tools/firetools.db` on Linux). You can also point the app at a separately-running backend via **Settings → Backend → Custom URL**.

Both contract files cover every feature currently shipped (FIRE calculator,
asset allocation, expense / income tracker, net worth tracker, notifications,
questionnaire, PDF import, portfolio breakdown, banks lookup).

Single-user by default; the schema and API are already multi-tenant-ready
(see [`docs/database/README.md`](docs/database/README.md#multi-tenant-migration-path)).

Tracking issues: [#133](https://github.com/mbianchidev/fire-tools/issues/133) (this work),
[#189](https://github.com/mbianchidev/fire-tools/issues/189),
[#195](https://github.com/mbianchidev/fire-tools/issues/195),
[#222](https://github.com/mbianchidev/fire-tools/issues/222).

---

## Technology Stack

### Frontend (today, shipping)
- **React 19** - Modern UI framework with hooks
- **TypeScript** - Type-safe development
- **React Router** - Client-side routing
- **Vite** - Lightning-fast build tool
- **Recharts** - Beautiful data visualizations
- **crypto-js** - AES encryption for data security
- **js-cookie** + **localStorage** - Browser-mode persistence layer (the
  desktop app stores state in SQLite via the embedded backend instead)
- **react-i18next** + **i18next** - UI translation framework (EN / IT / FR / DE / ES)

### Backend ([`server/`](server/))
- **Node.js 22** + **Express 4** + **TypeScript** (strict, ESM)
- **better-sqlite3** for the first-class SQLite target
- **Docker Compose** orchestrates backend + frontend + optional Postgres profile
- REST API described in [`docs/api/openapi.yaml`](docs/api/openapi.yaml) (OpenAPI 3.0.3)
- DB schema in [`docs/database/schema.sql`](docs/database/schema.sql) — SQLite first-class, Postgres-compatible

### Desktop ([`electron/`](electron/))
- **Electron 33** with hardened defaults (contextIsolation, sandbox, no nodeIntegration)
- **electron-builder** producing `dmg` / `nsis` / `AppImage`

### Mobile (separate repo — see [`docs/mobile/README.md`](docs/mobile/README.md))
- **Flutter** consuming the same OpenAPI contract — lives in `fire-tools-mobile`.

---

## Security & Privacy

Fire Tools takes your privacy seriously:

- ✅ **Local-only by default** - Desktop app stores everything in a local
  SQLite database; browser mode keeps state in your browser. Nothing leaves
  your device unless you explicitly opt in.
- ✅ **AES-256 encryption (browser)** - Cookie-stored values are encrypted
  before being written
- ✅ **Secure cookies (browser)** - `SameSite=Strict` and `Secure` flags
  protect against attacks
- ✅ **Open source** - Full transparency, audit the code yourself

Learn more in our [Security Policy](SECURITY.md).

---

## 🌍 Internationalization (i18n)

Fire Tools ships with a built-in translation layer powered by
[`react-i18next`](https://react.i18next.com/).

**Supported languages**

| Code | Language |
| ---- | -------- |
| `en` | English (default & fallback) |
| `it` | Italian |
| `fr` | French |
| `de` | German |
| `es` | Spanish |

**Switching language** — open **Settings → Language**. The selection is
persisted to your local store (SQLite on desktop, encrypted cookie in browser
— `UserSettings.language`) and is **independent of the display currency**
(changing language never changes the currency, and vice versa).

**Where translations live**

```
src/i18n/
├── index.ts              # i18next bootstrap, setLanguage(), SUPPORTED_LANGUAGES
└── locales/
    ├── en.json           # baseline — every key must exist here first
    ├── it.json
    ├── fr.json
    ├── de.json
    └── es.json
```

All five locale files MUST contain the exact same set of keys. A test in
`tests/shared/i18n.test.ts` enforces this — missing or extra keys fail CI.

**Coverage** — every user-facing screen (homepage, FIRE Calculator, Monte
Carlo simulator, Asset Allocation Manager, Portfolio Breakdown, Net Worth
Tracker, Expense Tracker, Questionnaire, Settings, all dialogs, charts,
tables, tooltips, notifications, and validation messages) is fully
translated across all five locales. The only intentional exception is the
**legal copy** inside the Privacy Policy, Cookie Policy, and consent
modal bodies, which is kept English-only on purpose — those documents are
binding text and any locale-specific version must be authored, not
machine-translated. Any other untranslated string falls back to English
via the `fallbackLng: 'en'` configuration.

**Adding a new language**

1. Add the locale code to `SUPPORTED_LANGUAGES` in `src/i18n/index.ts`.
2. Add the code to the `LanguageCode` union in
   `src/utils/cookieSettings.ts`.
3. Copy `src/i18n/locales/en.json` to `src/i18n/locales/<code>.json` and
   translate the values (keep the keys identical).
4. Register the new resource in the `resources` map in
   `src/i18n/index.ts`.
5. Add a label entry (e.g. `common.dutch`) to **every** locale file and a
   matching entry in `LABEL_KEYS` inside
   `src/components/LanguageSelector.tsx`.
6. Run `npm test` — the parity test will fail if any key is missing.

**Adding a new translatable string**

1. Add the key to `src/i18n/locales/en.json` first.
2. Add a translation for the same key to `it.json`, `fr.json`, `de.json`,
   and `es.json`.
3. Use the `useTranslation()` hook in the component:
   ```tsx
   import { useTranslation } from 'react-i18next';
   const { t } = useTranslation();
   return <button>{t('my.new.key')}</button>;
   ```

---

## Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help makes Fire Tools better for everyone.

**To get started:**
1. Read our [Contributing Guide](CONTRIBUTING.md)
2. Check out [open issues](https://github.com/mbianchidev/fire-tools/issues)
3. Fork the repo and create a feature branch
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## Security

Found a security vulnerability? Please report it responsibly to **security@mb-consulting.dev**.  
See [SECURITY.md](SECURITY.md) for our security policy and disclosure process.

---

## Support

Need help? Have questions?

- 📖 Check the [documentation](#-documentation) above
- 🐛 [Report a bug](https://github.com/mbianchidev/fire-tools/issues/new?template=bug_report.yml) - Something not working?
- ✨ [Request a feature](https://github.com/mbianchidev/fire-tools/issues/new?template=feature_request.yml) - Have an idea?
- 🎨 [UX/UI suggestion](https://github.com/mbianchidev/fire-tools/issues/new?template=ux_ui_suggestion.yml) - Improve the experience
- 💬 See [SUPPORT.md](SUPPORT.md) for more support options

**Tip:** You can also report bugs directly from the app via **Settings → Support & Feedback**.

---

## 📋 Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to security@mb-consulting.dev.
