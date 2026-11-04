// EZD-318 (vault/plans/EZD-318.md section 4): every handle's onResync callbacks run once per SUBSCRIBED,
// the first included, and once when a handle joins a channel already subscribed (T11, T14 edited; N1-N4
// new); `ready` holds the latest outcome (T24 edited: refused after session.ended).
// EZD-018 T10-T16, T24, T25 (vault/plans/EZD-018.md Tests; Step 5): the per-tab Realtime hub over the fake
// adapter (app/test-harness/realtime/fake-adapter.ts), and toEventPayload. A join attempt is one status
// delivered to a channel's subscribe callback (Step 5 adapter). env.online is createOnlineSource over a Node
// EventTarget and a { onLine } object (Step 5 hub). Expected counts: plan Tests rows; 7,200,000 ms = two
// access-token lifetimes at jwt_expiry 3600 (EZD-007 Step 1; Q-0052 (c)).
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOnlineSource } from '../network';
import {
  createFakeAdapter,
  flush,
  type FakeAdapter,
} from '../../../test-harness/realtime/fake-adapter';
import type { RealtimeToken } from './adapter';
import { toEventPayload } from './events';
import { createRealtimeHub } from './hub';

const SELF = randomUUID();
const USER_TOPIC = `user:${SELF}`;
const token = (accessToken: string): RealtimeToken => ({
  url: 'http://127.0.0.1:54321',
  apiKey: 'publishable-test-key',
  accessToken,
  expiresAt: 4_102_444_800,
  appUserId: SELF,
});

function setup(tokens: string[] = ['t1']) {
  const adapter: FakeAdapter = createFakeAdapter();
  const target = new EventTarget();
  const nav = { onLine: true };
  let n = 0;
  const fetchToken = vi.fn(async () => token(tokens[Math.min(n++, tokens.length - 1)]));
  const onSessionEnded = vi.fn();
  const hub = createRealtimeHub({
    fetchToken,
    adapter,
    env: { online: createOnlineSource(target, nav) },
    onSessionEnded,
  });
  return { adapter, target, nav, fetchToken, onSessionEnded, hub };
}

const only = (a: FakeAdapter, topic: string) => {
  const list = a.channels.filter((c) => c.topic === topic);
  expect(list, topic).toHaveLength(1);
  return list[0];
};

describe('EZD-018 realtime hub', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('EZD-018 T10 one channel per topic; the user channel goes with the last handle', async () => {
    const { adapter, hub } = setup();
    const p1 = randomUUID();
    const p2 = randomUUID();
    const a = hub.project(p1);
    const b = hub.project(p1);
    const c = hub.project(p2);
    await flush();
    expect(adapter.channelsFor('project:')).toHaveLength(2);
    expect(adapter.channels.filter((ch) => ch.topic === USER_TOPIC)).toHaveLength(1);

    a.release();
    await flush();
    expect(adapter.removedFor('project:')).toBe(0);
    b.release();
    await flush();
    expect(adapter.removedFor('project:')).toBe(1);
    expect(adapter.removedFor(USER_TOPIC)).toBe(0);
    c.release();
    await flush();
    expect(adapter.removedFor('project:')).toBe(2);
    expect(adapter.removedFor(USER_TOPIC)).toBe(1);
  });

  it('EZD-018 T11 refetch once per reconnect', async () => {
    const { adapter, hub } = setup();
    const h = hub.project(randomUUID());
    const r1 = vi.fn();
    const r2 = vi.fn();
    h.onResync(r1);
    h.onResync(r2);
    const statuses: string[] = [];
    h.onStatus((s: string) => {
      statuses.push(s);
    });
    await flush();
    expect(h.status).toBe('subscribed');
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).toHaveBeenCalledTimes(1);

    for (const cycle of [1, 2]) {
      const from = statuses.length;
      adapter.closeSocket();
      await flush();
      adapter.openSocket();
      await flush();
      expect(h.status).toBe('subscribed');
      expect(r1).toHaveBeenCalledTimes(cycle + 1);
      expect(r2).toHaveBeenCalledTimes(cycle + 1);
      const seq = statuses.slice(from);
      const rec = seq.indexOf('reconnecting');
      expect(rec, `cycle ${cycle}: ${JSON.stringify(seq)}`).toBeGreaterThanOrEqual(0);
      expect(seq.indexOf('subscribed', rec), `cycle ${cycle}`).toBeGreaterThan(rec);
    }
  });

  it('EZD-018 T12 no timer-driven request over two token lifetimes', async () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { fetchToken, hub } = setup();
    const p = hub.project(randomUUID());
    const u = hub.user();
    await flush();
    expect(p.status).toBe('subscribed');
    expect(u.status).toBe('subscribed');
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(0);
  });

  it('EZD-018 T13 a refused join is retried once, then stops', async () => {
    vi.useFakeTimers();
    const { adapter, fetchToken, hub } = setup(['t1', 't2', 't3']);
    const p2 = randomUUID();
    adapter.joinPolicy = (topic) => (topic === `project:${p2}` ? 'CHANNEL_ERROR' : 'SUBSCRIBED');
    const h = hub.project(p2);
    await flush();
    expect(await h.ready).toBe('refused');
    expect(h.status).toBe('refused');
    const ch = only(adapter, `project:${p2}`);
    expect(ch.delivered).toHaveLength(2);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(adapter.removedFor(`project:${p2}`)).toBe(1);

    await vi.advanceTimersByTimeAsync(3_600_000);
    await flush();
    expect(ch.delivered).toHaveLength(2);
    expect(adapter.channels.filter((c) => c.topic === `project:${p2}`)).toHaveLength(1);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(h.status).toBe('refused');
  });

  it('EZD-018 T14 an expired token mid-life refetches once and resyncs once', async () => {
    const { adapter, fetchToken, hub } = setup(['t1', 't2']);
    const p1 = randomUUID();
    const h = hub.project(p1);
    const r1 = vi.fn();
    const r2 = vi.fn();
    h.onResync(r1);
    h.onResync(r2);
    await flush();
    expect(h.status).toBe('subscribed');

    only(adapter, `project:${p1}`).deliver('CHANNEL_ERROR');
    await flush();
    expect(h.status).toBe('subscribed');
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(adapter.setAuthArgs.at(-1)).toBe('t2');
    expect(r1).toHaveBeenCalledTimes(2);
    expect(r2).toHaveBeenCalledTimes(2);
  });

  it('EZD-018 T15 (a) coming online reconnects once', async () => {
    const { adapter, target, nav, hub } = setup();
    hub.project(randomUUID());
    await flush();
    nav.onLine = false;
    target.dispatchEvent(new Event('offline'));
    adapter.closeSocket();
    await flush();
    const before = adapter.connectCalls.length;
    nav.onLine = true;
    target.dispatchEvent(new Event('online'));
    await flush();
    expect(adapter.connectCalls.length - before).toBe(1);
  });

  it('EZD-018 T15 (b) visibilitychange while subscribed does nothing', async () => {
    // The stub is in place before the hub exists, so a listener added at creation or connect is seen.
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
    const { adapter, target, fetchToken, hub } = setup();
    const h = hub.project(randomUUID());
    await flush();
    expect(h.status).toBe('subscribed');
    const calls = adapter.calls.length;
    const fetches = fetchToken.mock.calls.length;
    doc.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(adapter.calls.length).toBe(calls);
    expect(fetchToken.mock.calls.length).toBe(fetches);
  });

  it('EZD-018 T16 presence: unique members sorted, tracked meta has the id only', async () => {
    const { adapter, hub } = setup();
    const p1 = randomUUID();
    const h = hub.project(p1);
    await flush();
    const ch = only(adapter, `project:${p1}`);
    expect(ch.presenceKey).toBe(SELF);
    expect(ch.tracked).toEqual([{ appUserId: SELF }]);
    ch.setPresence({ u2: [{}, {}], u1: [{}] });
    expect(h.presence()).toEqual([{ appUserId: 'u1' }, { appUserId: 'u2' }]);
  });

  it('EZD-018 T24 session.ended drops every channel, stops all requests and goes to sign-in once', async () => {
    vi.useFakeTimers();
    const { adapter, target, nav, fetchToken, onSessionEnded, hub } = setup();
    const p1 = randomUUID();
    const p2 = randomUUID();
    const h1 = hub.project(p1);
    const h2 = hub.project(p2);
    const hu = hub.user();
    await flush();
    for (const h of [h1, h2, hu]) expect(h.status).toBe('subscribed');
    expect(fetchToken).toHaveBeenCalledTimes(1);

    const channelsBefore = adapter.channels.length;
    const subscribesBefore = adapter.calls.filter((c) => c.startsWith('subscribe ')).length;
    only(adapter, USER_TOPIC).emit('session.ended', {});
    await flush();

    for (const topic of [`project:${p1}`, `project:${p2}`, USER_TOPIC]) {
      expect(
        adapter.removedTopics.filter((t) => t === topic),
        topic,
      ).toHaveLength(1);
    }
    for (const h of [h1, h2, hu]) expect(h.status).toBe('closed');
    expect(await h1.ready).toBe('refused');
    expect(await h2.ready).toBe('refused');
    expect(await hu.ready).toBe('refused');
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    adapter.closeSocket();
    adapter.openSocket();
    await flush();
    expect(fetchToken).toHaveBeenCalledTimes(1);
    nav.onLine = true;
    target.dispatchEvent(new Event('online'));
    await flush();
    expect(fetchToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7_200_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    const h3 = hub.project(randomUUID());
    await flush();
    expect(h3.status).toBe('closed');
    expect(fetchToken).toHaveBeenCalledTimes(1);

    expect(adapter.channels.length - channelsBefore).toBe(0);
    expect(adapter.calls.filter((c) => c.startsWith('subscribe ')).length - subscribesBefore).toBe(
      0,
    );
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('EZD-018 T25 toEventPayload drops only the id realtime.send added', () => {
    expect(toEventPayload({ payload: { n: 1, id: 'm1' }, meta: { id: 'm1' } })).toEqual({ n: 1 });
    expect(toEventPayload({ payload: { id: 'x', n: 1 }, meta: { id: 'm1' } })).toEqual({
      id: 'x',
      n: 1,
    });
    expect(toEventPayload({ payload: { n: 1, id: 'm1' } })).toEqual({ n: 1, id: 'm1' });
    expect(toEventPayload({ payload: { id: 'm1' }, meta: { id: 'm1' } })).toEqual({});
  });
});

// EZD-157 (vault/plans/EZD-157.md Tests U1-U6): a project handle whose id is not a UUID never shares or
// closes the user channel. Expected values are the plan's Tests table; "after flush" is one flush().
describe('EZD-157 realtime hub keeps project and user channels apart', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('EZD-157 done when: hub.project(user) gets its own entry and the user channel is untouched', async () => {
    const { adapter, fetchToken, hub } = setup();
    const u = hub.user();
    const p = hub.project('user');
    const uPing = vi.fn();
    const pPing = vi.fn();
    u.on('dev.ping', uPing);
    p.on('dev.ping', pPing);
    await flush();
    only(adapter, USER_TOPIC).emit('dev.ping', { n: 1 });
    await flush();
    expect(adapter.channels.filter((c) => c.topic === USER_TOPIC)).toHaveLength(1);
    expect(adapter.channels).toHaveLength(1);
    expect(u.status).toBe('subscribed');
    expect(p.status).toBe('refused');
    expect(await p.ready).toBe('refused');
    expect(uPing).toHaveBeenCalledTimes(1);
    expect(uPing).toHaveBeenCalledWith({ n: 1 });
    expect(pPing).toHaveBeenCalledTimes(0);

    p.release();
    await flush();
    expect(adapter.removedFor(USER_TOPIC)).toBe(0);
    expect(u.status).toBe('subscribed');
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('EZD-157 U2 project first, then user: the order does not matter', async () => {
    const { adapter, hub } = setup();
    const p = hub.project('user');
    const u = hub.user();
    await flush();
    expect(adapter.channels.filter((c) => c.topic === USER_TOPIC)).toHaveLength(1);
    expect(adapter.channelsFor('project:')).toHaveLength(0);
    expect(u.status).toBe('subscribed');
    expect(p.status).toBe('refused');
  });

  it('EZD-157 U3 an invalid project id is refused at once with no request', async () => {
    const INVALID = ['user', '', 'not-a-uuid', `project:${randomUUID()}`, ` ${randomUUID()}`];
    for (const id of INVALID) {
      const { adapter, fetchToken, hub } = setup();
      const h = hub.project(id);
      const statusCb = vi.fn();
      h.onStatus(statusCb);
      const statusBefore = h.status;
      await flush();
      expect(statusBefore, id).toBe('connecting');
      expect(h.status, id).toBe('refused');
      expect(await h.ready, id).toBe('refused');
      expect(statusCb.mock.calls, id).toEqual([['refused']]);
      expect(fetchToken, id).toHaveBeenCalledTimes(0);
      expect(adapter.connectCalls, id).toHaveLength(0);
      expect(adapter.channels, id).toHaveLength(0);

      h.release();
      await flush();
      expect(adapter.removedTopics, id).toHaveLength(0);
    }
  });

  it('EZD-157 U4 an upper-case UUID shares the lower-case entry', async () => {
    const { adapter, hub } = setup();
    const P = randomUUID();
    const a = hub.project(P.toUpperCase());
    const b = hub.project(P);
    await flush();
    const projects = adapter.channelsFor('project:');
    expect(projects).toHaveLength(1);
    expect(projects[0].topic).toBe(`project:${P}`);
    expect(a.status).toBe('subscribed');
    expect(b.status).toBe('subscribed');
  });

  it('EZD-157 U5 an invalid handle holds no channel of its own and removes none', async () => {
    const { adapter, hub } = setup();
    const P1 = randomUUID();
    const a = hub.project(P1);
    const b = hub.project('not-a-uuid');
    await flush();
    expect(adapter.channelsFor('project:')).toHaveLength(1);
    expect(adapter.channelsFor('project:')[0].topic).toBe(`project:${P1}`);
    expect(adapter.channels.filter((c) => c.topic === USER_TOPIC)).toHaveLength(1);

    b.release();
    await flush();
    expect(adapter.removedFor('project:')).toBe(0);
    expect(adapter.removedFor(USER_TOPIC)).toBe(0);

    a.release();
    await flush();
    expect(adapter.removedFor('project:')).toBe(1);
    expect(adapter.removedFor(USER_TOPIC)).toBe(1);
  });

  it('EZD-157 U6 session.ended closes an invalid handle too', async () => {
    const { adapter, onSessionEnded, hub } = setup();
    const u = hub.user();
    const p = hub.project('user');
    await flush();
    only(adapter, USER_TOPIC).emit('session.ended', {});
    await flush();
    expect(p.status).toBe('closed');
    expect(u.status).toBe('closed');
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(adapter.removedFor(USER_TOPIC)).toBe(1);
  });
});

// EZD-318 (vault/plans/EZD-318.md Tests N1-N4): own hubs, because setup()'s fetchToken cannot hold or reject.
describe('EZD-318 realtime hub resyncs on every join', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function ownHub(fetchToken: () => Promise<RealtimeToken>) {
    const adapter: FakeAdapter = createFakeAdapter();
    const target = new EventTarget();
    const nav = { onLine: true };
    const hub = createRealtimeHub({
      fetchToken,
      adapter,
      env: { online: createOnlineSource(target, nav) },
      onSessionEnded: vi.fn(),
    });
    return { adapter, target, nav, hub };
  }

  it('EZD-318 N1 a change before the first join is picked up by one resync per handle', async () => {
    let resolveToken!: (t: RealtimeToken) => void;
    const fetchToken = vi.fn(
      () =>
        new Promise<RealtimeToken>((r) => {
          resolveToken = r;
        }),
    );
    const { hub } = ownHub(fetchToken);
    let server = 1;
    let seenP = 1;
    let seenU = 1;
    const rp = vi.fn(() => {
      seenP = server;
    });
    const ru = vi.fn(() => {
      seenU = server;
    });
    const p = hub.project(randomUUID());
    const u = hub.user();
    p.onResync(rp);
    u.onResync(ru);
    server = 2;
    await flush();
    expect(rp).toHaveBeenCalledTimes(0);
    expect(ru).toHaveBeenCalledTimes(0);
    expect(p.status).toBe('connecting');

    resolveToken(token('t1'));
    await flush();
    expect(p.status).toBe('subscribed');
    expect(u.status).toBe('subscribed');
    expect(seenP).toBe(2);
    expect(seenU).toBe(2);
    expect(rp).toHaveBeenCalledTimes(1);
    expect(ru).toHaveBeenCalledTimes(1);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('EZD-318 N2 a refused first token, then online: one resync per callback', async () => {
    const P = randomUUID();
    const fetchToken = vi
      .fn<() => Promise<RealtimeToken>>()
      .mockRejectedValueOnce(new Error('realtime_token_refused'))
      .mockResolvedValueOnce(token('t2'));
    const { adapter, target, nav, hub } = ownHub(fetchToken);
    const r1 = vi.fn();
    const r2 = vi.fn();
    const r3 = vi.fn();
    const p = hub.project(P);
    p.onResync(r1);
    p.onResync(r2);
    const u = hub.user();
    u.onResync(r3);
    await flush();
    expect(p.status).toBe('refused');
    expect(await p.ready).toBe('refused');
    for (const r of [r1, r2, r3]) expect(r).toHaveBeenCalledTimes(0);
    expect(adapter.connectCalls).toHaveLength(0);
    expect(adapter.channels).toHaveLength(0);

    nav.onLine = false;
    target.dispatchEvent(new Event('offline'));
    nav.onLine = true;
    target.dispatchEvent(new Event('online'));
    await flush();
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(p.status).toBe('subscribed');
    expect(u.status).toBe('subscribed');
    expect(await p.ready).toBe('subscribed');
    expect(await u.ready).toBe('subscribed');
    for (const r of [r1, r2, r3]) expect(r).toHaveBeenCalledTimes(1);
    only(adapter, `project:${P}`);
    only(adapter, USER_TOPIC);
  });

  it('EZD-318 N3 a handle that joins a subscribed channel is resynced once; a released one is not', async () => {
    const { adapter, fetchToken, hub } = setup();
    const r1 = vi.fn();
    const r2 = vi.fn();
    const r3 = vi.fn();
    const h1 = hub.user();
    h1.onResync(r1);
    await flush();
    const h2 = hub.user();
    h2.onResync(r2);
    const h3 = hub.user();
    h3.onResync(r3);
    h3.release();
    await flush();
    expect(r1).toHaveBeenCalledTimes(1);
    expect(r2).toHaveBeenCalledTimes(1);
    expect(r3).toHaveBeenCalledTimes(0);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(adapter.channels.filter((c) => c.topic === USER_TOPIC)).toHaveLength(1);

    adapter.closeSocket();
    await flush();
    adapter.openSocket();
    await flush();
    expect(r1).toHaveBeenCalledTimes(2);
    expect(r2).toHaveBeenCalledTimes(2);
    expect(r3).toHaveBeenCalledTimes(0);
  });

  it('EZD-318 N4 a failed refresh leaves the subscribed channel alone and the refused one resyncs on rejoin', async () => {
    const P1 = randomUUID();
    const P2 = randomUUID();
    const fetchToken = vi
      .fn<() => Promise<RealtimeToken>>()
      .mockResolvedValueOnce(token('t1'))
      .mockRejectedValueOnce(new Error('realtime_token_refused'));
    const { adapter, hub } = ownHub(fetchToken);
    const ra = vi.fn();
    const a = hub.project(P1);
    a.onResync(ra);
    const b = hub.project(P2);
    await flush();
    only(adapter, `project:${P1}`).deliver('CHANNEL_ERROR');
    await flush();
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(a.status).toBe('refused');
    expect(await a.ready).toBe('refused');
    expect(b.status).toBe('subscribed');
    expect(await b.ready).toBe('subscribed');
    expect(ra).toHaveBeenCalledTimes(1);

    only(adapter, `project:${P1}`).deliver('SUBSCRIBED');
    await flush();
    expect(a.status).toBe('subscribed');
    expect(await a.ready).toBe('subscribed');
    expect(ra).toHaveBeenCalledTimes(2);
  });
});
