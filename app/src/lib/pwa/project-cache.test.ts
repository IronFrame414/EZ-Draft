// EZD-1401 (11 Offline "the current project [is] cached by the service worker after first load"; AC-EZD-1401-1
// "a project opened earlier opens read-only from the cache"): the model load is stored in the worker's project
// cache when it loads online and answered read-only from that copy when the network fails. Stubbed caches and fetch.
import { describe, expect, it, vi } from 'vitest';
import { createProjectCache, pageStored } from './project-cache';
import { PROJECT_CACHE, projectIdOf } from './sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-00000000000a';
const MODEL_URL = `${ORIGIN}/api/projects/${P}/model`;

function stubStore() {
  const stores = new Map<string, Map<string, Response>>();
  const store = {
    open: async (name: string) => {
      const m = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, m);
      return {
        match: async (u: string) => m.get(u)?.clone(),
        put: async (u: string, r: Response) => void m.set(u, r),
      } as unknown as Cache;
    },
  };
  return { stores, store };
}

const load = () => ({
  project: { id: P, name: 'Kitchen remodel', clientName: null, planScale: '1/4' },
  viewer: { appUserId: 'u', tenantId: 't', membershipId: 'm', canEdit: true },
  lockEpoch: 3,
  objects: [{ id: 'w1', type: 'wall', schemaVersion: 1, data: {}, updatedSeq: 7 }],
  invalid: [],
  numberHighs: {},
});

const basic = (body: unknown, status = 200) => {
  const r = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-1401 project cache', () => {
  it('online, the model answer is passed through and stored in the project cache under its address', async () => {
    const { stores, store } = stubStore();
    const cache = createProjectCache({ store, origin: ORIGIN });
    const seen: string[] = [];
    cache.subscribe(() => seen.push(cache.get()));
    expect(cache.get()).toBe('none');
    const f = cache.wrap(async () => basic(load()));
    const res = await f(`/api/projects/${P}/model`);
    expect((await res.json()).viewer.canEdit).toBe(true);
    await flush();
    expect(seen).toEqual(['storing', 'stored']);
    const kept = stores.get(PROJECT_CACHE)?.get(MODEL_URL);
    expect(kept).toBeDefined();
    expect((await kept!.clone().json()).objects).toHaveLength(1);
    // The worker's budget trim counts it under the project (sw-rules.mjs pruneProjects).
    expect(projectIdOf(MODEL_URL)).toBe(P);
  });

  it('with no network, a project loaded earlier opens from the copy, read-only', async () => {
    const { store } = stubStore();
    const online = createProjectCache({ store, origin: ORIGIN });
    await online.wrap(async () => basic(load()))(`/api/projects/${P}/model`);
    await flush();

    const offline = createProjectCache({ store, origin: ORIGIN });
    const res = await offline.wrap(async () => {
      throw new TypeError('Failed to fetch');
    })(`/api/projects/${P}/model`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = load();
    expected.viewer.canEdit = false;
    expect(body).toEqual(expected);
    expect(offline.get()).toBe('stored');
  });

  it('with no network and no copy, the load fails as before', async () => {
    const { store } = stubStore();
    const cache = createProjectCache({ store, origin: ORIGIN });
    const error = new TypeError('Failed to fetch');
    await expect(
      cache.wrap(async () => {
        throw error;
      })(`/api/projects/${P}/model`),
    ).rejects.toBe(error);
    expect(cache.get()).toBe('none');
  });

  it('stores only a whole answer: never a refusal, an error or a non-basic answer', async () => {
    for (const make of [
      () => basic({ error: { code: 'forbidden' } }, 403),
      () => basic({ error: { code: 'server' } }, 500),
      () => new Response('{}', { status: 200 }),
    ]) {
      const { stores, store } = stubStore();
      const cache = createProjectCache({ store, origin: ORIGIN });
      await cache.wrap(async () => make())(`/api/projects/${P}/model`);
      await flush();
      expect(stores.get(PROJECT_CACHE)?.size ?? 0).toBe(0);
      expect(cache.get()).toBe('none');
    }
  });

  it('every other request goes to the network untouched and is never stored or answered from the copy', async () => {
    const { stores, store } = stubStore();
    const cache = createProjectCache({ store, origin: ORIGIN });
    const base = vi.fn(async () => basic({ ok: true }));
    const f = cache.wrap(base);
    await f(`/api/projects/${P}/lock`, { method: 'POST' });
    await f(`/api/projects/${P}/model`, { method: 'POST' });
    await f(`/api/projects/${P}/objects`);
    await f(`https://other.example.com/api/projects/${P}/model`);
    await flush();
    expect(base).toHaveBeenCalledTimes(4);
    expect(stores.get(PROJECT_CACHE)?.size ?? 0).toBe(0);
    const failing = cache.wrap(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(failing(`/api/projects/${P}/lock`)).rejects.toThrow('Failed to fetch');
  });

  it('a failed store (full device) leaves the load answered and the state failed', async () => {
    const store = {
      open: async () =>
        ({
          put: async () => {
            throw new DOMException('full', 'QuotaExceededError');
          },
          match: async () => undefined,
        }) as unknown as Cache,
    };
    const cache = createProjectCache({ store, origin: ORIGIN });
    const res = await cache.wrap(async () => basic(load()))(`/api/projects/${P}/model`);
    expect(res.status).toBe(200);
    await flush();
    expect(cache.get()).toBe('failed');
  });

  it('pageStored finds the page copy the worker keeps under its address with no hash', async () => {
    const { stores, store } = stubStore();
    expect(await pageStored(`${ORIGIN}/projects/${P}`, store)).toBe(false);
    stores.get(PROJECT_CACHE)!.set(`${ORIGIN}/projects/${P}`, new Response('<html>'));
    expect(await pageStored(`${ORIGIN}/projects/${P}#plan`, store)).toBe(true);
    expect(await pageStored(`${ORIGIN}/projects/${P}`, undefined)).toBe(false);
  });
});
