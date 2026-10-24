// EZD-018 Files row (vault/plans/EZD-018.md Step 5 adapter, plan gap 2026-10-22): a fake RealtimeAdapter
// for the hub unit tests (T10-T16, T24). It records every call and plays the pinned library's part:
// a join attempt is one status delivered to the channel's subscribe callback; subscribe is called once per
// channel; after each setAuth the next status goes to every channel waiting to (re)join, as the library's
// rejoin does. Statuses come from `joinPolicy(topic)` (default SUBSCRIBED). Deliveries run on a resolved
// promise (not a timer), so they also run under vi.useFakeTimers().
import type {
  AdapterChannel,
  BroadcastMessage,
  JoinStatus,
  RealtimeAdapter,
} from '../../src/lib/realtime/adapter';

type PresenceState = Record<string, Array<Record<string, unknown>>>;

export type FakeChannel = AdapterChannel & {
  topic: string;
  presenceKey: string | undefined;
  subscribeCalls: number;
  // Every status delivered to the subscribe callback (join attempts).
  delivered: JoinStatus[];
  tracked: Array<{ appUserId: string }>;
  removed: boolean;
  joined: boolean;
  // Test controls.
  deliver(status: JoinStatus): void;
  emit(event: string, payload: unknown, meta?: { id?: unknown }): void;
  setPresence(state: PresenceState): void;
};

export type FakeAdapter = RealtimeAdapter & {
  calls: string[];
  connectCalls: Array<{ url: string; apiKey: string; accessToken: string }>;
  setAuthArgs: string[];
  channels: FakeChannel[];
  removedTopics: string[];
  joinPolicy: (topic: string) => JoinStatus;
  socketOpen: boolean;
  openSocket(): void;
  closeSocket(): void;
  channelsFor(prefix: string): FakeChannel[];
  removedFor(prefix: string): number;
};

export function createFakeAdapter(): FakeAdapter {
  const openCbs = new Set<() => void>();
  const closeCbs = new Set<() => void>();

  const makeChannel = (topic: string, presenceKey: string | undefined): FakeChannel => {
    let subscribeCb: ((status: JoinStatus, err?: Error) => void) | undefined;
    const broadcastCbs: Array<(m: BroadcastMessage) => void> = [];
    const syncCbs: Array<() => void> = [];
    let presence: PresenceState = {};
    let pending = false;

    const ch: FakeChannel = {
      topic,
      presenceKey,
      subscribeCalls: 0,
      delivered: [],
      tracked: [],
      removed: false,
      joined: false,
      subscribe(cb) {
        fake.calls.push(`subscribe ${topic}`);
        ch.subscribeCalls++;
        subscribeCb = cb;
        schedule();
        return ch;
      },
      on(type: 'broadcast' | 'presence', _filter: unknown, cb: unknown) {
        if (type === 'broadcast') broadcastCbs.push(cb as (m: BroadcastMessage) => void);
        else syncCbs.push(cb as () => void);
        return ch;
      },
      presenceState: () => presence,
      track: async (meta) => {
        fake.calls.push(`track ${topic}`);
        ch.tracked.push(meta);
        return 'ok';
      },
      deliver(status) {
        if (ch.removed || !subscribeCb) return;
        ch.delivered.push(status);
        ch.joined = status === 'SUBSCRIBED';
        subscribeCb(status, status === 'SUBSCRIBED' ? undefined : new Error(status));
      },
      emit(event, payload, meta) {
        for (const cb of broadcastCbs) cb({ event, payload, meta });
      },
      setPresence(state) {
        presence = state;
        for (const cb of syncCbs) cb();
      },
    };

    // One status to a channel that is waiting to (re)join, on a resolved promise.
    function schedule() {
      if (pending || ch.removed || ch.joined || !subscribeCb) return;
      pending = true;
      void Promise.resolve().then(() => {
        pending = false;
        if (ch.removed || ch.joined) return;
        ch.deliver(fake.joinPolicy(topic));
      });
    }
    (ch as unknown as { schedule: () => void }).schedule = schedule;
    return ch;
  };

  const live = () => fake.channels.filter((c) => !c.removed);
  const scheduleAll = () => {
    if (!fake.socketOpen) return;
    for (const c of live()) (c as unknown as { schedule: () => void }).schedule();
  };

  const fake: FakeAdapter = {
    calls: [],
    connectCalls: [],
    setAuthArgs: [],
    channels: [],
    removedTopics: [],
    joinPolicy: () => 'SUBSCRIBED',
    socketOpen: true,
    connect(opts) {
      fake.calls.push('connect');
      fake.connectCalls.push(opts);
    },
    disconnect() {
      fake.calls.push('disconnect');
    },
    async setAuth(accessToken) {
      fake.calls.push('setAuth');
      fake.setAuthArgs.push(accessToken);
      scheduleAll();
    },
    channel(topic, opts) {
      fake.calls.push(`channel ${topic}`);
      const ch = makeChannel(topic, opts.presenceKey);
      fake.channels.push(ch);
      return ch;
    },
    async removeChannel(channel) {
      const ch = channel as FakeChannel;
      fake.calls.push(`removeChannel ${ch.topic}`);
      ch.removed = true;
      fake.removedTopics.push(ch.topic);
      return 'ok';
    },
    onSocketOpen(cb) {
      openCbs.add(cb);
      return () => openCbs.delete(cb);
    },
    onSocketClose(cb) {
      closeCbs.add(cb);
      return () => closeCbs.delete(cb);
    },
    openSocket() {
      fake.socketOpen = true;
      for (const cb of [...openCbs]) cb();
    },
    // A dropped socket: every live channel is no longer joined.
    closeSocket() {
      fake.socketOpen = false;
      for (const c of live()) c.joined = false;
      for (const cb of [...closeCbs]) cb();
    },
    channelsFor: (prefix) => fake.channels.filter((c) => c.topic.startsWith(prefix)),
    removedFor: (prefix) => fake.removedTopics.filter((t) => t.startsWith(prefix)).length,
  };
  return fake;
}

// Lets promise chains (fetchToken, setAuth, deliveries) settle without timers.
export async function flush(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
