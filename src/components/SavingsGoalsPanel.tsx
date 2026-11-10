import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavingsGoal } from '../types/expensePlanning';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { generateTransactionId } from '../types/expenseTracker';
import { parseExpensePlanning } from '../utils/expensePlanning';
import { calendarDate } from '../utils/cashflowSchedules';
import { savingsGoalProgress } from '../utils/savingsGoals';
import { formatDisplayCurrency, formatDisplayPercent } from '../utils/numberFormatter';
import { PrivacyBlur } from './PrivacyBlur';
import { CurrencyField, PlanningField, formCurrency, formNumber, formText, usePlanningEditorFocus, type PlanningUpdate } from './ExpensePlanningFields';

export function SavingsGoalsPanel({ data, onChange, privacy, readOnly }: {
  data: ExpenseTrackerData; onChange: PlanningUpdate; privacy: boolean; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const planning = parseExpensePlanning(data.planning);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { formRef, triggerRef } = usePlanningEditorFocus(Boolean(editing));
  const money = (value: number, goal: SavingsGoal) => <PrivacyBlur isPrivacyMode={privacy}>{formatDisplayCurrency(value, goal.currency)}</PrivacyBlur>;
  return <section className="planning-section" aria-labelledby="savings-goals-title">
    <div className="planning-heading"><h3 id="savings-goals-title">{t('planning.goals')}</h3>
      <button type="button" disabled={readOnly} onClick={event => {
        triggerRef.current = event.currentTarget;
        setEditing({ id: generateTransactionId(), name: '', currency: data.currency, targetAmount: 0, savedAmount: 0, archived: false });
      }}>{t('planning.addGoal')}</button></div>
    <p>{t('planning.goalHelp')}</p>
    <label className="planning-check"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />{t('planning.showArchived')}</label>
    {editing && <form ref={formRef} className="planning-editor" key={editing.id} onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      if (onChange(current => {
        const goal: SavingsGoal = {
          id: editing.id, name: formText(fields, 'name'), currency: formCurrency(fields),
          targetAmount: formNumber(fields, 'targetAmount'), savedAmount: formNumber(fields, 'savedAmount'),
          ...(formText(fields, 'targetDate', false) ? { targetDate: formText(fields, 'targetDate') } : {}),
          archived: editing.archived,
        };
        const next = parseExpensePlanning(current.planning);
        next.goals = next.goals.some(item => item.id === goal.id)
          ? next.goals.map(item => item.id === goal.id ? goal : item) : [...next.goals, goal];
        return { ...current, planning: next };
      })) setEditing(null);
    }}>
      <fieldset disabled={readOnly}><legend>{t('planning.editGoal')}</legend><div className="planning-fields">
        <PlanningField name="name" label={t('planning.goalName')} value={editing.name} required />
        <CurrencyField value={editing.currency} />
        <PlanningField name="targetAmount" label={t('planning.targetAmount')} value={editing.targetAmount || ''} type="number" min={0.01} step={0.01} required />
        <PlanningField name="savedAmount" label={t('planning.savedAmount')} value={editing.savedAmount} type="number" min={0} step={0.01} required />
        <PlanningField name="targetDate" label={t('planning.targetDate')} value={editing.targetDate} type="date" />
      </div><div className="planning-actions"><button type="submit">{t('planning.saveGoal')}</button>
        <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button></div></fieldset>
    </form>}
    <div className="planning-goals">
      {planning.goals.filter(goal => showArchived || !goal.archived).map(goal => {
        const progress = savingsGoalProgress(goal, calendarDate());
        return <article className="planning-goal" key={goal.id}>
          <h4>{goal.name}</h4>
          <p>{money(goal.savedAmount, goal)} / {money(goal.targetAmount, goal)} <span>{goal.currency}</span></p>
          <div className="planning-progress" role="progressbar" aria-label={t('planning.goalProgress', { name: goal.name })}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={privacy ? undefined : Math.min(100, progress.progress)}
            aria-valuetext={privacy ? t('privacyBlur.ariaLabel') : formatDisplayPercent(progress.progress)}>
            <span style={{ width: `${privacy ? 0 : Math.min(100, progress.progress)}%` }} /></div>
          <dl><div><dt>{t('planning.remaining')}</dt><dd>{money(progress.remaining, goal)}</dd></div>
            <div><dt>{t('planning.monthlyContribution')}</dt><dd>{progress.monthlyContribution === null ? t('planning.noContribution') : money(progress.monthlyContribution, goal)}</dd></div></dl>
          {goal.targetDate && <p className={progress.overdue ? 'planning-warning' : ''}>{t(progress.overdue ? 'planning.overdueGoal' : 'planning.dueDate', { date: goal.targetDate })}</p>}
          <div className="planning-actions">
            <button type="button" disabled={readOnly} onClick={event => { triggerRef.current = event.currentTarget; setEditing(goal); }}>{t('common.edit')}</button>
            <button type="button" disabled={readOnly} onClick={() => onChange(current => {
              const next = parseExpensePlanning(current.planning);
              next.goals = next.goals.map(item => item.id === goal.id ? { ...item, archived: !item.archived } : item);
              return { ...current, planning: next };
            })}>{t(goal.archived ? 'planning.restore' : 'planning.archive')}</button>
          </div>
        </article>;
      })}
    </div>
    {!planning.goals.length && <p className="planning-empty">{t('planning.noGoals')}</p>}
  </section>;
}
