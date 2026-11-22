import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import { useModalDialog } from '../hooks/useModalDialog';
import { loadSettings } from '../utils/cookieSettings';
import { loadAssetAllocation, saveAssetAllocation } from '../utils/cookieStorage';
import { DEFAULT_ASSET_CLASS_TARGETS } from '../utils/dataSync';
import { logger } from '../utils/logger';
import { OPERATION_TYPES, type NetWorthTrackerData, type OperationType } from '../types/netWorthTracker';
import type {
  OperationsImportPreview,
  OperationsImportSelection,
  OperationsImportSummary,
  OperationsWarning,
  OperationsWorkbookPlan,
} from '../utils/operationsWorkbook';
import { MAX_WORKBOOK_BYTES, READ_ERROR_CODES, errorMessage, readFileBytes } from './WorkbookImportDialog';
import './WorkbookImportDialog.css';

export const OPERATIONS_IMPORT_GUIDE_URL = 'https://github.com/fire-tools-inc/app/blob/main/docs/user/spreadsheet-import.md#investment-operations-workbook';
const MAX_LISTED_NOTES = 50;

interface OperationsWorkbookImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current Net Worth Tracker data (null when nothing is saved yet). */
  getCurrent: () => NetWorthTrackerData | null;
  /** Persist the updated Net Worth data; return false when saving failed. */
  onApply: (next: NetWorthTrackerData) => boolean;
  onImported?: (summary: OperationsImportSummary) => void;
}

type Phase = 'idle' | 'reading' | 'preview' | 'importing' | 'done';

/** Generate and download the investment operations template. */
export async function downloadOperationsTemplateFile(): Promise<void> {
  const { downloadOperationsTemplate } = await import('../utils/operationsWorkbook');
  downloadOperationsTemplate({ currency: loadSettings().currencySettings.defaultCurrency });
}

export function OperationsWorkbookImportDialog({ isOpen, onClose, getCurrent, onApply, onImported }: OperationsWorkbookImportDialogProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const introId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getCurrentRef = useRef(getCurrent);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loaded, setLoaded] = useState<{ fileName: string; plan: OperationsWorkbookPlan; preview: OperationsImportPreview; hasNetWorth: boolean } | null>(null);
  const [selection, setSelection] = useState<OperationsImportSelection>({ recordOperations: true, updateCostBasis: true });
  const [summary, setSummary] = useState<OperationsImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busy = phase === 'reading' || phase === 'importing';

  useEffect(() => {
    getCurrentRef.current = getCurrent;
  }, [getCurrent]);

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

  const formatDay = (date: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));

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
      const [bytes, reader, operations] = await Promise.all([
        readFileBytes(file),
        import('../utils/xlsxReader'),
        import('../utils/operationsWorkbook'),
      ]);
      const settings = loadSettings();
      const plan = operations.parseOperationsWorkbook(reader.readXlsxWorkbook(bytes), {
        targetCurrency: settings.currencySettings.defaultCurrency,
        fallbackRates: settings.currencySettings.fallbackRates,
      });
      setStatus(null);
      if (plan.operations.length === 0) {
        setLoaded(null);
        setPhase('idle');
        setError(t('operationsWorkbookImport.errors.noData'));
        return;
      }
      const netWorth = getCurrentRef.current();
      setLoaded({ fileName: file.name, plan, preview: operations.previewOperationsImport(plan, netWorth), hasNetWorth: Boolean(netWorth) });
      setSelection({ recordOperations: Boolean(netWorth), updateCostBasis: true });
      setPhase('preview');
    } catch (readError) {
      const code = (readError as { name?: string; code?: string }).name === 'XlsxReadError'
        ? (readError as { code: string }).code
        : 'readFailed';
      logger.warn('operations-workbook', 'read-failed', `operations workbook could not be read (${code})`, { pii: { error: errorMessage(readError) } });
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
    const previousAllocation = loadAssetAllocation();
    let allocationSaved = false;
    try {
      const { applyOperationsImport } = await import('../utils/operationsWorkbook');
      const result = applyOperationsImport(loaded.plan, { netWorth: getCurrentRef.current(), assets: previousAllocation.assets }, effectiveSelection);
      if (result.assets) {
        saveAssetAllocation(result.assets, previousAllocation.assetClassTargets ?? DEFAULT_ASSET_CLASS_TARGETS);
        allocationSaved = true;
      }
      if (result.netWorth && !onApply(result.netWorth)) throw new Error(t('planning.saveFailed'));
      logger.userAction('operations-workbook', 'imported', 'operations workbook imported', { pii: result.summary });
      setSummary(result.summary);
      setPhase('done');
      onImported?.(result.summary);
    } catch (importError) {
      if (allocationSaved && previousAllocation.assets) {
        try {
          saveAssetAllocation(previousAllocation.assets, previousAllocation.assetClassTargets ?? DEFAULT_ASSET_CLASS_TARGETS);
        } catch (rollbackError) {
          logger.error('operations-workbook', 'rollback-failed', 'asset allocation could not be restored', { pii: { error: errorMessage(rollbackError) } });
        }
      }
      logger.error('operations-workbook', 'import-failed', 'operations workbook import failed', { pii: { error: errorMessage(importError) } });
      setPhase('preview');
      setError(t('workbookImport.errors.importFailed', { message: errorMessage(importError) }));
    }
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      await downloadOperationsTemplateFile();
      setStatus(t('workbookImport.templateDownloaded'));
    } catch (templateError) {
      logger.error('operations-workbook', 'template-failed', 'operations template could not be created', { pii: { error: errorMessage(templateError) } });
      setError(t('workbookImport.errors.templateFailed', { message: errorMessage(templateError) }));
    }
  };

  const handleCopyPrompt = async () => {
    setError(null);
    try {
      const { getOperationsAgentPrompt } = await import('../utils/operationsWorkbook');
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is not available');
      await navigator.clipboard.writeText(getOperationsAgentPrompt());
      setStatus(t('workbookImport.promptCopied'));
    } catch (copyError) {
      logger.warn('operations-workbook', 'copy-failed', 'operations prompt could not be copied', { pii: { error: errorMessage(copyError) } });
      setError(t('workbookImport.errors.copyFailed'));
    }
  };

  if (!isOpen) return null;

  const plan = loaded?.plan;
  const preview = loaded?.preview;
  const options: Array<{ key: keyof OperationsImportSelection; available: boolean }> = [
    { key: 'recordOperations', available: Boolean(loaded?.hasNetWorth) },
    { key: 'updateCostBasis', available: true },
  ];
  const effectiveSelection: OperationsImportSelection = {
    recordOperations: Boolean(loaded?.hasNetWorth) && selection.recordOperations,
    updateCostBasis: selection.updateCostBasis,
  };
  const canImport = Boolean(loaded) && !busy && (effectiveSelection.recordOperations || effectiveSelection.updateCostBasis);
  const typeSummary = preview
    ? (Object.entries(preview.byType) as Array<[OperationType, number]>)
      .map(([type, count]) => `${OPERATION_TYPES.find((info) => info.id === type)?.name ?? type}: ${count}`)
      .join(' · ')
    : '';
  const warningText = (warning: OperationsWarning) => t(`operationsWorkbookImport.warnings.${warning.code}`, {
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
          <h2 id={titleId}><MaterialIcon name="swap_horiz" /> {t('operationsWorkbookImport.title')}</h2>
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
          <p id={introId} className="workbook-import-intro">{t('operationsWorkbookImport.intro')}</p>

          <div className="workbook-import-actions">
            <button type="button" className="action-btn" onClick={handleDownloadTemplate}>
              <MaterialIcon name="download" /> {t('operationsWorkbookImport.downloadTemplate')}
            </button>
            <button type="button" className="action-btn" onClick={handleCopyPrompt}>
              <MaterialIcon name="content_copy" /> {t('workbookImport.copyPrompt')}
            </button>
            <a className="action-btn" href={OPERATIONS_IMPORT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
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

          {loaded && plan && preview && (phase === 'preview' || phase === 'importing') && (
            <>
              <section className="workbook-import-section" aria-label={t('workbookImport.summaryTitle', { name: loaded.fileName })}>
                <h3>{t('workbookImport.summaryTitle', { name: loaded.fileName })}</h3>
                <ul className="workbook-import-facts">
                  <li>{t('operationsWorkbookImport.count', { count: preview.operations })}</li>
                  <li>{typeSummary}</li>
                  {preview.firstDate && preview.lastDate && (
                    <li>{t('workbookImport.period', { from: formatDay(preview.firstDate), to: formatDay(preview.lastDate) })}</li>
                  )}
                  <li>{t('operationsWorkbookImport.instruments', { count: preview.instruments })}</li>
                  {plan.ignoredSheets.length > 0 && <li>{t('workbookImport.ignoredSheets', { sheets: plan.ignoredSheets.join(', ') })}</li>}
                </ul>
                {loaded.hasNetWorth && preview.withoutMonth > 0 && (
                  <p className="workbook-import-warning">{t('operationsWorkbookImport.withoutMonth', { count: preview.withoutMonth })}</p>
                )}
                {!loaded.hasNetWorth && <p className="workbook-import-warning">{t('operationsWorkbookImport.noNetWorth')}</p>}
                <p className="workbook-import-hint">{t('operationsWorkbookImport.currencyNote', { currency: plan.currency })}</p>
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
                {options.map(({ key, available }) => (
                  <label key={key} className="workbook-import-option">
                    <input
                      type="checkbox"
                      checked={available && selection[key]}
                      disabled={!available || busy}
                      onChange={(event) => {
                        const { checked } = event.target;
                        setSelection((previous) => ({ ...previous, [key]: checked }));
                      }}
                      aria-describedby={`${titleId}-${key}-help`}
                    />
                    <span>
                      <strong>{t(`operationsWorkbookImport.options.${key}`)}</strong>
                      <span id={`${titleId}-${key}-help`} className="workbook-import-hint">{t(`operationsWorkbookImport.options.${key}Help`)}</span>
                    </span>
                  </label>
                ))}
                <p className="workbook-import-hint">{t('operationsWorkbookImport.reimportNote')}</p>
              </fieldset>
            </>
          )}

          {phase === 'done' && summary && (
            <section className="workbook-import-section workbook-import-done" aria-live="polite">
              <h3><MaterialIcon name="check_circle" /> {t('workbookImport.doneTitle')}</h3>
              <p>{t('operationsWorkbookImport.doneSummary', {
                imported: summary.operationsImported,
                missing: summary.operationsWithoutMonth,
                holdings: summary.holdingsUpdated,
                assets: summary.allocationAssetsUpdated,
              })}</p>
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
