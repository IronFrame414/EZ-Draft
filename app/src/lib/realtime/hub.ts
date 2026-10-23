// EZD-018 Step 5 (vault/plans/EZD-018.md): the per-tab Realtime hub. Plain TypeScript over a
// RealtimeAdapter (adapter.ts). One channel per topic per tab; network requests only on events (first
// connect, a refused or closed channel, a socket reopen after a drop), never on a timer; every onResync
// callback runs exactly once after each re-subscription; session.ended drops every channel and goes to
// sign-in (Q-0052 (c)). It adds no online, offline or visibilitychange listener of its own.
import type { OnlineSource } from '../network';
import type {
  AdapterChannel,
  BroadcastMessage,
  JoinStatus,
  RealtimeAdapter,
  RealtimeToken,
} from './adapter';
import { toEventPayload, type ProjectChannelEvents, type UserChannelEvents } from './events';
import { projectTopic, userTopic } from './topics';

export type ChannelStatus = 'connecting' | 'subscribed' | 'reconnecting' | 'refused' | 'closed';

export type ChannelHandle<E> = {
  readonly status: ChannelStatus;
  ready: Promise<'subscribed' | 'refused'>;
  on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void;
  onResync(cb: () => void | Promise<void>): () => void;
  onStatus(cb: (status: ChannelStatus) => void): () => void;
  release(): void;
};

export type PresenceMember = { appUserId: string };

export type ProjectHandle = ChannelHandle<ProjectChannelEvents> & {
  presence(): PresenceMember[];
  onPresence(cb: () => void): () => void;
};

export type UserHandle = ChannelHandle<UserChannelEvents>;

export type RealtimeHub = {
  project(projectId: string): ProjectHandle;
  user(): UserHandle;
};

export type RealtimeHubOptions = {
  fetchToken: () => Promise<RealtimeToken>;
  adapter: RealtimeAdapter;
  env: { online: OnlineSource };
  onSessionEnded: () => void;
};

type Callbacks = {
  events: Map<string, Set<(payload: unknown) => void>>;
  resync: Set<() => void | Promise<void>>;
  status: Set<(status: ChannelStatus) => void>;
  presence: Set<() => void>;
};

type Entry = {
  key: string; // 'user' or the project id
  kind: 'project' | 'user';
  channel: AdapterChannel | null;
  handles: Set<Callbacks>;
  status: ChannelStatus;
  ready: Promise<'subscribed' | 'refused'>;
  settle: (v: 'subscribed' | 'refused') => void;
  everSubscribed: boolean;
  errors: number;
  refused: boolean;
  removed: boolean;
};

const USER_KEY = 'user';

export function createRealtimeHub({
  fetchToken,
  adapter,
  env,
  onSessionEnded,
}: RealtimeHubOptions): RealtimeHub {
  const entries = new Map<string, Entry>();
  let token: RealtimeToken | null = null;
  let phase: 'idle' | 'fetching' | 'connected' | 'failed' = 'idle';
  let socketClosed = false;
  let ended = false;
  let refreshing: Promise<void> | null = null;
  let openHandles = 0;
  let unlisten: Array<() => void> = [];

  const topicOf = (e: Entry, t: RealtimeToken) =>
    e.kind === 'project' ? projectTopic(e.key) : userTopic(t.appUserId);

  function newEntry(key: string, kind: 'project' | 'user'): Entry {
    let settle: (v: 'subscribed' | 'refused') => void = () => {};
    const ready = new Promise<'subscribed' | 'refused'>((resolve) => {
      settle = resolve;
    });
    return {
      key,
      kind,
      channel: null,
      handles: new Set(),
      status: 'connecting',
      ready,
      settle,
      everSubscribed: false,
      errors: 0,
      refused: false,
      removed: false,
    };
  }

  function setStatus(e: Entry, status: ChannelStatus) {
    if (e.status === status) return;
    e.status = status;
    for (const h of e.handles) for (const cb of h.status) cb(status);
  }

  function refuse(e: Entry) {
    e.refused = true;
    setStatus(e, 'refused');
    e.settle('refused');
    if (e.channel && !e.removed) {
      e.removed = true;
      void adapter.removeChannel(e.channel);
    }
  }

  function startListening() {
    if (unlisten.length > 0) return;
    unlisten = [
      adapter.onSocketOpen(onSocketOpen),
      adapter.onSocketClose(onSocketClose),
      env.online.subscribe(onOnlineChange),
    ];
  }

  function start() {
    if (ended || phase === 'fetching' || phase === 'connected') return;
    phase = 'fetching';
    startListening();
    fetchToken().then(
      (t) => {
        if (ended) return;
        token = t;
        phase = 'connected';
        socketClosed = false;
        adapter.connect({ url: t.url, apiKey: t.apiKey, accessToken: t.accessToken });
        ensureUserEntry();
        for (const e of entries.values()) openChannel(e);
      },
      () => tokenFailed(),
    );
  }

  // A rejected fetchToken: every open handle is refused; the hub waits for the next socket open or online.
  function tokenFailed() {
    if (ended) return;
    if (phase === 'fetching') phase = 'failed';
    for (const e of entries.values()) {
      if (e.refused) continue;
      setStatus(e, 'refused');
      e.settle('refused');
    }
  }

  function refreshToken(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = fetchToken()
      .then(async (t) => {
        if (ended) return;
        token = t;
        await adapter.setAuth(t.accessToken);
      })
      .catch(() => tokenFailed())
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  function ensureUserEntry() {
    if (openHandles > 0 && !entries.has(USER_KEY)) entries.set(USER_KEY, newEntry(USER_KEY, 'user'));
  }

  function openChannel(e: Entry) {
    if (ended || !token || e.channel || e.refused) return;
    const t = token;
    const ch = adapter.channel(topicOf(e, t), e.kind === 'project' ? { presenceKey: t.appUserId } : {});
    e.channel = ch;
    ch.on('broadcast', { event: '*' }, (message) => onMessage(e, message));
    if (e.kind === 'project') {
      ch.on('presence', { event: 'sync' }, () => {
        for (const h of e.handles) for (const cb of h.presence) cb();
      });
    }
    ch.subscribe((status) => onJoinStatus(e, status));
  }

  function onMessage(e: Entry, message: BroadcastMessage) {
    if (ended || e.removed) return;
    const payload = toEventPayload(message);
    for (const h of [...e.handles]) {
      const cbs = h.events.get(message.event);
      if (cbs) for (const cb of [...cbs]) cb(payload);
    }
    if (e.kind === 'user' && message.event === 'session.ended') endSession();
  }

  function onJoinStatus(e: Entry, status: JoinStatus) {
    if (ended || e.removed) return;
    if (status === 'SUBSCRIBED') {
      const resync = e.everSubscribed;
      e.everSubscribed = true;
      e.errors = 0;
      setStatus(e, 'subscribed');
      e.settle('subscribed');
      if (e.kind === 'project' && token) void e.channel?.track({ appUserId: token.appUserId });
      if (resync) for (const h of [...e.handles]) for (const cb of [...h.resync]) void cb();
      return;
    }
    // The pinned library reports a channel error before the socket close callback; the decision waits
    // one microtask so a socket drop is handled as a drop, not as a refused join.
    void Promise.resolve().then(() => onJoinError(e));
  }

  function onJoinError(e: Entry) {
    if (ended || e.removed || e.refused) return;
    if (socketClosed) {
      if (e.everSubscribed) setStatus(e, 'reconnecting');
      return;
    }
    e.errors++;
    if (e.errors >= 2) {
      refuse(e);
      return;
    }
    if (e.everSubscribed) setStatus(e, 'reconnecting');
    void refreshToken();
  }

  function onSocketClose() {
    if (ended) return;
    socketClosed = true;
    for (const e of entries.values()) {
      if (e.channel && !e.removed && e.everSubscribed) setStatus(e, 'reconnecting');
    }
  }

  function onSocketOpen() {
    if (ended) return;
    if (phase === 'failed') {
      phase = 'idle';
      start();
      return;
    }
    const wasClosed = socketClosed;
    socketClosed = false;
    if (!wasClosed) return;
    for (const e of entries.values()) e.errors = 0;
    void refreshToken();
  }

  function onOnlineChange() {
    if (ended || !env.online.getSnapshot()) return;
    if (phase === 'failed') {
      phase = 'idle';
      start();
      return;
    }
    if (socketClosed && token) {
      adapter.connect({ url: token.url, apiKey: token.apiKey, accessToken: token.accessToken });
    }
  }

  function endSession() {
    if (ended) return;
    ended = true;
    for (const e of entries.values()) {
      if (e.channel && !e.removed) {
        e.removed = true;
        void adapter.removeChannel(e.channel);
      }
    }
    token = null;
    for (const e of entries.values()) {
      setStatus(e, 'closed');
      e.settle('refused');
    }
    for (const off of unlisten) off();
    unlisten = [];
    onSessionEnded();
  }

  function closedHandle(): ProjectHandle {
    return {
      status: 'closed',
      ready: Promise.resolve('refused'),
      on: () => () => {},
      onResync: () => () => {},
      onStatus: () => () => {},
      release: () => {},
      presence: () => [],
      onPresence: () => () => {},
    };
  }

  function acquire(key: string, kind: 'project' | 'user'): ProjectHandle {
    if (ended) return closedHandle();
    let e = entries.get(key);
    if (!e) {
      e = newEntry(key, kind);
      entries.set(key, e);
    }
    const entry = e;
    const cbs: Callbacks = { events: new Map(), resync: new Set(), status: new Set(), presence: new Set() };
    entry.handles.add(cbs);
    openHandles++;
    let released = false;
    const add = <T>(set: Set<T>, cb: T) => {
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    };

    if (phase === 'connected') {
      ensureUserEntry();
      for (const x of entries.values()) openChannel(x);
    } else {
      start();
    }

    return {
      get status() {
        return ended ? 'closed' : entry.status;
      },
      ready: entry.ready,
      on(event, cb) {
        const name = String(event);
        let set = cbs.events.get(name);
        if (!set) {
          set = new Set();
          cbs.events.set(name, set);
        }
        return add(set, cb as (payload: unknown) => void);
      },
      onResync: (cb) => add(cbs.resync, cb),
      onStatus: (cb) => add(cbs.status, cb),
      presence() {
        const state = entry.channel && !entry.removed ? entry.channel.presenceState() : {};
        return Object.keys(state)
          .sort()
          .map((appUserId) => ({ appUserId }));
      },
      onPresence: (cb) => add(cbs.presence, cb),
      release() {
        if (released) return;
        released = true;
        entry.handles.delete(cbs);
        openHandles--;
        if (ended) return;
        if (entry.handles.size === 0 && entry.kind === 'project') drop(entry);
        if (openHandles === 0) {
          const u = entries.get(USER_KEY);
          if (u) drop(u);
        }
      },
    };
  }

  function drop(e: Entry) {
    entries.delete(e.key);
    if (e.channel && !e.removed) {
      e.removed = true;
      void adapter.removeChannel(e.channel);
    }
  }

  return {
    project: (projectId) => acquire(projectId.toLowerCase(), 'project'),
    user: () => acquire(USER_KEY, 'user') as unknown as UserHandle,
  };
}
