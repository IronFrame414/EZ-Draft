// EZD-2002 (audit 2026-11-27 A1; AC-EZD-2002-1 "When a field pack or field measure page request has not answered
// within 4 seconds, or answers with a 5xx, the stored copy is shown and the page refreshes behind it when the answer
// arrives"; AC-EZD-2002-3): the worker's online route for the two field pages (sw-rules.mjs onlineFieldPage,
// answerFieldPage), run against stubbed caches, fetch and location with fake timers. The 4 seconds are the AC's.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIELD_WAIT_MS,
  answerFieldPage,
  isFieldPagePath,
  onlineFieldPage,
} from './sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-00000000000a';
const FIELD = `${ORIGIN}/projects/${P}/field`;
const MEASURE = `${ORIGIN}/projects/${P}/field-measure`;

function stubCaches() {
  const m = new Map<string, Response>();
  const open = async () => ({
    match: async (u: string) => m.get(u)?.clone(),
    put: async (u: string, r: Response) => void m.set(u, r),
  });
  vi.stubGlobal('caches', { open });
  return m;
}

const basic = (text: string, status = 200) => {
  const r = new Response(text, { status });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};

// A fetch the test answers when it chooses.
function pendingFetch() {
  let answer!: (r: Response) => void;
  let fail!: (e: unknown) => void;
  const p = new Promise<Response>((resolve, reject) => {
    answer = resolve;
    fail = reject;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => p),
  );
  return { answer, fail };
}

function event() {
  const waits: Promise<unknown>[] = [];
  return { waits, waitUntil: (p: Promise<unknown>) => void waits.push(p) };
}

const call = (href: string, ev = event()) =>
  answerFieldPage({ event: ev, request: new Request(href), url: new URL(href) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('location', { origin: ORIGIN });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EZD-2002 field pages online', () => {
  it('the wait is 4 seconds', () => {
    expect(FIELD_WAIT_MS).toBe(4000);
  });

  it('the route takes only the two field page loads, same origin, while the phone says online', () => {
    expect(isFieldPagePath(`/projects/${P}/field`)).toBe(true);
    expect(isFieldPagePath(`/projects/${P}/field-measure`)).toBe(true);
    for (const p of [
      `/projects/${P}`,
      `/projects/${P}/plan`,
      `/api/projects/${P}/field-pack`,
      '/projects',
    ]) {
      expect(isFieldPagePath(p), p).toBe(false);
    }
    const nav = (href: string, mode = 'navigate') => ({ request: { mode }, url: new URL(href) });
    vi.stubGlobal('self', { navigator: { onLine: true } });
    expect(onlineFieldPage(nav(FIELD))).toBe(true);
    expect(onlineFieldPage(nav(MEASURE))).toBe(true);
    expect(onlineFieldPage(nav(`${ORIGIN}/projects/${P}`))).toBe(false);
    expect(onlineFieldPage(nav(FIELD, 'cors'))).toBe(false);
    expect(onlineFieldPage(nav(`https://evil.example.com/projects/${P}/field`))).toBe(false);
    // Offline the CacheOnly project route answers instead.
    vi.stubGlobal('self', { navigator: { onLine: false } });
    expect(onlineFieldPage(nav(FIELD))).toBe(false);
  });

  it('a slow request: after 4 s the stored copy answers, and the late answer replaces it', async () => {
    const held = stubCaches();
    held.set(MEASURE, basic('stored page'));
    const net = pendingFetch();
    const ev = event();
    let answered: Response | undefined;
    void call(MEASURE, ev).then((r) => (answered = r));
    await vi.advanceTimersByTimeAsync(3999);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await answered?.text()).toBe('stored page');
    // The answer lands later and is stored behind the page.
    net.answer(basic('fresh page'));
    await Promise.all(ev.waits);
    expect(await held.get(MEASURE)?.clone().text()).toBe('fresh page');
  });

  it('a 5xx: the stored copy answers at once and stays stored', async () => {
    const held = stubCaches();
    held.set(FIELD, basic('stored page'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => basic('error', 503)),
    );
    const ev = event();
    const res = await call(FIELD, ev);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('stored page');
    await Promise.all(ev.waits);
    expect(await held.get(FIELD)?.clone().text()).toBe('stored page');
  });

  it('a failed request answers the stored copy', async () => {
    const held = stubCaches();
    held.set(FIELD, basic('stored page'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await (await call(FIELD)).text()).toBe('stored page');
  });

  it('a quick whole answer is the page and is stored', async () => {
    const held = stubCaches();
    held.set(FIELD, basic('stored page'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => basic('fresh page')),
    );
    const ev = event();
    expect(await (await call(FIELD, ev)).text()).toBe('fresh page');
    await Promise.all(ev.waits);
    expect(await held.get(FIELD)?.clone().text()).toBe('fresh page');
  });

  it('with no stored copy: a slow page is waited for, a 5xx or a failure is passed on', async () => {
    stubCaches();
    const net = pendingFetch();
    let answered: Response | undefined;
    void call(FIELD).then((r) => (answered = r));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answered).toBeUndefined();
    net.answer(basic('late page'));
    await vi.advanceTimersByTimeAsync(0);
    expect(await answered?.text()).toBe('late page');

    // A fresh device again (the late page above was stored).
    stubCaches();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => basic('error', 500)),
    );
    expect((await call(FIELD)).status).toBe(500);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(call(FIELD)).rejects.toThrow('Failed to fetch');
  });
});
