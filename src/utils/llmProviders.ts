/**
 * Presets for the optional AI categorization endpoint. Every provider is
 * called through its OpenAI-compatible chat/completions API directly from
 * this device; presets only pre-fill the base URL and describe requirements.
 */
import type { LlmCategorizationConfig, LlmProvider } from '../types/pdfImport';

export interface LlmProviderPreset {
  id: LlmProvider;
  /** Display name (product names are not translated). */
  label: string;
  /** Base URL filled in when the preset is selected; empty for custom endpoints. */
  baseUrl: string;
  apiKeyRequired: boolean;
  modelPlaceholder: string;
  /** Extra headers the provider requires for requests made from a browser or desktop renderer. */
  headers?: Readonly<Record<string, string>>;
  docsUrl?: string;
}

export const LLM_PROVIDER_PRESETS: readonly LlmProviderPreset[] = [
  {
    id: 'local', label: 'Local model (Ollama, LM Studio, llama.cpp, vLLM)', baseUrl: 'http://localhost:11434/v1',
    apiKeyRequired: false, modelPlaceholder: 'llama3.2, qwen2.5, gpt-oss:20b',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
  },
  {
    id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyRequired: true, modelPlaceholder: 'openai/gpt-4o-mini', docsUrl: 'https://openrouter.ai/docs/quickstart',
  },
  {
    id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    apiKeyRequired: true, modelPlaceholder: 'gpt-4o-mini', docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
  },
  {
    id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyRequired: true, modelPlaceholder: 'gemini-2.5-flash', docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
  },
  {
    id: 'anthropic', label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1',
    apiKeyRequired: true, modelPlaceholder: 'claude-haiku-4-5',
    // Anthropic rejects cross-origin requests unless the caller opts in explicitly.
    headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    docsUrl: 'https://docs.anthropic.com/en/api/openai-sdk',
  },
  {
    id: 'custom', label: 'Other OpenAI-compatible endpoint', baseUrl: '',
    apiKeyRequired: false, modelPlaceholder: 'model-id',
  },
];

const LLM_PROVIDER_IDS = new Set<string>(LLM_PROVIDER_PRESETS.map(preset => preset.id));

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && LLM_PROVIDER_IDS.has(value);
}

export function getLlmProviderPreset(provider: LlmProvider): LlmProviderPreset {
  return LLM_PROVIDER_PRESETS.find(preset => preset.id === provider) ?? LLM_PROVIDER_PRESETS[LLM_PROVIDER_PRESETS.length - 1];
}

function isLoopbackUrl(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl.trim());
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '0.0.0.0'
      || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

/** Saved provider, or one inferred for configurations saved before presets existed. */
export function resolveLlmProvider(config: Pick<LlmCategorizationConfig, 'baseUrl' | 'provider'> | undefined): LlmProvider {
  if (isLlmProvider(config?.provider)) return config.provider;
  return config?.baseUrl && isLoopbackUrl(config.baseUrl) ? 'local' : 'custom';
}

export function llmProviderHeaders(config: Pick<LlmCategorizationConfig, 'baseUrl' | 'provider'>): Record<string, string> {
  return { ...(getLlmProviderPreset(resolveLlmProvider(config)).headers ?? {}) };
}

/** Whether the selected preset needs an API key that has not been entered. */
export function isLlmApiKeyMissing(config: LlmCategorizationConfig): boolean {
  return getLlmProviderPreset(resolveLlmProvider(config)).apiKeyRequired && !config.apiKey?.trim();
}
