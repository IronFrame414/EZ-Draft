// EZD-117a U3-U6 (vault/plans/EZD-117a.md section 4; AC-EZD-117a-1, -2, -3, -6). Expected values: Decided
// "Data requests" (load = one page request and one counts request; scrolling = `after` only; a tab or sort change =
// one page request, counts unchanged), "projectsUrl", "Store" (initial state, start once, same value no-op, abort
// on change, a late or older response dropped, more appends ids not yet listed, failures per kind, AbortError
// changes nothing, one notification per change). The api is a fake with hand-resolved promises.
import { describe, expect, it, vi } from 'vitest';
import { projectsUrl, type ProjectCounts, type ProjectPage, type ProjectSummary } from './projects';
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

type PageCall = {
  q: { tab: string; sort: string; after: string | null };
  signal: AbortSignal;
  d: Deferred<ProjectPage>;
};

function fakeApi() {
  const pages: PageCall[] = [];
  const counts: { signal: AbortSignal; d: Deferred<ProjectCounts> }[] = [];
  const api: ProjectListApi = {
    fetchPage: vi.fn((q, signal) => {
      const d = deferred<ProjectPage>();
      pages.push({ q, signal, d });
      return d.promise;
    }),
    fetchCounts: vi.fn((signal) => {
      const d = deferred<ProjectCounts>();
      counts.push({ signal, d });
      return d.promise;
    }),
  };
  return { api, pages, counts };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const item = (id: string, name = id): ProjectSummary => ({
  id,
  name,
  clientName: null,
  address: `${id} Sort St`,
  status: 'draft',
  openItems: 0,
});
const COUNTS: ProjectCounts = {
  all: 6,
  draft: 2,
  client_review: 1,
  permit_submitted: 1,
  approved: 1,
  in_build: 1,
};
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('EZD-117a project list store', () => {
  it('U3 start() loads one page and the counts once, however often it is called; projectsUrl', async () => {
    const { api, pages, counts } = fakeApi();
    const store = createProjectListStore(api);
    expect(store.get()).toEqual({
      status: 'loading',
      tab: 'all',
      sort: 'edited',
      items: [],
      next: null,
      moreStatus: 'idle',
      counts: null,
      countsStatus: 'loading',
      search: '',
    });
    store.start();
    store.start();
    expect(api.fetchPage).toHaveBeenCalledTimes(1);
    expect(api.fetchPage).toHaveBeenCalledWith(
      { tab: 'all', sort: 'edited', after: null },
      expect.any(AbortSignal),
    );
    expect(api.fetchCounts).toHaveBeenCalledTimes(1);
    pages[0].d.resolve({ items: [item('a')], next: null });
    counts[0].d.resolve(COUNTS);
    await flush();
    expect(store.get().status).toBe('ready');
    expect(store.get().countsStatus).toBe('ready');
    expect(store.get().counts).toEqual(COUNTS);
    expect(store.get().items.map((i) => i.id)).toEqual(['a']);

    expect(projectsUrl({ tab: 'all', sort: 'edited', after: null })).toBe(
      '/api/projects?status=all&sort=edited',
    );
    expect(projectsUrl({ tab: 'all', sort: 'edited', after: 'abc' })).toMatch(/&after=abc$/);
  });

  it('U4 loadMore() asks once while pending, appends only new ids, and stops when next is null', async () => {
    const { api, pages, counts } = fakeApi();
    const store = createProjectListStore(api);
    store.start();
    pages[0].d.resolve({ items: [item('a'), item('b')], next: 'n1' });
    counts[0].d.resolve(COUNTS);
    await flush();

    store.loadMore();
    store.loadMore();
    expect(api.fetchPage).toHaveBeenCalledTimes(2);
    expect(pages[1].q).toEqual({ tab: 'all', sort: 'edited', after: 'n1' });
    pages[1].d.resolve({ items: [item('b'), item('c')], next: null });
    await flush();
    expect(store.get().items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(store.get().next).toBeNull();
    expect(store.get().moreStatus).toBe('idle');

    store.loadMore();
    expect(api.fetchPage).toHaveBeenCalledTimes(2);
  });

  it('U5 setTab and setSort abort the old load, drop a late result, keep the counts, and ignore the same value', async () => {
    const { api, pages, counts } = fakeApi();
    const store = createProjectListStore(api);
    const notified = vi.fn();
    store.start();
    counts[0].d.resolve(COUNTS);
    store.subscribe(notified);

    const before = store.get();
    store.setTab('draft');
    expect(pages[0].signal.aborted).toBe(true);
    expect(pages[1].q).toEqual({ tab: 'draft', sort: 'edited', after: null });
    expect(store.get()).not.toBe(before);
    expect(store.get()).toMatchObject({ tab: 'draft', status: 'loading', items: [], next: null });
    expect(notified).toHaveBeenCalledTimes(1);

    pages[0].d.resolve({ items: [item('old')], next: null });
    await flush();
    expect(store.get().items).toEqual([]);
    expect(store.get().status).toBe('loading');

    pages[1].d.resolve({ items: [item('d1')], next: null });
    await flush();
    expect(store.get().status).toBe('ready');
    expect(store.get().items.map((i) => i.id)).toEqual(['d1']);

    store.setSort('name');
    expect(pages[2].q).toEqual({ tab: 'draft', sort: 'name', after: null });
    pages[2].d.resolve({ items: [item('d2')], next: null });
    await flush();
    expect(store.get().items.map((i) => i.id)).toEqual(['d2']);

    const calls = vi.mocked(api.fetchPage).mock.calls.length;
    store.setTab('draft');
    expect(vi.mocked(api.fetchPage).mock.calls.length).toBe(calls);
    expect(api.fetchCounts).toHaveBeenCalledTimes(1);
  });

  it('U6 failures set the error status of their kind, loadMore() retries, and an AbortError changes nothing', async () => {
    const a = fakeApi();
    const s1 = createProjectListStore(a.api);
    s1.start();
    a.pages[0].d.reject(new Error('projects_load_failed'));
    a.counts[0].d.reject(new Error('project_counts_load_failed'));
    await flush();
    expect(s1.get().status).toBe('error');
    expect(s1.get().countsStatus).toBe('error');

    const b = fakeApi();
    const s2 = createProjectListStore(b.api);
    s2.start();
    b.pages[0].d.resolve({ items: [item('a')], next: 'n1' });
    b.counts[0].d.resolve(COUNTS);
    await flush();
    s2.loadMore();
    b.pages[1].d.reject(new Error('projects_load_failed'));
    await flush();
    expect(s2.get().moreStatus).toBe('error');
    expect(s2.get().status).toBe('ready');
    s2.loadMore();
    expect(b.api.fetchPage).toHaveBeenCalledTimes(3);
    expect(b.pages[2].q.after).toBe('n1');

    const c = fakeApi();
    const s3 = createProjectListStore(c.api);
    s3.start();
    const before = s3.get();
    c.pages[0].d.reject(abortError());
    c.counts[0].d.reject(abortError());
    await flush();
    expect(s3.get()).toEqual(before);
  });
});
