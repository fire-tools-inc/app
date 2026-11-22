# API Contract

This folder contains the OpenAPI specification for the Fire Tools backend that
powers local deployments (Docker / Electron). The backend implementing this
contract lives in [`../../server/`](../../server/).

## Published docs

The spec is bundled into the GitHub Pages deploy as an interactive
[ReDoc](https://redocly.com/redoc/) viewer at `/<base>/api/`. The build step
is `npm run build:landing` (called automatically as a `postbuild`).

## Files

| File                          | Purpose                                                                  |
|-------------------------------|--------------------------------------------------------------------------|
| [`openapi.yaml`](./openapi.yaml) | OpenAPI 3.0.3 spec, source of truth for the REST API                  |
| [`redocly.yaml`](./redocly.yaml) | Redocly lint config (mutes warnings that are intentional for a contract-only spec) |

## Quick start

### Lint

```sh
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
```

### Render documentation locally

```sh
npx @redocly/cli preview-docs docs/api/openapi.yaml
# open the printed URL
```

### Generate a client

```sh
# Type-safe TypeScript client (matches the existing React app)
npx openapi-typescript docs/api/openapi.yaml -o src/api/types.gen.ts

# Or full Axios client via openapi-generator
npx @openapitools/openapi-generator-cli generate \
    -i docs/api/openapi.yaml \
    -g typescript-axios \
    -o generated/api-client
```

## Conventions

| Topic            | Convention                                                                                  |
|------------------|---------------------------------------------------------------------------------------------|
| **Base path**    | `/api/v1`                                                                                   |
| **Versioning**   | URL-versioned. Breaking changes bump the major (`/api/v2`).                                 |
| **Casing**       | camelCase for all JSON keys (matches `src/types/*.ts`)                                      |
| **IDs**          | Granular routes expose both a server `id` (integer) and a client-minted `externalId` (string); clients upsert by `externalId`. `/state` documents use the client-minted id as `id`. |
| **Dates**        | ISO-8601 — `YYYY-MM-DD` for `date`, full `date-time` for timestamps                         |
| **Money**        | `number` (float) in the account's display currency                                          |
| **Pagination**   | Opaque cursor: `?cursor=&limit=` on list endpoints that can grow large                      |
| **Errors**       | `{ "error": { "code": string, "message": string, "details"?: object } }`                    |
| **Empty 204**    | Used for successful DELETEs                                                                 |

Request bodies are limited to **2 MB**, except `/state/{domain}` which
accepts up to **50 MB**. Malformed JSON returns `400 invalid_body`; an
oversized body returns `413 payload_too_large`.
Unexpected failures return a generic `500 internal_error`, with details
recorded in the server logs. Expense and income amounts must be finite,
non-negative JSON numbers, and dates must be valid calendar dates.
The raw-binary `/document-text` and `/receipts` upload routes have their own
**10 MB** limit. They validate file signatures and MIME types. Receipt list
responses contain metadata, not image BLOBs; original downloads are no-store
attachments.

Replacing assets, transactions or custom categories is transactional: if an
insertion fails, the previously saved record is retained.

## What the app shows

When the app is connected to a backend, the database is the source of truth
for five domains: `settings`, `calculator`, `assetAllocation`,
`expenseTracker` and `netWorth`. The app polls `GET /sync/status` and reloads
a domain whose revision changed, so writes through the granular routes or
`/state/{domain}` appear within about 3 seconds.

| Route | Purpose |
|-------|---------|
| `GET /sync/status` | `{ instanceId, domains: { <domain>: { revision, initialized } } }` |
| `GET /state/{domain}` | `{ domain, instanceId, revision, initialized, data }`; `data` uses the app's own document shape, or `null` when the domain was never written |
| `PATCH /state/{domain}` | Merge a Changeset (`set`, `upsert`, `delete`, `initialize`) in one transaction |
| `PUT /state/{domain}` | Replace the domain with a Changeset in one transaction |

Changeset items are the app's entities (string `id`) plus `position` and, for
monthly items, `year`/`month`. Any invalid item rejects the whole request with
`400 invalid_body` (or `409 conflict`) and `details: { collection, key, message }`;
nothing is written. See the `Changeset` schema in [`openapi.yaml`](./openapi.yaml)
for the collections of each domain.

Questionnaire results, notifications, Monte Carlo runs, portfolio metadata,
the asset allocation config and users are stored in the database only and are
not shown in the app.

## Auth

Without a configured token every request runs unauthenticated as the
bootstrap user (`id = 1`). When the server has a token (`API_TOKEN` for a
standalone server; the desktop app generates one per launch for its embedded
backend), every `/api/v1` route except `GET /health` requires
`Authorization: Bearer <token>` and otherwise answers `401 unauthorized`.
CORS preflight requests do not need the token. The token is not an account
system: the schema is multi-tenant ready, see
[`../database/README.md`](../database/README.md#multi-tenant-migration-path).

## Mapping to frontend types

The OpenAPI schemas are named to mirror the TypeScript interfaces in
[`src/types/`](../../src/types/). The full mapping:

| OpenAPI schema                | TS interface (`src/types/`)                          |
|-------------------------------|------------------------------------------------------|
| `UserSettings`                | `cookieSettings.ts` `UserSettings`                   |
| `NotificationPreferences`     | `notification.ts` `NotificationPreferences`          |
| `Notification`                | `notification.ts` `Notification`                     |
| `CalculatorInputs`            | `calculator.ts` `CalculatorInputs`                   |
| `MonteCarloRun*`              | `calculator.ts` `MonteCarloResult` / `*WithLogs`     |
| `Asset`, `AssetAllocationConfig`, `MortgageData` | `assetAllocation.ts`              |
| `MonthData`, `ExpenseEntry`, `IncomeEntry`, `CategoryBudget`, `CustomCategory`, `CategoryOverride` | `expenseTracker.ts` |
| `MonthlySnapshot`, `AssetHolding`, `CashEntry`, `PensionEntry`, `DebtEntry`, `TaxEntry`, `FinancialOperation`, `VehicleDepreciation`, `MortgageInfo`, `NetWorthTrackerData` | `netWorthTracker.ts` |
| `QuestionnaireResults`, `FIREPersona`, `AssetAllocationTarget` | `questionnaire.ts` |
| `ParsedTransactionDraft`, `PdfDocType`, `PdfImport`            | `pdfImport.ts`     |
| `ReceiptDocument`, `ReceiptPairing` | `receiptImport.ts` |
| `AssetMetadata`, `BreakdownResult`, `BreakdownDimension`       | `portfolioBreakdown.ts` |
| `BankInfo`, `InstitutionType` | `bank.ts`                                            |
| `SupportedCurrency`           | `currency.ts`                                        |

Enum values are kept in sync verbatim. When adding a new enum value to a TS
union type, the same value must be added to the OpenAPI enum **and** the
corresponding `CHECK` constraint in [`../database/schema.sql`](../database/schema.sql).

## Out of scope (deferred)

- WebSocket / SSE endpoints for live notifications
- Multipart uploads — the implemented `/document-text` and `/receipts` routes
  accept raw document bytes, while the existing `/pdf-imports` route accepts
  already-parsed drafts. Receipt pairings expose a separate upload-only
  capability listener, not the ordinary financial API.
- Server-side computation endpoints (`POST /calculator/run`,
  `POST /calculator/monte-carlo/run`) — the React client owns those
  calculations today; once moved server-side, they'll be added here
