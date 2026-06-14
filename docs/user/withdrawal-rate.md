# Withdrawal rate options (SWR / LTWR / PWR)

The Withdrawal Rate Simulator stress-tests how long your portfolio lasts at a
given withdrawal rate, and lets you reason about **three** related withdrawal
concepts. You enter **one** rate and choose which one it is — the app derives
the other two.

## The three rates

- **Safe Withdrawal Rate (SWR)** — the maximum inflation-adjusted rate that
  avoids depleting your portfolio over a *fixed* horizon (the classic 4% rule
  assumes a 30-year retirement). Highest of the three.
- **Long-Term Withdrawal Rate (LTWR)** — a sustainable middle ground over a
  long (50-year) horizon, where SWR and PWR converge.
- **Perpetual Withdrawal Rate (PWR)** — the rate that preserves your principal
  indefinitely. The most conservative; typically below 4%.

For typical inputs the ordering always holds: **PWR ≤ LTWR ≤ SWR**.

## How to use it

1. Pick which rate you are entering with the **"I'm entering this rate as"**
   selector (SWR, LTWR or PWR).
2. Drag the slider to set that rate. The selected option is highlighted in the
   results, the other two are labelled *Derived*.
3. Adjust the **retirement horizon** — it is the horizon used for SWR. LTWR
   uses a fixed 50-year long-term horizon.

## How the conversion works (assumptions)

The conversion uses a **deterministic amortization model**, separate from the
stochastic Monte Carlo success-rate chart below it. A single latent variable —
the **implied real (after-inflation) return** `r` — links the three rates:

- Annuity factor: `A(r, N) = r / (1 − (1 + r)^(−N))` — the level real
  withdrawal (as a share of the initial portfolio) that depletes it to zero
  over `N` years. Its limit as `r → 0` is `1/N`.
- **PWR = r** — withdrawing only the real return preserves the real principal
  forever (equals the limit of `A(r, N)` as `N → ∞`, for `r > 0`).
- **SWR = A(r, N_swr)** with `N_swr` your retirement horizon (default 30y).
- **LTWR = A(r, N_ltwr)** with `N_ltwr = 50y` (fixed long-term horizon).

From the rate you enter and its type, the app backs out `r` (directly for PWR,
by inverting `A` for SWR/LTWR) and recomputes the other two. Because every rate
is a deterministic function of `r`, conversions round-trip exactly.

### Edge case — non-positive real return

If the entered rate is below `1/N` (for example an SWR under ~3.33% on a
30-year horizon), the implied real return is **non-positive**. No positive rate
can then preserve principal forever, so the perpetual rate is shown as **0%**
and a note explains why.

## Reading the success-rate chart

Below the three rates, the bar chart shows the Monte Carlo **success rate** at
each candidate withdrawal rate over your horizon. Green bars (≥90%) are robust;
amber and red flag fragility to bad sequences of returns. The dashed line marks
your currently selected rate.
