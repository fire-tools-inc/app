import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { CalculatorInputs } from '../types/calculator';
import { DEFAULT_INPUTS } from '../utils/defaults';
import { getEffectiveInputs } from '../utils/fireCalculator';
import { loadFireCalculatorInputs, loadAssetAllocation } from '../utils/cookieStorage';
import { calculateFIREPortfolioData } from '../utils/allocationCalculator';
import { loadSettings } from '../utils/cookieSettings';
import {
  runWithdrawalRateSimulation,
  runWithdrawalRateSweep,
  defaultWithdrawalRateRange,
  WithdrawalRateInputs,
  WithdrawalRateResult,
} from '../utils/withdrawalRateSimulator';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { MaterialIcon } from './MaterialIcon';
import { SliderInput } from './SliderInput';
import { PrivacyBlur } from './PrivacyBlur';

const DEFAULT_RETIREMENT_YEARS = 30;
const DEFAULT_NUM_SIMULATIONS = 1000;
const SLIDER_MIN = 1;
const SLIDER_MAX = 10;
const SLIDER_STEP = 0.1;

function buildSimInputs(
  inputs: CalculatorInputs,
  retirementYears: number,
  numSimulations: number,
): WithdrawalRateInputs {
  return {
    initialPortfolio: inputs.initialSavings,
    stocksPercent: inputs.stocksPercent,
    bondsPercent: inputs.bondsPercent,
    cashPercent: inputs.cashPercent,
    expectedStockReturn: inputs.expectedStockReturn,
    expectedBondReturn: inputs.expectedBondReturn,
    expectedCashReturn: inputs.expectedCashReturn,
    stockVolatility: 15,
    bondVolatility: 5,
    blackSwanProbability: 2,
    blackSwanImpact: -40,
    retirementYears,
    numSimulations,
  };
}

function successRateClass(rate: number): string {
  if (rate >= 90) return 'wr-pill-good';
  if (rate >= 75) return 'wr-pill-warn';
  return 'wr-pill-bad';
}

function successRateColor(rate: number): string {
  if (rate >= 90) return '#22C55E';
  if (rate >= 75) return '#F59E0B';
  return '#EF4444';
}

export const WithdrawalRatePage: React.FC = () => {
  const location = useLocation();

  // Load inputs once per navigation, same pattern as MonteCarloPage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseInputs = useMemo<CalculatorInputs>(() => {
    return location.state?.inputs || loadFireCalculatorInputs() || DEFAULT_INPUTS;
  }, [location.key]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const assetAllocationData = useMemo(() => {
    const saved = loadAssetAllocation();
    if (!saved.assets || saved.assets.length === 0) return undefined;
    return calculateFIREPortfolioData(saved.assets);
  }, [location.key]);

  const inputs: CalculatorInputs = useMemo(() => {
    let effective = baseInputs;
    if (baseInputs.useAssetAllocationValue && assetAllocationData) {
      effective = {
        ...effective,
        initialSavings: assetAllocationData.totalValue,
        stocksPercent: assetAllocationData.stocksPercent,
        bondsPercent: assetAllocationData.bondsPercent,
        cashPercent: assetAllocationData.cashPercent,
      };
    }
    return getEffectiveInputs(effective);
  }, [baseInputs, assetAllocationData]);

  const defaultCurrency = useMemo(() => {
    const s = loadSettings();
    return s.currencySettings.defaultCurrency;
  }, []);

  const isPrivacyMode = useMemo(() => loadSettings().privacyMode, []);

  const [withdrawalRate, setWithdrawalRate] = useState<number>(
    inputs.desiredWithdrawalRate || 4,
  );
  const [retirementYears, setRetirementYears] = useState<number>(DEFAULT_RETIREMENT_YEARS);
  const [numSimulations, setNumSimulations] = useState<number>(DEFAULT_NUM_SIMULATIONS);

  const [sweep, setSweep] = useState<WithdrawalRateResult[]>([]);
  const [current, setCurrent] = useState<WithdrawalRateResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sweepDebounce = useRef<number | null>(null);
  const currentDebounce = useRef<number | null>(null);

  const portfolioValid = inputs.initialSavings > 0;
  const allocationSum = inputs.stocksPercent + inputs.bondsPercent + inputs.cashPercent;
  const allocationValid = Math.abs(allocationSum - 100) < 0.01;
  const canSimulate = portfolioValid && allocationValid;

  // Recompute the full sweep when underlying inputs / horizon change.
  useEffect(() => {
    if (!canSimulate) {
      setSweep([]);
      setError(
        !portfolioValid
          ? 'Set an initial portfolio value in the FIRE Calculator to run the simulator.'
          : `Asset allocation must sum to 100% (currently ${allocationSum.toFixed(2)}%).`,
      );
      return;
    }
    setError(null);
    if (sweepDebounce.current) window.clearTimeout(sweepDebounce.current);
    sweepDebounce.current = window.setTimeout(() => {
      setIsComputing(true);
      const sim = buildSimInputs(inputs, retirementYears, numSimulations);
      const rates = defaultWithdrawalRateRange(2, 7, 0.5);
      const out = runWithdrawalRateSweep(sim, rates);
      setSweep(out);
      setIsComputing(false);
    }, 150);
    return () => {
      if (sweepDebounce.current) window.clearTimeout(sweepDebounce.current);
    };
  }, [inputs, retirementYears, numSimulations, canSimulate, portfolioValid, allocationSum]);

  // Recompute the focused (slider) result live, with a short debounce so the
  // chart updates smoothly while the user drags.
  useEffect(() => {
    if (!canSimulate) {
      setCurrent(null);
      return;
    }
    if (currentDebounce.current) window.clearTimeout(currentDebounce.current);
    currentDebounce.current = window.setTimeout(() => {
      const sim = buildSimInputs(inputs, retirementYears, numSimulations);
      try {
        const r = runWithdrawalRateSimulation(sim, withdrawalRate);
        setCurrent(r);
      } catch {
        setCurrent(null);
      }
    }, 80);
    return () => {
      if (currentDebounce.current) window.clearTimeout(currentDebounce.current);
    };
  }, [inputs, retirementYears, numSimulations, withdrawalRate, canSimulate]);

  const chartData = useMemo(
    () =>
      sweep.map((p) => ({
        rate: `${p.withdrawalRate}%`,
        rateValue: p.withdrawalRate,
        successRate: Number(p.successRate.toFixed(1)),
        medianYears: p.medianYearsLasted,
      })),
    [sweep],
  );

  const currentAnnualWithdrawal = inputs.initialSavings * (withdrawalRate / 100);

  return (
    <div className="app-container">
      <main className="main-content" id="main-content">
        <header className="page-header">
          <h2>
            <MaterialIcon name="trending_down" className="page-header-icon" /> Withdrawal Rate Simulator
          </h2>
          <p className="page-description">
            Explore how long your portfolio is likely to last at different
            withdrawal rates. Drag the slider to see results update live.
            The famous "4% rule" comes from the Trinity Study and assumes a
            30-year retirement with a 95%+ historical success rate.
          </p>
        </header>

        {error && (
          <div className="validation-error-banner" role="alert" aria-live="polite">
            <strong>
              <MaterialIcon name="warning" /> Cannot run simulation
            </strong>
            <div className="validation-error-message">{error}</div>
          </div>
        )}

        <section className="monte-carlo-section" aria-labelledby="wr-controls-heading">
          <h3 id="wr-controls-heading" style={{ marginTop: 0 }}>
            <MaterialIcon name="tune" /> Controls
          </h3>

          <div className="mc-inputs">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="wr-rate">
                Withdrawal rate: <strong>{withdrawalRate.toFixed(1)}%</strong>{' '}
                <span style={{ color: '#94A3B8', fontWeight: 'normal' }}>
                  (≈{' '}
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    {formatDisplayCurrency(currentAnnualWithdrawal, defaultCurrency)}
                  </PrivacyBlur>{' '}
                  / year inflated)
                </span>
              </label>
              <SliderInput
                id="wr-rate"
                value={withdrawalRate}
                onChange={setWithdrawalRate}
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                unit="%"
                disabled={!canSimulate}
              />
            </div>

            <div className="form-group">
              <label htmlFor="wr-years">Retirement horizon (years)</label>
              <SliderInput
                id="wr-years"
                value={retirementYears}
                onChange={(v) => setRetirementYears(Math.round(v))}
                min={10}
                max={60}
                step={1}
                unit=" yrs"
                disabled={!canSimulate}
              />
            </div>

            <div className="form-group">
              <label htmlFor="wr-sims">Simulations per rate</label>
              <SliderInput
                id="wr-sims"
                value={numSimulations}
                onChange={(v) => setNumSimulations(Math.round(v))}
                min={200}
                max={5000}
                step={100}
                unit=""
                disabled={!canSimulate}
              />
            </div>
          </div>

          {current && (
            <div className="results-grid" role="list" style={{ marginTop: '1.5rem' }}>
              <div
                className={`result-card ${successRateClass(current.successRate)}`}
                role="listitem"
              >
                <div className="result-label">Success rate</div>
                <div className="result-value">{formatDisplayPercent(current.successRate)}</div>
                <div className="result-subtitle">
                  over {retirementYears} years at {withdrawalRate.toFixed(1)}%
                </div>
              </div>

              <div className="result-card" role="listitem">
                <div className="result-label">Median years lasted</div>
                <div className="result-value">
                  {current.medianYearsLasted.toFixed(1)}
                </div>
                <div className="result-subtitle">across {current.numSimulations} runs</div>
              </div>

              <div className="result-card" role="listitem">
                <div className="result-label">Median final portfolio</div>
                <div className="result-value">
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    {formatDisplayCurrency(current.medianFinalPortfolio, defaultCurrency)}
                  </PrivacyBlur>
                </div>
                <div className="result-subtitle">nominal, end of horizon</div>
              </div>

              <div className="result-card" role="listitem">
                <div className="result-label">10th / 90th percentile</div>
                <div className="result-value" style={{ fontSize: '1.1rem' }}>
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    {formatDisplayCurrency(current.percentile10FinalPortfolio, defaultCurrency)}
                  </PrivacyBlur>
                  {' / '}
                  <PrivacyBlur isPrivacyMode={isPrivacyMode}>
                    {formatDisplayCurrency(current.percentile90FinalPortfolio, defaultCurrency)}
                  </PrivacyBlur>
                </div>
                <div className="result-subtitle">final portfolio range</div>
              </div>
            </div>
          )}
        </section>

        {sweep.length > 0 && (
          <section
            className="monte-carlo-section"
            aria-labelledby="wr-chart-heading"
            style={{ marginTop: '1.5rem' }}
          >
            <h3 id="wr-chart-heading">
              <MaterialIcon name="bar_chart" /> Success rate by withdrawal rate
              {isComputing && (
                <span style={{ marginLeft: '0.5rem', color: '#94A3B8', fontSize: '0.9rem' }}>
                  (recomputing…)
                </span>
              )}
            </h3>
            <p className="section-description">
              Each bar shows the % of simulations where your portfolio survived
              the full {retirementYears}-year horizon at that initial withdrawal
              rate. The dashed line marks your currently selected rate.
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2D36" />
                <XAxis
                  dataKey="rate"
                  tick={{ fontSize: 12, fill: '#94A3B8' }}
                  stroke="#3A3D46"
                  label={{
                    value: 'Initial withdrawal rate',
                    position: 'insideBottom',
                    offset: -5,
                    fill: '#94A3B8',
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#94A3B8' }}
                  stroke="#3A3D46"
                  label={{
                    value: 'Success rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#94A3B8',
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1A1D26',
                    border: '1px solid #2DD4BF',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                  }}
                  formatter={(value, name) =>
                    name === 'successRate'
                      ? [`${value}%`, 'Success rate']
                      : [`${value} yrs`, 'Median years lasted']
                  }
                  labelFormatter={(label) => `Withdrawal: ${label}`}
                />
                <Bar dataKey="successRate" name="successRate">
                  {chartData.map((d) => (
                    <Cell key={d.rate} fill={successRateColor(d.successRate)} />
                  ))}
                </Bar>
                <ReferenceLine
                  x={`${
                    chartData.reduce(
                      (best, d) =>
                        Math.abs(d.rateValue - withdrawalRate) <
                        Math.abs(best.rateValue - withdrawalRate)
                          ? d
                          : best,
                      chartData[0],
                    ).rateValue
                  }%`}
                  stroke="#F8FAFC"
                  strokeDasharray="5 5"
                  label={{
                    value: 'Selected',
                    position: 'top',
                    fill: '#F8FAFC',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </section>
        )}
      </main>
    </div>
  );
};
