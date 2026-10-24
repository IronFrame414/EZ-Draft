// EZD-031 Step 3: one render through EZD-021's adapter for the model's provider.
import { DEFAULT_BASE_URLS, STUB_KEY, getProviderBaseUrl, getProviderKey } from '../../../app/src/server/ai/config';
import { bflEditImage } from '../../../app/src/server/ai/providers/bfl';
import { geminiEditImage } from '../../../app/src/server/ai/providers/gemini';
import type { AdapterContext, ImageAdapterResult } from '../../../app/src/server/ai/providers/http';
import { openaiEditImage } from '../../../app/src/server/ai/providers/openai';
import { createRecordedFetch } from '../../../app/src/server/ai/test-harness/recorded-fetch';
import { getStubRecording } from '../../../app/src/server/ai/test-harness/stub';
import type { ImageEditProvider, ImageEditRequest } from '../../../app/src/server/ai/types';
import { createCaptureFetch, type CapturedExchange } from './capture-fetch';
import { instructionFor, type ModelEntry, type Room } from './manifest';

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;
export type ProviderAccess = { apiKey: string; baseUrl: string | null };
type Env = Record<string, string | undefined>;

const RENDER_TIMEOUT_MS = 600_000;
const ORDER: ImageEditProvider[] = ['gemini', 'openai', 'bfl'];

export function resolveAccess(
  mode: 'stub' | 'live',
  providers: ImageEditProvider[],
  env: Env,
): Record<ImageEditProvider, ProviderAccess> {
  const access = {} as Record<ImageEditProvider, ProviderAccess>;
  for (const provider of ORDER) {
    if (!providers.includes(provider)) continue;
    if (mode === 'stub') {
      access[provider] = {
        apiKey: STUB_KEY,
        baseUrl: provider === 'openai' ? null : DEFAULT_BASE_URLS[provider],
      };
    } else {
      const apiKey = getProviderKey(provider, env);
      access[provider] = {
        apiKey,
        baseUrl: provider === 'openai' ? null : getProviderBaseUrl(provider, env),
      };
    }
  }
  return access;
}

export type RenderOutcome =
  | { ok: true; result: ImageAdapterResult; exchanges: CapturedExchange[]; rawUsage: unknown | null; ms: number }
  | { ok: false; errorCode: string; exchanges: CapturedExchange[]; rawUsage: unknown | null; ms: number };

const realSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
export { realSleep };

export async function renderOne(args: {
  mode: 'stub' | 'live';
  room: Room;
  entry: ModelEntry;
  access: ProviderAccess;
  env: Env;
  sleep: Sleep;
}): Promise<RenderOutcome> {
  const { mode, room, entry, access, env, sleep } = args;
  const inner =
    mode === 'stub'
      ? createRecordedFetch(getStubRecording(entry.provider, 'test.image_edit', env), { sleep }).fetch
      : globalThis.fetch;
  const capture = createCaptureFetch(inner, entry.provider, entry.settings);

  const signal = AbortSignal.timeout(RENDER_TIMEOUT_MS);
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  const ctx: AdapterContext = {
    apiKey: access.apiKey,
    fetch: capture.fetch,
    signal,
    sleep: (ms) => sleep(ms, signal),
    timeLeft: () => Math.max(0, deadline - Date.now()),
    budgetMs: RENDER_TIMEOUT_MS,
  };
  const req: ImageEditRequest = {
    purpose: mode === 'stub' ? 'test.image_edit' : 'spike.render_trial',
    provider: entry.provider,
    model: entry.model,
    instruction: instructionFor(room),
    image: room.image,
  };

  const started = Date.now();
  try {
    const result =
      entry.provider === 'gemini'
        ? await geminiEditImage(ctx, access.baseUrl as string, req)
        : entry.provider === 'openai'
          ? await openaiEditImage(ctx, req)
          : await bflEditImage(ctx, access.baseUrl as string, req);
    return { ok: true, result, exchanges: capture.exchanges(), rawUsage: capture.rawUsage(), ms: Date.now() - started };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== 'string') throw error;
    return { ok: false, errorCode: code, exchanges: capture.exchanges(), rawUsage: capture.rawUsage(), ms: Date.now() - started };
  }
}
