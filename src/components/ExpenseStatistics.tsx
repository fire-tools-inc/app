import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types/currency';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { formatDashboardMonth } from '../utils/dashboard';
import { isValidCalendarDate } from '../utils/dateValidation';
import { calculateExpenseStatistics } from '../utils/expenseStatistics';
import { createLazyComponent } from '../utils/lazyComponent';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { ChartLoadFailure, ChartLoadingFallback } from './ChartLoadingState';
import { PrivacyBlur } from './PrivacyBlur';
import './ExpenseStatistics.css';

const ExpenseStatisticsChart = createLazyComponent(
  'expense-statistics-chart',
  () => import('./ExpenseStatisticsChart').then(module => module.ExpenseStatisticsChart),
  () => <ChartLoadFailure />,
);

interface ExpenseStatisticsProps {
  data: ExpenseTrackerData;
  isPrivacyMode: boolean;
  now?: Date;
}

type StatisticsView = 'ytd' | 'yearly' | 'custom';

export function ExpenseStatistics({ data, isPrivacyMode, now = new Date() }: ExpenseStatisticsProps) {
  const { t, i18n } = useTranslation();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const yearStart = `${now.getFullYear()}-01-01`;
  const [view, setView] = useState<StatisticsView>('ytd');
  const [currency, setCurrency] = useState<SupportedCurrency>(data.currency);
  const history = calculateExpenseStatistics(data, yearStart, today, currency);
  const [customStart, setCustomStart] = useState(history.historyStartDate ?? yearStart);
  const [customEnd, setCustomEnd] = useState(today);
  const start = view === 'custom' ? customStart : view === 'yearly'
    ? `${(history.historyStartDate ?? yearStart).slice(0, 4)}-01-01` : yearStart;
  const end = view === 'custom' ? customEnd : view === 'yearly'
    ? `${(history.historyEndDate ?? today).slice(0, 4)}-12-31` : today;
  const validRange = isValidCalendarDate(start) && isValidCalendarDate(end) && start <= end;
  const result = validRange ? calculateExpenseStatistics(data, start, end, currency) : null;
  const points = result ? (view === 'yearly' ? result.yearly : result.monthly) : [];
  const label = (period: string) => period.length === 4 ? period
    : formatDashboardMonth(period, i18n.resolvedLanguage ?? 'en');
  const formatValue = (amount: number | null) => amount === null ? '—' : formatDisplayCurrency(amount, currency);
  const metrics = result ? [
    ['total', result.total],
    ['monthlyAverage', result.monthlyAverage],
    ['yearlyAverage', result.yearlyAverage],
    ['historyMonthlyAverage', result.historyMonthlyAverage],
  ] as const : [];

  return (
    <section className="expense-statistics" aria-labelledby="expense-statistics-title">
      <h4 id="expense-statistics-title">{t('expenseStatistics.title')}</h4>
      <div className="expense-statistics-controls">
        <div className="expense-statistics-field">
          <label htmlFor="expense-statistics-view">{t('expenseStatistics.view')}</label>
          <select id="expense-statistics-view" value={view} onChange={event => setView(event.target.value as StatisticsView)}>
            <option value="ytd">{t('expenseStatistics.ytd')}</option>
            <option value="yearly">{t('expenseStatistics.yearly')}</option>
            <option value="custom">{t('expenseStatistics.custom')}</option>
          </select>
        </div>
        <div className="expense-statistics-field">
          <label htmlFor="expense-statistics-currency">{t('expenseStatistics.currency')}</label>
          <select id="expense-statistics-currency" value={currency} onChange={event => setCurrency(event.target.value as SupportedCurrency)}>
            {SUPPORTED_CURRENCIES.map(item => <option value={item.code} key={item.code}>{item.code}</option>)}
          </select>
        </div>
        {view === 'custom' && <>
          <div className="expense-statistics-field">
            <label htmlFor="expense-statistics-from">{t('expenseStatistics.from')}</label>
            <input id="expense-statistics-from" type="date" value={customStart} onChange={event => setCustomStart(event.target.value)}
              min="1900-01-01" max="2100-12-31" aria-invalid={!validRange} />
          </div>
          <div className="expense-statistics-field">
            <label htmlFor="expense-statistics-to">{t('expenseStatistics.to')}</label>
            <input id="expense-statistics-to" type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)}
              min="1900-01-01" max="2100-12-31" aria-invalid={!validRange} />
          </div>
        </>}
      </div>
      <p className="expense-statistics-help">{t('expenseStatistics.currencyHelp')}</p>
      {!validRange && <p role="alert">{t('expenseStatistics.invalidRange')}</p>}
      {result && <>
        <p className="expense-statistics-help">{t('expenseStatistics.selectedRange', { start, end })}</p>
        <div className="expense-statistics-metrics">
          {metrics.map(([key, amount]) => (
            <dl key={key} role="group" aria-label={t(`expenseStatistics.${key}`)}>
              <dt>{t(`expenseStatistics.${key}`)}</dt>
              <dd><PrivacyBlur isPrivacyMode={isPrivacyMode}><span>{formatValue(amount)}</span></PrivacyBlur></dd>
            </dl>
          ))}
        </div>
        <p className="expense-statistics-help">{t('expenseStatistics.periodHelp')}</p>
        <p className="expense-statistics-help">
          {t('expenseStatistics.historyHelp', { count: result.historyMonthCount })}
        </p>
        {result.historyStartDate && result.historyEndDate && <p className="expense-statistics-help">
          {t('expenseStatistics.historyRange', { start: result.historyStartDate, end: result.historyEndDate })}
        </p>}
        {result.invalidTransactionCount > 0 && <p role="alert">
          {t('expenseStatistics.invalidRecords', { count: result.invalidTransactionCount })}
        </p>}
        {result.transactionCount === 0 && <p>{t('expenseStatistics.noData')}</p>}
        <Suspense fallback={<ChartLoadingFallback />}>
          <ExpenseStatisticsChart data={points} average={view === 'yearly' ? result.yearlyAverage : result.monthlyAverage}
            currency={currency} isPrivacyMode={isPrivacyMode} />
        </Suspense>
        <details>
          <summary>{t('expenseStatistics.viewData')}</summary>
          <div className="expense-statistics-table" role="region" tabIndex={0} aria-label={t('expenseStatistics.tableCaption')}>
            <table>
              <caption>{t('expenseStatistics.tableCaption')}</caption>
              <thead><tr><th scope="col">{t('expenseStatistics.period')}</th><th scope="col">{t('expenseStatistics.total')}</th></tr></thead>
              <tbody>{points.map(point => <tr key={point.period}>
                <th scope="row">{label(point.period)}</th>
                <td>{isPrivacyMode ? '***' : formatValue(point.total)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </>}
    </section>
  );
}
