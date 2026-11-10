import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CashflowSchedule, Recurrence } from '../types/expensePlanning';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { generateTransactionId, getAllCategories } from '../types/expenseTracker';
import { addCalendarDays, calendarDate, getScheduleOccurrences, type ScheduleOccurrence } from '../utils/cashflowSchedules';
import { cashflowTransactions, parseExpensePlanning } from '../utils/expensePlanning';
import { linkScheduledOccurrence, recordScheduledOccurrence, skipScheduledOccurrence } from '../utils/scheduledTransactions';
import { formatDisplayCurrency } from '../utils/numberFormatter';
import { PrivacyBlur } from './PrivacyBlur';
import {
  ClassificationFields, CurrencyField, PlanningField, formClassification, formCurrency, formNumber, formText,
  usePlanningEditorFocus, type PlanningUpdate,
} from './ExpensePlanningFields';

export function CashflowSchedulesPanel({ data, onChange, privacy, readOnly }: {
  data: ExpenseTrackerData; onChange: PlanningUpdate; privacy: boolean; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const planning = parseExpensePlanning(data.planning);
  const [editing, setEditing] = useState<CashflowSchedule | null>(null);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [confirming, setConfirming] = useState<ScheduleOccurrence | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showRecorded, setShowRecorded] = useState(false);
  const [page, setPage] = useState(0);
  const { formRef, triggerRef } = usePlanningEditorFocus(Boolean(editing || confirming));
  const today = calendarDate();
  const end = addCalendarDays(today, 89);
  const from = planning.schedules.reduce((earliest, schedule) => schedule.startDate < earliest ? schedule.startDate : earliest, today);
  const occurrences = getScheduleOccurrences(data, from, end).filter(item => showRecorded || item.status !== 'recorded');
  const lastPage = Math.max(0, Math.ceil(occurrences.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const categories = new Set(getAllCategories(data.customCategories, data.categoryOverrides).map(item => item.id));
  const begin = (schedule: CashflowSchedule, button: HTMLButtonElement) => {
    triggerRef.current = button; setKind(schedule.kind); setConfirming(null); setEditing(schedule);
  };
  return <section className="planning-section" aria-labelledby="cashflow-schedules-title">
    <div className="planning-heading"><h3 id="cashflow-schedules-title">{t('planning.schedules')}</h3>
      <button type="button" disabled={readOnly} onClick={event => begin({
        id: generateTransactionId(), name: '', kind: 'expense', category: 'NO_CATEGORY', expenseType: 'NEED',
        amount: 0, currency: data.currency, startDate: today, recurrence: { unit: 'month', interval: 1 }, enabled: true, archived: false,
      }, event.currentTarget)}>{t('planning.addSchedule')}</button></div>
    <p>{t('planning.scheduleHelp')}</p>
    {editing && <form ref={formRef} key={editing.id} className="planning-editor" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      if (onChange(current => {
        const unit = (['once', 'day', 'week', 'month', 'year'] as const).find(value => value === formText(fields, 'unit'));
        if (!unit) throw new Error('Invalid recurrence.');
        const recurrence: Recurrence = { unit, interval: formNumber(fields, 'interval') };
        const schedule: CashflowSchedule = {
          id: editing.id, name: formText(fields, 'name'), amount: formNumber(fields, 'amount'), currency: formCurrency(fields),
          startDate: formText(fields, 'startDate'),
          ...(formText(fields, 'endDate', false) ? { endDate: formText(fields, 'endDate') } : {}),
          recurrence, enabled: editing.enabled, archived: editing.archived, ...formClassification(fields, kind),
        };
        if (schedule.kind === 'expense' && !categories.has(schedule.category)) throw new Error('Choose an existing category.');
        const next = parseExpensePlanning(current.planning);
        next.schedules = next.schedules.some(item => item.id === schedule.id)
          ? next.schedules.map(item => item.id === schedule.id ? schedule : item) : [...next.schedules, schedule];
        return { ...current, planning: next };
      })) setEditing(null);
    }}>
      <fieldset disabled={readOnly}><legend>{t('planning.editSchedule')}</legend><div className="planning-fields">
        <PlanningField name="name" label={t('planning.scheduleName')} value={editing.name} required />
        <div className="planning-field"><label htmlFor="schedule-kind">{t('dialogs.pdfImport.kind')}</label>
          <select id="schedule-kind" value={kind} onChange={event => setKind(event.target.value === 'income' ? 'income' : 'expense')}>
            <option value="expense">{t('expenseTracker.expense')}</option><option value="income">{t('expenseTracker.income')}</option></select></div>
        <PlanningField name="amount" label={t('expenseTracker.amount')} value={editing.amount} type="number" min={0} step={0.01} required />
        <CurrencyField value={editing.currency} />
        <PlanningField name="startDate" label={t('planning.startDate')} value={editing.startDate} type="date" required />
        <PlanningField name="endDate" label={t('planning.endDate')} value={editing.endDate} type="date" />
        <div className="planning-field"><label htmlFor="schedule-unit">{t('planning.frequency')}</label>
          <select id="schedule-unit" name="unit" defaultValue={editing.recurrence.unit}>
            {(['once', 'day', 'week', 'month', 'year'] as const).map(unit => <option key={unit} value={unit}>{t(`planning.units.${unit}`)}</option>)}
          </select></div>
        <PlanningField name="interval" label={t('planning.interval')} value={editing.recurrence.interval} type="number" min={1} step={1} required />
        <ClassificationFields kind={kind} data={data} category={editing.kind === 'expense' ? editing.category : undefined}
          expenseType={editing.kind === 'expense' ? editing.expenseType : undefined} source={editing.kind === 'income' ? editing.source : undefined} />
      </div><div className="planning-actions"><button type="submit">{t('planning.saveSchedule')}</button>
        <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button></div></fieldset>
    </form>}
    <label className="planning-check"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />{t('planning.showArchived')}</label>
    <ul className="planning-rule-list">{planning.schedules.filter(item => showArchived || !item.archived).map(schedule => {
      const broken = schedule.kind === 'expense' && !categories.has(schedule.category);
      return <li key={schedule.id}><div><strong>{schedule.name}</strong><p>
        <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(schedule.amount, schedule.currency)}</PrivacyBlur> {schedule.currency}
      </p>{broken && <p className="planning-warning">{t('planning.missingCategory')}</p>}</div>
        <div className="planning-actions">
          <label className="planning-check"><input type="checkbox" checked={schedule.enabled && !schedule.archived}
            disabled={readOnly || schedule.archived || broken} onChange={event => {
              const enabled = event.target.checked;
              onChange(current => {
                const next = parseExpensePlanning(current.planning);
                next.schedules = next.schedules.map(item => item.id === schedule.id ? { ...item, enabled } : item);
                return { ...current, planning: next };
              });
            }} />{t('planning.enabled')}</label>
          <button type="button" disabled={readOnly} onClick={event => begin(schedule, event.currentTarget)}>{t('common.edit')}</button>
          <button type="button" disabled={readOnly} onClick={() => onChange(current => {
            const next = parseExpensePlanning(current.planning);
            next.schedules = next.schedules.map(item => item.id === schedule.id ? { ...item, archived: !item.archived, enabled: item.archived } : item);
            return { ...current, planning: next };
          })}>{t(schedule.archived ? 'planning.restore' : 'planning.archive')}</button>
        </div></li>;
    })}</ul>
    <h4>{t('planning.upcoming')}</h4><p>{t('planning.upcomingHelp')}</p>
    <label className="planning-check"><input type="checkbox" checked={showRecorded} onChange={event => { setShowRecorded(event.target.checked); setPage(0); }} />{t('planning.showRecorded')}</label>
    {confirming && <form ref={formRef} className="planning-editor" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      if (onChange(current => {
        const link = formText(fields, 'transaction', false);
        return link ? linkScheduledOccurrence(current, confirming, link)
          : recordScheduledOccurrence(current, confirming, { date: formText(fields, 'date'), amount: formNumber(fields, 'amount') });
      })) setConfirming(null);
    }}>
      <fieldset disabled={readOnly}><legend>{t('planning.confirmOccurrence', { name: confirming.schedule.name })}</legend>
        <div className="planning-fields">
          <PlanningField name="date" label={t('planning.actualDate')} type="date" value={today} required />
          <PlanningField name="amount" label={t('planning.actualAmount')} type="number" value={confirming.schedule.amount} min={0} step={0.01} required />
          <div className="planning-field"><label htmlFor="occurrence-transaction">{t('planning.linkExisting')}</label>
            <select id="occurrence-transaction" name="transaction"><option value="">{t('planning.newTransaction')}</option>
              {cashflowTransactions(data).filter(item => !item.scheduleId && item.type === confirming.schedule.kind
                && (item.currency ?? data.currency) === confirming.schedule.currency).map(item =>
                <option key={item.id} value={item.id}>{item.date} - {item.description}{privacy ? '' : ` - ${formatDisplayCurrency(item.amount, confirming.schedule.currency)}`}</option>)}
            </select></div></div>
        <p>{t('planning.linkHelp')}</p><div className="planning-actions">
          <button type="submit">{t('planning.recordTransaction')}</button><button type="button" onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
        </div></fieldset>
    </form>}
    <div className="planning-scroll" role="region" tabIndex={0} aria-label={t('planning.upcoming')}>
      <table><thead><tr><th>{t('expenseTracker.date')}</th><th>{t('planning.scheduleName')}</th><th>{t('expenseTracker.amount')}</th><th>{t('planning.status')}</th><th>{t('planning.actions')}</th></tr></thead>
        <tbody>{occurrences.slice(currentPage * 20, currentPage * 20 + 20).map(occurrence => {
          const broken = occurrence.schedule.kind === 'expense' && !categories.has(occurrence.schedule.category);
          return <tr key={`${occurrence.scheduleId}:${occurrence.scheduledDate}`}>
            <td>{occurrence.scheduledDate}</td><td>{occurrence.schedule.name}</td>
            <td><PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(occurrence.transaction?.amount ?? occurrence.schedule.amount, occurrence.schedule.currency)}</PrivacyBlur> {occurrence.schedule.currency}</td>
            <td className={occurrence.status === 'planned' && occurrence.scheduledDate < today ? 'planning-warning' : ''}>{t(`planning.statuses.${occurrence.status === 'planned' && occurrence.scheduledDate < today ? 'overdue' : occurrence.status}`)}</td>
            <td><div className="planning-actions">{occurrence.status !== 'recorded' && <>
              <button type="button" disabled={readOnly || broken} onClick={event => {
                triggerRef.current = event.currentTarget; setEditing(null); setConfirming(occurrence);
              }}>{t('planning.record')}</button>
              <button type="button" disabled={readOnly || broken} onClick={() => onChange(current =>
                skipScheduledOccurrence(current, occurrence, occurrence.status !== 'skipped'))}>{t(occurrence.status === 'skipped' ? 'planning.restore' : 'planning.skip')}</button>
            </>}</div></td>
          </tr>;
        })}</tbody></table></div>
    {!occurrences.length && <p className="planning-empty">{t('planning.noUpcoming')}</p>}
    {lastPage > 0 && <nav className="planning-actions" aria-label={t('planning.pages')}>
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('planning.previous')}</button>
      <span>{t('planning.page', { current: currentPage + 1, total: lastPage + 1 })}</span>
      <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>{t('planning.next')}</button>
    </nav>}
  </section>;
}
