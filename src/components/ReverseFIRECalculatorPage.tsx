import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalculatorInputs } from '../types/calculator';
import { DEFAULT_INPUTS } from '../utils/defaults';
import {
  calculateReverseFIRE,
  ReverseFireResult,
} from '../utils/reverseFireCalculator';
import { calculateFIREPortfolioData } from '../utils/allocationCalculator';
import {
  loadFireCalculatorInputs,
  saveFireCalculatorInputs,
  loadAssetAllocation,
} from '../utils/cookieStorage';
import { loadSettings } from '../utils/cookieSettings';
import { getCurrencySymbol } from '../utils/currencyConverter';
import { NumberInput } from './NumberInput';
import { MaterialIcon } from './MaterialIcon';
import { PrivacyBlur } from './PrivacyBlur';
import { AbbreviatedValue } from './AbbreviatedValue';

const REVERSE_TARGET_AGE_PARAM = 'reverseTargetAge';
const REVERSE_INFLATE_PARAM = 'reverseInflate';

function loadInitialInputs(): CalculatorInputs {
  return loadFireCalculatorInputs() ?? DEFAULT_INPUTS;
}

function formatYears(years: number): string {
  if (years <= 0) return '—';
  const rounded = Math.round(years * 10) / 10;
  return `${rounded} year${rounded === 1 ? '' : 's'}`;
}

export function ReverseFIRECalculatorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputs, setInputs] = useState<CalculatorInputs>(loadInitialInputs);

  const currentYear = new Date().getFullYear();
  const currentAge = currentYear - inputs.yearOfBirth;

  const initialTargetAge = (() => {
    const fromUrl = Number(searchParams.get(REVERSE_TARGET_AGE_PARAM));
    if (Number.isFinite(fromUrl) && fromUrl > currentAge) return fromUrl;
    return Math.max(currentAge + 10, inputs.retirementAge || 55);
  })();

  const [targetRetirementAge, setTargetRetirementAge] =
    useState<number>(initialTargetAge);
  const [inflateTarget, setInflateTarget] = useState<boolean>(() => {
    const fromUrl = searchParams.get(REVERSE_INFLATE_PARAM);
    if (fromUrl === '0' || fromUrl === 'false') return false;
    return true;
  });

  const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(
    () => loadSettings().privacyMode,
  );
  const togglePrivacyMode = () => setIsPrivacyMode(v => !v);

  const settings = loadSettings();
  const currencySymbol = getCurrencySymbol(
    settings.currencySettings.defaultCurrency,
  );

  // Mirror the FIRE page behaviour: if "use asset allocation value" is set,
  // overlay the live allocation totals on top of the saved inputs.
  const assetAllocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) return undefined;
    return calculateFIREPortfolioData(saved.assets);
  }, []);

  const effectiveInputs: CalculatorInputs = useMemo(() => {
    if (inputs.useAssetAllocationValue && assetAllocationData) {
      return {
        ...inputs,
        initialSavings: assetAllocationData.totalValue,
        stocksPercent: assetAllocationData.stocksPercent,
        bondsPercent: assetAllocationData.bondsPercent,
        cashPercent: assetAllocationData.cashPercent,
      };
    }
    return inputs;
  }, [inputs, assetAllocationData]);

  const result: ReverseFireResult = useMemo(
    () =>
      calculateReverseFIRE(effectiveInputs, {
        targetRetirementAge,
        inflateTarget,
      }),
    [effectiveInputs, targetRetirementAge, inflateTarget],
  );

  // Persist inputs to cookies so the forward calculator stays in sync.
  useEffect(() => {
    saveFireCalculatorInputs(inputs);
  }, [inputs]);

  // Keep the URL shareable for the reverse-specific knobs.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set(REVERSE_TARGET_AGE_PARAM, String(targetRetirementAge));
    next.set(REVERSE_INFLATE_PARAM, inflateTarget ? '1' : '0');
    setSearchParams(next, { replace: true });
  }, [targetRetirementAge, inflateTarget, searchParams, setSearchParams]);

  const updateInput = <K extends keyof CalculatorInputs>(
    key: K,
    value: CalculatorInputs[K],
  ) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const hasErrors =
    result.validationErrors && result.validationErrors.length > 0;

  return (
    <div className="app-container">
      <main className="main-content" aria-labelledby="reverse-fire-heading">
        <section className="fire-metrics" style={{ marginBottom: '1.5rem' }}>
          <div className="fire-metrics-header">
            <h3 id="reverse-fire-heading">
              <MaterialIcon name="undo" /> Reverse FIRE Calculator
            </h3>
            <Link to="/fire-calculator" className="share-button">
              <MaterialIcon name="local_fire_department" /> Forward FIRE
            </Link>
          </div>
          <p style={{ marginTop: 0 }}>
            Pick a target retirement age and we'll work backwards to tell you
            how much you need to save each month to get there. All other
            parameters are shared with the FIRE Calculator.
          </p>
        </section>

        <section
          className="fire-metrics"
          aria-label="Reverse FIRE inputs"
          style={{ marginBottom: '1.5rem' }}
        >
          <h3>
            <MaterialIcon name="tune" /> Inputs
          </h3>

          <div className="form-section-content">
            <div className="form-group">
              <label htmlFor="reverse-target-age">
                Target retirement age (current age: {currentAge})
              </label>
              <NumberInput
                id="reverse-target-age"
                value={targetRetirementAge}
                onChange={value =>
                  setTargetRetirementAge(Math.max(0, Math.round(value)))
                }
                allowDecimals={false}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reverse-current-savings">
                Current savings ({currencySymbol})
              </label>
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                <NumberInput
                  id="reverse-current-savings"
                  value={inputs.initialSavings}
                  onChange={value => updateInput('initialSavings', value)}
                />
              </PrivacyBlur>
            </div>

            <div className="form-group">
              <label htmlFor="reverse-fire-expenses">
                Annual FIRE expenses ({currencySymbol})
              </label>
              <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                <NumberInput
                  id="reverse-fire-expenses"
                  value={inputs.fireAnnualExpenses}
                  onChange={value => updateInput('fireAnnualExpenses', value)}
                />
              </PrivacyBlur>
            </div>

            <div className="form-group">
              <label htmlFor="reverse-withdrawal-rate">
                Desired withdrawal rate (%)
              </label>
              <NumberInput
                id="reverse-withdrawal-rate"
                value={inputs.desiredWithdrawalRate}
                onChange={value => {
                  const wr = Math.max(0, value);
                  setInputs(prev => ({
                    ...prev,
                    desiredWithdrawalRate: wr,
                    yearsOfExpenses: wr === 0 ? 0 : 100 / wr,
                  }));
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reverse-stock-return">
                Expected stock return (%)
              </label>
              <NumberInput
                id="reverse-stock-return"
                value={inputs.expectedStockReturn}
                onChange={value => updateInput('expectedStockReturn', value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reverse-bond-return">
                Expected bond return (%)
              </label>
              <NumberInput
                id="reverse-bond-return"
                value={inputs.expectedBondReturn}
                onChange={value => updateInput('expectedBondReturn', value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reverse-cash-return">
                Cash return / inflation proxy (%)
              </label>
              <NumberInput
                id="reverse-cash-return"
                value={inputs.expectedCashReturn}
                onChange={value => updateInput('expectedCashReturn', value)}
              />
              <small>
                Negative values are treated as inflation when projecting the
                FIRE target forward.
              </small>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={inflateTarget}
                  onChange={e => setInflateTarget(e.target.checked)}
                />{' '}
                Inflate FIRE target to retirement year
              </label>
            </div>
          </div>
        </section>

        {hasErrors && (
          <div className="validation-error-banner" role="alert" aria-live="polite">
            <strong>
              <MaterialIcon name="warning" /> Validation Error
            </strong>
            {result.validationErrors?.map((error, index) => (
              <div key={index} className="validation-error-message">
                {error}
              </div>
            ))}
          </div>
        )}

        {!hasErrors && (
          <section
            className="fire-metrics"
            aria-labelledby="reverse-fire-results-heading"
          >
            <div className="fire-metrics-header">
              <h3 id="reverse-fire-results-heading">
                <MaterialIcon name="gps_fixed" /> Required savings
              </h3>
              <button
                className="privacy-eye-btn metric-privacy-btn"
                onClick={togglePrivacyMode}
                aria-pressed={isPrivacyMode}
                title={isPrivacyMode ? 'Show values' : 'Hide values'}
              >
                <MaterialIcon
                  name={isPrivacyMode ? 'visibility_off' : 'visibility'}
                  size="small"
                />
              </button>
            </div>

            {result.alreadyOnTrack ? (
              <div className="metric-card highlight" role="status">
                <div className="metric-header">
                  <span className="metric-label">You're already on track</span>
                </div>
                <div className="metric-value">
                  <MaterialIcon name="check_circle" /> 0 / month
                </div>
                <div className="metric-subtitle">
                  Projected portfolio at age {targetRetirementAge}:{' '}
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    <AbbreviatedValue
                      value={result.futureValueOfCurrentSavings}
                    />
                  </PrivacyBlur>{' '}
                  vs target{' '}
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    <AbbreviatedValue value={result.fireTarget} />
                  </PrivacyBlur>
                  .
                </div>
              </div>
            ) : (
              <div className="metrics-grid" role="list">
                <div className="metric-card highlight" role="listitem">
                  <div className="metric-header">
                    <span className="metric-label">
                      Required monthly savings
                    </span>
                  </div>
                  <div className="metric-value">
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                      {currencySymbol}
                      <AbbreviatedValue
                        value={result.requiredMonthlySavings}
                      />
                    </PrivacyBlur>
                  </div>
                  <div className="metric-subtitle">
                    For {formatYears(result.yearsToTarget)} until age{' '}
                    {targetRetirementAge}
                  </div>
                </div>

                <div className="metric-card" role="listitem">
                  <div className="metric-header">
                    <span className="metric-label">
                      Required annual savings
                    </span>
                  </div>
                  <div className="metric-value">
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                      {currencySymbol}
                      <AbbreviatedValue
                        value={result.requiredAnnualSavings}
                      />
                    </PrivacyBlur>
                  </div>
                  <div className="metric-subtitle">Per year, start-of-year</div>
                </div>

                <div className="metric-card" role="listitem">
                  <div className="metric-header">
                    <span className="metric-label">FIRE target</span>
                  </div>
                  <div className="metric-value">
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                      {currencySymbol}
                      <AbbreviatedValue value={result.fireTarget} />
                    </PrivacyBlur>
                  </div>
                  <div className="metric-subtitle">
                    {inflateTarget
                      ? `Inflated to age ${targetRetirementAge}`
                      : "In today's money"}
                  </div>
                </div>

                <div className="metric-card" role="listitem">
                  <div className="metric-header">
                    <span className="metric-label">
                      Current savings grown
                    </span>
                  </div>
                  <div className="metric-value">
                    <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                      {currencySymbol}
                      <AbbreviatedValue
                        value={result.futureValueOfCurrentSavings}
                      />
                    </PrivacyBlur>
                  </div>
                  <div className="metric-subtitle">
                    Compounded at{' '}
                    {(result.annualReturnRate * 100).toFixed(2)}% per year
                  </div>
                </div>
              </div>
            )}

            <p style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
              Assumes contributions are made at the start of each year and
              earnings compound annually. Portfolio return is the weighted
              average of your asset allocation. Inflation defaults to the
              absolute value of your cash return.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
