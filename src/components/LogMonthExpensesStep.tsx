import { useTranslation } from 'react-i18next';
import { getCategoryInfo, type ExpenseEntry, type ExpenseTrackerData } from '../types/expenseTracker';
import { calculateCategoryBreakdown } from '../utils/expenseCalculator';
import { findCashflowMonth, formatPeriod, periodKey, type MonthPeriod } from '../utils/monthLog';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { PreloadLink } from './PreloadLink';
import { PrivacyBlur } from './PrivacyBlur';
import { QuickExpenseImport } from './QuickExpenseImport';

export interface LogMonthExpensesStepProps {
  period: MonthPeriod;
  data: ExpenseTrackerData;
  privacy: boolean;
  cashflowPath: string;
  /** Returns true only when the expenses were saved. The page explains failures. */
  onCommit: (expenses: ExpenseEntry[]) => boolean;
}

export function LogMonthExpensesStep({ period, data, privacy, cashflowPath, onCommit }: LogMonthExpensesStepProps) {
  const { t, i18n } = useTranslation();
  const monthLabel = formatPeriod(period, i18n.resolvedLanguage ?? 'en');
  const expenses = findCashflowMonth(data, period)?.expenses ?? [];
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const topCategories = calculateCategoryBreakdown(expenses)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 3);
  const idPrefix = `log-month-expenses-${periodKey(period)}`;

  // Throwing tells the quick import that nothing was saved, so it keeps the typed rows.
  const commit = (entries: ExpenseEntry[]) => {
    if (!onCommit(entries)) throw new Error('Expenses were not saved.');
  };

  return (
    <div className="log-month-step-body">
      <section className="log-month-section" aria-labelledby={`${idPrefix}-logged`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-logged`}>{t('logMonth.expenses.logged')}</h3>
        </div>
        {expenses.length ? (
          <dl className="log-month-summary">
            <div>
              <dt>{t('logMonth.expenses.countLabel')}</dt>
              <dd>{t('logMonth.expenses.count', { count: expenses.length })}</dd>
            </div>
            <div>
              <dt>{t('logMonth.expenses.total')}</dt>
              <dd><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(total, data.currency)}</PrivacyBlur></dd>
            </div>
            <div className="log-month-summary__wide">
              <dt>{t('logMonth.expenses.topCategories')}</dt>
              <dd>
                <ul className="log-month-categories">
                  {topCategories.map(item => (
                    <li key={item.category}>
                      <span>{getCategoryInfo(item.category, data.customCategories, data.categoryOverrides).name}</span>
                      <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(item.totalAmount, data.currency)}</PrivacyBlur>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        ) : <p className="log-month-empty">{t('logMonth.expenses.empty', { month: monthLabel })}</p>}
      </section>

      <div className="log-month-section">
        <QuickExpenseImport year={period.year} month={period.month} data={data} onCommit={commit} variant="inline" />
        <p className="field__hint">
          {t('logMonth.expenses.advanced')}{' '}
          <PreloadLink to={cashflowPath}>{t('logMonth.openCashflow')}</PreloadLink>
        </p>
      </div>
    </div>
  );
}
