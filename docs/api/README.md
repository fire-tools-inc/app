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
| **IDs**          | Each resource exposes both a server `id` (integer) and a client-minted `externalId` (string). Clients should always upsert by `externalId`. |
| **Dates**        | ISO-8601 — `YYYY-MM-DD` for `date`, full `date-time` for timestamps                         |
| **Money**        | `number` (float) in the account's display currency                                          |
| **Pagination**   | Opaque cursor: `?cursor=&limit=` on list endpoints that can grow large                      |
| **Errors**       | `{ "error": { "code": string, "message": string, "details"?: object } }`                    |
| **Empty 204**    | Used for successful DELETEs                                                                 |

Request bodies are limited to **2 MB**. Malformed JSON returns
`400 invalid_body`; an oversized body returns `413 payload_too_large`.
Unexpected failures return a generic `500 internal_error`, with details
recorded in the server logs. Expense and income amounts must be finite,
non-negative JSON numbers, and dates must be valid calendar dates.
The raw-binary `/document-text` and `/receipts` upload routes have their own
**10 MB** limit. They validate file signatures and MIME types. Receipt list
responses contain metadata, not image BLOBs; original downloads are no-store
attachments.

Replacing assets, transactions or custom categories is transactional: if an
insertion fails, the previously saved record is retained.

## Auth

The spec declares a reserved `bearerAuth` security scheme. **Single-user
deployments leave it off** — every request runs as the bootstrap user
(`id = 1`). Multi-tenant deployers can flip it on and the schema is already
multi-tenant — see [`../database/README.md`](../database/README.md#multi-tenant-migration-path).

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
