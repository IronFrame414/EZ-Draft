// EZD-134 (03b Architecture rule 10 "Cached projects other than the open one are dropped oldest-first within a
// size budget in Defaults"; phase-01.md "never the outbox"; 11 Offline "cached by the service worker after first
// load"): the worker's cache work (sw-rules.mjs), run here against stubbed caches, fetch and location. Worked
// examples in megabytes; the default budget is the EZD-134 assumption (500 MB, smallest 100 MB).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BUILD_HEADER,
  BYTES_PER_MB,
  PROJECT_CACHE,
  SHELL_CACHE,
  STATIC_CACHE,
  STATIC_MAX_ENTRIES,
  WARM_MESSAGE,
  onWarmMessage,
  planEviction,
  projectIdOf,
  pruneProjects,
  readBudgetMb,
  warmFiles,
  warmPageCopy,
} from './sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const BUILD = 1763600000;
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const MB = BYTES_PER_MB;

type Store = Map<string, Map<string, Response>>;
function stubCaches(stores: Store) {
  const open = async (name: string) => {
    const m = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, m);
    const key = (r: Request | string) => (typeof r === 'string' ? r : r.url);
    return {
      match: async (r: Request | string) => m.get(key(r))?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(key(r), res),
      keys: async () => [...m.keys()].map((u) => new Request(u)),
      delete: async (r: Request | string) => m.delete(key(r)),
    };
  };
  vi.stubGlobal('caches', { open, has: async (n: string) => stores.has(n) });
}

// A constructed Response has type 'default'; the browser's same-origin answer is 'basic'.
const basic = (r: Response, redirected = false) => {
  Object.defineProperty(r, 'type', { value: 'basic' });
  if (redirected) Object.defineProperty(r, 'redirected', { value: true });
  return r;
};
const page = (build = BUILD) => basic(new Response('<html>', { headers: { [BUILD_HEADER]: String(build) } }));

let fetchSpy: ReturnType<typeof vi.fn>;
const stubFetch = (impl: (u: string) => Promise<Response>) => {
  fetchSpy = vi.fn((u: string) => impl(u));
  vi.stubGlobal('fetch', fetchSpy);
};

beforeEach(() => vi.stubGlobal('location', { origin: ORIGIN }));
afterEach(() => vi.unstubAllGlobals());

describe('EZD-134 planEviction', () => {
  const p = (projectId: string, mb: number, cachedAt: number) => ({ projectId, bytes: mb * MB, cachedAt });

  it('drops nothing when the cache fits the budget', () => {
    expect(planEviction([p(A, 100, 1), p(B, 100, 2)], 500 * MB, null)).toEqual([]);
  });

  it('drops oldest first until the rest fit (A 300, B 200, C 100 MB)', () => {
    // 600 in 350: drop A (oldest) -> 300, fits.
    expect(planEviction([p(B, 200, 2), p(A, 300, 1), p(C, 100, 3)], 350 * MB, null)).toEqual([A]);
    // 600 in 250: drop A -> 300, then B -> 100.
    expect(planEviction([p(B, 200, 2), p(A, 300, 1), p(C, 100, 3)], 250 * MB, null)).toEqual([A, B]);
  });

  it('never drops the open project, even when it alone is over the budget', () => {
    expect(planEviction([p(A, 300, 1), p(B, 200, 2)], 250 * MB, A)).toEqual([B]);
    expect(planEviction([p(A, 900, 1)], 100 * MB, A)).toEqual([]);
  });

  it('project ids: a project page or its API reads; collection routes are no project', () => {
    expect(projectIdOf(`${ORIGIN}/projects/${A}`)).toBe(A);
    expect(projectIdOf(`${ORIGIN}/projects/${A}/plan?v=1`)).toBe(A);
    expect(projectIdOf(`${ORIGIN}/api/projects/${B}/objects`)).toBe(B);
    expect(projectIdOf(`${ORIGIN}/api/projects/counts`)).toBeNull();
    expect(projectIdOf(`${ORIGIN}/settings`)).toBeNull();
  });
});

describe('EZD-134 pruneProjects', () => {
  const entries = (): Store =>
    new Map([
      [
        PROJECT_CACHE,
        new Map([
          [`${ORIGIN}/projects/${A}`, new Response(new Uint8Array(2 * MB), { headers: { date: 'Mon, 16 Nov 2026 10:00:00 GMT' } })],
          [`${ORIGIN}/api/projects/${A}/model`, new Response(new Uint8Array(1 * MB), { headers: { date: 'Mon, 16 Nov 2026 10:00:01 GMT' } })],
          [`${ORIGIN}/projects/${B}`, new Response(new Uint8Array(2 * MB), { headers: { date: 'Tue, 17 Nov 2026 10:00:00 GMT' } })],
          [`${ORIGIN}/projects/${C}`, new Response(new Uint8Array(2 * MB), { headers: { date: 'Wed, 18 Nov 2026 10:00:00 GMT' } })],
        ]),
      ],
      [SHELL_CACHE, new Map([[`${ORIGIN}/`, page()]])],
    ]);

  it('under the smallest budget (100 MB) it asks for no budget and drops nothing', async () => {
    const stores = entries();
    stubCaches(stores);
    stubFetch(async () => new Response('{}'));
    expect(await pruneProjects(null)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stores.get(PROJECT_CACHE)?.size).toBe(4);
  });

  it('over the budget: drops every answer of the oldest projects, keeps the open one and other caches', async () => {
    const stores = entries();
    stubCaches(stores);
    // Past the 100 MB floor: A 3 MB (open), B 60 MB, C 60 MB.
    stores.get(PROJECT_CACHE)!.set(`${ORIGIN}/projects/${B}`, new Response(new Uint8Array(60 * MB), { headers: { date: 'Tue, 17 Nov 2026 10:00:00 GMT' } }));
    stores.get(PROJECT_CACHE)!.set(`${ORIGIN}/projects/${C}`, new Response(new Uint8Array(60 * MB), { headers: { date: 'Wed, 18 Nov 2026 10:00:00 GMT' } }));
    // 123 MB > 100 MB floor; company budget 100 MB: drop B (oldest not open) -> 63 MB, fits.
    stubFetch(async () => new Response(JSON.stringify({ effective: { device_cache_budget: 100 } }), { status: 200 }));
    expect(await pruneProjects(A)).toEqual([B]);
    expect([...stores.get(PROJECT_CACHE)!.keys()].sort()).toEqual(
      [`${ORIGIN}/api/projects/${A}/model`, `${ORIGIN}/projects/${A}`, `${ORIGIN}/projects/${C}`].sort(),
    );
    expect(stores.get(SHELL_CACHE)?.size).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith('/api/settings/defaults', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('no project cache: nothing to do', async () => {
    stubCaches(new Map());
    expect(await pruneProjects(null)).toEqual([]);
  });

  it('the budget falls back to 500 MB when it cannot be read', async () => {
    stubFetch(async () => new Response('', { status: 403 }));
    expect(await readBudgetMb()).toBe(500);
    stubFetch(async () => {
      throw new TypeError('offline');
    });
    expect(await readBudgetMb()).toBe(500);
    stubFetch(async () => new Response(JSON.stringify({ effective: { device_cache_budget: 2000 } })));
    expect(await readBudgetMb()).toBe(2000);
  });
});

describe('EZD-134 warmPageCopy and warmFiles', () => {
  it('stores a missing shell or project page without its hash; never a dev page, an error or a redirect', async () => {
    const stores: Store = new Map();
    stubCaches(stores);
    stubFetch(async () => page());
    expect(await warmPageCopy(`${ORIGIN}/settings#x`, BUILD)).toBe(true);
    expect(await warmPageCopy(`${ORIGIN}/projects/${A}`, BUILD)).toBe(true);
    expect(await warmPageCopy(`${ORIGIN}/dev/shell`, BUILD)).toBe(false);
    expect(await warmPageCopy('https://evil.example.com/', BUILD)).toBe(false);
    expect([...stores.get(SHELL_CACHE)!.keys()]).toEqual([`${ORIGIN}/settings`]);
    expect([...stores.get(PROJECT_CACHE)!.keys()]).toEqual([`${ORIGIN}/projects/${A}`]);
    stubFetch(async () => basic(new Response('', { status: 500 })));
    expect(await warmPageCopy(`${ORIGIN}/`, BUILD)).toBe(false);
    stubFetch(async () => basic(new Response('x'), true));
    expect(await warmPageCopy(`${ORIGIN}/`, BUILD)).toBe(false);
    expect(stores.get(SHELL_CACHE)!.has(`${ORIGIN}/`)).toBe(false);
  });

  it('a copy from this build is kept; one from another build is fetched again', async () => {
    const stores: Store = new Map([[SHELL_CACHE, new Map([[`${ORIGIN}/`, page(BUILD)]])]]);
    stubCaches(stores);
    stubFetch(async () => page());
    expect(await warmPageCopy(`${ORIGIN}/`, BUILD)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    stores.get(SHELL_CACHE)!.set(`${ORIGIN}/`, page(BUILD - 1));
    expect(await warmPageCopy(`${ORIGIN}/`, BUILD)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('stores each same-origin static file once; skips stored ones, other files and origins', async () => {
    const stores: Store = new Map([[STATIC_CACHE, new Map([[`${ORIGIN}/_next/static/chunks/old.js`, page()]])]]);
    stubCaches(stores);
    stubFetch(async () => page());
    const n = await warmFiles([
      `${ORIGIN}/_next/static/chunks/a.js`,
      `${ORIGIN}/_next/static/chunks/a.js`,
      `${ORIGIN}/_next/static/chunks/old.js`,
      `${ORIGIN}/app-icons/icon-192.png`,
      `${ORIGIN}/api/projects/counts`,
      'https://cdn.example.com/_next/static/chunks/b.js',
      42,
    ]);
    expect(n).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(stores.get(STATIC_CACHE)!.size).toBe(3);
  });

  it(`keeps the newest ${STATIC_MAX_ENTRIES} static files`, async () => {
    const rows = new Map<string, Response>();
    for (let i = 0; i < STATIC_MAX_ENTRIES; i++) rows.set(`${ORIGIN}/_next/static/chunks/f${i}.js`, page());
    const stores: Store = new Map([[STATIC_CACHE, rows]]);
    stubCaches(stores);
    stubFetch(async () => page());
    expect(await warmFiles([`${ORIGIN}/_next/static/chunks/new.js`])).toBe(1);
    const keys = [...stores.get(STATIC_CACHE)!.keys()];
    expect(keys).toHaveLength(STATIC_MAX_ENTRIES);
    expect(keys).not.toContain(`${ORIGIN}/_next/static/chunks/f0.js`);
    expect(keys).toContain(`${ORIGIN}/_next/static/chunks/new.js`);
  });

  it('onWarmMessage ignores other messages and never rejects', async () => {
    const stores: Store = new Map();
    stubCaches(stores);
    stubFetch(async () => {
      throw new TypeError('offline');
    });
    await expect(onWarmMessage({ type: 'other', page: `${ORIGIN}/` })).resolves.toBeUndefined();
    await expect(onWarmMessage(null)).resolves.toBeUndefined();
    await expect(
      onWarmMessage({ type: WARM_MESSAGE, build: BUILD, page: `${ORIGIN}/`, files: [`${ORIGIN}/_next/static/a.js`], openProject: null }),
    ).resolves.toBeUndefined();
    expect(stores.get(SHELL_CACHE)?.size ?? 0).toBe(0);
  });

  it('onWarmMessage stores the page and files it names', async () => {
    const stores: Store = new Map();
    stubCaches(stores);
    stubFetch(async () => page());
    await onWarmMessage({
      type: WARM_MESSAGE,
      build: BUILD,
      page: `${ORIGIN}/`,
      files: [`${ORIGIN}/_next/static/a.js`],
      openProject: null,
    });
    expect([...stores.get(SHELL_CACHE)!.keys()]).toEqual([`${ORIGIN}/`]);
    expect([...stores.get(STATIC_CACHE)!.keys()]).toEqual([`${ORIGIN}/_next/static/a.js`]);
  });
});
