# API Contract

This folder contains the OpenAPI specification for the Fire Tools backend that
will power local deployments (Docker / Electron). The backend itself is **not
yet implemented** — see [issue #133](https://github.com/mbianchidev/fire-tools/issues/133)
for the rationale and roadmap.

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
| `AssetMetadata`, `BreakdownResult`, `BreakdownDimension`       | `portfolioBreakdown.ts` |
| `BankInfo`, `InstitutionType` | `bank.ts`                                            |
| `SupportedCurrency`           | `currency.ts`                                        |

Enum values are kept in sync verbatim. When adding a new enum value to a TS
union type, the same value must be added to the OpenAPI enum **and** the
corresponding `CHECK` constraint in [`../database/schema.sql`](../database/schema.sql).

## Out of scope (deferred)

- WebSocket / SSE endpoints for live notifications
- Multipart `POST /pdf-imports/upload` for server-side PDF parsing — the
  current flow expects the React client to parse the PDF and POST drafts
- Server-side computation endpoints (`POST /calculator/run`,
  `POST /calculator/monte-carlo/run`) — the React client owns those
  calculations today; once moved server-side, they'll be added here
