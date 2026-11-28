// EZD-2011 (AC-EZD-2011-1; flaky-test audit 2026-11-27 row 4): a page's own "network is quiet" wait, with a bound
// and an error that names the page and the requests still open.
// Why not page.waitForLoadState('networkidle'): Playwright 1.64 can withdraw "networkidle" and never fire it again.
// When a page is quiet for 500 ms before its load event, "networkidle" fires early; a request that then starts and
// finishes before the load event leaves it marked as fired, so no new timer starts when the request ends
// (coreBundle.js _startNetworkIdleTimer), and the load event then removes the mark (_recalculateNetworkIdle). With no
// later request, waitForLoadState('networkidle') waits for ever although nothing is open. The CI trace of the hung
// money pages sweep shows exactly this on /dev/entry/editor: every request finished, the last one a script chunk that
// loaded after hydration (the not-found boundary's), on a busy runner.
// The rule here is the same one, kept by this file: no request of the page open, and none started or ended, for
// QUIET_WINDOW_MS. Start watching before the navigation so every request of the page is seen. As in Playwright
// (_onClearLifecycle), when the page moves to a new document the requests of the document it left stop counting
// (a routed request the old document had open is never reported as ended), and only the new document's own page
// request is kept. A move inside the same document (a history change) starts no page request and drops nothing.
import type { Frame, Page, Request } from '@playwright/test';

/** Playwright's own network idle window. */
export const QUIET_WINDOW_MS = 500;
/** The longest one page may take to go quiet. */
export const PAGE_QUIET_TIMEOUT_MS = 30_000;
/** How many of the latest requests a timeout error lists (a request that repeats shows here). */
const LATEST_KEPT = 8;

export type QuietOptions = { windowMs?: number; timeoutMs?: number };

export type QuietWatch = {
  /** Resolves when the page is quiet; rejects after the bound with `label` and the open requests. */
  quiet(label: string): Promise<void>;
  stop(): void;
};

type WatchedPage = Pick<Page, 'on' | 'off' | 'mainFrame'>;
type WatchedRequest = Pick<Request, 'method' | 'url' | 'resourceType' | 'isNavigationRequest' | 'frame'>;

// The page request of a document of this frame.
function isPageRequestOf(req: WatchedRequest, frame: Frame): boolean {
  try {
    return req.isNavigationRequest() && req.frame() === frame;
  } catch {
    return false;
  }
}

function labelOf(req: WatchedRequest): string {
  return `${req.method()} ${req.url()} (${req.resourceType()})`;
}

export function watchRequests(page: WatchedPage, opts: QuietOptions = {}): QuietWatch {
  const windowMs = opts.windowMs ?? QUIET_WINDOW_MS;
  const timeoutMs = opts.timeoutMs ?? PAGE_QUIET_TIMEOUT_MS;
  const open = new Map<WatchedRequest, number>();
  const latest: string[] = [];
  let lastChange = Date.now();
  let onChange: (() => void) | null = null;
  // The page request of a new document of the main frame, from its start until the document begins or it fails.
  let pageRequest: WatchedRequest | null = null;

  const changed = (): void => {
    lastChange = Date.now();
    onChange?.();
  };
  const onRequest = (req: Request): void => {
    // A stream stays open by design; Playwright leaves it out of network idle too.
    if (req.resourceType() === 'eventsource') return;
    open.set(req, Date.now());
    if (isPageRequestOf(req, page.mainFrame())) pageRequest = req;
    latest.push(labelOf(req));
    if (latest.length > LATEST_KEPT) latest.shift();
    changed();
  };
  const onFinished = (req: Request): void => {
    if (open.delete(req)) changed();
  };
  const onFailed = (req: Request): void => {
    if (pageRequest === req) pageRequest = null;
    onFinished(req);
  };
  const onNavigated = (frame: Frame): void => {
    if (frame !== page.mainFrame() || pageRequest === null) return;
    pageRequest = null;
    let dropped = false;
    for (const req of [...open.keys()]) {
      if (!isPageRequestOf(req, frame)) dropped = open.delete(req) || dropped;
    }
    if (dropped) changed();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFailed);
  page.on('framenavigated', onNavigated);

  function report(): string {
    const now = Date.now();
    const pending = [...open].map(([req, at]) => `${labelOf(req)} open for ${now - at} ms`);
    return pending.length > 0
      ? `open requests: ${pending.join(', ')}`
      : `no request open; latest requests: ${latest.join(', ') || 'none'}`;
  }

  return {
    quiet(label: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        let quietTimer: ReturnType<typeof setTimeout> | undefined;
        const done = (): void => {
          clearTimeout(quietTimer);
          clearTimeout(limit);
          onChange = null;
        };
        const limit = setTimeout(() => {
          done();
          reject(new Error(`${label} did not go quiet within ${timeoutMs} ms; ${report()}`));
        }, timeoutMs);
        const check = (): void => {
          clearTimeout(quietTimer);
          if (open.size > 0) return;
          quietTimer = setTimeout(
            () => {
              done();
              resolve();
            },
            Math.max(0, lastChange + windowMs - Date.now()),
          );
        };
        onChange = check;
        check();
      });
    },
    stop(): void {
      page.off('request', onRequest);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
      page.off('framenavigated', onNavigated);
    },
  };
}
