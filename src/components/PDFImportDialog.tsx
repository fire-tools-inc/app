/**
 * Experimental PDF import dialog.
 *
 * Lets the user upload one or more PDF files, runs heuristic parsing (and an
 * optional opt-in LLM categorization step), then shows an editable preview
 * table so the user can fix and confirm before transactions are committed.
 */

import { useCallback, useMemo, useState } from 'react';
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
import { parsePdf } from '../utils/pdfHeuristics';
import { categorizeWithLlm } from '../utils/llmCategorizer';
import { MaterialIcon } from './MaterialIcon';
import './PDFImportDialog.css';

interface PDFImportDialogProps {
  onClose: () => void;
  onAddIncome: (income: Omit<IncomeEntry, 'id' | 'type'>) => void;
  onAddExpense: (expense: Omit<ExpenseEntry, 'id' | 'type'>) => void;
  defaultCurrency: SupportedCurrency;
  customCategories?: CustomCategory[];
  categoryOverrides?: CategoryOverride[];
  llmConfig?: LlmCategorizationConfig;
  /** Injected for tests. Defaults to {@link extractPdfText}. */
  extractor?: (file: File) => Promise<import('../utils/pdfTextExtractor').ExtractedPdf>;
  /** Injected for tests. */
  categorizer?: typeof categorizeWithLlm;
}

const DOC_TYPE_OPTIONS: { value: PdfDocType; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'bank_statement', label: 'Bank / credit-card statement' },
  { value: 'payslip', label: 'Payslip' },
];

export function PDFImportDialog({
  onClose,
  onAddIncome,
  onAddExpense,
  defaultCurrency,
  customCategories = [],
  categoryOverrides = [],
  llmConfig,
  extractor = extractPdfText,
  categorizer = categorizeWithLlm,
}: PDFImportDialogProps) {
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
    setStatus(`Reading ${files.length} file${files.length === 1 ? '' : 's'}…`);

    const collected: ParsedTransactionDraft[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const extracted = await extractor(file);
          const { drafts: parsed } = parsePdf(extracted, docType, defaultCurrency);
          collected.push(...parsed);
        } catch (err) {
          console.error('Failed to parse PDF', file.name, err);
          setError(prev =>
            prev
              ? `${prev}\nFailed to read "${file.name}".`
              : `Failed to read "${file.name}".`);
        }
      }

      let final = collected;
      if (useLlm && llmConfigured && collected.length > 0) {
        setStatus('Running LLM categorization…');
        try {
          final = await categorizer(collected, llmConfig!, categories);
        } catch (err) {
          console.error('LLM categorization failed', err);
          setError('LLM categorization failed — using heuristic results.');
        }
      }

      setDrafts(final);
      setStatus(
        final.length === 0
          ? 'No transactions detected. Try a different document type.'
          : `Detected ${final.length} transaction${final.length === 1 ? '' : 's'}. Review and confirm below.`,
      );
    } finally {
      setBusy(false);
    }
  }, [docType, defaultCurrency, useLlm, llmConfigured, llmConfig, categories, extractor, categorizer]);

  const updateDraft = (id: string, patch: Partial<ParsedTransactionDraft>) => {
    setDrafts(prev => prev.map(d => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleConfirm = () => {
    const toCommit = drafts.filter(d => d.include);
    const invalid = toCommit.find(d => !d.date || !(d.amount > 0));
    if (invalid) {
      setError('Each included row needs a date and an amount greater than zero.');
      return;
    }
    let incomeCount = 0;
    let expenseCount = 0;
    for (const d of toCommit) {
      if (d.kind === 'income') {
        onAddIncome({
          date: d.date,
          amount: d.amount,
          description: d.description || 'PDF import',
          currency: d.currency,
          source: (d.suggestedIncomeSource ?? 'OTHER') as IncomeSource,
        });
        incomeCount++;
      } else {
        onAddExpense({
          date: d.date,
          amount: d.amount,
          description: d.description || 'PDF import',
          currency: d.currency,
          category: (d.suggestedCategory ?? NO_CATEGORY_ID) as ExpenseCategory,
          expenseType: (d.suggestedExpenseType ?? 'WANT') as ExpenseType,
        });
        expenseCount++;
      }
    }
    setStatus(`Imported ${incomeCount} income + ${expenseCount} expense entries.`);
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
            <MaterialIcon name="picture_as_pdf" /> Import from PDF (experimental)
          </h2>
          <button className="dialog-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>

        <div className="dialog-form">
          <div className="pdf-import-controls">
            <div className="form-group">
              <label htmlFor="pdf-doc-type">Document type</label>
              <select
                id="pdf-doc-type"
                value={docType}
                onChange={e => setDocType(e.target.value as PdfDocType)}
                disabled={busy}
              >
                {DOC_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="pdf-files">PDF files</label>
              <input
                id="pdf-files"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={busy}
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            <div className="form-group pdf-import-llm-toggle">
              <input
                id="pdf-use-llm"
                type="checkbox"
                checked={useLlm && llmConfigured}
                disabled={!llmConfigured || busy}
                onChange={e => setUseLlm(e.target.checked)}
              />
              <label htmlFor="pdf-use-llm">
                Use AI categorization
                {!llmConfigured && (
                  <span className="pdf-row-meta"> — configure an OpenAI-compatible endpoint in Settings first.</span>
                )}
              </label>
            </div>
          </div>

          <div className={`pdf-import-status${error ? ' error' : ''}`} role="status" aria-live="polite">
            {busy && <MaterialIcon name="hourglass_top" size="small" />}
            <span>{error || status}</span>
          </div>

          {drafts.length > 0 && (
            <>
              <div className="pdf-import-summary">
                <span><strong>{totalIncluded}</strong> of {drafts.length} rows will be imported.</span>
              </div>

              <div className="pdf-import-table-wrapper">
                <table className="pdf-import-table" aria-label="Detected transactions">
                  <thead>
                    <tr>
                      <th className="col-include" aria-label="Include row">✓</th>
                      <th className="col-kind">Kind</th>
                      <th className="col-date">Date</th>
                      <th>Description</th>
                      <th className="col-amount">Amount</th>
                      <th className="col-category">Category / Source</th>
                      <th className="col-extra">Type</th>
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
                            aria-label={`Include ${d.description}`}
                          />
                        </td>
                        <td>
                          <select
                            value={d.kind}
                            onChange={e => updateDraft(d.id, { kind: e.target.value as 'income' | 'expense' })}
                          >
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
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
                            {d.llmEnriched ? ' · AI' : ''}
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
                              <option value="NEED">Need</option>
                              <option value="WANT">Want</option>
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
              Choose one or more PDF files to start. Nothing is uploaded anywhere — parsing happens in your browser.
            </div>
          )}

          <div className="pdf-import-actions">
            <button className="action-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="action-btn primary"
              onClick={handleConfirm}
              disabled={busy || totalIncluded === 0}
            >
              <MaterialIcon name="check" /> Import {totalIncluded > 0 ? `(${totalIncluded})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
