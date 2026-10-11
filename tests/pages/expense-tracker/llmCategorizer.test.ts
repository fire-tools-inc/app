import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categorizeWithLlm } from '../../../src/utils/llmCategorizer';
import type { LlmCategorizationConfig, ParsedTransactionDraft } from '../../../src/types/pdfImport';
import { EXPENSE_CATEGORIES } from '../../../src/types/expenseTracker';
import { clearSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../../../src/utils/cookieSettings';
import SafeCookies from '../../../src/utils/safeCookies';
import { encryptData } from '../../../src/utils/cookieEncryption';
import { expectDiagnostic } from '../../shared/diagnostics';

beforeEach(() => {
  localStorage.clear();
  clearSettings();
});

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
  it('blocks all model calls when the Settings master AI control is disabled', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false, llmCategorization: config });
    const fetchImpl = vi.fn();
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    expect(await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl })).toBe(drafts);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(loadSettings().llmCategorization).toEqual(config);
  });

  it('cancels an in-flight model call on disable and ignores its late response even after re-enabling', async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { resolveResponse = resolve; }));
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    const result = categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const signal: AbortSignal = fetchImpl.mock.calls[0][1].signal;
    saveSettings({ ...loadSettings(), aiFeaturesEnabled: false });
    expect(signal.aborted).toBe(true);
    saveSettings({ ...loadSettings(), aiFeaturesEnabled: true });
    resolveResponse?.(new Response(JSON.stringify({
      choices: [{ message: { content: '{"results":[{"id":"a","category":"GROCERIES"}]}' } }],
    })));
    expect(await result).toBe(drafts);
  });

  it('allows opt-in model calls again after a bulk enable without changing the endpoint', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false });
    saveSettings({ ...loadSettings(), aiFeaturesEnabled: true });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"results":[{"id":"a","category":"GROCERIES"}]}' } }],
    })));
    const result = await categorizeWithLlm([expenseDraft('a', 'Synthetic merchant')], config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result[0].suggestedCategory).toBe('GROCERIES');
  });

  it('aborts on a cross-window storage update and releases settings listeners afterwards', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn((_url: string | URL | Request, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic cancellation', 'AbortError')), { once: true });
    }));
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    const result = categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl, onError });
    const requestSignal = fetchImpl.mock.calls[0][1]?.signal;
    SafeCookies.set('fire-calculator-settings', encryptData(JSON.stringify({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false })));
    window.dispatchEvent(new StorageEvent('storage', { key: 'fire-calculator-settings' }));
    expect(requestSignal?.aborted).toBe(true);
    expect(await result).toBe(drafts);
    expect(onError).not.toHaveBeenCalled();
    const read = vi.spyOn(SafeCookies, 'get');
    try {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('focus'));
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it('ignores a late response body when AI is disabled during JSON reading', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const response = new Response('{}');
    const readBody = vi.spyOn(response, 'json').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    const result = categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl: vi.fn().mockResolvedValue(response) });
    await Promise.resolve();
    expect(readBody).toHaveBeenCalledOnce();
    saveSettings({ ...DEFAULT_SETTINGS, aiFeaturesEnabled: false });
    finish?.({ choices: [{ message: { content: '{"results":[{"id":"a","category":"GROCERIES"}]}' } }] });
    expect(await result).toBe(drafts);
  });

  it('still reports a timeout rather than silently accepting a late fetch response', async () => {
    vi.useFakeTimers();
    let finish: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const onError = vi.fn();
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    try {
      const result = categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl, timeoutMs: 30, onError });
      await vi.advanceTimersByTimeAsync(31);
      finish?.(new Response('{}'));
      expect(await result).toBe(drafts);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Model categorization timed out.' }));
      expectDiagnostic('error', '[categorization-failed]: Model categorization timed out.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports local OpenAI-compatible models without an API key or forced JSON response format', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"results":[{"id":"a","category":"GROCERIES"}]}' } }],
    }), { status: 200 }));
    const result = await categorizeWithLlm([expenseDraft('a', 'Synthetic merchant')], {
      baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'local-model',
    }, EXPENSE_CATEGORIES, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(options.body)).not.toHaveProperty('response_format');
    expect(result[0].suggestedCategory).toBe('GROCERIES');
  });

  it('preserves endpoint query parameters and accepts a full chat-completions URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"results":[]}' } }],
    })));
    await categorizeWithLlm([expenseDraft('a', 'Synthetic merchant')], {
      ...config, baseUrl: 'https://models.example/v1/chat/completions?api-version=example',
    }, EXPENSE_CATEGORIES, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://models.example/v1/chat/completions?api-version=example');
  });

  it('reports model failures while retaining the editable heuristic drafts', async () => {
    const onError = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 }));
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    expect(await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl, onError })).toBe(drafts);
    expect(onError).toHaveBeenCalledOnce();
    expectDiagnostic('error', '[categorization-failed]: Model categorization failed.');
  });

  it('does not contact the model after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    expect(await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, {
      fetchImpl, signal: controller.signal,
    })).toBe(drafts);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not trust malformed model rows or mark them as enriched', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"results":[null,7,{"id":"a","category":{}}]}' } }],
    })));
    const drafts = [expenseDraft('a', 'Synthetic merchant')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result).toEqual(drafts);
    expectDiagnostic('error', '[categorization-failed]: Model categorization failed.');
  });

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
    expectDiagnostic('error', '[categorization-failed]: Model categorization failed.');
  });

  it('falls back when LLM returns non-JSON content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    } as unknown as Response);
    const drafts = [expenseDraft('a', 'x')];
    const result = await categorizeWithLlm(drafts, config, EXPENSE_CATEGORIES, { fetchImpl });
    expect(result).toBe(drafts);
    expectDiagnostic('error', '[categorization-failed]: Model categorization failed.');
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
