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
   and lists the months that differ, as a percentage.
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

## Troubleshooting

| Message | Fix |
| --- | --- |
| *This file is not an .xlsx workbook* | Save as *Excel Workbook (.xlsx)*; `.xls`, `.ods`, `.numbers` and CSV are not read. |
| *No year sheets, history or allocation data were found* | Rename year sheets to the year only and check the Jan–Dec header row. |
| A month differs from the workbook total | Look for typed-in totals, numbers stored as text (for example `1250,40`) or the same money counted twice. Fire Tools imports the number even when the spreadsheet stored it as text. |
| Unknown category | Use one of the template categories. |
