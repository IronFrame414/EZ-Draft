// EZD-018 Step 5 (vault/plans/EZD-018.md): the only file that imports @supabase/realtime-js. The hub
// (hub.ts) works over RealtimeAdapter, so it is unit-tested with a fake. The real adapter returns the
// library's channel unchanged: AdapterChannel is a subset of the pinned RealtimeChannel.
import { RealtimeClient } from '@supabase/realtime-js';

// The token route's 200 body (app/src/app/api/realtime/token/route.ts).
export type RealtimeToken = {
  url: string;
  apiKey: string;
  accessToken: string;
  expiresAt: number;
  appUserId: string;
};

export type JoinStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export type BroadcastMessage = { event: string; payload?: unknown; meta?: { id?: unknown } };

export interface AdapterChannel {
  subscribe(cb: (status: JoinStatus, err?: Error) => void): unknown;
  on(type: 'broadcast', filter: { event: '*' }, cb: (message: BroadcastMessage) => void): unknown;
  on(type: 'presence', filter: { event: 'sync' }, cb: () => void): unknown;
  presenceState(): Record<string, Array<Record<string, unknown>>>;
  track(meta: { appUserId: string }): Promise<unknown>;
}

export interface RealtimeAdapter {
  connect(opts: { url: string; apiKey: string; accessToken: string }): void;
  disconnect(): void;
  setAuth(accessToken: string): Promise<void>;
  channel(topic: string, opts: { presenceKey?: string }): AdapterChannel;
  removeChannel(channel: AdapterChannel): Promise<unknown>;
  onSocketOpen(cb: () => void): () => void;
  onSocketClose(cb: () => void): () => void;
}

export function createSupabaseRealtimeAdapter(): RealtimeAdapter {
  let client: RealtimeClient | null = null;
  const openCbs = new Set<() => void>();
  const closeCbs = new Set<() => void>();

  const need = (): RealtimeClient => {
    if (!client) throw new Error('realtime_not_connected');
    return client;
  };

  return {
    connect({ url, apiKey, accessToken }) {
      if (!client) {
        client = new RealtimeClient(`${url.replace(/^http/i, 'ws')}/realtime/v1`, {
          params: { apikey: apiKey },
        });
        client.stateChangeCallbacks.open.push([
          'ezd-open',
          () => {
            for (const cb of [...openCbs]) cb();
          },
        ]);
        client.stateChangeCallbacks.close.push([
          'ezd-close',
          () => {
            for (const cb of [...closeCbs]) cb();
          },
        ]);
      }
      void client.setAuth(accessToken);
      client.connect();
    },
    disconnect() {
      void client?.disconnect();
    },
    setAuth: (accessToken) => need().setAuth(accessToken),
    channel(topic, { presenceKey }) {
      return need().channel(topic, {
        config: presenceKey ? { private: true, presence: { key: presenceKey } } : { private: true },
      }) as unknown as AdapterChannel;
    },
    removeChannel: (channel) =>
      need().removeChannel(channel as unknown as Parameters<RealtimeClient['removeChannel']>[0]),
    onSocketOpen(cb) {
      openCbs.add(cb);
      return () => openCbs.delete(cb);
    },
    onSocketClose(cb) {
      closeCbs.add(cb);
      return () => closeCbs.delete(cb);
    },
  };
}
