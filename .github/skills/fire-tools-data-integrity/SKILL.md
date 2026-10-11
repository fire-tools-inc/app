---
name: fire-tools-data-integrity
description: >-
  Preserve Fire Tools data across edits, synchronization, imports and backend
  changes. Use for missing saves, failed upserts, corrupt/legacy storage, API
  validation, domain/schema changes, migrations or encryption/backup work in
  this repository.
---

# Fire Tools data integrity work

Read `AGENTS.md` first. Identify the real authoritative store before editing:
the backend is implemented, but frontend domain stores are not all API clients.
Never hide a write failure behind a default object or silently switch stores.

## Trace the boundary

| Boundary | Source |
| --- | --- |
| Small encrypted stores and tracker histories | `src/utils/cookieStorage.ts` |
| Cached preferences | `src/utils/cookieSettings.ts` |
| Browser/Electron storage precedence | `src/utils/safeCookies.ts` |
| Backend preference mirroring | `src/utils/uiPreferencesSync.ts`, `src/utils/apiBase.ts` |
| Asset Allocation / Net Worth conversion | `src/utils/dataSync.ts` |
| Imports and exports | `src/utils/dataExportImport.ts`, `src/utils/csvExport.ts` |
| API errors, validation and routing | `server/src/http.ts`, `server/src/app.ts`, `server/src/routes/` |
| SQLite initialization and migrations | `server/src/db.ts`, `server/src/migrate.ts`, `server/migrations/` |
| Desktop encryption/backups | `electron/main.cjs`, `electron/backup.cjs`, `server/src/rekey.ts` |

1. Follow the user action through validation, state updates and persistence.
   Check browser, Electron and demo behavior separately.
2. Reproduce the failure with synthetic data before changing code.
3. Keep the fix in the canonical helper rather than scattering alternate writes
   across page components.

## Preserve data while fixing the cause

- Keep `IS_DEMO_MODE` guards. Test debugging persistence in an isolated profile,
  not by writing into the user's real portfolio or database.
- Use `SafeCookies` for its existing stores. Electron `file://` cannot rely on
  browser cookies; Expense/Net Worth histories intentionally use localStorage.
- Preserve every valid rapid edit. Do not debounce persistence by dropping
  intermediate changes behind a timeout-based synchronization lock.
- Sync only the intended current snapshot; retain histories, pensions,
  operations and physical-asset metadata outside the replacement scope.
- Keep cached settings invalidated by encrypted-value changes and return
  independent nested fields. Do not let one caller mutate future reads.
- Validate external/unknown data before modifying saved state. Expense/income
  amounts are finite non-negative JSON numbers; dates must exist in the calendar.
- Wrap destructive replacements and related SQLite writes in one transaction.
  An invalid input or injected insertion failure must retain the prior record.
- Preserve `user_id` scoping and stable external IDs. Schema readiness does not
  imply implemented authentication.
- Use the existing JSON error envelope, correct 4xx statuses and generic 500
  messages. Log diagnostic details through the PII-gated logger, never secrets.
- Close DB handles on failed initialization. Preserve backup, rekey and
  keychain rollback behavior; read `docs/security/passphrase.md` before changing
  encryption. Browser encryption and blur mode are not substitutes for DB keys.

## Domain changes and migration gates

Change the TS domain definition, OpenAPI contract and reference DDL together.
Add forward/rollback migrations for live schema changes; do not edit an already
shipped migration. Update serializers, mappers, imports/exports and legacy-data
handling. Document rollback data loss rather than calling it reversible.

```sh
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
sqlite3 :memory: < docs/database/schema.sql
npm --prefix server test -- test/migrate.test.ts
npm --prefix server run build
```

## Prove retention and compatibility

Use the relevant existing regressions, plus a test for the new failure:

```sh
npm test -- tests/pages/asset-allocation/AssetAllocationPersistence.test.tsx tests/pages/net-worth-tracker/NetWorthPersistence.test.tsx
npm test -- tests/pages/settings/cookieSettings.test.ts tests/pages/settings/dataSync.test.ts
npm --prefix server test -- test/expenseTracker.test.ts test/assetAllocation.test.ts test/app.test.ts
```

Check success, invalid input, failed write, rapid successive edits, old payloads,
save/reload and import/export round trips. For API replacements, use an isolated
in-memory DB and a failing insertion/trigger, then read the original record back.
For migration/encryption changes, use a disposable database and verify reopening.

Changing stores, validation rules or import formats is a behavior change:
document compatibility/migration steps and confirm scope instead of silently
expanding the task. Future planning prompts live in `evals/evals.json`.
