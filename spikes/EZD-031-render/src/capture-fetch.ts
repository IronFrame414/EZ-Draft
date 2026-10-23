// EZD-031 Step 3: the wrapper around the fetch given to an adapter. It adds the model entry's settings to the first
// POST, then records every exchange with the redaction rules. Request headers and bodies are never recorded.
import type { ImageEditProvider } from '../../../app/src/server/ai/types';

export type CapturedExchange = {
  method: string;
  url: string;
  status: number;
  requestId: string | null;
  json: unknown | null;
  contentType: string | null;
  bytes: number | null;
};

const MAX_STRING = 256;
const IMAGE_KEYS = new Set(['data', 'b64_json']);
const redactedText = (value: string) => `<redacted ${value.length} chars>`;

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.length > MAX_STRING ? redactedText(value) : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      out[key] = typeof inner === 'string' && IMAGE_KEYS.has(key) ? redactedText(inner) : redact(inner);
    }
    return out;
  }
  return value;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function withoutKeyParam(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('key');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Adds settings to a request body without replacing anything the adapter set. */
function applySettings(
  provider: ImageEditProvider,
  settings: Record<string, unknown>,
  init: RequestInit | undefined,
): RequestInit | undefined {
  if (!init) return init;
  const body = init.body;
  if (provider === 'openai') {
    if (body instanceof FormData) {
      for (const [key, value] of Object.entries(settings)) body.append(key, String(value));
    }
    return init;
  }
  if (typeof body !== 'string') return init;
  const parsed = JSON.parse(body) as Record<string, unknown>;
  for (const [key, value] of Object.entries(settings)) {
    if (provider === 'gemini' && key === 'generationConfig' && isObject(value)) {
      parsed.generationConfig = { ...(isObject(parsed.generationConfig) ? parsed.generationConfig : {}), ...value };
    } else {
      parsed[key] = value;
    }
  }
  return { ...init, body: JSON.stringify(parsed) };
}

export function createCaptureFetch(
  inner: typeof fetch,
  provider: ImageEditProvider,
  settings: Record<string, unknown> | null,
): { fetch: typeof fetch; exchanges(): CapturedExchange[]; rawUsage(): unknown | null } {
  const exchanges: CapturedExchange[] = [];
  let firstPostDone = false;

  const wrapped = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = String(init?.method ?? 'GET').toUpperCase();
    let sendInit = init;
    if (method === 'POST' && !firstPostDone) {
      firstPostDone = true;
      if (settings) sendInit = applySettings(provider, settings, init);
    }
    const response = await inner(input, sendInit);

    const copy = response.clone();
    const contentType = copy.headers.get('content-type');
    const entry: CapturedExchange = {
      method,
      url: withoutKeyParam(input instanceof Request ? input.url : String(input)),
      status: response.status,
      requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
      json: null,
      contentType: null,
      bytes: null,
    };
    if (contentType && contentType.includes('json')) {
      try {
        entry.json = redact(await copy.json());
      } catch {
        entry.json = null;
      }
    } else {
      entry.contentType = contentType;
      entry.bytes = (await copy.arrayBuffer()).byteLength;
    }
    exchanges.push(entry);
    return response;
  };

  const rawUsage = (): unknown | null => {
    for (const exchange of exchanges) {
      if (!isObject(exchange.json)) continue;
      const block = provider === 'gemini' ? exchange.json.usageMetadata : provider === 'openai' ? exchange.json.usage : undefined;
      if (block !== undefined) return block;
    }
    return null;
  };

  return { fetch: wrapped as typeof fetch, exchanges: () => exchanges.slice(), rawUsage };
}
