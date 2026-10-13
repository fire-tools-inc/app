/**
 * Experimental document and receipt import dialog.
 *
 * Lets the user select documents or capture photos, runs local parsing (and an
 * optional opt-in LLM categorization step), then shows an editable preview
 * table so the user can fix and confirm before transactions are committed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExpenseEntry,
  ExpenseType,
  IncomeEntry,
  IncomeSource,
  INCOME_SOURCES,
  NO_CATEGORY_ID,
  CategoryInfo,
  getAllCategories,
  CustomCategory,
  CategoryOverride,
} from '../types/expenseTracker';
import { SupportedCurrency } from '../types/currency';
import {
  LlmCategorizationConfig,
  ParsedTransactionDraft,
  PdfDocType,
} from '../types/pdfImport';
import { extractPdfText } from '../utils/pdfTextExtractor';
import { IS_DEMO_MODE } from '../utils/demoMode';
import { parsePdf } from '../utils/pdfHeuristics';
import { categorizeWithLlm, isLlmConfigured } from '../utils/llmCategorizer';
import { getApiBaseUrl } from '../utils/apiBase';
import { isValidCalendarDate } from '../utils/dateValidation';
import { extractDocumentTextWithLiteParse, getReceiptFile, markReceiptReviewed, saveReceipt } from '../utils/documentImportApi';
import type { ReceiptDocument } from '../types/receiptImport';
import { loadSettings, subscribeToSettingsChanges } from '../utils/cookieSettings';
import { logger } from '../utils/logger';
import { MaterialIcon } from './MaterialIcon';
import { ReceiptInbox } from './ReceiptInbox';
import { ReceiptPairing } from './ReceiptPairing';
import type { ImportCategorizationRule } from '../types/expensePlanning';
import { applyImportCategorizationRules } from '../utils/importCategorizationRules';
import './PDFImportDialog.css';

interface PDFImportDialogProps {
  onClose: () => void;
  onAddIncome: (income: Omit<IncomeEntry, 'id' | 'type'>) => void;
  onAddExpense: (expense: Omit<ExpenseEntry, 'id' | 'type'>) => void;
  /** Persists the complete reviewed batch before receipt status is updated. */
  onCommitDrafts?: (drafts: ParsedTransactionDraft[]) => void | Promise<void>;
  /** Called after a successful import so the page can navigate to the imported period. */
  onImported?: (target: { year: number; month: number }) => void;
  defaultCurrency: SupportedCurrency;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
  llmConfig?: LlmCategorizationConfig;
  /** Injected for tests. Defaults to {@link extractPdfText}. */
  extractor?: (file: File) => Promise<import('../utils/pdfTextExtractor').ExtractedPdf>;
  /** Injected for tests. */
  categorizer?: typeof categorizeWithLlm;
  liteParseExtractor?: typeof extractDocumentTextWithLiteParse;
  categorizationRules?: ImportCategorizationRule[];
}

const DOC_TYPE_OPTIONS: { value: PdfDocType; labelKey: string }[] = [
  { value: 'auto', labelKey: 'dialogs.pdfImport.documentTypes.auto' },
  { value: 'receipt', labelKey: 'dialogs.pdfImport.documentTypes.receipt' },
  { value: 'invoice', labelKey: 'dialogs.pdfImport.documentTypes.invoice' },
  { value: 'bank_statement', labelKey: 'dialogs.pdfImport.documentTypes.bankStatement' },
  { value: 'payslip', labelKey: 'dialogs.pdfImport.documentTypes.payslip' },
];

function appendError(prev: string, msg: string): string {
  return prev ? `${prev}\n${msg}` : msg;
}

export function PDFImportDialog({
  onClose,
  onAddIncome,
  onAddExpense,
  onCommitDrafts,
  onImported,
  defaultCurrency,
  customCategories = [],
  categoryOverrides = [],
  llmConfig,
  extractor = extractPdfText,
  categorizer = categorizeWithLlm,
  liteParseExtractor = extractDocumentTextWithLiteParse,
  categorizationRules = [],
}: PDFImportDialogProps) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<PdfDocType>('auto');
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(() => loadSettings().aiFeaturesEnabled);
  const [drafts, setDrafts] = useState<ParsedTransactionDraft[]>([]);
  const [ruleMatches, setRuleMatches] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [batchSaved, setBatchSaved] = useState(false);
  const [engine, setEngine] = useState<'pdfjs' | 'liteparse'>('pdfjs');
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [pairingActive, setPairingActive] = useState(false);
  const [receiptRefreshKey, setReceiptRefreshKey] = useState(0);
  const [draftReceiptIds, setDraftReceiptIds] = useState<Record<string, number>>({});
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const running = useRef<AbortController | null>(null);
  const aiConsent = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => subscribeToSettingsChanges(() => {
    const enabled = loadSettings().aiFeaturesEnabled;
    setAiFeaturesEnabled(enabled);
    if (!enabled) {
      aiConsent.current = false;
      setUseLlm(false);
    }
  }), []);

  useEffect(() => {
    let mounted = true;
    if (!IS_DEMO_MODE) void getApiBaseUrl().then(url => { if (mounted) setBackendAvailable(Boolean(url)); }).catch(error => {
      logger.error('document-import', 'backend-resolution-failed', 'Receipt backend could not be resolved.', { pii: { error: String(error) } });
    });
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLButtonElement>('.dialog-close')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]'))
        .filter(element => !element.closest('[hidden]') && !element.closest('details:not([open])'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.current.focus(); return; }
      if (!dialog.current.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      mounted = false;
      const controller = running.current;
      running.current = null;
      controller?.abort();
      document.removeEventListener('keydown', keydown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!previewFile) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(previewFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  const categories: CategoryInfo[] = useMemo(
    () => getAllCategories(customCategories, categoryOverrides),
    [customCategories, categoryOverrides],
  );

  const llmConfigured = isLlmConfigured(llmConfig);

  const handleFiles = useCallback(async (files: FileList | null, sourceReceipt?: ReceiptDocument) => {
    if ((!files || files.length === 0) && !sourceReceipt) return;
    if (IS_DEMO_MODE) { setError(t('demo.disabledAction')); return; }
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError('');
    setStatus(t('dialogs.pdfImport.status.readingFiles', { count: sourceReceipt ? 1 : files?.length ?? 0 }));

    const collected: ParsedTransactionDraft[] = [];
    const receiptIds: Record<string, number> = {};
    let storedReceipt = false;
    try {
      const selected = sourceReceipt ? [await getReceiptFile(sourceReceipt, controller.signal)] : Array.from(files ?? []);
      for (const file of selected) {
        if (controller.signal.aborted) return;
        try {
          const photo = file.type.startsWith('image/') || /\.(?:jpe?g|png|webp)$/i.test(file.name);
          const receipt = sourceReceipt ?? (photo ? await saveReceipt(file, controller.signal) : undefined);
          if (controller.signal.aborted) return;
          if (receipt) {
            storedReceipt = true;
            setPreviewFile(file);
          }
          const extracted = photo || engine === 'liteparse'
            ? await liteParseExtractor(file, controller.signal) : await extractor(file);
          if (controller.signal.aborted) return;
          const { drafts: parsed } = parsePdf(extracted, docType, defaultCurrency);
          if (parsed.length === 0 && extracted.lines.length === 0) {
            setError(prev => appendError(prev,
              t('dialogs.pdfImport.errors.noExtractableText', { fileName: file.name })));
          } else if (parsed.length === 0) {
            setError(prev => appendError(prev,
              t('dialogs.pdfImport.errors.noTransactionsInFile', { fileName: file.name })));
          }
          collected.push(...parsed.map((draft, index) => {
            if (!receipt) return draft;
            const id = `receipt-${receipt.sha256}-${index}`;
            receiptIds[id] = receipt.id;
            return { ...draft, id };
          }));
        } catch (err) {
          if (controller.signal.aborted) return;
          logger.error('pdf-import-dialog', 'document-parse-failed', 'failed to parse document; stored receipts are retained', { pii: { fileName: file.name, error: (err as Error)?.message } });
          const reason = err instanceof Error ? err.message : t('common.unknownError');
          setError(prev => appendError(prev, t('dialogs.pdfImport.errors.failedToRead', { fileName: file.name, reason })));
        }
      }

      const classified = applyImportCategorizationRules(collected, categorizationRules, defaultCurrency, categories);
      if (classified.invalidRuleIds.length) {
        logger.warn('pdf-import-dialog', 'invalid-rule-category', 'categorization rules referencing missing categories were not applied', {
          pii: { ruleIds: classified.invalidRuleIds },
        });
        setError(previous => appendError(previous, t('planning.missingCategory')));
      }
      let final = classified.drafts;
      const unmatched = final.filter(draft => !Object.prototype.hasOwnProperty.call(classified.matches, draft.id));
      if (aiConsent.current && loadSettings().aiFeaturesEnabled && isLlmConfigured(llmConfig) && unmatched.length > 0) {
        setStatus(t('dialogs.pdfImport.status.runningLlm'));
        try {
          const categorized = await categorizer(unmatched, llmConfig, categories, {
            signal: controller.signal,
            onError: () => setError(previous => appendError(previous, t('dialogs.pdfImport.errors.llmFailed'))),
          });
          if (aiConsent.current && loadSettings().aiFeaturesEnabled) {
            const enriched = new Map(categorized.map(draft => [draft.id, draft]));
            final = final.map(draft => enriched.get(draft.id) ?? draft);
          }
        } catch (err) {
          logger.error('pdf-import-dialog', 'llm-categorization-failed', 'LLM categorization failed', { pii: { error: (err as Error)?.message } });
          if (!controller.signal.aborted) setError(previous => appendError(previous, t('dialogs.pdfImport.errors.llmFailed')));
        }
      }

      if (controller.signal.aborted) return;
      const previousIds = new Set(draftsRef.current.map(draft => draft.id));
      setRuleMatches(previous => ({
        ...previous,
        ...Object.fromEntries(Object.entries(classified.matches).filter(([id]) => !previousIds.has(id))),
      }));
      setDrafts(previous => {
        const ids = new Set(previous.map(draft => draft.id));
        return [...previous, ...final.filter(draft => !ids.has(draft.id))];
      });
      setDraftReceiptIds(previous => ({ ...previous, ...receiptIds }));
      const allZero = final.length > 0 && final.every(d => !(d.amount > 0));
      if (final.length === 0) {
        setStatus(t('dialogs.pdfImport.status.noTransactionsDetected'));
      } else if (allZero) {
        setStatus(t('dialogs.pdfImport.status.blankRowsDetected', { count: final.length }));
      } else {
        setStatus(t('dialogs.pdfImport.status.transactionsDetected', { count: final.length }));
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        logger.error('pdf-import-dialog', 'document-load-failed', 'A receipt could not be loaded.', { pii: { error: String(failure) } });
        setError(failure instanceof Error ? failure.message : t('common.unknownError'));
      }
    } finally {
      if (running.current === controller && !controller.signal.aborted) {
        running.current = null;
        if (storedReceipt) setReceiptRefreshKey(value => value + 1);
        setBusy(false);
      }
    }
  }, [docType, defaultCurrency, llmConfig, categories, categorizationRules, extractor, categorizer, liteParseExtractor, engine, t]);

  const updateDraft = (id: string, patch: Partial<ParsedTransactionDraft>) => {
    setRuleMatches(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)));
    setDrafts(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleConfirm = async () => {
    if (IS_DEMO_MODE) { setError(t('demo.disabledAction')); return; }
    const toCommit = drafts.filter(d => d.include);
    const invalid = toCommit.find(d => !isValidCalendarDate(d.date) || !Number.isFinite(d.amount) || !(d.amount > 0));
    if (invalid) {
      setError(t('dialogs.pdfImport.errors.invalidIncludedRows'));
      return;
    }
    const incomeCount = toCommit.filter(draft => draft.kind === 'income').length;
    const expenseCount = toCommit.length - incomeCount;
    let saved = batchSaved;
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError('');
    try {
      if (!batchSaved && onCommitDrafts) {
        await onCommitDrafts(toCommit.map(draft => ({
          ...draft, description: draft.description || t('dialogs.pdfImport.defaultDescription'),
        })));
      } else if (!batchSaved) {
        for (const draft of toCommit) {
          const transaction = {
            date: draft.date,
            amount: draft.amount,
            description: draft.description || t('dialogs.pdfImport.defaultDescription'),
            currency: draft.currency,
          };
          if (draft.kind === 'income') {
            onAddIncome({ ...transaction, source: draft.suggestedIncomeSource ?? 'OTHER' });
          } else {
            onAddExpense({
              ...transaction, category: draft.suggestedCategory ?? NO_CATEGORY_ID,
              expenseType: draft.suggestedExpenseType ?? 'WANT',
            });
          }
        }
      }
      if (controller.signal.aborted) return;
      saved = true;
      setBatchSaved(true);
      for (const id of new Set(toCommit.map(draft => draftReceiptIds[draft.id]).filter((id): id is number => id !== undefined))) {
        await markReceiptReviewed(id, controller.signal);
      }
      if (controller.signal.aborted) return;
      setStatus(t('dialogs.pdfImport.status.importedEntries', { incomeCount, expenseCount }));
      const earliest = toCommit.reduce<string | null>(
        (min, draft) => min === null || draft.date < min ? draft.date : min, null,
      );
      if (earliest && onImported) {
        const [year, month] = earliest.split('-').map(Number);
        onImported({ year, month });
      }
      running.current = null;
      setBusy(false);
      onClose();
    } catch (failure) {
      if (!controller.signal.aborted) {
        logger.error('pdf-import-dialog', 'commit-failed', 'The reviewed import could not be completed.', { pii: { error: String(failure) } });
        setError(t(saved ? 'receiptImport.reviewStatusFailed' : 'receiptImport.commitFailed', {
          reason: failure instanceof Error ? failure.message : t('common.unknownError'),
        }));
      }
    } finally {
      if (running.current === controller && !controller.signal.aborted) {
        running.current = null;
        setBusy(false);
      }
    }
  };

  const totalIncluded = drafts.filter(d => d.include).length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        ref={dialog}
        tabIndex={-1}
        className="dialog pdf-import-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-import-title"
      >
        <div className="dialog-header">
          <h2 id="pdf-import-title">
            <MaterialIcon name="picture_as_pdf" /> {t('dialogs.pdfImport.title')}
          </h2>
          <button className="dialog-close" onClick={onClose} aria-label={t('dialogs.pdfImport.closeDialog')}>×</button>
        </div>

        <div className="dialog-form">
          <div className="pdf-import-controls">
            <div className="form-group">
              <label htmlFor="document-engine">{t('receiptImport.engine')}</label>
              <select id="document-engine" value={engine} disabled={busy || batchSaved}
                onChange={event => setEngine(event.target.value as 'pdfjs' | 'liteparse')}>
                <option value="pdfjs">{t('receiptImport.pdfjs')}</option>
                <option value="liteparse">{t('receiptImport.liteparse')}</option>
              </select>
              <p className="form-help">{t('receiptImport.engineHelp')}</p>
            </div>
            <div className="form-group">
              <label htmlFor="pdf-doc-type">{t('dialogs.pdfImport.documentType')}</label>
              <select
                id="pdf-doc-type"
                value={docType}
                onChange={e => setDocType(e.target.value as PdfDocType)}
                disabled={busy || batchSaved}
              >
                {DOC_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="pdf-files">{t('dialogs.pdfImport.pdfFiles')}</label>
              <input
                id="pdf-files"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                multiple
                disabled={busy || batchSaved || IS_DEMO_MODE}
                title={IS_DEMO_MODE ? t('demo.disabledAction') : undefined}
                onChange={e => { const input = e.target; void handleFiles(input.files).finally(() => { input.value = ''; }); }}
              />
              {IS_DEMO_MODE && (
                <p className="form-help" style={{ color: '#92400e' }}>{t('demo.disabledAction')}</p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="receipt-camera">{t('receiptImport.camera')}</label>
              <input id="receipt-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                disabled={busy || batchSaved || IS_DEMO_MODE} onChange={event => {
                  const input = event.target;
                  void handleFiles(input.files).finally(() => { input.value = ''; });
                }} />
            </div>

            <div className={`form-group pdf-import-llm-toggle${llmConfigured && aiFeaturesEnabled ? '' : ' is-disabled'}`}>
              <input
                id="pdf-use-llm"
                type="checkbox"
                checked={useLlm && llmConfigured && aiFeaturesEnabled}
                disabled={!llmConfigured || !aiFeaturesEnabled || busy || batchSaved || IS_DEMO_MODE}
                onChange={e => {
                  aiConsent.current = e.target.checked;
                  setUseLlm(e.target.checked);
                }}
              />
              <label htmlFor="pdf-use-llm">
                {t('dialogs.pdfImport.useAiCategorization')}
                {(!llmConfigured || !aiFeaturesEnabled) && <span className="disabled-tag">{t('settings.disabled')}</span>}
                {!aiFeaturesEnabled ? <span className="pdf-row-meta">{t('aiSettings.disabledHint')}</span> : !llmConfigured && (
                  <span className="pdf-row-meta">{t('dialogs.pdfImport.configureAiHint')}</span>
                )}
              </label>
            </div>
            {previewUrl && <img className="receipt-preview" src={previewUrl} alt={t('receiptImport.preview')} />}
          </div>

          <div className={`pdf-import-status${error ? ' error' : ''}`} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
            {busy && <MaterialIcon name="hourglass_top" size="small" />}
            <span style={{ whiteSpace: 'pre-line' }}>{error || status}</span>
          </div>

          {drafts.length > 0 && (
            <>
              <div className="pdf-import-summary">
                <span>{t('dialogs.pdfImport.summaryRows', { included: totalIncluded, total: drafts.length })}</span>
              </div>

              <div className="pdf-import-table-wrapper" role="region" tabIndex={0} aria-label={t('dialogs.pdfImport.detectedTransactions')}>
                <table className="pdf-import-table" aria-label={t('dialogs.pdfImport.detectedTransactions')}>
                  <thead>
                    <tr>
                      <th className="col-include" aria-label={t('dialogs.pdfImport.includeRow')}>✓</th>
                      <th className="col-kind">{t('dialogs.pdfImport.kind')}</th>
                      <th className="col-date">{t('expenseTracker.date')}</th>
                      <th>{t('expenseTracker.description')}</th>
                      <th className="col-amount">{t('expenseTracker.amount')}</th>
                      <th className="col-category">{t('dialogs.pdfImport.categorySource')}</th>
                      <th className="col-extra">{t('expenseTracker.type')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, index) => (
                      <tr
                        key={d.id}
                        className={`${d.include ? '' : 'excluded '}${d.confidence < 0.6 ? 'low-confidence' : ''}`.trim()}
                      >
                        <td className="col-include">
                          <input
                            type="checkbox"
                            disabled={busy || batchSaved}
                            checked={d.include}
                            onChange={e => updateDraft(d.id, { include: e.target.checked })}
                            aria-label={t('dialogs.pdfImport.includeDescription', { description: d.description })}
                          />
                        </td>
                        <td>
                          <select
                            disabled={busy || batchSaved}
                            aria-label={`${t('dialogs.pdfImport.kind')} ${index + 1}`}
                            value={d.kind}
                            onChange={e => updateDraft(d.id, { kind: e.target.value as 'income' | 'expense' })}
                          >
                            <option value="income">{t('expenseTracker.income')}</option>
                            <option value="expense">{t('expenseTracker.expense')}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            disabled={busy || batchSaved}
                            aria-label={`${t('expenseTracker.date')} ${index + 1}`}
                            type="date"
                            value={d.date}
                            onChange={e => updateDraft(d.id, { date: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            disabled={busy || batchSaved}
                            aria-label={`${t('expenseTracker.description')} ${index + 1}`}
                            type="text"
                            value={d.description}
                            onChange={e => updateDraft(d.id, { description: e.target.value })}
                          />
                          <div className="pdf-row-meta">
                            {d.sourceFile} · {d.docType}
                            {d.llmEnriched ? t('dialogs.pdfImport.aiSuffix') : ''}
                            {Object.prototype.hasOwnProperty.call(ruleMatches, d.id) && <span>{t('planning.matchedRule', { name: ruleMatches[d.id] })}</span>}
                          </div>
                        </td>
                        <td>
                          <input
                            disabled={busy || batchSaved}
                            aria-label={`${t('expenseTracker.amount')} ${index + 1}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={d.amount}
                            onChange={e => updateDraft(d.id, { amount: Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          {d.kind === 'expense' ? (
                            <select
                              disabled={busy || batchSaved}
                              aria-label={`${t('expenseTracker.category')} ${index + 1}`}
                              value={(d.suggestedCategory as string) ?? NO_CATEGORY_ID}
                              onChange={e => updateDraft(d.id, { suggestedCategory: e.target.value })}
                            >
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              disabled={busy || batchSaved}
                              aria-label={`${t('dialogs.pdfImport.categorySource')} ${index + 1}`}
                              value={d.suggestedIncomeSource ?? 'OTHER'}
                              onChange={e => updateDraft(d.id, { suggestedIncomeSource: e.target.value as IncomeSource })}
                            >
                              {INCOME_SOURCES.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {d.kind === 'expense' ? (
                            <select
                              disabled={busy || batchSaved}
                              aria-label={`${t('expenseTracker.type')} ${index + 1}`}
                              value={d.suggestedExpenseType ?? 'WANT'}
                              onChange={e => updateDraft(d.id, { suggestedExpenseType: e.target.value as ExpenseType })}
                            >
                              <option value="NEED">{t('expenseTracker.need')}</option>
                              <option value="WANT">{t('expenseTracker.want')}</option>
                            </select>
                          ) : (
                            <span className="pdf-row-meta">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!busy && drafts.length === 0 && !error && !status && (
            <div className="pdf-import-empty">
              {t('dialogs.pdfImport.emptyState')}
            </div>
          )}
          <ReceiptInbox available={backendAvailable && !IS_DEMO_MODE} busy={busy || batchSaved} pairingActive={pairingActive}
            refreshKey={receiptRefreshKey} onReview={receipt => { void handleFiles(null, receipt); }}
            onDeleted={id => setDraftReceiptIds(previous => Object.fromEntries(Object.entries(previous).filter(([, receiptId]) => receiptId !== id)))} />
          <ReceiptPairing available={backendAvailable && !IS_DEMO_MODE} onActiveChange={setPairingActive} />

          <div className="pdf-import-actions">
            <button className="action-btn" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
            <button
              className="action-btn primary"
              onClick={() => { void handleConfirm(); }}
              disabled={busy || totalIncluded === 0 || IS_DEMO_MODE}
            >
              <MaterialIcon name="check" /> {batchSaved ? t('receiptImport.finishReview') : t('common.import')} {totalIncluded > 0 ? `(${totalIncluded})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
