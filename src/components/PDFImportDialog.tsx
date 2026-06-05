/**
 * Experimental PDF import dialog.
 *
 * Lets the user upload one or more PDF files, runs heuristic parsing (and an
 * optional opt-in LLM categorization step), then shows an editable preview
 * table so the user can fix and confirm before transactions are committed.
 */

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExpenseCategory,
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
import { categorizeWithLlm } from '../utils/llmCategorizer';
import { logger } from '../utils/logger';
import { MaterialIcon } from './MaterialIcon';
import './PDFImportDialog.css';

interface PDFImportDialogProps {
  onClose: () => void;
  onAddIncome: (income: Omit<IncomeEntry, 'id' | 'type'>) => void;
  onAddExpense: (expense: Omit<ExpenseEntry, 'id' | 'type'>) => void;
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
  onImported,
  defaultCurrency,
  customCategories = [],
  categoryOverrides = [],
  llmConfig,
  extractor = extractPdfText,
  categorizer = categorizeWithLlm,
}: PDFImportDialogProps) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<PdfDocType>('auto');
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [drafts, setDrafts] = useState<ParsedTransactionDraft[]>([]);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const categories: CategoryInfo[] = useMemo(
    () => getAllCategories(customCategories, categoryOverrides),
    [customCategories, categoryOverrides],
  );

  const llmConfigured = Boolean(
    llmConfig?.baseUrl && llmConfig?.apiKey && llmConfig?.model,
  );

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    setStatus(t('dialogs.pdfImport.status.readingFiles', { count: files.length }));

    const collected: ParsedTransactionDraft[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const extracted = await extractor(file);
          const { drafts: parsed } = parsePdf(extracted, docType, defaultCurrency);
          if (parsed.length === 0 && extracted.lines.length === 0) {
            setError(prev => appendError(prev,
              t('dialogs.pdfImport.errors.noExtractableText', { fileName: file.name })));
          } else if (parsed.length === 0) {
            setError(prev => appendError(prev,
              t('dialogs.pdfImport.errors.noTransactionsInFile', { fileName: file.name })));
          }
          collected.push(...parsed);
        } catch (err) {
          logger.error('pdf-import-dialog', 'pdf-parse-failed', 'failed to parse PDF', { pii: { fileName: file.name, error: (err as Error)?.message } });
          const reason = err instanceof Error ? err.message : t('common.unknownError');
          setError(prev => appendError(prev, t('dialogs.pdfImport.errors.failedToRead', { fileName: file.name, reason })));
        }
      }

      let final = collected;
      if (useLlm && llmConfigured && collected.length > 0) {
        setStatus(t('dialogs.pdfImport.status.runningLlm'));
        try {
          final = await categorizer(collected, llmConfig!, categories);
        } catch (err) {
          logger.error('pdf-import-dialog', 'llm-categorization-failed', 'LLM categorization failed', { pii: { error: (err as Error)?.message } });
          setError(t('dialogs.pdfImport.errors.llmFailed'));
        }
      }

      setDrafts(final);
      const allZero = final.length > 0 && final.every(d => !(d.amount > 0));
      if (final.length === 0) {
        setStatus(t('dialogs.pdfImport.status.noTransactionsDetected'));
      } else if (allZero) {
        setStatus(t('dialogs.pdfImport.status.blankRowsDetected', { count: final.length }));
      } else {
        setStatus(t('dialogs.pdfImport.status.transactionsDetected', { count: final.length }));
      }
    } finally {
      setBusy(false);
    }
  }, [docType, defaultCurrency, useLlm, llmConfigured, llmConfig, categories, extractor, categorizer, t]);

  const updateDraft = (id: string, patch: Partial<ParsedTransactionDraft>) => {
    setDrafts(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleConfirm = () => {
    const toCommit = drafts.filter(d => d.include);
    const invalid = toCommit.find(d => !d.date || !(d.amount > 0));
    if (invalid) {
      setError(t('dialogs.pdfImport.errors.invalidIncludedRows'));
      return;
    }
    let incomeCount = 0;
    let expenseCount = 0;
    for (const d of toCommit) {
      if (d.kind === 'income') {
        onAddIncome({
          date: d.date,
          amount: d.amount,
          description: d.description || t('dialogs.pdfImport.defaultDescription'),
          currency: d.currency,
          source: (d.suggestedIncomeSource ?? 'OTHER') as IncomeSource,
        });
        incomeCount++;
      } else {
        onAddExpense({
          date: d.date,
          amount: d.amount,
          description: d.description || t('dialogs.pdfImport.defaultDescription'),
          currency: d.currency,
          category: (d.suggestedCategory ?? NO_CATEGORY_ID) as ExpenseCategory,
          expenseType: (d.suggestedExpenseType ?? 'WANT') as ExpenseType,
        });
        expenseCount++;
      }
    }
    setStatus(t('dialogs.pdfImport.status.importedEntries', { incomeCount, expenseCount }));
    // Navigate the page to the earliest imported transaction's period so the
    // user can actually see the rows that were just added (they may belong to
    // a different month than the one currently in view).
    const earliest = toCommit.reduce<string | null>(
      (min, d) => (min === null || d.date < min ? d.date : min),
      null,
    );
    if (earliest && onImported) {
      const [year, month] = earliest.split('-').map(Number);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        onImported({ year, month });
      }
    }
    onClose();
  };

  const totalIncluded = drafts.filter(d => d.include).length;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
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
              <label htmlFor="pdf-doc-type">{t('dialogs.pdfImport.documentType')}</label>
              <select
                id="pdf-doc-type"
                value={docType}
                onChange={e => setDocType(e.target.value as PdfDocType)}
                disabled={busy}
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
                accept="application/pdf,.pdf"
                multiple
                disabled={busy || IS_DEMO_MODE}
                title={IS_DEMO_MODE ? t('demo.disabledAction') : undefined}
                onChange={e => handleFiles(e.target.files)}
              />
              {IS_DEMO_MODE && (
                <p className="form-help" style={{ color: '#92400e' }}>{t('demo.disabledAction')}</p>
              )}
            </div>

            <div className={`form-group pdf-import-llm-toggle${llmConfigured ? '' : ' is-disabled'}`}>
              <input
                id="pdf-use-llm"
                type="checkbox"
                checked={useLlm && llmConfigured}
                disabled={!llmConfigured || busy}
                onChange={e => setUseLlm(e.target.checked)}
              />
              <label htmlFor="pdf-use-llm">
                {t('dialogs.pdfImport.useAiCategorization')}
                {!llmConfigured && <span className="disabled-tag">{t('settings.disabled')}</span>}
                {!llmConfigured && (
                  <span className="pdf-row-meta">{t('dialogs.pdfImport.configureAiHint')}</span>
                )}
              </label>
            </div>
          </div>

          <div className={`pdf-import-status${error ? ' error' : ''}`} role="status" aria-live="polite">
            {busy && <MaterialIcon name="hourglass_top" size="small" />}
            <span style={{ whiteSpace: 'pre-line' }}>{error || status}</span>
          </div>

          {drafts.length > 0 && (
            <>
              <div className="pdf-import-summary">
                <span>{t('dialogs.pdfImport.summaryRows', { included: totalIncluded, total: drafts.length })}</span>
              </div>

              <div className="pdf-import-table-wrapper">
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
                    {drafts.map(d => (
                      <tr
                        key={d.id}
                        className={`${d.include ? '' : 'excluded '}${d.confidence < 0.6 ? 'low-confidence' : ''}`.trim()}
                      >
                        <td className="col-include">
                          <input
                            type="checkbox"
                            checked={d.include}
                            onChange={e => updateDraft(d.id, { include: e.target.checked })}
                            aria-label={t('dialogs.pdfImport.includeDescription', { description: d.description })}
                          />
                        </td>
                        <td>
                          <select
                            value={d.kind}
                            onChange={e => updateDraft(d.id, { kind: e.target.value as 'income' | 'expense' })}
                          >
                            <option value="income">{t('expenseTracker.income')}</option>
                            <option value="expense">{t('expenseTracker.expense')}</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={d.date}
                            onChange={e => updateDraft(d.id, { date: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={d.description}
                            onChange={e => updateDraft(d.id, { description: e.target.value })}
                          />
                          <div className="pdf-row-meta">
                            {d.sourceFile} · {d.docType}
                            {d.llmEnriched ? t('dialogs.pdfImport.aiSuffix') : ''}
                          </div>
                        </td>
                        <td>
                          <input
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
                              value={(d.suggestedCategory as string) ?? NO_CATEGORY_ID}
                              onChange={e => updateDraft(d.id, { suggestedCategory: e.target.value })}
                            >
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ) : (
                            <select
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

          <div className="pdf-import-actions">
            <button className="action-btn" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
            <button
              className="action-btn primary"
              onClick={handleConfirm}
              disabled={busy || totalIncluded === 0}
            >
              <MaterialIcon name="check" /> {t('common.import')} {totalIncluded > 0 ? `(${totalIncluded})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
