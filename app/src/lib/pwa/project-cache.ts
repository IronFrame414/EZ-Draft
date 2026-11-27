// EZD-1401 (phase-14.md EZD-1401 row; 11 Offline "the current project [is] cached by the service worker after first
// load"; AC-EZD-1401-1): the open project's data on this device. Each time the editor loads a project online, the
// model answer is stored in the worker's project cache (PROJECT_CACHE, beside the project page the worker stores),
// so the worker's budget trim (sw-rules.mjs pruneProjects, which reads /api/projects/<id> keys) and sign-out
// (clear-caches.ts) cover it. With no network the load is answered from that copy, read-only: the copy says the
// viewer cannot edit, so the editor asks for no lock, starts no autosave and shows no drawing tools.
// The page stores it rather than a worker route: Chromium sends /api/* straight to the network (sw-rules.mjs
// NETWORK_ONLY_PATHS), and storing the answer the page already has costs no second download.
// Sheet images and render copies are not built yet; when they are, their same-origin reads under
// /api/projects/<id>/ are stored the same way (vault/build/assumptions.md EZD-1401).
// EZD-2002 (audit 2026-11-27 A1; AC-EZD-2002-1): the field pack read waits FIELD_WAIT_MS for the network. When it
// has not answered by then, answers with a server error (5xx) or fails, the stored pack answers (when there is one);
// a whole answer that lands after the stored pack answered is stored and handed to the `fresh` listeners, so the
// screen shows it in place. The editor's model read is unchanged.
import { FIELD_WAIT_MS, PROJECT_CACHE } from './sw-constants.mjs';
import { isStorable } from './sw-rules.mjs';

// What this page knows of the open project's stored copy: none yet, being stored, stored (or opened from it), or
// the store failed (a full device or no Cache API).
export type ModelCopy = 'none' | 'storing' | 'stored' | 'failed';

export type ProjectCache = {
  // A fetch that stores and falls back as above; every other request goes to `base` unchanged.
  wrap(base: typeof fetch): typeof fetch;
  get(): ModelCopy;
  subscribe(cb: () => void): () => void;
  // EZD-2002: a field pack answer that landed after the stored pack answered, with its address.
  fresh(cb: (href: string, body: unknown) => void): () => void;
};

type Store = Pick<CacheStorage, 'open'>;

// EZD-1404: the phone's field pack answer (/api/projects/<id>/field-pack) is stored and answered the same way.
const MODEL = /^\/api\/projects\/([^/]+)\/(?:model|field-pack)$/;
const FIELD_PACK = /^\/api\/projects\/[^/]+\/field-pack$/;

// The stored answer, made read-only.
async function readOnly(stored: Response): Promise<Response> {
  const body = (await stored.json()) as { viewer?: { canEdit?: boolean } } | null;
  if (body && body.viewer) body.viewer.canEdit = false;
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

export function createProjectCache(
  opts: { store?: Store | undefined; origin?: string } = {},
): ProjectCache {
  const store: Store | undefined =
    'store' in opts ? opts.store : typeof caches === 'undefined' ? undefined : caches;
  const origin = opts.origin ?? globalThis.location?.origin ?? 'http://localhost';
  let copy: ModelCopy = 'none';
  const listeners = new Set<() => void>();
  const freshListeners = new Set<(href: string, body: unknown) => void>();
  const set = (next: ModelCopy) => {
    if (next === copy) return;
    copy = next;
    for (const cb of [...listeners]) cb();
  };

  const keep = async (key: string, response: Response) => {
    set('storing');
    try {
      const cache = await store!.open(PROJECT_CACHE);
      await cache.put(key, response);
      set('stored');
    } catch {
      set('failed');
    }
  };

  return {
    get: () => copy,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    fresh(cb) {
      freshListeners.add(cb);
      return () => freshListeners.delete(cb);
    },
    wrap(base) {
      // The editor names its reads by address (model-api.ts fetchModel); any other form goes to `base` unchanged.
      return async (input, init) => {
        const url = typeof input === 'string' ? new URL(input, origin) : null;
        if (
          !url ||
          (init?.method ?? 'GET') !== 'GET' ||
          url.origin !== origin ||
          !MODEL.test(url.pathname) ||
          !store
        ) {
          return base(input, init);
        }
        const held = store;
        const readStored = () =>
          held
            .open(PROJECT_CACHE)
            .then((c) => c.match(url.href, { ignoreVary: true }))
            .catch(() => undefined);
        const fromStored = async (stored: Response) => {
          const answer = await readOnly(stored);
          set('stored');
          return answer;
        };
        if (!FIELD_PACK.test(url.pathname)) {
          let response: Response;
          try {
            response = await base(input, init);
          } catch (error) {
            const stored = await readStored();
            if (!stored) throw error;
            return fromStored(stored);
          }
          if (isStorable(response)) void keep(url.href, response.clone());
          return response;
        }
        // EZD-2002: the field pack.
        const attempt = Promise.resolve().then(() => base(input, init));
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<{ late: true }>((resolve) => {
          timer = setTimeout(() => resolve({ late: true }), FIELD_WAIT_MS);
        });
        const first = await Promise.race([
          attempt.then(
            (response) => ({ response }),
            (error: unknown) => ({ error }),
          ),
          late,
        ]);
        clearTimeout(timer);
        if ('late' in first) {
          const stored = await readStored();
          if (!stored) {
            const response = await attempt;
            if (isStorable(response)) void keep(url.href, response.clone());
            return response;
          }
          void attempt
            .then(async (response) => {
              if (!isStorable(response)) return;
              await keep(url.href, response.clone());
              const body: unknown = await response.json();
              for (const cb of [...freshListeners]) cb(url.href, body);
            })
            .catch(() => {});
          return fromStored(stored);
        }
        if ('error' in first) {
          const stored = await readStored();
          if (!stored) throw first.error;
          return fromStored(stored);
        }
        const response = first.response;
        if (response.status >= 500) {
          const stored = await readStored();
          return stored ? fromStored(stored) : response;
        }
        if (isStorable(response)) void keep(url.href, response.clone());
        return response;
      };
    },
  };
}

// The page's own copy in the worker's project cache (warmPageCopy stores it under its address with no hash).
export async function pageStored(
  href: string,
  store: Store | undefined = typeof caches === 'undefined' ? undefined : caches,
): Promise<boolean> {
  if (!store) return false;
  try {
    const url = new URL(href);
    url.hash = '';
    return (
      (await (await store.open(PROJECT_CACHE)).match(url.href, { ignoreVary: true })) !== undefined
    );
  } catch {
    return false;
  }
}
