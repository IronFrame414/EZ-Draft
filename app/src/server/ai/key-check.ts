// EZD-5601 Step 8 (vault/plans/EZD-5601.md "D-Check"; Q-0637 call path and "Test by GET /v1/models"; Q-0638
// provider errors; AC-EZD-5601-2, -4): the user's own Anthropic key and its check. UserAiKey keeps the value in
// a private field and prints [redacted] everywhere; only reveal() gives it out. The check never reads the
// operator's provider key: in stub mode the user's key reaches only the recorded fetch.
import { getAiMode } from './config';
import { AiError } from './errors';
import { AnthropicCallError, anthropicListModels } from './providers/anthropic';
import type { AdapterContext } from './providers/http';
import { createRecordedFetch, StubMismatchError } from './test-harness/recorded-fetch';
import { getStubRecording } from './test-harness/stub';

const REDACTED = '[redacted]' as const;

export class UserAiKey {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): typeof REDACTED {
    return REDACTED;
  }

  toJSON(): typeof REDACTED {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): typeof REDACTED {
    return REDACTED;
  }
}

export const AI_KEY_CHECK_BUDGET_MS = 20_000;

export type KeyCheckResult = 'ok' | 'refused' | 'out_of_credit' | 'failed';

type Env = Record<string, string | undefined>;

export async function checkAnthropicKey(
  key: UserAiKey,
  opts: { env?: Env; signal?: AbortSignal; budgetMs?: number } = {},
): Promise<KeyCheckResult> {
  const env = opts.env ?? process.env;
  const mode = getAiMode(env);
  let callFetch: typeof fetch;
  let mismatch = false;
  if (mode === 'stub') {
    const recorded = createRecordedFetch(getStubRecording('anthropic', 'key-check', env)).fetch;
    callFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      try {
        return await recorded(input, init);
      } catch (error) {
        if (error instanceof StubMismatchError) mismatch = true;
        throw error;
      }
    }) as typeof fetch;
  } else {
    const live = globalThis.fetch;
    callFetch = ((input: string | URL | Request, init?: RequestInit) =>
      live(input, init)) as typeof fetch;
  }

  const budgetMs = opts.budgetMs ?? AI_KEY_CHECK_BUDGET_MS;
  const timeout = AbortSignal.timeout(budgetMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  const started = Date.now();
  const adapter: AdapterContext = {
    apiKey: key.reveal(),
    fetch: callFetch,
    signal,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeLeft: () => Math.max(0, budgetMs - (Date.now() - started)),
    budgetMs,
  };

  try {
    await anthropicListModels(adapter);
    return 'ok';
  } catch (error) {
    if (mismatch) throw new AiError('ai_stub_mismatch', { retry: false, provider: 'anthropic' });
    if (error instanceof AnthropicCallError) {
      if (error.errorClass === 'key_refused') return 'refused';
      if (error.errorClass === 'out_of_credit') return 'out_of_credit';
    }
    return 'failed';
  }
}
