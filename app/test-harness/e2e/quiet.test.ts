// EZD-2011 U1-U10 (AC-EZD-2011-1, AC-EZD-2011-2). watchRequests: the page is quiet when no request is open and none
// started or ended for 500 ms (Playwright's network idle window); a page that does not go quiet fails after the
// bound with the page's name and the open requests. A fake page and fake timers, so no browser starts.
import type { Frame, Page, Request } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PAGE_QUIET_TIMEOUT_MS, QUIET_WINDOW_MS, watchRequests } from './quiet';

type Listener = (arg: Request | Frame) => void;

const MAIN = { name: 'main' } as unknown as Frame;
const CHILD = { name: 'child' } as unknown as Frame;

function fakePage() {
  const listeners = new Map<string, Set<Listener>>();
  const page = {
    mainFrame: () => MAIN,
    on: (event: string, fn: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off: (event: string, fn: Listener) => {
      listeners.get(event)?.delete(fn);
    },
  } as unknown as Pick<Page, 'on' | 'off' | 'mainFrame'>;
  const emit = (event: string, arg: Request | Frame) => {
    for (const fn of listeners.get(event) ?? []) fn(arg);
  };
  const count = () => [...listeners.values()].reduce((n, s) => n + s.size, 0);
  return { page, emit, count };
}

// A 'document' request is the page request of `frame`.
function request(url: string, resourceType = 'script', method = 'GET', frame: Frame = MAIN): Request {
  return {
    url: () => url,
    resourceType: () => resourceType,
    method: () => method,
    isNavigationRequest: () => resourceType === 'document',
    frame: () => frame,
  } as unknown as Request;
}

// 'pending', 'quiet' or the error's message, read after the timers so far have run.
function outcomeOf(p: Promise<void>): { get(): string } {
  let state = 'pending';
  p.then(
    () => {
      state = 'quiet';
    },
    (e: Error) => {
      state = e.message;
    },
  );
  return { get: () => state };
}

describe('EZD-2011 watchRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('EZD-2011 U1 the window is 500 ms and the bound per page is 30 s', () => {
    expect(QUIET_WINDOW_MS).toBe(500);
    expect(PAGE_QUIET_TIMEOUT_MS).toBe(30_000);
  });

  test('EZD-2011 U2 a page with no request is quiet 500 ms after the watch began, not before', async () => {
    const { page } = fakePage();
    const out = outcomeOf(watchRequests(page).quiet('page /a'));
    await vi.advanceTimersByTimeAsync(499);
    expect(out.get()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()).toBe('quiet');
  });

  test('EZD-2011 U3 the 500 ms run from the last request ending', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page);
    const doc = request('http://app/a', 'document');
    emit('request', doc);
    await vi.advanceTimersByTimeAsync(2000);
    const out = outcomeOf(watch.quiet('page /a'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(out.get()).toBe('pending');
    emit('requestfinished', doc);
    await vi.advanceTimersByTimeAsync(499);
    expect(out.get()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()).toBe('quiet');
  });

  // The hang of audit row 4: the page was quiet for more than 500 ms, then one late request started and ended
  // before the load event, and nothing came after. Playwright's networkidle never fired again; this wait ends.
  test('EZD-2011 U4 a late request that ends after an earlier quiet spell still leaves the page quiet', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page);
    const doc = request('http://app/dev/entry/editor', 'document');
    emit('request', doc);
    emit('requestfinished', doc);
    await vi.advanceTimersByTimeAsync(940);
    const late = request('http://app/_next/static/chunks/late.js');
    emit('request', late);
    await vi.advanceTimersByTimeAsync(180);
    emit('requestfinished', late);
    await vi.advanceTimersByTimeAsync(300);
    // The load event has fired; the sweep starts its wait now.
    const out = outcomeOf(watch.quiet('page /dev/entry/editor'));
    await vi.advanceTimersByTimeAsync(199);
    expect(out.get()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()).toBe('quiet');
  });

  test('EZD-2011 U5 a request that never ends fails after the bound, naming the page and the request', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page, { timeoutMs: 3000 });
    emit('request', request('http://app/api/stuck', 'fetch', 'POST'));
    const done = request('http://app/ok.js');
    emit('request', done);
    emit('requestfailed', done);
    const out = outcomeOf(watch.quiet('money pages sweep: page /settings/users'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(out.get()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()).toBe(
      'money pages sweep: page /settings/users did not go quiet within 3000 ms; ' +
        'open requests: POST http://app/api/stuck (fetch) open for 3000 ms',
    );
  });

  test('EZD-2011 U6 a request that repeats faster than the window fails after the bound and is listed', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page, { timeoutMs: 1000 });
    const out = outcomeOf(watch.quiet('page /poll'));
    for (let i = 0; i < 5; i++) {
      const poll = request('http://app/api/poll', 'fetch');
      emit('request', poll);
      emit('requestfinished', poll);
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(out.get()).toBe(
      'page /poll did not go quiet within 1000 ms; no request open; latest requests: ' +
        Array.from({ length: 4 }, () => 'GET http://app/api/poll (fetch)').join(', '),
    );
  });

  test('EZD-2011 U7 an event stream is left out, as in Playwright, and stop() removes the listeners', async () => {
    const { page, emit, count } = fakePage();
    const watch = watchRequests(page);
    expect(count()).toBe(4);
    emit('request', request('http://app/api/stream', 'eventsource'));
    const out = outcomeOf(watch.quiet('page /a'));
    await vi.advanceTimersByTimeAsync(500);
    expect(out.get()).toBe('quiet');
    watch.stop();
    expect(count()).toBe(0);
  });

  // Seen in the sweep: the tab leaves a page whose routed fetch is still open; that request is never reported as
  // ended. Playwright stops counting the old document's requests when the new document starts, and so does this.
  test('EZD-2011 U8 requests of the document the tab left stop counting; the new page request is kept', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page, { timeoutMs: 3000 });
    emit('request', request('http://app/api/notifications', 'fetch'));
    emit('request', request('http://app/frame', 'document', 'GET', CHILD));
    const doc = request('http://app/dev/entry/client', 'document');
    emit('request', doc);
    // A child frame's navigation drops nothing.
    emit('framenavigated', CHILD);
    emit('framenavigated', MAIN);
    const out = outcomeOf(watch.quiet('page /dev/entry/client'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(out.get()).toBe('pending');
    emit('requestfinished', doc);
    await vi.advanceTimersByTimeAsync(499);
    expect(out.get()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(out.get()).toBe('quiet');
  });

  test('EZD-2011 U9 a move inside the same document drops nothing: the open fetch still fails the wait', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page, { timeoutMs: 3000 });
    emit('request', request('http://app/api/notifications', 'fetch'));
    emit('framenavigated', CHILD);
    // A history change: the main frame "navigated" with no page request.
    emit('framenavigated', MAIN);
    const out = outcomeOf(watch.quiet('page /'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(out.get()).toBe(
      'page / did not go quiet within 3000 ms; open requests: GET http://app/api/notifications (fetch) open for 3000 ms',
    );
  });

  test('EZD-2011 U10 a page request that failed starts no document, so a later history change drops nothing', async () => {
    const { page, emit } = fakePage();
    const watch = watchRequests(page, { timeoutMs: 3000 });
    emit('request', request('http://app/api/notifications', 'fetch'));
    const download = request('http://app/file.pdf', 'document');
    emit('request', download);
    emit('requestfailed', download);
    emit('framenavigated', MAIN);
    const out = outcomeOf(watch.quiet('page /'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(out.get()).toBe(
      'page / did not go quiet within 3000 ms; open requests: GET http://app/api/notifications (fetch) open for 3000 ms',
    );
  });
});
