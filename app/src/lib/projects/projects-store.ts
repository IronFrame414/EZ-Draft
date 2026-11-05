// EZD-117a Step 8 (vault/plans/EZD-117a.md Decided "Store", "projectHttpApi", "Data requests"; section 3): the
// browser's Projects list. Plain store, no React (pattern: app/src/lib/permissions/permission-store.ts). Load =
// one page request and one counts request in parallel; a tab or sort change = one page request (counts
// unchanged); scrolling = the next page by its cursor. A change aborts the page and more loads, and a response
// from an older load (sequence number) is dropped; an AbortError changes nothing.
// EZD-117b Build step 7 (vault/plans/EZD-117b.md Decided "Store search", "`retry()`"; Q-0402; Q-0448): the
// debounced search (page and counts follow it, the tab changes only the page), clear, clear filters and retry.
// An empty search is never sent: no `search` key and no second fetchCounts argument.
// EZD-118 Build step 11 (vault/plans/EZD-118.md Decided "`reset()`"; Q-0394): back to All, Last edited and no
// search after a create, with a fresh page and counts; the old counts stay until the new ones arrive.
import {
  SEARCH_DEBOUNCE_MS,
  projectCountsUrl,
  projectsUrl,
  type ProjectCounts,
  type ProjectPage,
  type ProjectSort,
  type ProjectSummary,
  type ProjectTab,
} from './projects';

export type ProjectListApi = {
  fetchPage(
    q: { tab: ProjectTab; sort: ProjectSort; after: string | null; search?: string },
    signal: AbortSignal,
  ): Promise<ProjectPage>;
  fetchCounts(signal: AbortSignal, search?: string): Promise<ProjectCounts>;
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
  search: string;
};

export type ProjectListStore = {
  get(): ProjectListState;
  subscribe(cb: () => void): () => void;
  start(): void;
  setTab(tab: ProjectTab): void;
  setSort(sort: ProjectSort): void;
  loadMore(): void;
  setQuery(text: string): void;
  clearSearch(): void;
  clearFilters(): void;
  retry(): void;
  reset(): void;
  dispose(): void;
};

export type SearchTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultTimers: SearchTimers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

export function createProjectListStore(
  api: ProjectListApi,
  timers: SearchTimers = defaultTimers,
): ProjectListStore {
  let state: ProjectListState = {
    status: 'loading',
    tab: 'all',
    sort: 'edited',
    items: [],
    next: null,
    moreStatus: 'idle',
    counts: null,
    countsStatus: 'loading',
    search: '',
  };
  const listeners = new Set<() => void>();
  let started = false;
  // One controller for the page and more loads, one for the counts.
  let pageCtl: AbortController | null = null;
  let countsCtl: AbortController | null = null;
  let seq = 0;
  let countsSeq = 0;
  let timer: unknown = null;

  function set(patch: Partial<ProjectListState>) {
    state = { ...state, ...patch };
    for (const l of [...listeners]) l();
  }

  // The page query; `search` only when non-empty.
  const pageQuery = (after: string | null) => ({
    tab: state.tab,
    sort: state.sort,
    after,
    ...(state.search === '' ? {} : { search: state.search }),
  });

  function clearTimer() {
    if (timer === null) return;
    timers.clearTimeout(timer);
    timer = null;
  }

  function loadPage() {
    pageCtl?.abort();
    const ctl = new AbortController();
    pageCtl = ctl;
    const mine = ++seq;
    api.fetchPage(pageQuery(null), ctl.signal).then(
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
    const mine = ++countsSeq;
    const request =
      state.search === '' ? api.fetchCounts(ctl.signal) : api.fetchCounts(ctl.signal, state.search);
    request.then(
      (counts) => {
        if (mine !== countsSeq) return;
        set({ counts, countsStatus: 'ready' });
      },
      (e: unknown) => {
        if (isAbort(e) || mine !== countsSeq) return;
        set({ countsStatus: 'error' });
      },
    );
  }

  function change(patch: { tab: ProjectTab } | { sort: ProjectSort }) {
    set({ ...patch, status: 'loading', items: [], next: null, moreStatus: 'idle' });
    loadPage();
  }

  // Search `s` (trimmed): a new page 1 and new counts; the old counts stay until the new ones arrive.
  function apply(s: string) {
    if (s === state.search) return;
    set({
      search: s,
      status: 'loading',
      items: [],
      next: null,
      moreStatus: 'idle',
      countsStatus: 'loading',
    });
    loadPage();
    loadCounts();
  }

  const store: ProjectListStore = {
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
      api.fetchPage(pageQuery(state.next), ctl.signal).then(
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
    setQuery(text) {
      clearTimer();
      const s = text.trim();
      if (s === state.search) return;
      timer = timers.setTimeout(() => {
        timer = null;
        apply(s);
      }, SEARCH_DEBOUNCE_MS);
    },
    clearSearch() {
      clearTimer();
      apply('');
    },
    clearFilters() {
      clearTimer();
      if (state.tab === 'all' && state.search === '') return;
      const hadSearch = state.search !== '';
      set({
        tab: 'all',
        search: '',
        status: 'loading',
        items: [],
        next: null,
        moreStatus: 'idle',
        ...(hadSearch ? { countsStatus: 'loading' as const } : {}),
      });
      loadPage();
      if (hadSearch) loadCounts();
    },
    retry() {
      const { status, countsStatus, moreStatus } = state;
      if (status === 'error') {
        set({ status: 'loading', items: [], next: null, moreStatus: 'idle' });
        loadPage();
      }
      if (countsStatus === 'error') {
        set({ countsStatus: 'loading' });
        loadCounts();
      }
      if (moreStatus === 'error') store.loadMore();
    },
    reset() {
      clearTimer();
      set({
        tab: 'all',
        sort: 'edited',
        search: '',
        status: 'loading',
        items: [],
        next: null,
        moreStatus: 'idle',
        countsStatus: 'loading',
      });
      loadPage();
      loadCounts();
    },
    dispose() {
      clearTimer();
      started = false;
      seq++;
      pageCtl?.abort();
      countsCtl?.abort();
      pageCtl = null;
      countsCtl = null;
    },
  };
  return store;
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
  async fetchCounts(signal, search) {
    const res = await fetch(projectCountsUrl(search), {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (res.status !== 200) throw new Error('project_counts_load_failed');
    return (await res.json()) as ProjectCounts;
  },
};
