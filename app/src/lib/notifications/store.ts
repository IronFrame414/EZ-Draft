// EZD-110b Step 9 (vault/plans/EZD-110b.md Decided D15, B2, B3; section 3 "store.ts"): the browser's copy of
// the member's notification list. Plain store, no React (pattern: app/src/lib/permissions/permission-store.ts).
// State objects are immutable; get() returns the same object until the next change. No method rejects.
import type { MessageKey } from '../../server/messages/catalog';
import type { NotificationCursor, NotificationItem, NotificationPage } from './kinds';

export type NotificationState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: NotificationItem[];
  unreadCount: number;
  hasMore: boolean;
  olderStatus: 'idle' | 'loading' | 'error';
};

export type OpenResult = { ok: true; link: string } | { ok: false; messageKey: MessageKey };

export type NotificationApi = {
  fetchPage(cursor: NotificationCursor | null): Promise<NotificationPage>;
  open(id: string): Promise<OpenResult>;
  markAllRead(): Promise<void>;
};

export type NotificationStore = {
  get(): NotificationState;
  subscribe(cb: () => void): () => void;
  refresh(): Promise<void>;
  reset(): Promise<void>;
  loadOlder(): Promise<void>;
  applyRead(id: string | null): void;
  open(id: string): Promise<OpenResult>;
  markAllRead(): Promise<boolean>;
};

const INITIAL: NotificationState = {
  status: 'idle',
  items: [],
  unreadCount: 0,
  hasMore: false,
  olderStatus: 'idle',
};

const DB_UNAVAILABLE: OpenResult = { ok: false, messageKey: 'error.db_unavailable' };

export function createNotificationStore(api: NotificationApi): NotificationStore {
  let state: NotificationState = INITIAL;
  const listeners = new Set<() => void>();
  // D15 version rule: bumped when a first page applies, on every reset() and every applyRead(). A fetch that
  // settles after the version moved changes nothing.
  let version = 0;
  // An older page is part of the loaded items (merge candidate, D15).
  let olderLoaded = false;
  // reset() marks a replace pending until a first page applies (D15).
  let replacePending = false;
  // The run (D15): refresh() sets wanted; the run loops while wanted is set.
  let wanted = false;
  let running: Promise<void> | null = null;

  function set(next: NotificationState) {
    if (next === state) return;
    state = next;
    for (const l of [...listeners]) l();
  }

  // D15 bump: the version goes up; an older fetch in flight becomes stale, so Show older shows again.
  function bump(): NotificationState {
    version += 1;
    return state.olderStatus === 'loading' ? { ...state, olderStatus: 'idle' } : state;
  }

  // D15: merge only when no replace is pending, an older page is loaded, the page has more and its last id is
  // loaded; every other first page replaces.
  function applyFirstPage(page: NotificationPage) {
    const last = page.items[page.items.length - 1];
    const at = last ? state.items.findIndex((i) => i.id === last.id) : -1;
    const merge = !replacePending && olderLoaded && page.hasMore && at !== -1;
    const base = bump();
    replacePending = false;
    if (merge) {
      const seen = new Set(page.items.map((i) => i.id));
      set({
        ...base,
        status: 'ready',
        items: [...page.items, ...base.items.slice(at + 1).filter((i) => !seen.has(i.id))],
        unreadCount: page.unreadCount,
      });
      return;
    }
    olderLoaded = false;
    set({
      status: 'ready',
      items: page.items,
      unreadCount: page.unreadCount,
      hasMore: page.hasMore,
      olderStatus: 'idle',
    });
  }

  async function fetchFirstPage(): Promise<void> {
    const started = version;
    if (state.status === 'idle' || state.status === 'error') set({ ...state, status: 'loading' });
    let page: NotificationPage;
    try {
      page = await api.fetchPage(null);
    } catch {
      if (version !== started) {
        wanted = true;
        return;
      }
      set({ ...state, status: 'error' });
      return;
    }
    if (version !== started) {
      wanted = true;
      return;
    }
    applyFirstPage(page);
  }

  async function run(): Promise<void> {
    while (wanted) {
      wanted = false;
      await fetchFirstPage();
    }
    running = null;
  }

  // D15: many refresh() calls during a fetch cost one more fetch; every caller gets the running run.
  function refresh(): Promise<void> {
    wanted = true;
    if (!running) running = run();
    return running;
  }

  // D15, B2 (Q-0549 (b)): the shown state stays in every status until a fresh first page replaces it.
  function reset(): Promise<void> {
    set(bump());
    replacePending = true;
    return refresh();
  }

  async function olderOnce(): Promise<void> {
    const last = state.items[state.items.length - 1];
    const started = version;
    set({ ...state, olderStatus: 'loading' });
    let page: NotificationPage;
    try {
      page = await api.fetchPage({ createdAt: last.createdAt, id: last.id });
    } catch {
      if (version !== started) return;
      set({ ...state, olderStatus: 'error' });
      return;
    }
    if (version !== started) return;
    const seen = new Set(state.items.map((i) => i.id));
    olderLoaded = true;
    set({
      ...state,
      items: [...state.items, ...page.items.filter((i) => !seen.has(i.id))],
      hasMore: page.hasMore,
      unreadCount: page.unreadCount,
      olderStatus: 'idle',
    });
  }

  function loadOlder(): Promise<void> {
    if (!state.hasMore || state.items.length === 0 || state.olderStatus === 'loading') {
      return Promise.resolve();
    }
    return olderOnce();
  }

  function applyRead(id: string | null) {
    const base = bump();
    const stamp = new Date().toISOString();
    if (id === null) {
      if (base.unreadCount === 0 && base.items.every((i) => i.readAt !== null)) {
        set(base);
        return;
      }
      set({
        ...base,
        items: base.items.map((i) => (i.readAt === null ? { ...i, readAt: stamp } : i)),
        unreadCount: 0,
      });
      return;
    }
    const hit = base.items.find((i) => i.id === id);
    if (!hit || hit.readAt !== null) {
      set(base);
      return;
    }
    set({
      ...base,
      items: base.items.map((i) => (i.id === id ? { ...i, readAt: stamp } : i)),
      unreadCount: Math.max(0, base.unreadCount - 1),
    });
  }

  async function open(id: string): Promise<OpenResult> {
    let result: OpenResult;
    try {
      result = await api.open(id);
    } catch {
      result = DB_UNAVAILABLE;
    }
    // D15: a refused open returns after its refetch settles, so D17's toast follows the updated list.
    if (result.ok) applyRead(id);
    else await refresh();
    return result;
  }

  async function markAllRead(): Promise<boolean> {
    try {
      await api.markAllRead();
    } catch {
      return false;
    }
    applyRead(null);
    return true;
  }

  return {
    get: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    refresh,
    reset,
    loadOlder,
    applyRead,
    open,
    markAllRead,
  };
}

const OPEN_ERRORS: Record<number, MessageKey> = {
  401: 'error.not_signed_in',
  403: 'error.not_authorized',
};

export const notificationHttpApi: NotificationApi = {
  async fetchPage(cursor) {
    const query = cursor
      ? `?before=${encodeURIComponent(cursor.createdAt)}&beforeId=${encodeURIComponent(cursor.id)}`
      : '';
    const res = await fetch(`/api/notifications${query}`, { cache: 'no-store' });
    if (res.status !== 200) throw new Error('notifications_refused');
    return (await res.json()) as NotificationPage;
  },
  async open(id) {
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/open`, {
        method: 'POST',
        cache: 'no-store',
      });
      const body = (await res.json()) as { link?: string; error?: { code?: string } };
      if (res.status === 200 && typeof body.link === 'string') return { ok: true, link: body.link };
      if (res.status === 404) {
        return {
          ok: false,
          messageKey:
            body.error?.code === 'project_gone'
              ? 'error.job_not_found'
              : body.error?.code === 'notification_not_found'
                ? 'error.notification_not_found'
                : 'error.db_unavailable',
        };
      }
      return { ok: false, messageKey: OPEN_ERRORS[res.status] ?? 'error.db_unavailable' };
    } catch {
      return DB_UNAVAILABLE;
    }
  },
  async markAllRead() {
    const res = await fetch('/api/notifications/read-all', { method: 'POST', cache: 'no-store' });
    if (res.status !== 200) throw new Error('notifications_refused');
  },
};
