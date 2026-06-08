/**
 * Withdrawal Rate Conversion — SWR / LTWR / PWR
 *
 * Issue #193: the user enters ONE withdrawal rate and selects which of the
 * three concepts it represents; we derive the other two.
 *
 * MODEL — deterministic implied-real-return (amortization) model.
 * --------------------------------------------------------------------------
 * This is intentionally a *deterministic* model, distinct from the stochastic
 * Monte Carlo longevity simulator in `withdrawalRateSimulator.ts` (which keeps
 * powering the success-rate chart). All three rates are expressed as a level,
 * inflation-adjusted (real) withdrawal as a fraction of the *initial* portfolio.
 *
 * Single latent variable: the implied constant real (after-inflation) return
 * `r` that the portfolio earns each year.
 *
 *   - Annuity / amortization factor:
 *         A(r, N) = r / (1 - (1 + r)^(-N))
 *     This is the level real withdrawal that depletes the portfolio to exactly
 *     zero over N years given constant real return r. Its limit as r -> 0 is
 *     1/N, and (for r > 0) its limit as N -> ∞ is r.
 *
 *   - PWR (Perpetual Withdrawal Rate) = r. Withdrawing exactly the real return
 *     each year preserves the real principal indefinitely. Equals lim A(r,N)
 *     as N -> ∞ for r > 0. If the implied real return is non-positive, no
 *     positive rate preserves principal forever, so we surface that and clamp
 *     the *displayed* PWR to 0 (while keeping the internal r for round-trips).
 *
 *   - SWR (Safe Withdrawal Rate) = A(r, N_swr), with N_swr the retirement
 *     horizon (default 30y, e.g. the Trinity-study 4%/30y rule).
 *
 *   - LTWR (Long-Term Withdrawal Rate) = A(r, N_ltwr), a fixed long horizon
 *     (default 50y). It is the "middle ground" where SWR and PWR converge over
 *     long timeframes: for r > 0 and N_swr < N_ltwr, A(r,30) >= A(r,50) >= r,
 *     i.e. PWR <= LTWR <= SWR.
 *
 * Conversion: from the entered rate + its type we back out r (directly for PWR,
 * by numerically inverting A for SWR/LTWR), then recompute the other two. Since
 * every rate is a deterministic function of the single variable r, conversions
 * round-trip exactly.
 */

export type WithdrawalRateType = 'swr' | 'ltwr' | 'pwr';

export const WITHDRAWAL_RATE_TYPES: readonly WithdrawalRateType[] = ['swr', 'ltwr', 'pwr'] as const;

/** Default retirement horizon for SWR (Trinity-study convention). */
export const DEFAULT_SWR_HORIZON_YEARS = 30;
/** Default long horizon for LTWR. Documented assumption (see module header). */
export const DEFAULT_LTWR_HORIZON_YEARS = 50;

export interface WithdrawalRateConversionParams {
  /** Horizon in years used for the SWR annuity (e.g. 30). */
  swrHorizonYears: number;
  /** Long horizon in years used for the LTWR annuity (e.g. 50). */
  ltwrHorizonYears: number;
}

export interface WithdrawalRateTriple {
  /** Safe Withdrawal Rate, % (e.g. 4 for 4%). */
  swr: number;
  /** Long-Term Withdrawal Rate, %. */
  ltwr: number;
  /** Perpetual Withdrawal Rate, % (clamped to >= 0 for display). */
  pwr: number;
  /** Implied constant real return backed out from the input, % (may be < 0). */
  impliedRealReturn: number;
  /** False when the implied real return is <= 0 (principal cannot be preserved forever). */
  principalPreserved: boolean;
}

/**
 * Level real withdrawal (as a fraction of initial principal) that depletes the
 * portfolio over `years` at constant real return `r`.
 *
 * @param r real return as a fraction (e.g. 0.04 for 4%); must be > -1.
 * @param years horizon in years; must be > 0.
 */
export function annuityWithdrawalFactor(r: number, years: number): number {
  if (years <= 0) throw new Error('years must be greater than 0');
  if (r <= -1) throw new Error('real return r must be greater than -1');
  // Limit as r -> 0 is 1/N; use it directly for tiny |r| to avoid 0/0.
  if (Math.abs(r) < 1e-9) return 1 / years;
  // denom = 1 - (1+r)^(-N); computed via expm1/log1p for numerical stability.
  const denom = -Math.expm1(-years * Math.log1p(r));
  return r / denom;
}

/**
 * Invert {@link annuityWithdrawalFactor}: find the real return `r` such that
 * A(r, years) === targetFactor. A is strictly increasing in r on (-1, ∞), so a
 * bracketed bisection is robust.
 *
 * @param targetFactor target withdrawal factor as a fraction (e.g. 0.04).
 * @param years horizon in years.
 */
export function solveRealReturn(targetFactor: number, years: number): number {
  if (years <= 0) throw new Error('years must be greater than 0');
  if (targetFactor <= 0) throw new Error('targetFactor must be greater than 0');

  let lo = -0.95;
  let hi = 1.0;
  // Expand the upper bracket if the target rate is unusually high.
  let guardUpper = 0;
  while (annuityWithdrawalFactor(hi, years) < targetFactor && guardUpper < 100) {
    hi *= 2;
    guardUpper++;
  }
  // Expand the lower bracket toward -1 if the target is unusually low.
  let guardLower = 0;
  while (annuityWithdrawalFactor(lo, years) > targetFactor && lo > -0.999999 && guardLower < 100) {
    lo = (lo - 1) / 2; // -0.95 -> -0.975 -> -0.9875 ... approaches -1
    guardLower++;
  }

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const value = annuityWithdrawalFactor(mid, years);
    if (Math.abs(value - targetFactor) < 1e-12) return mid;
    if (value < targetFactor) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Convert a single entered withdrawal rate into the full SWR/LTWR/PWR triple.
 *
 * @param rate entered rate in percent (e.g. 4 for 4%); must be > 0.
 * @param type which rate the user entered.
 * @param params SWR / LTWR horizons.
 */
export function convertWithdrawalRates(
  rate: number,
  type: WithdrawalRateType,
  params: WithdrawalRateConversionParams,
): WithdrawalRateTriple {
  if (!(rate > 0)) throw new Error('rate must be greater than 0');
  if (params.swrHorizonYears <= 0 || params.ltwrHorizonYears <= 0) {
    throw new Error('horizons must be greater than 0');
  }

  const rateFraction = rate / 100;

  // Back out the implied real return r (fraction) from the entered rate.
  let r: number;
  switch (type) {
    case 'pwr':
      r = rateFraction; // PWR = r directly
      break;
    case 'swr':
      r = solveRealReturn(rateFraction, params.swrHorizonYears);
      break;
    case 'ltwr':
      r = solveRealReturn(rateFraction, params.ltwrHorizonYears);
      break;
  }

  const swr = annuityWithdrawalFactor(r, params.swrHorizonYears) * 100;
  const ltwr = annuityWithdrawalFactor(r, params.ltwrHorizonYears) * 100;
  const principalPreserved = r > 0;
  // PWR equals r; a non-positive real return cannot sustain a perpetual
  // positive withdrawal, so clamp the displayed value to 0.
  const pwr = principalPreserved ? r * 100 : 0;

  return {
    swr,
    ltwr,
    pwr,
    impliedRealReturn: r * 100,
    principalPreserved,
  };
}
