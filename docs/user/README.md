# Fire Tools — User guide

Welcome. Fire Tools is a free, open-source planner that helps you reason about
your path to financial independence. It is local-first, without mandatory
accounts or analytics. Optional market/model requests and local OCR/backend
features have their own explicit configuration.

This guide walks through every tool in the app. Each page below has a short
walkthrough and a screenshot so you can see exactly what to expect.

## Pages in this guide

- [Dashboard & navigation](./homepage.md)
- [FIRE calculator](./fire-calculator.md)
- [Monte Carlo simulation](./monte-carlo.md)
- [Withdrawal rate options (SWR / LTWR / PWR)](./withdrawal-rate.md)
- [Asset allocation manager](./asset-allocation.md)
- [Portfolio backtest](./backtesting.md)
- [Expense tracker](./expense-tracker.md)
- [Cashflow planning, savings goals and offline rules](./cashflow-planning.md)
- [Net-worth tracker](./net-worth-tracker.md)
- [Questionnaire (guided setup)](./questionnaire.md)
- [Settings, language, data export](./settings.md)

## How to install

- **Desktop** — grab the `.dmg` (macOS), `.exe` (Windows) or `.AppImage` (Linux)
  from the [releases page](https://github.com/fire-tools-inc/app/releases).
- **Self-hosted** — see the
  [engineering docs](../engineering/README.md) for the Docker Compose stack.
- **Web demo** — try it instantly at
  <https://fire-tools-inc.github.io/app/demo/>. It's a read-only preview seeded
  with sample data (nothing you type is saved) — install the desktop app or
  self-host to keep your own data.

## Where your data lives

- **Renderer financial stores** — existing encrypted SafeCookies/localStorage
  stores remain authoritative for the tools. Cashflow history and planning use
  encrypted localStorage, including in Electron.
- **Local backend** — SQLite inside the desktop's `userData` directory or a
  self-hosted volume owns receipt originals and its API records. Its planning
  API is separate from the renderer snapshot; a PostgreSQL driver is not
  implemented.

The hosted [web demo](https://fire-tools-inc.github.io/app/demo/) is read-only:
it loads sample data and doesn't persist anything you type. Use the desktop app
or the self-hosted stack for real planning.

You can wipe everything from the [Settings page](./settings.md) — clearing
data is a single click.

## Currency, language, regional formatting

Currency and language are independent. Set currency once and switch language
on the fly — labels translate, your numbers don't get re-denominated. The
default language is English; Italian, French, German and Spanish ship in the
box.

## Sharing scenarios

The [FIRE calculator](./fire-calculator.md) serialises its inputs into the URL.
Copy the URL and send it — the recipient opens the same scenario without any
data leaving either device.
