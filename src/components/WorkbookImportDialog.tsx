import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { useModalDialog } from '../hooks/useModalDialog';
import { loadSettings } from '../utils/cookieSettings';
import {
  hasStoredExpenseTrackerData,
  hasStoredNetWorthTrackerData,
  loadAssetAllocation,
  loadExpenseTrackerData,
  loadFireCalculatorInputs,
  loadNetWorthTrackerData,
} from '../utils/cookieStorage';
import { logger } from '../utils/logger';
import { formatDisplayPercent } from '../utils/numberFormatter';
import type { WorkbookImportPlan, WorkbookReconciliation, WorkbookWarning } from '../utils/workbookImport';
import type {
  WorkbookImportCurrentData,
  WorkbookImportPreview,
  WorkbookImportSelection,
  WorkbookImportSummary,
} from '../utils/workbookImportApply';
import './WorkbookImportDialog.css';

export const WORKBOOK_IMPORT_GUIDE_URL = 'https://github.com/fire-tools-inc/app/blob/main/docs/user/spreadsheet-import.md';
export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
const MAX_LISTED_NOTES = 50;
export const READ_ERROR_CODES = new Set(['notXlsx', 'tooLarge', 'invalid']);

interface WorkbookImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after every store was saved successfully. */
  onImported?: (summary: WorkbookImportSummary) => void;
}

interface UnreadableStores {
  netWorth: boolean;
  cashflow: boolean;
}

interface LoadedWorkbook {
  fileName: string;
  plan: WorkbookImportPlan;
  preview: WorkbookImportPreview;
  reconciliation: WorkbookReconciliation;
  unreadable: UnreadableStores;
}

type Phase = 'idle' | 'reading' | 'preview' | 'importing' | 'done';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadCurrentData(): WorkbookImportCurrentData {
  const { assets, assetClassTargets } = loadAssetAllocation();
  return {
    netWorth: loadNetWorthTrackerData(),
    expenseTracker: loadExpenseTrackerData(),
    assets,
    assetClassTargets,
    fireCalculator: loadFireCalculatorInputs(),
  };
}

/** Stores that exist but cannot be read must never be replaced by an import. */
function findUnreadableStores(current: WorkbookImportCurrentData): UnreadableStores {
  return {
    netWorth: !current.netWorth && hasStoredNetWorthTrackerData(),
    cashflow: !current.expenseTracker && hasStoredExpenseTrackerData(),
  };
}

export function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('File could not be read'));
    reader.readAsArrayBuffer(file);
  });
}

/** Copy the AI agent prompt that explains the template format. */
export async function copyWorkbookAgentPrompt(): Promise<void> {
  const { getWorkbookAgentPrompt } = await import('../utils/workbookTemplate');
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available');
  await navigator.clipboard.writeText(getWorkbookAgentPrompt());
}

/** Generate and download the workbook template in the user's currency. */
export async function downloadWorkbookTemplateFile(): Promise<void> {
  const { downloadWorkbookTemplate } = await import('../utils/workbookTemplate');
  downloadWorkbookTemplate({
    year: new Date().getFullYear(),
    currency: loadSettings().currencySettings.defaultCurrency,
  });
}

export function WorkbookImportDialog({ isOpen, onClose, onImported }: WorkbookImportDialogProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const introId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loaded, setLoaded] = useState<LoadedWorkbook | null>(null);
  const [selection, setSelection] = useState<WorkbookImportSelection>({
    netWorth: true, cashflow: true, allocation: true, fire: true, existingMonths: 'keep',
  });
  const [summary, setSummary] = useState<WorkbookImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busy = phase === 'reading' || phase === 'importing';
  const preview = loaded?.preview;
  const plan = loaded?.plan;
  const reconciliation = loaded?.reconciliation;
  const options: Array<{ key: keyof Omit<WorkbookImportSelection, 'existingMonths'>; available: boolean }> = [
    { key: 'netWorth', available: Boolean(preview && !loaded?.unreadable.netWorth && preview.balanceMonths + preview.totalOnlyMonths > 0) },
    { key: 'cashflow', available: Boolean(preview && !loaded?.unreadable.cashflow && preview.incomes + preview.expenses > 0) },
    { key: 'allocation', available: Boolean(plan?.allocation || preview?.latestBalanceMonth) },
    { key: 'fire', available: Boolean(plan?.fire || preview?.latestBalanceMonth) },
  ];
  const effectiveSelection: WorkbookImportSelection = { ...selection };
  for (const { key, available } of options) effectiveSelection[key] = available && selection[key];
  const nothingSelected = options.every(({ key }) => !effectiveSelection[key]);

  const handleClose = useCallback(() => {
    if (busy) return;
    setPhase('idle');
    setLoaded(null);
    setSummary(null);
    setError(null);
    setStatus(null);
    onClose();
  }, [busy, onClose]);

  useModalDialog(isOpen, handleClose, dialogRef, closeButtonRef);

  useEffect(() => {
    if (phase === 'done') doneButtonRef.current?.focus();
  }, [phase]);

  const formatMonth = (period: { year: number; month: number }) => new Intl.DateTimeFormat(i18n.language, {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(period.year, period.month - 1, 1)));

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
      const [bytes, reader, parser, applier] = await Promise.all([
        readFileBytes(file),
        import('../utils/xlsxReader'),
        import('../utils/workbookImport'),
        import('../utils/workbookImportApply'),
      ]);
      const settings = loadSettings();
      const plan = parser.parseNetWorthWorkbook(reader.readXlsxWorkbook(bytes), {
        targetCurrency: settings.currencySettings.defaultCurrency,
        fallbackRates: settings.currencySettings.fallbackRates,
      });
      if (plan.months.length === 0 && !plan.allocation && !plan.fire) {
        setLoaded(null);
        setPhase('idle');
        setStatus(null);
        setError(t('workbookImport.errors.noData'));
        return;
      }
      const current = loadCurrentData();
      const unreadable = findUnreadableStores(current);
      const preview = applier.previewWorkbookImport(plan, current);
      setLoaded({ fileName: file.name, plan, preview, reconciliation: parser.reconcileWorkbookPlan(plan), unreadable });
      setSelection({
        netWorth: !unreadable.netWorth && preview.balanceMonths + preview.totalOnlyMonths > 0,
        cashflow: !unreadable.cashflow && preview.incomes + preview.expenses > 0,
        allocation: Boolean(plan.allocation) || preview.latestBalanceMonth !== null,
        fire: Boolean(plan.fire),
        existingMonths: 'keep',
      });
      setPhase('preview');
      setStatus(null);
    } catch (readError) {
      const code = (readError as { name?: string; code?: string }).name === 'XlsxReadError'
        ? (readError as { code: string }).code
        : 'readFailed';
      logger.warn('workbook-import', 'read-failed', `workbook could not be read (${code})`, { pii: { error: errorMessage(readError) } });
      setLoaded(null);
      setPhase('idle');
      setStatus(null);
      setError(READ_ERROR_CODES.has(code)
        ? t(`workbookImport.errors.${code}`)
        : t('workbookImport.errors.readFailed', { message: errorMessage(readError) }));
    }
  };

  const handleImport = async () => {
    if (!loaded) return;
    setPhase('importing');
    setError(null);
    try {
      const { applyWorkbookImport, commitWorkbookImport } = await import('../utils/workbookImportApply');
      const current = loadCurrentData();
      const unreadable = findUnreadableStores(current);
      if (effectiveSelection.netWorth && unreadable.netWorth) throw new Error(t('workbookImport.unreadableNetWorth'));
      if (effectiveSelection.cashflow && unreadable.cashflow) throw new Error(t('workbookImport.unreadableCashflow'));
      const result = applyWorkbookImport(loaded.plan, current, effectiveSelection);
      commitWorkbookImport(result, current);
      logger.userAction('workbook-import', 'imported', 'spreadsheet imported', { pii: result.summary });
      setSummary(result.summary);
      setPhase('done');
      onImported?.(result.summary);
    } catch (importError) {
      logger.error('workbook-import', 'import-failed', 'spreadsheet import failed', { pii: { error: errorMessage(importError) } });
      setPhase('preview');
      setError(t('workbookImport.errors.importFailed', { message: errorMessage(importError) }));
    }
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      await downloadWorkbookTemplateFile();
      setStatus(t('workbookImport.templateDownloaded'));
    } catch (templateError) {
      logger.error('workbook-import', 'template-failed', 'template could not be created', { pii: { error: errorMessage(templateError) } });
      setError(t('workbookImport.errors.templateFailed', { message: errorMessage(templateError) }));
    }
  };

  const handleCopyPrompt = async () => {
    setError(null);
    try {
      await copyWorkbookAgentPrompt();
      setStatus(t('workbookImport.promptCopied'));
    } catch (copyError) {
      logger.warn('workbook-import', 'copy-failed', 'agent prompt could not be copied', { pii: { error: errorMessage(copyError) } });
      setError(t('workbookImport.errors.copyFailed'));
    }
  };

  if (!isOpen) return null;

  const updateSelection = (key: keyof Omit<WorkbookImportSelection, 'existingMonths'>) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = event.target;
    setSelection((previous) => ({ ...previous, [key]: checked }));
  };

  const warningText = (warning: WorkbookWarning) => t(`workbookImport.warnings.${warning.code}`, {
    sheet: warning.sheet, row: warning.row ?? '', detail: warning.detail ?? '',
  });

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
          <h2 id={titleId}><MaterialIcon name="table_view" /> {t('workbookImport.title')}</h2>
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
          <p id={introId} className="workbook-import-intro">{t('workbookImport.intro')}</p>

          <div className="workbook-import-actions">
            <button type="button" className="action-btn" onClick={handleDownloadTemplate}>
              <MaterialIcon name="download" /> {t('workbookImport.downloadTemplate')}
            </button>
            <button type="button" className="action-btn" onClick={handleCopyPrompt}>
              <MaterialIcon name="content_copy" /> {t('workbookImport.copyPrompt')}
            </button>
            <a className="action-btn" href={WORKBOOK_IMPORT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
              <MaterialIcon name="open_in_new" /> {t('workbookImport.guide')}
            </a>
          </div>

          {phase !== 'done' && (
            <div className="workbook-import-file">
              <button
                type="button"
                className="primary-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
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

          {loaded && plan && preview && reconciliation && (phase === 'preview' || phase === 'importing') && (
            <>
              <section className="workbook-import-section" aria-label={t('workbookImport.summaryTitle', { name: loaded.fileName })}>
                <h3>{t('workbookImport.summaryTitle', { name: loaded.fileName })}</h3>
                <ul className="workbook-import-facts">
                  {plan.yearSheets.length > 0 && <li>{t('workbookImport.yearSheets', { sheets: plan.yearSheets.join(', ') })}</li>}
                  {preview.firstMonth && preview.lastMonth && (
                    <li>{t('workbookImport.period', { from: formatMonth(preview.firstMonth), to: formatMonth(preview.lastMonth) })}</li>
                  )}
                  <li>{t('workbookImport.balanceMonths', { count: preview.balanceMonths })}</li>
                  {preview.totalOnlyMonths > 0 && (
                    <li>{t('workbookImport.totalOnlyMonths', { count: preview.totalOnlyMonths, sheet: plan.historySheet ?? '' })}</li>
                  )}
                  {preview.incomes + preview.expenses > 0 && (
                    <li>{t('workbookImport.cashflowEntries', { incomes: preview.incomes, expenses: preview.expenses })}</li>
                  )}
                  {plan.allocation && <li>{t('workbookImport.allocationFound')}</li>}
                  {plan.fire && <li>{t('workbookImport.fireFound')}</li>}
                  {plan.pensionsInNetWorth === false && <li>{t('workbookImport.pensionsExcluded')}</li>}
                  {plan.ignoredSheets.length > 0 && <li>{t('workbookImport.ignoredSheets', { sheets: plan.ignoredSheets.join(', ') })}</li>}
                </ul>
                <p className="workbook-import-hint">{t('workbookImport.currencyNote', { currency: plan.currency })}</p>
                {reconciliation.checked > 0 && (
                  <p>{t('workbookImport.reconciled', {
                    matched: reconciliation.checked - reconciliation.mismatches.length,
                    checked: reconciliation.checked,
                  })}</p>
                )}
                {reconciliation.mismatches.length > 0 && (
                  <details className="workbook-import-details">
                    <summary>{t('workbookImport.mismatchesTitle')} ({reconciliation.mismatches.length})</summary>
                    <p className="workbook-import-hint">{t('workbookImport.mismatchHelp')}</p>
                    <ul>
                      {reconciliation.mismatches.map((mismatch) => (
                        <li key={`${mismatch.year}-${mismatch.month}`}>
                          {t('workbookImport.mismatch', {
                            month: formatMonth(mismatch),
                            difference: formatDisplayPercent(
                              mismatch.reported === 0 ? 0 : ((mismatch.imported - mismatch.reported) / Math.abs(mismatch.reported)) * 100,
                              true,
                            ),
                          })}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
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

              <fieldset className="workbook-import-section">
                <legend>{t('workbookImport.whatToImport')}</legend>
                {loaded.unreadable.netWorth && <p className="workbook-import-warning">{t('workbookImport.unreadableNetWorth')}</p>}
                {loaded.unreadable.cashflow && <p className="workbook-import-warning">{t('workbookImport.unreadableCashflow')}</p>}
                {options.map(({ key, available }) => (
                  <label key={key} className="workbook-import-option">
                    <input
                      type="checkbox"
                      checked={effectiveSelection[key]}
                      disabled={!available || busy}
                      onChange={updateSelection(key)}
                      aria-describedby={`${titleId}-${key}-help`}
                    />
                    <span>
                      <strong>{t(`workbookImport.options.${key}`)}</strong>
                      <span id={`${titleId}-${key}-help`} className="workbook-import-hint">{t(`workbookImport.options.${key}Help`)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {(effectiveSelection.netWorth || effectiveSelection.cashflow) && (
                <fieldset className="workbook-import-section">
                  <legend>{t('workbookImport.existingTitle')}</legend>
                  <p className="workbook-import-hint">
                    {preview.conflictingMonths + preview.conflictingCashflowMonths > 0
                      ? t('workbookImport.existingCount', {
                        netWorth: effectiveSelection.netWorth ? preview.conflictingMonths : 0,
                        cashflow: effectiveSelection.cashflow ? preview.conflictingCashflowMonths : 0,
                      })
                      : t('workbookImport.existingNone')}
                  </p>
                  {(['keep', 'replace'] as const).map((policy) => (
                    <label key={policy} className="workbook-import-option">
                      <input
                        type="radio"
                        name={`${titleId}-existing`}
                        value={policy}
                        checked={selection.existingMonths === policy}
                        disabled={busy}
                        onChange={() => setSelection((previous) => ({ ...previous, existingMonths: policy }))}
                      />
                      <span>{t(policy === 'keep' ? 'workbookImport.keepExisting' : 'workbookImport.replaceExisting')}</span>
                    </label>
                  ))}
                  {selection.existingMonths === 'replace' && (
                    <p className="workbook-import-warning">{t('workbookImport.replaceWarning')}</p>
                  )}
                </fieldset>
              )}
            </>
          )}

          {phase === 'done' && summary && (
            <section className="workbook-import-section workbook-import-done" aria-live="polite">
              <h3><MaterialIcon name="check_circle" /> {t('workbookImport.doneTitle')}</h3>
              <p>{t('workbookImport.doneSummary', {
                added: summary.monthsAdded,
                replaced: summary.monthsReplaced,
                kept: summary.monthsKept,
                incomes: summary.incomesImported,
                expenses: summary.expensesImported,
                cashflowKept: summary.cashflowMonthsKept,
              })}</p>
              {summary.allocationAssets > 0 && <p>{t('workbookImport.doneAllocation', { count: summary.allocationAssets })}</p>}
              {summary.fireUpdated && <p>{t('workbookImport.doneFire')}</p>}
            </section>
          )}
        </div>

        <footer className="workbook-import-footer">
          {phase === 'done' ? (
            <button ref={doneButtonRef} type="button" className="primary-btn" onClick={handleClose}>{t('workbookImport.close')}</button>
          ) : (
            <>
              <button type="button" className="action-btn" onClick={handleClose} disabled={busy}>{t('workbookImport.cancel')}</button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleImport}
                disabled={!loaded || busy || nothingSelected}
              >
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
