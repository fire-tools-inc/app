# Expenses import: AI agent prompt

Copy everything below the line into ChatGPT, Copilot, Claude or another AI
assistant and attach one year of bank or card statements (CSV, PDF or
screenshots). Review the result before importing it into Fire Tools. Remove
account numbers and other identifiers you do not want to share.

---

You are helping me build a Fire Tools yearly expenses workbook (.xlsx) from
the statements I attach.

## Output

Create one .xlsx file named `Expenses <year>.xlsx`. If you cannot create
files, output one CSV code block per month with the month name as heading.

## Sheets

- One sheet per month, named `Jan`, `Feb`, `Mar`, `Apr`, `May`, `Jun`, `Jul`,
  `Aug`, `Sep`, `Oct`, `Nov`, `Dec`. Leave months without data empty.
- Row 1 headers, in this order: `Expense name`, `Amount`, `Category`, `Type`,
  `Day`, `Currency`, `Notes`.

## Rows

- One row per transaction or per recurring bill.
- `Expense name`: a short merchant or purpose, e.g. "Supermarket".
- `Amount`: a positive number with a dot as decimal separator, no symbols.
  Skip refunds and transfers between my own accounts.
- `Category`: reuse the categories I list below when they fit; otherwise use
  a short, consistent name. Use the same name for the same kind of spending
  every month.
- `Type`: `Need` (housing, utilities, groceries, insurance, transport to
  work), `Want` (dining out, entertainment, hobbies, travel) or `Income` for
  money received (salary, refunds from employers, side income).
- `Day`: day of the month (1-31) from the statement.
- `Currency`: three-letter code only when it differs from my main currency:
  EUR, USD, GBP, CHF, JPY, AUD or CAD.
- `Notes`: optional, for example the statement the row came from.

## Before you answer

1. List the statements and months you used.
2. List skipped transactions (transfers, refunds) and anything uncertain.
3. Give each month's total so I can compare it with my statements.
4. Never invent transactions, amounts or categories that are not supported
   by the statements.

My categories: <paste the category list from the template README>
