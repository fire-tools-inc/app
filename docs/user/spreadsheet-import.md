# Spreadsheet import

Backfill years of history from an Excel workbook (`.xlsx`) instead of typing
every month by hand. One import can fill the Net Worth Tracker, the Expense
Tracker, Asset Allocation and the FIRE calculator. Everything is parsed on your
device; the file is never uploaded.

## Where to find it

- **Net Worth Tracker > Data Management > Import spreadsheet (XLSX)**
- **Settings > Data > Import spreadsheet**

Both places also offer **Download template**. Imports are disabled in the
read-only web demo; the template download still works there.

## Workflow

1. Download the template, or use an existing workbook with one sheet per year
   (see [Supported layouts](#supported-layouts)).
2. Fill it yourself, or give the [AI agent prompt](./spreadsheet-import-agent-prompt.md)
   and your statements to an AI assistant (the dialog's **Copy AI prompt**
   button copies it).
3. Choose the file. The preview lists the year sheets, the period, how many
   months, income and spending entries it found, ignored sheets and notes
   about skipped rows.
4. Check **Totals match the workbook for X of Y months**. When a workbook has a
   net worth total row, Fire Tools compares it with the total it will compute
   and lists the months that differ, as a percentage. If the workbook's totals
   leave its pensions out, the preview says so and the Net Worth Tracker keeps
   tracking pensions without adding them to net worth. Only imported months
   change this; **Count pensions in net worth** below the summary cards turns
   it back on.
5. Pick what to import and how to treat months that already contain your data,
   then select **Import**. Nothing is saved before this step.

Export a JSON backup in **Settings > Data** before large imports.

## What gets imported

| Workbook data | Destination |
| --- | --- |
| Holdings, cash, pensions, debts and taxes per month | Net Worth Tracker monthly snapshots; past months are marked finalized |
| History sheet totals for months without a year sheet | One "Net worth (imported total)" asset per month, so charts start earlier |
| Notes from the History sheet | The month note |
| Income rows | Expense Tracker income entries (source guessed from the name) |
| Expense/spending rows | Expense Tracker expenses (category guessed from the name, otherwise *No Category*) |
| Tax paid rows | *Tax Paid* operations in the Net Worth Tracker |
| Latest month holdings plus the Allocation sheet | Asset Allocation holdings, class targets and holding targets (targets alone update your existing holdings) |
| Target spending, withdrawal rate and latest net worth | FIRE calculator spending at FIRE, withdrawal rate and current portfolio (pensions excluded) |

### Currencies

The Net Worth Tracker stores every amount in your default currency. Each row
keeps its own currency in the workbook and is converted on import with that
month's exchange-rate rows (for example `EURUSD`). Without a rate, your
fallback rates from **Settings > Currency** are used and the preview says so.
Rows in unsupported currencies are skipped with a note.

### Shares and prices

A holding becomes *units × price* when the workbook provides units: a
**Shares** row with the same ticker, or a value formula such as `=E40*25`
that multiplies a price row. Only then does the holding keep its ticker, so a
later price refresh cannot turn a total value into the price of one share.
Other holdings are imported as their monthly value.

### Months that already contain data

- **Keep my data** (default) leaves months that contain entries you added
  untouched and fills the rest.
- **Replace with the spreadsheet values** overwrites, for those months, the
  Net Worth categories the workbook provides (debts stay if the workbook has
  no debt rows; your operations are kept). In the Expense Tracker it replaces
  a month's whole income or expense list when the workbook has rows of that
  kind for the month.

The preview counts the overlapping months for both trackers, and the result
shows how many months were kept.

Entries created by an import are recognised on the next import, so importing
the same workbook again refreshes them instead of duplicating them.

## Supported layouts

### Fire Tools template

| Sheet | Contents |
| --- | --- |
| `README` | Instructions, category list and the AI prompt. Ignored on import. |
| `Example` | A fictional, filled year. Ignored on import. |
| `2026` (any year) | Header `Category`, `Name`, `Ticker`, `Currency`, `Jan` … `Dec`, `Notes`, one row per item. |
| `History` | `Month` (`YYYY-MM`), `Net worth`, `Currency`, `Notes` for older months with only a total. |
| `Allocation` | `Asset class`, `Ticker`, `Name`, `Target mode` (`PERCENTAGE`, `SET`, `OFF`), `Target %`, `Target amount`. |

Rules:

- Name year sheets with the year only. Copy the year sheet for earlier years.
- Enter month-end balances, or the month total for income and spending.
  Leave unknown months empty.
- Debts and taxes owed are negative numbers. A positive **Tax** value is a
  refund due to you and is imported as cash.
- Do not add total rows; rows named "Total…" are skipped.
- **Net worth** rows are only used to check the import.
- Target percentages accept `40`, `0.4` or `40%`. Values up to 1 are fractions.

The full category list is on the template's README sheet and in the
[AI agent prompt](./spreadsheet-import-agent-prompt.md).

### Month-column personal finance workbooks

Workbooks that already track one year per sheet usually work as they are:

- A header row with twelve month columns (English, Italian, German, French or
  Spanish names, `YYYY-MM` or dates) and a currency column such as `Curr`.
- Section header rows (a label with no values) such as *Assets*, *ETFs*,
  *Stocks*, *Bonds*, *Crypto*, *Private equity*, *Cash*, *Taxes*, *Valuables*
  or *Extras*, *Debts*, *Pension*, *Cash flow* or *Income*, *Prices* or
  *Finance* (unit prices and exchange rates), *Summary* and *FIRE*.
- Subtotal rows are skipped when their name says so (for example
  "Subtotal" or "(auto)") or when their formula adds other imported rows. A
  `Net worth (EUR)` or `NW (EUR)` row is used for the total check; change and
  percentage rows are ignored. When that row has values, it also decides which
  months exist: months with an empty total (for example future months that
  only carry formulas forward) are skipped.
- A history sheet needs a month/date column and a `Net worth` or currency
  code column. Generic `Total`/`Amount` headers count only when the sheet name
  contains *History*, so transaction lists are not mistaken for totals.
- Sheets named *Deprecated*, *Example*, *Sample* or *README* are ignored.

Formulas are not recalculated: Fire Tools reads the values your spreadsheet
application saved. Save the file in Excel, LibreOffice or Numbers, or download
it from Google Sheets as `.xlsx`, after the values are up to date.

## Yearly expenses workbook

Bring in one year of detailed spending at a time:
**Expense Tracker > Data Management > Import expenses (XLSX)**, or
**Settings > Data**. **Download expenses template** creates a workbook for the
selected year whose README lists your categories, including your own.

| Part | Format |
| --- | --- |
| File | One workbook per year. The year is read from the file name (for example `Expenses 2026.xlsx`); you can change it in the preview. |
| Sheets | One per month named `Jan` … `Dec` (or the month name in another supported language, or `2026-01`). Other sheets, such as summaries and charts, are ignored. |
| Columns | A header row with `Amount` plus `Expense name` (or the column left of `Amount`), and optional `Category`, `Type`, `Day`, `Currency` and `Notes`. |
| Type | `Need` or `Want`; empty uses the category default. `Income` rows become income entries. |
| Income | Without Income rows, a labelled cell beside the table such as `Income` or `Monthly income` with the amount to its right becomes the month's income. |

How rows are imported:

- Rows without a name or with an amount of 0 are skipped; negative amounts
  are skipped with a note. Amounts are taken as saved, including formulas.
- Each expense is dated on its `Day`, or the 1st of the month.
- Categories match your existing categories by name, then common synonyms
  (for example *Transport*, *Charity*, *Other*). Any other name becomes a custom
  category with its own color, so your grouping is preserved. The preview
  lists new categories before you import.
- Months after the current month are skipped, so prefilled upcoming bills are
  not recorded as spent.
- **Keep my data** skips months that contain expenses you entered yourself;
  **Replace** overwrites them. Income only fills months without income unless
  you replace, so detailed income from a net worth import is not replaced by
  a single total.
- These detailed expenses replace the single monthly spending total that a
  net worth workbook import adds, and a later net worth import keeps them.
  Importing the same expenses workbook again refreshes it without duplicates.

Use the [expenses AI agent prompt](./expense-import-agent-prompt.md) (also in
the template README and the dialog's **Copy AI prompt**) to turn bank or card
statements into this format.

## Investment operations workbook

Record your trades and investment cash events: **Net Worth Tracker > Data
Management > Import operations (XLSX)**, or **Settings > Data**. **Download
operations template** gives a ledger with README, a fictional example and an
empty `Operations` sheet.

| Column | Meaning |
| --- | --- |
| `Date` | Trade or payment date: a spreadsheet date, `YYYY-MM-DD`, or `DD/MM/YYYY` (read day-first; dates that could be either are listed in the notes). |
| `Action` | `BUY` (also IPO or subscription), `SELL`, `DIVIDEND`, `FEE`, `TAX` or `TRANSFER`. |
| `Name`, `Ticker`, `ISIN` | Identify the security. Ticker or ISIN links operations to holdings. |
| `Quantity`, `Price`, `Fee` | Units, unit price and broker fee. Separate `Price (buy)`/`Price (sell)` and `Fee (buy)`/`Fee (sell)` columns also work. |
| `Amount` | Total for dividends, fees, taxes and transfers, or instead of quantity × price. |
| `Currency`, `FX rate` | Currency of price and amount; FX rate is units of your Fire Tools currency per unit of it on that date. Without it your fallback rates are used. |
| `Broker`, `Exchange`, `Notes` | Optional; kept in the operation note. |

The header row may sit below notes rows, and calculated columns (current
price, P/L) are ignored.

What the import does:

- Each operation is added to the Net Worth month of its date, as a purchase,
  sale, dividend, tax paid, transfer or other operation, with quantity, price,
  fee and broker in its note. Purchases include the fee; sales and dividends
  are net of it.
- Operations are only recorded in months that already exist, so import your
  net worth history first. The preview counts operations without a month.
- **Update average cost** sets the acquisition price of a holding to the
  ledger's average cost per unit (fees included, reduced proportionally on
  sales) when the holding's quantity matches the ledger within 1%. It also
  fills a missing ISIN, in Net Worth months and in Asset Allocation.
- Importing again replaces earlier imported operations and keeps operations
  you entered yourself. A later net worth workbook refresh keeps them too,
  but resets acquisition prices, so import operations after net worth.

Use the [investment operations AI agent prompt](./operations-import-agent-prompt.md)
to build the ledger from broker statements.

## Troubleshooting

| Message | Fix |
| --- | --- |
| *This file is not an .xlsx workbook* | Save as *Excel Workbook (.xlsx)*; `.xls`, `.ods`, `.numbers` and CSV are not read. |
| *No year sheets, history or allocation data were found* | Rename year sheets to the year only and check the Jan–Dec header row. |
| *No month sheets (Jan–Dec) with an Amount column and expenses were found* | For the expenses workbook, name sheets after months and add an `Amount` header. |
| *No operations found* | For the operations workbook, add `Date` and `Action` headers. |
| A month differs from the workbook total | Look for typed-in totals, numbers stored as text (for example `1250,40`) or the same money counted twice. Fire Tools imports the number even when the spreadsheet stored it as text. |
| Unknown category | Use one of the template categories. |
