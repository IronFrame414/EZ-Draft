// EZD-117a Step 8 (vault/plans/EZD-117a.md Decided "Store", "projectHttpApi", "Data requests"; section 3): the
// browser's Projects list. Plain store, no React (pattern: app/src/lib/permissions/permission-store.ts). Load =
// one page request and one counts request in parallel; a tab or sort change = one page request (counts
// unchanged); scrolling = the next page by its cursor. A change aborts the page and more loads, and a response
// from an older load (sequence number) is dropped; an AbortError changes nothing.
import {
  projectsUrl,
  type ProjectCounts,
  type ProjectPage,
  type ProjectSort,
  type ProjectSummary,
  type ProjectTab,
} from './projects';

export type ProjectListApi = {
  fetchPage(
    q: { tab: ProjectTab; sort: ProjectSort; after: string | null },
    signal: AbortSignal,
  ): Promise<ProjectPage>;
  fetchCounts(signal: AbortSignal): Promise<ProjectCounts>;
};

export type ProjectListState = {
  status: 'loading' | 'ready' | 'error';
  tab: ProjectTab;
  sort: ProjectSort;
  items: ProjectSummary[];
  next: string | null;
  moreStatus: 'idle' | 'loading' | 'error';
  counts: ProjectCounts | null;
  countsStatus: 'loading' | 'ready' | 'error';
};

export type ProjectListStore = {
  get(): ProjectListState;
  subscribe(cb: () => void): () => void;
  start(): void;
  setTab(tab: ProjectTab): void;
  setSort(sort: ProjectSort): void;
  loadMore(): void;
  dispose(): void;
};

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

export function createProjectListStore(api: ProjectListApi): ProjectListStore {
  let state: ProjectListState = {
    status: 'loading',
    tab: 'all',
    sort: 'edited',
    items: [],
    next: null,
    moreStatus: 'idle',
    counts: null,
    countsStatus: 'loading',
  };
  const listeners = new Set<() => void>();
  let started = false;
  // One controller for the page and more loads, one for the counts.
  let pageCtl: AbortController | null = null;
  let countsCtl: AbortController | null = null;
  let seq = 0;

  function set(patch: Partial<ProjectListState>) {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  }

  function loadPage() {
    pageCtl?.abort();
    const ctl = new AbortController();
    pageCtl = ctl;
    const mine = ++seq;
    api.fetchPage({ tab: state.tab, sort: state.sort, after: null }, ctl.signal).then(
      (page) => {
        if (mine !== seq) return;
        set({ status: 'ready', items: page.items, next: page.next, moreStatus: 'idle' });
      },
      (e: unknown) => {
        if (isAbort(e) || mine !== seq) return;
        set({ status: 'error' });
      },
    );
  }

  function loadCounts() {
    countsCtl?.abort();
    const ctl = new AbortController();
    countsCtl = ctl;
    api.fetchCounts(ctl.signal).then(
      (counts) => {
        if (countsCtl !== ctl) return;
        set({ counts, countsStatus: 'ready' });
      },
      (e: unknown) => {
        if (isAbort(e) || countsCtl !== ctl) return;
        set({ countsStatus: 'error' });
      },
    );
  }

  function change(patch: { tab: ProjectTab } | { sort: ProjectSort }) {
    set({ ...patch, status: 'loading', items: [], next: null, moreStatus: 'idle' });
    loadPage();
  }

  return {
    get: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    start() {
      if (started) return;
      started = true;
      loadPage();
      loadCounts();
    },
    setTab(tab) {
      if (tab === state.tab) return;
      change({ tab });
    },
    setSort(sort) {
      if (sort === state.sort) return;
      change({ sort });
    },
    loadMore() {
      if (state.status !== 'ready' || state.next === null || state.moreStatus === 'loading') return;
      if (pageCtl === null) return;
      const ctl = pageCtl;
      const mine = seq;
      set({ moreStatus: 'loading' });
      api.fetchPage({ tab: state.tab, sort: state.sort, after: state.next }, ctl.signal).then(
        (page) => {
          if (mine !== seq) return;
          const listed = new Set(state.items.map((i) => i.id));
          const added = page.items.filter((i) => !listed.has(i.id));
          set({ items: [...state.items, ...added], next: page.next, moreStatus: 'idle' });
        },
        (e: unknown) => {
          if (isAbort(e) || mine !== seq) return;
          set({ moreStatus: 'error' });
        },
      );
    },
    dispose() {
      started = false;
      seq++;
      pageCtl?.abort();
      countsCtl?.abort();
      pageCtl = null;
      countsCtl = null;
    },
  };
}

export const projectHttpApi: ProjectListApi = {
  async fetchPage(q, signal) {
    const res = await fetch(projectsUrl(q), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (res.status !== 200) throw new Error('projects_load_failed');
    return (await res.json()) as ProjectPage;
  },
  async fetchCounts(signal) {
    const res = await fetch('/api/projects/counts', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (res.status !== 200) throw new Error('project_counts_load_failed');
    return (await res.json()) as ProjectCounts;
  },
};
