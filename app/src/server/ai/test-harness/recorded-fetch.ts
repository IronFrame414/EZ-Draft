// EZD-021 Step 3 (vault/plans/EZD-021.md): a fetch-compatible function that answers from a recording, in order,
// and never touches the network. In stub mode the real adapter runs with this fetch, so the adapters' request
// building and response parsing are what the tests exercise.
import type { AiProvider } from '../types';

export type RecordedExchange = {
  match: { method: 'GET' | 'POST'; url: string }; // exact URL, or a prefix ending in '*'
  response: {
    status: number;
    headers?: Record<string, string>;
    json?: unknown;
    base64?: string;
    delayMs?: number;
  };
};

export type Recording = {
  provider: AiProvider;
  purpose: string;
  source: 'synthetic' | `live ${string}`;
  exchanges: RecordedExchange[];
};

export type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>; // lower-case names
  bodyText?: string;
  formData?: FormData;
};

export class StubMismatchError extends Error {
  readonly code = 'ai_stub_mismatch';
  constructor(detail: string) {
    super(detail);
    this.name = 'StubMismatchError';
  }
}

const LAST_KEY = '__ezdAiStubLastRequests';
type LastMap = Record<string, () => RecordedRequest[]>;

function lastMap(): LastMap {
  const g = globalThis as unknown as Record<string, LastMap | undefined>;
  return (g[LAST_KEY] ??= {});
}

/** The requests of the most recent recorded fetch created for `provider` (stub.ts lastStubRequests). */
export function lastRecordedRequests(provider: AiProvider): RecordedRequest[] {
  return lastMap()[provider]?.() ?? [];
}

export function clearLastRecordedRequests(): void {
  const map = lastMap();
  for (const key of Object.keys(map)) delete map[key];
}

type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

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

function lowerHeaders(init: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) return out;
  new Headers(init).forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function urlMatches(pattern: string, url: string): boolean {
  return pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern;
}

export function createRecordedFetch(
  recording: Recording,
  options: { sleep?: Sleep } = {},
): { fetch: typeof fetch; requests(): RecordedRequest[] } {
  const sleep = options.sleep ?? realSleep;
  const seen: RecordedRequest[] = [];
  let next = 0;

  const recordedFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input);
    const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = lowerHeaders(init?.headers ?? request?.headers);
    const entry: RecordedRequest = { method, url, headers };
    const body = init?.body ?? undefined;
    if (typeof body === 'string') entry.bodyText = body;
    else if (body instanceof FormData) entry.formData = body;
    else if (body instanceof Uint8Array) entry.bodyText = new TextDecoder().decode(body);
    else if (request && request.body) entry.bodyText = await request.clone().text();
    seen.push(entry);

    const exchange = recording.exchanges[next];
    if (!exchange) {
      throw new StubMismatchError(`no recorded exchange left for ${method} ${url}`);
    }
    if (exchange.match.method !== method || !urlMatches(exchange.match.url, url)) {
      throw new StubMismatchError(`${method} ${url} does not match exchange ${next + 1}`);
    }
    next += 1;

    const { status, headers: outHeaders = {}, json, base64, delayMs } = exchange.response;
    const signal = init?.signal ?? request?.signal ?? undefined;
    if (delayMs) await sleep(delayMs, signal ?? undefined);
    else if (signal?.aborted) throw signal.reason;

    const responseHeaders = new Headers(outHeaders);
    let payload: BodyInit | null = null;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      if (!responseHeaders.has('content-type'))
        responseHeaders.set('content-type', 'application/json');
    } else if (base64 !== undefined) {
      payload = new Uint8Array(Buffer.from(base64, 'base64'));
    }
    return new Response(payload, { status, headers: responseHeaders });
  };

  const requests = () => seen.slice();
  lastMap()[recording.provider] = requests;
  return { fetch: recordedFetch as typeof fetch, requests };
}
