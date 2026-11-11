// EZD-118 U4 (vault/plans/EZD-118.md section 4; AC-EZD-118-6). Expected values: Decided "`reset()`" (clears the
// search timer, aborts the page, more and counts loads, returns to tab All, sort Last edited and no search with
// status loading, fetches one page { tab:'all', sort:'edited', after:null } (no `search` key) and one counts call
// with the signal only; runs again on a second call). Fake api and manual clock as projects-store-search.test.ts.
import { describe, expect, it, vi } from 'vitest';
import type { ProjectCounts, ProjectPage, ProjectSummary } from './projects';
import { createProjectListStore, type ProjectListApi } from './projects-store';

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void };
function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type PageCall = { q: Record<string, unknown>; signal: AbortSignal; d: Deferred<ProjectPage> };
type CountsCall = { argc: number; signal: AbortSignal; d: Deferred<ProjectCounts> };

function fakeApi() {
  const pages: PageCall[] = [];
  const counts: CountsCall[] = [];
  const api: ProjectListApi = {
    fetchPage: vi.fn((q, signal) => {
      const d = deferred<ProjectPage>();
      pages.push({ q: q as Record<string, unknown>, signal, d });
      return d.promise;
    }),
    fetchCounts: vi.fn((...args: unknown[]) => {
      const d = deferred<ProjectCounts>();
      counts.push({ argc: args.length, signal: args[0] as AbortSignal, d });
      return d.promise;
    }),
  };
  return { api, pages, counts };
}

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
  address: `${id} Reset St`,
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

describe('EZD-118 project list store reset', () => {
  it('U4 reset: aborts what is pending, drops the timer, reloads All / Last edited, and runs every time', async () => {
    const f = fakeApi();
    const clock = fakeTimers();
    const store = createProjectListStore(f.api, clock.timers);
    store.start();
    f.pages[0].d.resolve({ items: [item('a')], next: null });
    f.counts[0].d.resolve(COUNTS);
    await flush();

    store.setTab('draft');
    f.pages[f.pages.length - 1].d.resolve({ items: [item('b')], next: null });
    await flush();
    store.setSort('name');
    f.pages[f.pages.length - 1].d.resolve({ items: [item('b')], next: null });
    await flush();
    store.setQuery('kit');
    clock.advance(250);
    // a page load and a counts load for 'kit' are pending; a further keystroke leaves a debounce timer pending
    store.setQuery('kitc');
    expect(clock.pending()).toBe(1);
    expect(store.get()).toMatchObject({ tab: 'draft', sort: 'name', search: 'kit' });
    const pageBefore = f.pages.length;
    const countsBefore = f.counts.length;
    const pendingPage = f.pages[pageBefore - 1];
    const pendingCounts = f.counts[countsBefore - 1];

    store.reset();
    expect(pendingPage.signal.aborted).toBe(true);
    expect(pendingCounts.signal.aborted).toBe(true);
    expect(clock.pending()).toBe(0);
    clock.advance(1000);
    expect(f.pages.length).toBe(pageBefore + 1);
    expect(f.counts.length).toBe(countsBefore + 1);
    const resetPage = f.pages[pageBefore];
    expect(resetPage.q).toEqual({ tab: 'all', sort: 'edited', after: null });
    expect('search' in resetPage.q).toBe(false);
    expect(f.counts[countsBefore].argc).toBe(1);
    expect(f.counts[countsBefore].signal).toBeInstanceOf(AbortSignal);
    expect(store.get()).toMatchObject({
      tab: 'all',
      sort: 'edited',
      search: '',
      status: 'loading',
    });

    resetPage.d.resolve({ items: [item('c')], next: null });
    f.counts[countsBefore].d.resolve(COUNTS);
    await flush();
    store.reset();
    expect(f.pages.length).toBe(pageBefore + 2);
    expect(f.pages[pageBefore + 1].q).toEqual({ tab: 'all', sort: 'edited', after: null });
    expect(store.get().status).toBe('loading');
  });
});
