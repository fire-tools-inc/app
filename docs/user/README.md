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
- [Spreadsheet import and templates](./spreadsheet-import.md) (AI agent prompts: [net worth](./spreadsheet-import-agent-prompt.md), [expenses](./expense-import-agent-prompt.md), [investment operations](./operations-import-agent-prompt.md))
- [Questionnaire (guided setup)](./questionnaire.md)
- [Use Fire Tools with an AI agent](./ai-agents.md)
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

### macOS Gatekeeper

Download the macOS DMG or ZIP from the
[official releases](https://github.com/fire-tools-inc/app/releases). Open the
DMG or extract the ZIP, then move **Fire Tools.app** into **Applications**
before opening it.

If macOS blocks the app, verify that your download came from the official
releases above and that you trust it. Only then open **Terminal** and run:

```sh
xattr -dr com.apple.quarantine "/Applications/Fire Tools.app"
```

Reopen **Fire Tools** from Applications. This removes the quarantine attribute
from this app only, bypassing its downloaded-app quarantine checks. Never use
this command for an untrusted download or disable Gatekeeper globally.

## Where your data lives

- **Database** - SQLite inside the desktop's `userData` directory or a
  self-hosted volume holds your settings, FIRE calculator, asset allocation,
  cashflow and net worth, plus receipt originals. Changes made through its API,
  for example by an [AI agent](./ai-agents.md), appear in the app within
  seconds. A PostgreSQL driver is not implemented.
- **This device** - an encrypted copy of that data and any changes not yet
  saved to the database. In a browser without a backend this copy is the only
  store. Scenarios, debt payoff plans and notifications stay on the device.

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
