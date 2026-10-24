// EZD-021 Step 4 (vault/plans/EZD-021.md): the AI client. Each call: validate, mode, base URL (Gemini, BFL;
// Q-0076), then the real adapter with either the stub key and a recorded fetch (stub) or the provider key and
// the global fetch read at call time (live). The call never outlives the job slice: its signal ends at
// min(ctx.timeLeft(), JOB_RUN_BUDGET_MS).
import type { ZodType } from 'zod';
import { JOB_RUN_BUDGET_MS } from '../jobs/config';
import { getAiMode, getProviderBaseUrl, getProviderKey, STUB_KEY, type AiMode } from './config';
import { AiError } from './errors';
import { anthropicMessage } from './providers/anthropic';
import { bflEditImage } from './providers/bfl';
import { geminiEditImage } from './providers/gemini';
import type { AdapterContext } from './providers/http';
import { openaiEditImage } from './providers/openai';
import { createRecordedFetch, StubMismatchError } from './test-harness/recorded-fetch';
import { getStubRecording } from './test-harness/stub';
import type {
  AiJobContext,
  AiProvider,
  ClaudeRequest,
  ClaudeResult,
  ImageEditRequest,
  ImageEditResult,
} from './types';
import { validateClaudeRequest, validateImageEditRequest } from './validate';

type Env = Record<string, string | undefined>;
type CallOptions = { env?: Env };

type Prepared = {
  mode: AiMode;
  adapter: AdapterContext;
  /** Runs the adapter call, turning a stub mismatch or the call's own timeout into its code. */
  run<T>(call: (adapter: AdapterContext) => Promise<T>): Promise<T>;
};

function prepare(ctx: AiJobContext, provider: AiProvider, purpose: string, env: Env): Prepared {
  const mode = getAiMode(env);
  let apiKey: string;
  let callFetch: typeof fetch;
  let mismatch = false;
  if (mode === 'stub') {
    apiKey = STUB_KEY;
    const recorded = createRecordedFetch(getStubRecording(provider, purpose, env)).fetch;
    callFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      try {
        return await recorded(input, init);
      } catch (error) {
        if (error instanceof StubMismatchError) mismatch = true;
        throw error;
      }
    }) as typeof fetch;
  } else {
    apiKey = getProviderKey(provider, env);
    const live = globalThis.fetch;
    callFetch = ((input: string | URL | Request, init?: RequestInit) =>
      live(input, init)) as typeof fetch;
  }

  const budgetMs = Math.min(ctx.timeLeft(), JOB_RUN_BUDGET_MS);
  if (!(budgetMs > 0)) throw new AiError('ai_provider_timeout', { retry: true, provider });
  const timeoutSignal = AbortSignal.timeout(budgetMs);
  const signal = AbortSignal.any([ctx.signal, timeoutSignal]);
  const adapter: AdapterContext = {
    apiKey,
    fetch: callFetch,
    signal,
    sleep: (ms) => ctx.sleep(ms),
    timeLeft: () => ctx.timeLeft(),
    budgetMs,
  };

  return {
    mode,
    adapter,
    async run(call) {
      try {
        return await call(adapter);
      } catch (error) {
        if (mismatch) throw new AiError('ai_stub_mismatch', { retry: false, provider });
        if (signal.aborted) throw new AiError('ai_provider_timeout', { retry: true, provider });
        if (error instanceof AiError) throw error;
        throw new AiError('ai_provider_unavailable', { retry: true, provider });
      }
    },
  };
}

export async function callClaude(
  ctx: AiJobContext,
  req: ClaudeRequest,
  opts: CallOptions = {},
): Promise<ClaudeResult> {
  const env = opts.env ?? process.env;
  validateClaudeRequest(req);
  const { mode, run } = prepare(ctx, 'anthropic', req.purpose, env);
  const result = await run((adapter) => anthropicMessage(adapter, req));
  return { ...result, mode };
}

const FENCE = /^\s*```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/;

export async function callClaudeJson<T>(
  ctx: AiJobContext,
  req: ClaudeRequest,
  schema: ZodType<T>,
  opts: CallOptions = {},
): Promise<{ data: T; result: ClaudeResult }> {
  const result = await callClaude(ctx, req, opts);
  const fenced = FENCE.exec(result.text);
  const text = fenced ? fenced[1] : result.text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError('ai_bad_response', { retry: false, provider: 'anthropic' });
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success)
    throw new AiError('ai_bad_response', { retry: false, provider: 'anthropic' });
  return { data: checked.data, result };
}

export async function editImage(
  ctx: AiJobContext,
  req: ImageEditRequest,
  opts: CallOptions = {},
): Promise<ImageEditResult> {
  const env = opts.env ?? process.env;
  validateImageEditRequest(req);
  const mode = getAiMode(env);
  const baseUrl =
    req.provider === 'gemini' || req.provider === 'bfl'
      ? getProviderBaseUrl(req.provider, env)
      : null;
  const { run } = prepare(ctx, req.provider, req.purpose, env);
  const result = await run((adapter) => {
    if (req.provider === 'gemini') return geminiEditImage(adapter, baseUrl as string, req);
    if (req.provider === 'bfl') return bflEditImage(adapter, baseUrl as string, req);
    return openaiEditImage(adapter, req);
  });
  return { ...result, provider: req.provider, modelId: req.model, mode };
}
