import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { useModalDialog } from '../hooks/useModalDialog';
import { loadSettings } from '../utils/cookieSettings';
import { logger } from '../utils/logger';
import type { ExpenseTrackerData } from '../types/expenseTracker';
import type {
  ExistingMonthPolicy,
  ExpenseWorkbookPlan,
  ExpenseWorkbookPreview,
  ExpenseWorkbookSummary,
  ExpenseWorkbookWarning,
} from '../utils/expenseWorkbook';
import { MAX_WORKBOOK_BYTES, READ_ERROR_CODES, errorMessage, readFileBytes } from './WorkbookImportDialog';
import './WorkbookImportDialog.css';

export const EXPENSE_IMPORT_GUIDE_URL = 'https://github.com/fire-tools-inc/app/blob/main/docs/user/spreadsheet-import.md#yearly-expenses-workbook';
const MAX_LISTED_NOTES = 50;

interface ExpenseWorkbookImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current Expense Tracker data (null when nothing is saved yet). */
  getCurrent: () => ExpenseTrackerData | null;
  /** Persist the merged data; return false when saving failed. */
  onApply: (next: ExpenseTrackerData) => boolean;
  onImported?: (summary: ExpenseWorkbookSummary, year: number) => void;
}

interface LoadedWorkbook {
  fileName: string;
  plan: ExpenseWorkbookPlan;
}

type Phase = 'idle' | 'reading' | 'preview' | 'importing' | 'done';

/** Generate and download the yearly expenses template with the user's categories. */
export async function downloadExpenseTemplateFile(year: number, data: ExpenseTrackerData | null): Promise<void> {
  const { downloadExpenseWorkbookTemplate } = await import('../utils/expenseWorkbook');
  downloadExpenseWorkbookTemplate({ year, currency: loadSettings().currencySettings.defaultCurrency, data });
}

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= 2100;
}

export function ExpenseWorkbookImportDialog({ isOpen, onClose, getCurrent, onApply, onImported }: ExpenseWorkbookImportDialogProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const introId = useId();
  const yearId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loaded, setLoaded] = useState<LoadedWorkbook | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [policy, setPolicy] = useState<ExistingMonthPolicy>('keep');
  const [preview, setPreview] = useState<ExpenseWorkbookPreview | null>(null);
  const [summary, setSummary] = useState<ExpenseWorkbookSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busy = phase === 'reading' || phase === 'importing';
  const getCurrentRef = useRef(getCurrent);
  useEffect(() => {
    getCurrentRef.current = getCurrent;
  }, [getCurrent]);

  const handleClose = useCallback(() => {
    if (busy) return;
    setPhase('idle');
    setLoaded(null);
    setPreview(null);
    setSummary(null);
    setError(null);
    setStatus(null);
    onClose();
  }, [busy, onClose]);

  useModalDialog(isOpen, handleClose, dialogRef, closeButtonRef);

  useEffect(() => {
    if (phase === 'done') doneButtonRef.current?.focus();
  }, [phase]);

  // The preview depends on the chosen year (future months, existing entries).
  useEffect(() => {
    if (!loaded || !isValidYear(year)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    import('../utils/expenseWorkbook').then(({ previewExpenseWorkbook }) => {
      if (!cancelled) setPreview(previewExpenseWorkbook(loaded.plan, getCurrentRef.current(), year));
    }).catch((previewError: unknown) => {
      logger.error('expense-workbook', 'preview-failed', 'expenses workbook preview failed', { pii: { error: errorMessage(previewError) } });
      if (!cancelled) setError(t('workbookImport.errors.readFailed', { message: errorMessage(previewError) }));
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, year, t]);

  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language, { month: 'short', timeZone: 'UTC' });
    return (months: number[]) => months.map((month) => formatter.format(new Date(Date.UTC(2021, month - 1, 15)))).join(', ');
  }, [i18n.language]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setStatus(null);
    setSummary(null);
    if (file.size > MAX_WORKBOOK_BYTES) {
      setError(t('workbookImport.errors.tooLarge'));
      return;
    }
    setPhase('reading');
    setStatus(t('workbookImport.reading', { name: file.name }));
    try {
      const [bytes, reader, expenses] = await Promise.all([
        readFileBytes(file),
        import('../utils/xlsxReader'),
        import('../utils/expenseWorkbook'),
      ]);
      const settings = loadSettings();
      const plan = expenses.parseExpenseWorkbook(reader.readXlsxWorkbook(bytes), file.name, {
        targetCurrency: settings.currencySettings.defaultCurrency,
        fallbackRates: settings.currencySettings.fallbackRates,
      });
      setStatus(null);
      if (plan.months.every((month) => month.rows.length === 0 && !month.incomeTotal)) {
        setLoaded(null);
        setPhase('idle');
        setError(t('expenseWorkbookImport.errors.noData'));
        return;
      }
      setYear(plan.detectedYear ?? new Date().getFullYear());
      setPolicy('keep');
      setLoaded({ fileName: file.name, plan });
      setPhase('preview');
    } catch (readError) {
      const code = (readError as { name?: string; code?: string }).name === 'XlsxReadError'
        ? (readError as { code: string }).code
        : 'readFailed';
      logger.warn('expense-workbook', 'read-failed', `expenses workbook could not be read (${code})`, { pii: { error: errorMessage(readError) } });
      setLoaded(null);
      setPhase('idle');
      setStatus(null);
      setError(READ_ERROR_CODES.has(code)
        ? t(`workbookImport.errors.${code}`)
        : t('workbookImport.errors.readFailed', { message: errorMessage(readError) }));
    }
  };

  const handleImport = async () => {
    if (!loaded || !isValidYear(year)) return;
    setPhase('importing');
    setError(null);
    try {
      const { mergeExpenseWorkbook } = await import('../utils/expenseWorkbook');
      const result = mergeExpenseWorkbook(loaded.plan, getCurrent(), { year, existingMonths: policy });
      if (!onApply(result.data)) throw new Error(t('planning.saveFailed'));
      logger.userAction('expense-workbook', 'imported', 'expenses workbook imported', { pii: result.summary });
      setSummary(result.summary);
      setPhase('done');
      onImported?.(result.summary, year);
    } catch (importError) {
      logger.error('expense-workbook', 'import-failed', 'expenses workbook import failed', { pii: { error: errorMessage(importError) } });
      setPhase('preview');
      setError(t('workbookImport.errors.importFailed', { message: errorMessage(importError) }));
    }
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      await downloadExpenseTemplateFile(isValidYear(year) ? year : new Date().getFullYear(), getCurrent());
      setStatus(t('workbookImport.templateDownloaded'));
    } catch (templateError) {
      logger.error('expense-workbook', 'template-failed', 'expenses template could not be created', { pii: { error: errorMessage(templateError) } });
      setError(t('workbookImport.errors.templateFailed', { message: errorMessage(templateError) }));
    }
  };

  const handleCopyPrompt = async () => {
    setError(null);
    try {
      const { getExpenseAgentPrompt } = await import('../utils/expenseWorkbook');
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available');
      await navigator.clipboard.writeText(getExpenseAgentPrompt());
      setStatus(t('workbookImport.promptCopied'));
    } catch (copyError) {
      logger.warn('expense-workbook', 'copy-failed', 'expenses prompt could not be copied', { pii: { error: errorMessage(copyError) } });
      setError(t('workbookImport.errors.copyFailed'));
    }
  };

  if (!isOpen) return null;

  const plan = loaded?.plan;
  const warningText = (warning: ExpenseWorkbookWarning) => t(`expenseWorkbookImport.warnings.${warning.code}`, {
    sheet: warning.sheet, row: warning.row ?? '', detail: warning.detail ?? '',
  });
  const canImport = Boolean(loaded && preview && isValidYear(year) && preview.months.length > 0) && !busy;

  return createPortal(
    <div className="workbook-import-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) handleClose(); }}>
      <div
        ref={dialogRef}
        className="workbook-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
      >
        <header className="workbook-import-header">
          <h2 id={titleId}><MaterialIcon name="receipt_long" /> {t('expenseWorkbookImport.title')}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="workbook-import-close"
            onClick={handleClose}
            disabled={busy}
            aria-label={t('workbookImport.close')}
          >
            <MaterialIcon name="close" />
          </button>
        </header>

        <div className="workbook-import-body">
          <p id={introId} className="workbook-import-intro">{t('expenseWorkbookImport.intro')}</p>

          <div className="workbook-import-actions">
            <button type="button" className="action-btn" onClick={handleDownloadTemplate}>
              <MaterialIcon name="download" /> {t('expenseWorkbookImport.downloadTemplate')}
            </button>
            <button type="button" className="action-btn" onClick={handleCopyPrompt}>
              <MaterialIcon name="content_copy" /> {t('workbookImport.copyPrompt')}
            </button>
            <a className="action-btn" href={EXPENSE_IMPORT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
              <MaterialIcon name="open_in_new" /> {t('workbookImport.guide')}
            </a>
          </div>

          {phase !== 'done' && (
            <div className="workbook-import-file">
              <button type="button" className="primary-btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <MaterialIcon name="upload_file" /> {t('workbookImport.chooseFile')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFile}
                hidden
                aria-label={t('workbookImport.chooseFile')}
              />
              {loaded && <span className="workbook-import-filename">{loaded.fileName}</span>}
            </div>
          )}

          <p className="workbook-import-status" role="status" aria-live="polite">{status}</p>
          {error && <p className="workbook-import-error" role="alert">{error}</p>}

          {loaded && plan && (phase === 'preview' || phase === 'importing') && (
            <>
              <section className="workbook-import-section" aria-label={t('workbookImport.summaryTitle', { name: loaded.fileName })}>
                <h3>{t('workbookImport.summaryTitle', { name: loaded.fileName })}</h3>
                <label className="workbook-import-year" htmlFor={yearId}>
                  <span>{t('expenseWorkbookImport.year')}</span>
                  <input
                    id={yearId}
                    type="number"
                    min={1900}
                    max={2100}
                    step={1}
                    value={Number.isNaN(year) ? '' : year}
                    disabled={busy}
                    aria-describedby={`${yearId}-help`}
                    onChange={(event) => setYear(event.target.valueAsNumber)}
                  />
                </label>
                <span id={`${yearId}-help`} className="workbook-import-hint">
                  {plan.detectedYear ? t('expenseWorkbookImport.yearDetected') : t('expenseWorkbookImport.yearMissing')}
                </span>
                {preview && (
                  <ul className="workbook-import-facts">
                    <li>{t('expenseWorkbookImport.monthSheets', { months: plan.monthSheets.join(', ') })}</li>
                    {preview.months.length > 0 && <li>{t('expenseWorkbookImport.months', { months: monthNames(preview.months) })}</li>}
                    {preview.futureMonths.length > 0 && <li>{t('expenseWorkbookImport.futureMonths', { months: monthNames(preview.futureMonths) })}</li>}
                    <li>{t('expenseWorkbookImport.entries', { expenses: preview.expenses, incomes: preview.incomes })}</li>
                    {preview.newCategories.length > 0 && (
                      <li>{t('expenseWorkbookImport.newCategories', { names: preview.newCategories.join(', ') })}</li>
                    )}
                    {plan.ignoredSheets.length > 0 && <li>{t('workbookImport.ignoredSheets', { sheets: plan.ignoredSheets.join(', ') })}</li>}
                  </ul>
                )}
                <p className="workbook-import-hint">{t('expenseWorkbookImport.currencyNote', { currency: plan.currency })}</p>
                <p className="workbook-import-hint">{t('expenseWorkbookImport.detailNote')}</p>
                {plan.warnings.length > 0 && (
                  <details className="workbook-import-details">
                    <summary>{t('workbookImport.warningsTitle', { count: plan.warnings.length })}</summary>
                    <ul>
                      {plan.warnings.slice(0, MAX_LISTED_NOTES).map((warning, index) => (
                        <li key={`${warning.code}-${warning.sheet}-${warning.row ?? index}`}>{warningText(warning)}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>

              {preview && (
                <fieldset className="workbook-import-section">
                  <legend>{t('workbookImport.existingTitle')}</legend>
                  <p className="workbook-import-hint">
                    {preview.conflictingMonths > 0
                      ? t('expenseWorkbookImport.existingCount', { count: preview.conflictingMonths })
                      : t('workbookImport.existingNone')}
                  </p>
                  {(['keep', 'replace'] as const).map((option) => (
                    <label key={option} className="workbook-import-option">
                      <input
                        type="radio"
                        name={`${titleId}-existing`}
                        value={option}
                        checked={policy === option}
                        disabled={busy}
                        onChange={() => setPolicy(option)}
                      />
                      <span>{t(option === 'keep' ? 'workbookImport.keepExisting' : 'workbookImport.replaceExisting')}</span>
                    </label>
                  ))}
                  {policy === 'replace' && <p className="workbook-import-warning">{t('expenseWorkbookImport.replaceWarning')}</p>}
                </fieldset>
              )}
            </>
          )}

          {phase === 'done' && summary && (
            <section className="workbook-import-section workbook-import-done" aria-live="polite">
              <h3><MaterialIcon name="check_circle" /> {t('workbookImport.doneTitle')}</h3>
              <p>{t('expenseWorkbookImport.doneSummary', {
                months: summary.monthsImported,
                kept: summary.monthsKept,
                expenses: summary.expensesImported,
                incomes: summary.incomesImported,
                categories: summary.categoriesCreated,
              })}</p>
              {summary.incomeMonthsSkipped > 0 && <p>{t('expenseWorkbookImport.incomeSkipped', { count: summary.incomeMonthsSkipped })}</p>}
            </section>
          )}
        </div>

        <footer className="workbook-import-footer">
          {phase === 'done' ? (
            <button ref={doneButtonRef} type="button" className="primary-btn" onClick={handleClose}>{t('workbookImport.close')}</button>
          ) : (
            <>
              <button type="button" className="action-btn" onClick={handleClose} disabled={busy}>{t('workbookImport.cancel')}</button>
              <button type="button" className="primary-btn" onClick={handleImport} disabled={!canImport}>
                {phase === 'importing' ? t('workbookImport.importing') : t('workbookImport.import')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
