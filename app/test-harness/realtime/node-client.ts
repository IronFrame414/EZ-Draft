// EZD-018 Files row (vault/plans/EZD-018.md): a Node Realtime client for the local-stack tests. Connects a
// RealtimeClient from the pinned @supabase/realtime-js 2.118.0 over Node 22's global WebSocket with a user's
// access token (or none), joins a topic, records every subscribe status, every broadcast (through
// toEventPayload, Step 5) and the presence state. "Refused" is the pinned library's CHANNEL_ERROR with no
// SUBSCRIBED ever (plan Tests intro). Wait limits: 10,000 ms for SUBSCRIBED and presence, 3,000 ms quiet
// time for "receives nothing" (plan Tests intro; EZD-004 T5(c); EZD-007 T6).
import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';
import { toEventPayload } from '../../src/lib/realtime/events';

export const JOIN_WAIT_MS = 10_000;
export const QUIET_MS = 3_000;

export type JoinResult = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'WAIT_LIMIT';
export type ReceivedEvent = { event: string; payload: unknown };

export type TestChannel = {
  topic: string;
  // Every status the library reported, in order.
  statuses: string[];
  // Every broadcast received, payload already passed through toEventPayload.
  events: ReceivedEvent[];
  // The first SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT or CLOSED, or WAIT_LIMIT after JOIN_WAIT_MS.
  joined: Promise<JoinResult>;
  presenceIds(): string[];
  track(meta: Record<string, unknown>): Promise<unknown>;
  send(event: string, payload: Record<string, unknown>): Promise<unknown>;
  raw: RealtimeChannel;
};

export type TestRealtime = {
  join(topic: string, opts?: { private?: boolean; presenceKey?: string }): TestChannel;
  close(): Promise<void>;
};

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

const open: TestRealtime[] = [];

export async function connectRealtime(accessToken: string | null): Promise<TestRealtime> {
  const client = new RealtimeClient(`${url()}/realtime/v1`, {
    params: { apikey: publishable() },
    transport: globalThis.WebSocket as unknown as never,
  });
  if (accessToken) await client.setAuth(accessToken);
  const channels: RealtimeChannel[] = [];

  const api: TestRealtime = {
    join(topic, opts = {}) {
      const raw = client.channel(topic, {
        config: {
          private: opts.private ?? true,
          broadcast: { self: false },
          presence: opts.presenceKey ? { key: opts.presenceKey } : { enabled: true },
        },
      });
      channels.push(raw);
      const statuses: string[] = [];
      const events: ReceivedEvent[] = [];
      raw.on('broadcast', { event: '*' }, (message) => {
        events.push({
          event: String((message as { event?: unknown }).event),
          payload: toEventPayload(message as { payload?: unknown; meta?: { id?: unknown } }),
        });
      });
      raw.on('presence', { event: 'sync' }, () => {});
      const joined = new Promise<JoinResult>((resolve) => {
        const timer = setTimeout(() => resolve('WAIT_LIMIT'), JOIN_WAIT_MS);
        raw.subscribe((status) => {
          statuses.push(status);
          if (
            status === 'SUBSCRIBED' ||
            status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT' ||
            status === 'CLOSED'
          ) {
            clearTimeout(timer);
            resolve(status);
          }
        });
      });
      return {
        topic,
        statuses,
        events,
        joined,
        raw,
        presenceIds() {
          const state = raw.presenceState() as Record<string, Array<Record<string, unknown>>>;
          const ids = new Set<string>();
          for (const metas of Object.values(state)) {
            for (const meta of metas) {
              if (typeof meta.appUserId === 'string') ids.add(meta.appUserId);
            }
          }
          return [...ids].sort();
        },
        track: (meta) => raw.track(meta),
        send: (event, payload) => raw.send({ type: 'broadcast', event, payload }),
      };
    },
    async close() {
      for (const ch of channels) await client.removeChannel(ch).catch(() => 'error');
      await client.disconnect();
    },
  };
  open.push(api);
  return api;
}

// Closes every client this module opened (afterAll).
export async function closeAllRealtime(): Promise<void> {
  await Promise.all(open.splice(0).map((c) => c.close()));
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Polls the in-memory recorder (not the network) until check() is true or the limit passes.
export async function waitFor(check: () => boolean, ms = JOIN_WAIT_MS): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(50);
  }
  return check();
}

// "Refused": CHANNEL_ERROR reported and SUBSCRIBED never reported.
export const wasRefused = (ch: TestChannel) =>
  ch.statuses.includes('CHANNEL_ERROR') && !ch.statuses.includes('SUBSCRIBED');

export const eventsNamed = (ch: TestChannel, event: string) =>
  ch.events.filter((e) => e.event === event);
