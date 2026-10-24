// EZD-035 Step 1 (vault/plans/EZD-035.md): wait until the local Realtime server streams database broadcasts.
// Node 22 built-ins only. `db reset` restarts Realtime, which starts its broadcast stream (a replication slot)
// only at the first channel join after a start, so `pnpm db:up` joins one public channel and waits for the slot.
import { runLocalSql } from './sql.mjs';

export const WARMUP_TOPIC = 'realtime:ezd-db-up-warmup';
export const SLOT_ACTIVE_SQL =
  "select count(*) from pg_replication_slots where starts_with(slot_name, 'supabase_realtime_messages_replication_slot') and active;";

export function realtimeSocketUrl(apiUrl, apiKey) {
  const base = String(apiUrl).replace(/\/$/, '');
  let ws;
  if (base.startsWith('https:')) ws = `wss:${base.slice('https:'.length)}`;
  else if (base.startsWith('http:')) ws = `ws:${base.slice('http:'.length)}`;
  else throw new Error('realtime_bad_url');
  return `${ws}/realtime/v1/websocket?apikey=${encodeURIComponent(apiKey)}&vsn=1.0.0`;
}

export function joinFrame() {
  return JSON.stringify({
    topic: WARMUP_TOPIC,
    event: 'phx_join',
    payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } },
    ref: '1',
    join_ref: '1',
  });
}

export function joinChannel({ url, WebSocketImpl = globalThis.WebSocket, joinTimeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    let ws = null;
    let settled = false;
    let timer = null;
    const settle = () => {
      settled = true;
      clearTimeout(timer);
    };
    const fail = () => {
      if (settled) return;
      settle();
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      reject(new Error('realtime_join_failed'));
    };
    try {
      ws = new WebSocketImpl(url);
    } catch {
      ws = null;
      fail();
      return;
    }
    timer = setTimeout(fail, joinTimeoutMs);
    ws.onopen = () => {
      if (settled) return;
      ws.send(joinFrame());
    };
    ws.onmessage = (event) => {
      if (settled) return;
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg || msg.event !== 'phx_reply' || msg.ref !== '1' || msg.topic !== WARMUP_TOPIC) return;
      if (msg.payload && msg.payload.status === 'ok') {
        settle();
        resolve({
          close() {
            ws.close();
          },
        });
      } else {
        fail();
      }
    };
    ws.onerror = () => fail();
    ws.onclose = () => fail();
  });
}

export async function waitForBroadcastStream({
  join,
  slotActive,
  timeoutMs = 30000,
  intervalMs = 250,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const start = now();
  let checks = 0;
  let handle = null;
  const closeHandle = () => {
    if (!handle) return;
    try {
      handle.close();
    } catch {}
  };
  for (;;) {
    if (!handle) {
      try {
        handle = await join();
      } catch {
        handle = null;
      }
    }
    if (handle) {
      checks += 1;
      let active;
      try {
        active = await slotActive();
      } catch (error) {
        closeHandle();
        throw error;
      }
      if (active) {
        closeHandle();
        return { checks };
      }
    }
    if (now() - start >= timeoutMs) {
      const hadHandle = Boolean(handle);
      closeHandle();
      throw new Error(hadHandle ? 'realtime_stream_not_started' : 'realtime_join_failed');
    }
    await sleep(intervalMs);
  }
}

async function slotActive() {
  const r = await runLocalSql(SLOT_ACTIVE_SQL);
  if (r.code !== 0 || !/^\d+$/.test(r.stdout.trim())) throw new Error('realtime_slot_query_failed');
  return Number(r.stdout.trim()) > 0;
}

export async function ensureRealtimeBroadcastStream({ apiUrl, apiKey }) {
  await waitForBroadcastStream({
    join: () => joinChannel({ url: realtimeSocketUrl(apiUrl, apiKey) }),
    slotActive,
  });
}
