import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { ExpenseEntry, ExpenseTrackerData, IncomeEntry } from '../types/expenseTracker';
import type { NetWorthTrackerData } from '../types/netWorthTracker';
import { loadSettings, saveSettings } from '../utils/cookieSettings';
import {
  hasStoredExpenseTrackerData,
  hasStoredNetWorthTrackerData,
  loadExpenseTrackerData,
  loadNetWorthTrackerData,
  saveExpenseTrackerData,
} from '../utils/cookieStorage';
import { isValidCalendarDate } from '../utils/dateValidation';
import { IS_DEMO_MODE } from '../utils/demoMode';
import { calculateTransactionSummary } from '../utils/expenseCalculator';
import { logger } from '../utils/logger';
import {
  appendIncomesToMonth,
  createEmptyCashflowData,
  deriveMonthCheckIn,
  findCashflowMonth,
  findNetWorthMonth,
  findPreviousNetWorthMonth,
  formatPeriod,
  MONTH_LOG_STEPS,
  monthLogPath,
  parsePeriod,
  periodKey,
  periodOf,
  previousPeriod,
  samePeriod,
  type MonthCheckInStatus,
  type MonthLogStepId,
  type MonthPeriod,
} from '../utils/monthLog';
import { calculateMonthlyNetWorth } from '../utils/netWorthCalculator';
import { createDefaultNetWorthData, persistNetWorthData, startNetWorthMonth } from '../utils/netWorthMonthLog';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { appendExpensesToMonth } from '../utils/quickExpenseImport';
import { LogMonthExpensesStep } from './LogMonthExpensesStep';
import { LogMonthIncomeStep } from './LogMonthIncomeStep';
import { LogMonthInvestmentsStep, LogMonthPensionStep, signedCurrency } from './LogMonthNetWorthSteps';
import { MaterialIcon } from './MaterialIcon';
import { PageHeader } from './PageHeader';
import { PreloadLink } from './PreloadLink';
import { PrivacyBlur } from './PrivacyBlur';
import './LogMonthPage.css';

export const LOG_MONTH_PAGE_STEPS = [...MONTH_LOG_STEPS, 'review'] as const;
export type LogMonthPageStep = typeof LOG_MONTH_PAGE_STEPS[number];

const MONTH_CHOICES = 24;
const STATUS_ICONS = { done: 'check_circle', unchanged: 'published_with_changes', todo: 'radio_button_unchecked', none: 'remove' } as const;
const BADGE_TONES = { done: 'success', unchanged: 'warning', todo: 'neutral', none: 'neutral' } as const;

function pageStep(value: string | null): LogMonthPageStep {
  return LOG_MONTH_PAGE_STEPS.find(step => step === value) ?? 'income';
}

interface StoreState<T> {
  data: T | null;
  /** Saved data exists but could not be read; writing would overwrite it. */
  unreadable: boolean;
}

function loadCashflowState(): StoreState<ExpenseTrackerData> {
  const saved = loadExpenseTrackerData();
  return {
    data: saved ? { ...saved, globalBudgets: saved.globalBudgets ?? [] } : null,
    unreadable: !saved && !IS_DEMO_MODE && hasStoredExpenseTrackerData(),
  };
}

function loadNetWorthState(): StoreState<NetWorthTrackerData> {
  const saved = loadNetWorthTrackerData();
  const currency = loadSettings().currencySettings.defaultCurrency;
  return {
    data: saved ? { ...saved, defaultCurrency: currency } : null,
    unreadable: !saved && !IS_DEMO_MODE && hasStoredNetWorthTrackerData(),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isValidExpense(expense: ExpenseEntry, period: MonthPeriod): boolean {
  return Number.isFinite(expense.amount) && expense.amount >= 0
    && isValidCalendarDate(expense.date) && expense.date.startsWith(`${periodKey(period)}-`);
}

function StoreUnavailable({ kind }: { kind: 'cashflow' | 'netWorth' }) {
  const { t } = useTranslation();
  return (
    <div className="callout callout--danger" role="alert" id="log-month-read-only">
      <MaterialIcon name="error" size="small" />
      <p>
        {t(kind === 'cashflow' ? 'logMonth.cashflowUnreadable' : 'logMonth.netWorthUnreadable')}{' '}
        <PreloadLink to={kind === 'cashflow' ? '/expense-tracker' : '/net-worth-tracker'}>
          {t(kind === 'cashflow' ? 'logMonth.openCashflow' : 'logMonth.openNetWorth')}
        </PreloadLink>
      </p>
    </div>
  );
}

function ReviewStep({ period, status, cashflow, netWorth, privacy, onSelectStep }: {
  period: MonthPeriod;
  status: MonthCheckInStatus;
  cashflow: ExpenseTrackerData | null;
  netWorth: NetWorthTrackerData | null;
  privacy: boolean;
  onSelectStep: (step: MonthLogStepId) => string;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const month = findCashflowMonth(cashflow, period);
  const summary = calculateTransactionSummary(month?.incomes ?? [], month?.expenses ?? []);
  const cashflowCurrency = cashflow?.currency;
  const snapshot = netWorth ? findNetWorthMonth(netWorth, period.year, period.month) : undefined;
  const previous = netWorth ? findPreviousNetWorthMonth(netWorth, period.year, period.month) : null;
  const options = { includePension: netWorth?.settings.showPensionInNetWorth ?? true };
  const current = snapshot ? calculateMonthlyNetWorth(snapshot, options) : null;
  const prior = previous ? calculateMonthlyNetWorth(previous, options) : null;
  const netWorthCurrency = netWorth?.defaultCurrency;
  const blur = (content: string) => <PrivacyBlur isPrivacyMode={privacy}>{content}</PrivacyBlur>;

  return (
    <div className="log-month-step-body">
      <dl className="log-month-review">
        <div>
          <dt>{t('logMonth.review.income')}</dt>
          <dd>{blur(formatDisplayCurrency(summary.totalIncome, cashflowCurrency))}</dd>
        </div>
        <div>
          <dt>{t('logMonth.review.expenses')}</dt>
          <dd>{blur(formatDisplayCurrency(summary.totalExpenses, cashflowCurrency))}</dd>
        </div>
        <div>
          <dt>{t('logMonth.review.netBalance')}</dt>
          <dd>{blur(signedCurrency(summary.netBalance, cashflowCurrency))}</dd>
        </div>
        <div>
          <dt>{t('logMonth.review.savingsRate')}</dt>
          <dd>{summary.totalIncome > 0 ? blur(formatDisplayPercent(summary.savingsRate)) : <span className="log-month-muted">{t('logMonth.review.noIncome')}</span>}</dd>
        </div>
        <div>
          <dt>{t('logMonth.review.netWorth')}</dt>
          <dd>{current ? blur(formatDisplayCurrency(current.netWorth, netWorthCurrency)) : <span className="log-month-muted">{t('logMonth.review.noSnapshot')}</span>}</dd>
        </div>
        <div>
          <dt>{previous ? t('logMonth.review.netWorthChange', { month: formatPeriod(previous, language) }) : t('logMonth.review.netWorthChangeLabel')}</dt>
          <dd>{current && prior ? blur(signedCurrency(current.netWorth - prior.netWorth, netWorthCurrency))
            : <span className="log-month-muted">{t('logMonth.review.noComparison')}</span>}</dd>
        </div>
      </dl>
      <section className="log-month-section" aria-labelledby="log-month-review-steps">
        <div className="log-month-section__header">
          <h3 id="log-month-review-steps">{t('logMonth.review.steps')}</h3>
        </div>
        <ul className="log-month-review-steps">
          {MONTH_LOG_STEPS.map(step => (
            <li key={step}>
              <PreloadLink to={onSelectStep(step)}>{t(`logMonth.steps.${step}`)}</PreloadLink>
              <span className={`badge badge--${BADGE_TONES[status.steps[step]]}`}>{t(`logMonth.status.${status.steps[step]}`)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LogMonthPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(() => new Date());
  const currentPeriod = useMemo(() => periodOf(today), [today]);
  const rawYear = searchParams.get('year');
  const rawMonth = searchParams.get('month');
  const period = useMemo(() => parsePeriod(rawYear, rawMonth, currentPeriod), [rawYear, rawMonth, currentPeriod]);
  const step = pageStep(searchParams.get('step'));
  const stepIndex = LOG_MONTH_PAGE_STEPS.indexOf(step);

  const [settings, setSettings] = useState(loadSettings);
  const [privacyError, setPrivacyError] = useState(false);
  const privacy = settings.privacyMode;
  const [cashflow, setCashflow] = useState(loadCashflowState);
  const [netWorth, setNetWorth] = useState(loadNetWorthState);
  const netWorthRef = useRef(netWorth);
  const [cashflowError, setCashflowError] = useState(false);
  const [netWorthError, setNetWorthError] = useState(false);

  const monthLabel = formatPeriod(period, language);
  const status = useMemo(() => deriveMonthCheckIn(cashflow.data, netWorth.data, period), [cashflow.data, netWorth.data, period]);
  const cashflowPath = `/expense-tracker?year=${period.year}&month=${period.month}`;
  const netWorthPath = `/net-worth-tracker?year=${period.year}&month=${period.month}`;
  const stepPath = useCallback((target: string) => monthLogPath(period, target), [period]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastView = useRef(`${periodKey(period)}:${step}`);
  useEffect(() => {
    const view = `${periodKey(period)}:${step}`;
    if (lastView.current === view) return;
    lastView.current = view;
    headingRef.current?.focus();
  }, [period, step]);

  const goToStep = (target: LogMonthPageStep) => {
    const next = new URLSearchParams(searchParams);
    next.set('year', String(period.year));
    next.set('month', String(period.month));
    next.set('step', target);
    setSearchParams(next);
  };

  const changeMonth = (value: string) => {
    const [year, month] = value.split('-').map(Number);
    const next = new URLSearchParams(searchParams);
    next.set('year', String(year));
    next.set('month', String(month));
    next.set('step', step);
    setSearchParams(next);
  };

  const monthChoices = useMemo(() => {
    const choices: MonthPeriod[] = [];
    let cursor = currentPeriod;
    for (let index = 0; index < MONTH_CHOICES; index += 1) {
      choices.push(cursor);
      cursor = previousPeriod(cursor);
    }
    if (!choices.some(choice => samePeriod(choice, period))) {
      choices.push(period);
      choices.sort((a, b) => b.year - a.year || b.month - a.month);
    }
    return choices;
  }, [currentPeriod, period]);

  const togglePrivacy = () => {
    const next = { ...settings, privacyMode: !privacy };
    try {
      saveSettings(next);
      setSettings(next);
      setPrivacyError(false);
    } catch (error) {
      logger.error('log-month', 'privacy-save-failed', 'failed to save month log privacy preference', {
        pii: { error: errorMessage(error) },
      });
      setPrivacyError(true);
    }
  };

  /** Load the latest saved cash flow, apply a change and save it. */
  const saveCashflow = (update: (data: ExpenseTrackerData) => ExpenseTrackerData): boolean => {
    if (IS_DEMO_MODE || cashflow.unreadable) return false;
    try {
      const saved = loadExpenseTrackerData();
      if (!saved && hasStoredExpenseTrackerData()) {
        setCashflow({ data: null, unreadable: true });
        return false;
      }
      const base = saved
        ? { ...saved, globalBudgets: saved.globalBudgets ?? [] }
        : createEmptyCashflowData(settings.currencySettings.defaultCurrency);
      const next = update(base);
      saveExpenseTrackerData(next);
      setCashflow({ data: next, unreadable: false });
      setCashflowError(false);
      return true;
    } catch (error) {
      logger.error('log-month', 'cashflow-save-failed', 'month log cash flow changes could not be saved', {
        pii: { error: errorMessage(error) },
      });
      setCashflowError(true);
      return false;
    }
  };

  const saveIncomes = (incomes: IncomeEntry[]) => saveCashflow(data => appendIncomesToMonth(data, period, incomes));

  const saveExpenses = (expenses: ExpenseEntry[]) => {
    if (!expenses.every(expense => isValidExpense(expense, period))) {
      logger.error('log-month', 'invalid-expenses', 'imported expenses were rejected before saving', {
        pii: { count: expenses.length },
      });
      setCashflowError(true);
      return false;
    }
    return saveCashflow(data => appendExpensesToMonth(data, period.year, period.month, expenses));
  };

  /**
   * Apply a Net Worth change and persist it. The change stays on screen when
   * saving fails so typed values are not lost; the error offers a retry.
   */
  const commitNetWorth = useCallback((update: (data: NetWorthTrackerData) => NetWorthTrackerData): boolean => {
    const current = netWorthRef.current;
    if (IS_DEMO_MODE || current.unreadable) return false;
    let next: NetWorthTrackerData;
    try {
      const base = current.data ?? { ...createDefaultNetWorthData(loadSettings().currencySettings.defaultCurrency), years: [] };
      next = update(base);
    } catch (error) {
      logger.error('log-month', 'net-worth-update-failed', 'month log net worth change could not be applied', {
        pii: { error: errorMessage(error) },
      });
      setNetWorthError(true);
      return false;
    }
    netWorthRef.current = { data: next, unreadable: false };
    setNetWorth(netWorthRef.current);
    try {
      persistNetWorthData(next, period.year, period.month);
      setNetWorthError(false);
      return true;
    } catch (error) {
      logger.error('log-month', 'net-worth-save-failed', 'month log net worth changes could not be saved', {
        pii: { error: errorMessage(error) },
      });
      setNetWorthError(true);
      return false;
    }
  }, [period.year, period.month]);

  const retryNetWorthSave = () => {
    const data = netWorthRef.current.data;
    if (data) commitNetWorth(() => data);
  };

  const startMonth = () => {
    commitNetWorth(data => startNetWorthMonth(data, period.year, period.month).data);
  };

  const stepTitle = t(`logMonth.${step}.title`, { month: monthLabel });
  const nextStep = LOG_MONTH_PAGE_STEPS[stepIndex + 1];
  const previousStep = LOG_MONTH_PAGE_STEPS[stepIndex - 1];
  const stepState = step === 'review' ? null : status.steps[step];

  return (
    <main className="log-month" id="main-content" tabIndex={-1}>
      <PageHeader
        title={t('logMonth.title', { month: monthLabel })}
        description={t('logMonth.description')}
        actions={(
          <>
            <div className="field log-month-month-field">
              <label className="field__label" htmlFor="log-month-select">{t('logMonth.monthLabel')}</label>
              <select id="log-month-select" value={periodKey(period)} onChange={event => changeMonth(event.target.value)}>
                {monthChoices.map(choice => (
                  <option key={periodKey(choice)} value={periodKey(choice)}>{formatPeriod(choice, language)}</option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn--secondary" onClick={togglePrivacy} aria-pressed={privacy}>
              <MaterialIcon name={privacy ? 'visibility' : 'visibility_off'} size="small" />
              {t(privacy ? 'common.showValues' : 'common.hideValues')}
            </button>
          </>
        )}
      />

      {IS_DEMO_MODE && (
        <div className="callout callout--warning log-month-notice" id="log-month-read-only">
          <MaterialIcon name="lock" size="small" />
          <p>{t('logMonth.readOnly')}</p>
        </div>
      )}
      {privacyError && (
        <div className="callout callout--danger log-month-notice" role="alert">
          <MaterialIcon name="error" size="small" />
          <p>{t('dashboard.privacySaveFailed')}</p>
        </div>
      )}

      <nav className="log-month-stepper" aria-label={t('logMonth.stepsLabel')}>
        <p className="log-month-stepper__compact">
          {t('logMonth.stepOf', { current: stepIndex + 1, total: LOG_MONTH_PAGE_STEPS.length })}
          <span aria-hidden="true"> · </span>
          <strong>{t(`logMonth.steps.${step}`)}</strong>
        </p>
        <ol className="log-month-stepper__list">
          {LOG_MONTH_PAGE_STEPS.map((item, index) => {
            const state = item === 'review' ? null : status.steps[item];
            const active = item === step;
            return (
              <li key={item} className={`log-month-stepper__item${active ? ' is-active' : ''}${state ? ` is-${state}` : ''}`}>
                <PreloadLink to={stepPath(item)} className="log-month-stepper__link" aria-current={active ? 'step' : undefined}>
                  <span className="log-month-stepper__marker" aria-hidden="true">
                    {state && state !== 'todo' ? <MaterialIcon name={STATUS_ICONS[state]} size="small" /> : index + 1}
                  </span>
                  <span className="log-month-stepper__label">{t(`logMonth.steps.${item}`)}</span>
                  {state && <span className="visually-hidden">{`, ${t(`logMonth.status.${state}`)}`}</span>}
                </PreloadLink>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="panel log-month-panel" aria-labelledby="log-month-step-title">
        <header className="panel__header log-month-panel__header">
          <div>
            <h2 className="panel__title" id="log-month-step-title" ref={headingRef} tabIndex={-1}>{stepTitle}</h2>
            <p className="panel__subtitle">{t(`logMonth.${step}.description`)}</p>
          </div>
          {stepState && (
            <span className={`badge badge--${BADGE_TONES[stepState]}`}>{t(`logMonth.status.${stepState}`)}</span>
          )}
        </header>

        {cashflowError && (step === 'income' || step === 'expenses') && (
          <div className="callout callout--danger log-month-notice" role="alert">
            <MaterialIcon name="error" size="small" />
            <p>{t('logMonth.cashflowSaveFailed')}</p>
          </div>
        )}
        {netWorthError && (step === 'investments' || step === 'pension') && (
          <div className="callout callout--danger log-month-notice" role="alert">
            <MaterialIcon name="error" size="small" />
            <div className="log-month-notice__body">
              <p>{t('logMonth.netWorthSaveFailed')}</p>
              <button type="button" className="btn btn--secondary btn--sm" onClick={retryNetWorthSave}>
                <MaterialIcon name="refresh" size="small" />
                {t('logMonth.retrySave')}
              </button>
            </div>
          </div>
        )}

        {(step === 'income' || step === 'expenses') && cashflow.unreadable && <StoreUnavailable kind="cashflow" />}
        {(step === 'investments' || step === 'pension') && netWorth.unreadable && <StoreUnavailable kind="netWorth" />}

        {step === 'income' && (
          <LogMonthIncomeStep key={periodKey(period)} period={period} data={cashflow.data}
            currency={cashflow.data?.currency ?? settings.currencySettings.defaultCurrency}
            readOnly={IS_DEMO_MODE || cashflow.unreadable} privacy={privacy} cashflowPath={cashflowPath} onSave={saveIncomes} />
        )}
        {step === 'expenses' && !cashflow.unreadable && (
          <LogMonthExpensesStep key={periodKey(period)} period={period}
            data={cashflow.data ?? createEmptyCashflowData(settings.currencySettings.defaultCurrency)}
            privacy={privacy} cashflowPath={cashflowPath} onCommit={saveExpenses} />
        )}
        {step === 'investments' && (
          <LogMonthInvestmentsStep key={periodKey(period)} period={period} data={netWorth.data}
            readOnly={IS_DEMO_MODE || netWorth.unreadable} privacy={privacy} netWorthPath={netWorthPath}
            onCommit={commitNetWorth} onStart={startMonth} />
        )}
        {step === 'pension' && (
          <LogMonthPensionStep key={periodKey(period)} period={period} data={netWorth.data}
            readOnly={IS_DEMO_MODE || netWorth.unreadable} privacy={privacy} netWorthPath={netWorthPath}
            onCommit={commitNetWorth} onOpenInvestments={() => goToStep('investments')} />
        )}
        {step === 'review' && (
          <ReviewStep period={period} status={status} cashflow={cashflow.data} netWorth={netWorth.data}
            privacy={privacy} onSelectStep={stepPath} />
        )}

        <footer className="log-month-footer">
          {previousStep ? (
            <button type="button" className="btn btn--secondary" onClick={() => goToStep(previousStep)}>
              <MaterialIcon name="arrow_back" size="small" />
              {t('logMonth.back')}
            </button>
          ) : (
            <PreloadLink to="/" className="btn btn--ghost">
              <MaterialIcon name="arrow_back" size="small" />
              {t('logMonth.backToDashboard')}
            </PreloadLink>
          )}
          {nextStep ? (
            <button type="button" className={`btn ${stepState === 'todo' ? 'btn--secondary' : 'btn--primary'}`} onClick={() => goToStep(nextStep)}>
              {stepState === 'todo' ? t('logMonth.skip') : t('logMonth.next')}
              <MaterialIcon name="arrow_forward" size="small" />
            </button>
          ) : (
            <PreloadLink to="/" className="btn btn--primary">
              <MaterialIcon name="check" size="small" />
              {t('logMonth.finish')}
            </PreloadLink>
          )}
        </footer>
      </section>
    </main>
  );
}
