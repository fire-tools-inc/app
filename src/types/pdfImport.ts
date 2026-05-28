/**
 * Types for the experimental PDF expense/income import feature.
 *
 * All PDF parsing happens client-side. The optional LLM categorization step
 * is opt-in and uses a user-supplied OpenAI-compatible endpoint.
 */

import { SupportedCurrency } from './currency';
import {
  ExpenseCategory,
  ExpenseType,
  IncomeSource,
} from './expenseTracker';

/** Supported document types for heuristic parsing. */
export type PdfDocType =
  | 'auto'
  | 'receipt'
  | 'invoice'
  | 'bank_statement'
  | 'payslip';

/** Kind of transaction extracted from the PDF. */
export type ParsedKind = 'income' | 'expense';

/**
 * A single transaction draft produced by the heuristic parser (and optionally
 * refined by the LLM step). The user reviews and edits this before it is
 * committed to the expense tracker.
 */
export interface ParsedTransactionDraft {
  /** Stable local id used by the review UI. */
  id: string;
  /** Income vs expense. Detected from doc type / sign / keywords. */
  kind: ParsedKind;
  /** ISO date string (YYYY-MM-DD). Empty string if the parser could not find one. */
  date: string;
  /** Absolute amount (always non-negative). */
  amount: number;
  /** Detected currency, falls back to tracker currency if unknown. */
  currency?: SupportedCurrency;
  /** Free-form description (merchant, line item, payslip period, etc.). */
  description: string;
  /** Optional suggested expense category (built-in id or custom id). */
  suggestedCategory?: ExpenseCategory | string;
  /** Need vs want classification when kind === 'expense'. */
  suggestedExpenseType?: ExpenseType;
  /** Suggested income source when kind === 'income'. */
  suggestedIncomeSource?: IncomeSource;
  /** Document type that produced this row. */
  docType: Exclude<PdfDocType, 'auto'>;
  /** Source PDF file name (for the review UI). */
  sourceFile: string;
  /** The raw text line the parser used (for the review UI). */
  rawLine?: string;
  /** Whether the row should be imported. Defaults to true. */
  include: boolean;
  /** Confidence score in [0, 1]. Used to highlight low-confidence rows. */
  confidence: number;
  /** True once the LLM step has updated the suggested category/type. */
  llmEnriched?: boolean;
}

/**
 * Optional configuration for the LLM-powered categorization step. The user
 * supplies an OpenAI-compatible endpoint (OpenAI, Azure OpenAI, Ollama,
 * LM Studio, OpenRouter, etc.) and a model name.
 */
export interface LlmCategorizationConfig {
  /** Base URL of the OpenAI-compatible API (no trailing /chat/completions). */
  baseUrl: string;
  /** API key. Stored encrypted with the rest of user settings. */
  apiKey: string;
  /** Model identifier (e.g. "gpt-4o-mini", "llama3:8b"). */
  model: string;
}
