---
name: using-fire-tools
description: Operate a person's Fire Tools personal finance app through its local API. Onboard a new user (preferences, FIRE plan, investments and target allocation, net worth snapshot with cash, pensions and debts, income and expenses), log a month, categorize expenses and read data back. Use when someone asks an agent to set up, fill in, import into, update or review their Fire Tools data, FIRE plan, budget, cashflow or net worth.
license: MIT
compatibility: Needs the Fire Tools desktop app running with Settings > API access turned on, or a self-hosted Fire Tools backend URL and token. The helper script needs Node.js 18 or newer.
metadata:
  version: "1"
---

# Using Fire Tools

Fire Tools is a local-first FIRE (financial independence) planner. Its desktop
app stores data in a local SQLite database and serves a REST API on loopback.
Everything you write through the API appears in the open app within about
three seconds, no restart needed.

## Ground rules

- **Never print, paste or ask for the access token.** Call the API only through
  [`scripts/fire-tools-api.mjs`](scripts/fire-tools-api.mjs), which reads it
  from the app's connection file and refuses to send it anywhere but the local API.
- **Read only what the current step needs.** Everything you read goes to your
  model provider. Ask before reading full histories.
- **Confirm before writing.** Show a short summary (record counts, totals,
  months affected) and wait for a yes. Never delete or replace a whole domain
  without an explicit request.
- **Use the person's numbers.** Do not invent balances, returns or ages. Rough
  estimates are fine when the person gives them; say they are estimates.
- **Not financial advice.** Explain what the app shows; do not recommend
  specific securities.

## Connect

```sh
node scripts/fire-tools-api.mjs status
```

A JSON object with `instanceId` and five `domains` (settings, calculator,
assetAllocation, expenseTracker, netWorth) means you are connected. Otherwise
the script prints what the person has to do, usually: open Fire Tools, go to
**Settings > API access** and turn it on. A self-hosted backend works with
`FIRE_TOOLS_API_URL=https://host/api/v1` and `FIRE_TOOLS_API_TOKEN` in the
environment instead.

Other commands:

```sh
node scripts/fire-tools-api.mjs GET /state/netWorth
node scripts/fire-tools-api.mjs PATCH /state/expenseTracker @changes.json
node scripts/fire-tools-api.mjs new-id expense     # agent-expense-<uuid>
```

## Onboard a new user

Interview one topic at a time, accept rough numbers and write each topic before
moving on, so partial progress is saved. Check what already exists first
(`GET /state/<domain>`) and update rather than duplicate.

1. **Preferences**: account name, currency, country, language, number and date
   format. `PATCH /settings`.
2. **FIRE plan**: year of birth, annual expenses now and in retirement, labor
   income, savings rate, withdrawal rate, expected returns, pensions.
   `PUT /calculator/inputs` (send every field; read the current values first).
3. **Investments and targets**: each holding (name, ticker or ISIN, class,
   shares and price or total value, currency) and the target split per asset
   class. Asset Allocation holds the current portfolio:
   `PATCH /state/assetAllocation` and `PUT /asset-allocation/targets`.
4. **Net worth snapshot** for the current month: the same holdings, cash
   accounts, pensions, debts and unpaid taxes. Net Worth keeps monthly history:
   `PATCH /state/netWorth`.
5. **Cashflow**: income and expenses for recent months. Ask for a pasted list,
   a bank export or a spreadsheet; categorize with
   [the category guide](references/data-model.md#expense-categories).
   `PATCH /state/expenseTracker`.
6. **Optional**: monthly budgets per category.
7. **Verify**: read back totals per domain and ask the person to open the
   Dashboard and check it matches.

## Log a month

Mirror the app's **Log month** flow for a given month:

1. Income received (`incomes`).
2. Expenses (`expenses`), categorized, Need or Want per expense.
3. Investments: update shares and prices in that Net Worth month, add any
   purchases or sales as `operations`, and update Asset Allocation values when
   it is the current month.
4. Pension values for that month.
5. Summarize the month: income, expenses, savings rate, net worth change.

## How to write

- **One record**: granular routes such as `POST /expense-tracker/expenses`.
  Their bodies name the record id `externalId`. A second POST with the same id
  returns `409 conflict`; use `PUT .../{externalId}` to change it.
- **Many records**: `PATCH /state/<domain>` with a changeset. Entities use the
  app's own shapes with `id`, plus `year`, `month` and `position` where noted.
  Upserts are idempotent, so retrying the same changeset is safe.
- **Never** call `PUT /state/<domain>` (it replaces the whole domain) unless the
  person explicitly asks to replace everything.
- Mint ids with `new-id` and keep them so later updates hit the same record.

Exact routes, bodies and a worked onboarding example:
[references/api.md](references/api.md). Enums, categories and field rules:
[references/data-model.md](references/data-model.md).

## Data rules the API enforces

- Amounts are plain JSON numbers with a dot decimal (`1234.5`, not `"1.234,50"`).
  Expense and income amounts are non-negative.
- Dates are real calendar dates, `YYYY-MM-DD`.
- Currencies: `EUR`, `USD`, `GBP`, `CHF`, `JPY`, `AUD`, `CAD`.
- Enums are upper case (`STOCKS`, `NEED`, `SALARY`).

## Errors

All errors are `{ "error": { "code", "message", "details"? } }`.

| Status | Meaning | Do |
| --- | --- | --- |
| 400 `invalid_body` | A record failed validation; `details` names the collection, key and reason. Nothing was written. | Fix that record and resend. |
| 401 `unauthorized` | Token missing or revoked (API access was turned off, or the token was regenerated). | Rerun; the script rereads the token. If it persists, ask the person to check Settings > API access. |
| 404 `not_found` | Unknown route or record. | Check the path and id. |
| 409 `conflict` | The id already exists, or a scheduled occurrence is already recorded. | Update instead of creating. |
| 413 `payload_too_large` | Body over the limit. | Split the changeset by month. |
| 5xx | Server problem. | Stop and tell the person; do not retry in a loop. |
