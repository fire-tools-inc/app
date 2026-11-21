# Spreadsheet import: AI agent prompt

Copy everything below the line into ChatGPT, Copilot, Claude or another AI
assistant, then attach your source files (bank or broker statements, CSV
exports, an old spreadsheet, screenshots). Review the result before importing
it into Fire Tools. Remove account numbers and other identifiers you do not
want to share with the assistant.

---

You are helping me build a Fire Tools net worth workbook (.xlsx) from the
files I attach. Fire Tools imports it to backfill my monthly net worth
history, cash flow, asset allocation targets and FIRE settings.

## Output

Create one .xlsx file. If you cannot create files, output each sheet as a CSV
code block with its sheet name as the heading so I can paste it into the
Fire Tools template.

## Year sheets (required)

- One sheet per calendar year, named with the four-digit year only, for
  example `2024`.
- Row 1 headers, in this order: `Category`, `Name`, `Ticker`, `Currency`,
  `Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`, `Aug`, `Sep`, `Oct`,
  `Nov`, `Dec`, `Notes`.
- One row per account, holding, liability or cash-flow item. Keep the same
  `Name` for the same item in every month and year.
- Month cells contain numbers only: no currency symbols, no formulas, no
  text. Use a dot as decimal separator. Leave a cell empty when the value is
  unknown; never guess or interpolate.
- Balances are month-end values. Cash flow rows are the month's total.
- `Currency` is a three-letter code: EUR, USD, GBP, CHF, JPY, AUD or CAD.
  Keep the original currency of each account; do not convert amounts.
- `Ticker` is optional. Use the Yahoo Finance symbol when known, for
  example `EXMP.DE` (fictional). For Shares and Price rows it links the row to its
  holding.
- `Notes` is optional free text, for example the source document.

### Categories

Use exactly one of these values in the `Category` column:

| Category | Use for | Sign |
| --- | --- | --- |
| ETF | Exchange-traded or index funds holding shares | positive market value |
| Stock | Individual shares | positive market value |
| Bond ETF | Bond or money-market funds | positive market value |
| Bond | Individual bonds | positive market value |
| Crypto | Crypto assets | positive market value |
| Private equity | Unlisted companies, own business equity | positive value |
| Real estate | Property market value | positive value |
| Commodity | Gold and other commodities | positive value |
| Vehicle | Cars, motorbikes, boats | positive value |
| Collectible | Watches, wine, collections | positive value |
| Art | Art | positive value |
| Other asset | Anything else you own | positive value |
| Cash | Current or checking accounts, physical cash | balance |
| Savings | Savings and deposit accounts | balance |
| Brokerage cash | Uninvested cash at a broker | balance |
| Pension | Pension pots; include state, employer or private in the name | positive value |
| Debt | Mortgages, loans, credit card balances | negative balance |
| Tax | Taxes owed (negative) or refunds due to me (positive) | signed |
| Income | Money received in the month: salary, freelance, dividends, rent, benefits | positive |
| Expense | Money spent in the month, one row per spending category or one "Monthly spending" row | positive |
| Tax paid | Taxes paid in the month | positive |
| Shares | Number of units held for the row's Ticker | positive |
| Price | Unit price for the row's Ticker, in the row's Currency | positive |
| FX | Exchange rate; Name is a pair such as `EURUSD`, meaning 1 EUR = value USD | positive |
| Net worth | Total net worth reported by a source, used only as a check | signed |
| Target spending | Monthly spending I plan for after financial independence | positive |
| Withdrawal rate | Desired withdrawal rate in percent, for example 3.5 | positive |

Rules:

- Give a holding a `Shares` row with the same `Ticker` when the statement
  shows units. Fire Tools then derives the unit price and can refresh it.
- Do not add total or subtotal rows. Rows whose name starts with "Total"
  are skipped.
- Do not count the same money twice. For example, a pension invested in
  funds is either one `Pension` row or several asset rows, never both.
- Add `FX` rows when the sources show month-end exchange rates for the
  currencies used. Otherwise Fire Tools uses its own rates.

## History sheet (optional)

A sheet named `History` for older months where only a total is known.
Headers: `Month`, `Net worth`, `Currency`, `Notes`. `Month` uses `YYYY-MM`.
Do not repeat months that already have a year sheet row breakdown.

## Allocation sheet (optional)

A sheet named `Allocation` with my target asset allocation.
Headers: `Asset class`, `Ticker`, `Name`, `Target mode`, `Target %`,
`Target amount`.

- Asset class: Stocks, Bonds, Cash, Crypto, Real estate or Commodities.
- Leave `Ticker` and `Name` empty for a class-level target (share of the
  whole portfolio). Fill one of them for a holding-level target (share of
  its class).
- Target mode: `PERCENTAGE` with `Target %`, `SET` with a fixed
  `Target amount`, or `OFF` to exclude.

## Before you answer

1. List every source you used and the months it covers.
2. List assumptions, skipped items and values you could not determine.
3. Check that each month's balances add up to any reported total.
4. Never invent accounts, values, tickers or exchange rates.
