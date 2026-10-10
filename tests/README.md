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
```

The runner also includes co-located `src/**/*.test.ts` and `.test.tsx` files.
New tests should still follow the feature-based layout above.

## CI

`.github/workflows/tests.yml` runs scoped tests per page directory
when source or test files for that page change, and runs the full suite on
shared/, types/, or config changes. See that workflow for the path filters.
