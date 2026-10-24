// EZD-021 Step 1 (vault/plans/EZD-021.md): model ids, key and base-URL names, and the mode, all read per call
// (EZD-004 Step 5). This is the only file in app/src that names the provider keys and base URLs.
import { AiError } from './errors';
import type { AiProvider } from './types';

type Env = Record<string, string | undefined>;

/** Claude model ids (orchestrator dispatch; no vault source names a Claude model). */
export const CLAUDE_MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
} as const;

export const PROVIDER_KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  bfl: 'BFL_API_KEY',
} as const;

/** Q-0076 (deferred by Josh): the Gemini and Flux addresses are settings. */
export const PROVIDER_BASE_URL_ENV = {
  gemini: 'GEMINI_BASE_URL',
  bfl: 'BFL_BASE_URL',
} as const;

export const DEFAULT_BASE_URLS = {
  gemini: 'https://generativelanguage.googleapis.com',
  bfl: 'https://api.bfl.ai',
} as const;

/** Anthropic and OpenAI keep fixed addresses (Q-0076 covers only Gemini and Flux). */
export const FIXED_BASE_URLS = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
} as const;

/** The key the adapters get in stub mode; real keys are never read then. */
export const STUB_KEY = 'stub-key';

export type AiMode = 'stub' | 'live';

export function getAiMode(env: Env = process.env): AiMode {
  const mode = env.AI_MODE;
  if (mode !== 'stub' && mode !== 'live') throw new AiError('ai_mode_not_set', { retry: false });
  if (mode === 'stub' && env.VERCEL_ENV === 'production') {
    throw new AiError('ai_stub_not_allowed', { retry: false });
  }
  return mode;
}

export function getProviderKey(provider: AiProvider, env: Env = process.env): string {
  const value = env[PROVIDER_KEY_ENV[provider]];
  if (value === undefined || value.trim() === '') {
    throw new AiError('ai_key_not_set', { retry: false, provider });
  }
  return value;
}

export function getProviderBaseUrl(
  provider: keyof typeof PROVIDER_BASE_URL_ENV,
  env: Env = process.env,
): string {
  const raw = env[PROVIDER_BASE_URL_ENV[provider]]?.trim();
  if (raw === undefined || raw === '') return DEFAULT_BASE_URLS[provider];
  const invalid = () => new AiError('ai_base_url_invalid', { retry: false, provider });
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw invalid();
  if (raw.includes('?') || raw.includes('#')) throw invalid();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}
