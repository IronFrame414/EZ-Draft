// EZD-128 Build step 7 (vault/plans/EZD-128.md section 3 store rows; Decided "Open", "Typing", "Fetch answer",
// "Retry list", "Close", "Leave", "Staleness", "Search", "Browser parsing", "Fetch options"; Q-0697 decisions 04;
// Q-0698; Q-0726; Q-0214): the project switcher's state over an injected api, and the leave order. No React.
//
// One staleness rule (L-048): `gen` goes up on every open, close, new fetch, retry and dispose, which aborts the
// request in flight and clears the debounce; a fetch answer is applied only while `gen` is still its own.
//
// Leave (Q-0697 decisions 04 "Leaving the editor"; S06 Decision 12): a holder's Stop editing (drain, checkpoint,
// release, waited for) runs before the other project opens; a failure keeps the lock and shows Retry. A viewer
// with a pending Request edit cancels it first (vault/build/assumptions.md EZD-128, Q-0727 (a)).
import type { EditorSession } from '../editor-session';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import { projectsUrl, SEARCH_DEBOUNCE_MS } from '../../lib/projects/projects';
import {
  RECENT_PROJECTS_MAX,
  recentProjectsUrl,
  type RecentProject,
} from '../../lib/projects/recent';

export type SwitcherItem = RecentProject;
export type SwitcherList =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: readonly SwitcherItem[] };
export type LeaveTarget = { kind: 'project'; projectId: string } | { kind: 'projects' };
export type SwitcherState = {
  open: boolean;
  query: string;
  mode: 'recent' | 'search';
  term: string;
  list: SwitcherList;
  leaving: { status: 'idle' } | { status: 'busy' | 'failed'; target: LeaveTarget };
};
export type LeaveResult = { ok: true } | { ok: false; code: string };

export type SwitcherApi = {
  recent(exclude: string, signal: AbortSignal): Promise<SwitcherItem[] | null>;
  search(term: string, exclude: string, signal: AbortSignal): Promise<SwitcherItem[] | null>;
};

export type SwitcherTimers = {
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type SwitcherDeps = {
  projectId: string;
  api: SwitcherApi;
  leave: () => Promise<LeaveResult>;
  navigate: (href: string) => void;
  timers?: SwitcherTimers;
};

export type SwitcherStore = {
  getState(): SwitcherState;
  subscribe(listener: () => void): () => void;
  openMenu(): void;
  toggle(): void;
  close(): void;
  setQuery(query: string): void;
  retryList(): void;
  pick(projectId: string): Promise<void>;
  backToProjects(): Promise<void>;
  retryLeave(): Promise<void>;
  dispose(): void;
};

export const projectHref = (projectId: string): string => `/projects/${projectId}`;
export const PROJECTS_HREF = '/';

const INITIAL: SwitcherState = {
  open: false,
  query: '',
  mode: 'recent',
  term: '',
  list: { status: 'loading' },
  leaving: { status: 'idle' },
};

const defaultTimers: SwitcherTimers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSwitcherStore(deps: SwitcherDeps): SwitcherStore {
  const timers = deps.timers ?? defaultTimers;
  const listeners = new Set<() => void>();
  let state: SwitcherState = INITIAL;
  let gen = 0;
  let controller: AbortController | null = null;
  let timer: unknown = null;
  let disposed = false;

  const set = (next: Partial<SwitcherState>) => {
    state = { ...state, ...next };
    for (const l of [...listeners]) l();
  };

  // Drops whatever is in flight: the request, the debounce and any answer still to come.
  const bump = () => {
    gen += 1;
    controller?.abort();
    controller = null;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const run = (mode: 'recent' | 'search', term: string) => {
    const mine = gen;
    const c = new AbortController();
    controller = c;
    const call =
      mode === 'recent'
        ? deps.api.recent(deps.projectId, c.signal)
        : deps.api.search(term, deps.projectId, c.signal);
    call.then(
      (items) => {
        if (mine !== gen || disposed) return;
        controller = null;
        set({ list: items === null ? { status: 'failed' } : { status: 'ready', items } });
      },
      () => {
        if (mine !== gen || disposed) return;
        controller = null;
        set({ list: { status: 'failed' } });
      },
    );
  };

  const fetchNow = (mode: 'recent' | 'search', term: string) => {
    bump();
    run(mode, term);
  };

  const fetchLater = (term: string) => {
    bump();
    const mine = gen;
    timer = timers.setTimeout(() => {
      timer = null;
      if (mine !== gen || disposed) return;
      run('search', term);
    }, SEARCH_DEBOUNCE_MS);
  };

  const busy = () => state.leaving.status === 'busy';

  const leaveTo = async (target: LeaveTarget) => {
    set({ leaving: { status: 'busy', target } });
    let r: LeaveResult;
    try {
      r = await deps.leave();
    } catch {
      r = { ok: false, code: 'leave_failed' };
    }
    if (disposed) return;
    if (r.ok) {
      deps.navigate(target.kind === 'project' ? projectHref(target.projectId) : PROJECTS_HREF);
      return;
    }
    set({ leaving: { status: 'failed', target } });
  };

  const store: SwitcherStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    openMenu() {
      if (disposed || state.open) return;
      bump();
      set({ ...INITIAL, open: true });
      run('recent', '');
    },
    toggle() {
      if (state.open) store.close();
      else store.openMenu();
    },
    close() {
      if (disposed || busy() || !state.open) return;
      bump();
      set({ open: false, leaving: { status: 'idle' } });
    },
    setQuery(query) {
      if (disposed || !state.open || busy()) return;
      const t = query.trim();
      if (t === '') {
        if (state.mode === 'recent') {
          set({ query });
          return;
        }
        set({ query, mode: 'recent', term: '', list: { status: 'loading' } });
        fetchNow('recent', '');
        return;
      }
      if (state.mode === 'search' && t === state.term) {
        set({ query });
        return;
      }
      set({ query, mode: 'search', term: t, list: { status: 'loading' } });
      fetchLater(t);
    },
    retryList() {
      if (disposed || !state.open || state.list.status !== 'failed') return;
      set({ list: { status: 'loading' } });
      fetchNow(state.mode, state.term);
    },
    async pick(projectId) {
      if (disposed || !state.open || busy()) return;
      await leaveTo({ kind: 'project', projectId });
    },
    async backToProjects() {
      if (disposed || !state.open || busy()) return;
      await leaveTo({ kind: 'projects' });
    },
    async retryLeave() {
      if (disposed || !state.open || state.leaving.status !== 'failed') return;
      await leaveTo(state.leaving.target);
    },
    dispose() {
      if (disposed) return;
      bump();
      disposed = true;
      listeners.clear();
    },
  };
  return store;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

// Hand-checked shapes (no zod in the browser): any other status, shape or a throw (abort included) is null.
function readItems(body: unknown): SwitcherItem[] | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  const out: SwitcherItem[] = [];
  for (const v of body.items) {
    if (
      !isObj(v) ||
      typeof v.id !== 'string' ||
      typeof v.name !== 'string' ||
      (v.clientName !== null && typeof v.clientName !== 'string')
    ) {
      return null;
    }
    out.push({ id: v.id, name: v.name, clientName: v.clientName });
  }
  return out;
}

export function switcherHttpApi(fetchImpl: typeof fetch = (...a) => fetch(...a)): SwitcherApi {
  const get = async (url: string, signal: AbortSignal): Promise<SwitcherItem[] | null> => {
    try {
      const res = await fetchImpl(url, { cache: 'no-store', signal });
      if (res.status !== 200) return null;
      return readItems(await res.json());
    } catch {
      return null;
    }
  };
  return {
    recent: (exclude, signal) => get(recentProjectsUrl(exclude), signal),
    async search(term, exclude, signal) {
      const items = await get(
        projectsUrl({ tab: 'all', sort: 'edited', after: null, search: term }),
        signal,
      );
      if (items === null) return null;
      const open = exclude.toLowerCase();
      return items.filter((i) => i.id.toLowerCase() !== open).slice(0, RECENT_PROJECTS_MAX);
    },
  };
}

// The parts of an open editor session the leave reads.
export type LeaveSession = Pick<EditorSession, 'model' | 'sync' | 'lock' | 'queued'>;
type SessionLockModule = Pick<typeof import('../lock/session-lock'), 'stopEditing'>;

// Holder (`session.lock.holding`, as the lock UI): Stop editing, loaded on first use as the lock UI loads it.
// Not holding with a pending request: cancel it (its answer is not waited on for success). Otherwise nothing.
export async function leaveProject(
  session: LeaveSession,
  capture: () => Promise<ThumbnailCapture | null>,
  load: () => Promise<SessionLockModule> = () => import('../lock/session-lock'),
): Promise<LeaveResult> {
  try {
    if (session.lock.holding) {
      const { stopEditing } = await load();
      const r = await stopEditing(session, capture);
      return r.ok ? { ok: true } : { ok: false, code: r.code };
    }
    const controller = session.lock.controller;
    if (controller && controller.get().lock?.myRequest) await controller.cancelRequest();
    return { ok: true };
  } catch {
    return { ok: false, code: 'leave_failed' };
  }
}
