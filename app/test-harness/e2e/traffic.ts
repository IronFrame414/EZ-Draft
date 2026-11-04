// EZD-163 (vault/plans/EZD-163.md section 1 Step 1 algorithm, section 3; Q-0337 (b)): the traffic collector
// for the leak checks (EZD-016a T12, EZD-007f T21 and T23). Its context route fetches every loopback request
// in Node with route.fetch, reads the whole body, then fulfills the request, so the page gets only bytes the
// test read. Nothing here awaits a read on a Request or Response object of the browser (C1, C2): those race
// the service worker's lifetime ("Worker closed") and miss bodies. A navigation redirect is handed back
// through Playwright's internal _redirectNavigationRequest so the next request is routed too (D-Redirect;
// traffic.spec.ts R4 fails by name if an upgrade removes it). A non-loopback request falls through to the
// net guard of EZD-021 and is marked external. Labels carry the path only, never the query (a query can hold
// a token_hash).
import type { BrowserContext, Request, Route } from '@playwright/test';
import { isLoopback } from '../net-guard/net-guard.mjs';

/** D-Bound: one third of the 60,000 ms test timeout, so a named error comes before the test times out. */
export const TRAFFIC_SETTLE_TIMEOUT_MS = 20000;
export const TRAFFIC_FETCH_TIMEOUT_MS = 20000;

export type TrafficOptions = { settleTimeoutMs?: number; fetchTimeoutMs?: number };

export type TrafficRequest = {
  method: string;
  path: string;
  resourceType: string;
  fromServiceWorker: boolean;
  isNavigation: boolean;
  external: boolean;
  headerNames: string[];
};

export type TrafficResponse = {
  method: string;
  path: string;
  resourceType: string;
  status: number;
  fromServiceWorker: boolean;
  headerValues: string[];
  body: string;
  redirectedTo: string | null;
};

export type TrafficResult = {
  requests: TrafficRequest[];
  responses: TrafficResponse[];
  cookieValues: string[];
};

export type Traffic = { stop(): void; settle(): Promise<TrafficResult> };

// Playwright redirectStatus2 (coreBundle.js 57095); other 3xx are fulfilled as they are.
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
// The body Node holds is already decoded and complete; fulfill sets the length (coreBundle.js 28017-28025).
const DROPPED_RESPONSE_HEADERS = [
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
];

type RedirectableRoute = { _redirectNavigationRequest?: (url: string) => Promise<void> };

type Item = {
  entry: TrafficRequest;
  index: number;
  done: boolean;
  finished: Promise<void>;
  resolve(): void;
  failure: string | null;
};

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0] ?? '';
}

function labelOf(entry: TrafficRequest): string {
  return `${entry.method} ${entry.path}`;
}

export async function captureTraffic(
  context: BrowserContext,
  opts: TrafficOptions = {},
): Promise<Traffic> {
  const fetchLimit = opts.fetchTimeoutMs ?? TRAFFIC_FETCH_TIMEOUT_MS;
  const settleLimit = opts.settleTimeoutMs ?? TRAFFIC_SETTLE_TIMEOUT_MS;
  let recording = true;
  const requests: TrafficRequest[] = [];
  const responses: TrafficResponse[] = [];
  const byRequest = new Map<Request, Item>();
  const items: Item[] = [];

  // Synchronous getters only.
  function entryFor(req: Request): Item | null {
    const known = byRequest.get(req);
    if (known) return known;
    if (!recording) return null;
    const entry: TrafficRequest = {
      method: req.method(),
      path: new URL(req.url()).pathname,
      resourceType: req.resourceType(),
      fromServiceWorker: req.serviceWorker() !== null,
      isNavigation: req.isNavigationRequest(),
      external: false,
      headerNames: [],
    };
    requests.push(entry);
    let resolve: () => void = () => {};
    const finished = new Promise<void>((r) => {
      resolve = r;
    });
    const item: Item = {
      entry,
      index: requests.length - 1,
      done: false,
      finished,
      resolve,
      failure: null,
    };
    byRequest.set(req, item);
    items.push(item);
    return item;
  }

  // The request event comes before the route (P12); entryFor makes the order irrelevant.
  context.on('request', (req) => {
    entryFor(req);
  });

  async function handler(route: Route): Promise<void> {
    let item: Item | null = null;
    try {
      const req = route.request();
      item = entryFor(req);
      if (item === null) {
        await route.fallback();
        return;
      }
      const entry = item.entry;
      const url = new URL(req.url());
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isLoopback(url)) {
        entry.external = true;
        await route.fallback();
        return;
      }
      // What route.fetch sends (coreBundle.js 60815).
      entry.headerNames = Object.keys(req.headers()).map((k) => k.toLowerCase());

      let res: Awaited<ReturnType<Route['fetch']>>;
      let buf: Buffer;
      try {
        // No postData option: route.fetch sends the request's own post data (coreBundle.js 60866).
        res = await route.fetch({ maxRedirects: entry.isNavigation ? 0 : 20, timeout: fetchLimit });
        buf = await res.body();
      } catch (error) {
        item.failure = firstLine(error);
        await route.abort().catch(() => {});
        return;
      }

      const status = res.status();
      const response: TrafficResponse = {
        method: entry.method,
        path: entry.path,
        resourceType: entry.resourceType,
        status,
        fromServiceWorker: entry.fromServiceWorker,
        headerValues: res.headersArray().map((h) => h.value),
        body: buf.toString('utf8'),
        redirectedTo: null,
      };
      responses.push(response);

      const location = res.headers()['location'];
      if (entry.isNavigation && REDIRECT_STATUSES.includes(status) && location) {
        if ((status === 307 || status === 308) && entry.method !== 'GET') {
          item.failure = `redirect ${status} keeps the method`;
          await route.abort().catch(() => {});
          return;
        }
        const target = new URL(location, req.url());
        response.redirectedTo = target.pathname;
        const redirect = (route as unknown as RedirectableRoute)._redirectNavigationRequest;
        if (typeof redirect !== 'function') {
          item.failure = 'route redirect unavailable';
          await route.abort().catch(() => {});
          return;
        }
        await redirect.call(route, target.toString());
        return;
      }

      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(res.headers())) {
        if (!DROPPED_RESPONSE_HEADERS.includes(name.toLowerCase())) headers[name] = value;
      }
      await route.fulfill({ status, headers, body: buf });
    } catch (error) {
      if (item !== null) item.failure = firstLine(error);
    } finally {
      if (item !== null) {
        item.done = true;
        item.resolve();
      }
    }
  }

  // Resolves only after the route is in place, so no request of the test goes unrouted. The route stays
  // until the context closes.
  await context.route(() => true, handler);

  function stop(): void {
    recording = false;
  }

  let settling: Promise<TrafficResult> | null = null;

  async function settleOnce(): Promise<TrafficResult> {
    stop();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = await Promise.race([
      Promise.all(items.map((i) => i.finished)).then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), settleLimit);
      }),
    ]);
    clearTimeout(timer);
    if (timedOut) {
      const pending = items.filter((i) => !i.done).map((i) => labelOf(i.entry));
      throw new Error(`traffic reads pending after ${settleLimit} ms: ${pending.join(', ')}`);
    }
    const failed = items.find((i) => i.failure !== null);
    if (failed) {
      throw new Error(`traffic read failed: ${labelOf(failed.entry)}: ${failed.failure}`);
    }
    const cookieValues = (await context.cookies()).map((c) => c.value);
    return { requests, responses, cookieValues };
  }

  return {
    stop,
    settle(): Promise<TrafficResult> {
      if (settling === null) settling = settleOnce();
      return settling;
    },
  };
}
