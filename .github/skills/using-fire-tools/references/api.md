# Fire Tools API for agents

Base URL: `apiBaseUrl` from the discovery file (desktop) or
`FIRE_TOOLS_API_URL` (self-hosted), for example `http://127.0.0.1:53124/api/v1`.
Every route except `GET /health` needs `Authorization: Bearer <token>`; the
helper script adds it. Full contract: the OpenAPI document at
<https://fire-tools-inc.github.io/app/api/>.

## Discovery file (desktop)

Written only while the app runs with **Settings > Agent access** on, readable
by the current OS user only, removed when the app quits or access is turned off.

| OS | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Fire Tools/agent-api.json` |
| Windows | `%APPDATA%\Fire Tools\agent-api.json` |
| Linux | `~/.config/Fire Tools/agent-api.json` |

```json
{ "schemaVersion": 1, "app": "Fire Tools", "appVersion": "x.y.z",
  "apiBaseUrl": "http://127.0.0.1:53124/api/v1", "token": "<secret>",
  "pid": 12345, "startedAt": "...", "guideUrl": "...", "openapiUrl": "..." }
```

The token changes on every launch. Never copy it into chat or files.

## What the app shows

The app displays these five domains, and refreshes them within about three
seconds of any API write:

| Domain | Read everything | Batch write | Single-record routes |
| --- | --- | --- | --- |
| Preferences | `GET /state/settings` | `PATCH /state/settings` | `GET`, `PATCH /settings` |
| FIRE calculator | `GET /state/calculator` | `PATCH /state/calculator` | `GET`, `PUT /calculator/inputs` |
| Asset allocation | `GET /state/assetAllocation` | `PATCH /state/assetAllocation` | `/asset-allocation/assets[/{externalId}]`, `GET`, `PUT /asset-allocation/targets` |
| Cashflow (expenses and income) | `GET /state/expenseTracker` | `PATCH /state/expenseTracker` | `/expense-tracker/expenses[/{externalId}]`, `/expense-tracker/incomes[/{externalId}]`, `/expense-tracker/budgets`, `/expense-tracker/custom-categories` |
| Net worth | `GET /state/netWorth` | `PATCH /state/netWorth` | `/net-worth/months/{year}/{month}` and its `holdings`, `cash`, `pensions`, `debts`, `taxes`, `operations` |

Routes for questionnaire results, notifications, Monte Carlo runs and portfolio
metadata store data the app does not display yet. Do not use them to onboard
someone.

`GET /sync/status` returns each domain's `revision` (changes whenever the
domain changes) and whether it is `initialized`.

## State documents

`GET /state/<domain>` returns
`{ domain, instanceId, revision, initialized, data }`. `data` uses the app's own
shapes (see [data-model.md](data-model.md)) and is `null` for a domain nobody
has written yet.

## Changesets

`PATCH /state/<domain>` applies a changeset in one transaction. If any record is
invalid, nothing is written and the response is `400` with
`details: { collection, key, message }`.

```json
{
  "set":    { "<singleton>": { } },
  "upsert": { "<collection>": [ { } ] },
  "delete": { "<collection>": ["<key>"] }
}
```

Upsert inserts or replaces by key. `position` orders records inside their list
(0 first); omit it to append. Leaf records carry their month as `year` and
`month`; the month and year are created when missing.

| Domain | `set` | Collections (key) |
| --- | --- | --- |
| `settings` | `settings` (full preferences object) | none |
| `calculator` | `inputs` (all calculator fields) | none |
| `assetAllocation` | `assetClassTargets` | `assets` (`id`) |
| `expenseTracker` | `config`, `planning` | `years` (`"2026"`), `months` (`"2026-03"`), `expenses` (`id`), `incomes` (`id`), `monthBudgets` (`"2026-03\|GROCERIES"`), `globalBudgets` (category), `customCategories` (`id`), `categoryOverrides` (`id`) |
| `netWorth` | `config` | `years`, `months`, `assets`, `cashEntries`, `pensions`, `debts`, `taxes`, `operations` (`id`) |

Prefer `PATCH /settings` and `PUT /calculator/inputs` for those two domains: they
accept partial and full objects without a changeset.

## Worked onboarding example

Synthetic numbers. Read first, confirm with the person, then write.

1. Preferences:

```sh
node scripts/fire-tools-api.mjs PATCH /settings '{"accountName":"Alex","country":"NL","language":"en","decimalSeparator":",","dateFormat":"DD/MM/YYYY"}'
```

2. FIRE plan (start from `GET /calculator/inputs`, change the fields the person gave,
   send the whole object back with `PUT /calculator/inputs`).

3. Portfolio and targets:

```json
{
  "upsert": {
    "assets": [
      { "id": "agent-asset-1", "name": "All-world ETF", "ticker": "VWCE", "isin": "IE00BK5BQT80",
        "assetClass": "STOCKS", "subAssetType": "ETF", "shares": 120, "pricePerShare": 118.4,
        "currentValue": 14208, "originalCurrency": "EUR", "targetMode": "PERCENTAGE", "targetPercent": 100 },
      { "id": "agent-asset-2", "name": "Savings account", "ticker": "", "assetClass": "CASH",
        "subAssetType": "SAVINGS_ACCOUNT", "currentValue": 8000, "targetMode": "OFF" }
    ]
  },
  "set": {
    "assetClassTargets": {
      "STOCKS": { "targetMode": "PERCENTAGE", "targetPercent": 85 },
      "BONDS": { "targetMode": "PERCENTAGE", "targetPercent": 5 },
      "CASH": { "targetMode": "PERCENTAGE", "targetPercent": 10 }
    }
  }
}
```

```sh
node scripts/fire-tools-api.mjs PATCH /state/assetAllocation @portfolio.json
```

4. Net worth for March 2026:

```json
{
  "upsert": {
    "months": [{ "year": 2026, "month": 3, "isFrozen": false }],
    "assets": [{ "id": "agent-nw-1", "year": 2026, "month": 3, "ticker": "VWCE", "name": "All-world ETF",
                 "shares": 120, "pricePerShare": 118.4, "currency": "EUR", "assetClass": "ETF" }],
    "cashEntries": [{ "id": "agent-cash-1", "year": 2026, "month": 3, "accountName": "Savings account",
                      "accountType": "SAVINGS", "balance": 8000, "currency": "EUR" }],
    "pensions": [{ "id": "agent-pension-1", "year": 2026, "month": 3, "name": "Employer plan",
                   "currentValue": 21000, "currency": "EUR", "pensionType": "EMPLOYER" }],
    "debts": [{ "id": "agent-debt-1", "year": 2026, "month": 3, "name": "Student loan",
                "debtType": "STUDENT_LOAN", "currentBalance": 6500, "currency": "EUR" }]
  }
}
```

5. A month of cashflow:

```json
{
  "upsert": {
    "incomes": [{ "id": "agent-income-1", "type": "income", "year": 2026, "month": 3, "date": "2026-03-25",
                  "amount": 3400, "description": "Salary", "source": "SALARY" }],
    "expenses": [
      { "id": "agent-expense-1", "type": "expense", "year": 2026, "month": 3, "date": "2026-03-01",
        "amount": 1250, "description": "Rent", "category": "HOUSING", "expenseType": "NEED" },
      { "id": "agent-expense-2", "type": "expense", "year": 2026, "month": 3, "date": "2026-03-07",
        "amount": 18.5, "description": "Cinema", "category": "LIFESTYLE_LEISURE", "expenseType": "WANT" }
    ]
  }
}
```

6. Verify with `GET /state/expenseTracker` (or the month route
   `GET /expense-tracker/months/2026/3`) and ask the person to check the
   Dashboard.

## Single records

Granular routes name the record id `externalId` in the body and path:

```sh
node scripts/fire-tools-api.mjs POST /expense-tracker/expenses '{"externalId":"agent-expense-3","date":"2026-03-09","amount":42.1,"description":"Groceries","category":"GROCERIES","expenseType":"NEED"}'
node scripts/fire-tools-api.mjs DELETE /expense-tracker/expenses/agent-expense-3
```

The month of a granular expense or income comes from its `date`.
