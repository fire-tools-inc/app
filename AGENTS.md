# Agent instructions for Fire Tools

Fire Tools is a local-first financial planning app. Preserve financial
correctness, existing data and the usable dark interface before optimizing or
adding features. This file is the repository-wide entry point; consult the
focused skills below for the task at hand.

## Repository skills

| Task | Skill |
| --- | --- |
| Navigation, layouts, dark glass styling, charts and accessibility | [fire-tools-ui](.github/skills/fire-tools-ui/SKILL.md) |
| Profiling, simulations, render cost, settings reads and bundle loading | [fire-tools-performance](.github/skills/fire-tools-performance/SKILL.md) |
| Persistence, synchronization, imports, API validation and database changes | [fire-tools-data-integrity](.github/skills/fire-tools-data-integrity/SKILL.md) |

Read the relevant `SKILL.md` before implementing. These are repository-local
skills, not replacements for the user's personal/global skills. Their
`evals/evals.json` files contain future smoke-test prompts, not recorded
benchmark results.

## Current architecture

- **Renderer:** React, strict TypeScript, React Router, Vite, Recharts and custom
  CSS. Use the versions in `package.json` and its lockfile; the server has its
  own manifest and lockfile.
- **Calculations:** client-side utilities in `src/utils/`; Monte Carlo and
  withdrawal-rate simulations execute in module workers under `src/workers/`.
- **Backend:** implemented Node.js + Express 5 service in `server/`, with Zod
  validation and SQLite via the `better-sqlite3-multiple-ciphers` alias.
  PostgreSQL-compatible DDL is not an implemented PostgreSQL driver.
- **Desktop:** Electron main/preload code in `electron/`; use the narrow
  `window.fireTools` bridge rather than enabling renderer Node access.
- **Web:** the normal HTTP(S) renderer is a read-only, mock-data demo. Preserve
  `IS_DEMO_MODE` guards. The explicit `?demo=0` debugging override is not a
  reason to remove those guards.
- **Integrations:** Yahoo Finance price/metadata requests and optional
  user-configured OpenAI-compatible PDF categorization exist. Do not claim the
  app has no external APIs or add new external calls without an explicit feature.

### Storage boundaries

Frontend domain stores still use the synchronous helpers in
`src/utils/cookieStorage.ts` and `cookieSettings.ts`. Do not assume every domain
screen is already wired to the backend.

- Small stores use encrypted `SafeCookies`; Expense and Net Worth histories
  use encrypted `localStorage` because they can exceed cookie limits.
- `SafeCookies` makes `localStorage` authoritative inside Electron, where
  `file://` cookie writes do not work. In browsers, cookies remain authoritative
  with a local-storage fallback.
- `uiPreferencesSync.ts` mirrors supported backend preferences into local
  stores without blocking application startup.
- The local backend owns its SQLite data and optional passphrase encryption.
  Follow [database documentation](docs/database/README.md) and
  [passphrase boundaries](docs/security/passphrase.md).

Client-side encryption with a shipped key is not protection against arbitrary
JavaScript execution. `js-cookie` cannot set `HttpOnly`; do not document it as
doing so. Blur mode hides values visually, not from code or exports.

## Code and state conventions

- Use functional components, typed props and hooks. Prefer interfaces for
  object shapes; avoid `any`, unnecessary casts and duplicated helpers.
- Keep components and their CSS co-located; keep calculation and data logic
  in utilities rather than JSX.
- Derive values where possible. Memoize expensive computations when measured;
  do not add memoization or state merely to make code look optimized.
- Preserve calculator URL state, React Router basenames and Electron hash
  routes. Use `PreloadLink` for in-app navigation, not root-relative HTML links.
- Keep changes surgical. Refactor large page components when the current
  change needs it, not as an untested whole-app rewrite.
- Clean up timers, workers, object URLs, event subscriptions and DB handles,
  including error and unmount paths.
- Use `logger` from `src/utils/logger.ts` or `server/src/logger.ts`, not direct
  `console.*` in production TypeScript. Put financial details in the logger's
  gated `pii` field; never log credentials. Surface user-action failures in the UI.
- Do not silently replace a failed operation with a success-shaped result.
  Preserve documented optional/offline behavior and log unexpected failures.

## Interface invariants

- Dark mode remains the default even with a light system theme.
- Keep the green/teal brand accents and render `public/fire-icon.svg` through
  the build basename, including relative Electron asset paths.
- `AppNavigation.tsx` and `AppNavigation.css` own the narrow, rounded inset
  sidebar: static portfolio identity above the menu, utilities below a divider.
  Desktop collapse keeps named icon links and gives the workspace more room;
  `navigationPreferences.ts` persists the choice outside financial settings.
  Smaller windows always use a full-label, focus-contained drawer.
- Keep Settings in the sidebar, not an actionless profile dropdown. Preserve
  accessible link names and hover labels when hiding desktop label text.
- Keep all destinations reachable, experimental items behind their flags,
  `aria-current` accurate and the page inactive while the mobile drawer is open.
- Preserve Escape/close focus restoration and the Electron title-bar drag
  region. Do not let drag regions consume clicks on controls.
- Navigation labels come from `src/constants/navbarLabels.ts` and remain
  **English-only**. Localize other UI through `src/i18n/` in all five languages.
- Use `App.css` tokens and `src/utils/chartColors.ts`. A portfolio class should
  keep the same readable color across allocation, breakdown and net-worth flows.
- Keep text opaque and readable. Avoid saturated section backgrounds, colored
  text gradients, excessive blur and later CSS rules that undo shared styles.
- Use responsive pie radii and keep long legends outside fixed-height plots.
  Reuse `ChartLegend` and stable `expenseChartColors.ts`; honor user category
  overrides. Scope page-specific chart/table CSS beneath its page class.
- Keep dense histograms and Sankey flows locally keyboard-scrollable instead
  of clipping data or shrinking text. Test chart/label bounds after cross-route
  navigation and sidebar resizing, not only direct page loads.
- System fonts and the bundled Material Symbols font work offline. Preserve
  its license in `public/material-symbols.LICENSE.txt`.
- Maintain keyboard focus, semantic controls, reduced motion, text contrast
  of at least 4.5:1 and touch targets of at least 44 pixels.
- Keep `index.html` critical layout styles in sync with shell changes. Verify
  computed styles and screenshots, not just the first plausible CSS declaration.

## Performance and calculation invariants

- Profile the original symptom, then repeat the same workload after changes.
  Keep input data, simulation counts and financial semantics comparable.
- Reuse `useSimulationWorker` and the typed protocol in `simulationWorker.ts`.
  Cancel obsolete work, ignore stale replies and release workers on unmount.
- Monte Carlo computes distributions in the worker and sends a compact
  `MonteCarloDisplayResult`; do not send its full `simulations` array to React.
- Preserve the 100,000-run UI limit, opt-in detailed logs and the shared
  10,000-run detailed-log limit. Only the latest run's logs are retained.
- Preserve failure reasons, zero-year FIRE results, histogram upper boundaries,
  zero-valued percentiles and depleted portfolios in final-portfolio statistics.
- Honor the selected maximum age and the existing 50-year Monte Carlo cap.
  Do not alter these or other model assumptions as an incidental optimization.
- `loadSettings()` caches saved payloads by encrypted storage value and
  reconstructs nested fields when returning saved settings. Keep cached values
  isolated between callers and treat default objects as immutable.
- Preserve lazy routes, intent-based preloading, deferred chart rendering and
  on-demand language resources. Check both JavaScript and font/network costs.

## Persistence and API invariants

- Persist every valid edit. A timeout-based "sync lock" must not discard rapid
  changes. Keep Asset Allocation / Net Worth synchronization limited to the
  intended current snapshot and preserve unrelated histories and entry types.
- Wrap replacement writes and related DB changes in transactions. If an
  insertion fails, the previous saved record must survive.
- Validate boundary data before writing. Expense/income amounts are finite,
  non-negative JSON numbers; dates are valid calendar dates.
- Keep API errors in the existing `{ error: { code, message, details? } }`
  envelope. Malformed JSON is `400 invalid_body`; bodies over 2 MB are
  `413 payload_too_large`; internal details belong in logs, not 500 responses.
- Scope domain operations by `user_id`. Multi-tenant-ready columns do not
  constitute authentication; do not invent accounts or logout flows.
- Keep imports, exports, legacy-data compatibility and demo guards consistent.
  Treat changing an authoritative store as a migration, not a silent fallback.
- Gate AI model calls with `aiFeaturesEnabled` and per-action consent. Bulk
  disable cancels model requests and ignores late enrichment without clearing
  model configuration. Local OCR, parsers, capture/pairing and financial
  imports are independent of this permission.

### Domain and schema changes

When adding/changing a domain type in `src/types/*.ts`, update the TS definition,
`docs/api/openapi.yaml` and `docs/database/schema.sql` together. Add matching
forward/rollback files in `server/migrations/` when the live DB changes; do not
rewrite migrations already shipped to users. Cover the server mapper and
frontend import/export consumers as well.

```sh
npx @redocly/cli lint docs/api/openapi.yaml --config docs/api/redocly.yaml
sqlite3 :memory: < docs/database/schema.sql
npm --prefix server test -- test/migrate.test.ts
```

## Development and validation

Use Node.js >=22.22.0. Install/restore dependencies when manifests change or a
selected command reports missing packages, not before every edit. Audit both
dependency trees after changes; avoid forced major upgrades merely to silence
warnings.

| Purpose | Command |
| --- | --- |
| Renderer development | `npm run dev` |
| Full landing/demo/docs preview | `npm run dev:all` |
| Targeted renderer tests | `npm test -- tests/shared/AppNavigation.test.tsx` |
| Full renderer tests | `npm test` |
| Real-browser navigation and graph regressions | `npm run test:browser` |
| Targeted backend tests | `npm --prefix server test -- test/expenseTracker.test.ts` |
| Backend build | `npm --prefix server run build` |
| Pages build, including docs | `npm run build` |
| Self-hosted `/demo/` build with fingerprinted assets | `npm run build:self-hosted` |
| Desktop renderer build after type checking | `npx vite build --mode electron` |
| Full Electron/backend build | `npm run electron:build` |
| Refresh user screenshots | `npm run docs:screenshots` |

`predev` and Electron dev scripts call `stop-dev.mjs`. In a shared environment,
prefer a dedicated free port and direct Vite for isolated checks; do not stop
unrelated services. For example, if port 5187 is free:

```sh
npx vite --host 127.0.0.1 --port 5187 --strictPort
```

The normal install rebuilds native modules for Electron. `npm test` and the
backend test script run `ensure-sqlite-for-node.cjs` before plain-Node tests.
Do not run competing native rebuilds concurrently or bypass these hooks after
changing runtimes. The full Electron build also installs server dependencies;
use the renderer-only check when no backend/install validation is needed.
`ensure-native-modules.mjs` probes each SQLite copy with Electron in
run-as-Node mode. Archive timestamps and stale marker files cannot prove ABI
compatibility; verify a real in-memory open after any rebuild.
Electron 44.7.0 includes the upstream macOS power-registration startup fix.
Native crashes before JavaScript require a corrected runtime, not renderer
catches or shipped system-call shims. The dev launcher owns actual child
processes and treats signal exits as failures.

- Put new tests in `tests/pages/<feature>/`, `tests/shared/` or `tests/types/`.
  Existing co-located `src/**/*.test.*` files are also included by Vitest.
  Backend tests live in `server/test/`.
- Use synthetic fixtures; never customer data, real profiles or secrets.
- Run the smallest suite covering the change, then broaden when shared
  behavior/dependencies warrant it. Reproduce bugs before fixing them.
- On a busy host, isolate an intermittent failure or lower worker concurrency;
  do not weaken assertions or inflate timeouts to hide a regression.
- Verify UI changes with headless Playwright/screenshots at desktop and mobile
  widths, including short windows, keyboard interaction and blocked external
  resources. Use an isolated profile for hidden Electron `file://` checks.
- Build Docker images with `docker compose build --no-cache`; isolate test
  project names, images, ports and volumes. Check actual readiness and clean up
  only resources created for the check. Some runtimes do not expose Docker
  health status; explicit health probes are then necessary.
- Check `.github/workflows/tests.yml` path filters when adding shared files
  so the appropriate CI tests run.

## Delivery

Update existing user/engineering docs for directly related changes. Keep
standalone documentation under `docs/`, skills under `.github/skills/`, and
uncommitted scratch artifacts outside the repository.

Work on the intended feature branch and existing draft for the same task;
preserve unrelated changes. Commit with `--no-gpg-sign` and no AI/tool
attribution. Do not push to main or merge without an explicit request.
Run local review and validation before pushing. After pushing, watch current CI
and review feedback; address actionable failures and surface remaining warnings
or genuine blockers plainly.
