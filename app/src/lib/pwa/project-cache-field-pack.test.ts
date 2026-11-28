// EZD-2002 (audit 2026-11-27 A1; AC-EZD-2002-1 "When a field pack ... request has not answered within 4 seconds, or
// answers with a 5xx, the stored copy is shown and the page refreshes behind it when the answer arrives";
// AC-EZD-2002-3): the field pack read through the project cache, with stubbed caches and fetch and fake timers. The
// editor's model read keeps its EZD-1401 rule (the stored copy only when the request fails).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectCache } from './project-cache';
import { PROJECT_CACHE } from './sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-00000000000a';
const PACK = `/api/projects/${P}/field-pack`;
const PACK_URL = `${ORIGIN}${PACK}`;
const MODEL = `/api/projects/${P}/model`;

function stubStore() {
  const m = new Map<string, Response>();
  const store = {
    open: async (name: string) => {
      expect(name).toBe(PROJECT_CACHE);
      return {
        match: async (u: string) => m.get(u)?.clone(),
        put: async (u: string, r: Response) => void m.set(u, r),
      } as unknown as Cache;
    },
  };
  return { m, store };
}

const basic = (body: unknown, status = 200) => {
  const r = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};

const pack = (version: number) => ({ project: { id: P }, pack: { versionNo: version } });

function pending() {
  let answer!: (r: Response) => void;
  const p = new Promise<Response>((resolve) => (answer = resolve));
  return { answer, base: (() => p) as typeof fetch };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('EZD-2002 field pack read on a slow connection', () => {
  it('a slow request: the stored pack answers after 4 s, then the late pack is stored and shown', async () => {
    const { m, store } = stubStore();
    m.set(PACK_URL, basic(pack(1)));
    const cache = createProjectCache({ store, origin: ORIGIN });
    const fresh: Array<[string, unknown]> = [];
    cache.fresh((href, body) => fresh.push([href, body]));
    const net = pending();
    let answered: Response | undefined;
    void cache
      .wrap(net.base)(PACK)
      .then((r) => (answered = r));
    await vi.advanceTimersByTimeAsync(3999);
    expect(answered).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await answered?.json()).toEqual(pack(1));
    expect(cache.get()).toBe('stored');
    expect(fresh).toEqual([]);

    net.answer(basic(pack(2)));
    await vi.advanceTimersByTimeAsync(0);
    expect(fresh).toEqual([[PACK_URL, pack(2)]]);
    expect(await m.get(PACK_URL)?.clone().json()).toEqual(pack(2));
  });

  it('a 5xx: the stored pack answers, not the error', async () => {
    const { m, store } = stubStore();
    m.set(PACK_URL, basic(pack(1)));
    const cache = createProjectCache({ store, origin: ORIGIN });
    const res = await cache.wrap(async () => basic({ error: { code: 'db_unavailable' } }, 503))(
      PACK,
    );
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual(pack(1));
    // The stored pack is kept.
    expect(await m.get(PACK_URL)?.clone().json()).toEqual(pack(1));
  });

  it('a quick answer is used and stored', async () => {
    const { m, store } = stubStore();
    m.set(PACK_URL, basic(pack(1)));
    const cache = createProjectCache({ store, origin: ORIGIN });
    const res = await cache.wrap(async () => basic(pack(2)))(PACK);
    expect(await res.json()).toEqual(pack(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(await m.get(PACK_URL)?.clone().json()).toEqual(pack(2));
  });

  it('with no stored pack: a slow read is waited for and a 5xx is passed on', async () => {
    const { m, store } = stubStore();
    const cache = createProjectCache({ store, origin: ORIGIN });
    const net = pending();
    let answered: Response | undefined;
    void cache
      .wrap(net.base)(PACK)
      .then((r) => (answered = r));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answered).toBeUndefined();
    net.answer(basic(pack(3)));
    await vi.advanceTimersByTimeAsync(0);
    expect(await answered?.json()).toEqual(pack(3));
    expect(await m.get(PACK_URL)?.clone().json()).toEqual(pack(3));

    const fresh = createProjectCache({ store: stubStore().store, origin: ORIGIN });
    expect((await fresh.wrap(async () => basic({}, 500))(PACK)).status).toBe(500);
  });

  it("the editor's model read is not answered from the copy for being slow or a 5xx", async () => {
    const { m, store } = stubStore();
    m.set(`${ORIGIN}${MODEL}`, basic({ viewer: { canEdit: true } }));
    const cache = createProjectCache({ store, origin: ORIGIN });
    expect((await cache.wrap(async () => basic({}, 503))(MODEL)).status).toBe(503);
    const net = pending();
    let answered: Response | undefined;
    void cache
      .wrap(net.base)(MODEL)
      .then((r) => (answered = r));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(answered).toBeUndefined();
    net.answer(basic({ viewer: { canEdit: true } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(answered?.status).toBe(200);
  });
});
