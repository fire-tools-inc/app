import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateTransactionId,
  INCOME_SOURCES,
  type ExpenseTrackerData,
  type IncomeEntry,
  type IncomeSource,
} from '../types/expenseTracker';
import { getScheduleOccurrences } from '../utils/cashflowSchedules';
import { logger } from '../utils/logger';
import {
  copyIncomeDraftsFromPreviousMonth,
  createIncomeDraft,
  daysInMonth,
  findCashflowMonth,
  findPreviousIncomeMonth,
  formatPeriod,
  incomeFromDraft,
  isBlankIncomeDraft,
  monthDate,
  periodKey,
  validateIncomeDraft,
  type IncomeDraft,
  type IncomeDraftErrors,
  type MonthPeriod,
} from '../utils/monthLog';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { MaterialIcon } from './MaterialIcon';
import { PreloadLink } from './PreloadLink';
import { PrivacyBlur } from './PrivacyBlur';

export interface LogMonthIncomeStepProps {
  period: MonthPeriod;
  data: ExpenseTrackerData | null;
  /** Cash flow currency, or the default currency before any data is saved. */
  currency: string;
  /** Saving is unavailable (demo or unreadable saved data); drafts can still be explored. */
  readOnly: boolean;
  privacy: boolean;
  cashflowPath: string;
  onSave: (incomes: IncomeEntry[]) => boolean;
}

function plannedIncomeCount(data: ExpenseTrackerData | null, period: MonthPeriod): number {
  if (!data?.planning?.schedules.length) return 0;
  try {
    const from = monthDate(period, 1);
    const to = monthDate(period, daysInMonth(period));
    return getScheduleOccurrences(data, from, to)
      .filter(item => item.schedule.kind === 'income' && item.status === 'planned').length;
  } catch (error) {
    logger.warn('log-month', 'planned-income-unavailable', 'planned income could not be listed for the month log', {
      pii: { error: error instanceof Error ? error.message : String(error) },
    });
    return 0;
  }
}

export function LogMonthIncomeStep({ period, data, currency, readOnly, privacy, cashflowPath, onSave }: LogMonthIncomeStepProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const monthLabel = formatPeriod(period, language);
  const incomes = findCashflowMonth(data, period)?.incomes ?? [];
  const total = incomes.reduce((sum, income) => sum + income.amount, 0);
  const previousMonth = findPreviousIncomeMonth(data, period);
  const planned = useMemo(() => plannedIncomeCount(data, period), [data, period]);
  const [drafts, setDrafts] = useState<IncomeDraft[]>(() => [createIncomeDraft(period)]);
  const [errors, setErrors] = useState<Record<string, IncomeDraftErrors>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const idPrefix = `log-month-income-${periodKey(period)}`;
  const firstDay = monthDate(period, 1);
  const lastDay = monthDate(period, daysInMonth(period));

  const updateDraft = (key: string, patch: Partial<IncomeDraft>) => {
    setDrafts(current => current.map(draft => draft.key === key ? { ...draft, ...patch } : draft));
    setErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const removeDraft = (key: string) => {
    setDrafts(current => {
      const remaining = current.filter(draft => draft.key !== key);
      return remaining.length ? remaining : [createIncomeDraft(period)];
    });
  };

  const copyPrevious = () => {
    const copied = copyIncomeDraftsFromPreviousMonth(data, period);
    if (!copied.length) return;
    setDrafts(current => [...current.filter(draft => !isBlankIncomeDraft(draft)), ...copied]);
    setMessage(null);
  };

  const filled = drafts.filter(draft => !isBlankIncomeDraft(draft));

  const save = () => {
    if (!filled.length) {
      setMessage({ tone: 'error', text: t('logMonth.income.nothingToSave') });
      return;
    }
    const nextErrors: Record<string, IncomeDraftErrors> = {};
    for (const draft of filled) {
      const draftErrors = validateIncomeDraft(draft, period);
      if (Object.keys(draftErrors).length) nextErrors[draft.key] = draftErrors;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage({ tone: 'error', text: t('logMonth.income.fixErrors') });
      return;
    }
    const entries = filled.map(draft => incomeFromDraft(draft, generateTransactionId()));
    if (onSave(entries)) {
      setDrafts([createIncomeDraft(period)]);
      setMessage({ tone: 'success', text: t('logMonth.income.saved', { count: entries.length }) });
    } else {
      setMessage(null);
    }
  };

  const errorText = (draft: IncomeDraft, field: keyof IncomeDraftErrors): string | null => {
    const code = errors[draft.key]?.[field];
    if (!code) return null;
    if (code === 'required') return t('logMonth.errors.required');
    if (code === 'outsideMonth') return t('logMonth.errors.outsideMonth', { month: monthLabel });
    return t(field === 'amount' ? 'logMonth.errors.invalidAmount' : 'logMonth.errors.invalidDate');
  };

  return (
    <div className="log-month-step-body">
      <section className="log-month-section" aria-labelledby={`${idPrefix}-logged`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-logged`}>{t('logMonth.income.logged')}</h3>
          {incomes.length > 0 && (
            <p className="log-month-total">
              {t('logMonth.income.total')}{' '}
              <strong><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(total, currency)}</PrivacyBlur></strong>
            </p>
          )}
        </div>
        {incomes.length ? (
          <div className="log-month-table-scroll" tabIndex={0} role="region" aria-labelledby={`${idPrefix}-logged`}>
            <table className="data-table log-month-table">
              <thead>
                <tr>
                  <th scope="col">{t('logMonth.fields.date')}</th>
                  <th scope="col">{t('logMonth.fields.description')}</th>
                  <th scope="col">{t('logMonth.fields.source')}</th>
                  <th scope="col" className="num">{t('logMonth.fields.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {incomes.map(income => (
                  <tr key={income.id}>
                    <td className="log-month-nowrap">{income.date}</td>
                    <td>{income.description}</td>
                    <td>{t(`logMonth.sources.${income.source}`, { defaultValue: income.source })}</td>
                    <td className="num">
                      <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(income.amount, income.currency ?? currency)}</PrivacyBlur>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="log-month-empty">{t('logMonth.income.empty')}</p>}
        {planned > 0 && (
          <div className="callout callout--info">
            <MaterialIcon name="event_upcoming" size="small" />
            <p>
              {t('logMonth.income.planned', { count: planned })}{' '}
              <PreloadLink to="/expense-tracker?tab=planning">{t('logMonth.income.openPlanning')}</PreloadLink>
            </p>
          </div>
        )}
      </section>

      <section className="log-month-section" aria-labelledby={`${idPrefix}-add`}>
        <div className="log-month-section__header">
          <h3 id={`${idPrefix}-add`}>{t('logMonth.income.add')}</h3>
          {previousMonth ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={copyPrevious}
              disabled={privacy}
              aria-describedby={`${idPrefix}-copy-hint`}
            >
              <MaterialIcon name="content_copy" size="small" />
              {t('logMonth.income.copyFrom', { month: formatPeriod(previousMonth, language) })}
            </button>
          ) : null}
        </div>
        <p id={`${idPrefix}-copy-hint`} className="field__hint">
          {!previousMonth ? t('logMonth.income.noPrevious')
            : privacy ? t('logMonth.showValuesToCopy') : t('logMonth.income.copyHint')}
        </p>
        <ul className="log-month-drafts">
          {drafts.map((draft, index) => {
            const rowId = `${idPrefix}-${draft.key}`;
            const descriptionError = errorText(draft, 'description');
            const amountError = errorText(draft, 'amount');
            const dateError = errorText(draft, 'date');
            return (
              <li key={draft.key} className="log-month-draft">
                <fieldset>
                  <legend className="visually-hidden">{t('logMonth.income.row', { number: index + 1 })}</legend>
                  <div className="field log-month-draft__description">
                    <label className="field__label" htmlFor={`${rowId}-description`}>{t('logMonth.fields.description')}</label>
                    <input
                      id={`${rowId}-description`}
                      type="text"
                      value={draft.description}
                      onChange={event => updateDraft(draft.key, { description: event.target.value })}
                      aria-invalid={descriptionError ? true : undefined}
                      aria-describedby={descriptionError ? `${rowId}-description-error` : undefined}
                      autoComplete="off"
                    />
                    {descriptionError && <span id={`${rowId}-description-error`} className="field__error">{descriptionError}</span>}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${rowId}-source`}>{t('logMonth.fields.source')}</label>
                    <select
                      id={`${rowId}-source`}
                      value={draft.source}
                      onChange={event => updateDraft(draft.key, { source: event.target.value as IncomeSource })}
                    >
                      {INCOME_SOURCES.map(source => (
                        <option key={source.id} value={source.id}>{t(`logMonth.sources.${source.id}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${rowId}-amount`}>
                      {t('logMonth.fields.amountIn', { currency: draft.currency ?? currency })}
                    </label>
                    <input
                      id={`${rowId}-amount`}
                      type="text"
                      inputMode="decimal"
                      className="log-month-number-input"
                      value={draft.amount}
                      onChange={event => updateDraft(draft.key, { amount: event.target.value })}
                      aria-invalid={amountError ? true : undefined}
                      aria-describedby={amountError ? `${rowId}-amount-error` : undefined}
                      autoComplete="off"
                    />
                    {amountError && <span id={`${rowId}-amount-error`} className="field__error">{amountError}</span>}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor={`${rowId}-date`}>{t('logMonth.fields.date')}</label>
                    <input
                      id={`${rowId}-date`}
                      type="date"
                      min={firstDay}
                      max={lastDay}
                      value={draft.date}
                      onChange={event => updateDraft(draft.key, { date: event.target.value })}
                      aria-invalid={dateError ? true : undefined}
                      aria-describedby={dateError ? `${rowId}-date-error` : undefined}
                    />
                    {dateError && <span id={`${rowId}-date-error`} className="field__error">{dateError}</span>}
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon log-month-draft__remove"
                    onClick={() => removeDraft(draft.key)}
                    aria-label={t('logMonth.income.removeRow', { number: index + 1 })}
                    title={t('logMonth.income.removeRow', { number: index + 1 })}
                  >
                    <MaterialIcon name="close" size="small" />
                  </button>
                </fieldset>
                {draft.possibleDuplicate && (
                  <p className="field__hint log-month-draft__note">
                    <MaterialIcon name="info" size="small" /> {t('logMonth.income.possibleDuplicate')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="log-month-actions">
          <button type="button" className="btn btn--ghost" onClick={() => setDrafts(current => [...current, createIncomeDraft(period)])}>
            <MaterialIcon name="add" size="small" />
            {t('logMonth.income.addRow')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={save}
            disabled={readOnly}
            aria-describedby={readOnly ? 'log-month-read-only' : undefined}
          >
            <MaterialIcon name="save" size="small" />
            {t('logMonth.income.save', { count: Math.max(1, filled.length) })}
          </button>
        </div>
        <div aria-live="polite" className="log-month-live">
          {message && (
            <p className={message.tone === 'error' ? 'field__error' : 'log-month-success'} role={message.tone === 'error' ? 'alert' : undefined}>
              {message.text}
            </p>
          )}
        </div>
        <p className="field__hint">
          {t('logMonth.income.advanced')}{' '}
          <PreloadLink to={cashflowPath}>{t('logMonth.openCashflow')}</PreloadLink>
        </p>
      </section>
    </div>
  );
}
