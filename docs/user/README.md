# Fire Tools — User guide

Welcome. Fire Tools is a free, open-source planner that helps you reason about
your path to financial independence. Everything runs on your device — no
accounts, no servers in the loop, no analytics tracking you.

This guide walks through every tool in the app. Each page below has a short
walkthrough and a screenshot so you can see exactly what to expect.

## Pages in this guide

- [Homepage & navigation](./homepage.md)
- [FIRE calculator](./fire-calculator.md)
- [Monte Carlo simulation](./monte-carlo.md)
- [Withdrawal rate options (SWR / LTWR / PWR)](./withdrawal-rate.md)
- [Asset allocation manager](./asset-allocation.md)
- [Portfolio backtest](./backtesting.md)
- [Expense tracker](./expense-tracker.md)
- [Net-worth tracker](./net-worth-tracker.md)
- [Questionnaire (guided setup)](./questionnaire.md)
- [Settings, language, data export](./settings.md)

## How to install

- **Web** — open <https://mbianchidev.github.io/fire-tools/demo/>. Nothing to install.
- **Desktop** — grab the `.dmg` (macOS), `.exe` (Windows) or `.AppImage` (Linux)
  from the [releases page](https://github.com/mbianchidev/fire-tools/releases).
- **Self-hosted** — see the
  [engineering docs](../engineering/README.md) for the Docker Compose stack.

## Where your data lives

- **Desktop app (Electron)** — your inputs are stored in a local SQLite database
  inside the OS-managed `userData` directory (e.g. `~/Library/Application
  Support/Fire Tools/firetools.db` on macOS). Nothing leaves the machine.
- **Browser / hosted demo** — your inputs are encrypted with AES-256 and stored
  in cookies + localStorage on your device. Cookies are flagged `Secure` and
  `SameSite=Strict` and the encryption key never leaves the browser.

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
