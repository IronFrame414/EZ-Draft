// EZD-1404 (S17 States "First load: downloads and caches the pack"; "Offline: fully usable after first load";
// AC-EZD-1404-2 "With the network off the seeded pack opens"): the field pack answer is stored in the worker's project
// cache like the editor's model answer (lib/pwa/project-cache.ts) and answered from that copy with no network; the
// worker's budget trim counts it under its project. Stubbed caches and fetch.
import { describe, expect, it } from 'vitest';
import { createProjectCache } from '../lib/pwa/project-cache';
import { PROJECT_CACHE, projectIdOf } from '../lib/pwa/sw-rules.mjs';

const ORIGIN = 'https://ezdraft.example.com';
const P = '00000000-0000-4000-8000-00000000000b';
const URL_ = `${ORIGIN}/api/projects/${P}/field-pack`;

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

const PACK = {
  projectName: 'Kitchen remodel',
  clientName: 'Hendricks',
  pack: {
    issueId: 'i1',
    revision: { kind: 'version', no: 1 },
    issuedAt: '2026-10-08T12:00:00.000Z',
    note: null,
    rooms: [{ id: 'r1', name: 'Kitchen' }],
    openTasks: 0,
  },
};

const basic = (body: unknown) => {
  const r = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('EZD-1404 field pack copy on the phone', () => {
  it('online the pack is stored under its address; offline it opens from that copy unchanged', async () => {
    const { stores, store } = stubStore();
    const online = createProjectCache({ store, origin: ORIGIN });
    const seen: string[] = [];
    online.subscribe(() => seen.push(online.get()));
    await online.wrap(async () => basic(PACK))(`/api/projects/${P}/field-pack`);
    await flush();
    expect(seen).toEqual(['storing', 'stored']);
    expect(stores.get(PROJECT_CACHE)?.has(URL_)).toBe(true);
    expect(projectIdOf(URL_)).toBe(P);

    const offline = createProjectCache({ store, origin: ORIGIN });
    const res = await offline.wrap(async () => {
      throw new TypeError('Failed to fetch');
    })(`/api/projects/${P}/field-pack`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PACK);
    expect(offline.get()).toBe('stored');
  });

  it('offline with no copy the load fails, so the screen shows its error with Retry', async () => {
    const { store } = stubStore();
    const cache = createProjectCache({ store, origin: ORIGIN });
    await expect(
      cache.wrap(async () => {
        throw new TypeError('Failed to fetch');
      })(`/api/projects/${P}/field-pack`),
    ).rejects.toThrow('Failed to fetch');
  });
});
