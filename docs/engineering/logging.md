# Logging

Fire Tools uses a single structured logger across the frontend and the planned
backend. Logs stay on the user's device. They are only shared when the user
explicitly exports them through Settings.

## Format

Every log entry is rendered as a single line:

```
[YYYY-MM-DD HH:MM:SS] [section] [actor] [event]: message
```

- `timestamp` — local time, `YYYY-MM-DD HH:MM:SS`.
- `section` — kebab-case area of the app (e.g. `fire-calculator`, `dca`,
  `exchange-rate`, `cli-migrate`).
- `actor` — `user` for user-initiated actions, `system` for automatic
  background events.
- `event` — short kebab-case tag describing what happened
  (`price-fetch-failed`, `import-completed`). Optional; omitted from the line
  when null.
- `message` — short, human-readable description. **Never put financial data
  here.** Tickers, amounts, account names, and similar values must go in
  `opts.pii` so they can be stripped out.

Example:

```
[2025-01-15 10:42:03] [dca] [system] [price-fetch-failed]: failed to fetch latest price
```

## PII gating (the core privacy rule)

The logger has an off-by-default flag that controls whether personally
identifiable / financial information is written to the log line.

- **Frontend**: `loggingPiiEnabled` in user settings (encrypted cookie).
  Toggled from **Settings → Privacy & Region → Detailed diagnostic logging**.
- **Backend**: `FIRE_TOOLS_LOG_PII` environment variable (`1` / `true`).

When the flag is **off** (default), any data passed in `opts.pii` is dropped
before the entry is buffered or written. The base log line — timestamp,
section, actor, event, generic message — is always recorded, so support and
debugging still work without seeing the user's portfolio.

When the flag is **on**, `opts.pii` is serialized and appended. The Settings
page shows a red warning while the flag is on so the user knows their next log
export will contain financial details.

## API

Import the logger:

```ts
// Frontend
import { logger } from '../utils/logger';

// Backend
import { logger } from './logger.js';
```

Use one of the convenience methods:

```ts
logger.userAction('settings', 'export-clicked', 'user exported settings');
logger.systemEvent('fire-calculator', 'recalculated', 'recomputed projection');
logger.warn('exchange-rate', 'rate-stale', 'cached rate older than 24h');
logger.error('dca', 'price-fetch-failed', 'failed to fetch latest price', {
  pii: { ticker, error: (err as Error)?.message },
});
logger.debug('cli-migrate', 'sql-applied', 'ran migration', { pii: { sql } });
```

The shape of `opts`:

```ts
interface LogOptions {
  pii?: unknown; // Dropped from output when the PII flag is off.
}
```

### Migration pattern

Replace `console.*` calls during migration:

```ts
// Before
console.error('Failed to fetch price for', ticker, err);

// After
logger.error('dca', 'price-fetch-failed', 'failed to fetch price', {
  pii: { ticker, error: (err as Error)?.message },
});
```

Rules of thumb:
- Generic action description goes in the `message` argument.
- Anything specific to the user's data goes in `opts.pii`.
- Pick a stable kebab-case `section` name per file/area.
- Pick a stable kebab-case `event` so log searches are easy.

## Export for bug reports

Settings → Privacy & Region → **Export diagnostic logs** writes the in-memory
log buffer to a `fire-tools-logs-<timestamp>.log` file using the same line
format. The buffer holds up to 1000 entries.

The export reflects the current PII flag state:
- Flag off → safe to attach to a public bug report.
- Flag on → contains financial details; share only with people you trust.

There is no telemetry or network upload. The file is generated and downloaded
entirely client-side.

## Enforcement

`tests/shared/logger.test.ts` covers the logger itself.

`tests/shared/no-console.test.ts` is a guardrail test: it scans `src/` and
`server/src/` and fails the build if it finds direct `console.*` calls
outside of the logger sources and test files. New code must go through the
logger.

## See also

- [Privacy & data storage](../user/privacy.md) (if present)
- `src/utils/logger.ts` — frontend implementation.
- `server/src/logger.ts` — backend implementation.
