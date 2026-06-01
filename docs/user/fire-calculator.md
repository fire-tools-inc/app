# FIRE calculator

Projects how many years it takes to reach financial independence at your
current savings rate, with adjustable expected return and inflation.

![FIRE calculator](./screenshots/fire-calculator.png)

## How to use it

1. **Current net worth** — total of all investable assets today.
2. **Monthly savings** — the slice of your income that goes into investments
   each month. Be honest with yourself.
3. **Annual expenses** — what your life costs per year. The FIRE number is
   derived from this (25× by default, configurable as the *withdrawal rate*).
4. **Expected return** — long-term real return on your portfolio. The default
   sits around 7% for a global equity-heavy mix.
5. **Inflation** — used to keep targets in today's money.
6. **Withdrawal rate** — the slice you pull from the portfolio each year in
   retirement. 4% is the classic Trinity number; lower it for a safer plan.

Every change recalculates immediately and updates the projection chart.

## FIRE variants

The calculator supports five FIRE flavours. Pick one from the **FIRE Type** selector
to change how the target number and post-FIRE behaviour are computed.

- **Standard FIRE** — the classic: `target = annual_expenses × years_of_expenses`.
  After FIRE, optionally stop working (`stopWorkingAtFIRE`) and let the portfolio
  fund expenses.
- **Lean FIRE** — minimalist lifestyle. The target is scaled down by
  `leanExpenseMultiplier` (default `0.7`). Lower target ⇒ reach FIRE sooner.
  Formula: `target = annual_expenses × leanExpenseMultiplier × years_of_expenses`.
- **Fat FIRE** — more comfortable lifestyle. The target is scaled up by
  `fatExpenseMultiplier` (default `2.0`). Higher target ⇒ takes longer.
  Formula: `target = annual_expenses × fatExpenseMultiplier × years_of_expenses`.
- **Barista FIRE** — partial retirement where a part-time job covers part of
  expenses. Only the *gap* needs to be funded by the portfolio.
  Formula: `target = max(0, annual_expenses − baristaAnnualIncome) × years_of_expenses`.
  After FIRE, labor income is capped at `baristaAnnualIncome` and no longer grows.
- **Coast FIRE** — save aggressively early, then stop contributing and let
  compounding do the rest until a chosen retirement age.
  Formula: `target = standard_target / (1 + expected_return)^(coastTargetAge − currentAge)`.
  After Coast FIRE is reached the model keeps labor income but stops new
  contributions; only investment yield grows the portfolio.

Notes:
- Post-FIRE *expenses* always use `fireAnnualExpenses` — the lean/fat multipliers
  only affect the target, not what you actually spend in retirement.
- All variants honour the existing inputs (returns, withdrawal rate, pensions,
  other income). Switching variants never invalidates saved data — missing
  fields fall back to defaults.

## Reading the chart

- The line shows projected net worth year by year.
- The horizontal line is your FIRE target (`expenses / withdrawal_rate`).
- Where the curve crosses the target is your FIRE date.

## Sharing a scenario

Inputs are encoded in the URL. Copy the URL out of the address bar and share
— recipients open the same scenario without any data leaving either device.

## Exporting

Use **Export CSV** to download the inputs and the year-by-year projection.
Use **Import CSV** to load a previously exported file.

## Caveats

- The projection is deterministic. Run the
  [Monte Carlo simulation](./monte-carlo.md) if you want to see how volatility
  affects success rate.
- The expected return is a *real* return (after inflation). If you input a
  nominal return, set inflation to zero so you don't double-count it.
