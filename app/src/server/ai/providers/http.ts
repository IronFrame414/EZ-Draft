// EZD-021 Step 4 (vault/plans/EZD-021.md): what the adapters share. HTTP status to error code (Step 1 table),
// JSON body reading, and the mapping of a failed fetch. Provider bodies never reach an error.
import { AiError } from '../errors';
import type { AiImage, AiProvider } from '../types';

/** What an adapter gets from the client. It imports nothing from Next.js, so a spike can call it directly. */
export type AdapterContext = {
  apiKey: string;
  fetch: typeof fetch;
  signal: AbortSignal;
  sleep(ms: number): Promise<void>;
  timeLeft(): number;
  /** The call's time budget in milliseconds (the client's budgetMs). */
  budgetMs: number;
};

/** What an image adapter returns; the client adds provider, model id and mode. */
export type ImageAdapterResult = {
  image: AiImage;
  usage: { inputTokens: number | null; outputTokens: number | null; images: number };
  requestId: string | null;
};

/** The error for a non-2xx HTTP status. */
export function mapHttpStatus(status: number, provider?: AiProvider): AiError {
  if (status === 401 || status === 403) {
    return new AiError('ai_key_rejected', { retry: false, provider, status });
  }
  if (status === 429) return new AiError('ai_rate_limited', { retry: true, provider, status });
  if (status >= 500)
    return new AiError('ai_provider_unavailable', { retry: true, provider, status });
  return new AiError('ai_provider_rejected', { retry: false, provider, status });
}

export async function readJson(response: Response, provider?: AiProvider): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AiError('ai_bad_response', { retry: false, provider });
  }
}

/** A thrown fetch: an AiError (from the stub) passes through, an abort is a timeout, anything else a network error. */
export function mapFetchError(error: unknown, signal: AbortSignal, provider?: AiProvider): AiError {
  if (error instanceof AiError) return error;
  if (signal.aborted) return new AiError('ai_provider_timeout', { retry: true, provider });
  return new AiError('ai_provider_unavailable', { retry: true, provider });
}

/** fetch through the adapter context, mapping a thrown error and a non-2xx status. */
export async function send(
  ctx: AdapterContext,
  provider: AiProvider,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let response: Response;
  try {
    response = await ctx.fetch(url, { ...init, signal: ctx.signal });
  } catch (error) {
    throw mapFetchError(error, ctx.signal, provider);
  }
  if (!response.ok) throw mapHttpStatus(response.status, provider);
  return response;
}

export function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

export function fromBase64(text: string, provider: AiProvider): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new AiError('ai_bad_response', { retry: false, provider });
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
