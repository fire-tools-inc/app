import { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';
import { NumberInput } from './NumberInput';
import { SliderInput } from './SliderInput';
import { Tooltip } from './Tooltip';
import { InvestmentGrowthChart } from './InvestmentGrowthChart';
import {
  ContributionFrequency,
  InvestmentGrowthInputs,
} from '../types/investmentGrowth';
import {
  annualizedContribution,
  calculateInvestmentGrowth,
  classifySavingsRate,
} from '../utils/investmentGrowthCalculator';
import { calculateFIREPortfolioData } from '../utils/allocationCalculator';
import { loadAssetAllocation } from '../utils/cookieStorage';
import { loadSettings } from '../utils/cookieSettings';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import './InvestmentGrowthPage.css';

const DEFAULT_INPUTS: InvestmentGrowthInputs = {
  startingAmount: 10000,
  stocksPercent: 80,
  bondsPercent: 15,
  cashPercent: 5,
  contributionAmount: 500,
  contributionFrequency: 'monthly',
  expectedStockReturn: 7,
  expectedBondReturn: 3,
  expectedCashReturn: 1,
  inflationRate: 2,
  years: 20,
  annualIncome: undefined,
};

const FREQUENCY_LABELS: Record<ContributionFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

export function InvestmentGrowthPage() {
  const [inputs, setInputs] = useState<InvestmentGrowthInputs>(DEFAULT_INPUTS);
  const [useAllocationTotal, setUseAllocationTotal] = useState(false);
  const [useAllocationMix, setUseAllocationMix] = useState(false);
  const [showIncome, setShowIncome] = useState(false);

  const settings = useMemo(() => loadSettings(), []);
  const currency = settings.currencySettings.defaultCurrency;

  const allocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) return undefined;
    return calculateFIREPortfolioData(saved.assets);
  }, []);

  // Apply allocation values when toggled on
  useEffect(() => {
    if (useAllocationTotal && allocationData) {
      setInputs((prev) => ({ ...prev, startingAmount: allocationData.totalValue }));
    }
  }, [useAllocationTotal, allocationData]);

  useEffect(() => {
    if (useAllocationMix && allocationData) {
      setInputs((prev) => ({
        ...prev,
        stocksPercent: Number(allocationData.stocksPercent.toFixed(2)),
        bondsPercent: Number(allocationData.bondsPercent.toFixed(2)),
        cashPercent: Number(allocationData.cashPercent.toFixed(2)),
      }));
    }
  }, [useAllocationMix, allocationData]);

  const update = <K extends keyof InvestmentGrowthInputs>(
    key: K,
    value: InvestmentGrowthInputs[K],
  ) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const allocationSum =
    inputs.stocksPercent + inputs.bondsPercent + inputs.cashPercent;
  const allocationOff = Math.abs(allocationSum - 100) > 0.01;

  const result = useMemo(() => calculateInvestmentGrowth(inputs), [inputs]);

  const savingsFeedback = useMemo(
    () =>
      showIncome
        ? classifySavingsRate(
            annualizedContribution(inputs.contributionAmount, inputs.contributionFrequency),
            inputs.annualIncome,
          )
        : null,
    [showIncome, inputs.contributionAmount, inputs.contributionFrequency, inputs.annualIncome],
  );

  const fmt = (v: number) => formatDisplayCurrency(v, currency);

  return (
    <main className="investment-growth-page" id="main-content">
      <header>
        <h1>
          <MaterialIcon name="trending_up" /> Investment Growth Calculator
        </h1>
        <p className="page-intro">
          Project your portfolio's end value after a chosen number of years,
          including inflation, periodic contributions, and your asset allocation.
        </p>
      </header>

      <div className="ig-grid">
        {/* Inputs */}
        <section className="ig-card" aria-label="Inputs">
          <h2><MaterialIcon name="tune" /> Inputs</h2>

          <div className="ig-field">
            <label htmlFor="ig-starting">
              Starting amount{' '}
              <Tooltip content="Current portfolio value (today's currency). Used as the seed of the projection.">
                <MaterialIcon name="info" className="ig-help-icon" />
              </Tooltip>
            </label>
            <NumberInput
              id="ig-starting"
              value={inputs.startingAmount}
              onChange={(v) => update('startingAmount', Math.max(0, v))}
              disabled={useAllocationTotal}
            />
            {allocationData && (
              <label className="ig-checkbox">
                <input
                  type="checkbox"
                  checked={useAllocationTotal}
                  onChange={(e) => setUseAllocationTotal(e.target.checked)}
                />
                Use total from Asset Allocation ({fmt(allocationData.totalValue)})
              </label>
            )}
          </div>

          <div className="ig-field">
            <label>
              Asset allocation{' '}
              <Tooltip content="Split your portfolio across stocks, bonds, and cash. Must add up to 100%.">
                <MaterialIcon name="info" className="ig-help-icon" />
              </Tooltip>
            </label>
            <div className="ig-allocation-row">
              <div className="ig-field">
                <label htmlFor="ig-stocks">Stocks %</label>
                <NumberInput
                  id="ig-stocks"
                  value={inputs.stocksPercent}
                  onChange={(v) => update('stocksPercent', v)}
                  disabled={useAllocationMix}
                />
              </div>
              <div className="ig-field">
                <label htmlFor="ig-bonds">Bonds %</label>
                <NumberInput
                  id="ig-bonds"
                  value={inputs.bondsPercent}
                  onChange={(v) => update('bondsPercent', v)}
                  disabled={useAllocationMix}
                />
              </div>
              <div className="ig-field">
                <label htmlFor="ig-cash">Cash %</label>
                <NumberInput
                  id="ig-cash"
                  value={inputs.cashPercent}
                  onChange={(v) => update('cashPercent', v)}
                  disabled={useAllocationMix}
                />
              </div>
            </div>
            {allocationOff && (
              <div className="ig-allocation-warning">
                Allocation sums to {allocationSum.toFixed(2)}% — adjust to 100%.
              </div>
            )}
            {allocationData && (
              <label className="ig-checkbox">
                <input
                  type="checkbox"
                  checked={useAllocationMix}
                  onChange={(e) => setUseAllocationMix(e.target.checked)}
                />
                Use mix from Asset Allocation page
              </label>
            )}
          </div>

          <div className="ig-field">
            <label htmlFor="ig-contrib">
              Contribution amount{' '}
              <Tooltip content="Amount you invest each period. Use 0 to model a lump sum only.">
                <MaterialIcon name="info" className="ig-help-icon" />
              </Tooltip>
            </label>
            <NumberInput
              id="ig-contrib"
              value={inputs.contributionAmount}
              onChange={(v) => update('contributionAmount', Math.max(0, v))}
            />
          </div>

          <div className="ig-field">
            <label htmlFor="ig-freq">Contribution frequency</label>
            <select
              id="ig-freq"
              value={inputs.contributionFrequency}
              onChange={(e) =>
                update('contributionFrequency', e.target.value as ContributionFrequency)
              }
            >
              {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <span className="ig-help">
              Annualized: {fmt(annualizedContribution(inputs.contributionAmount, inputs.contributionFrequency))}
            </span>
          </div>

          <div className="ig-field">
            <label>
              Expected annual returns{' '}
              <Tooltip content="Expected nominal yearly return for each asset class. Blended by your allocation.">
                <MaterialIcon name="info" className="ig-help-icon" />
              </Tooltip>
            </label>
            <div className="ig-allocation-row">
              <div className="ig-field">
                <label htmlFor="ig-rs">Stocks %</label>
                <NumberInput
                  id="ig-rs"
                  value={inputs.expectedStockReturn}
                  onChange={(v) => update('expectedStockReturn', v)}
                />
              </div>
              <div className="ig-field">
                <label htmlFor="ig-rb">Bonds %</label>
                <NumberInput
                  id="ig-rb"
                  value={inputs.expectedBondReturn}
                  onChange={(v) => update('expectedBondReturn', v)}
                />
              </div>
              <div className="ig-field">
                <label htmlFor="ig-rc">Cash %</label>
                <NumberInput
                  id="ig-rc"
                  value={inputs.expectedCashReturn}
                  onChange={(v) => update('expectedCashReturn', v)}
                />
              </div>
            </div>
          </div>

          <div className="ig-field">
            <label htmlFor="ig-inflation">
              Inflation rate (%){' '}
              <Tooltip content="Expected annual inflation used to compute real (today's currency) values.">
                <MaterialIcon name="info" className="ig-help-icon" />
              </Tooltip>
            </label>
            <NumberInput
              id="ig-inflation"
              value={inputs.inflationRate}
              onChange={(v) => update('inflationRate', v)}
            />
          </div>

          <div className="ig-field">
            <label htmlFor="ig-years">
              Time horizon: {inputs.years} {inputs.years === 1 ? 'year' : 'years'}
            </label>
            <SliderInput
              id="ig-years"
              value={inputs.years}
              onChange={(v) => update('years', Math.round(v))}
              min={1}
              max={50}
              step={1}
              unit="yrs"
            />
          </div>

          <div className="ig-field">
            <label className="ig-checkbox">
              <input
                type="checkbox"
                checked={showIncome}
                onChange={(e) => {
                  setShowIncome(e.target.checked);
                  if (!e.target.checked) update('annualIncome', undefined);
                }}
              />
              Get savings rate feedback (optional)
            </label>
            {showIncome && (
              <>
                <label htmlFor="ig-income">
                  Current annual income{' '}
                  <Tooltip content="Gross or net annual income — used only to estimate your savings rate.">
                    <MaterialIcon name="info" className="ig-help-icon" />
                  </Tooltip>
                </label>
                <NumberInput
                  id="ig-income"
                  value={inputs.annualIncome ?? 0}
                  onChange={(v) => update('annualIncome', Math.max(0, v))}
                />
              </>
            )}
          </div>
        </section>

        {/* Results */}
        <section className="ig-card" aria-label="Results">
          <h2><MaterialIcon name="insights" /> Projection</h2>

          {result.validationErrors.length > 0 ? (
            <ul className="ig-errors">
              {result.validationErrors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : (
            <>
              <div className="ig-results-grid">
                <div className="ig-stat">
                  <span className="ig-stat-label">Nominal value</span>
                  <span className="ig-stat-value">{fmt(result.finalNominalValue)}</span>
                </div>
                <div className="ig-stat">
                  <span className="ig-stat-label">Real value (today)</span>
                  <span className="ig-stat-value">{fmt(result.finalRealValue)}</span>
                </div>
                <div className="ig-stat">
                  <span className="ig-stat-label">Total contributions</span>
                  <span className="ig-stat-value">{fmt(result.totalContributions)}</span>
                </div>
                <div className={`ig-stat ${result.totalGrowth >= 0 ? 'positive' : 'negative'}`}>
                  <span className="ig-stat-label">Investment growth</span>
                  <span className="ig-stat-value">{fmt(result.totalGrowth)}</span>
                </div>
                <div className="ig-stat">
                  <span className="ig-stat-label">Avg. nominal return</span>
                  <span className="ig-stat-value">{result.weightedNominalReturn.toFixed(2)}%</span>
                </div>
                <div className={`ig-stat ${result.realReturn >= 0 ? 'positive' : 'negative'}`}>
                  <span className="ig-stat-label">Avg. real return</span>
                  <span className="ig-stat-value">{result.realReturn.toFixed(2)}%</span>
                </div>
              </div>

              <div className={`ig-feedback ${result.outperformsInflation ? 'success' : 'error'}`}>
                <span className="ig-feedback-title">
                  <MaterialIcon name={result.outperformsInflation ? 'trending_up' : 'trending_down'} />
                  {result.outperformsInflation
                    ? 'Your portfolio outperforms inflation.'
                    : 'Your portfolio is losing real value to inflation.'}
                </span>
                <p>
                  Blended nominal return {result.weightedNominalReturn.toFixed(2)}% vs
                  inflation {inputs.inflationRate.toFixed(2)}% → real return{' '}
                  {result.realReturn.toFixed(2)}% per year.
                </p>
              </div>

              {savingsFeedback && (
                <div
                  className={`ig-feedback ${
                    savingsFeedback.band === 'excellent' || savingsFeedback.band === 'good'
                      ? 'success'
                      : savingsFeedback.band === 'fair'
                      ? 'info'
                      : 'warning'
                  } ig-band-${savingsFeedback.band}`}
                >
                  <span className="ig-feedback-title">
                    <MaterialIcon name="savings" />
                    Savings rate: {savingsFeedback.rate.toFixed(1)}% — {savingsFeedback.label}
                  </span>
                  <p>{savingsFeedback.description}</p>
                </div>
              )}

              <InvestmentGrowthChart yearly={result.yearly} currency={currency} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
