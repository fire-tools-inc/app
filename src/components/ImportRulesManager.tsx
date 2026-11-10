import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import { generateTransactionId, getAllCategories } from '../types/expenseTracker';
import type { ImportCategorizationRule } from '../types/expensePlanning';
import { parseExpensePlanning } from '../utils/expensePlanning';
import {
  ClassificationFields, PlanningField, CurrencyField, formClassification, formCurrency, formNumber,
  formText, usePlanningEditorFocus, type PlanningUpdate,
} from './ExpensePlanningFields';

export function ImportRulesManager({ data, onChange, readOnly }: {
  data: ExpenseTrackerData; onChange: PlanningUpdate; readOnly: boolean;
}) {
  const { t } = useTranslation();
  const planning = parseExpensePlanning(data.planning);
  const [editing, setEditing] = useState<ImportCategorizationRule | null>(null);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const { formRef, triggerRef } = usePlanningEditorFocus(Boolean(editing));
  const categories = new Set(getAllCategories(data.customCategories, data.categoryOverrides).map(item => item.id));
  const rules = [...planning.rules].sort((a, b) => a.priority - b.priority);
  const begin = (rule: ImportCategorizationRule, button: HTMLButtonElement) => {
    triggerRef.current = button; setKind(rule.kind); setEditing(rule);
  };
  const move = (id: string, offset: number) => onChange(current => {
    const next = parseExpensePlanning(current.planning);
    const ordered = [...next.rules].sort((a, b) => a.priority - b.priority);
    const index = ordered.findIndex(rule => rule.id === id);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= ordered.length) throw new Error('Invalid rule order.');
    [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    next.rules = ordered.map((rule, priority) => ({ ...rule, priority }));
    return { ...current, planning: next };
  });
  return <section className="cashflow-planning planning-section" aria-labelledby="import-rules-title">
    <div className="planning-heading"><h3 id="import-rules-title">{t('planning.rules')}</h3>
      <button type="button" disabled={readOnly} onClick={event => begin({
        id: generateTransactionId(), name: '', kind: 'expense', enabled: true, priority: rules.length,
        match: { description: '', operator: 'contains' }, category: 'NO_CATEGORY', expenseType: 'NEED',
      }, event.currentTarget)}>{t('planning.addRule')}</button></div>
    <p>{t('planning.ruleHelp')}</p>
    {editing && <form className="planning-editor" ref={formRef} key={editing.id} onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      if (onChange(current => {
        const operator = formText(fields, 'operator');
        if (operator !== 'equals' && operator !== 'contains') throw new Error('Invalid rule operator.');
        const minimum = formText(fields, 'minAmount', false);
        const maximum = formText(fields, 'maxAmount', false);
        const matchCurrency = formText(fields, 'useCurrency', false) === 'on' || minimum !== '' || maximum !== '';
        const rule: ImportCategorizationRule = {
          id: editing.id, name: formText(fields, 'name'), enabled: editing.enabled, priority: editing.priority,
          match: {
            description: formText(fields, 'description'), operator,
            ...(matchCurrency ? { currency: formCurrency(fields) } : {}),
            ...(minimum !== '' ? { minAmount: formNumber(fields, 'minAmount') } : {}),
            ...(maximum !== '' ? { maxAmount: formNumber(fields, 'maxAmount') } : {}),
          },
          ...formClassification(fields, kind),
        };
        if (rule.kind === 'expense' && !categories.has(rule.category)) throw new Error('Choose an existing category.');
        const next = parseExpensePlanning(current.planning);
        next.rules = next.rules.some(item => item.id === rule.id)
          ? next.rules.map(item => item.id === rule.id ? rule : item) : [...next.rules, rule];
        return { ...current, planning: next };
      })) setEditing(null);
    }}>
      <fieldset disabled={readOnly}><legend>{t('planning.editRule')}</legend><div className="planning-fields">
        <PlanningField name="name" label={t('planning.ruleName')} value={editing.name} required />
        <div className="planning-field"><label htmlFor="rule-kind">{t('dialogs.pdfImport.kind')}</label>
          <select id="rule-kind" value={kind} onChange={event => setKind(event.target.value === 'income' ? 'income' : 'expense')}>
            <option value="expense">{t('expenseTracker.expense')}</option><option value="income">{t('expenseTracker.income')}</option></select></div>
        <PlanningField name="description" label={t('planning.matchDescription')} value={editing.match.description} required />
        <div className="planning-field"><label htmlFor="rule-operator">{t('planning.operator')}</label>
          <select id="rule-operator" name="operator" defaultValue={editing.match.operator}>
            <option value="contains">{t('planning.contains')}</option><option value="equals">{t('planning.equals')}</option></select></div>
        <CurrencyField value={editing.match.currency ?? data.currency} />
        <label className="planning-check"><input name="useCurrency" type="checkbox" defaultChecked={Boolean(editing.match.currency)} />{t('planning.matchCurrency')}</label>
        <PlanningField name="minAmount" label={t('planning.minAmount')} value={editing.match.minAmount} type="number" min={0} step={0.01} />
        <PlanningField name="maxAmount" label={t('planning.maxAmount')} value={editing.match.maxAmount} type="number" min={0} step={0.01} />
        <ClassificationFields kind={kind} data={data} category={editing.kind === 'expense' ? editing.category : undefined}
          expenseType={editing.kind === 'expense' ? editing.expenseType : undefined} source={editing.kind === 'income' ? editing.source : undefined} />
      </div><div className="planning-actions"><button type="submit">{t('planning.saveRule')}</button>
        <button type="button" onClick={() => setEditing(null)}>{t('common.cancel')}</button></div></fieldset>
    </form>}
    <ol className="planning-rule-list">{rules.map((rule, index) => {
      const broken = rule.kind === 'expense' && !categories.has(rule.category);
      return <li key={rule.id}><div><strong>{rule.name}</strong><p>{rule.match.description}</p>
        {broken && <p className="planning-warning">{t('planning.missingCategory')}</p>}</div>
        <div className="planning-actions">
          <label className="planning-check"><input type="checkbox" disabled={readOnly || broken} checked={rule.enabled} onChange={event => {
            const enabled = event.target.checked;
            onChange(current => {
              const next = parseExpensePlanning(current.planning);
              next.rules = next.rules.map(item => item.id === rule.id ? { ...item, enabled } : item);
              return { ...current, planning: next };
            });
          }} />{t('planning.enabled')}</label>
          <button type="button" disabled={readOnly} onClick={event => begin(rule, event.currentTarget)}>{t('common.edit')}</button>
          <button type="button" disabled={readOnly || index === 0} onClick={() => move(rule.id, -1)} aria-label={t('planning.moveUp', { name: rule.name })}>{t('planning.up')}</button>
          <button type="button" disabled={readOnly || index === rules.length - 1} onClick={() => move(rule.id, 1)} aria-label={t('planning.moveDown', { name: rule.name })}>{t('planning.down')}</button>
          <button type="button" disabled={readOnly} onClick={() => {
            if (window.confirm(t('planning.deleteRuleConfirm', { name: rule.name }))) onChange(current => {
              const next = parseExpensePlanning(current.planning);
              next.rules = next.rules.filter(item => item.id !== rule.id);
              return { ...current, planning: next };
            });
          }}>{t('common.delete')}</button>
        </div></li>;
    })}</ol>
    {!rules.length && <p className="planning-empty">{t('planning.noRules')}</p>}
  </section>;
}
