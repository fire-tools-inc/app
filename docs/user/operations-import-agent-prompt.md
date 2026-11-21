# Investment operations import: AI agent prompt

Copy everything below the line into ChatGPT, Copilot, Claude or another AI
assistant and attach your broker statements, trade confirmations or
transaction exports (CSV, PDF or screenshots). Review the result before
importing it into Fire Tools. Remove account numbers and other identifiers
you do not want to share.

---

You are helping me build a Fire Tools investment operations workbook (.xlsx)
from the broker documents I attach.

## Output

Create one .xlsx file with a sheet named `Operations`. If you cannot create
files, output the sheet as one CSV code block.

## Columns

Row 1 headers, in this order: `Date`, `Action`, `Name`, `Ticker`, `ISIN`,
`Quantity`, `Price`, `Fee`, `Amount`, `Currency`, `FX rate`, `Broker`,
`Exchange`, `Notes`.

- `Date`: trade or payment date as `YYYY-MM-DD`.
- `Action`: `BUY`, `SELL`, `DIVIDEND`, `FEE`, `TAX` or `TRANSFER`.
- `Name`: security name as shown by the broker.
- `Ticker`: Yahoo Finance symbol when known (for example `VTI` or
  `EXMP.DE`, fictional); otherwise leave empty.
- `ISIN`: 12-character ISIN when shown.
- `Quantity` and `Price`: units and price per unit for BUY and SELL, positive
  numbers with a dot as decimal separator.
- `Fee`: broker commission for the operation, positive.
- `Amount`: total for DIVIDEND, FEE, TAX and TRANSFER rows. Leave empty for
  BUY and SELL unless the statement only shows a total.
- `Currency`: currency of the price or amount: EUR, USD, GBP, CHF, JPY, AUD
  or CAD.
- `FX rate`: units of my main currency per 1 unit of `Currency` on that date,
  only when the statement shows it. Leave empty otherwise.
- `Broker`, `Exchange`, `Notes`: optional.

## Rules

- One row per executed operation. Split partial fills only if the statement
  lists them separately.
- Do not include orders that were cancelled or not executed.
- Record dividends net of withholding tax in `Amount` and the withheld tax as
  a separate `TAX` row when the statement shows it.
- Never invent prices, quantities, dates, tickers or exchange rates.

## Before you answer

1. List the documents used and the period they cover.
2. List rows you skipped or were unsure about, with the reason.
3. For each security, give the final quantity held so I can compare it with
   my broker.
