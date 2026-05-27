/**
 * Optional LLM-powered categorization for the PDF import experimental feature.
 *
 * Calls a user-supplied OpenAI-compatible /chat/completions endpoint (works
 * with OpenAI, Azure OpenAI, Ollama, LM Studio, OpenRouter, etc.). Never
 * called unless the user has explicitly configured it AND opted in for the
 * current import. Fails gracefully — returns the original drafts on any error.
 */

import {
  ExpenseCategory,
  CategoryInfo,
  IncomeSource,
} from '../types/expenseTracker';
import {
  LlmCategorizationConfig,
  ParsedTransactionDraft,
} from '../types/pdfImport';

const DEFAULT_TIMEOUT_MS = 30_000;

interface LlmResponseItem {
  id: string;
  category?: string;
  expenseType?: 'NEED' | 'WANT';
  incomeSource?: IncomeSource;
}

function buildSystemPrompt(categories: CategoryInfo[]): string {
  const list = categories
    .map(c => `- ${c.id}: ${c.name}`)
    .join('\n');
  return [
    'You are a careful financial assistant that classifies bank/receipt transactions.',
    'For each transaction return a JSON object with these fields:',
    '  - id: string (echo the input id verbatim)',
    '  - category: one of the category IDs below (use NO_CATEGORY if unsure). Only used for expenses.',
    '  - expenseType: "NEED" or "WANT" (only for expenses).',
    '  - incomeSource: one of SALARY, FREELANCE, BUSINESS, INVESTMENTS, RENTAL, PENSION, SOCIAL_SECURITY, BONUS, GIFT, OTHER (only for incomes).',
    'Available category IDs:',
    list,
    'Respond with strictly valid JSON of shape { "results": LlmResponseItem[] }. No prose.',
  ].join('\n');
}

function buildUserPrompt(drafts: ParsedTransactionDraft[]): string {
  const compact = drafts.map(d => ({
    id: d.id,
    kind: d.kind,
    amount: d.amount,
    currency: d.currency,
    description: d.description,
    rawLine: d.rawLine,
  }));
  return `Classify these transactions:\n${JSON.stringify(compact)}`;
}

/**
 * Apply LLM categorization to a list of parsed transaction drafts.
 *
 * @param drafts        Drafts produced by the heuristic parsers.
 * @param config        User-supplied LLM endpoint config.
 * @param categories    Live category list (built-in + custom + overrides).
 * @param fetchImpl     Injectable fetch (used by tests).
 * @returns             Drafts with `suggestedCategory` / `suggestedExpenseType` /
 *                      `suggestedIncomeSource` and `llmEnriched` updated. On
 *                      any error returns the input drafts unchanged.
 */
export async function categorizeWithLlm(
  drafts: ParsedTransactionDraft[],
  config: LlmCategorizationConfig,
  categories: CategoryInfo[],
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ParsedTransactionDraft[]> {
  if (drafts.length === 0) return drafts;
  if (!config?.baseUrl || !config?.apiKey || !config?.model) return drafts;

  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) return drafts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = {
      model: config.model,
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: buildSystemPrompt(categories) },
        { role: 'user', content: buildUserPrompt(drafts) },
      ],
    };

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`LLM categorization failed: HTTP ${res.status}`);
      return drafts;
    }

    const json = await res.json();
    const content: string | undefined =
      json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text;
    if (typeof content !== 'string') return drafts;

    const parsed = safeParseJson(content);
    if (!parsed || !Array.isArray(parsed.results)) return drafts;

    const results: LlmResponseItem[] = parsed.results;
    const byId = new Map(results.map(r => [r.id, r]));
    const allCategoryIds = new Set(categories.map(c => c.id));

    return drafts.map(draft => {
      const r = byId.get(draft.id);
      if (!r) return draft;
      const next: ParsedTransactionDraft = { ...draft, llmEnriched: true };
      if (draft.kind === 'expense') {
        if (r.category && allCategoryIds.has(r.category)) {
          next.suggestedCategory = r.category as ExpenseCategory | string;
        }
        if (r.expenseType === 'NEED' || r.expenseType === 'WANT') {
          next.suggestedExpenseType = r.expenseType;
        }
      } else if (draft.kind === 'income') {
        if (r.incomeSource && isIncomeSource(r.incomeSource)) {
          next.suggestedIncomeSource = r.incomeSource;
        }
      }
      return next;
    });
  } catch (error) {
    console.error('LLM categorization error:', error);
    return drafts;
  } finally {
    clearTimeout(timeout);
  }
}

function safeParseJson(content: string): { results?: LlmResponseItem[] } | null {
  try {
    return JSON.parse(content);
  } catch {
    // Some models wrap JSON in code fences — strip and retry.
    const stripped = content
      .replace(/^```(?:json)?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
}

const INCOME_SOURCES: ReadonlySet<IncomeSource> = new Set<IncomeSource>([
  'SALARY', 'FREELANCE', 'BUSINESS', 'INVESTMENTS', 'RENTAL',
  'PENSION', 'SOCIAL_SECURITY', 'BONUS', 'GIFT', 'OTHER',
]);

function isIncomeSource(value: string): value is IncomeSource {
  return INCOME_SOURCES.has(value as IncomeSource);
}
