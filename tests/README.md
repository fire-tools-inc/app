# Tests

Tests are organized by **page/feature** (mirroring the SPA's navigation) rather
than by source-code layer. This makes it easy to find tests for a feature and
lets CI run a scoped subset when only that feature changes.

## Layout

```
tests/
├── pages/                     # Tests scoped to a single page/feature
│   ├── homepage/              # Landing page
│   ├── fire-calculator/       # FIRE calculator, Monte Carlo, projections
│   ├── asset-allocation/      # Portfolio, rebalancing, price API, Yahoo metadata
│   ├── net-worth-tracker/     # Net worth tracking
│   ├── expense-tracker/       # Cashflow, PDF import, categories
│   ├── questionnaire/         # Onboarding questionnaire
│   └── settings/              # Cookie storage, preferences, data management
├── shared/                    # Cross-cutting components & utilities
│                              # (PolicyModal, SearchableSelect, SliderInput,
│                              # formatCurrency, numberFormatter, dateFormatter,
│                              # inputValidation, useTableSort)
├── browser/                   # Headless Playwright workspace/chart regressions
└── types/                     # Pure type/data-definition tests
                               # (bank, country, customCategories, priceApi)
```

## Where do new tests go?

1. **Used by exactly one page?** → `tests/pages/<page>/`
2. **Used by multiple pages (shared component, hook, or utility)?** → `tests/shared/`
3. **Pure data/type definition with no UI?** → `tests/types/`

## Running tests

```sh
npm test                          # run all tests once
npm run test:watch                # watch mode
npm test -- tests/pages/settings/ # run just one page's tests
npm --prefix server test          # run backend tests with isolated SQLite fixtures
npm run test:browser             # isolated browser checks on port 5188
```

The runner also includes co-located `src/**/*.test.ts` and `.test.tsx` files.
New tests should still follow the feature-based layout above.

Unit tests keep the default timeout and use at most half the available CPU
workers. The release-script integration suite awaits real subprocess exits:
each command has a 20-second deadline, with a 25-second per-test budget for
the command and its assertions. Startup errors and signal termination reject
the test rather than counting as an expected nonzero release exit.

### Diagnostics and async rendering

Unexpected `console.warn` or `console.error` output fails a test, including
React's unwrapped `act()` warnings. Wait for asynchronous UI work to finish
using `findByRole`, `waitFor`, or `act`; do not suppress the warning.

For deliberate failure-path tests, verify the result and consume the exact
expected diagnostic count:

```ts
import { expectDiagnostic } from '../../shared/diagnostics';

// After exercising and asserting the expected failure:
expectDiagnostic('error', '[save-failed]: failed to save questionnaire results');
```

Unmatched or additional diagnostics still fail. Backend tests use the same
guard with the import path `../../tests/shared/diagnostics.js`. Their setup
captures the backend logger in tests only; production logging is unchanged.

Informational logs are shown only for failing tests. Use
`npm test -- --silent=false` to show informational output while debugging.
Coverage prints a summary; detailed HTML and JSON remain under `coverage/`.

### Backend fixtures

Always await `makeApp()`, `makeFileApp()` or `makeAppWithTmpDb()` from
`server/test/helpers.ts`. They return a ready HTTP server bound to
`127.0.0.1` on a dedicated ephemeral port. Reuse that server for the test's
requests rather than letting Supertest open a wildcard listener per request.
The fixtures automatically close connections and database handles and remove
their temporary directories after each test, including failed tests.
Their optional `cleanup()` is awaited and safe to call more than once.

The browser suite checks the compiled self-hosted build with synthetic/demo
data, mocks market endpoints and blocks
other external requests. It checks actual plot/label bounds, navigation state,
local overflow and keyboard behavior rather than CSS source-text proxies.
Install its browser once with `npx playwright install chromium` if missing.

## CI

`.github/workflows/tests.yml` runs scoped tests per page directory
when source or test files for that page change, and runs the full suite on
shared/, types/, or config changes. See that workflow for the path filters.
Shared test setup changes also trigger the full renderer suite.
Shared diagnostic helper changes trigger the backend suite as well.
UI-related changes also run the **Browser UI regressions** job.
