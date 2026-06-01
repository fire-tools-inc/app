import { useEffect, useMemo, useState } from 'react';
import { Debt, DebtRepaymentMethod, DebtRepaymentMode } from '../types/debt';
import {
  calculatePlan,
  recommendMethod,
  sumMinimumPayments,
} from '../utils/debtPayoffCalculator';
import {
  loadDebtPayoffData,
  saveDebtPayoffData,
  clearDebtPayoffData,
} from '../utils/cookieStorage';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { logger } from '../utils/logger';
import { DebtRepaymentChart } from './DebtRepaymentChart';
import './DebtPayoffPage.css';

const DEFAULT_DEBTS: Debt[] = [
  { id: 'd1', name: 'Credit card', balance: 5000, minPayment: 150, interestRate: 19.99 },
  { id: 'd2', name: 'Car loan', balance: 12000, minPayment: 320, interestRate: 6.5 },
];

function newDebt(): Debt {
  return {
    id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    balance: 0,
    minPayment: 0,
    interestRate: 0,
  };
}

export function DebtPayoffPage() {
  const [debts, setDebts] = useState<Debt[]>(DEFAULT_DEBTS);
  const [method, setMethod] = useState<DebtRepaymentMethod>('avalanche');
  const [mode, setMode] = useState<DebtRepaymentMode>('fixed-budget');
  const [monthlyBudget, setMonthlyBudget] = useState<number>(800);
  const [targetMonths, setTargetMonths] = useState<number>(36);
  const [hydrated, setHydrated] = useState(false);

  // Load from cookie on mount.
  useEffect(() => {
    const saved = loadDebtPayoffData();
    if (saved) {
      setDebts(saved.debts.length ? saved.debts : DEFAULT_DEBTS);
      setMethod(saved.method);
      setMode(saved.mode);
      setMonthlyBudget(saved.monthlyBudget);
      setTargetMonths(saved.targetMonths);
    }
    setHydrated(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      saveDebtPayoffData({ debts, method, mode, monthlyBudget, targetMonths });
    } catch (error) {
      logger.error('debt-payoff', 'save-failed', 'failed to persist debt payoff data', {
        pii: { error: (error as Error)?.message },
      });
    }
  }, [hydrated, debts, method, mode, monthlyBudget, targetMonths]);

  const minPaymentSum = useMemo(() => sumMinimumPayments(debts), [debts]);

  const plan = useMemo(() => {
    return calculatePlan(debts, method, mode, monthlyBudget, targetMonths);
  }, [debts, method, mode, monthlyBudget, targetMonths]);

  const recommendation = useMemo(() => {
    const budget = mode === 'fixed-timeline' ? plan.monthlyBudget : monthlyBudget;
    if (!budget || budget <= 0) return null;
    return recommendMethod(debts, budget, method);
  }, [debts, method, mode, monthlyBudget, plan.monthlyBudget]);

  const updateDebt = (id: string, patch: Partial<Debt>) => {
    setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addDebt = () => setDebts((prev) => [...prev, newDebt()]);
  const removeDebt = (id: string) =>
    setDebts((prev) => prev.filter((d) => d.id !== id));

  const reset = () => {
    setDebts(DEFAULT_DEBTS);
    setMethod('avalanche');
    setMode('fixed-budget');
    setMonthlyBudget(800);
    setTargetMonths(36);
    clearDebtPayoffData();
  };

  const yearsFromMonths = (m: number): string => {
    if (!m) return '0';
    const years = Math.floor(m / 12);
    const months = m % 12;
    if (years === 0) return `${months}m`;
    if (months === 0) return `${years}y`;
    return `${years}y ${months}m`;
  };

  return (
    <main className="debt-payoff-page" id="main-content">
      <h2>Debt Payoff Calculator</h2>
      <p>
        Plan how to pay off your debts using either the snowball method
        (smallest balance first, for psychological wins) or the avalanche
        method (highest interest rate first, mathematically optimal). Choose
        a fixed monthly budget or a target payoff timeline.
      </p>

      <section className="debt-payoff-section" aria-label="Your debts">
        <h3>Your debts</h3>
        <table className="debt-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Balance</th>
              <th>Min. payment</th>
              <th>Interest rate %</th>
              <th>Mortgage</th>
              <th className="debt-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.id}>
                <td>
                  <input
                    type="text"
                    value={d.name}
                    placeholder="Debt name"
                    onChange={(e) => updateDebt(d.id, { name: e.target.value })}
                    aria-label="Debt name"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={d.balance}
                    onChange={(e) =>
                      updateDebt(d.id, { balance: Number(e.target.value) || 0 })
                    }
                    aria-label="Balance"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={d.minPayment}
                    onChange={(e) =>
                      updateDebt(d.id, { minPayment: Number(e.target.value) || 0 })
                    }
                    aria-label="Minimum payment"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={d.interestRate}
                    onChange={(e) =>
                      updateDebt(d.id, { interestRate: Number(e.target.value) || 0 })
                    }
                    aria-label="Interest rate"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!d.isMortgage}
                    onChange={(e) => updateDebt(d.id, { isMortgage: e.target.checked })}
                    aria-label="Is mortgage"
                  />
                </td>
                <td className="debt-actions">
                  <button
                    type="button"
                    className="debt-payoff-btn danger"
                    onClick={() => removeDebt(d.id)}
                    aria-label={`Remove ${d.name || 'debt'}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="debt-payoff-actions">
          <button type="button" className="debt-payoff-btn" onClick={addDebt}>
            + Add debt
          </button>
          <button type="button" className="debt-payoff-btn secondary" onClick={reset}>
            Reset
          </button>
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: '#666' }}>
          Total minimum payments: <strong>{formatDisplayCurrency(minPaymentSum)}</strong> per month.
        </p>
      </section>

      <section className="debt-payoff-section" aria-label="Strategy">
        <h3>Strategy</h3>
        <div className="debt-payoff-grid">
          <div className="debt-payoff-field">
            <label htmlFor="dp-method">Repayment method</label>
            <select
              id="dp-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as DebtRepaymentMethod)}
            >
              <option value="avalanche">Avalanche (highest interest first)</option>
              <option value="snowball">Snowball (smallest balance first)</option>
            </select>
          </div>
          <div className="debt-payoff-field">
            <label htmlFor="dp-mode">Repayment mode</label>
            <select
              id="dp-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as DebtRepaymentMode)}
            >
              <option value="fixed-budget">Fixed monthly budget</option>
              <option value="fixed-timeline">Fixed payoff timeline</option>
            </select>
          </div>
          {mode === 'fixed-budget' ? (
            <div className="debt-payoff-field">
              <label htmlFor="dp-budget">Monthly budget</label>
              <input
                id="dp-budget"
                type="number"
                min={0}
                step={1}
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Number(e.target.value) || 0)}
              />
            </div>
          ) : (
            <div className="debt-payoff-field">
              <label htmlFor="dp-months">Target months to payoff</label>
              <input
                id="dp-months"
                type="number"
                min={1}
                step={1}
                value={targetMonths}
                onChange={(e) => setTargetMonths(Number(e.target.value) || 0)}
              />
            </div>
          )}
        </div>
      </section>

      {!plan.feasible && (
        <div className="debt-payoff-error" role="alert">
          {plan.infeasibleReason === 'budget-below-minimums' && (
            <>Your monthly budget is lower than the sum of minimum payments
              ({formatDisplayCurrency(minPaymentSum)}). Increase the budget to continue.</>
          )}
          {plan.infeasibleReason === 'budget-below-interest' && (
            <>Your monthly budget doesn't cover the first month of interest.
              The balances would keep growing. Increase the budget.</>
          )}
          {plan.infeasibleReason === 'timeline-impossible' && (
            <>The chosen timeline isn't achievable — even the largest tested
              budget couldn't clear the debts in {targetMonths} months. Try a
              longer timeline.</>
          )}
          {plan.infeasibleReason === 'invalid-timeline' && (
            <>Enter a positive number of months for the target timeline.</>
          )}
          {plan.infeasibleReason === 'exceeds-max-months' && (
            <>The payoff exceeds 50 years at this budget. Increase your budget.</>
          )}
        </div>
      )}

      {plan.feasible && plan.timeline.length > 0 && (
        <>
          <section className="debt-payoff-section" aria-label="Plan summary">
            <h3>Plan summary</h3>
            <div className="debt-payoff-summary">
              <div className="debt-payoff-summary-card">
                <div className="label">Time to debt-free</div>
                <div className="value">{yearsFromMonths(plan.monthsToPayoff)}</div>
              </div>
              <div className="debt-payoff-summary-card">
                <div className="label">Monthly budget</div>
                <div className="value">{formatDisplayCurrency(plan.monthlyBudget)}</div>
              </div>
              <div className="debt-payoff-summary-card">
                <div className="label">Total interest paid</div>
                <div className="value">{formatDisplayCurrency(plan.totalInterestPaid)}</div>
              </div>
              <div className="debt-payoff-summary-card">
                <div className="label">Total paid</div>
                <div className="value">
                  {formatDisplayCurrency(plan.totalInterestPaid + plan.totalPrincipalPaid)}
                </div>
              </div>
            </div>

            {recommendation && (
              <div className="debt-payoff-recommend" role="note">
                <strong>Recommendation:</strong> the{' '}
                <em>{recommendation.recommendedMethod}</em> method would save
                you {formatDisplayCurrency(recommendation.interestSaved)} in
                interest
                {recommendation.monthsSaved > 0
                  ? ` and finish ${recommendation.monthsSaved} month${
                      recommendation.monthsSaved === 1 ? '' : 's'
                    } sooner`
                  : ''}
                .
              </div>
            )}
          </section>

          <section className="debt-payoff-section" aria-label="Per-debt breakdown">
            <h3>Per-debt payoff order</h3>
            <table className="debt-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Payoff month</th>
                  <th>Interest paid</th>
                  <th>Total paid</th>
                </tr>
              </thead>
              <tbody>
                {[...plan.perDebt]
                  .sort((a, b) => a.payoffMonth - b.payoffMonth)
                  .map((d, idx) => (
                    <tr key={d.debtId}>
                      <td>{idx + 1}</td>
                      <td>{d.name || `Debt ${idx + 1}`}</td>
                      <td>
                        {d.payoffMonth} ({yearsFromMonths(d.payoffMonth)})
                      </td>
                      <td>{formatDisplayCurrency(d.totalInterestPaid)}</td>
                      <td>
                        {formatDisplayCurrency(
                          d.totalInterestPaid + d.totalPrincipalPaid,
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className="debt-payoff-section" aria-label="Timeline chart">
            <h3>Repayment timeline</h3>
            <DebtRepaymentChart timeline={plan.timeline} debts={debts.filter((d) => d.balance > 0)} />
          </section>
        </>
      )}
    </main>
  );
}
