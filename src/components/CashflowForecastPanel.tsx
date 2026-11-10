import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { buildCashflowForecast, calendarDate } from '../utils/cashflowSchedules';
import { parseExpensePlanning } from '../utils/expensePlanning';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { createLazyComponent } from '../utils/lazyComponent';
import { useDeferredRender } from '../hooks/useDeferredRender';
import { ChartLoadFailure, ChartLoadingFallback } from './ChartLoadingState';
import { PrivacyBlur } from './PrivacyBlur';
import { CurrencyField, PlanningField, formCurrency, formNumber, formText, type PlanningUpdate } from './ExpensePlanningFields';

const ForecastChart = createLazyComponent('cashflow-forecast-chart',
  () => import('./CashflowForecastChart').then(module => module.CashflowForecastChart), () => <ChartLoadFailure />);

export function CashflowForecastPanel({ data, onChange, privacy, readOnly }: {
  data: ExpenseTrackerData; onChange: PlanningUpdate; privacy: boolean; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const inputs = parseExpensePlanning(data.planning).forecast;
  const renderCharts = useDeferredRender();
  const forecast = inputs ? buildCashflowForecast(data, inputs) : null;
  const money = (value: number) => <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(value, inputs?.currency ?? data.currency)}</PrivacyBlur>;
  return <section className="planning-section" aria-labelledby="cashflow-forecast-title">
    <h3 id="cashflow-forecast-title">{t('planning.forecast')}</h3><p>{t('planning.forecastHelp')}</p>
    {privacy ? <p>{t('planning.showValuesToEdit')}</p> : <form className="planning-editor" key={inputs ? JSON.stringify(inputs) : 'empty'} onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      onChange(current => {
        const horizon = ([30, 90, 365] as const).find(value => value === formNumber(fields, 'horizon'));
        if (!horizon) throw new Error('Invalid forecast horizon.');
        const next = parseExpensePlanning(current.planning);
        next.forecast = {
          openingBalance: formNumber(fields, 'openingBalance'), startDate: formText(fields, 'startDate'),
          horizon, currency: formCurrency(fields),
        };
        const updated = { ...current, planning: next };
        buildCashflowForecast(updated, next.forecast);
        return updated;
      });
    }}><fieldset disabled={readOnly}><legend>{t('planning.forecastInputs')}</legend>
      <div className="planning-fields">
        <PlanningField name="openingBalance" label={t('planning.openingBalance')} type="number" step={0.01} value={inputs?.openingBalance} required />
        <PlanningField name="startDate" label={t('planning.balanceDate')} type="date" value={inputs?.startDate ?? calendarDate()} required />
        <CurrencyField value={inputs?.currency ?? data.currency} />
        <div className="planning-field"><label htmlFor="forecast-horizon">{t('planning.horizon')}</label>
          <select id="forecast-horizon" name="horizon" defaultValue={inputs?.horizon ?? 90}>
            {[30, 90, 365].map(days => <option key={days} value={days}>{t('planning.days', { count: days })}</option>)}
          </select></div></div><button type="submit">{t('planning.saveForecast')}</button></fieldset>
    </form>}
    {forecast ? <>
      <dl className="planning-totals"><div><dt>{t('planning.endingBalance')}</dt><dd>{money(forecast.finalBalance)}</dd></div>
        <div><dt>{t('planning.lowestBalance')}</dt><dd>{money(forecast.lowestBalance)}</dd></div></dl>
      {forecast.firstNegativeDate && <p className="planning-warning">{t('planning.negativeBalance', { date: forecast.firstNegativeDate })}</p>}
      {forecast.invalidTransactionCount > 0 && <p className="planning-warning" role="alert">{t('planning.invalidTransactions', { count: forecast.invalidTransactionCount })}</p>}
      {!privacy && renderCharts && <Suspense fallback={<ChartLoadingFallback />}><ForecastChart forecast={forecast} /></Suspense>}
      <details><summary>{t('planning.viewForecastData')}</summary>
        <div className="planning-scroll" role="region" tabIndex={0} aria-label={t('planning.forecastData')}>
          <table><caption>{t('planning.forecastData')}</caption><thead><tr>
            <th>{t('expenseTracker.date')}</th><th>{t('planning.recordedIncome')}</th><th>{t('planning.recordedExpenses')}</th>
            <th>{t('planning.plannedIncome')}</th><th>{t('planning.plannedExpenses')}</th><th>{t('planning.balance')}</th>
          </tr></thead><tbody>{forecast.points.map(point => <tr key={point.date}><td>{point.date}</td>
            <td>{money(point.recordedIncome)}</td><td>{money(point.recordedExpenses)}</td>
            <td>{money(point.plannedIncome)}</td><td>{money(point.plannedExpenses)}</td><td>{money(point.balance)}</td>
          </tr>)}</tbody></table></div>
      </details>
    </> : <p className="planning-empty">{t('planning.noForecast')}</p>}
  </section>;
}
