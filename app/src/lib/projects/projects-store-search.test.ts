// EZD-117b U2, U3 (vault/plans/EZD-117b.md section 4; AC-EZD-117b-1, -5). Expected values: Decided "Store search"
// (setQuery debounces by SEARCH_DEBOUNCE_MS = 250 on a trimmed value; the same value stops; apply keeps the old
// counts and shows loading; clearSearch applies at once; clearFilters resets the tab and search; an empty search
// is never sent: no `search` key, no second fetchCounts argument; an older counts response is dropped), "`retry()`"
// (reloads only what failed). The timers are injected (`createProjectListStore(api, timers)`), the api is a fake.
import { describe, expect, it, vi } from 'vitest';
import type { ProjectCounts, ProjectPage, ProjectSummary } from './projects';
import { createProjectListStore, type ProjectListApi } from './projects-store';

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type PageCall = { q: Record<string, unknown>; d: Deferred<ProjectPage> };
type CountsCall = { search: string | undefined; argc: number; d: Deferred<ProjectCounts> };

function fakeApi() {
  const pages: PageCall[] = [];
  const counts: CountsCall[] = [];
  const api: ProjectListApi = {
    fetchPage: vi.fn((q) => {
      const d = deferred<ProjectPage>();
      pages.push({ q: q as Record<string, unknown>, d });
      return d.promise;
    }),
    fetchCounts: vi.fn((...args: unknown[]) => {
      const d = deferred<ProjectCounts>();
      counts.push({ search: args[1] as string | undefined, argc: args.length, d });
      return d.promise;
    }),
  };
  return { api, pages, counts };
}

// A manual clock: setTimeout schedules, advance(ms) runs what is due.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      setTimeout: (run: () => void, ms: number) => {
        const id = nextId++;
        pending.set(id, { at: now + ms, run });
        return id;
      },
      clearTimeout: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.run();
        }
      }
    },
    pending: () => pending.size,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const item = (id: string): ProjectSummary => ({
  id,
  name: id,
  clientName: null,
  address: `${id} Sort St`,
  status: 'draft',
  openItems: 0,
  hasThumbnail: false,
});
const COUNTS: ProjectCounts = {
  all: 6,
  draft: 2,
  client_review: 1,
  permit_submitted: 1,
  approved: 1,
  in_build: 1,
};
const OTHER: ProjectCounts = { ...COUNTS, all: 1, draft: 1 };

async function readyStore() {
  const f = fakeApi();
  const clock = fakeTimers();
  const store = createProjectListStore(f.api, clock.timers);
  store.start();
  f.pages[0].d.resolve({ items: [item('a')], next: null });
  f.counts[0].d.resolve(COUNTS);
  await flush();
  return { ...f, clock, store };
}

// Search `text` applied and answered.
async function searched(text: string) {
  const r = await readyStore();
  r.store.setQuery(text);
  r.clock.advance(250);
  r.pages[r.pages.length - 1].d.resolve({ items: [item('s')], next: null });
  r.counts[r.counts.length - 1].d.resolve(OTHER);
  await flush();
  return r;
}

describe('EZD-117b project list store search', () => {
  it(`EZD-117b done when: Search filters by client, address or project name, ignoring case, combines with the active status tab, and the tab counts follow the search (Q-0402). (U2)`, async () => {
    const { api, pages, counts, clock, store } = await readyStore();
    expect(store.get().search).toBe('');
    expect(api.fetchPage).toHaveBeenCalledTimes(1);

    store.setQuery('k');
    store.setQuery('ki');
    store.setQuery(' kit ');
    clock.advance(249);
    expect(api.fetchPage).toHaveBeenCalledTimes(1);
    expect(api.fetchCounts).toHaveBeenCalledTimes(1);
    clock.advance(1);
    expect(api.fetchPage).toHaveBeenCalledTimes(2);
    expect(pages[1].q).toEqual({ tab: 'all', sort: 'edited', after: null, search: 'kit' });
    expect(api.fetchCounts).toHaveBeenCalledTimes(2);
    expect(counts[1].argc).toBe(2);
    expect(counts[1].search).toBe('kit');
    expect(store.get()).toMatchObject({
      search: 'kit',
      status: 'loading',
      items: [],
      next: null,
      moreStatus: 'idle',
      countsStatus: 'loading',
      counts: COUNTS,
    });

    store.setQuery('kit  ');
    expect(clock.pending()).toBe(0);
    clock.advance(300);
    expect(api.fetchPage).toHaveBeenCalledTimes(2);

    store.setQuery('kits');
    store.setQuery('kit');
    expect(clock.pending()).toBe(0);
    clock.advance(300);
    expect(api.fetchPage).toHaveBeenCalledTimes(2);
    expect(api.fetchCounts).toHaveBeenCalledTimes(2);
  });

  it('U3 setTab keeps the search without new counts; clearSearch and clearFilters send no empty search', async () => {
    const a = await searched('kit');
    a.store.setTab('draft');
    expect(a.api.fetchPage).toHaveBeenCalledTimes(3);
    expect(a.pages[2].q).toEqual({ tab: 'draft', sort: 'edited', after: null, search: 'kit' });
    expect(a.api.fetchCounts).toHaveBeenCalledTimes(2);

    a.store.clearSearch();
    expect(a.api.fetchPage).toHaveBeenCalledTimes(4);
    expect(a.pages[3].q).toEqual({ tab: 'draft', sort: 'edited', after: null });
    expect('search' in a.pages[3].q).toBe(false);
    expect(a.api.fetchCounts).toHaveBeenCalledTimes(3);
    expect(a.counts[2].argc).toBe(1);
    expect(a.store.get().search).toBe('');

    const b = await readyStore();
    b.store.setTab('draft');
    b.store.setQuery('k');
    b.clock.advance(250);
    b.pages[b.pages.length - 1].d.resolve({ items: [item('s')], next: null });
    await flush();
    const pagesBefore = b.pages.length;
    const countsBefore = b.counts.length;
    b.store.clearFilters();
    expect(b.store.get()).toMatchObject({ tab: 'all', search: '', status: 'loading' });
    expect(b.pages.length).toBe(pagesBefore + 1);
    expect(b.pages[pagesBefore].q).toEqual({ tab: 'all', sort: 'edited', after: null });
    expect(b.counts.length).toBe(countsBefore + 1);
    expect(b.counts[countsBefore].argc).toBe(1);
    b.store.clearFilters();
    expect(b.pages.length).toBe(pagesBefore + 1);
    expect(b.counts.length).toBe(countsBefore + 1);

    // A tab alone (search empty): the page reloads, the counts do not.
    const c = await readyStore();
    c.store.setTab('draft');
    const countsC = c.counts.length;
    c.store.clearFilters();
    expect(c.store.get().tab).toBe('all');
    expect(c.counts.length).toBe(countsC);
  });

  it('U3 retry reloads only what failed, and an older counts response is dropped', async () => {
    const a = fakeApi();
    const clockA = fakeTimers();
    const sa = createProjectListStore(a.api, clockA.timers);
    sa.start();
    a.pages[0].d.reject(new Error('projects_load_failed'));
    a.counts[0].d.resolve(COUNTS);
    await flush();
    expect(sa.get().status).toBe('error');
    sa.retry();
    expect(sa.get().status).toBe('loading');
    expect(a.api.fetchPage).toHaveBeenCalledTimes(2);
    expect(a.api.fetchCounts).toHaveBeenCalledTimes(1);

    const b = fakeApi();
    const sb = createProjectListStore(b.api, fakeTimers().timers);
    sb.start();
    b.pages[0].d.resolve({ items: [item('a')], next: null });
    b.counts[0].d.reject(new Error('project_counts_load_failed'));
    await flush();
    expect(sb.get().countsStatus).toBe('error');
    sb.retry();
    expect(sb.get().countsStatus).toBe('loading');
    expect(b.api.fetchPage).toHaveBeenCalledTimes(1);
    expect(b.api.fetchCounts).toHaveBeenCalledTimes(2);

    const c = fakeApi();
    const clockC = fakeTimers();
    const sc = createProjectListStore(c.api, clockC.timers);
    sc.start();
    c.pages[0].d.resolve({ items: [item('a')], next: null });
    c.counts[0].d.resolve(COUNTS);
    await flush();
    sc.setQuery('a');
    clockC.advance(250);
    sc.setQuery('ab');
    clockC.advance(250);
    expect(c.counts).toHaveLength(3);
    c.counts[1].d.resolve({ ...COUNTS, all: 99 });
    await flush();
    expect(sc.get().counts).toEqual(COUNTS);
    expect(sc.get().countsStatus).toBe('loading');
    c.counts[2].d.resolve(OTHER);
    await flush();
    expect(sc.get().counts).toEqual(OTHER);
    expect(sc.get().countsStatus).toBe('ready');
  });
});
