// EZD-190 Step 5 (vault/plans/EZD-190.md sections 1 and 3; Q-0330): make the local API request gate
// in force before `pnpm db:up` returns. Node 22 built-ins only. `db reset` restarts Postgres but not
// PostgREST, whose reconnect can reload its config without `pgrst.db_pre_request`; so `db:up` restarts
// the PostgREST container (a fresh pool) and waits until a header-less request is refused by the gate.
import { spawn } from 'node:child_process';
import { projectId } from './sql.mjs';

export const GATE_PROBE_PATH = '/rest/v1/project?select=id&limit=1';

export function classifyGateProbe(status, body) {
  if (status === null || status === undefined || status >= 500) return 'not_ready';
  const obj = body !== null && typeof body === 'object' ? body : {};
  if (status === 401 && obj.code === '42501' && obj.message === 'api_gate') return 'in_force';
  return 'open';
}

export async function probeApiGate({ apiUrl, apiKey, fetchImpl = globalThis.fetch }) {
  const url = `${String(apiUrl).replace(/\/$/, '')}${GATE_PROBE_PATH}`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return classifyGateProbe(null, null);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return classifyGateProbe(res.status, body);
}

export async function waitForApiGate({
  probe,
  timeoutMs = 30000,
  intervalMs = 250,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const start = now();
  let checks = 0;
  for (;;) {
    let state;
    try {
      state = await probe();
    } catch {
      state = 'not_ready';
    }
    checks += 1;
    if (state === 'in_force') return { checks };
    if (now() - start >= timeoutMs) {
      throw new Error(state === 'open' ? 'api_gate_not_in_force' : 'api_gate_not_ready');
    }
    await sleep(intervalMs);
  }
}

export function postgrestContainer() {
  return `supabase_rest_${projectId()}`;
}

function dockerRun(args) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const child = spawn('docker', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', () => {});
    child.on('error', () => done({ code: 1 }));
    child.on('close', (code) => done({ code }));
  });
}

export async function restartPostgrest({ run = dockerRun } = {}) {
  let result;
  try {
    result = await run(['restart', postgrestContainer()]);
  } catch {
    throw new Error('postgrest_restart_failed');
  }
  if (!result || result.code !== 0) throw new Error('postgrest_restart_failed');
}

export async function ensureApiGateInForce({
  apiUrl,
  apiKey,
  restart = restartPostgrest,
  probe = () => probeApiGate({ apiUrl, apiKey }),
  now,
  sleep,
}) {
  await restart();
  return waitForApiGate({ probe, now, sleep });
}
