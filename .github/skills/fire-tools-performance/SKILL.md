---
name: fire-tools-performance
description: >-
  Profile and optimize Fire Tools without changing financial semantics or
  losing data. Use for slow simulations, frozen input/slider interactions,
  repeated settings decryption, expensive chart rendering, startup delays or
  bundle/network regressions in this repository.
---

# Fire Tools performance work

Read `AGENTS.md` first. Treat measured responsiveness and correct results as
separate acceptance criteria. A faster result with fewer runs or changed model
assumptions is not an equivalent optimization.

## Establish a comparable baseline

1. Identify the exact user interaction and input size. Use synthetic fixtures.
2. Separate calculation time, result-transfer size, render cost and network
   loading. Check whether the expensive work really runs on the UI thread.
3. Record a baseline before changing code. Use the same input, simulation count,
   environment and measurement method after the change.
4. Reproduce correctness defects with deterministic tests. Avoid flaky
   comparisons between unrelated random simulation draws.

## Reuse the current mechanisms

| Concern | Source |
| --- | --- |
| Worker lifecycle and throttled progress | `src/hooks/useSimulationWorker.ts` |
| Typed task/message protocol and detailed-log limit | `src/utils/simulationWorker.ts` |
| Simulation execution and aggregation | `src/workers/simulation.worker.ts` |
| FIRE Monte Carlo model | `src/utils/monteCarlo.ts` |
| Distribution boundaries and percentiles | `src/utils/monteCarloDistribution.ts` |
| Withdrawal-rate model and range validation | `src/utils/withdrawalRateSimulator.ts` |
| Lightweight result histogram | `src/components/MonteCarloChart.tsx` |
| Cached settings and shared formatting | `src/utils/cookieSettings.ts`, `src/utils/numberFormatter.ts` |
| Lazy routes, preload links and progressive charts | `src/routes/lazyPages.tsx`, `src/components/PreloadLink.tsx`, `src/hooks/useDeferredRender.ts` |

- Send input snapshots to workers; terminate replaced jobs, ignore late replies,
  surface failures, and release workers on unmount.
- Keep histograms/percentiles in the worker. `MonteCarloDisplayResult` omits
  individual simulation results; do not copy large arrays back into React.
- Keep progress bounded/throttled rather than repainting the whole page for
  every run. Measure result mounting too: moving only computation off-thread
  can leave a heavyweight chart-rendering bottleneck.
- Preserve up to 100,000 UI runs. Detailed yearly logs are opt-in, capped by
  `MAX_DETAILED_SIMULATIONS` at 10,000, and retained for the latest run only.
- Preserve the selected maximum age and 50-year cap, failure reasons, zero-year
  FIRE, inclusive histogram boundaries, valid zero percentiles and depleted
  portfolios in the final-portfolio distribution.
- Cache settings by ciphertext and keep nested return values independent.
  Verify save/clear/out-of-band storage invalidation; avoid replacing repeated
  decryption with a new expensive full deep clone per formatted cell.
- Preserve on-demand routes/languages and safe Pages, self-hosted and Electron
  asset paths. Avoid new heavy dependencies for simple bounded graphics.
- Run `npm run test:browser` for render changes. Preserve readable minimum
  histogram bin widths with local scrolling; do not reclaim space by clipping
  chart data, squeezing plots behind internal legends or discarding entries.

## Regression checks

```sh
npm test -- tests/shared/useSimulationWorker.test.ts tests/shared/simulationWorker.test.ts
npm test -- tests/pages/fire-calculator/monteCarlo.test.ts tests/pages/fire-calculator/monteCarloDistribution.test.ts tests/pages/fire-calculator/withdrawalRateSimulator.test.ts
npm test -- tests/pages/settings/cookieSettings.test.ts tests/shared/numberFormatter.test.ts
npm run build
```

Read the existing tests before changing expected values. The maximum-run
transport test verifies a result under 15,000 serialized bytes without a raw
`simulations` array. Preserve the required shape, not merely a timing number.

In an isolated browser, run the maximum-count interaction, inspect frame/long
task measurements, cancel and rerun, navigate away mid-run, and rapidly change
the withdrawal slider. Verify the newest controls own the displayed result.
Measure both computation and result rendering with logs off, then check an
allowed detailed-log run separately.

Compare bundle output and external resource requests for loading changes.
Report measurements with their environment and workload; do not extrapolate a
single fast machine's numbers into a universal performance guarantee.

Document intentional limit/model/logging changes in the user guide. Use
`evals/evals.json` for future smoke-test prompts; no baseline scores are implied.
