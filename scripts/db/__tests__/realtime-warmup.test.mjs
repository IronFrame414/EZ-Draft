// EZD-035 U1-U13 (vault/plans/EZD-035.md sections 3 and 4). node:test, Node 22 built-ins only.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  WARMUP_TOPIC,
  SLOT_ACTIVE_SQL,
  realtimeSocketUrl,
  joinFrame,
  joinChannel,
  waitForBroadcastStream,
  ensureRealtimeBroadcastStream,
} from '../realtime-warmup.mjs';
import { runLocalSql } from '../sql.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

const OK_REPLY =
  '{"ref":"1","event":"phx_reply","payload":{"status":"ok","response":{}},"topic":"realtime:ezd-db-up-warmup"}';

class FakeWebSocket {
  static last = null;
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.closeCount = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    FakeWebSocket.last = this;
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.closeCount += 1;
  }
}

function fakeClock() {
  let t = 0;
  const sleeps = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  };
}

function fakeHandle() {
  return {
    closeCount: 0,
    close() {
      this.closeCount += 1;
    },
  };
}

describe('EZD-035 Realtime warm-up', () => {
  test('EZD-035 U1 realtimeSocketUrl builds the websocket url', () => {
    assert.equal(
      realtimeSocketUrl('http://127.0.0.1:54321', 'sb_publishable_x'),
      'ws://127.0.0.1:54321/realtime/v1/websocket?apikey=sb_publishable_x&vsn=1.0.0',
    );
    assert.equal(
      realtimeSocketUrl('https://a.test/', 'k+y'),
      'wss://a.test/realtime/v1/websocket?apikey=k%2By&vsn=1.0.0',
    );
    assert.throws(() => realtimeSocketUrl('ftp://a', 'k'), { message: 'realtime_bad_url' });
  });

  test('EZD-035 U2 joinFrame and WARMUP_TOPIC', () => {
    assert.equal(WARMUP_TOPIC, 'realtime:ezd-db-up-warmup');
    assert.deepEqual(JSON.parse(joinFrame()), {
      topic: 'realtime:ezd-db-up-warmup',
      event: 'phx_join',
      payload: {
        config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false },
      },
      ref: '1',
      join_ref: '1',
    });
  });

  test('EZD-035 U3 joinChannel joins and resolves on the ok reply', async () => {
    const p = joinChannel({ url: 'ws://x.test/ws', WebSocketImpl: FakeWebSocket });
    const ws = FakeWebSocket.last;
    assert.equal(ws.url, 'ws://x.test/ws');
    ws.onopen({});
    ws.onmessage({ data: OK_REPLY });
    const handle = await p;
    assert.deepEqual(ws.sent, [joinFrame()]);
    assert.equal(ws.closed, false);
    handle.close();
    assert.equal(ws.closed, true);
  });

  test('EZD-035 U4 joinChannel ignores bad json and other refs', async () => {
    const p = joinChannel({ url: 'ws://x.test/ws', WebSocketImpl: FakeWebSocket });
    const ws = FakeWebSocket.last;
    ws.onopen({});
    ws.onmessage({ data: 'not json' });
    ws.onmessage({
      data: '{"ref":"2","event":"phx_reply","payload":{"status":"error"},"topic":"realtime:ezd-db-up-warmup"}',
    });
    ws.onmessage({ data: OK_REPLY });
    const handle = await p;
    assert.equal(typeof handle.close, 'function');
    assert.equal(ws.closed, false);
  });

  test('EZD-035 U5 joinChannel rejects realtime_join_failed and closes once', async () => {
    // error reply
    let p = joinChannel({ url: 'ws://x', WebSocketImpl: FakeWebSocket });
    let ws = FakeWebSocket.last;
    ws.onopen({});
    ws.onmessage({
      data: '{"ref":"1","event":"phx_reply","payload":{"status":"error","response":{}},"topic":"realtime:ezd-db-up-warmup"}',
    });
    await assert.rejects(p, { message: 'realtime_join_failed' });
    assert.equal(ws.closeCount, 1);

    // onerror, then onclose
    p = joinChannel({ url: 'ws://x', WebSocketImpl: FakeWebSocket });
    ws = FakeWebSocket.last;
    ws.onopen({});
    ws.onerror({});
    await assert.rejects(p, { message: 'realtime_join_failed' });
    ws.onclose({});
    assert.equal(ws.closeCount, 1);

    // onclose before a reply
    p = joinChannel({ url: 'ws://x', WebSocketImpl: FakeWebSocket });
    ws = FakeWebSocket.last;
    ws.onopen({});
    ws.onclose({});
    await assert.rejects(p, { message: 'realtime_join_failed' });
    assert.equal(ws.closeCount, 1);

    // no reply, no onopen
    p = joinChannel({ url: 'ws://x', WebSocketImpl: FakeWebSocket, joinTimeoutMs: 50 });
    ws = FakeWebSocket.last;
    await assert.rejects(p, { message: 'realtime_join_failed' });
    assert.equal(ws.closeCount, 1);
  });

  test('EZD-035 U6 joinChannel rejects when the constructor throws', async () => {
    class Throwing {
      constructor() {
        throw new Error('boom');
      }
    }
    await assert.rejects(joinChannel({ url: 'ws://x', WebSocketImpl: Throwing }), {
      message: 'realtime_join_failed',
    });
  });

  test('EZD-035 U7 waitForBroadcastStream resolves when the slot becomes active', async () => {
    const clock = fakeClock();
    const handle = fakeHandle();
    let joins = 0;
    const answers = [false, false, true];
    const result = await waitForBroadcastStream({
      join: async () => {
        joins += 1;
        return handle;
      },
      slotActive: async () => answers.shift(),
      now: clock.now,
      sleep: clock.sleep,
    });
    assert.deepEqual(result, { checks: 3 });
    assert.equal(joins, 1);
    assert.deepEqual(clock.sleeps, [250, 250]);
    assert.equal(handle.closeCount, 1);
  });

  test('EZD-035 U8 waitForBroadcastStream times out with realtime_stream_not_started', async () => {
    const clock = fakeClock();
    const handle = fakeHandle();
    let slotCalls = 0;
    await assert.rejects(
      waitForBroadcastStream({
        join: async () => handle,
        slotActive: async () => {
          slotCalls += 1;
          return false;
        },
        timeoutMs: 1000,
        intervalMs: 250,
        now: clock.now,
        sleep: clock.sleep,
      }),
      { message: 'realtime_stream_not_started' },
    );
    assert.equal(slotCalls, 5);
    assert.deepEqual(clock.sleeps, [250, 250, 250, 250]);
    assert.equal(handle.closeCount, 1);
  });

  test('EZD-035 U9 waitForBroadcastStream rejects realtime_join_failed when join never works', async () => {
    const clock = fakeClock();
    let joins = 0;
    let slotCalls = 0;
    await assert.rejects(
      waitForBroadcastStream({
        join: async () => {
          joins += 1;
          throw new Error('realtime_join_failed');
        },
        slotActive: async () => {
          slotCalls += 1;
          return true;
        },
        timeoutMs: 1000,
        intervalMs: 250,
        now: clock.now,
        sleep: clock.sleep,
      }),
      { message: 'realtime_join_failed' },
    );
    assert.equal(joins, 5);
    assert.equal(clock.sleeps.length, 4);
    assert.equal(slotCalls, 0);
  });

  test('EZD-035 U10 waitForBroadcastStream retries a failed join', async () => {
    const clock = fakeClock();
    const handle = fakeHandle();
    let joins = 0;
    const result = await waitForBroadcastStream({
      join: async () => {
        joins += 1;
        if (joins <= 2) throw new Error('realtime_join_failed');
        return handle;
      },
      slotActive: async () => true,
      now: clock.now,
      sleep: clock.sleep,
    });
    assert.deepEqual(result, { checks: 1 });
    assert.equal(joins, 3);
    assert.deepEqual(clock.sleeps, [250, 250]);
    assert.equal(handle.closeCount, 1);
  });

  test('EZD-035 U11 waitForBroadcastStream passes on a slot query error and closes', async () => {
    const clock = fakeClock();
    const handle = fakeHandle();
    await assert.rejects(
      waitForBroadcastStream({
        join: async () => handle,
        slotActive: async () => {
          throw new Error('realtime_slot_query_failed');
        },
        now: clock.now,
        sleep: clock.sleep,
      }),
      { message: 'realtime_slot_query_failed' },
    );
    assert.equal(handle.closeCount, 1);
  });

  test('EZD-035 U12 ensureRealtimeBroadcastStream starts the stream on the local stack', async () => {
    const r = spawnSync('node', [path.join(repo, 'scripts', 'db', 'local.mjs'), 'env'], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, 'local stack must be up (pnpm db:up)');
    const env = JSON.parse(r.stdout);
    await ensureRealtimeBroadcastStream({
      apiUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      apiKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    const q = await runLocalSql(SLOT_ACTIVE_SQL);
    assert.equal(q.code, 0);
    assert.ok(Number(q.stdout.trim()) >= 1);
  });

  test('EZD-035 U13 db:up wiring and docs', () => {
    const local = read('scripts', 'db', 'local.mjs');
    assert.match(
      local,
      /import\s*\{[^}]*\bensureRealtimeBroadcastStream\b[^}]*\}\s*from\s*'\.\/realtime-warmup\.mjs'/,
    );
    const start = local.indexOf('async function up(');
    assert.ok(start >= 0, 'up() exists');
    const next = local.indexOf('\nasync function ', start + 1);
    const nextPlain = local.indexOf('\nfunction ', start + 1);
    const ends = [next, nextPlain].filter((i) => i > 0);
    const body = local.slice(start, ends.length ? Math.min(...ends) : undefined);
    const ensure = body.indexOf('ensureRealtimeBroadcastStream(');
    const reset = body.indexOf("'reset', '--local'");
    const gate = body.indexOf('await storeLocalGateSecret(');
    assert.ok(ensure >= 0 && reset >= 0 && gate >= 0);
    assert.ok(ensure > reset);
    assert.ok(ensure > gate);
    assert.ok(local.includes('Realtime broadcast stream ready'));
    assert.ok(local.includes('Local Realtime is not ready ('));
    assert.ok(read('docs', 'architecture.md').includes('realtime-warmup.test.mjs'));
  });
});
