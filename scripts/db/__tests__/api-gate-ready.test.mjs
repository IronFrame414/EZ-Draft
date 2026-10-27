// EZD-190 U1-U7, L1, L2 (vault/plans/EZD-190.md sections 3 and 4). node:test, Node 22 built-ins only.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  GATE_PROBE_PATH,
  classifyGateProbe,
  probeApiGate,
  waitForApiGate,
  postgrestContainer,
  restartPostgrest,
  ensureApiGateInForce,
} from '../api-gate-ready.mjs';
import { runLocalSql } from '../sql.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');

const GATE_BODY = { code: '42501', message: 'api_gate' };

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

function fakeResponse(status, body, jsonRejects = false) {
  return {
    status,
    json: async () => {
      if (jsonRejects) throw new Error('bad json');
      return body;
    },
  };
}

function localEnv() {
  const r = spawnSync('node', [path.join(repo, 'scripts', 'db', 'local.mjs'), 'env'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, 'local stack must be up (pnpm db:up)');
  return JSON.parse(r.stdout);
}

describe('EZD-190 API request gate readiness', () => {
  test('EZD-190 U1 classifyGateProbe', () => {
    assert.equal(GATE_PROBE_PATH, '/rest/v1/project?select=id&limit=1');
    assert.equal(classifyGateProbe(401, GATE_BODY), 'in_force');
    assert.equal(
      classifyGateProbe(401, { code: '42501', message: 'permission denied for table project' }),
      'open',
    );
    assert.equal(classifyGateProbe(200, []), 'open');
    assert.equal(classifyGateProbe(403, GATE_BODY), 'open');
    assert.equal(
      classifyGateProbe(401, { code: '42501', message: 'api_gate_not_configured' }),
      'open',
    );
    assert.equal(classifyGateProbe(503, { code: 'PGRST001' }), 'not_ready');
    assert.equal(classifyGateProbe(null, null), 'not_ready');
    assert.equal(classifyGateProbe(401, null), 'open');
  });

  test('EZD-190 U2 probeApiGate makes one GET and never throws', async () => {
    const calls = [];
    const first = async (url, init) => {
      calls.push([url, init]);
      return fakeResponse(401, GATE_BODY);
    };
    const state = await probeApiGate({
      apiUrl: 'http://127.0.0.1:54321/',
      apiKey: 'pk',
      fetchImpl: first,
    });
    assert.equal(state, 'in_force');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'http://127.0.0.1:54321/rest/v1/project?select=id&limit=1');
    assert.equal(calls[0][1].method, 'GET');
    assert.deepEqual(calls[0][1].headers, { apikey: 'pk' });
    assert.ok(calls[0][1].signal instanceof AbortSignal);

    const rejecting = async () => {
      throw new Error('network');
    };
    assert.equal(
      await probeApiGate({ apiUrl: 'http://127.0.0.1:54321', apiKey: 'pk', fetchImpl: rejecting }),
      'not_ready',
    );
    assert.equal(
      await probeApiGate({
        apiUrl: 'http://127.0.0.1:54321',
        apiKey: 'pk',
        fetchImpl: async () => fakeResponse(401, null, true),
      }),
      'open',
    );
  });

  test('EZD-190 U3 waitForApiGate returns when the gate is in force', async () => {
    const clock = fakeClock();
    const answers = ['not_ready', 'open', 'in_force'];
    let i = 0;
    const result = await waitForApiGate({
      probe: async () => answers[i++],
      now: clock.now,
      sleep: clock.sleep,
    });
    assert.deepEqual(result, { checks: 3 });
    assert.deepEqual(clock.sleeps, [250, 250]);
  });

  test('EZD-190 U4 waitForApiGate times out with the last state', async () => {
    const run = async (probe) => {
      const clock = fakeClock();
      let probes = 0;
      const err = await waitForApiGate({
        probe: async () => {
          probes += 1;
          return probe();
        },
        timeoutMs: 1000,
        intervalMs: 250,
        now: clock.now,
        sleep: clock.sleep,
      }).then(
        () => null,
        (e) => e,
      );
      return { err, probes, sleeps: clock.sleeps };
    };
    const open = await run(() => 'open');
    assert.equal(open.err?.message, 'api_gate_not_in_force');
    assert.equal(open.probes, 5);
    assert.deepEqual(open.sleeps, [250, 250, 250, 250]);
    const notReady = await run(() => 'not_ready');
    assert.equal(notReady.err?.message, 'api_gate_not_ready');
    const throws = await run(() => {
      throw new Error('boom');
    });
    assert.equal(throws.err?.message, 'api_gate_not_ready');
  });

  test('EZD-190 U5 postgrestContainer and restartPostgrest', async () => {
    assert.equal(postgrestContainer(), 'supabase_rest_ezdraft');
    const calls = [];
    await restartPostgrest({
      run: async (args) => {
        calls.push(args);
        return { code: 0 };
      },
    });
    assert.deepEqual(calls, [['restart', 'supabase_rest_ezdraft']]);
    await assert.rejects(restartPostgrest({ run: async () => ({ code: 1 }) }), {
      message: 'postgrest_restart_failed',
    });
    await assert.rejects(
      restartPostgrest({
        run: async () => {
          throw new Error('docker');
        },
      }),
      { message: 'postgrest_restart_failed' },
    );
  });

  test('EZD-190 U6 ensureApiGateInForce restarts, then probes', async () => {
    const clock = fakeClock();
    const events = [];
    let probes = 0;
    const result = await ensureApiGateInForce({
      apiUrl: 'http://127.0.0.1:54321',
      apiKey: 'pk',
      restart: async () => {
        events.push('restart');
      },
      probe: async () => {
        events.push('probe');
        probes += 1;
        return probes === 2 ? 'in_force' : 'open';
      },
      now: clock.now,
      sleep: clock.sleep,
    });
    assert.deepEqual(events, ['restart', 'probe', 'probe']);
    assert.deepEqual(result, { checks: 2 });

    let probed = 0;
    await assert.rejects(
      ensureApiGateInForce({
        apiUrl: 'http://127.0.0.1:54321',
        apiKey: 'pk',
        restart: async () => {
          throw new Error('postgrest_restart_failed');
        },
        probe: async () => {
          probed += 1;
          return 'in_force';
        },
        now: clock.now,
        sleep: clock.sleep,
      }),
      { message: 'postgrest_restart_failed' },
    );
    assert.equal(probed, 0);
  });

  test('EZD-190 U7 db:up wiring and docs', () => {
    const local = read('scripts', 'db', 'local.mjs');
    assert.match(
      local,
      /import\s*\{[^}]*\bensureApiGateInForce\b[^}]*\}\s*from\s*'\.\/api-gate-ready\.mjs'/,
    );
    const start = local.indexOf('async function up(');
    assert.ok(start >= 0, 'up() exists');
    const next = local.indexOf('\nasync function ', start + 1);
    const nextPlain = local.indexOf('\nfunction ', start + 1);
    const ends = [next, nextPlain].filter((i) => i > 0);
    const body = local.slice(start, ends.length ? Math.min(...ends) : undefined);
    const reset = body.indexOf("'reset', '--local'");
    const store = body.indexOf('await storeLocalGateSecret(');
    const gate = body.indexOf('ensureApiGateInForce(');
    const realtime = body.indexOf('ensureRealtimeBroadcastStream(');
    assert.ok(reset >= 0 && store >= 0 && gate >= 0 && realtime >= 0);
    assert.ok(reset < store, 'reset before storing the secret');
    assert.ok(store < gate, 'secret stored before the gate check');
    assert.ok(gate < realtime, 'gate check before the Realtime warm-up');
    assert.ok(local.includes('API request gate in force'));
    assert.ok(local.includes('Local API request gate is not in force ('));
    assert.match(read('scripts', 'db', 'sql.mjs'), /export function projectId\(/);
    assert.ok(read('docs', 'architecture.md').includes('api-gate-ready.test.mjs'));
  });

  test('EZD-190 done when: right after pnpm db:up the first request without the gate header is refused', async () => {
    const env = localEnv();
    const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(new URL(GATE_PROBE_PATH, apiUrl), { headers: { apikey: apiKey } });
    const body = await res.json();
    assert.equal(res.status, 401);
    assert.equal(body.code, '42501');
    assert.equal(body.message, 'api_gate');
    assert.equal(await probeApiGate({ apiUrl, apiKey }), 'in_force');
  });

  test('EZD-190 L2 a stale PostgREST config is detected and restored', async () => {
    const env = localEnv();
    const apiUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const sql = async (text) => {
      const r = await runLocalSql(text);
      assert.equal(r.code, 0);
    };
    const poll = async (wanted) => {
      const end = Date.now() + 10000;
      for (;;) {
        const state = await probeApiGate({ apiUrl, apiKey });
        if (state === wanted) return state;
        if (Date.now() > end) assert.fail(`never reached ${wanted}, last ${state}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const setHook = `alter role authenticator set pgrst.db_pre_request = 'private.api_request_gate';`;
    const notify = `notify pgrst, 'reload config';`;
    try {
      await sql(`alter role authenticator reset pgrst.db_pre_request; ${notify}`);
      assert.equal(await poll('open'), 'open');

      await sql(setHook);
      assert.equal(await probeApiGate({ apiUrl, apiKey }), 'open');

      const settle = await fetch(new URL('/rest/v1/rpc/sign_in_throttle_settle', apiUrl), {
        method: 'POST',
        headers: { apikey: apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          p_attempt_id: '00000000-0000-4000-8000-000000000000',
          p_ip_attempt_id: null,
        }),
      });
      const settleBody = await settle.json();
      assert.equal(settle.status, 401);
      assert.equal(settleBody.code, '42501');
      assert.equal(settleBody.message, 'api_gate');

      const health = await fetch(new URL('/rest/v1/rpc/health', apiUrl), {
        method: 'POST',
        headers: { apikey: apiKey, 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(health.status, 200);
    } finally {
      await sql(`${setHook} ${notify}`);
      try {
        await poll('in_force');
      } catch {
        await ensureApiGateInForce({ apiUrl, apiKey });
      }
      assert.equal(await probeApiGate({ apiUrl, apiKey }), 'in_force');
    }
  });
});
