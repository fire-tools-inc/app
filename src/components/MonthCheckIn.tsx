import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatPeriod,
  MONTH_LOG_STEPS,
  monthLogPath,
  periodKey,
  samePeriod,
  type MonthLogOverview,
  type MonthLogStepState,
} from '../utils/monthLog';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import './MonthCheckIn.css';

const BADGE_TONES: Record<MonthLogStepState, string> = {
  done: 'success', unchanged: 'warning', todo: 'neutral', none: 'neutral',
};

/** Header call to action for the month the dashboard suggests logging. */
export function LogMonthLink({ overview }: { overview: MonthLogOverview }) {
  const { t, i18n } = useTranslation();
  const month = formatPeriod(overview.suggested, i18n.resolvedLanguage ?? 'en');
  return (
    <PreloadLink to={monthLogPath(overview.suggested)} className="btn btn--primary month-check-in-cta">
      <MaterialIcon name="edit_calendar" size="small" />
      {t('logMonth.cta', { month })}
    </PreloadLink>
  );
}

/** Dashboard card with derived status of the four monthly check-in steps. */
export function MonthCheckIn({ overview }: { overview: MonthLogOverview }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const [selectedKey, setSelectedKey] = useState(() => periodKey(overview.suggested));
  const status = overview.months.find(item => periodKey(item.period) === selectedKey) ?? overview.months[0];
  const month = formatPeriod(status.period, language);
  const suggestsPrevious = !samePeriod(overview.suggested, overview.current) && samePeriod(status.period, overview.suggested);
  const action = status.isComplete ? 'review' : status.hasStarted ? 'continue' : 'start';
  const target = monthLogPath(status.period, status.isComplete ? 'review' : status.nextStep ?? 'income');

  return (
    <section className="panel month-check-in" aria-labelledby="month-check-in-title">
      <header className="panel__header month-check-in__header">
        <div>
          <h2 className="panel__title" id="month-check-in-title">{t('logMonth.checkIn.title')}</h2>
          <p className="panel__subtitle">{t('logMonth.checkIn.subtitle')}</p>
        </div>
        <div className="field month-check-in__month">
          <label className="field__label" htmlFor="month-check-in-month">{t('logMonth.monthLabel')}</label>
          <select id="month-check-in-month" value={periodKey(status.period)} onChange={event => setSelectedKey(event.target.value)}>
            {overview.months.map(item => (
              <option key={periodKey(item.period)} value={periodKey(item.period)}>{formatPeriod(item.period, language)}</option>
            ))}
          </select>
        </div>
      </header>
      {suggestsPrevious && <p className="month-check-in__hint">{t('logMonth.checkIn.previousSuggested', { month })}</p>}
      <ol className="month-check-in__steps" aria-label={t('logMonth.checkIn.stepsFor', { month })}>
        {MONTH_LOG_STEPS.map((step, index) => {
          const state = status.steps[step];
          return (
            <li key={step}>
              <PreloadLink to={monthLogPath(status.period, step)} className="month-check-in__step">
                <span className="month-check-in__index" aria-hidden="true">{index + 1}</span>
                <span className="month-check-in__name">{t(`logMonth.steps.${step}`)}</span>
                <span className={`badge badge--${BADGE_TONES[state]}`}>{t(`logMonth.status.${state}`)}</span>
              </PreloadLink>
            </li>
          );
        })}
      </ol>
      <footer className="month-check-in__footer">
        <p className="month-check-in__progress">
          {status.isComplete
            ? t('logMonth.checkIn.complete', { month })
            : t('logMonth.checkIn.progress', { done: status.completedCount, total: MONTH_LOG_STEPS.length })}
        </p>
        <PreloadLink to={target} className="btn btn--secondary">
          {t(`logMonth.checkIn.${action}`, { month })}
          <MaterialIcon name="arrow_forward" size="small" />
        </PreloadLink>
      </footer>
    </section>
  );
}
