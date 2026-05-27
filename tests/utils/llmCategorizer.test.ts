import { describe, expect, it, vi } from 'vitest';
import { categorizeWithLlm } from '../../src/utils/llmCategorizer';
import type { LlmCategorizationConfig, ParsedTransactionDraft } from '../../src/types/pdfImport';
import { EXPENSE_CATEGORIES } from '../../src/types/expenseTracker';

const config: LlmCategorizationConfig = {
  baseUrl: 'https://api.openai.example/v1',
  apiKey: 'sk-test',
  model: 'gpt-test',
};

function expenseDraft(id: string, description: string): ParsedTransactionDraft {
  return {
    id,
    kind: 'expense',
    date: '2024-03-15',
    amount: 12,
    description,
    docType: 'bank_statement',
    sourceFile: 'x.pdf',
    include: true,
    confidence: 0.5,
  };
}

function incomeDraft(id: string, description: string): ParsedTransactionDraft {
  return {
    id,
    kind: 'income',
    date: '2024-03-15',
    amount: 2000,
    description,
    docType: 'bank_statement',
    sourceFile: 'x.pdf',
    include: true,
    confidence: 0.5,
  };
}

describe('categorizeWithLlm', () => {
  it('returns input drafts when list is empty', async () => {
    const result = await categorizeWithLlm([], config, EXPENSE_CATEGORIES);
    expect(result).toEqual([]);
  });

  it('returns input drafts when config is incomplete', async () => {
    const drafts = [expenseDraft('a', 'Some coffee')];
    const result = await categorizeWithLlm(drafts, { baseUrl: '', apiKey: '', model: '' }, EXPENSE_CATEGORIES);
    expect(result).toBe(drafts);
  });

  it('posts to /chat/completions with proper headers and parses JSON response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                results: [
                  { id: 'a', category: 'GROCERIES', expenseType: 'NEED' },
                  { id: 'b', incomeSource: 'SALARY' },
                ],
              }),
            },
          },
        ],
      }),
    } as unknown as Response);

    const drafts = [expenseDraft('a', 'mystery merchant'), incomeDraft('b', 'payroll')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.example/v1/chat/completions');
    expect((opts as RequestInit).method).toBe('POST');
    expect((opts as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    expect(result[0].suggestedCategory).toBe('GROCERIES');
    expect(result[0].suggestedExpenseType).toBe('NEED');
    expect(result[0].llmEnriched).toBe(true);
    expect(result[1].suggestedIncomeSource).toBe('SALARY');
    expect(result[1].llmEnriched).toBe(true);
  });

  it('ignores unknown category ids returned by the LLM', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"results":[{"id":"a","category":"NOT_A_REAL_ID","expenseType":"NEED"}]}' } }],
      }),
    } as unknown as Response);

    const drafts = [expenseDraft('a', 'x')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result[0].suggestedCategory).toBeUndefined();
    expect(result[0].suggestedExpenseType).toBe('NEED');
  });

  it('falls back to input drafts when HTTP fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as unknown as Response);
    const drafts = [expenseDraft('a', 'x')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result).toBe(drafts);
  });

  it('falls back when LLM returns non-JSON content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    } as unknown as Response);
    const drafts = [expenseDraft('a', 'x')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result).toBe(drafts);
  });

  it('strips code fences from LLM output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"results":[{"id":"a","category":"GROCERIES","expenseType":"NEED"}]}\n```' } }],
      }),
    } as unknown as Response);
    const drafts = [expenseDraft('a', 'x')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result[0].suggestedCategory).toBe('GROCERIES');
  });
});
