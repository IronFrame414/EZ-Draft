// EZD-293 (vault/plans/EZD-293.md sections 1, 3): the by-hand check that tells Josh whether live updates stop
// silently after a hosted database failover. It joins the user's private channel with the app's pinned
// Realtime library, sends database probes across a restart of ezdraft-dev and prints a verdict. Run by hand
// (docs/runbook.md `## Realtime failover check (EZD-293)`); never by the gate: it refuses to run when CI is set.
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { RealtimeClient } from '@supabase/realtime-js';
import postgres from 'postgres';

export const PROBE_EVENT = 'test.probe';
export const STREAM_PID_SQL = `select active_pid from pg_catalog.pg_replication_slots where starts_with(slot_name, 'supabase_realtime_messages_replication_slot') and active`;

export const JOIN_WAIT_MS = 10_000;
export const PROBE_WAIT_MS = 10_000;
export const STREAM_WAIT_MS = 20_000;
export const DB_RETRY_MS = 5_000;
export const DB_BACK_LIMIT_MS = 600_000;
export const WINDOW_MS = 600_000;
export const PROBE_EVERY_MS = 30_000;
export const TOKEN_MIN_LEFT_S = 1_800;

export const STOP_PROMPT =
  'Now restart ezdraft-dev: Supabase dashboard, ezdraft-dev, Project Settings, General, Restart project. Press Return when it shows healthy again.';
export const REF_PROMPT = 'Type the project ref shown for ezdraft-dev in the Supabase dashboard: ';

export const VERDICTS = [
  'baseline_failed',
  'db_not_back',
  'visible_drop',
  'system_only',
  'silent_stop',
  'silent_gap',
  'unaffected',
];
export const SILENT = ['system_only', 'silent_stop', 'silent_gap'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE_RE = /^[A-Za-z0-9_]{1,40}$/;

// ---- inputs ----------------------------------------------------------------------------------------------

function dbRef(dbUrl) {
  let u;
  try {
    u = new URL(dbUrl);
  } catch {
    return null;
  }
  const user = decodeURIComponent(u.username);
  const fromUser = /^postgres\.([a-z0-9]+)$/.exec(user);
  if (fromUser) return fromUser[1];
  const fromHost = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(u.hostname);
  if (user === 'postgres' && fromHost) return fromHost[1];
  return null;
}

function parseToken(raw) {
  let t;
  try {
    t = JSON.parse(raw);
  } catch {
    return null;
  }
  if (t === null || typeof t !== 'object') return null;
  if (
    typeof t.url !== 'string' ||
    typeof t.apiKey !== 'string' ||
    typeof t.accessToken !== 'string'
  ) {
    return null;
  }
  if (typeof t.expiresAt !== 'number') return null;
  if (typeof t.appUserId !== 'string' || !UUID_RE.test(t.appUserId)) return null;
  return {
    url: t.url,
    apiKey: t.apiKey,
    accessToken: t.accessToken,
    expiresAt: t.expiresAt,
    appUserId: t.appUserId,
  };
}

export function parseInputs(env, nowS) {
  if (env.CI) return { ok: false, code: 'ci_refused' };
  const dbUrl = env.SUPABASE_DEV_DB_URL ?? '';
  if (dbUrl === '') return { ok: false, code: 'db_url_missing' };
  const raw = env.EZD_REALTIME_TOKEN ?? '';
  if (raw === '') return { ok: false, code: 'token_missing' };
  const token = parseToken(raw);
  if (token === null) return { ok: false, code: 'token_invalid' };
  if (token.expiresAt - nowS < TOKEN_MIN_LEFT_S) return { ok: false, code: 'token_expiring' };
  const projectRef = dbRef(dbUrl);
  if (projectRef === null) return { ok: false, code: 'db_url_unrecognized' };
  let tokenRef = null;
  try {
    tokenRef = /^([a-z0-9]+)\.supabase\.co$/.exec(new URL(token.url).hostname)?.[1] ?? null;
  } catch {
    tokenRef = null;
  }
  if (tokenRef === null || tokenRef !== projectRef) return { ok: false, code: 'project_mismatch' };
  return { ok: true, dbUrl, token, projectRef };
}

export function mask(line, secrets) {
  let out = line;
  for (const s of [...secrets]
    .filter((x) => typeof x === 'string' && x !== '')
    .sort((a, b) => b.length - a.length)) {
    out = out.split(s).join('***');
  }
  return out;
}

// ---- the run ---------------------------------------------------------------------------------------------

export function classify(obs) {
  if (!obs.baseline.arrived) return 'baseline_failed';
  if (obs.dbBackAt === null) return 'db_not_back';
  const after = (at) => at >= obs.stopAt;
  if (
    obs.statuses.some((s) => s.status !== 'SUBSCRIBED' && after(s.at)) ||
    obs.socket.closes.some(after)
  ) {
    return 'visible_drop';
  }
  if (obs.systems.some((s) => s.payload?.status === 'error' && after(s.at))) return 'system_only';
  const last = obs.probes[obs.probes.length - 1];
  if (last !== undefined && last.arrivedAt === null) return 'silent_stop';
  if (obs.probes.some((p) => p.arrivedAt === null)) return 'silent_gap';
  return 'unaffected';
}

export async function runCheck(deps, opts = {}) {
  const {
    windowMs = WINDOW_MS,
    probeEveryMs = PROBE_EVERY_MS,
    stop = 'ask',
    log = () => {},
  } = opts;
  const topic = `user:${deps.appUserId.toLowerCase()}`;

  // Polls the in-memory recorder (not the network) until check() is true or ms has passed.
  async function waitFor(check, ms) {
    const from = deps.now();
    for (;;) {
      if (check()) return true;
      if (deps.now() - from >= ms) return false;
      await deps.sleep(100);
    }
  }
  async function pidOrNull() {
    try {
      return await deps.db.streamPid();
    } catch {
      return null;
    }
  }
  async function waitStream() {
    const from = deps.now();
    for (;;) {
      const pid = await pidOrNull();
      if (pid !== null) return pid;
      if (deps.now() - from >= STREAM_WAIT_MS) return null;
      await deps.sleep(1_000);
    }
  }
  async function send(nonce) {
    try {
      await deps.db.probe(deps.appUserId, nonce);
      return true;
    } catch {
      return false;
    }
  }

  const obs = {
    join: 'WAIT_LIMIT',
    baseline: { attempts: 0, arrived: false },
    stopAt: null,
    dbBackAt: null,
    streamPidBefore: null,
    streamPidAfter: null,
    probes: [],
    statuses: [],
    systems: [],
    socket: { opens: [], closes: [] },
    control: null,
  };
  const ch = deps.rt.join(topic);
  const finish = () => {
    if (ch) {
      obs.statuses = ch.statuses.map((s) => ({ ...s }));
      obs.systems = ch.systems.map((s) => ({ ...s }));
    }
    obs.socket = { opens: [...deps.rt.socket.opens], closes: [...deps.rt.socket.closes] };
    return obs;
  };

  // 1
  obs.join = await ch.joined;
  if (obs.join !== 'SUBSCRIBED') return finish();
  log('Joined.');

  // 2
  obs.streamPidBefore = await waitStream();

  // 3
  const baselineProbe = async () => {
    const nonce = randomUUID();
    if (!(await send(nonce))) return false;
    return waitFor(() => ch.nonces.has(nonce), PROBE_WAIT_MS);
  };
  obs.baseline.attempts = 1;
  obs.baseline.arrived = await baselineProbe();
  if (!obs.baseline.arrived) {
    await waitStream();
    obs.baseline.attempts = 2;
    obs.baseline.arrived = await baselineProbe();
    if (!obs.baseline.arrived) return finish();
  }

  // 4
  obs.stopAt = deps.now();
  if (stop === 'ask') await deps.ask(STOP_PROMPT);

  // 5
  log('Waiting for the database.');
  for (let waited = 0; ; waited += DB_RETRY_MS) {
    try {
      await deps.db.ping();
      obs.dbBackAt = deps.now();
      break;
    } catch {
      if (waited >= DB_BACK_LIMIT_MS) break;
      await deps.sleep(DB_RETRY_MS);
    }
  }
  if (obs.dbBackAt === null) return finish();

  // 6
  log('Watching 10 minutes.');
  const count = Math.floor(windowMs / probeEveryMs) + 1;
  const nonces = [];
  for (let i = 0; i < count; i += 1) {
    const nonce = randomUUID();
    nonces.push(nonce);
    const sentAt = deps.now();
    const ok = await send(nonce);
    obs.probes.push({ sentAt, arrivedAt: null, sendFailed: !ok });
    if (i < count - 1) await deps.sleep(probeEveryMs);
  }
  const lastNonce = nonces[nonces.length - 1];
  await waitFor(() => ch.nonces.has(lastNonce), PROBE_WAIT_MS);
  obs.probes.forEach((p, i) => {
    p.arrivedAt = ch.nonces.get(nonces[i]) ?? null;
  });

  // 7
  obs.streamPidAfter = await pidOrNull();

  // 8
  log('Checking a fresh join.');
  const second = deps.rt.joinSecond(topic);
  const controlJoin = await second.joined;
  await waitStream();
  const nonce = randomUUID();
  const sent = await send(nonce);
  const received = sent && (await waitFor(() => second.nonces.has(nonce), PROBE_WAIT_MS));
  obs.control = { join: controlJoin, received, originalReceived: ch.nonces.has(nonce) };
  return finish();
}

// ---- live dependencies -----------------------------------------------------------------------------------

export function createLiveDeps({ dbUrl, token, ask }) {
  const dbHost = new URL(dbUrl).hostname;
  const isLocalDb = dbHost === '127.0.0.1' || dbHost === 'localhost';
  const sql = postgres(dbUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
    ...(isLocalDb ? {} : { ssl: 'require' }),
  });
  const mkClient = () =>
    new RealtimeClient(`${token.url}/realtime/v1`, {
      params: { apikey: token.apiKey },
      transport: globalThis.WebSocket,
    });
  const clients = [];
  const channels = [];
  const socket = { opens: [], closes: [] };

  function joinOn(client, topic) {
    const raw = client.channel(topic, {
      config: { private: true, broadcast: { self: false }, presence: { enabled: true } },
    });
    channels.push([client, raw]);
    const statuses = [];
    const systems = [];
    const nonces = new Map();
    raw.on('broadcast', { event: PROBE_EVENT }, (message) => {
      const nonce = message?.payload?.nonce;
      if (typeof nonce === 'string') nonces.set(nonce, Date.now());
    });
    raw.on('system', {}, (payload) => {
      systems.push({ at: Date.now(), payload });
    });
    const joined = (async () => {
      await client.setAuth(token.accessToken);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('WAIT_LIMIT'), JOIN_WAIT_MS);
        raw.subscribe((status) => {
          statuses.push({ at: Date.now(), status });
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
    })();
    return { joined, statuses, systems, nonces };
  }

  return {
    appUserId: token.appUserId,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ask,
    db: {
      probe: async (appUserId, nonce) => {
        await sql`select private.broadcast_user(${appUserId}::uuid, ${PROBE_EVENT}, ${sql.json({ nonce })})`;
      },
      streamPid: async () => {
        try {
          const rows = await sql.unsafe(STREAM_PID_SQL);
          if (rows.length === 0) return null;
          const pid = rows[0].active_pid;
          return pid === null || pid === undefined ? null : Number(pid);
        } catch {
          return null;
        }
      },
      ping: async () => {
        await sql`select 1`;
      },
      end: async () => {
        await sql.end({ timeout: 5 });
      },
    },
    rt: {
      join: (topic) => {
        const client = mkClient();
        clients.push(client);
        client.stateChangeCallbacks.open.push(['ezd-open', () => socket.opens.push(Date.now())]);
        client.stateChangeCallbacks.close.push(['ezd-close', () => socket.closes.push(Date.now())]);
        return joinOn(client, topic);
      },
      joinSecond: (topic) => {
        const client = mkClient();
        clients.push(client);
        return joinOn(client, topic);
      },
      socket,
      close: async () => {
        await Promise.allSettled(channels.map(([client, ch]) => client.removeChannel(ch)));
        await Promise.allSettled(clients.map((c) => c.disconnect()));
      },
    },
  };
}

// ---- main ------------------------------------------------------------------------------------------------

function defaultIo() {
  return {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
    ask: (text) =>
      new Promise((resolve, reject) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        let answered = false;
        rl.once('close', () => {
          if (!answered) reject(new Error('closed'));
        });
        rl.question(text, (answer) => {
          answered = true;
          rl.close();
          resolve(answer);
        });
      }),
    now: () => Date.now(),
  };
}

const codeOf = (err) =>
  typeof err?.code === 'string' && CODE_RE.test(err.code) ? err.code : 'unexpected';

/** @param {(a: any) => any} [makeDeps] */
export async function main(argv, env, io = defaultIo(), makeDeps = createLiveDeps) {
  if (argv.length > 0) {
    io.err('failed: unknown_argument');
    return 1;
  }
  const parsed = parseInputs(env, io.now() / 1000);
  if (!parsed.ok) {
    io.err(`failed: ${parsed.code}`);
    return 1;
  }
  const { dbUrl, token, projectRef } = parsed;
  let password = '';
  try {
    password = decodeURIComponent(new URL(dbUrl).password);
  } catch {
    password = '';
  }
  const secrets = [dbUrl, password, token.accessToken];
  const out = (line) => io.out(mask(line, secrets));
  const err = (line) => io.err(mask(line, secrets));

  out(`Project: ${projectRef}`);
  let answer = '';
  try {
    answer = await io.ask(REF_PROMPT);
  } catch {
    answer = '';
  }
  if (typeof answer !== 'string' || answer.trim() !== projectRef) {
    err('failed: ref_not_confirmed');
    return 1;
  }

  let deps;
  let exit = 0;
  try {
    deps = makeDeps({ dbUrl, token, ask: io.ask });
    const obs = await runCheck(deps, { log: out });
    const verdict = classify(obs);
    out(`Result: ${verdict}`);
    out(
      `RESULT ${JSON.stringify({
        ticket: 'EZD-293',
        projectRef,
        verdict,
        silent: SILENT.includes(verdict),
        ...obs,
      })}`,
    );
    if (verdict === 'baseline_failed' || verdict === 'db_not_back') exit = 1;
  } catch (e) {
    err(`failed: ${codeOf(e)}`);
    exit = 1;
  } finally {
    if (deps) {
      try {
        await deps.db.end();
      } catch {
        // closing is best effort
      }
      try {
        await deps.rt.close();
      } catch {
        // closing is best effort
      }
    }
  }
  return exit;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
