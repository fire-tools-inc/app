import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getAllCategories, getCategoryInfo, type ExpenseEntry, type ExpenseTrackerData } from '../types/expenseTracker';
import { useModalDialog } from '../hooks/useModalDialog';
import { formatCurrency } from '../utils/allocationCalculator';
import { loadSettings, subscribeToSettingsChanges } from '../utils/cookieSettings';
import { IS_DEMO_MODE } from '../utils/demoMode';
import { getExpenseMatcher } from '../utils/expenseMatcher';
import { categorizeWithLlm, isLlmConfigured } from '../utils/llmCategorizer';
import { logger } from '../utils/logger';
import {
  applyAiSuggestions,
  classifyQuickImportRows,
  parseQuickAmount,
  parseQuickExpenseList,
  quickRowsToExpenses,
  toDraft,
  validateQuickRow,
  type QuickImportRow,
} from '../utils/quickExpenseImport';
import { MaterialIcon } from './MaterialIcon';
import './QuickExpenseImport.css';

export interface QuickExpenseImportProps {
  year: number;
  month: number;
  data: ExpenseTrackerData;
  /**
   * Receives the reviewed expenses; the caller appends and saves them (see
   * appendExpensesToMonth). Return false or throw to report a failed save:
   * the rows then stay on screen.
   */
  onCommit: (expenses: ExpenseEntry[]) => void | boolean;
  onCancel?: () => void;
  /** "dialog" renders a modal with focus trap and Escape; "inline" renders a section for embedding. */
  variant?: 'dialog' | 'inline';
  /** Test seam for the AI categorizer. */
  categorizer?: typeof categorizeWithLlm;
}

const LOW_CONFIDENCE = 0.5;

function readAiSettings() {
  const settings = loadSettings();
  return { enabled: settings.aiFeaturesEnabled, config: settings.llmCategorization };
}

function endpointHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function QuickExpenseImport({
  year, month, data, onCommit, onCancel, variant = 'inline', categorizer = categorizeWithLlm,
}: QuickExpenseImportProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<QuickImportRow[]>([]);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<ReadonlySet<string>>(() => new Set());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [aiStep, setAiStep] = useState<'idle' | 'confirm' | 'running'>('idle');
  const [ai, setAi] = useState(readAiSettings);
  const aiController = useRef<AbortController | null>(null);
  const manualRef = useRef(manual);
  manualRef.current = manual;
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => onCancel?.(), [onCancel]);
  useModalDialog(variant === 'dialog', close, dialogRef, textareaRef);

  useEffect(() => subscribeToSettingsChanges(() => {
    const next = readAiSettings();
    setAi(next);
    if (!next.enabled) {
      aiController.current?.abort();
      setAiStep('idle');
    }
  }), []);
  useEffect(() => () => aiController.current?.abort(), []);
  useEffect(() => {
    if (aiStep === 'confirm') confirmRef.current?.focus();
  }, [aiStep]);

  const categories = useMemo(
    () => getAllCategories(data.customCategories, data.categoryOverrides),
    [data.customCategories, data.categoryOverrides],
  );
  const historySize = useMemo(() => getExpenseMatcher(data).historySize, [data]);
  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }),
    [year, month, i18n.language],
  );
  const firstDayLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }),
    [year, month, i18n.language],
  );
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const aiAvailable = !IS_DEMO_MODE && ai.enabled && isLlmConfigured(ai.config);

  const errorText = (row: QuickImportRow): string => row.error
    ? t(`quickImport.errors.${row.error}`, { month: monthLabel })
    : '';
  const rowName = (row: QuickImportRow, index: number): string =>
    row.description.trim() || t('quickImport.table.untitled', { line: index + 1 });

  const handleMatch = () => {
    setError('');
    const parsed = parseQuickExpenseList(text, { year, month, defaultCurrency: data.currency });
    setAmountDrafts({});
    setManual(new Set());
    setAiStep('idle');
    if (!parsed.length) {
      setRows([]);
      setStatus('');
      setError(t('quickImport.statusEmpty'));
      return;
    }
    const classified = classifyQuickImportRows(parsed, data);
    setRows(classified);
    setStatus(t('quickImport.statusMatched', {
      ready: classified.filter(row => !row.error).length, total: classified.length,
    }));
  };

  const updateRow = (rowId: string, patch: Partial<QuickImportRow>, reclassify = false) => {
    setRows(current => current.map(row => {
      if (row.id !== rowId) return row;
      let next: QuickImportRow = { ...row, ...patch };
      if (reclassify && !manualRef.current.has(rowId)) {
        const [classified] = classifyQuickImportRows([next], data);
        next = classified;
      }
      const problem = validateQuickRow(next, year, month);
      if (problem) return { ...next, error: problem, include: false };
      const valid: QuickImportRow = { ...next, include: row.error ? true : next.include };
      delete valid.error;
      return valid;
    }));
  };

  const handleAmountChange = (row: QuickImportRow, value: string) => {
    setAmountDrafts(current => ({ ...current, [row.id]: value }));
    const parsed = value.trim() ? parseQuickAmount(value) : null;
    updateRow(row.id, { amount: parsed ?? Number.NaN, unitAmount: undefined, quantity: undefined });
  };

  const handleCategoryChange = (row: QuickImportRow, category: string) => {
    setManual(current => new Set(current).add(row.id));
    updateRow(row.id, {
      category,
      expenseType: getCategoryInfo(category, data.customCategories, data.categoryOverrides).defaultExpenseType,
    });
  };

  const removeRow = (rowId: string) => setRows(current => current.filter(row => row.id !== rowId));

  const committable = rows.filter(row => row.include && !row.error);
  const totals = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const row of rows) {
      if (!row.include || row.error) continue;
      const currency = row.currency ?? data.currency;
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + row.amount);
    }
    return [...byCurrency.entries()].map(([currency, amount]) => formatCurrency(amount, currency)).join(' + ');
  }, [rows, data.currency]);

  const handleCommit = () => {
    setError('');
    if (IS_DEMO_MODE) { setError(t('demo.disabledAction')); return; }
    const expenses = quickRowsToExpenses(rows);
    if (!expenses.length) return;
    let saved: void | boolean;
    try {
      saved = onCommit(expenses);
    } catch (commitError) {
      logger.error('quick-import', 'commit-failed', 'quick-add expenses could not be saved', {
        pii: { error: commitError instanceof Error ? commitError.message : String(commitError), count: expenses.length },
      });
      setError(t('quickImport.commitFailed'));
      return;
    }
    if (saved === false) {
      setError(t('quickImport.commitFailed'));
      return;
    }
    setRows([]);
    setText('');
    setAmountDrafts({});
    setManual(new Set());
    setStatus(t('quickImport.statusAdded', { count: expenses.length, month: monthLabel }));
  };

  const aiCandidates = rows.filter(row => row.include && !row.error && row.source !== 'rule' && !manual.has(row.id));

  const runAi = async () => {
    const config = ai.config;
    if (!aiAvailable || !config || !aiCandidates.length) { setAiStep('idle'); return; }
    aiController.current?.abort();
    const controller = new AbortController();
    aiController.current = controller;
    setAiStep('running');
    setError('');
    setStatus(t('quickImport.ai.running'));
    let failed = false;
    const drafts = await categorizer(aiCandidates.map(toDraft), config, categories, {
      signal: controller.signal,
      onError: () => { failed = true; },
    });
    if (controller.signal.aborted || aiController.current !== controller) return;
    aiController.current = null;
    setAiStep('idle');
    if (!loadSettings().aiFeaturesEnabled) { setStatus(''); return; }
    const accepted = drafts.filter(draft => !manualRef.current.has(draft.id));
    setRows(current => applyAiSuggestions(current, accepted));
    if (failed) {
      setStatus('');
      setError(t('quickImport.ai.failed'));
    } else {
      setStatus(t('quickImport.ai.done', { count: accepted.filter(draft => draft.llmEnriched).length }));
    }
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleMatch();
    }
  };

  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  const content = (
    <>
      <div className="quick-import__header">
        <h2 id={titleId} className="quick-import__title">
          <MaterialIcon name="playlist_add" /> {t('quickImport.title')}
        </h2>
        {variant === 'dialog' && onCancel && (
          <button type="button" className="btn btn--ghost btn--icon" onClick={onCancel} aria-label={t('quickImport.close')}>
            <MaterialIcon name="close" />
          </button>
        )}
      </div>
      <p className="quick-import__intro">
        {t('quickImport.intro', { month: monthLabel })}
        {historySize > 0 && <> {t('quickImport.learnedFrom', { count: historySize })}</>}
      </p>

      <div className="field">
        <label className="field__label" htmlFor={`${id}-input`}>{t('quickImport.inputLabel')}</label>
        <textarea
          id={`${id}-input`}
          ref={textareaRef}
          rows={6}
          value={text}
          spellCheck={false}
          placeholder={t('quickImport.placeholder')}
          aria-describedby={hintId}
          onChange={event => setText(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
        />
        <p id={hintId} className="field__hint">{t('quickImport.inputHint', { date: firstDayLabel })}</p>
      </div>

      <div className="quick-import__actions">
        <button type="button" className="btn btn--primary" onClick={handleMatch} disabled={aiStep === 'running'}>
          <MaterialIcon name="auto_fix_high" /> {t('quickImport.match')}
        </button>
        {(text || rows.length > 0) && (
          <button type="button" className="btn btn--ghost" disabled={aiStep === 'running'} onClick={() => {
            setText(''); setRows([]); setAmountDrafts({}); setManual(new Set()); setStatus(''); setError('');
            textareaRef.current?.focus();
          }}>
            {t('quickImport.clear')}
          </button>
        )}
        {aiAvailable && rows.length > 0 && aiStep === 'idle' && (
          <button type="button" className="btn btn--secondary" disabled={!aiCandidates.length} onClick={() => setAiStep('confirm')}>
            <MaterialIcon name="auto_awesome" /> {t('quickImport.ai.button')}
          </button>
        )}
      </div>

      {aiStep === 'confirm' && ai.config && (
        <div className="callout callout--info quick-import__consent" role="group" aria-labelledby={`${id}-consent`}>
          <MaterialIcon name="auto_awesome" />
          <div>
            <p id={`${id}-consent`} className="quick-import__consent-title">{t('quickImport.ai.consentTitle')}</p>
            <p>{t('quickImport.ai.consentBody', { count: aiCandidates.length, host: endpointHost(ai.config.baseUrl) })}</p>
            <div className="quick-import__actions">
              <button type="button" ref={confirmRef} className="btn btn--primary btn--sm" onClick={() => { void runAi(); }}>
                {t('quickImport.ai.confirm')}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAiStep('idle')}>
                {t('quickImport.ai.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="quick-import__status" role="status" aria-live="polite">{status}</p>
      {error && <p className="callout callout--danger" role="alert">{error}</p>}

      {rows.length > 0 && (
        <div className="quick-import__table-wrap" role="region" aria-label={t('quickImport.table.region')} tabIndex={0}>
          <table className="data-table quick-import__table">
            <caption className="visually-hidden">{t('quickImport.table.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('quickImport.table.include')}</th>
                <th scope="col">{t('quickImport.table.date')}</th>
                <th scope="col">{t('quickImport.table.description')}</th>
                <th scope="col" className="num">{t('quickImport.table.amount')}</th>
                <th scope="col">{t('quickImport.table.category')}</th>
                <th scope="col">{t('quickImport.table.type')}</th>
                <th scope="col">{t('quickImport.table.match')}</th>
                <th scope="col"><span className="visually-hidden">{t('quickImport.table.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const name = rowName(row, index);
                const errorId = `${id}-${row.id}-error`;
                const isManual = manual.has(row.id);
                const low = !row.error && !isManual && row.source !== 'rule' && row.confidence < LOW_CONFIDENCE;
                const amountValue = amountDrafts[row.id] ?? (Number.isFinite(row.amount) ? (Number.isInteger(row.amount) ? String(row.amount) : row.amount.toFixed(2)) : '');
                return (
                  <tr key={row.id} className={row.error ? 'is-invalid' : low ? 'is-low' : undefined}>
                    <td data-label={t('quickImport.table.include')}>
                      <input
                        type="checkbox"
                        className="quick-import__check"
                        checked={row.include}
                        disabled={Boolean(row.error)}
                        aria-label={t('quickImport.table.includeRow', { description: name })}
                        onChange={event => updateRow(row.id, { include: event.target.checked })}
                      />
                    </td>
                    <td data-label={t('quickImport.table.date')}>
                      <input
                        type="date"
                        className="input"
                        value={row.date}
                        min={monthStart}
                        max={monthEnd}
                        aria-label={t('quickImport.table.dateFor', { description: name })}
                        aria-invalid={row.error === 'invalidDate' || row.error === 'outsideMonth' || undefined}
                        aria-describedby={row.error ? errorId : undefined}
                        onChange={event => updateRow(row.id, { date: event.target.value })}
                      />
                    </td>
                    <td data-label={t('quickImport.table.description')}>
                      <input
                        type="text"
                        className="input"
                        value={row.description}
                        aria-label={t('quickImport.table.descriptionFor', { line: index + 1 })}
                        aria-invalid={row.error === 'missingDescription' || undefined}
                        aria-describedby={row.error ? errorId : undefined}
                        onChange={event => updateRow(row.id, { description: event.target.value }, true)}
                      />
                      {row.error && <span id={errorId} className="field__error">{errorText(row)}</span>}
                      {row.error && row.rawLine.trim() && (
                        <span className="quick-import__raw">{t('quickImport.table.original', { line: row.rawLine.trim() })}</span>
                      )}
                    </td>
                    <td className="num" data-label={t('quickImport.table.amount')}>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="input quick-import__amount"
                        value={amountValue}
                        aria-label={t('quickImport.table.amountFor', { description: name })}
                        aria-invalid={row.error === 'missingAmount' || row.error === 'invalidAmount' || undefined}
                        aria-describedby={row.error ? errorId : undefined}
                        onChange={event => handleAmountChange(row, event.target.value)}
                      />
                      {row.quantity !== undefined && row.unitAmount !== undefined && (
                        <span className="quick-import__breakdown">
                          {t('quickImport.table.breakdown', {
                            quantity: row.quantity, unit: formatCurrency(row.unitAmount, row.currency ?? data.currency),
                          })}
                        </span>
                      )}
                    </td>
                    <td data-label={t('quickImport.table.category')}>
                      <select
                        className="input"
                        value={row.category}
                        aria-label={t('quickImport.table.categoryFor', { description: name })}
                        onChange={event => handleCategoryChange(row, event.target.value)}
                      >
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </td>
                    <td data-label={t('quickImport.table.type')}>
                      <div className="quick-import__type" role="group" aria-label={t('quickImport.table.typeFor', { description: name })}>
                        {(['NEED', 'WANT'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            className={`btn btn--sm ${row.expenseType === type ? 'btn--primary' : 'btn--ghost'}`}
                            aria-pressed={row.expenseType === type}
                            onClick={() => updateRow(row.id, { expenseType: type })}
                          >
                            {t(type === 'NEED' ? 'quickImport.need' : 'quickImport.want')}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td data-label={t('quickImport.table.match')}>
                      {isManual ? (
                        <span className="badge badge--neutral">{t('quickImport.source.manual')}</span>
                      ) : (
                        <span
                          className={`badge ${row.source === 'none' ? 'badge--neutral' : low ? 'badge--warning' : 'badge--success'}`}
                          title={row.source === 'none' ? undefined : t('quickImport.confidence', { percent: Math.round(row.confidence * 100) })}
                        >
                          {t(`quickImport.source.${row.source}`)}
                          {row.source !== 'none' && <> · {Math.round(row.confidence * 100)}%</>}
                          {low && <span className="visually-hidden"> {t('quickImport.lowConfidence')}</span>}
                        </span>
                      )}
                    </td>
                    <td data-label={t('quickImport.table.actions')}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon btn--sm"
                        aria-label={t('quickImport.table.removeRow', { description: name })}
                        onClick={() => removeRow(row.id)}
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="quick-import__footer">
        {committable.length > 0 && (
          <p className="quick-import__total">{t('quickImport.selectedTotal', { count: committable.length, total: totals })}</p>
        )}
        {IS_DEMO_MODE && rows.length > 0 && <p className="field__hint">{t('demo.disabledAction')}</p>}
        <div className="quick-import__actions quick-import__actions--end">
          {onCancel && (
            <button type="button" className="btn btn--secondary" onClick={onCancel}>{t('quickImport.cancel')}</button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!committable.length || IS_DEMO_MODE || aiStep === 'running'}
            onClick={handleCommit}
          >
            <MaterialIcon name="add" /> {t('quickImport.commit', { count: committable.length })}
          </button>
        </div>
      </div>
    </>
  );

  if (variant === 'dialog') {
    return (
      <div className="quick-import-overlay" onClick={event => { if (event.target === event.currentTarget) onCancel?.(); }}>
        <div
          ref={dialogRef}
          className="quick-import quick-import--dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          {content}
        </div>
      </div>
    );
  }
  return (
    <section className="quick-import quick-import--inline" aria-labelledby={titleId}>
      {content}
    </section>
  );
}

export default QuickExpenseImport;
