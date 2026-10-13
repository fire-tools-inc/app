import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { INCOME_SOURCES, getAllCategories, type ExpenseTrackerData, type ExpenseType, type IncomeSource } from '../types/expenseTracker';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../types/currency';
import { ExpensePlanningError } from '../utils/expensePlanning';

export type PlanningUpdate = (update: (data: ExpenseTrackerData) => ExpenseTrackerData) => boolean;

interface FieldProps {
  name: string;
  label: string;
  value?: string | number;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  min?: number;
  step?: number;
}

export function PlanningField({ name, label, value = '', type = 'text', required, min, step }: FieldProps) {
  const id = useId();
  return <div className="planning-field"><label htmlFor={id}>{label}</label>
    <input id={id} name={name} type={type} defaultValue={value} required={required}
      min={type === 'date' ? '1900-01-01' : min} max={type === 'date' ? '2100-12-31' : undefined} step={step} />
  </div>;
}

export function CurrencyField({ value }: { value: SupportedCurrency }) {
  const { t } = useTranslation();
  const id = useId();
  return <div className="planning-field"><label htmlFor={id}>{t('planning.currency')}</label>
    <select id={id} name="currency" defaultValue={value}>
      {SUPPORTED_CURRENCIES.map(currency => <option key={currency.code}>{currency.code}</option>)}
    </select></div>;
}

export function ClassificationFields({ kind, data, category, expenseType, source }: {
  kind: 'expense' | 'income'; data: ExpenseTrackerData; category?: string; expenseType?: ExpenseType; source?: IncomeSource;
}) {
  const { t } = useTranslation();
  const id = useId();
  if (kind === 'income') return <div className="planning-field"><label htmlFor={id}>{t('planning.source')}</label>
    <select id={id} name="source" defaultValue={source ?? 'SALARY'}>
      {INCOME_SOURCES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></div>;
  const categories = getAllCategories(data.customCategories, data.categoryOverrides);
  return <>
    <div className="planning-field"><label htmlFor={id}>{t('expenseTracker.category')}</label>
      <select id={id} name="category" defaultValue={category ?? 'NO_CATEGORY'}>
        {category && !categories.some(item => item.id === category) && <option value={category}>{t('planning.missingCategory')}</option>}
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
    <div className="planning-field"><label htmlFor={`${id}-type`}>{t('expenseTracker.type')}</label>
      <select id={`${id}-type`} name="expenseType" defaultValue={expenseType ?? 'NEED'}>
        <option value="NEED">{t('planning.need')}</option><option value="WANT">{t('planning.want')}</option>
      </select></div>
  </>;
}

export function formText(form: FormData, name: string, required = true): string {
  const value = form.get(name);
  if (typeof value !== 'string' || (required && !value.trim())) {
    throw new ExpensePlanningError('invalidInput', `A valid ${name} is required.`);
  }
  return value.trim();
}
export const formNumber = (form: FormData, name: string): number => Number(formText(form, name));
export function formCurrency(form: FormData): SupportedCurrency {
  const currency = SUPPORTED_CURRENCIES.find(item => item.code === formText(form, 'currency'))?.code;
  if (!currency) throw new ExpensePlanningError('invalidInput', 'Unsupported currency.');
  return currency;
}
export function formClassification(form: FormData, kind: 'income' | 'expense'):
  { kind: 'income'; source: IncomeSource } | { kind: 'expense'; category: string; expenseType: ExpenseType } {
  if (kind === 'income') {
    const source = INCOME_SOURCES.find(item => item.id === formText(form, 'source'))?.id;
    if (!source) throw new ExpensePlanningError('invalidInput', 'Invalid income source.');
    return { kind, source };
  }
  const expenseType = formText(form, 'expenseType');
  if (expenseType !== 'NEED' && expenseType !== 'WANT') throw new ExpensePlanningError('invalidInput', 'Invalid expense type.');
  return { kind, category: formText(form, 'category'), expenseType };
}

export function usePlanningEditorFocus(open: boolean) {
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    else if (triggerRef.current?.isConnected) triggerRef.current.focus();
  }, [open]);
  return { formRef, triggerRef };
}
